import { z } from "zod";
import {
  createSuccessResponseSchema,
  isoDateTimeSchema,
} from "../../utils/contracts.js";
import { QUALIFICATION_REASON_CODES } from "./qualification.js";

export const qualificationReasonContractSchema = z.object({
  code: z.enum([
    QUALIFICATION_REASON_CODES.ATTENDANCE_BELOW_MINIMUM,
    QUALIFICATION_REASON_CODES.MARKS_BELOW_MINIMUM,
    QUALIFICATION_REASON_CODES.PRACTICAL_MISSING,
    QUALIFICATION_REASON_CODES.PRACTICAL_BELOW_MINIMUM,
  ]),
  message: z.string(),
});

export const batchCandidateContractSchema = z.object({
  id: z.string().uuid(),
  candidateId: z.string().uuid(),
  candidateRef: z.string(),
  fullName: z.string(),
  phone: z.string(),
  attendancePercent: z.number().min(0).max(100),
  marksPercent: z.number().min(0).max(100),
  practicalPercent: z.number().min(0).max(100).nullable(),
  qualified: z.boolean(),
  qualificationReasons: z.array(qualificationReasonContractSchema),
});

export const batchDetailContractSchema = z.object({
  id: z.string().uuid(),
  trainingCenterId: z.string().uuid(),
  courseId: z.string().uuid(),
  ruleVersionId: z.string().uuid(),
  status: z.string(),
  createdById: z.string().uuid(),
  createdAt: isoDateTimeSchema,
  submittedAt: isoDateTimeSchema.nullable(),
  trainingCenter: z.object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
    districtId: z.string().uuid(),
  }),
  course: z.object({
    id: z.string().uuid(),
    code: z.string(),
    name: z.string(),
  }),
  ruleVersion: z.object({
    id: z.string().uuid(),
    version: z.number().int().positive(),
    minAttendancePercent: z.number().min(0).max(100),
    minMarksPercent: z.number().min(0).max(100),
    practicalRequired: z.boolean(),
    minPracticalPercent: z.number().min(0).max(100).nullable(),
    createdAt: isoDateTimeSchema,
  }),
  candidates: z.array(batchCandidateContractSchema),
});

// POST /api/batches/import and GET /api/batches/:batchId
export const batchResponseSchema = createSuccessResponseSchema(
  z.object({
    batch: batchDetailContractSchema,
  })
);

export type QualificationReasonDto = z.infer<typeof qualificationReasonContractSchema>;
export type BatchCandidateDto = z.infer<typeof batchCandidateContractSchema>;
export type BatchDetailDto = z.infer<typeof batchDetailContractSchema>;
export type BatchResponse = z.infer<typeof batchResponseSchema>;
