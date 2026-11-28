import { Request } from "express";
import { ipKeyGenerator, rateLimit } from "express-rate-limit";
import { env } from "../../config/env.js";

function partnerRateLimitKey(req: Request): string {
  if (req.partnerKey?.id) {
    return `partner-key:${req.partnerKey.id}`;
  }
  return `partner-ip:${ipKeyGenerator(req.ip ?? "127.0.0.1")}`;
}

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
    keyGenerator: partnerRateLimitKey,
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

export function createBulkPartnerVerifyRateLimiter(
  limit: number = env.PARTNER_BULK_VERIFY_RATE_LIMIT_MAX
) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: partnerRateLimitKey,
    handler: (_req, res) => {
      res.status(429).json({
        success: false,
        error: {
          message:
            "Too many bulk verification requests for this partner API key. Please try again later.",
        },
      });
    },
  });
}

export const publicVerifyRateLimiter = createPublicVerifyRateLimiter();
export const partnerVerifyRateLimiter = createPartnerVerifyRateLimiter();
export const partnerBulkVerifyRateLimiter = createBulkPartnerVerifyRateLimiter();
