import { Request, Response } from "express";
import { UnauthorizedError } from "../../utils/errors.js";
import { partnerKeysService } from "./partner-keys.service.js";
import type { CreatePartnerKeyInput } from "./partner-keys.schema.js";

export class PartnerKeysController {
  create = async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.id) {
      throw new UnauthorizedError("User is not authenticated");
    }

    const input = req.body as CreatePartnerKeyInput;
    const result = await partnerKeysService.createPartnerKey(req.user.id, input);

    res.status(201).json({
      success: true,
      data: result,
    });
  };

  list = async (_req: Request, res: Response): Promise<void> => {
    const partnerKeys = await partnerKeysService.listPartnerKeys();

    res.status(200).json({
      success: true,
      data: { partnerKeys },
    });
  };

  revoke = async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.id) {
      throw new UnauthorizedError("User is not authenticated");
    }

    const keyId = String(req.params.keyId);
    const partnerKey = await partnerKeysService.revokePartnerKey(req.user.id, keyId);

    res.status(200).json({
      success: true,
      data: { partnerKey },
    });
  };
}

export const partnerKeysController = new PartnerKeysController();
