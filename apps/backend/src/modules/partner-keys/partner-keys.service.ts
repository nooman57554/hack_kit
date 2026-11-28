import { Prisma } from "@prisma/client";
import { prisma } from "../../config/database.js";
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from "../../utils/errors.js";
import {
  generatePartnerKey,
  parsePartnerKeyPrefix,
  verifyPartnerKeySecret,
  type PartnerKeyScope,
} from "./partner-keys.crypto.js";
import type { PartnerKeyMetadataDto } from "./partner-keys.contracts.js";
import type { CreatePartnerKeyInput } from "./partner-keys.schema.js";

export const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

const partnerKeyMetadataSelect = {
  id: true,
  name: true,
  prefix: true,
  scopes: true,
  createdById: true,
  createdAt: true,
  expiresAt: true,
  revokedById: true,
  revokedAt: true,
  lastUsedAt: true,
  updatedAt: true,
} as const;

type PartnerKeyMetadataRow = Prisma.PartnerApiKeyGetPayload<{
  select: typeof partnerKeyMetadataSelect;
}>;

export interface AuthenticatedPartnerKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
}

export function derivePartnerKeyStatus(
  row: Pick<PartnerKeyMetadataRow, "revokedAt" | "expiresAt">,
  now: Date = new Date()
): "ACTIVE" | "REVOKED" | "EXPIRED" {
  if (row.revokedAt) {
    return "REVOKED";
  }
  if (row.expiresAt && row.expiresAt <= now) {
    return "EXPIRED";
  }
  return "ACTIVE";
}

export function formatPartnerKeyMetadata(
  row: PartnerKeyMetadataRow,
  now: Date = new Date()
): PartnerKeyMetadataDto {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes as PartnerKeyMetadataDto["scopes"],
    status: derivePartnerKeyStatus(row, now),
    createdById: row.createdById,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    revokedById: row.revokedById,
    revokedAt: row.revokedAt ? row.revokedAt.toISOString() : null,
    lastUsedAt: row.lastUsedAt ? row.lastUsedAt.toISOString() : null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type LastUsedTracker = (keyId: string, now: Date) => Promise<void>;

async function defaultLastUsedTracker(keyId: string, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - LAST_USED_THROTTLE_MS);
  await prisma.partnerApiKey.updateMany({
    where: {
      id: keyId,
      revokedAt: null,
      OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: cutoff } }],
    },
    data: {
      lastUsedAt: now,
    },
  });
}

export class PartnerKeysService {
  private readonly trackLastUsed: LastUsedTracker;

  constructor(trackLastUsed: LastUsedTracker = defaultLastUsedTracker) {
    this.trackLastUsed = trackLastUsed;
  }

  async createPartnerKey(
    actorId: string,
    input: CreatePartnerKeyInput
  ): Promise<{
    partnerKey: PartnerKeyMetadataDto;
    apiKey: string;
    warning: string;
  }> {
    const generated = generatePartnerKey();
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;

    const created = await prisma.$transaction(async (tx) => {
      const key = await tx.partnerApiKey.create({
        data: {
          name: input.name,
          prefix: generated.prefix,
          secretHash: generated.secretHash,
          scopes: input.scopes,
          createdById: actorId,
          expiresAt,
        },
        select: partnerKeyMetadataSelect,
      });

      await tx.auditLog.create({
        data: {
          actorId,
          action: "PARTNER_KEY_CREATED",
          entityType: "PARTNER_API_KEY",
          entityId: key.id,
          details: {
            name: key.name,
            prefix: key.prefix,
            scopes: key.scopes,
            expiresAt: key.expiresAt ? key.expiresAt.toISOString() : null,
          },
        },
      });

      return key;
    });

    return {
      partnerKey: formatPartnerKeyMetadata(created),
      apiKey: generated.rawKey,
      warning: "Store this API key securely now. It cannot be retrieved again.",
    };
  }

  async listPartnerKeys(): Promise<PartnerKeyMetadataDto[]> {
    const now = new Date();
    const rows = await prisma.partnerApiKey.findMany({
      orderBy: { createdAt: "desc" },
      select: partnerKeyMetadataSelect,
    });

    return rows.map((row) => formatPartnerKeyMetadata(row, now));
  }

  async revokePartnerKey(
    actorId: string,
    keyId: string
  ): Promise<PartnerKeyMetadataDto> {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.partnerApiKey.findUnique({
        where: { id: keyId },
        select: partnerKeyMetadataSelect,
      });

      if (!existing) {
        throw new NotFoundError("Partner API key not found");
      }

      if (existing.revokedAt) {
        return formatPartnerKeyMetadata(existing);
      }

      const revokedAt = new Date();
      const updated = await tx.partnerApiKey.updateMany({
        where: {
          id: keyId,
          revokedAt: null,
        },
        data: {
          revokedAt,
          revokedById: actorId,
        },
      });

      const current = await tx.partnerApiKey.findUniqueOrThrow({
        where: { id: keyId },
        select: partnerKeyMetadataSelect,
      });

      if (updated.count === 0) {
        return formatPartnerKeyMetadata(current);
      }

      await tx.auditLog.create({
        data: {
          actorId,
          action: "PARTNER_KEY_REVOKED",
          entityType: "PARTNER_API_KEY",
          entityId: current.id,
          details: {
            name: current.name,
            prefix: current.prefix,
          },
        },
      });

      return formatPartnerKeyMetadata(current);
    });
  }

  async authenticateRawKey(
    rawKey: string,
    requiredScope: PartnerKeyScope,
    now: Date = new Date()
  ): Promise<AuthenticatedPartnerKey> {
    const prefix = parsePartnerKeyPrefix(rawKey);
    if (!prefix) {
      throw new UnauthorizedError("Invalid partner API key");
    }

    const record = await prisma.partnerApiKey.findUnique({
      where: { prefix },
      select: {
        id: true,
        name: true,
        prefix: true,
        secretHash: true,
        scopes: true,
        expiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
      },
    });

    if (
      !record ||
      !verifyPartnerKeySecret(rawKey, record.secretHash) ||
      record.revokedAt !== null ||
      (record.expiresAt !== null && record.expiresAt <= now)
    ) {
      throw new UnauthorizedError("Invalid partner API key");
    }

    if (!record.scopes.includes(requiredScope)) {
      throw new ForbiddenError("Partner API key lacks required verification scope");
    }

    const shouldTouchLastUsed =
      !record.lastUsedAt ||
      now.getTime() - record.lastUsedAt.getTime() >= LAST_USED_THROTTLE_MS;

    if (shouldTouchLastUsed) {
      try {
        await this.trackLastUsed(record.id, now);
      } catch {
        // Tracking failure must never break partner verification requests
      }
    }

    return {
      id: record.id,
      name: record.name,
      prefix: record.prefix,
      scopes: record.scopes,
    };
  }
}

export const partnerKeysService = new PartnerKeysService();
