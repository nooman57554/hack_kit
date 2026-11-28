import { z } from "zod";
import { PARTNER_KEY_SCOPES } from "./partner-keys.crypto.js";

export const createPartnerKeySchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Key name is required")
      .max(100, "Key name must be at most 100 characters"),
    scopes: z
      .array(z.enum([PARTNER_KEY_SCOPES.CERTIFICATES_VERIFY]))
      .min(1, "At least one scope is required")
      .default([PARTNER_KEY_SCOPES.CERTIFICATES_VERIFY])
      .transform((scopes) => Array.from(new Set(scopes))),
    expiresAt: z
      .string()
      .datetime({ offset: true, message: "expiresAt must be an ISO-8601 datetime" })
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.expiresAt !== undefined) {
      const expiresAtMs = new Date(data.expiresAt).getTime();
      if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["expiresAt"],
          message: "expiresAt must be in the future",
        });
      }
    }
  });

export const partnerKeyIdParamsSchema = z.object({
  keyId: z.string().uuid("Invalid partner key ID"),
});

export type CreatePartnerKeyInput = z.infer<typeof createPartnerKeySchema>;
