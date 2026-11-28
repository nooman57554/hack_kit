import { parseApiResponse } from "./auth";

export type PartnerKeyStatus = "ACTIVE" | "REVOKED" | "EXPIRED";

export interface PartnerKeyMetadata {
  id: string;
  name: string;
  prefix: string;
  scopes: ["certificates:verify"] | string[];
  status: PartnerKeyStatus;
  createdById: string;
  createdAt: string;
  expiresAt: string | null;
  revokedById: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  updatedAt: string;
}

export interface CreatePartnerKeyResponseData {
  partnerKey: PartnerKeyMetadata;
  apiKey: string;
  warning: string;
}

interface ListPartnerKeysResponseData {
  partnerKeys: PartnerKeyMetadata[];
}

interface RevokePartnerKeyResponseData {
  partnerKey: PartnerKeyMetadata;
}

export async function listPartnerKeys(
  token: string
): Promise<PartnerKeyMetadata[]> {
  const response = await fetch("/api/partner-keys", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  const data = await parseApiResponse<ListPartnerKeysResponseData>(response);
  return data.partnerKeys;
}

export async function createPartnerKey(
  token: string,
  input: { name: string; expiresAt?: string }
): Promise<CreatePartnerKeyResponseData> {
  const response = await fetch("/api/partner-keys", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: input.name,
      scopes: ["certificates:verify"],
      ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
    }),
  });

  return parseApiResponse<CreatePartnerKeyResponseData>(response);
}

export async function revokePartnerKey(
  token: string,
  keyId: string
): Promise<PartnerKeyMetadata> {
  const response = await fetch(
    `/api/partner-keys/${encodeURIComponent(keyId)}/revoke`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  const data = await parseApiResponse<RevokePartnerKeyResponseData>(response);
  return data.partnerKey;
}
