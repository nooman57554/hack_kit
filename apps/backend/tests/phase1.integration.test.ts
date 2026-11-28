import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { prisma } from "../src/config/database.js";
import { env } from "../src/config/env.js";

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
    headers?: Record<string, string>;
  } = {}
): Promise<{ status: number; body: any }> {
  const addr = server.address() as { port: number };
  const headers: Record<string, string> = { ...(options.headers ?? {}) };

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
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          let parsed: any = raw;
          try {
            parsed = JSON.parse(raw);
          } catch {}
          resolve({ status: res.statusCode ?? 500, body: parsed });
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

describe("Phase 1 Courses, Rules, and Batch Import API", () => {
  let server: http.Server;
  let stateToken: string;
  let northCentreToken: string;
  let southCentreToken: string;
  let districtToken: string;

  let northCenterId: string;

  const createdCourseIds: string[] = [];
  const createdBatchIds: string[] = [];
  const testRunTag = `P1TEST_${Date.now()}`;

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

    assert.ok(northUser.trainingCenterId);
    northCenterId = northUser.trainingCenterId;

    stateToken = signToken(stateUser.id);
    northCentreToken = signToken(northUser.id);
    southCentreToken = signToken(southUser.id);
    districtToken = signToken(districtUser.id);

    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  });

  after(async () => {
    server.close();

    // Clean up test batches, outbox/audit records, test candidates, and test courses
    if (createdBatchIds.length > 0) {
      await prisma.outboxEvent.deleteMany({
        where: { aggregateId: { in: createdBatchIds } },
      });
      await prisma.auditLog.deleteMany({
        where: { entityId: { in: createdBatchIds } },
      });
      await prisma.batchCandidate.deleteMany({
        where: { batchId: { in: createdBatchIds } },
      });
      await prisma.batch.deleteMany({
        where: { id: { in: createdBatchIds } },
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

  it("allows State Office to create a course/rule and forbids Training Centre and District Officer", async () => {
    const coursePayload = {
      code: `${testRunTag}-COURSE-1`,
      name: "Test Welding Course",
      minAttendancePercent: 75,
      minMarksPercent: 60,
      practicalRequired: true,
      minPracticalPercent: 70,
    };

    const centreRes = await apiRequest(server, "POST", "/api/courses", {
      token: northCentreToken,
      body: coursePayload,
    });
    assert.equal(centreRes.status, 403);

    const districtRes = await apiRequest(server, "POST", "/api/courses", {
      token: districtToken,
      body: coursePayload,
    });
    assert.equal(districtRes.status, 403);

    const stateRes = await apiRequest(server, "POST", "/api/courses", {
      token: stateToken,
      body: coursePayload,
    });
    assert.equal(stateRes.status, 201);
    assert.equal(stateRes.body.data.course.code, coursePayload.code);
    assert.equal(stateRes.body.data.ruleVersion.version, 1);
    assert.equal(
      stateRes.body.data.course.currentRuleVersionId,
      stateRes.body.data.ruleVersion.id
    );

    createdCourseIds.push(stateRes.body.data.course.id);

    // Training Centre and District Officer also cannot publish rule updates
    const centreRuleRes = await apiRequest(
      server,
      "POST",
      `/api/courses/${stateRes.body.data.course.id}/rules`,
      {
        token: northCentreToken,
        body: {
          minAttendancePercent: 50,
          minMarksPercent: 50,
          practicalRequired: false,
          minPracticalPercent: null,
        },
      }
    );
    assert.equal(centreRuleRes.status, 403);

    const districtRuleRes = await apiRequest(
      server,
      "POST",
      `/api/courses/${stateRes.body.data.course.id}/rules`,
      {
        token: districtToken,
        body: {
          minAttendancePercent: 50,
          minMarksPercent: 50,
          practicalRequired: false,
          minPracticalPercent: null,
        },
      }
    );
    assert.equal(districtRuleRes.status, 403);
  });

  it("keeps rule versions immutable, rejects client ruleVersionId overrides, and isolates batches across rule updates and centres", async () => {
    // 1. State Office creates course with rule v1 (75 / 60 / practical 70)
    const createRes = await apiRequest(server, "POST", "/api/courses", {
      token: stateToken,
      body: {
        code: `${testRunTag}-COURSE-2`,
        name: "Test CNC Machining",
        minAttendancePercent: 75,
        minMarksPercent: 60,
        practicalRequired: true,
        minPracticalPercent: 70,
      },
    });
    assert.equal(createRes.status, 201);
    const courseId = createRes.body.data.course.id as string;
    const ruleV1Id = createRes.body.data.ruleVersion.id as string;
    createdCourseIds.push(courseId);

    // 2. Reject batch import attempting to override ruleVersionId in query or header
    const validCsv = [
      "candidateRef,fullName,phone,attendancePercent,marksPercent,practicalPercent",
      `${testRunTag}-C1,Alice Qualified,+9100000001,80,65,75`,
      `${testRunTag}-C2,Bob LowMarks,+9100000002,80,55,75`,
    ].join("\n");

    const overrideQueryRes = await apiRequest(
      server,
      "POST",
      `/api/batches/import?courseId=${courseId}&ruleVersionId=${ruleV1Id}`,
      { token: northCentreToken, body: validCsv }
    );
    assert.equal(overrideQueryRes.status, 400);

    const overrideHeaderRes = await apiRequest(
      server,
      "POST",
      `/api/batches/import?courseId=${courseId}`,
      {
        token: northCentreToken,
        body: validCsv,
        headers: { "x-rule-version-id": ruleV1Id },
      }
    );
    assert.equal(overrideHeaderRes.status, 400);

    // 3. Invalid CSV returns row errors and persists NO batch, candidate, audit, or outbox rows
    const invalidCsv = [
      "candidateRef,fullName,phone,attendancePercent,marksPercent,practicalPercent",
      `${testRunTag}-BAD1,Charlie MissingPractical,+9100000003,85,75,`,
      `${testRunTag}-BAD2,Dana InvalidScore,+9100000004,150,75,80`,
    ].join("\n");

    const invalidRes = await apiRequest(
      server,
      "POST",
      `/api/batches/import?courseId=${courseId}`,
      { token: northCentreToken, body: invalidCsv }
    );
    assert.equal(invalidRes.status, 400);
    assert.ok(Array.isArray(invalidRes.body.error.details));
    assert.ok(
      invalidRes.body.error.details.some(
        (e: any) => e.row === 3 && e.field === "attendancePercent"
      )
    );

    // Missing practical score when rule requires it also aborts atomically
    const missingPracticalCsv = [
      "candidateRef,fullName,phone,attendancePercent,marksPercent,practicalPercent",
      `${testRunTag}-BAD1,Charlie MissingPractical,+9100000003,85,75,`,
    ].join("\n");

    const missingPracticalRes = await apiRequest(
      server,
      "POST",
      `/api/batches/import?courseId=${courseId}`,
      { token: northCentreToken, body: missingPracticalCsv }
    );
    assert.equal(missingPracticalRes.status, 400);
    assert.equal(missingPracticalRes.body.error.details[0].field, "practicalPercent");

    const badCandCount = await prisma.candidate.count({
      where: {
        trainingCenterId: northCenterId,
        candidateRef: `${testRunTag}-BAD1`,
      },
    });
    assert.equal(badCandCount, 0);

    // 4. Valid CSV persists batch in DRAFT, candidates, results, audit, and outbox atomically
    const importV1Res = await apiRequest(
      server,
      "POST",
      `/api/batches/import?courseId=${courseId}`,
      { token: northCentreToken, body: validCsv }
    );
    assert.equal(importV1Res.status, 201);
    const batch1 = importV1Res.body.data.batch;
    createdBatchIds.push(batch1.id);

    assert.equal(batch1.status, "DRAFT");
    assert.equal(batch1.ruleVersionId, ruleV1Id);
    assert.equal(batch1.ruleVersion.version, 1);
    assert.equal(batch1.trainingCenterId, northCenterId);
    assert.equal(batch1.candidates.length, 2);

    const alice = batch1.candidates.find(
      (c: any) => c.candidateRef === `${testRunTag}-C1`
    );
    const bob = batch1.candidates.find(
      (c: any) => c.candidateRef === `${testRunTag}-C2`
    );
    assert.equal(alice.qualified, true);
    assert.deepEqual(alice.qualificationReasons, []);
    assert.equal(bob.qualified, false);
    assert.equal(bob.qualificationReasons[0].code, "MARKS_BELOW_MINIMUM");

    const auditCount = await prisma.auditLog.count({
      where: { entityId: batch1.id, action: "BATCH_IMPORTED" },
    });
    const outboxCount = await prisma.outboxEvent.count({
      where: { aggregateId: batch1.id, eventType: "BATCH_IMPORTED" },
    });
    assert.equal(auditCount, 1);
    assert.equal(outboxCount, 1);

    // 5. Deleting a rule version referenced by a batch is restricted
    await assert.rejects(async () => {
      await prisma.courseRuleVersion.delete({ where: { id: ruleV1Id } });
    });

    // 5b. Course with no currentRuleVersionId rejects batch import with 400
    const rulelessCourse = await prisma.course.create({
      data: {
        code: `${testRunTag}-NORULE`,
        name: "Ruleless Course",
        currentRuleVersionId: null,
      },
    });
    createdCourseIds.push(rulelessCourse.id);

    const noRuleImportRes = await apiRequest(
      server,
      "POST",
      `/api/batches/import?courseId=${rulelessCourse.id}`,
      { token: northCentreToken, body: validCsv }
    );
    assert.equal(noRuleImportRes.status, 400);

    // 6. State Office publishes rule v2 (higher thresholds: 90 / 80 / practical 85)
    const ruleV2Res = await apiRequest(
      server,
      "POST",
      `/api/courses/${courseId}/rules`,
      {
        token: stateToken,
        body: {
          minAttendancePercent: 90,
          minMarksPercent: 80,
          practicalRequired: true,
          minPracticalPercent: 85,
        },
      }
    );
    assert.equal(ruleV2Res.status, 201);
    const ruleV2Id = ruleV2Res.body.data.ruleVersion.id as string;
    assert.equal(ruleV2Res.body.data.ruleVersion.version, 2);

    // Even after v2 becomes current, deleting v1 is still blocked because batch1 references it
    await assert.rejects(async () => {
      await prisma.courseRuleVersion.delete({ where: { id: ruleV1Id } });
    });

    // GET /api/courses returns courses with current rule version (allowed for State Office & Centre)
    const coursesListRes = await apiRequest(server, "GET", "/api/courses", {
      token: northCentreToken,
    });
    assert.equal(coursesListRes.status, 200);
    const listedCourse = coursesListRes.body.data.courses.find(
      (c: any) => c.id === courseId
    );
    assert.equal(listedCourse.currentRuleVersion.version, 2);

    // Rules endpoint returns newest first and v1 thresholds remain unchanged
    const rulesListRes = await apiRequest(
      server,
      "GET",
      `/api/courses/${courseId}/rules`,
      { token: northCentreToken }
    );
    assert.equal(rulesListRes.status, 200);
    assert.equal(rulesListRes.body.data.rules.length, 2);
    assert.equal(rulesListRes.body.data.rules[0].version, 2);
    assert.equal(rulesListRes.body.data.rules[1].version, 1);
    assert.equal(rulesListRes.body.data.rules[1].minAttendancePercent, 75);

    // Existing batch1 retains v1 and Alice remains qualified
    const batch1AfterRes = await apiRequest(
      server,
      "GET",
      `/api/batches/${batch1.id}`,
      { token: northCentreToken }
    );
    assert.equal(batch1AfterRes.status, 200);
    assert.equal(batch1AfterRes.body.data.batch.ruleVersion.version, 1);
    assert.equal(
      batch1AfterRes.body.data.batch.candidates.find(
        (c: any) => c.candidateRef === `${testRunTag}-C1`
      ).qualified,
      true
    );

    // 7. New batch import captures rule v2 automatically (Alice's 80/65/75 now fails under v2)
    const importV2Res = await apiRequest(
      server,
      "POST",
      `/api/batches/import?courseId=${courseId}`,
      { token: northCentreToken, body: validCsv }
    );
    assert.equal(importV2Res.status, 201);
    const batch2 = importV2Res.body.data.batch;
    createdBatchIds.push(batch2.id);

    assert.equal(batch2.ruleVersionId, ruleV2Id);
    assert.equal(batch2.ruleVersion.version, 2);
    const aliceV2 = batch2.candidates.find(
      (c: any) => c.candidateRef === `${testRunTag}-C1`
    );
    assert.equal(aliceV2.qualified, false);
    assert.equal(aliceV2.qualificationReasons.length, 3);

    // 8. Centre scope isolation: South Centre cannot read North Centre's batch; State Office can
    const southReadRes = await apiRequest(
      server,
      "GET",
      `/api/batches/${batch1.id}`,
      { token: southCentreToken }
    );
    assert.equal(southReadRes.status, 403);

    const stateReadRes = await apiRequest(
      server,
      "GET",
      `/api/batches/${batch1.id}`,
      { token: stateToken }
    );
    assert.equal(stateReadRes.status, 200);
    assert.equal(stateReadRes.body.data.batch.id, batch1.id);
  });
});
