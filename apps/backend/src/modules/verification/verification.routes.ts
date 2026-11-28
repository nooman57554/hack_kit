import { Router } from "express";
import { authenticatePartnerKey } from "../../middleware/partner-key.middleware.js";
import { validateBody } from "../../middleware/validate.middleware.js";
import { PARTNER_KEY_SCOPES } from "../partner-keys/partner-keys.crypto.js";
import { verificationController } from "./verification.controller.js";
import {
  partnerBulkVerifyRateLimiter,
  partnerVerifyRateLimiter,
  publicVerifyRateLimiter,
} from "./verification.limiter.js";
import { bulkVerifyCertificatesSchema } from "./verification.schema.js";

export const publicVerificationRouter = Router();

publicVerificationRouter.get(
  "/:verificationCode",
  publicVerifyRateLimiter,
  verificationController.verifyPublic
);

export const partnerVerificationRouter = Router();

partnerVerificationRouter.get(
  "/verify/:verificationCode",
  authenticatePartnerKey(PARTNER_KEY_SCOPES.CERTIFICATES_VERIFY),
  partnerVerifyRateLimiter,
  verificationController.verifyPartner
);

partnerVerificationRouter.post(
  "/verify-bulk",
  authenticatePartnerKey(PARTNER_KEY_SCOPES.CERTIFICATES_VERIFY),
  partnerBulkVerifyRateLimiter,
  validateBody(bulkVerifyCertificatesSchema),
  verificationController.verifyBulk
);
