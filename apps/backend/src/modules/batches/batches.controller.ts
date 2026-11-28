import { Request, Response } from "express";
import { BadRequestError, UnauthorizedError } from "../../utils/errors.js";
import { batchesService } from "./batches.service.js";

export class BatchesController {
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

    const courseId = String(req.query.courseId);
    const rawCsv = typeof req.body === "string" ? req.body : "";

    const batch = await batchesService.importBatch(req.user.id, courseId, rawCsv);
    res.status(201).json({
      success: true,
      data: { batch },
    });
  };

  getBatchById = async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.id) {
      throw new UnauthorizedError("User is not authenticated");
    }

    const batchId = String(req.params.batchId);
    const batch = await batchesService.getBatchById(req.user.id, batchId);
    res.status(200).json({
      success: true,
      data: { batch },
    });
  };
}

export const batchesController = new BatchesController();
