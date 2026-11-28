import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { prisma } from "../src/config/database.js";
import { env } from "../src/config/env.js";
import { batchResponseSchema } from "../src/modules/batches/batches.contracts.js";
import {
  createCourseResponseSchema,
  getCourseRulesResponseSchema,
  getCoursesResponseSchema,
  publishCourseRuleResponseSchema,
} from "../src/modules/courses/courses.contracts.js";
import { DEFAULT_ROLES } from "../src/permissions/permission.registry.js";

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
          } catch { }
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

describe("Courses, Rules, and Batch Import API", () => {
  let server: http.Server;
  let stateToken: string;
  let multiRoleStateToken: string;
  let northCentreToken: string;
  let southCentreToken: string;
  let districtToken: string;

  let northCenterId: string;
  let multiRoleUserId: string;

  const createdCourseIds: string[] = [];
  const createdBatchIds: string[] = [];
  const testRunTag = `CBTEST_${Date.now()}`;

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

    // Create a multi-role unscoped user holding both STATE_OFFICE and MEMBER roles
    const stateRole = await prisma.role.findUniqueOrThrow({
      where: { name: DEFAULT_ROLES.STATE_OFFICE },
    });
    const memberRole = await prisma.role.findUniqueOrThrow({
      where: { name: DEFAULT_ROLES.MEMBER },
    });
    const multiRoleUser = await prisma.user.create({
      data: {
        name: "Multi-Role State Officer",
        email: `multirole_${Date.now()}@skillpass.local`,
        password: stateUser.password,
        districtId: null,
        trainingCenterId: null,
        userRoles: {
          create: [{ roleId: stateRole.id }, { roleId: memberRole.id }],
        },
      },
    });
    multiRoleUserId = multiRoleUser.id;

    stateToken = signToken(stateUser.id);
    multiRoleStateToken = signToken(multiRoleUser.id);
    northCentreToken = signToken(northUser.id);
    southCentreToken = signToken(southUser.id);
    districtToken = signToken(districtUser.id);

    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  });

  after(async () => {
    server.close();

    const allCourseBatchIds = createdCourseIds.length
      ? (
        await prisma.batch.findMany({
          where: { courseId: { in: createdCourseIds } },
          select: { id: true },
        })
      ).map((b) => b.id)
      : [];
    const batchIdsToClean = Array.from(
      new Set([...createdBatchIds, ...allCourseBatchIds])
    );

    if (batchIdsToClean.length > 0) {
      await prisma.outboxEvent.deleteMany({
        where: { aggregateId: { in: batchIdsToClean } },
      });
      await prisma.auditLog.deleteMany({
        where: { entityId: { in: batchIdsToClean } },
      });
      await prisma.batchCandidate.deleteMany({
        where: { batchId: { in: batchIdsToClean } },
      });
      await prisma.batch.deleteMany({
        where: { id: { in: batchIdsToClean } },
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

    if (multiRoleUserId) {
      await prisma.user.delete({ where: { id: multiRoleUserId } });
    }

    await prisma.$disconnect();
  });

  it("allows State Office (including multi-role users) to create a course/rule and forbids Training Centre and District Officer", async () => {
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

    const multiRoleStateRes = await apiRequest(server, "POST", "/api/courses", {
      token: multiRoleStateToken,
      body: coursePayload,
    });
    assert.equal(multiRoleStateRes.status, 201);
    const parsedCreate = createCourseResponseSchema.parse(multiRoleStateRes.body);
    assert.equal(parsedCreate.data.course.code, coursePayload.code);
    assert.equal(parsedCreate.data.ruleVersion.version, 1);
    assert.equal(
      parsedCreate.data.course.currentRuleVersionId,
      parsedCreate.data.ruleVersion.id
    );

    createdCourseIds.push(parsedCreate.data.course.id);

    const centreRuleRes = await apiRequest(
      server,
      "POST",
      `/api/courses/${parsedCreate.data.course.id}/rules`,
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
      `/api/courses/${parsedCreate.data.course.id}/rules`,
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

  it("keeps rule versions immutable, preserves candidate batch snapshots across profile updates, and isolates batches across centres", async () => {
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
    const parsedCreate = createCourseResponseSchema.parse(createRes.body);
    const courseId = parsedCreate.data.course.id;
    const ruleV1Id = parsedCreate.data.ruleVersion.id;
    createdCourseIds.push(courseId);

    // 2. Reject batch import attempting to override ruleVersionId in query or header
    const validCsvBatch1 = [
      "candidateRef,fullName,phone,attendancePercent,marksPercent,practicalPercent",
      `${testRunTag}-C1,Alice Original,+9100000001,80,65,75`,
      `${testRunTag}-C2,Bob LowMarks,+9100000002,80,55,75`,
    ].join("\n");

    const overrideQueryRes = await apiRequest(
      server,
      "POST",
      `/api/batches/import?courseId=${courseId}&ruleVersionId=${ruleV1Id}`,
      { token: northCentreToken, body: validCsvBatch1 }
    );
    assert.equal(overrideQueryRes.status, 400);

    const overrideHeaderRes = await apiRequest(
      server,
      "POST",
      `/api/batches/import?courseId=${courseId}`,
      {
        token: northCentreToken,
        body: validCsvBatch1,
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

    const badCandCount = await prisma.candidate.count({
      where: {
        trainingCenterId: northCenterId,
        candidateRef: `${testRunTag}-BAD1`,
      },
    });
    assert.equal(badCandCount, 0);

    // 4. Valid CSV persists batch 1 in DRAFT, candidate snapshots, results, audit, and outbox atomically
    const importV1Res = await apiRequest(
      server,
      "POST",
      `/api/batches/import?courseId=${courseId}`,
      { token: northCentreToken, body: validCsvBatch1 }
    );
    assert.equal(importV1Res.status, 201);
    const parsedBatch1 = batchResponseSchema.parse(importV1Res.body);
    const batch1 = parsedBatch1.data.batch;
    createdBatchIds.push(batch1.id);

    assert.equal(batch1.status, "DRAFT");
    assert.equal(batch1.ruleVersionId, ruleV1Id);
    assert.equal(batch1.ruleVersion.version, 1);
    assert.equal(batch1.trainingCenterId, northCenterId);
    assert.equal(batch1.candidates.length, 2);

    const aliceB1 = batch1.candidates.find(
      (c) => c.candidateRef === `${testRunTag}-C1`
    )!;
    const bobB1 = batch1.candidates.find(
      (c) => c.candidateRef === `${testRunTag}-C2`
    )!;
    assert.equal(aliceB1.fullName, "Alice Original");
    assert.equal(aliceB1.phone, "+9100000001");
    assert.equal(aliceB1.qualified, true);
    assert.equal(bobB1.qualified, false);
    assert.equal(bobB1.qualificationReasons[0].code, "MARKS_BELOW_MINIMUM");

    // 5. State Office publishes rule v2 (90 / 80 / practical 85)
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
    const parsedRuleV2 = publishCourseRuleResponseSchema.parse(ruleV2Res.body);
    const ruleV2Id = parsedRuleV2.data.ruleVersion.id;
    assert.equal(parsedRuleV2.data.ruleVersion.version, 2);

    // Deleting v1 is restricted because batch1 references it
    await assert.rejects(async () => {
      await prisma.courseRuleVersion.delete({ where: { id: ruleV1Id } });
    });

    // GET /api/courses and GET /api/courses/:courseId/rules match contracts
    const coursesListRes = await apiRequest(server, "GET", "/api/courses", {
      token: northCentreToken,
    });
    assert.equal(coursesListRes.status, 200);
    getCoursesResponseSchema.parse(coursesListRes.body);

    const rulesListRes = await apiRequest(
      server,
      "GET",
      `/api/courses/${courseId}/rules`,
      { token: northCentreToken }
    );
    assert.equal(rulesListRes.status, 200);
    const parsedRulesList = getCourseRulesResponseSchema.parse(rulesListRes.body);
    assert.equal(parsedRulesList.data.rules.length, 2);
    assert.equal(parsedRulesList.data.rules[0].version, 2);
    assert.equal(parsedRulesList.data.rules[1].version, 1);

    // 6. Later import uses same candidateRef with updated fullName and phone
    const validCsvBatch2 = [
      "candidateRef,fullName,phone,attendancePercent,marksPercent,practicalPercent",
      `${testRunTag}-C1,Alice Updated,+9199999999,80,65,75`,
    ].join("\n");

    const importV2Res = await apiRequest(
      server,
      "POST",
      `/api/batches/import?courseId=${courseId}`,
      { token: northCentreToken, body: validCsvBatch2 }
    );
    assert.equal(importV2Res.status, 201);
    const parsedBatch2 = batchResponseSchema.parse(importV2Res.body);
    const batch2 = parsedBatch2.data.batch;
    createdBatchIds.push(batch2.id);

    assert.equal(batch2.ruleVersionId, ruleV2Id);
    assert.equal(batch2.ruleVersion.version, 2);
    assert.equal(batch2.candidates[0].fullName, "Alice Updated");
    assert.equal(batch2.candidates[0].phone, "+9199999999");
    assert.equal(batch2.candidates[0].qualified, false);

    // Earlier batch1 retains original snapshot values and original qualification under v1
    const batch1ReadRes = await apiRequest(
      server,
      "GET",
      `/api/batches/${batch1.id}`,
      { token: northCentreToken }
    );
    assert.equal(batch1ReadRes.status, 200);
    const parsedBatch1Read = batchResponseSchema.parse(batch1ReadRes.body);
    const aliceB1Read = parsedBatch1Read.data.batch.candidates.find(
      (c) => c.candidateRef === `${testRunTag}-C1`
    )!;
    assert.equal(aliceB1Read.fullName, "Alice Original");
    assert.equal(aliceB1Read.phone, "+9100000001");
    assert.equal(aliceB1Read.qualified, true);

    // Shared Candidate profile reflects the latest upsert
    const currentCandidate = await prisma.candidate.findUniqueOrThrow({
      where: {
        trainingCenterId_candidateRef: {
          trainingCenterId: northCenterId,
          candidateRef: `${testRunTag}-C1`,
        },
      },
    });
    assert.equal(currentCandidate.fullName, "Alice Updated");
    assert.equal(currentCandidate.phone, "+9199999999");

    // 7. Centre scope isolation and multi-role cross-centre State Office access
    const southReadRes = await apiRequest(
      server,
      "GET",
      `/api/batches/${batch1.id}`,
      { token: southCentreToken }
    );
    assert.equal(southReadRes.status, 403);

    const multiRoleStateReadRes = await apiRequest(
      server,
      "GET",
      `/api/batches/${batch1.id}`,
      { token: multiRoleStateToken }
    );
    assert.equal(multiRoleStateReadRes.status, 200);
    batchResponseSchema.parse(multiRoleStateReadRes.body);
  });
});
