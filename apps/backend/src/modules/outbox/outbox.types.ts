import { Prisma } from "@prisma/client";
import { z } from "zod";

export const OUTBOX_STATUS = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  PROCESSED: "PROCESSED",
  DEAD_LETTER: "DEAD_LETTER",
} as const;

export type OutboxStatus = (typeof OUTBOX_STATUS)[keyof typeof OUTBOX_STATUS];

export const CERTIFICATE_OUTBOX_EVENT_TYPES = [
  "CERTIFICATE_ISSUED",
  "CERTIFICATE_REVOKED",
] as const;

export type CertificateOutboxEventType =
  (typeof CERTIFICATE_OUTBOX_EVENT_TYPES)[number];

export const certificateIssuedPayloadSchema = z.object({
  certificateId: z.string().uuid(),
  batchId: z.string().uuid(),
  batchCandidateId: z.string().uuid(),
  candidateId: z.string().uuid(),
  verificationCode: z.string().min(1),
  status: z.literal("ISSUED"),
  issuedById: z.string().uuid(),
  issuedAt: z.string().min(1),
});

export const certificateRevokedPayloadSchema = z.object({
  certificateId: z.string().uuid(),
  batchId: z.string().uuid(),
  batchCandidateId: z.string().uuid(),
  candidateId: z.string().uuid(),
  verificationCode: z.string().min(1),
  status: z.literal("REVOKED"),
  revokedById: z.string().uuid(),
  revokedAt: z.string().min(1),
  revocationReason: z.string().nullable().optional(),
});

export interface ClaimedOutboxEvent {
  id: string;
  eventType: string;
  aggregateId: string;
  payload: Prisma.JsonValue;
  attempts: number;
  createdAt: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  leaseExpiresAt: Date | null;
}

export interface OutboxStatusSummary {
  counts: {
    pending: number;
    processing: number;
    processed: number;
    deadLetter: number;
  };
  oldestPendingCreatedAt: string | null;
  oldestPendingAgeMs: number | null;
}
