import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database.js";
import { DEFAULT_ROLES } from "../../permissions/permission.registry.js";
import {
  AppError,
  BadRequestError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../../utils/errors.js";
import {
  CsvValidationError,
  parseAndValidateBatchCsv,
} from "./batches.schema.js";
import { evaluateCandidateQualification } from "./qualification.js";

export const BATCH_STATUS = {
  DRAFT: "DRAFT",
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
      candidate: {
        candidateRef: "asc" as const,
      },
    },
    select: {
      id: true,
      candidateId: true,
      attendancePercent: true,
      marksPercent: true,
      practicalPercent: true,
      qualified: true,
      qualificationReasons: true,
      candidate: {
        select: {
          candidateRef: true,
          fullName: true,
          phone: true,
        },
      },
    },
  },
} as const;

type BatchWithDetails = Prisma.BatchGetPayload<{ include: typeof batchInclude }>;

function formatBatchResponse(batch: BatchWithDetails) {
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
    candidates: batch.candidates.map((entry) => ({
      id: entry.id,
      candidateId: entry.candidateId,
      candidateRef: entry.candidate.candidateRef,
      fullName: entry.candidate.fullName,
      phone: entry.candidate.phone,
      attendancePercent: entry.attendancePercent,
      marksPercent: entry.marksPercent,
      practicalPercent: entry.practicalPercent,
      qualified: entry.qualified,
      qualificationReasons: entry.qualificationReasons,
    })),
  };
}

export class BatchesService {
  async importBatch(actorId: string, courseId: string, rawCsv: string) {
    // 1. Parse and validate entire CSV before opening a write transaction
    const { errors, rows } = parseAndValidateBatchCsv(rawCsv);
    if (errors.length > 0) {
      throw new BadRequestError("CSV validation failed", errors);
    }

    return prisma.$transaction(async (tx) => {
      // 2. Verify authenticated user's centre scope
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

      if (actor.districtId !== null || actor.trainingCenterId === null) {
        throw new ForbiddenError(
          "Only Training Centre users with an assigned centre scope can import batches"
        );
      }

      const trainingCenterId = actor.trainingCenterId;

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

      // 6. Upsert candidates and create BatchCandidate qualification records
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

  async getBatchById(actorId: string, batchId: string) {
    const actor = await prisma.user.findUnique({
      where: { id: actorId },
      select: {
        id: true,
        districtId: true,
        trainingCenterId: true,
        userRoles: {
          select: {
            role: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    });

    if (!actor) {
      throw new UnauthorizedError("Authenticated user no longer exists");
    }

    if (actor.districtId !== null && actor.trainingCenterId !== null) {
      throw new ForbiddenError("Invalid user scope configuration");
    }

    const batch = await prisma.batch.findUnique({
      where: { id: batchId },
      include: batchInclude,
    });

    if (!batch) {
      throw new NotFoundError("Batch not found");
    }

    const roleNames = new Set(actor.userRoles.map((ur) => ur.role.name));
    const isCrossCentreAuthority =
      (roleNames.has(DEFAULT_ROLES.STATE_OFFICE) ||
        roleNames.has(DEFAULT_ROLES.ADMIN)) &&
      actor.districtId === null &&
      actor.trainingCenterId === null;

    if (!isCrossCentreAuthority) {
      if (actor.trainingCenterId === null) {
        throw new ForbiddenError("Insufficient scope to view this batch");
      }
      if (batch.trainingCenterId !== actor.trainingCenterId) {
        throw new ForbiddenError(
          "You can only access batches belonging to your training centre"
        );
      }
    }

    return formatBatchResponse(batch);
  }
}

export const batchesService = new BatchesService();
