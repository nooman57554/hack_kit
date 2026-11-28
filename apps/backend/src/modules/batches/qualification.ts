export const QUALIFICATION_REASON_CODES = {
  ATTENDANCE_BELOW_MINIMUM: "ATTENDANCE_BELOW_MINIMUM",
  MARKS_BELOW_MINIMUM: "MARKS_BELOW_MINIMUM",
  PRACTICAL_MISSING: "PRACTICAL_MISSING",
  PRACTICAL_BELOW_MINIMUM: "PRACTICAL_BELOW_MINIMUM",
} as const;

export type QualificationReasonCode =
  (typeof QUALIFICATION_REASON_CODES)[keyof typeof QUALIFICATION_REASON_CODES];

export interface QualificationReason {
  code: QualificationReasonCode;
  message: string;
}

export interface QualificationRuleThresholds {
  minAttendancePercent: number;
  minMarksPercent: number;
  practicalRequired: boolean;
  minPracticalPercent: number | null;
}

export interface CandidateScores {
  attendancePercent: number;
  marksPercent: number;
  practicalPercent: number | null;
}

export interface QualificationResult {
  qualified: boolean;
  reasons: QualificationReason[];
}

export function evaluateCandidateQualification(
  scores: CandidateScores,
  rule: QualificationRuleThresholds
): QualificationResult {
  const reasons: QualificationReason[] = [];

  if (scores.attendancePercent < rule.minAttendancePercent) {
    reasons.push({
      code: QUALIFICATION_REASON_CODES.ATTENDANCE_BELOW_MINIMUM,
      message: `Attendance ${scores.attendancePercent}% is below minimum required ${rule.minAttendancePercent}%`,
    });
  }

  if (scores.marksPercent < rule.minMarksPercent) {
    reasons.push({
      code: QUALIFICATION_REASON_CODES.MARKS_BELOW_MINIMUM,
      message: `Marks ${scores.marksPercent}% is below minimum required ${rule.minMarksPercent}%`,
    });
  }

  if (rule.practicalRequired) {
    const requiredPractical = rule.minPracticalPercent ?? 0;
    if (scores.practicalPercent === null) {
      reasons.push({
        code: QUALIFICATION_REASON_CODES.PRACTICAL_MISSING,
        message: "Practical score is required by the course rule",
      });
    } else if (scores.practicalPercent < requiredPractical) {
      reasons.push({
        code: QUALIFICATION_REASON_CODES.PRACTICAL_BELOW_MINIMUM,
        message: `Practical ${scores.practicalPercent}% is below minimum required ${requiredPractical}%`,
      });
    }
  }

  return {
    qualified: reasons.length === 0,
    reasons,
  };
}
