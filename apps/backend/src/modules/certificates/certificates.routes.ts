import { Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";
import {
  validateBody,
  validateParams,
} from "../../middleware/validate.middleware.js";
import { PERMISSIONS } from "../../permissions/permission.registry.js";
import { certificatesController } from "./certificates.controller.js";
import {
  certificateIdParamsSchema,
  revokeCertificateSchema,
} from "./certificates.schema.js";

const certificatesRouter = Router();

certificatesRouter.get(
  "/:certificateId/pdf",
  authenticate,
  requirePermission(PERMISSIONS.BATCHES_READ.key),
  validateParams(certificateIdParamsSchema),
  certificatesController.downloadPdf
);

certificatesRouter.post(
  "/:certificateId/revoke",
  authenticate,
  requirePermission(PERMISSIONS.CERTIFICATES_REVOKE.key),
  validateParams(certificateIdParamsSchema),
  validateBody(revokeCertificateSchema),
  certificatesController.revokeCertificate
);

export default certificatesRouter;
