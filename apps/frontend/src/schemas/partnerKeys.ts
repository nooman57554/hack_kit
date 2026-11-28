import { z } from "zod";

export const createPartnerKeyFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Key name is required")
    .max(100, "Key name must be at most 100 characters"),
  expiresAtLocal: z
    .string()
    .optional()
    .refine(
      (value) => {
        if (!value || !value.trim()) {
          return true;
        }
        const parsed = new Date(value);
        return !Number.isNaN(parsed.getTime()) && parsed.getTime() > Date.now();
      },
      { message: "Expiry date/time must be in the future" }
    ),
});

export type CreatePartnerKeyFormValues = z.infer<
  typeof createPartnerKeyFormSchema
>;
