import { z } from "zod";

export const VERIFICATION_CODE_FORMAT = /^SP-[A-F0-9]{8}-[A-F0-9]{8}$/;

export const verificationCodeParamsSchema = z.object({
  verificationCode: z
    .string()
    .min(1)
    .max(32)
    .regex(VERIFICATION_CODE_FORMAT),
});
