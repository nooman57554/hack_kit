import { rateLimit } from "express-rate-limit";
import { env } from "../../config/env.js";

export function createPublicVerifyRateLimiter(
  limit: number = env.PUBLIC_VERIFY_RATE_LIMIT_MAX
) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        error: {
          message: "Too many verification requests. Please try again later.",
        },
      });
    },
  });
}

export function createPartnerVerifyRateLimiter(
  limit: number = env.PARTNER_VERIFY_RATE_LIMIT_MAX
) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        error: {
          message: "Too many partner API requests. Please try again later.",
        },
      });
    },
  });
}

export const publicVerifyRateLimiter = createPublicVerifyRateLimiter();
export const partnerVerifyRateLimiter = createPartnerVerifyRateLimiter();
