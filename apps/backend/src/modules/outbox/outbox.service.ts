import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database.js";
import {
  calculateOutboxBackoffMs,
  sanitizeOutboxError,
} from "./outbox.handlers.js";
import {
  CERTIFICATE_OUTBOX_EVENT_TYPES,
  OUTBOX_STATUS,
  type ClaimedOutboxEvent,
  type OutboxStatusSummary,
} from "./outbox.types.js";

export class OutboxService {
  async claimBatch(
    workerId: string,
    batchSize: number,
    leaseDurationMs: number,
    now: Date = new Date()
  ): Promise<ClaimedOutboxEvent[]> {
    const leaseExpiresAt = new Date(now.getTime() + leaseDurationMs);

    return prisma.$queryRaw<ClaimedOutboxEvent[]>(Prisma.sql`
      WITH candidates AS (
        SELECT "id"
        FROM "outbox_events"
        WHERE "eventType" IN (${Prisma.join([...CERTIFICATE_OUTBOX_EVENT_TYPES])})
          AND (
            ("status" = ${OUTBOX_STATUS.PENDING} AND "availableAt" <= ${now})
            OR (
              "status" = ${OUTBOX_STATUS.PROCESSING}
              AND "leaseExpiresAt" IS NOT NULL
              AND "leaseExpiresAt" <= ${now}
            )
          )
        ORDER BY "createdAt" ASC
        LIMIT ${batchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE "outbox_events" AS oe
      SET
        "status" = ${OUTBOX_STATUS.PROCESSING},
        "lockedAt" = ${now},
        "lockedBy" = ${workerId},
        "leaseExpiresAt" = ${leaseExpiresAt},
        "attempts" = oe."attempts" + 1,
        "updatedAt" = ${now}
      FROM candidates
      WHERE oe."id" = candidates."id"
      RETURNING
        oe."id",
        oe."eventType",
        oe."aggregateId",
        oe."payload",
        oe."attempts",
        oe."createdAt",
        oe."lockedAt",
        oe."lockedBy",
        oe."leaseExpiresAt"
    `);
  }

  async markProcessed(
    eventId: string,
    workerId: string,
    now: Date = new Date()
  ): Promise<boolean> {
    const result = await prisma.outboxEvent.updateMany({
      where: {
        id: eventId,
        lockedBy: workerId,
        status: OUTBOX_STATUS.PROCESSING,
      },
      data: {
        status: OUTBOX_STATUS.PROCESSED,
        publishedAt: now,
        processedAt: now,
        lockedAt: null,
        lockedBy: null,
        leaseExpiresAt: null,
        lastError: null,
      },
    });

    return result.count === 1;
  }

  async markFailed(
    eventId: string,
    workerId: string,
    attempts: number,
    error: unknown,
    options: {
      maxAttempts: number;
      backoffBaseMs: number;
      backoffMaxMs: number;
      now?: Date;
    }
  ): Promise<"RETRIED" | "DEAD_LETTERED" | "LOST_LEASE"> {
    const now = options.now ?? new Date();
    const sanitizedError = sanitizeOutboxError(error);
    const shouldDeadLetter = attempts >= options.maxAttempts;

    if (shouldDeadLetter) {
      const result = await prisma.outboxEvent.updateMany({
        where: {
          id: eventId,
          lockedBy: workerId,
          status: OUTBOX_STATUS.PROCESSING,
        },
        data: {
          status: OUTBOX_STATUS.DEAD_LETTER,
          deadLetteredAt: now,
          lastError: sanitizedError,
          lockedAt: null,
          lockedBy: null,
          leaseExpiresAt: null,
        },
      });
      return result.count === 1 ? "DEAD_LETTERED" : "LOST_LEASE";
    }

    const delayMs = calculateOutboxBackoffMs(
      attempts,
      options.backoffBaseMs,
      options.backoffMaxMs
    );
    const nextAvailableAt = new Date(now.getTime() + delayMs);

    const result = await prisma.outboxEvent.updateMany({
      where: {
        id: eventId,
        lockedBy: workerId,
        status: OUTBOX_STATUS.PROCESSING,
      },
      data: {
        status: OUTBOX_STATUS.PENDING,
        availableAt: nextAvailableAt,
        lastError: sanitizedError,
        lockedAt: null,
        lockedBy: null,
        leaseExpiresAt: null,
      },
    });

    return result.count === 1 ? "RETRIED" : "LOST_LEASE";
  }

  async releaseUnstartedLease(
    eventId: string,
    workerId: string,
    now: Date = new Date()
  ): Promise<boolean> {
    const result = await prisma.$executeRaw(Prisma.sql`
      UPDATE "outbox_events"
      SET
        "status" = ${OUTBOX_STATUS.PENDING},
        "attempts" = GREATEST(0, "attempts" - 1),
        "lockedAt" = NULL,
        "lockedBy" = NULL,
        "leaseExpiresAt" = NULL,
        "updatedAt" = ${now}
      WHERE "id" = ${eventId}
        AND "lockedBy" = ${workerId}
        AND "status" = ${OUTBOX_STATUS.PROCESSING}
    `);

    return result === 1;
  }

  async getStatusSummary(now: Date = new Date()): Promise<OutboxStatusSummary> {
    const [grouped, oldestPending] = await Promise.all([
      prisma.outboxEvent.groupBy({
        by: ["status"],
        where: {
          eventType: { in: [...CERTIFICATE_OUTBOX_EVENT_TYPES] },
        },
        _count: {
          _all: true,
        },
      }),
      prisma.outboxEvent.findFirst({
        where: {
          eventType: { in: [...CERTIFICATE_OUTBOX_EVENT_TYPES] },
          status: OUTBOX_STATUS.PENDING,
        },
        orderBy: { createdAt: "asc" },
        select: { createdAt: true },
      }),
    ]);

    const counts = {
      pending: 0,
      processing: 0,
      processed: 0,
      deadLetter: 0,
    };

    for (const row of grouped) {
      if (row.status === OUTBOX_STATUS.PENDING) {
        counts.pending = row._count._all;
      } else if (row.status === OUTBOX_STATUS.PROCESSING) {
        counts.processing = row._count._all;
      } else if (row.status === OUTBOX_STATUS.PROCESSED) {
        counts.processed = row._count._all;
      } else if (row.status === OUTBOX_STATUS.DEAD_LETTER) {
        counts.deadLetter = row._count._all;
      }
    }

    const oldestPendingCreatedAt = oldestPending
      ? oldestPending.createdAt.toISOString()
      : null;
    const oldestPendingAgeMs = oldestPending
      ? Math.max(0, now.getTime() - oldestPending.createdAt.getTime())
      : null;

    return {
      counts,
      oldestPendingCreatedAt,
      oldestPendingAgeMs,
    };
  }
}

export const outboxService = new OutboxService();
