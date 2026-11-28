import { prisma } from "../../config/database.js";
import { NotFoundError } from "../../utils/errors.js";
import { CERTIFICATE_STATUS } from "../certificates/certificates.service.js";
import type { CertificateVerificationDto } from "./verification.contracts.js";

export class VerificationService {
  async verifyByCode(
    verificationCode: string
  ): Promise<CertificateVerificationDto> {
    const certificate = await prisma.certificate.findUnique({
      where: { verificationCode },
      select: {
        verificationCode: true,
        status: true,
        issuedAt: true,
        revokedAt: true,
        batchCandidate: {
          select: {
            batch: {
              select: {
                course: {
                  select: {
                    name: true,
                  },
                },
                trainingCenter: {
                  select: {
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!certificate) {
      throw new NotFoundError("Certificate not found");
    }

    const isRevoked = certificate.status === CERTIFICATE_STATUS.REVOKED;

    return {
      verified: !isRevoked,
      status: isRevoked ? CERTIFICATE_STATUS.REVOKED : CERTIFICATE_STATUS.ISSUED,
      verificationCode: certificate.verificationCode,
      issuedAt: certificate.issuedAt.toISOString(),
      course: certificate.batchCandidate.batch.course.name,
      trainingCentre: certificate.batchCandidate.batch.trainingCenter.name,
      ...(isRevoked && certificate.revokedAt
        ? { revokedAt: certificate.revokedAt.toISOString() }
        : {}),
    };
  }
}

export const verificationService = new VerificationService();
