import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { batchResponseSchema } from "../src/modules/batches/batches.contracts.js";
import { formatBatchResponse } from "../src/modules/batches/batches.service.js";
import {
  createCourseResponseSchema,
  getCourseRulesResponseSchema,
  getCoursesResponseSchema,
  publishCourseRuleResponseSchema,
} from "../src/modules/courses/courses.contracts.js";
import {
  resolveBatchImportCenterId,
  resolveBatchReadScope,
} from "../src/permissions/batch-scope.policy.js";
import { DEFAULT_ROLES, PERMISSIONS } from "../src/permissions/permission.registry.js";
import { ForbiddenError } from "../src/utils/errors.js";

describe("Batch scope authorization policy", () => {
  it("grants cross-centre read access to unscoped multi-role users with State Office or Admin access", () => {
    const scope = resolveBatchReadScope({
      id: "11111111-1111-4111-8111-111111111111",
      roles: [DEFAULT_ROLES.MEMBER, DEFAULT_ROLES.STATE_OFFICE],
      districtId: null,
      trainingCenterId: null,
      permissions: new Set([
        PERMISSIONS.TASKS_READ.key,
        PERMISSIONS.COURSES_MANAGE.key,
        PERMISSIONS.BATCHES_READ.key,
      ]),
    });

    assert.deepEqual(scope, { crossCenter: true });
  });

  it("restricts centre-scoped users to their own training centre even with multiple roles", () => {
    const centerId = "22222222-2222-4222-8222-222222222222";
    const scope = resolveBatchReadScope({
      id: "11111111-1111-4111-8111-111111111111",
      roles: [DEFAULT_ROLES.TRAINING_CENTER, DEFAULT_ROLES.STATE_OFFICE],
      districtId: null,
      trainingCenterId: centerId,
      permissions: new Set([PERMISSIONS.BATCHES_READ.key]),
    });

    assert.deepEqual(scope, {
      crossCenter: false,
      trainingCenterId: centerId,
    });
  });

  it("denies users lacking batches.read permission or having district/dual scope", () => {
    assert.throws(
      () =>
        resolveBatchReadScope({
          id: "11111111-1111-4111-8111-111111111111",
          roles: [DEFAULT_ROLES.STATE_OFFICE],
          districtId: null,
          trainingCenterId: null,
          permissions: new Set([PERMISSIONS.COURSES_READ.key]),
        }),
      ForbiddenError
    );

    assert.throws(
      () =>
        resolveBatchReadScope({
          id: "11111111-1111-4111-8111-111111111111",
          roles: [DEFAULT_ROLES.STATE_OFFICE],
          districtId: "33333333-3333-4333-8333-333333333333",
          trainingCenterId: "22222222-2222-4222-8222-222222222222",
          permissions: new Set([PERMISSIONS.BATCHES_READ.key]),
        }),
      ForbiddenError
    );
  });

  it("requires batches.import and centre scope for batch import", () => {
    const centerId = "22222222-2222-4222-8222-222222222222";
    assert.equal(
      resolveBatchImportCenterId({
        id: "11111111-1111-4111-8111-111111111111",
        roles: [DEFAULT_ROLES.TRAINING_CENTER, DEFAULT_ROLES.MEMBER],
        districtId: null,
        trainingCenterId: centerId,
        permissions: new Set([PERMISSIONS.BATCHES_IMPORT.key]),
      }),
      centerId
    );

    assert.throws(
      () =>
        resolveBatchImportCenterId({
          id: "11111111-1111-4111-8111-111111111111",
          roles: [DEFAULT_ROLES.STATE_OFFICE],
          districtId: null,
          trainingCenterId: null,
          permissions: new Set([PERMISSIONS.BATCHES_IMPORT.key]),
        }),
      ForbiddenError
    );
  });
});

describe("Batch candidate snapshots and endpoint response contracts", () => {
  const nowIso = "2026-11-28T06:00:00.000Z";
  const now = new Date(nowIso);
  const uuid1 = "11111111-1111-4111-8111-111111111111";
  const uuid2 = "22222222-2222-4222-8222-222222222222";
  const uuid3 = "33333333-3333-4333-8333-333333333333";
  const uuid4 = "44444444-4444-4444-8444-444444444444";

  it("maps batch responses from BatchCandidate snapshot fields", () => {
    const formatted = formatBatchResponse({
      id: uuid1,
      trainingCenterId: uuid2,
      courseId: uuid3,
      ruleVersionId: uuid4,
      status: "DRAFT",
      createdById: uuid1,
      createdAt: now,
      submittedAt: null,
      trainingCenter: {
        id: uuid2,
        code: "TC-NORTH-01",
        name: "North Skill Academy",
        districtId: uuid3,
      },
      course: {
        id: uuid3,
        code: "FSWD-101",
        name: "Full-Stack Web Development",
      },
      ruleVersion: {
        id: uuid4,
        version: 1,
        minAttendancePercent: 75,
        minMarksPercent: 60,
        practicalRequired: true,
        minPracticalPercent: 70,
        createdAt: now,
      },
      candidates: [
        {
          id: uuid1,
          candidateId: uuid2,
          candidateRefSnapshot: "CAND-001",
          fullNameSnapshot: "Original Name",
          phoneSnapshot: "+9100000001",
          attendancePercent: 80,
          marksPercent: 70,
          practicalPercent: 75,
          qualified: true,
          qualificationReasons: [],
        },
      ],
    });

    assert.equal(formatted.candidates[0].candidateRef, "CAND-001");
    assert.equal(formatted.candidates[0].fullName, "Original Name");
    assert.equal(formatted.candidates[0].phone, "+9100000001");

    const serialized = JSON.parse(
      JSON.stringify({ success: true, data: { batch: formatted } })
    );
    const parsed = batchResponseSchema.parse(serialized);
    assert.equal(parsed.data.batch.candidates[0].fullName, "Original Name");
  });

  it("validates course and rule response contracts", () => {
    const rule = {
      id: uuid4,
      courseId: uuid3,
      version: 1,
      minAttendancePercent: 75,
      minMarksPercent: 60,
      practicalRequired: true,
      minPracticalPercent: 70,
      createdById: uuid1,
      createdAt: nowIso,
    };

    const course = {
      id: uuid3,
      code: "FSWD-101",
      name: "Full-Stack Web Development",
      currentRuleVersionId: uuid4,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    assert.ok(
      getCoursesResponseSchema.parse({
        success: true,
        data: { courses: [{ ...course, currentRuleVersion: rule }] },
      })
    );
    assert.ok(
      createCourseResponseSchema.parse({
        success: true,
        data: { course, ruleVersion: rule },
      })
    );
    assert.ok(
      publishCourseRuleResponseSchema.parse({
        success: true,
        data: { ruleVersion: rule },
      })
    );
    assert.ok(
      getCourseRulesResponseSchema.parse({
        success: true,
        data: {
          course: {
            id: uuid3,
            code: "FSWD-101",
            name: "Full-Stack Web Development",
            currentRuleVersionId: uuid4,
          },
          rules: [rule],
        },
      })
    );
  });
});
