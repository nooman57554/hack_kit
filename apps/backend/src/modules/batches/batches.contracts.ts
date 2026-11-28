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

export const batchCandidateCertificateSummarySchema = z.object({
  id: z.string().uuid(),
  verificationCode: z.string(),
  status: z.enum(["ISSUED", "REVOKED"]),
  issuedAt: isoDateTimeSchema,
  revokedAt: isoDateTimeSchema.nullable(),
  revocationReason: z.string().nullable(),
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
  reviewStatus: z.enum(["PENDING", "APPROVED", "REJECTED"]),
  reviewedById: z.string().uuid().nullable(),
  reviewedAt: isoDateTimeSchema.nullable(),
  reviewReason: z.string().nullable(),
  certificate: batchCandidateCertificateSummarySchema.nullable(),
});

export const batchTrainingCenterSummarySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
  districtId: z.string().uuid(),
});

export const batchCourseSummarySchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  name: z.string(),
});

export const batchDetailContractSchema = z.object({
  id: z.string().uuid(),
  trainingCenterId: z.string().uuid(),
  courseId: z.string().uuid(),
  ruleVersionId: z.string().uuid(),
  status: z.enum(["DRAFT", "SUBMITTED"]),
  createdById: z.string().uuid(),
  createdAt: isoDateTimeSchema,
  submittedAt: isoDateTimeSchema.nullable(),
  trainingCenter: batchTrainingCenterSummarySchema,
  course: batchCourseSummarySchema,
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

export const batchListItemContractSchema = z.object({
  id: z.string().uuid(),
  trainingCenterId: z.string().uuid(),
  courseId: z.string().uuid(),
  ruleVersionId: z.string().uuid(),
  status: z.enum(["DRAFT", "SUBMITTED"]),
  createdById: z.string().uuid(),
  createdAt: isoDateTimeSchema,
  submittedAt: isoDateTimeSchema.nullable(),
  trainingCenter: batchTrainingCenterSummarySchema,
  course: batchCourseSummarySchema,
  ruleVersion: z.object({
    id: z.string().uuid(),
    version: z.number().int().positive(),
  }),
  candidateCount: z.number().int().nonnegative(),
});

// POST /api/batches/import, POST /api/batches/:batchId/submit, and GET /api/batches/:batchId
export const batchResponseSchema = createSuccessResponseSchema(
  z.object({
    batch: batchDetailContractSchema,
  })
);

// GET /api/batches
export const listBatchesResponseSchema = createSuccessResponseSchema(
  z.object({
    batches: z.array(batchListItemContractSchema),
    pagination: z.object({
      page: z.number().int().positive(),
      limit: z.number().int().positive(),
      total: z.number().int().nonnegative(),
      totalPages: z.number().int().nonnegative(),
    }),
  })
);

// PATCH /api/batches/:batchId/candidates/:batchCandidateId/review
export const reviewCandidateResponseSchema = createSuccessResponseSchema(
  z.object({
    candidate: batchCandidateContractSchema,
  })
);

export type QualificationReasonDto = z.infer<typeof qualificationReasonContractSchema>;
export type BatchCandidateCertificateSummaryDto = z.infer<
  typeof batchCandidateCertificateSummarySchema
>;
export type BatchCandidateDto = z.infer<typeof batchCandidateContractSchema>;
export type BatchDetailDto = z.infer<typeof batchDetailContractSchema>;
export type BatchListItemDto = z.infer<typeof batchListItemContractSchema>;
export type BatchResponse = z.infer<typeof batchResponseSchema>;
export type ListBatchesResponse = z.infer<typeof listBatchesResponseSchema>;
export type ReviewCandidateResponse = z.infer<typeof reviewCandidateResponseSchema>;
