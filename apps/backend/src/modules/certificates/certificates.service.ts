import { randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database.js";
import type { BatchReadScope } from "../../permissions/batch-scope.policy.js";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from "../../utils/errors.js";
import {
  BATCH_STATUS,
  CANDIDATE_REVIEW_STATUS,
} from "../batches/batches.service.js";
import {
  type CertificatePdfGenerator,
  generateCertificatePdf,
} from "./certificate.pdf.js";

export const CERTIFICATE_STATUS = {
  ISSUED: "ISSUED",
  REVOKED: "REVOKED",
} as const;

const certificateMetadataSelect = {
  id: true,
  batchCandidateId: true,
  verificationCode: true,
  status: true,
  issuedById: true,
  issuedAt: true,
  revokedById: true,
  revokedAt: true,
  revocationReason: true,
  createdAt: true,
  updatedAt: true,
} as const;

type CertificateMetadata = Prisma.CertificateGetPayload<{
  select: typeof certificateMetadataSelect;
}>;

export function generateVerificationCode(): string {
  const part1 = randomBytes(4).toString("hex").toUpperCase();
  const part2 = randomBytes(4).toString("hex").toUpperCase();
  return `SP-${part1}-${part2}`;
}

export class CertificatesService {
  private readonly pdfGenerator: CertificatePdfGenerator;

  constructor(pdfGenerator: CertificatePdfGenerator = generateCertificatePdf) {
    this.pdfGenerator = pdfGenerator;
  }

  async issueCertificate(
    actorId: string,
    batchId: string,
    batchCandidateId: string
  ): Promise<CertificateMetadata> {
    const entry = await prisma.batchCandidate.findUnique({
      where: { id: batchCandidateId },
      include: {
        batch: {
          include: {
            course: { select: { id: true, code: true, name: true } },
            trainingCenter: { select: { id: true, code: true, name: true } },
          },
        },
        certificate: {
          select: certificateMetadataSelect,
        },
      },
    });

    if (!entry || entry.batchId !== batchId) {
      throw new NotFoundError(
        "Batch candidate not found in the specified batch"
      );
    }

    if (entry.batch.status !== BATCH_STATUS.SUBMITTED) {
      throw new ConflictError(
        "Certificates can only be issued for submitted batches"
      );
    }

    if (!entry.qualified) {
      throw new ConflictError(
        "Certificates cannot be issued for unqualified candidates"
      );
    }

    if (entry.certificate) {
      if (entry.certificate.status === CERTIFICATE_STATUS.REVOKED) {
        throw new ConflictError(
          "A revoked certificate cannot be reissued for this batch candidate"
        );
      }
      return entry.certificate;
    }

    if (entry.reviewStatus !== CANDIDATE_REVIEW_STATUS.APPROVED) {
      throw new ConflictError(
        "Candidate must be APPROVED before issuing a certificate"
      );
    }

    const certificateId = randomUUID();
    const verificationCode = generateVerificationCode();
    const issuedAt = new Date();

    // Generate PDF before opening the DB write transaction; failure aborts before any writes
    const pdfBuffer = await this.pdfGenerator({
      certificateId,
      verificationCode,
      candidateName: entry.fullNameSnapshot,
      candidateRef: entry.candidateRefSnapshot,
      courseName: entry.batch.course.name,
      courseCode: entry.batch.course.code,
      trainingCenterName: entry.batch.trainingCenter.name,
      issuedAt,
    });

    try {
      return await prisma.$transaction(async (tx) => {
        const freshEntry = await tx.batchCandidate.findUnique({
          where: { id: batchCandidateId },
          include: {
            batch: true,
            certificate: {
              select: certificateMetadataSelect,
            },
          },
        });

        if (!freshEntry || freshEntry.batchId !== batchId) {
          throw new NotFoundError(
            "Batch candidate not found in the specified batch"
          );
        }

        if (freshEntry.batch.status !== BATCH_STATUS.SUBMITTED) {
          throw new ConflictError(
            "Certificates can only be issued for submitted batches"
          );
        }

        if (!freshEntry.qualified) {
          throw new ConflictError(
            "Certificates cannot be issued for unqualified candidates"
          );
        }

        if (freshEntry.certificate) {
          if (freshEntry.certificate.status === CERTIFICATE_STATUS.REVOKED) {
            throw new ConflictError(
              "A revoked certificate cannot be reissued for this batch candidate"
            );
          }
          return freshEntry.certificate;
        }

        if (freshEntry.reviewStatus !== CANDIDATE_REVIEW_STATUS.APPROVED) {
          throw new ConflictError(
            "Candidate must be APPROVED before issuing a certificate"
          );
        }

        const certificate = await tx.certificate.create({
          data: {
            id: certificateId,
            batchCandidateId,
            verificationCode,
            status: CERTIFICATE_STATUS.ISSUED,
            issuedById: actorId,
            issuedAt,
            pdfBytes: new Uint8Array(pdfBuffer),
          },
          select: certificateMetadataSelect,
        });

        await tx.auditLog.create({
          data: {
            actorId,
            action: "CERTIFICATE_ISSUED",
            entityType: "CERTIFICATE",
            entityId: certificate.id,
            details: {
              batchId,
              batchCandidateId,
              candidateId: freshEntry.candidateId,
              verificationCode: certificate.verificationCode,
            },
          },
        });

        await tx.outboxEvent.create({
          data: {
            eventType: "CERTIFICATE_ISSUED",
            aggregateId: certificate.id,
            payload: {
              certificateId: certificate.id,
              batchId,
              batchCandidateId,
              candidateId: freshEntry.candidateId,
              verificationCode: certificate.verificationCode,
              status: certificate.status,
              issuedById: actorId,
              issuedAt: certificate.issuedAt.toISOString(),
            },
          },
        });

        return certificate;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existing = await prisma.certificate.findUnique({
          where: { batchCandidateId },
          select: certificateMetadataSelect,
        });

        if (existing) {
          if (existing.status === CERTIFICATE_STATUS.REVOKED) {
            throw new ConflictError(
              "A revoked certificate cannot be reissued for this batch candidate"
            );
          }
          return existing;
        }
      }
      throw error;
    }
  }

  async getCertificatePdf(
    certificateId: string,
    scope: BatchReadScope
  ): Promise<{ pdfBytes: Buffer; filename: string }> {
    const certificate = await prisma.certificate.findUnique({
      where: { id: certificateId },
      select: {
        id: true,
        verificationCode: true,
        pdfBytes: true,
        batchCandidate: {
          select: {
            batch: {
              select: {
                trainingCenterId: true,
              },
            },
          },
        },
      },
    });

    if (!certificate) {
      throw new NotFoundError("Certificate not found");
    }

    if (
      !scope.crossCenter &&
      certificate.batchCandidate.batch.trainingCenterId !== scope.trainingCenterId
    ) {
      throw new ForbiddenError(
        "You can only download certificates belonging to your training centre"
      );
    }

    const safeCode = certificate.verificationCode.replace(/[^A-Za-z0-9_-]/g, "");
    return {
      pdfBytes: Buffer.from(certificate.pdfBytes),
      filename: `certificate-${safeCode}.pdf`,
    };
  }

  async revokeCertificate(
    actorId: string,
    certificateId: string,
    reason: string
  ): Promise<CertificateMetadata> {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.certificate.findUnique({
        where: { id: certificateId },
        select: {
          ...certificateMetadataSelect,
          batchCandidate: {
            select: {
              batchId: true,
              candidateId: true,
            },
          },
        },
      });

      if (!existing) {
        throw new NotFoundError("Certificate not found");
      }

      // Repeated revocation returns original revocation details without writing duplicate events
      if (existing.status === CERTIFICATE_STATUS.REVOKED) {
        const { batchCandidate: _ignored, ...metadata } = existing;
        return metadata;
      }

      const revokedAt = new Date();
      const updated = await tx.certificate.updateMany({
        where: {
          id: certificateId,
          status: CERTIFICATE_STATUS.ISSUED,
        },
        data: {
          status: CERTIFICATE_STATUS.REVOKED,
          revokedById: actorId,
          revokedAt,
          revocationReason: reason,
        },
      });

      if (updated.count === 0) {
        const current = await tx.certificate.findUniqueOrThrow({
          where: { id: certificateId },
          select: certificateMetadataSelect,
        });
        if (current.status === CERTIFICATE_STATUS.REVOKED) {
          return current;
        }
        throw new ConflictError("Certificate could not be revoked in its current state");
      }

      const certificate = await tx.certificate.findUniqueOrThrow({
        where: { id: certificateId },
        select: certificateMetadataSelect,
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: "CERTIFICATE_REVOKED",
          entityType: "CERTIFICATE",
          entityId: certificate.id,
          details: {
            batchId: existing.batchCandidate.batchId,
            batchCandidateId: existing.batchCandidateId,
            candidateId: existing.batchCandidate.candidateId,
            verificationCode: certificate.verificationCode,
            reason,
          },
        },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: "CERTIFICATE_REVOKED",
          aggregateId: certificate.id,
          payload: {
            certificateId: certificate.id,
            batchId: existing.batchCandidate.batchId,
            batchCandidateId: existing.batchCandidateId,
            candidateId: existing.batchCandidate.candidateId,
            verificationCode: certificate.verificationCode,
            status: certificate.status,
            revokedById: actorId,
            revokedAt: certificate.revokedAt?.toISOString() ?? revokedAt.toISOString(),
            revocationReason: certificate.revocationReason,
          },
        },
      });

      return certificate;
    });
  }
}

export const certificatesService = new CertificatesService();
