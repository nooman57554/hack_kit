import { z } from "zod";

export const VERIFICATION_CODE_FORMAT = /^SP-[A-F0-9]{8}-[A-F0-9]{8}$/;

export const verificationCodeParamsSchema = z.object({
  verificationCode: z
    .string()
    .min(1)
    .max(32)
    .regex(VERIFICATION_CODE_FORMAT),
});

export const bulkVerifyCertificatesSchema = z
  .object({
    verificationCodes: z
      .array(
        z
          .string()
          .trim()
          .min(1, "Verification code cannot be empty")
          .max(64, "Verification code must be at most 64 characters")
      )
      .min(1, "At least 1 verification code is required")
      .max(100, "Maximum 100 verification codes allowed per request"),
  })
  .strict();

export type BulkVerifyCertificatesInput = z.infer<
  typeof bulkVerifyCertificatesSchema
>;
