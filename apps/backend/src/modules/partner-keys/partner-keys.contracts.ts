import { z } from "zod";
import {
  createSuccessResponseSchema,
  isoDateTimeSchema,
} from "../../utils/contracts.js";
import { PARTNER_KEY_SCOPES } from "./partner-keys.crypto.js";

export const partnerKeyMetadataContractSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    prefix: z.string(),
    scopes: z.array(z.enum([PARTNER_KEY_SCOPES.CERTIFICATES_VERIFY])),
    status: z.enum(["ACTIVE", "REVOKED", "EXPIRED"]),
    createdById: z.string().uuid(),
    createdAt: isoDateTimeSchema,
    expiresAt: isoDateTimeSchema.nullable(),
    revokedById: z.string().uuid().nullable(),
    revokedAt: isoDateTimeSchema.nullable(),
    lastUsedAt: isoDateTimeSchema.nullable(),
    updatedAt: isoDateTimeSchema,
  })
  .strict();

export const createPartnerKeyResponseSchema = createSuccessResponseSchema(
  z
    .object({
      partnerKey: partnerKeyMetadataContractSchema,
      apiKey: z.string(),
      warning: z.string(),
    })
    .strict()
);

export const listPartnerKeysResponseSchema = createSuccessResponseSchema(
  z
    .object({
      partnerKeys: z.array(partnerKeyMetadataContractSchema),
    })
    .strict()
);

export const revokePartnerKeyResponseSchema = createSuccessResponseSchema(
  z
    .object({
      partnerKey: partnerKeyMetadataContractSchema,
    })
    .strict()
);

export type PartnerKeyMetadataDto = z.infer<
  typeof partnerKeyMetadataContractSchema
>;
