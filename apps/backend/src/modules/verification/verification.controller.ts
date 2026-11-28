import { Request, Response } from "express";
import { NotFoundError } from "../../utils/errors.js";
import { verificationCodeParamsSchema } from "./verification.schema.js";
import { verificationService } from "./verification.service.js";

function setNoStoreHeaders(res: Response): void {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
}

export class VerificationController {
  private async handleVerify(req: Request, res: Response): Promise<void> {
    setNoStoreHeaders(res);

    const parsed = verificationCodeParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      throw new NotFoundError("Certificate not found");
    }

    const result = await verificationService.verifyByCode(
      parsed.data.verificationCode
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  }

  verifyPublic = async (req: Request, res: Response): Promise<void> => {
    await this.handleVerify(req, res);
  };

  verifyPartner = async (req: Request, res: Response): Promise<void> => {
    await this.handleVerify(req, res);
  };
}

export const verificationController = new VerificationController();
