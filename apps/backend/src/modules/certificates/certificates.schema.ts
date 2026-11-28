import { z } from "zod";

export const certificateIdParamsSchema = z.object({
  certificateId: z.string().uuid("certificateId must be a valid UUID"),
});

export const revokeCertificateSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "Revocation reason is required")
    .max(500, "Revocation reason must be at most 500 characters"),
});

export type RevokeCertificateInput = z.infer<typeof revokeCertificateSchema>;
