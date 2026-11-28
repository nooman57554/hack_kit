import { z } from "zod";
import {
  createSuccessResponseSchema,
  isoDateTimeSchema,
} from "../../utils/contracts.js";

export const certificateVerificationContractSchema = z
  .object({
    verified: z.boolean(),
    status: z.enum(["ISSUED", "REVOKED"]),
    verificationCode: z.string(),
    issuedAt: isoDateTimeSchema,
    course: z.string(),
    trainingCentre: z.string(),
    revokedAt: isoDateTimeSchema.optional(),
  })
  .strict();

export const verifyCertificateResponseSchema = createSuccessResponseSchema(
  certificateVerificationContractSchema
);

export const bulkVerifyFoundItemSchema = certificateVerificationContractSchema
  .extend({
    found: z.literal(true),
  })
  .strict();

export const bulkVerifyNotFoundItemSchema = z
  .object({
    verificationCode: z.string(),
    found: z.literal(false),
  })
  .strict();

export const bulkVerifyItemSchema = z.union([
  bulkVerifyFoundItemSchema,
  bulkVerifyNotFoundItemSchema,
]);

export const bulkVerifyCertificatesResponseSchema = createSuccessResponseSchema(
  z
    .object({
      results: z.array(bulkVerifyItemSchema),
    })
    .strict()
);

export type CertificateVerificationDto = z.infer<
  typeof certificateVerificationContractSchema
>;
export type BulkVerifyItemDto = z.infer<typeof bulkVerifyItemSchema>;
