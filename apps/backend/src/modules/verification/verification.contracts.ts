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

export type CertificateVerificationDto = z.infer<
  typeof certificateVerificationContractSchema
>;
