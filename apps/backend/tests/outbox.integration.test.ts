import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { prisma } from "../src/config/database.js";
import { env } from "../src/config/env.js";
import { CertificatesService } from "../src/modules/certificates/certificates.service.js";
import {
  calculateOutboxBackoffMs,
  sanitizeOutboxError,
} from "../src/modules/outbox/outbox.handlers.js";
import { outboxService } from "../src/modules/outbox/outbox.service.js";
import { OUTBOX_STATUS } from "../src/modules/outbox/outbox.types.js";
import { OutboxWorker } from "../src/modules/outbox/outbox.worker.js";

function signToken(userId: string): string {
  return jwt.sign({ userId }, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "1h",
  });
}

describe("Phase 4 Transactional Outbox Processing and Recovery", () => {
  let server: http.Server;
  let stateUserId: string;
  let stateToken: string;
  let northCentreToken: string;
  let courseId: string;
  let batchId: string;
  let bc1Id: string;
  let bc2Id: string;
  let unapprovedBcId: string;
  let candIds: string[] = [];

  const testRunTag = `OUTBOX_${Date.now()}`;
  const createdCertIds: string[] = [];
  const syntheticOutboxIds: string[] = [];

  before(async () => {
    const stateUser = await prisma.user.findUniqueOrThrow({
      where: { email: "state.officer@skillpass.local" },
    });
    const northUser = await prisma.user.findUniqueOrThrow({
      where: { email: "centre.north@skillpass.local" },
    });
    stateUserId = stateUser.id;
    stateToken = signToken(stateUser.id);
    northCentreToken = signToken(northUser.id);

    server = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });

    const addr = server.address() as { port: number };
    const base = `http://127.0.0.1:${addr.port}`;

    const courseRes = await fetch(`${base}/api/courses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${stateToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        code: `${testRunTag}-COURSE`,
        name: `Outbox Course ${testRunTag}`,
        minAttendancePercent: 75,
        minMarksPercent: 60,
        practicalRequired: false,
      }),
    });
    const courseBody = (await courseRes.json()) as any;
    courseId = courseBody.data.course.id;

    const csv = [
      "candidateRef,fullName,phone,attendancePercent,marksPercent,practicalPercent",
      `${testRunTag}-01,Outbox Candidate One,+919876500001,92,88,`,
      `${testRunTag}-02,Outbox Candidate Two,+919876500002,90,85,`,
      `${testRunTag}-03,Outbox Unapproved,+919876500003,90,85,`,
    ].join("\n");

    const importRes = await fetch(`${base}/api/batches/import?courseId=${courseId}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${northCentreToken}`,
        "Content-Type": "text/csv",
      },
      body: csv,
    });
    const importBody = (await importRes.json()) as any;
    batchId = importBody.data.batch.id;
    const candidates = importBody.data.batch.candidates as Array<any>;
    bc1Id = candidates[0].id;
    bc2Id = candidates[1].id;
    unapprovedBcId = candidates[2].id;
    candIds = candidates.map((c) => c.candidateId);

    await fetch(`${base}/api/batches/${batchId}/submit`, {
      method: "POST",
      headers: { Authorization: `Bearer ${northCentreToken}` },
    });

    for (const bcId of [bc1Id, bc2Id]) {
      await fetch(`${base}/api/batches/${batchId}/candidates/${bcId}/review`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${stateToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "APPROVED" }),
      });
    }
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));

    if (syntheticOutboxIds.length > 0) {
      await prisma.outboxEvent.deleteMany({
        where: { id: { in: syntheticOutboxIds } },
      });
    }

    if (batchId) {
      await prisma.outboxEvent.deleteMany({
        where: {
          aggregateId: { in: [batchId, bc1Id, bc2Id, ...createdCertIds] },
        },
      });
      await prisma.auditLog.deleteMany({
        where: {
          entityId: {
            in: [batchId, bc1Id, bc2Id, unapprovedBcId, courseId, ...createdCertIds],
          },
        },
      });
      if (createdCertIds.length > 0) {
        await prisma.certificate.deleteMany({
          where: { id: { in: createdCertIds } },
        });
      }
      await prisma.batchCandidate.deleteMany({ where: { batchId } });
      await prisma.batch.delete({ where: { id: batchId } });
      if (candIds.length > 0) {
        await prisma.candidate.deleteMany({ where: { id: { in: candIds } } });
      }
    }

    if (courseId) {
      await prisma.course.update({
        where: { id: courseId },
        data: { currentRuleVersionId: null },
      });
      await prisma.courseRuleVersion.deleteMany({ where: { courseId } });
      await prisma.course.delete({ where: { id: courseId } });
    }
  });

  it("sanitizes error messages and caps exponential backoff cleanly", () => {
    const sanitized = sanitizeOutboxError(
      new Error(
        "Failed calling sppk_0123456789ab.supersecretvalue Bearer jwt.tok.sig +919876543210\nmore details"
      )
    );
    assert.equal(sanitized.includes("supersecretvalue"), false);
    assert.equal(sanitized.includes("jwt.tok.sig"), false);
    assert.equal(sanitized.includes("9876543210"), false);
    assert.equal(sanitized.includes("\n"), false);

    assert.equal(calculateOutboxBackoffMs(1, 100, 500), 100);
    assert.equal(calculateOutboxBackoffMs(2, 100, 500), 200);
    assert.equal(calculateOutboxBackoffMs(3, 100, 500), 400);
    assert.equal(calculateOutboxBackoffMs(4, 100, 500), 500);
  });

  it("creates outbox events atomically with audit logs and creates neither on failed mutations", async () => {
    const certService = new CertificatesService();

    // Failed issuance for PENDING unapproved candidate creates neither audit nor outbox
    await assert.rejects(() =>
      certService.issueCertificate(stateUserId, batchId, unapprovedBcId)
    );
    const failedAuditCount = await prisma.auditLog.count({
      where: { entityType: "CERTIFICATE", actorId: stateUserId, entityId: unapprovedBcId },
    });
    assert.equal(failedAuditCount, 0);

    // Issue + revoke atomic outbox creation
    const issued = await certService.issueCertificate(
      stateUserId,
      batchId,
      bc1Id
    );
    createdCertIds.push(issued.id);

    const revoked = await certService.revokeCertificate(
      stateUserId,
      issued.id,
      "Outbox lifecycle revocation"
    );
    assert.equal(revoked.status, "REVOKED");

    const [auditEvents, outboxEvents] = await Promise.all([
      prisma.auditLog.findMany({
        where: { entityType: "CERTIFICATE", entityId: issued.id },
        orderBy: { createdAt: "asc" },
      }),
      prisma.outboxEvent.findMany({
        where: { aggregateId: issued.id },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    assert.deepEqual(
      auditEvents.map((a) => a.action),
      ["CERTIFICATE_ISSUED", "CERTIFICATE_REVOKED"]
    );
    assert.deepEqual(
      outboxEvents.map((e) => e.eventType),
      ["CERTIFICATE_ISSUED", "CERTIFICATE_REVOKED"]
    );
    for (const evt of outboxEvents) {
      assert.equal(evt.status, OUTBOX_STATUS.PENDING);
      assert.equal(evt.publishedAt, null);
    }

    // Worker processes both CERTIFICATE_ISSUED (idempotent even after revocation) and CERTIFICATE_REVOKED
    const worker = new OutboxWorker({ batchSize: 10 });
    const run = await worker.runOnce();
    assert.ok(run.processed >= 2);

    const afterEvents = await prisma.outboxEvent.findMany({
      where: { aggregateId: issued.id },
      orderBy: { createdAt: "asc" },
    });
    for (const evt of afterEvents) {
      assert.equal(evt.status, OUTBOX_STATUS.PROCESSED);
      assert.ok(evt.publishedAt);
      assert.ok(evt.processedAt);
      assert.equal(evt.attempts, 1);
    }

    // Non-certificate batch outbox events remain untouched by certificate worker
    const batchOutbox = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: batchId, eventType: "BATCH_IMPORTED" },
    });
    assert.equal(batchOutbox.status, OUTBOX_STATUS.PENDING);
  });

  it("prevents concurrent double claims, recovers expired leases, retries with backoff, dead-letters after maxAttempts, and reports status summary", async () => {
    const certService = new CertificatesService();
    const cert2 = await certService.issueCertificate(stateUserId, batchId, bc2Id);
    createdCertIds.push(cert2.id);

    const realEvt = await prisma.outboxEvent.findFirstOrThrow({
      where: { aggregateId: cert2.id, eventType: "CERTIFICATE_ISSUED" },
    });

    // 1. Simulate concurrent claims from two workers against the same pending event
    const observedCalls: string[] = [];
    const slowWorkerA = new OutboxWorker({
      workerId: "worker-A",
      batchSize: 5,
      handlers: {
        CERTIFICATE_ISSUED: async (evt) => {
          observedCalls.push(`A:${evt.id}`);
          await new Promise((r) => setTimeout(r, 80));
        },
      },
    });
    const fastWorkerB = new OutboxWorker({
      workerId: "worker-B",
      batchSize: 5,
      handlers: {
        CERTIFICATE_ISSUED: async (evt) => {
          observedCalls.push(`B:${evt.id}`);
        },
      },
    });

    const [resA, resB] = await Promise.all([
      slowWorkerA.runOnce(),
      (async () => {
        await new Promise((r) => setTimeout(r, 15));
        return fastWorkerB.runOnce();
      })(),
    ]);

    const callsForRealEvt = observedCalls.filter((entry) =>
      entry.endsWith(realEvt.id)
    );
    assert.equal(callsForRealEvt.length, 1);
    assert.equal(resA.processed + resB.processed >= 1, true);

    // 2. Lease expiration / crash recovery + idempotent re-execution
    const crashedEvt = await prisma.outboxEvent.create({
      data: {
        eventType: "CERTIFICATE_ISSUED",
        aggregateId: cert2.id,
        status: OUTBOX_STATUS.PROCESSING,
        lockedBy: "dead-worker",
        lockedAt: new Date(Date.now() - 60_000),
        leaseExpiresAt: new Date(Date.now() - 5_000),
        attempts: 1,
        payload: realEvt.payload as any,
      },
    });
    syntheticOutboxIds.push(crashedEvt.id);

    const recoveryWorker = new OutboxWorker({
      workerId: "recovery-worker",
      batchSize: 10,
    });
    const recoveryRun = await recoveryWorker.runOnce();
    assert.ok(recoveryRun.processed >= 1);

    const recoveredRow = await prisma.outboxEvent.findUniqueOrThrow({
      where: { id: crashedEvt.id },
    });
    assert.equal(recoveredRow.status, OUTBOX_STATUS.PROCESSED);
    assert.equal(recoveredRow.attempts, 2);
    assert.ok(recoveredRow.publishedAt);

    // 3. Failure retry with capped backoff -> dead-letter after maxAttempts + status summary
    const failingEvt = await prisma.outboxEvent.create({
      data: {
        eventType: "CERTIFICATE_ISSUED",
        aggregateId: cert2.id,
        status: OUTBOX_STATUS.PENDING,
        availableAt: new Date(Date.now() - 1_000),
        payload: realEvt.payload as any,
      },
    });
    syntheticOutboxIds.push(failingEvt.id);

    let fakeClock = Date.now();
    const failingWorker = new OutboxWorker({
      workerId: "failing-worker",
      batchSize: 10,
      maxAttempts: 2,
      backoffBaseMs: 500,
      backoffMaxMs: 2_000,
      now: () => new Date(fakeClock),
      handlers: {
        CERTIFICATE_ISSUED: async () => {
          throw new Error("Simulated failure with +919876543210");
        },
      },
    });

    // Attempt 1 -> moves to PENDING with availableAt = fakeClock + 500
    const failRun1 = await failingWorker.runOnce();
    assert.equal(failRun1.retried, 1);

    const afterAttempt1 = await prisma.outboxEvent.findUniqueOrThrow({
      where: { id: failingEvt.id },
    });
    assert.equal(afterAttempt1.status, OUTBOX_STATUS.PENDING);
    assert.equal(afterAttempt1.attempts, 1);
    assert.equal(afterAttempt1.availableAt.getTime(), fakeClock + 500);
    assert.equal(afterAttempt1.lastError?.includes("9876543210"), false);

    // Running immediately before backoff expires claims 0
    const tooEarlyRun = await failingWorker.runOnce();
    assert.equal(tooEarlyRun.claimed, 0);

    // Advance clock past backoff -> Attempt 2 dead-letters it
    fakeClock += 600;
    const failRun2 = await failingWorker.runOnce();
    assert.equal(failRun2.deadLettered, 1);

    const deadRow = await prisma.outboxEvent.findUniqueOrThrow({
      where: { id: failingEvt.id },
    });
    assert.equal(deadRow.status, OUTBOX_STATUS.DEAD_LETTER);
    assert.equal(deadRow.attempts, 2);
    assert.ok(deadRow.deadLetteredAt);

    // Dead-lettered event is never claimed again
    fakeClock += 60_000;
    const afterDeadRun = await failingWorker.runOnce();
    assert.equal(afterDeadRun.claimed, 0);

    // Pending event for status summary check
    const pendingForStatus = await prisma.outboxEvent.create({
      data: {
        eventType: "CERTIFICATE_REVOKED",
        aggregateId: cert2.id,
        status: OUTBOX_STATUS.PENDING,
        createdAt: new Date(Date.now() - 10_000),
        payload: { ...((realEvt.payload as any) ?? {}), status: "REVOKED", revokedById: stateUserId, revokedAt: new Date().toISOString() },
      },
    });
    syntheticOutboxIds.push(pendingForStatus.id);

    const summary = await outboxService.getStatusSummary();
    assert.ok(summary.counts.processed >= 3);
    assert.ok(summary.counts.deadLetter >= 1);
    assert.ok(summary.counts.pending >= 1);
    assert.ok(summary.oldestPendingAgeMs !== null && summary.oldestPendingAgeMs >= 9_000);

    // Check GET /api/health/outbox HTTP endpoint
    const addr = server.address() as { port: number };
    const healthRes = await fetch(`http://127.0.0.1:${addr.port}/api/health/outbox`);
    assert.equal(healthRes.status, 200);
    const healthBody = (await healthRes.json()) as any;
    assert.equal(healthBody.success, true);
    assert.ok(healthBody.data.counts.deadLetter >= 1);

    // 4. Graceful shutdown awaits in-progress work cleanly
    let finishedSlow = false;
    const shutdownWorker = new OutboxWorker({
      workerId: "shutdown-worker",
      pollIntervalMs: 50,
      batchSize: 5,
      handlers: {
        CERTIFICATE_REVOKED: async () => {
          await new Promise((r) => setTimeout(r, 80));
          finishedSlow = true;
        },
      },
    });
    shutdownWorker.start();
    await new Promise((r) => setTimeout(r, 20));
    await shutdownWorker.stop();
    assert.equal(finishedSlow, true);
  });
});
