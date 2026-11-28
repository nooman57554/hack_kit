import { NextFunction, Request, Response } from "express";
import {
  PARTNER_KEY_SCOPES,
  type PartnerKeyScope,
} from "../modules/partner-keys/partner-keys.crypto.js";
import {
  PartnerKeysService,
  partnerKeysService,
} from "../modules/partner-keys/partner-keys.service.js";
import { UnauthorizedError } from "../utils/errors.js";

export function authenticatePartnerKey(
  requiredScope: PartnerKeyScope = PARTNER_KEY_SCOPES.CERTIFICATES_VERIFY,
  service: PartnerKeysService = partnerKeysService
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const headerValue = req.headers["x-api-key"];
      if (typeof headerValue !== "string" || !headerValue.trim() || /\s/.test(headerValue)) {
        return next(new UnauthorizedError("Invalid partner API key"));
      }

      const authenticatedKey = await service.authenticateRawKey(
        headerValue,
        requiredScope
      );
      req.partnerKey = authenticatedKey;
      next();
    } catch (error) {
      next(error);
    }
  };
}
