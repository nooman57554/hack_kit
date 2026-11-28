import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database.js";
import { NotFoundError } from "../../utils/errors.js";
import { CERTIFICATE_STATUS } from "../certificates/certificates.service.js";
import type {
  BulkVerifyItemDto,
  CertificateVerificationDto,
} from "./verification.contracts.js";
import { VERIFICATION_CODE_FORMAT } from "./verification.schema.js";

const certificateVerificationSelect = {
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
} as const;

type CertificateVerificationRow = Prisma.CertificateGetPayload<{
  select: typeof certificateVerificationSelect;
}>;

export function toVerificationDto(
  certificate: CertificateVerificationRow
): CertificateVerificationDto {
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

export class VerificationService {
  async verifyByCode(
    verificationCode: string
  ): Promise<CertificateVerificationDto> {
    const certificate = await prisma.certificate.findUnique({
      where: { verificationCode },
      select: certificateVerificationSelect,
    });

    if (!certificate) {
      throw new NotFoundError("Certificate not found");
    }

    return toVerificationDto(certificate);
  }

  async verifyManyByCodes(
    verificationCodes: string[]
  ): Promise<BulkVerifyItemDto[]> {
    const canonicalCodes = Array.from(
      new Set(
        verificationCodes.filter((code) => VERIFICATION_CODE_FORMAT.test(code))
      )
    );

    const byCode = new Map<string, CertificateVerificationDto>();

    if (canonicalCodes.length > 0) {
      const certificates = await prisma.certificate.findMany({
        where: {
          verificationCode: {
            in: canonicalCodes,
          },
        },
        select: certificateVerificationSelect,
      });

      for (const certificate of certificates) {
        byCode.set(
          certificate.verificationCode,
          toVerificationDto(certificate)
        );
      }
    }

    return verificationCodes.map((submittedCode) => {
      const match = byCode.get(submittedCode);
      if (!match) {
        return {
          verificationCode: submittedCode,
          found: false as const,
        };
      }
      return {
        found: true as const,
        ...match,
      };
    });
  }
}

export const verificationService = new VerificationService();
