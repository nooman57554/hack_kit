import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseAndValidateBatchCsv } from "../src/modules/batches/batches.schema.js";
import {
  evaluateCandidateQualification,
  QUALIFICATION_REASON_CODES,
} from "../src/modules/batches/qualification.js";

describe("evaluateCandidateQualification", () => {
  const ruleWithPractical = {
    minAttendancePercent: 75,
    minMarksPercent: 60,
    practicalRequired: true,
    minPracticalPercent: 70,
  };

  it("qualifies a candidate meeting exact minimum thresholds", () => {
    const result = evaluateCandidateQualification(
      {
        attendancePercent: 75,
        marksPercent: 60,
        practicalPercent: 70,
      },
      ruleWithPractical
    );

    assert.equal(result.qualified, true);
    assert.deepEqual(result.reasons, []);
  });

  it("fails with all applicable reason codes when thresholds are below minimum", () => {
    const result = evaluateCandidateQualification(
      {
        attendancePercent: 74.9,
        marksPercent: 59.5,
        practicalPercent: 69.9,
      },
      ruleWithPractical
    );

    assert.equal(result.qualified, false);
    assert.deepEqual(
      result.reasons.map((r) => r.code),
      [
        QUALIFICATION_REASON_CODES.ATTENDANCE_BELOW_MINIMUM,
        QUALIFICATION_REASON_CODES.MARKS_BELOW_MINIMUM,
        QUALIFICATION_REASON_CODES.PRACTICAL_BELOW_MINIMUM,
      ]
    );
  });

  it("fails with PRACTICAL_MISSING when practical is required but score is null", () => {
    const result = evaluateCandidateQualification(
      {
        attendancePercent: 90,
        marksPercent: 85,
        practicalPercent: null,
      },
      ruleWithPractical
    );

    assert.equal(result.qualified, false);
    assert.deepEqual(
      result.reasons.map((r) => r.code),
      [QUALIFICATION_REASON_CODES.PRACTICAL_MISSING]
    );
  });

  it("ignores practical score when practicalRequired is false", () => {
    const result = evaluateCandidateQualification(
      {
        attendancePercent: 80,
        marksPercent: 65,
        practicalPercent: null,
      },
      {
        minAttendancePercent: 80,
        minMarksPercent: 65,
        practicalRequired: false,
        minPracticalPercent: null,
      }
    );

    assert.equal(result.qualified, true);
    assert.deepEqual(result.reasons, []);
  });
});

describe("parseAndValidateBatchCsv", () => {
  it("parses valid CSV rows", () => {
    const csv = [
      "candidateRef,fullName,phone,attendancePercent,marksPercent,practicalPercent",
      "CAND-1,Alice Smith,+15550001,85,72.5,80",
      "CAND-2,Bob Jones,+15550002,75,60,",
    ].join("\n");

    const { errors, rows } = parseAndValidateBatchCsv(csv);
    assert.deepEqual(errors, []);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].candidateRef, "CAND-1");
    assert.equal(rows[0].marksPercent, 72.5);
    assert.equal(rows[1].practicalPercent, null);
  });

  it("rejects mismatched headers", () => {
    const csv = [
      "ref,fullName,phone,attendancePercent,marksPercent,practicalPercent",
      "CAND-1,Alice,+15550001,85,70,80",
    ].join("\n");

    const { errors, rows } = parseAndValidateBatchCsv(csv);
    assert.equal(rows.length, 0);
    assert.equal(errors[0].row, 1);
    assert.equal(errors[0].field, "headers");
  });

  it("collects row-level errors for duplicates, missing fields, and out-of-range scores", () => {
    const csv = [
      "candidateRef,fullName,phone,attendancePercent,marksPercent,practicalPercent",
      "CAND-1,Alice,+15550001,101,70,80",
      "CAND-1,,+15550002,80,-5,abc",
    ].join("\n");

    const { errors, rows } = parseAndValidateBatchCsv(csv);
    assert.equal(rows.length, 0);
    assert.ok(
      errors.some(
        (e) => e.row === 2 && e.field === "attendancePercent"
      )
    );
    assert.ok(
      errors.some(
        (e) => e.row === 3 && e.field === "candidateRef" && e.message.includes("Duplicate")
      )
    );
    assert.ok(errors.some((e) => e.row === 3 && e.field === "fullName"));
    assert.ok(errors.some((e) => e.row === 3 && e.field === "marksPercent"));
    assert.ok(errors.some((e) => e.row === 3 && e.field === "practicalPercent"));
  });
});
