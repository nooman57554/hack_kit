import { Request, Response } from "express";
import { PERMISSIONS } from "../../permissions/permission.registry.js";
import {
  getBatchReadScopeFromRequest,
  getCrossCenterActionScopeFromRequest,
} from "../../permissions/batch-scope.policy.js";
import { UnauthorizedError } from "../../utils/errors.js";
import { certificatesService } from "./certificates.service.js";

export class CertificatesController {
  issueCertificate = async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.id) {
      throw new UnauthorizedError("User is not authenticated");
    }

    getCrossCenterActionScopeFromRequest(req, PERMISSIONS.CERTIFICATES_ISSUE.key);
    const batchId = String(req.params.batchId);
    const batchCandidateId = String(req.params.batchCandidateId);

    const certificate = await certificatesService.issueCertificate(
      req.user.id,
      batchId,
      batchCandidateId
    );
    res.status(201).json({
      success: true,
      data: { certificate },
    });
  };

  downloadPdf = async (req: Request, res: Response): Promise<void> => {
    const scope = getBatchReadScopeFromRequest(req);
    const certificateId = String(req.params.certificateId);

    const { pdfBytes, filename } = await certificatesService.getCertificatePdf(
      certificateId,
      scope
    );

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.status(200).send(pdfBytes);
  };

  revokeCertificate = async (req: Request, res: Response): Promise<void> => {
    if (!req.user?.id) {
      throw new UnauthorizedError("User is not authenticated");
    }

    getCrossCenterActionScopeFromRequest(req, PERMISSIONS.CERTIFICATES_REVOKE.key);
    const certificateId = String(req.params.certificateId);
    const reason = String(req.body.reason);

    const certificate = await certificatesService.revokeCertificate(
      req.user.id,
      certificateId,
      reason
    );
    res.status(200).json({
      success: true,
      data: { certificate },
    });
  };
}

export const certificatesController = new CertificatesController();
