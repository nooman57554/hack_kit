import { z } from "zod";

const MAX_BCRYPT_BYTES = 72;

const isWithinBcryptByteLimit = (password: string): boolean =>
  Buffer.byteLength(password, "utf8") <= MAX_BCRYPT_BYTES;

const PASSWORD_MAX_BYTES_MESSAGE = `Password must not exceed ${MAX_BCRYPT_BYTES} UTF-8 bytes`;

export const registerSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(100, "Name must be at most 100 characters"),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Email must be at most 254 characters")
    .email("Invalid email format"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long")
    .refine(isWithinBcryptByteLimit, PASSWORD_MAX_BYTES_MESSAGE),
});

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, "Email must be at most 254 characters")
    .email("Invalid email format"),
  password: z
    .string()
    .min(1, "Password is required")
    .refine(isWithinBcryptByteLimit, PASSWORD_MAX_BYTES_MESSAGE),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
