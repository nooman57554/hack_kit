import { z } from "zod";

export const VERIFICATION_CODE_REGEX = /^SP-[A-F0-9]{8}-[A-F0-9]{8}$/;

export function normalizeVerificationCode(value: string): string {
  return value.trim().toUpperCase();
}

export const verifyCertificateSchema = z.object({
  verificationCode: z
    .string()
    .trim()
    .min(1, "Verification code is required")
    .max(32, "Verification code must be at most 32 characters")
    .regex(
      /^sp-[a-f0-9]{8}-[a-f0-9]{8}$/i,
      "Enter a code in the format SP-XXXXXXXX-XXXXXXXX"
    ),
});

export type VerifyCertificateFormValues = z.infer<typeof verifyCertificateSchema>;
