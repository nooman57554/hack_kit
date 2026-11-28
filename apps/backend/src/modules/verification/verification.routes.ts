import { Router } from "express";
import { authenticatePartnerKey } from "../../middleware/partner-key.middleware.js";
import { PARTNER_KEY_SCOPES } from "../partner-keys/partner-keys.crypto.js";
import { verificationController } from "./verification.controller.js";
import {
  partnerVerifyRateLimiter,
  publicVerifyRateLimiter,
} from "./verification.limiter.js";

export const publicVerificationRouter = Router();

publicVerificationRouter.get(
  "/:verificationCode",
  publicVerifyRateLimiter,
  verificationController.verifyPublic
);

export const partnerVerificationRouter = Router();

partnerVerificationRouter.get(
  "/verify/:verificationCode",
  partnerVerifyRateLimiter,
  authenticatePartnerKey(PARTNER_KEY_SCOPES.CERTIFICATES_VERIFY),
  verificationController.verifyPartner
);
