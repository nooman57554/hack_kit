import { prisma } from "../../config/database.js";
import {
  certificateIssuedPayloadSchema,
  certificateRevokedPayloadSchema,
  type CertificateOutboxEventType,
  type ClaimedOutboxEvent,
} from "./outbox.types.js";

const MAX_ERROR_LENGTH = 400;

export function sanitizeOutboxError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message || error.name
      : typeof error === "string"
        ? error
        : "Outbox processing failed";

  const redacted = raw
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/sppk_[a-f0-9]+\.[A-Za-z0-9_-]+/gi, "[REDACTED_API_KEY]")
    .replace(/\+?\d[\d\s-]{8,}\d/g, "[REDACTED_NUMBER]")
    .replace(/[\r\n\t]+/g, " ")
    .trim();

  if (!redacted) {
    return "Outbox processing failed";
  }

  return redacted.slice(0, MAX_ERROR_LENGTH);
}

export function calculateOutboxBackoffMs(
  attempt: number,
  baseMs: number,
  maxMs: number
): number {
  const safeExponent = Math.min(20, Math.max(0, attempt - 1));
  return Math.min(maxMs, baseMs * 2 ** safeExponent);
}

export type OutboxEventHandler = (event: ClaimedOutboxEvent) => Promise<void>;

export type OutboxHandlerRegistry = Record<
  CertificateOutboxEventType,
  OutboxEventHandler
>;

export function createCertificateOutboxHandlers(): OutboxHandlerRegistry {
  return {
    CERTIFICATE_ISSUED: async (event) => {
      const payload = certificateIssuedPayloadSchema.parse(event.payload);
      const certificate = await prisma.certificate.findUnique({
        where: { id: payload.certificateId },
        select: {
          id: true,
          status: true,
        },
      });

      if (!certificate) {
        throw new Error(
          `Certificate ${payload.certificateId} missing for CERTIFICATE_ISSUED event`
        );
      }

      console.info(
        JSON.stringify({
          component: "outbox-worker",
          eventId: event.id,
          eventType: event.eventType,
          certificateId: certificate.id,
          currentStatus: certificate.status,
          attempt: event.attempts,
        })
      );
    },

    CERTIFICATE_REVOKED: async (event) => {
      const payload = certificateRevokedPayloadSchema.parse(event.payload);
      const certificate = await prisma.certificate.findUnique({
        where: { id: payload.certificateId },
        select: {
          id: true,
          status: true,
        },
      });

      if (!certificate) {
        throw new Error(
          `Certificate ${payload.certificateId} missing for CERTIFICATE_REVOKED event`
        );
      }

      console.info(
        JSON.stringify({
          component: "outbox-worker",
          eventId: event.id,
          eventType: event.eventType,
          certificateId: certificate.id,
          currentStatus: certificate.status,
          attempt: event.attempts,
        })
      );
    },
  };
}
