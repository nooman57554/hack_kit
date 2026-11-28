import { Request, Response } from "express";
import { PERMISSIONS } from "../../permissions/permission.registry.js";
import {
  getBatchImportCenterIdFromRequest,
  getBatchReadScopeFromRequest,
  getBatchSubmitCenterIdFromRequest,
  getCrossCenterActionScopeFromRequest,
} from "../../permissions/batch-scope.policy.js";
import { BadRequestError, UnauthorizedError } from "../../utils/errors.js";
import { listBatchesQuerySchema } from "./batches.schema.js";
import { batchesService } from "./batches.service.js";

export class BatchesController {
  listBatches = async (req: Request, res: Response): Promise<void> => {
    const scope = getBatchReadScopeFromRequest(req);
    const query = listBatchesQuerySchema.parse(req.query);
    const result = await batchesService.listBatches(scope, query);
    res.status(200).json({
      success: true,
      data: result,
    });
  };

  importBatch = async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.id) {
      throw new UnauthorizedError("User is not authenticated");
    }

    if (
      req.query.ruleVersionId !== undefined ||
      req.headers["x-rule-version-id"] !== undefined ||
      req.headers["ruleversionid"] !== undefined
    ) {
      throw new BadRequestError(
        "ruleVersionId must not be provided; the course's current rule version is captured automatically"
      );
    }

    const trainingCenterId = getBatchImportCenterIdFromRequest(req);
    const courseId = String(req.query.courseId);
    const rawCsv = typeof req.body === "string" ? req.body : "";

    const batch = await batchesService.importBatch(
      req.user.id,
      trainingCenterId,
      courseId,
      rawCsv
    );
    res.status(201).json({
      success: true,
      data: { batch },
    });
  };

  submitBatch = async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.id) {
      throw new UnauthorizedError("User is not authenticated");
    }

    const trainingCenterId = getBatchSubmitCenterIdFromRequest(req);
    const batchId = String(req.params.batchId);

    const batch = await batchesService.submitBatch(
      req.user.id,
      trainingCenterId,
      batchId
    );
    res.status(200).json({
      success: true,
      data: { batch },
    });
  };

  reviewCandidate = async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.id) {
      throw new UnauthorizedError("User is not authenticated");
    }

    getCrossCenterActionScopeFromRequest(req, PERMISSIONS.CANDIDATES_REVIEW.key);
    const batchId = String(req.params.batchId);
    const batchCandidateId = String(req.params.batchCandidateId);

    const candidate = await batchesService.reviewBatchCandidate(
      req.user.id,
      batchId,
      batchCandidateId,
      req.body
    );
    res.status(200).json({
      success: true,
      data: { candidate },
    });
  };

  getBatchById = async (req: Request, res: Response): Promise<void> => {
    const scope = getBatchReadScopeFromRequest(req);
    const batchId = String(req.params.batchId);
    const batch = await batchesService.getBatchById(batchId, scope);
    res.status(200).json({
      success: true,
      data: { batch },
    });
  };
}

export const batchesController = new BatchesController();
