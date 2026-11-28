import { z } from "zod";

export const isoDateTimeSchema = z.string().datetime();

export function createSuccessResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.literal(true),
    data: dataSchema,
  });
}
