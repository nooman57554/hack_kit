import { z } from "zod";
import {
  createSuccessResponseSchema,
  isoDateTimeSchema,
} from "../../utils/contracts.js";

export const certificateMetadataContractSchema = z.object({
  id: z.string().uuid(),
  batchCandidateId: z.string().uuid(),
  verificationCode: z.string(),
  status: z.enum(["ISSUED", "REVOKED"]),
  issuedById: z.string().uuid(),
  issuedAt: isoDateTimeSchema,
  revokedById: z.string().uuid().nullable(),
  revokedAt: isoDateTimeSchema.nullable(),
  revocationReason: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});

// POST /api/batches/:batchId/candidates/:batchCandidateId/certificate
// POST /api/certificates/:certificateId/revoke
export const certificateResponseSchema = createSuccessResponseSchema(
  z.object({
    certificate: certificateMetadataContractSchema,
  })
);

export type CertificateMetadataDto = z.infer<
  typeof certificateMetadataContractSchema
>;
export type CertificateResponse = z.infer<typeof certificateResponseSchema>;
