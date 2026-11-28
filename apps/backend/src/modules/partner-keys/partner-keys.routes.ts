import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";
import {
  validateBody,
  validateParams,
} from "../../middleware/validate.middleware.js";
import { PERMISSIONS } from "../../permissions/permission.registry.js";
import { partnerKeysController } from "./partner-keys.controller.js";
import {
  createPartnerKeySchema,
  partnerKeyIdParamsSchema,
} from "./partner-keys.schema.js";

const partnerKeysRouter = Router();

partnerKeysRouter.post(
  "/",
  authenticate,
  requirePermission(PERMISSIONS.PARTNER_KEYS_MANAGE.key),
  validateBody(createPartnerKeySchema),
  partnerKeysController.create
);

partnerKeysRouter.get(
  "/",
  authenticate,
  requirePermission(PERMISSIONS.PARTNER_KEYS_READ.key),
  partnerKeysController.list
);

partnerKeysRouter.post(
  "/:keyId/revoke",
  authenticate,
  requirePermission(PERMISSIONS.PARTNER_KEYS_MANAGE.key),
  validateParams(partnerKeyIdParamsSchema),
  partnerKeysController.revoke
);

export default partnerKeysRouter;
