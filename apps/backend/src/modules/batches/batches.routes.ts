import express, { NextFunction, Request, Response, Router } from "express";
import { authenticate } from "../../middleware/auth.middleware.js";
import { requirePermission } from "../../middleware/permission.middleware.js";
import {
  validateParams,
  validateQuery,
} from "../../middleware/validate.middleware.js";
import { PERMISSIONS } from "../../permissions/permission.registry.js";
import { BadRequestError } from "../../utils/errors.js";
import { batchesController } from "./batches.controller.js";
import {
  batchIdParamsSchema,
  importBatchQuerySchema,
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

export default batchesRouter;
