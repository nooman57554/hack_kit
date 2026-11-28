import express, { NextFunction, Request, Response, Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";
import {
  validateBody,
  validateParams,
  validateQuery,
} from "../../middleware/validate.middleware.js";
import { PERMISSIONS } from "../../permissions/permission.registry.js";
import { BadRequestError } from "../../utils/errors.js";
import { certificatesController } from "../certificates/certificates.controller.js";
import { batchesController } from "./batches.controller.js";
import {
  batchCandidateParamsSchema,
  batchIdParamsSchema,
  importBatchQuerySchema,
  listBatchesQuerySchema,
  reviewCandidateSchema,
} from "./batches.schema.js";

function requireCsvContentType(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (!req.is("text/csv")) {
    return next(new BadRequestError("Content-Type must be text/csv"));
  }
  next();
}

const batchesRouter = Router();

batchesRouter.get(
  "/",
  authenticate,
  requirePermission(PERMISSIONS.BATCHES_READ.key),
  validateQuery(listBatchesQuerySchema),
  batchesController.listBatches
);

batchesRouter.post(
  "/import",
  authenticate,
  requirePermission(PERMISSIONS.BATCHES_IMPORT.key),
  validateQuery(importBatchQuerySchema),
  requireCsvContentType,
  express.text({ type: "text/csv", limit: "5mb" }),
  batchesController.importBatch
);

batchesRouter.get(
  "/:batchId",
  authenticate,
  requirePermission(PERMISSIONS.BATCHES_READ.key),
  validateParams(batchIdParamsSchema),
  batchesController.getBatchById
);

batchesRouter.post(
  "/:batchId/submit",
  authenticate,
  requirePermission(PERMISSIONS.BATCHES_SUBMIT.key),
  validateParams(batchIdParamsSchema),
  batchesController.submitBatch
);

batchesRouter.patch(
  "/:batchId/candidates/:batchCandidateId/review",
  authenticate,
  requirePermission(PERMISSIONS.CANDIDATES_REVIEW.key),
  validateParams(batchCandidateParamsSchema),
  validateBody(reviewCandidateSchema),
  batchesController.reviewCandidate
);

batchesRouter.post(
  "/:batchId/candidates/:batchCandidateId/certificate",
  authenticate,
  requirePermission(PERMISSIONS.CERTIFICATES_ISSUE.key),
  validateParams(batchCandidateParamsSchema),
  certificatesController.issueCertificate
);

export default batchesRouter;
