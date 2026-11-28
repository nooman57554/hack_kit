import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { prisma } from "../src/config/database.js";
import { env } from "../src/config/env.js";
import {
  batchResponseSchema,
  listBatchesResponseSchema,
  reviewCandidateResponseSchema,
} from "../src/modules/batches/batches.contracts.js";
import { certificateResponseSchema } from "../src/modules/certificates/certificates.contracts.js";
import { CertificatesService } from "../src/modules/certificates/certificates.service.js";
import { createCourseResponseSchema } from "../src/modules/courses/courses.contracts.js";

function signToken(userId: string): string {
  return jwt.sign({ userId }, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "1h",
  });
}

async function apiRequest(
  server: http.Server,
  method: string,
  path: string,
  options: {
    token?: string;
    contentType?: string;
    body?: string | Record<string, unknown>;
    rawBuffer?: boolean;
  } = {}
): Promise<{ status: number; body: any; buffer?: Buffer; headers: http.IncomingHttpHeaders }> {
  const addr = server.address() as { port: number };
  const headers: Record<string, string> = {};

  if (options.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }

  let payload: string | undefined;
  if (typeof options.body === "string") {
    payload = options.body;
    headers["Content-Type"] = options.contentType ?? "text/csv";
  } else if (options.body !== undefined) {
    payload = JSON.stringify(options.body);
    headers["Content-Type"] = options.contentType ?? "application/json";
  }

  if (payload !== undefined) {
    headers["Content-Length"] = Buffer.byteLength(payload).toString();
  }

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: addr.port,
        path,
        method,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          if (options.rawBuffer) {
            resolve({
              status: res.statusCode ?? 500,
              body: null,
              buffer: buf,
              headers: res.headers,
            });
            return;
          }
          const raw = buf.toString("utf8");
          let parsed: any = raw;
          try {
            parsed = JSON.parse(raw);
          } catch {}
          resolve({
            status: res.statusCode ?? 500,
            body: parsed,
            headers: res.headers,
          });
        });
      }
    );
    req.on("error", reject);
    if (payload !== undefined) {
      req.write(payload);
    }
    req.end();
  });
}

describe("Batch Submission, Candidate Review, Certificate Issuance, PDF, and Revocation", () => {
  let server: http.Server;
  let stateUserId: string;
  let stateToken: string;
  let northCentreToken: string;
  let southCentreToken: string;
  let districtToken: string;

  const createdCourseIds: string[] = [];
  const testRunTag = `CERTLIFE_${Date.now()}`;

  before(async () => {
    const stateUser = await prisma.user.findUniqueOrThrow({
      where: { email: "state.officer@skillpass.local" },
    });
    const northUser = await prisma.user.findUniqueOrThrow({
      where: { email: "centre.north@skillpass.local" },
    });
    const southUser = await prisma.user.findUniqueOrThrow({
      where: { email: "centre.south@skillpass.local" },
    });
    const districtUser = await prisma.user.findUniqueOrThrow({
      where: { email: "district.north@skillpass.local" },
    });

    stateUserId = stateUser.id;
    stateToken = signToken(stateUser.id);
    northCentreToken = signToken(northUser.id);
    southCentreToken = signToken(southUser.id);
    districtToken = signToken(districtUser.id);

    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  });

  after(async () => {
    server.close();

    const batches = createdCourseIds.length
      ? await prisma.batch.findMany({
          where: { courseId: { in: createdCourseIds } },
          select: { id: true },
        })
      : [];
    const batchIds = batches.map((b) => b.id);

    if (batchIds.length > 0) {
      const batchCandidates = await prisma.batchCandidate.findMany({
        where: { batchId: { in: batchIds } },
        select: { id: true },
      });
      const bcIds = batchCandidates.map((bc) => bc.id);

      const certs = bcIds.length
        ? await prisma.certificate.findMany({
            where: { batchCandidateId: { in: bcIds } },
            select: { id: true },
          })
        : [];
      const certIds = certs.map((c) => c.id);

      const allAggregateIds = [...batchIds, ...bcIds, ...certIds];
      await prisma.outboxEvent.deleteMany({
        where: { aggregateId: { in: allAggregateIds } },
      });
      await prisma.auditLog.deleteMany({
        where: { entityId: { in: allAggregateIds } },
      });

      if (certIds.length > 0) {
        await prisma.certificate.deleteMany({
          where: { id: { in: certIds } },
        });
      }
      await prisma.batchCandidate.deleteMany({
        where: { batchId: { in: batchIds } },
      });
      await prisma.batch.deleteMany({
        where: { id: { in: batchIds } },
      });
    }

    await prisma.candidate.deleteMany({
      where: { candidateRef: { startsWith: testRunTag } },
    });

    if (createdCourseIds.length > 0) {
      const ruleIds = (
        await prisma.courseRuleVersion.findMany({
          where: { courseId: { in: createdCourseIds } },
          select: { id: true },
        })
      ).map((r) => r.id);

      await prisma.auditLog.deleteMany({
        where: { entityId: { in: [...createdCourseIds, ...ruleIds] } },
      });
      await prisma.course.updateMany({
        where: { id: { in: createdCourseIds } },
        data: { currentRuleVersionId: null },
      });
      await prisma.courseRuleVersion.deleteMany({
        where: { courseId: { in: createdCourseIds } },
      });
      await prisma.course.deleteMany({
        where: { id: { in: createdCourseIds } },
      });
    }

    await prisma.$disconnect();
  });

  it("enforces full batch submit, review concurrency/idempotency, issuance, PDF download, and revocation", async () => {
    // 1. Setup course and import a draft batch
    const courseRes = await apiRequest(server, "POST", "/api/courses", {
      token: stateToken,
      body: {
        code: `${testRunTag}-COURSE`,
        name: "Embedded Systems Engineering",
        minAttendancePercent: 75,
        minMarksPercent: 60,
        practicalRequired: true,
        minPracticalPercent: 70,
      },
    });
    assert.equal(courseRes.status, 201);
    const courseId = createCourseResponseSchema.parse(courseRes.body).data.course.id;
    createdCourseIds.push(courseId);

    const csv = [
      "candidateRef,fullName,phone,attendancePercent,marksPercent,practicalPercent",
      `${testRunTag}-Q1,Asha Qualified,+9190000001,85,80,82`,
      `${testRunTag}-Q2,Vikram ApprovedThenRejected,+9190000002,88,75,79`,
      `${testRunTag}-U1,Neha Unqualified,+9190000003,60,50,55`,
    ].join("\n");

    const importRes = await apiRequest(
      server,
      "POST",
      `/api/batches/import?courseId=${courseId}`,
      { token: northCentreToken, body: csv }
    );
    assert.equal(importRes.status, 201);
    const batch = batchResponseSchema.parse(importRes.body).data.batch;

    const q1 = batch.candidates.find((c) => c.candidateRef === `${testRunTag}-Q1`)!;
    const q2 = batch.candidates.find((c) => c.candidateRef === `${testRunTag}-Q2`)!;
    const u1 = batch.candidates.find((c) => c.candidateRef === `${testRunTag}-U1`)!;
    assert.equal(q1.reviewStatus, "PENDING");
    assert.equal(q1.certificate, null);

    // 2. GET /api/batches lists scoped batches with candidateCount
    const northListRes = await apiRequest(server, "GET", "/api/batches?page=1&limit=10", {
      token: northCentreToken,
    });
    assert.equal(northListRes.status, 200);
    const parsedNorthList = listBatchesResponseSchema.parse(northListRes.body);
    assert.ok(parsedNorthList.data.batches.some((b) => b.id === batch.id && b.candidateCount === 3));

    const southListRes = await apiRequest(server, "GET", "/api/batches", {
      token: southCentreToken,
    });
    assert.equal(southListRes.status, 200);
    assert.ok(
      !listBatchesResponseSchema
        .parse(southListRes.body)
        .data.batches.some((b) => b.id === batch.id)
    );

    const stateListRes = await apiRequest(server, "GET", "/api/batches", {
      token: stateToken,
    });
    assert.equal(stateListRes.status, 200);
    assert.ok(
      listBatchesResponseSchema
        .parse(stateListRes.body)
        .data.batches.some((b) => b.id === batch.id)
    );

    // 3. Cannot review while batch is DRAFT
    const draftReviewRes = await apiRequest(
      server,
      "PATCH",
      `/api/batches/${batch.id}/candidates/${q1.id}/review`,
      { token: stateToken, body: { status: "APPROVED" } }
    );
    assert.equal(draftReviewRes.status, 409);

    // 4. Another centre and State Office / District Officer cannot submit North Centre's batch
    const southSubmitRes = await apiRequest(
      server,
      "POST",
      `/api/batches/${batch.id}/submit`,
      { token: southCentreToken }
    );
    assert.equal(southSubmitRes.status, 403);

    const stateSubmitRes = await apiRequest(
      server,
      "POST",
      `/api/batches/${batch.id}/submit`,
      { token: stateToken }
    );
    assert.equal(stateSubmitRes.status, 403);

    const districtSubmitRes = await apiRequest(
      server,
      "POST",
      `/api/batches/${batch.id}/submit`,
      { token: districtToken }
    );
    assert.equal(districtSubmitRes.status, 403);

    // 5. North Centre submits batch; repeated submit preserves submittedAt and does not duplicate events
    const submitRes1 = await apiRequest(
      server,
      "POST",
      `/api/batches/${batch.id}/submit`,
      { token: northCentreToken }
    );
    assert.equal(submitRes1.status, 200);
    const submittedBatch1 = batchResponseSchema.parse(submitRes1.body).data.batch;
    assert.equal(submittedBatch1.status, "SUBMITTED");
    assert.ok(submittedBatch1.submittedAt);

    const submitRes2 = await apiRequest(
      server,
      "POST",
      `/api/batches/${batch.id}/submit`,
      { token: northCentreToken }
    );
    assert.equal(submitRes2.status, 200);
    const submittedBatch2 = batchResponseSchema.parse(submitRes2.body).data.batch;
    assert.equal(submittedBatch2.submittedAt, submittedBatch1.submittedAt);

    const submitAuditCount = await prisma.auditLog.count({
      where: { entityId: batch.id, action: "BATCH_SUBMITTED" },
    });
    const submitOutboxCount = await prisma.outboxEvent.count({
      where: { aggregateId: batch.id, eventType: "BATCH_SUBMITTED" },
    });
    assert.equal(submitAuditCount, 1);
    assert.equal(submitOutboxCount, 1);

    // 6. Review validations & authorization
    // Training centre & district officer cannot review
    assert.equal(
      (
        await apiRequest(
          server,
          "PATCH",
          `/api/batches/${batch.id}/candidates/${q1.id}/review`,
          { token: northCentreToken, body: { status: "APPROVED" } }
        )
      ).status,
      403
    );
    assert.equal(
      (
        await apiRequest(
          server,
          "PATCH",
          `/api/batches/${batch.id}/candidates/${q1.id}/review`,
          { token: districtToken, body: { status: "APPROVED" } }
        )
      ).status,
      403
    );

    // Unqualified candidate cannot be approved
    const approveUnqualifiedRes = await apiRequest(
      server,
      "PATCH",
      `/api/batches/${batch.id}/candidates/${u1.id}/review`,
      { token: stateToken, body: { status: "APPROVED" } }
    );
    assert.equal(approveUnqualifiedRes.status, 409);

    // Rejection requires a non-empty reason
    const rejectNoReasonRes = await apiRequest(
      server,
      "PATCH",
      `/api/batches/${batch.id}/candidates/${q2.id}/review`,
      { token: stateToken, body: { status: "REJECTED" } }
    );
    assert.equal(rejectNoReasonRes.status, 400);

    // Approval must omit reason
    const approveWithReasonRes = await apiRequest(
      server,
      "PATCH",
      `/api/batches/${batch.id}/candidates/${q1.id}/review`,
      { token: stateToken, body: { status: "APPROVED", reason: "spoof" } }
    );
    assert.equal(approveWithReasonRes.status, 400);

    // Reject Q2 with reason; repeated same rejection is idempotent; conflicting approval returns 409
    const rejectQ2Res = await apiRequest(
      server,
      "PATCH",
      `/api/batches/${batch.id}/candidates/${q2.id}/review`,
      { token: stateToken, body: { status: "REJECTED", reason: "Document mismatch" } }
    );
    assert.equal(rejectQ2Res.status, 200);
    const parsedRejectQ2 = reviewCandidateResponseSchema.parse(rejectQ2Res.body);
    assert.equal(parsedRejectQ2.data.candidate.reviewStatus, "REJECTED");
    assert.equal(parsedRejectQ2.data.candidate.reviewedById, stateUserId);
    assert.equal(parsedRejectQ2.data.candidate.reviewReason, "Document mismatch");

    const repeatRejectQ2 = await apiRequest(
      server,
      "PATCH",
      `/api/batches/${batch.id}/candidates/${q2.id}/review`,
      { token: stateToken, body: { status: "REJECTED", reason: "Document mismatch" } }
    );
    assert.equal(repeatRejectQ2.status, 200);
    assert.equal(
      await prisma.auditLog.count({
        where: { entityId: q2.id, action: "CANDIDATE_REVIEWED" },
      }),
      1
    );

    const conflictApproveQ2 = await apiRequest(
      server,
      "PATCH",
      `/api/batches/${batch.id}/candidates/${q2.id}/review`,
      { token: stateToken, body: { status: "APPROVED" } }
    );
    assert.equal(conflictApproveQ2.status, 409);

    // Pending and rejected candidates cannot receive certificates
    assert.equal(
      (
        await apiRequest(
          server,
          "POST",
          `/api/batches/${batch.id}/candidates/${q1.id}/certificate`,
          { token: stateToken }
        )
      ).status,
      409
    );
    assert.equal(
      (
        await apiRequest(
          server,
          "POST",
          `/api/batches/${batch.id}/candidates/${q2.id}/certificate`,
          { token: stateToken }
        )
      ).status,
      409
    );
    assert.equal(
      (
        await apiRequest(
          server,
          "POST",
          `/api/batches/${batch.id}/candidates/${u1.id}/certificate`,
          { token: stateToken }
        )
      ).status,
      409
    );

    // Concurrent conflicting reviews on Q1: one approves, one rejects -> cannot both succeed
    const [concurrentApprove, concurrentReject] = await Promise.all([
      apiRequest(server, "PATCH", `/api/batches/${batch.id}/candidates/${q1.id}/review`, {
        token: stateToken,
        body: { status: "APPROVED" },
      }),
      apiRequest(server, "PATCH", `/api/batches/${batch.id}/candidates/${q1.id}/review`, {
        token: stateToken,
        body: { status: "REJECTED", reason: "Late conflict" },
      }),
    ]);

    const statuses = [concurrentApprove.status, concurrentReject.status].sort();
    assert.deepEqual(statuses, [200, 409]);

    // Ensure Q1 is APPROVED (if the reject happened to win the race in concurrent test, re-check;
    // actually let's ensure Q1 is approved by checking or using a dedicated candidate for Q1 approval!)
    const q1DbAfterRace = await prisma.batchCandidate.findUniqueOrThrow({
      where: { id: q1.id },
    });

    // If concurrentReject won the race on Q1, reset Q1? Better: create a deterministic approved candidate
    // OR approve Q1 deterministically first and test concurrent conflict on a separate batch/candidate.
    // Let's assert Q1 is either APPROVED or REJECTED cleanly (only 1 audit/outbox created!):
    assert.equal(
      await prisma.auditLog.count({
        where: { entityId: q1.id, action: "CANDIDATE_REVIEWED" },
      }),
      1
    );

    // Ensure we have an APPROVED candidate to test issuance (if concurrentReject won on q1, approve a new batch!)
    let approvedCandidateId = q1.id;
    let activeBatchId = batch.id;
    if (q1DbAfterRace.reviewStatus !== "APPROVED") {
      const csv2 = [
        "candidateRef,fullName,phone,attendancePercent,marksPercent,practicalPercent",
        `${testRunTag}-Q3,Maya Approved,+9190000004,92,88,90`,
      ].join("\n");
      const imp2 = await apiRequest(
        server,
        "POST",
        `/api/batches/import?courseId=${courseId}`,
        { token: northCentreToken, body: csv2 }
      );
      activeBatchId = imp2.body.data.batch.id;
      approvedCandidateId = imp2.body.data.batch.candidates[0].id;
      await apiRequest(server, "POST", `/api/batches/${activeBatchId}/submit`, {
        token: northCentreToken,
      });
      const appRes = await apiRequest(
        server,
        "PATCH",
        `/api/batches/${activeBatchId}/candidates/${approvedCandidateId}/review`,
        { token: stateToken, body: { status: "APPROVED" } }
      );
      assert.equal(appRes.status, 200);
    }

    // 7. PDF-generation failure leaves no certificate record and no issued event
    const failingPdfService = new CertificatesService(async () => {
      throw new Error("Simulated PDF engine failure");
    });
    await assert.rejects(
      () =>
        failingPdfService.issueCertificate(
          stateUserId,
          activeBatchId,
          approvedCandidateId
        ),
      /Simulated PDF engine failure/
    );
    assert.equal(
      await prisma.certificate.count({
        where: { batchCandidateId: approvedCandidateId },
      }),
      0
    );

    // 8. Unauthorized / out-of-scope users cannot issue certificates
    assert.equal(
      (
        await apiRequest(
          server,
          "POST",
          `/api/batches/${activeBatchId}/candidates/${approvedCandidateId}/certificate`,
          { token: northCentreToken }
        )
      ).status,
      403
    );
    assert.equal(
      (
        await apiRequest(
          server,
          "POST",
          `/api/batches/${activeBatchId}/candidates/${approvedCandidateId}/certificate`,
          { token: districtToken }
        )
      ).status,
      403
    );

    // 9. Concurrent issuance creates only one certificate and returns matching metadata
    const [issue1, issue2] = await Promise.all([
      apiRequest(
        server,
        "POST",
        `/api/batches/${activeBatchId}/candidates/${approvedCandidateId}/certificate`,
        { token: stateToken }
      ),
      apiRequest(
        server,
        "POST",
        `/api/batches/${activeBatchId}/candidates/${approvedCandidateId}/certificate`,
        { token: stateToken }
      ),
    ]);
    assert.equal(issue1.status, 201);
    assert.equal(issue2.status, 201);
    const cert1 = certificateResponseSchema.parse(issue1.body).data.certificate;
    const cert2 = certificateResponseSchema.parse(issue2.body).data.certificate;
    assert.equal(cert1.id, cert2.id);
    assert.equal(cert1.verificationCode, cert2.verificationCode);
    assert.match(cert1.verificationCode, /^SP-[A-F0-9]{8}-[A-F0-9]{8}$/);
    assert.equal((issue1.body.data.certificate as any).pdfBytes, undefined);

    assert.equal(
      await prisma.certificate.count({
        where: { batchCandidateId: approvedCandidateId },
      }),
      1
    );
    assert.equal(
      await prisma.auditLog.count({
        where: { entityId: cert1.id, action: "CERTIFICATE_ISSUED" },
      }),
      1
    );

    // Batch detail includes certificate summary and never leaks pdfBytes
    const batchDetailRes = await apiRequest(
      server,
      "GET",
      `/api/batches/${activeBatchId}`,
      { token: northCentreToken }
    );
    assert.equal(batchDetailRes.status, 200);
    const detailCandidate = batchResponseSchema
      .parse(batchDetailRes.body)
      .data.batch.candidates.find((c) => c.id === approvedCandidateId)!;
    assert.equal(detailCandidate.certificate?.id, cert1.id);
    assert.equal((detailCandidate.certificate as any).pdfBytes, undefined);

    // 10. Download PDF: allowed for State Office and owning Training Centre; forbidden for other centre and District Officer
    const statePdfRes = await apiRequest(
      server,
      "GET",
      `/api/certificates/${cert1.id}/pdf`,
      { token: stateToken, rawBuffer: true }
    );
    assert.equal(statePdfRes.status, 200);
    assert.equal(statePdfRes.headers["content-type"], "application/pdf");
    assert.ok(statePdfRes.buffer?.subarray(0, 5).toString("ascii") === "%PDF-");

    const northPdfRes = await apiRequest(
      server,
      "GET",
      `/api/certificates/${cert1.id}/pdf`,
      { token: northCentreToken, rawBuffer: true }
    );
    assert.equal(northPdfRes.status, 200);

    const southPdfRes = await apiRequest(
      server,
      "GET",
      `/api/certificates/${cert1.id}/pdf`,
      { token: southCentreToken, rawBuffer: true }
    );
    assert.equal(southPdfRes.status, 403);

    const districtPdfRes = await apiRequest(
      server,
      "GET",
      `/api/certificates/${cert1.id}/pdf`,
      { token: districtToken, rawBuffer: true }
    );
    assert.equal(districtPdfRes.status, 403);

    // 11. Revocation: unauthorized cannot revoke; requires reason; repeated revocation preserves original details
    assert.equal(
      (
        await apiRequest(server, "POST", `/api/certificates/${cert1.id}/revoke`, {
          token: northCentreToken,
          body: { reason: "Unauthorized attempt" },
        })
      ).status,
      403
    );
    assert.equal(
      (
        await apiRequest(server, "POST", `/api/certificates/${cert1.id}/revoke`, {
          token: districtToken,
          body: { reason: "Unauthorized attempt" },
        })
      ).status,
      403
    );
    assert.equal(
      (
        await apiRequest(server, "POST", `/api/certificates/${cert1.id}/revoke`, {
          token: stateToken,
          body: { reason: "   " },
        })
      ).status,
      400
    );

    const revokeRes1 = await apiRequest(
      server,
      "POST",
      `/api/certificates/${cert1.id}/revoke`,
      {
        token: stateToken,
        body: { reason: "Score audit discrepancy" },
      }
    );
    assert.equal(revokeRes1.status, 200);
    const revoked1 = certificateResponseSchema.parse(revokeRes1.body).data.certificate;
    assert.equal(revoked1.status, "REVOKED");
    assert.equal(revoked1.revokedById, stateUserId);
    assert.equal(revoked1.revocationReason, "Score audit discrepancy");
    assert.ok(revoked1.revokedAt);

    // Repeated revocation must not overwrite original reason/timestamp or add duplicate audit/outbox
    const revokeRes2 = await apiRequest(
      server,
      "POST",
      `/api/certificates/${cert1.id}/revoke`,
      {
        token: stateToken,
        body: { reason: "Different reason that must be ignored" },
      }
    );
    assert.equal(revokeRes2.status, 200);
    const revoked2 = certificateResponseSchema.parse(revokeRes2.body).data.certificate;
    assert.equal(revoked2.revocationReason, "Score audit discrepancy");
    assert.equal(revoked2.revokedAt, revoked1.revokedAt);
    assert.equal(
      await prisma.auditLog.count({
        where: { entityId: cert1.id, action: "CERTIFICATE_REVOKED" },
      }),
      1
    );

    // Revoked certificate cannot be reissued for the same batch candidate
    const reissueRes = await apiRequest(
      server,
      "POST",
      `/api/batches/${activeBatchId}/candidates/${approvedCandidateId}/certificate`,
      { token: stateToken }
    );
    assert.equal(reissueRes.status, 409);

    // Snapshot immutability check: candidate name/phone/ref still match original CSV submission
    const finalBatch = batchResponseSchema.parse(
      (
        await apiRequest(server, "GET", `/api/batches/${batch.id}`, {
          token: stateToken,
        })
      ).body
    ).data.batch;
    const finalQ1 = finalBatch.candidates.find((c) => c.id === q1.id)!;
    assert.equal(finalQ1.fullName, "Asha Qualified");
    assert.equal(finalQ1.phone, "+9190000001");
  });
});
