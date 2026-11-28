import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database.js";
import type { BatchReadScope } from "../../permissions/batch-scope.policy.js";
import {
  AppError,
  BadRequestError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../../utils/errors.js";
import {
  CsvValidationError,
  ListBatchesQuery,
  ReviewCandidateInput,
  parseAndValidateBatchCsv,
} from "./batches.schema.js";
import { evaluateCandidateQualification } from "./qualification.js";

export const BATCH_STATUS = {
  DRAFT: "DRAFT",
  SUBMITTED: "SUBMITTED",
} as const;

export const CANDIDATE_REVIEW_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
} as const;

const batchCandidateSelect = {
  id: true,
  candidateId: true,
  candidateRefSnapshot: true,
  fullNameSnapshot: true,
  phoneSnapshot: true,
  attendancePercent: true,
  marksPercent: true,
  practicalPercent: true,
  qualified: true,
  qualificationReasons: true,
  reviewStatus: true,
  reviewedById: true,
  reviewedAt: true,
  reviewReason: true,
  certificate: {
    select: {
      id: true,
      verificationCode: true,
      status: true,
      issuedAt: true,
      revokedAt: true,
      revocationReason: true,
    },
  },
} as const;

const batchInclude = {
  trainingCenter: {
    select: {
      id: true,
      code: true,
      name: true,
      districtId: true,
    },
  },
  course: {
    select: {
      id: true,
      code: true,
      name: true,
    },
  },
  ruleVersion: {
    select: {
      id: true,
      version: true,
      minAttendancePercent: true,
      minMarksPercent: true,
      practicalRequired: true,
      minPracticalPercent: true,
      createdAt: true,
    },
  },
  candidates: {
    orderBy: {
      candidateRefSnapshot: "asc" as const,
    },
    select: batchCandidateSelect,
  },
} as const;

type BatchCandidateRow = Prisma.BatchCandidateGetPayload<{
  select: typeof batchCandidateSelect;
}>;

type BatchWithDetails = Prisma.BatchGetPayload<{ include: typeof batchInclude }>;

function formatBatchCandidate(entry: BatchCandidateRow) {
  return {
    id: entry.id,
    candidateId: entry.candidateId,
    candidateRef: entry.candidateRefSnapshot,
    fullName: entry.fullNameSnapshot,
    phone: entry.phoneSnapshot,
    attendancePercent: entry.attendancePercent,
    marksPercent: entry.marksPercent,
    practicalPercent: entry.practicalPercent,
    qualified: entry.qualified,
    qualificationReasons: entry.qualificationReasons,
    reviewStatus: entry.reviewStatus,
    reviewedById: entry.reviewedById,
    reviewedAt: entry.reviewedAt,
    reviewReason: entry.reviewReason,
    certificate: entry.certificate,
  };
}

export function formatBatchResponse(batch: BatchWithDetails) {
  return {
    id: batch.id,
    trainingCenterId: batch.trainingCenterId,
    courseId: batch.courseId,
    ruleVersionId: batch.ruleVersionId,
    status: batch.status,
    createdById: batch.createdById,
    createdAt: batch.createdAt,
    submittedAt: batch.submittedAt,
    trainingCenter: batch.trainingCenter,
    course: batch.course,
    ruleVersion: batch.ruleVersion,
    candidates: batch.candidates.map(formatBatchCandidate),
  };
}

export class BatchesService {
  async listBatches(scope: BatchReadScope, query: ListBatchesQuery) {
    const where: Prisma.BatchWhereInput = scope.crossCenter
      ? {}
      : { trainingCenterId: scope.trainingCenterId };

    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
      prisma.batch.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: query.limit,
        select: {
          id: true,
          trainingCenterId: true,
          courseId: true,
          ruleVersionId: true,
          status: true,
          createdById: true,
          createdAt: true,
          submittedAt: true,
          trainingCenter: {
            select: {
              id: true,
              code: true,
              name: true,
              districtId: true,
            },
          },
          course: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          ruleVersion: {
            select: {
              id: true,
              version: true,
            },
          },
          _count: {
            select: {
              candidates: true,
            },
          },
        },
      }),
      prisma.batch.count({ where }),
    ]);

    return {
      batches: items.map(({ _count, ...batch }) => ({
        ...batch,
        candidateCount: _count.candidates,
      })),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      },
    };
  }

  async importBatch(
    actorId: string,
    trainingCenterId: string,
    courseId: string,
    rawCsv: string
  ) {
    // 1. Parse and validate entire CSV before opening a write transaction
    const { errors, rows } = parseAndValidateBatchCsv(rawCsv);
    if (errors.length > 0) {
      throw new BadRequestError("CSV validation failed", errors);
    }

    return prisma.$transaction(async (tx) => {
      // 2. Verify authenticated user's centre scope against the authorized scope
      const actor = await tx.user.findUnique({
        where: { id: actorId },
        select: {
          id: true,
          districtId: true,
          trainingCenterId: true,
        },
      });

      if (!actor) {
        throw new UnauthorizedError("Authenticated user no longer exists");
      }

      if (
        actor.districtId !== null ||
        actor.trainingCenterId === null ||
        actor.trainingCenterId !== trainingCenterId
      ) {
        throw new ForbiddenError(
          "Only Training Centre users with an assigned centre scope can import batches"
        );
      }

      // 3. Lock the course row (FOR SHARE) to read one consistent, committed currentRuleVersionId
      const lockedCourses = await tx.$queryRaw<
        Array<{ id: string; currentRuleVersionId: string | null }>
      >`
        SELECT id, "currentRuleVersionId" FROM "courses" WHERE id = ${courseId} FOR SHARE
      `;

      if (lockedCourses.length === 0) {
        throw new NotFoundError("Course not found");
      }

      const currentRuleVersionId = lockedCourses[0].currentRuleVersionId;
      if (!currentRuleVersionId) {
        throw new BadRequestError(
          "Course does not have an active qualifying rule version"
        );
      }

      const ruleVersion = await tx.courseRuleVersion.findUnique({
        where: { id: currentRuleVersionId },
      });

      if (!ruleVersion || ruleVersion.courseId !== courseId) {
        throw new AppError("Course rule version reference is inconsistent", 500);
      }

      // 4. Enforce practical score presence when the captured rule requires it
      if (ruleVersion.practicalRequired) {
        const missingPracticalErrors: CsvValidationError[] = [];
        for (const row of rows) {
          if (row.practicalPercent === null) {
            missingPracticalErrors.push({
              row: row.row,
              field: "practicalPercent",
              message: "practicalPercent is required by the course rule",
            });
          }
        }
        if (missingPracticalErrors.length > 0) {
          throw new BadRequestError("CSV validation failed", missingPracticalErrors);
        }
      }

      // 5. Create batch in DRAFT state capturing the active ruleVersionId
      const batch = await tx.batch.create({
        data: {
          trainingCenterId,
          courseId,
          ruleVersionId: ruleVersion.id,
          status: BATCH_STATUS.DRAFT,
          createdById: actor.id,
        },
      });

      // 6. Upsert candidates and create BatchCandidate records with immutable CSV snapshots
      let qualifiedCount = 0;

      for (const row of rows) {
        const candidate = await tx.candidate.upsert({
          where: {
            trainingCenterId_candidateRef: {
              trainingCenterId,
              candidateRef: row.candidateRef,
            },
          },
          update: {
            fullName: row.fullName,
            phone: row.phone,
          },
          create: {
            trainingCenterId,
            candidateRef: row.candidateRef,
            fullName: row.fullName,
            phone: row.phone,
          },
        });

        const evaluation = evaluateCandidateQualification(
          {
            attendancePercent: row.attendancePercent,
            marksPercent: row.marksPercent,
            practicalPercent: row.practicalPercent,
          },
          {
            minAttendancePercent: ruleVersion.minAttendancePercent,
            minMarksPercent: ruleVersion.minMarksPercent,
            practicalRequired: ruleVersion.practicalRequired,
            minPracticalPercent: ruleVersion.minPracticalPercent,
          }
        );

        if (evaluation.qualified) {
          qualifiedCount++;
        }

        await tx.batchCandidate.create({
          data: {
            batchId: batch.id,
            candidateId: candidate.id,
            candidateRefSnapshot: row.candidateRef,
            fullNameSnapshot: row.fullName,
            phoneSnapshot: row.phone,
            attendancePercent: row.attendancePercent,
            marksPercent: row.marksPercent,
            practicalPercent: row.practicalPercent,
            qualified: evaluation.qualified,
            qualificationReasons:
              evaluation.reasons as unknown as Prisma.InputJsonValue,
          },
        });
      }

      // 7. Write append-only audit log
      await tx.auditLog.create({
        data: {
          actorId: actor.id,
          action: "BATCH_IMPORTED",
          entityType: "BATCH",
          entityId: batch.id,
          details: {
            trainingCenterId,
            courseId,
            ruleVersionId: ruleVersion.id,
            ruleVersion: ruleVersion.version,
            totalCandidates: rows.length,
            qualifiedCount,
          },
        },
      });

      // 8. Write transactional outbox event
      await tx.outboxEvent.create({
        data: {
          eventType: "BATCH_IMPORTED",
          aggregateId: batch.id,
          payload: {
            batchId: batch.id,
            trainingCenterId,
            courseId,
            ruleVersionId: ruleVersion.id,
            ruleVersion: ruleVersion.version,
            status: batch.status,
            totalCandidates: rows.length,
            qualifiedCount,
          },
        },
      });

      const createdBatch = await tx.batch.findUniqueOrThrow({
        where: { id: batch.id },
        include: batchInclude,
      });

      return formatBatchResponse(createdBatch);
    });
  }

  async submitBatch(
    actorId: string,
    trainingCenterId: string,
    batchId: string
  ) {
    return prisma.$transaction(async (tx) => {
      const actor = await tx.user.findUnique({
        where: { id: actorId },
        select: {
          id: true,
          districtId: true,
          trainingCenterId: true,
        },
      });

      if (!actor) {
        throw new UnauthorizedError("Authenticated user no longer exists");
      }

      if (
        actor.districtId !== null ||
        actor.trainingCenterId === null ||
        actor.trainingCenterId !== trainingCenterId
      ) {
        throw new ForbiddenError(
          "Only Training Centre users with an assigned centre scope can submit batches"
        );
      }

      const existing = await tx.batch.findUnique({
        where: { id: batchId },
        include: batchInclude,
      });

      if (!existing) {
        throw new NotFoundError("Batch not found");
      }

      if (existing.trainingCenterId !== trainingCenterId) {
        throw new ForbiddenError(
          "You can only submit batches belonging to your training centre"
        );
      }

      if (existing.status === BATCH_STATUS.SUBMITTED) {
        return formatBatchResponse(existing);
      }

      if (existing.status !== BATCH_STATUS.DRAFT) {
        throw new ConflictError(
          `Batch cannot be submitted from status '${existing.status}'`
        );
      }

      const submittedAt = new Date();
      const updated = await tx.batch.updateMany({
        where: {
          id: batchId,
          trainingCenterId,
          status: BATCH_STATUS.DRAFT,
        },
        data: {
          status: BATCH_STATUS.SUBMITTED,
          submittedAt,
        },
      });

      if (updated.count === 0) {
        const current = await tx.batch.findUniqueOrThrow({
          where: { id: batchId },
          include: batchInclude,
        });
        if (current.status === BATCH_STATUS.SUBMITTED) {
          return formatBatchResponse(current);
        }
        throw new ConflictError("Batch submission conflicted with a concurrent update");
      }

      await tx.auditLog.create({
        data: {
          actorId,
          action: "BATCH_SUBMITTED",
          entityType: "BATCH",
          entityId: batchId,
          details: {
            trainingCenterId,
            courseId: existing.courseId,
            submittedAt: submittedAt.toISOString(),
          },
        },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: "BATCH_SUBMITTED",
          aggregateId: batchId,
          payload: {
            batchId,
            trainingCenterId,
            courseId: existing.courseId,
            status: BATCH_STATUS.SUBMITTED,
            submittedById: actorId,
            submittedAt: submittedAt.toISOString(),
          },
        },
      });

      const submittedBatch = await tx.batch.findUniqueOrThrow({
        where: { id: batchId },
        include: batchInclude,
      });

      return formatBatchResponse(submittedBatch);
    });
  }

  async reviewBatchCandidate(
    actorId: string,
    batchId: string,
    batchCandidateId: string,
    input: ReviewCandidateInput
  ) {
    return prisma.$transaction(async (tx) => {
      const entry = await tx.batchCandidate.findUnique({
        where: { id: batchCandidateId },
        include: {
          batch: true,
          certificate: {
            select: batchCandidateSelect.certificate.select,
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
          "Candidates can only be reviewed after the batch is submitted"
        );
      }

      if (
        input.status === CANDIDATE_REVIEW_STATUS.APPROVED &&
        !entry.qualified
      ) {
        throw new ConflictError("Unqualified candidates cannot be approved");
      }

      if (entry.reviewStatus !== CANDIDATE_REVIEW_STATUS.PENDING) {
        const isSameDecision =
          entry.reviewStatus === input.status &&
          (input.status === CANDIDATE_REVIEW_STATUS.APPROVED ||
            entry.reviewReason === input.reason);

        if (isSameDecision) {
          return formatBatchCandidate(entry);
        }

        throw new ConflictError(
          `Candidate review is already finalized as '${entry.reviewStatus}'`
        );
      }

      const reviewedAt = new Date();
      const reviewReason =
        input.status === CANDIDATE_REVIEW_STATUS.REJECTED ? input.reason! : null;

      const updated = await tx.batchCandidate.updateMany({
        where: {
          id: batchCandidateId,
          batchId,
          reviewStatus: CANDIDATE_REVIEW_STATUS.PENDING,
        },
        data: {
          reviewStatus: input.status,
          reviewedById: actorId,
          reviewedAt,
          reviewReason,
        },
      });

      if (updated.count === 0) {
        const current = await tx.batchCandidate.findUniqueOrThrow({
          where: { id: batchCandidateId },
          select: batchCandidateSelect,
        });

        const isSameDecision =
          current.reviewStatus === input.status &&
          (input.status === CANDIDATE_REVIEW_STATUS.APPROVED ||
            current.reviewReason === input.reason);

        if (isSameDecision) {
          return formatBatchCandidate(current);
        }

        throw new ConflictError(
          "Candidate review decision conflicted with a concurrent update"
        );
      }

      const updatedEntry = await tx.batchCandidate.findUniqueOrThrow({
        where: { id: batchCandidateId },
        select: batchCandidateSelect,
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: "CANDIDATE_REVIEWED",
          entityType: "BATCH_CANDIDATE",
          entityId: batchCandidateId,
          details: {
            batchId,
            candidateId: entry.candidateId,
            reviewStatus: input.status,
            reason: reviewReason,
          },
        },
      });

      await tx.outboxEvent.create({
        data: {
          eventType: "CANDIDATE_REVIEWED",
          aggregateId: batchCandidateId,
          payload: {
            batchId,
            batchCandidateId,
            candidateId: entry.candidateId,
            reviewStatus: input.status,
            reviewReason,
            reviewedById: actorId,
            reviewedAt: reviewedAt.toISOString(),
          },
        },
      });

      return formatBatchCandidate(updatedEntry);
    });
  }

  async getBatchById(batchId: string, scope: BatchReadScope) {
    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      include: batchInclude,
    });

    if (!batch) {
      throw new NotFoundError("Batch not found");
    }

    if (!scope.crossCenter && batch.trainingCenterId !== scope.trainingCenterId) {
      throw new ForbiddenError(
        "You can only access batches belonging to your training centre"
      );
    }

    return formatBatchResponse(batch);
  }
}

export const batchesService = new BatchesService();
