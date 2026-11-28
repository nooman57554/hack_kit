import { ApiError, parseApiResponse } from "./auth";
import { normalizeVerificationCode } from "../schemas/verify";

export interface CertificateVerificationResult {
  verified: boolean;
  status: "ISSUED" | "REVOKED";
  verificationCode: string;
  issuedAt: string;
  course: string;
  trainingCentre: string;
  revokedAt?: string;
}

export async function verifyCertificatePublic(
  verificationCode: string
): Promise<CertificateVerificationResult> {
  const normalized = normalizeVerificationCode(verificationCode);
  const response = await fetch(
    `/api/verify/${encodeURIComponent(normalized)}`,
    {
      method: "GET",
      cache: "no-store",
    }
  );

  return parseApiResponse<CertificateVerificationResult>(response);
}

export type BulkVerifyResultItem =
  | (CertificateVerificationResult & { found: true })
  | { verificationCode: string; found: false };

export interface BulkVerifyResponseData {
  results: BulkVerifyResultItem[];
}

export interface BulkVerifySummaryCounts {
  submitted: number;
  found: number;
  issued: number;
  revoked: number;
  notFound: number;
}

export function parseBulkVerificationCodesInput(rawText: string): {
  codes: string[];
  error: string | null;
} {
  const codes = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (codes.length === 0) {
    return {
      codes: [],
      error: "Enter at least 1 verification code (one per line).",
    };
  }

  if (codes.length > 100) {
    return {
      codes: [],
      error: `Maximum 100 verification codes allowed per request (entered ${codes.length}).`,
    };
  }

  return { codes, error: null };
}

export function summarizeBulkVerificationResults(
  results: BulkVerifyResultItem[]
): BulkVerifySummaryCounts {
  let found = 0;
  let issued = 0;
  let revoked = 0;
  let notFound = 0;

  for (const item of results) {
    if (!item.found) {
      notFound += 1;
    } else {
      found += 1;
      if (item.status === "REVOKED" || !item.verified) {
        revoked += 1;
      } else {
        issued += 1;
      }
    }
  }

  return {
    submitted: results.length,
    found,
    issued,
    revoked,
    notFound,
  };
}

export async function bulkVerifyCertificatesPartner(
  apiKey: string,
  verificationCodes: string[]
): Promise<BulkVerifyResponseData> {
  const response = await fetch("/api/partner/v1/certificates/verify-bulk", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({ verificationCodes }),
    cache: "no-store",
  });

  return parseApiResponse<BulkVerifyResponseData>(response);
}

export type VerificationViewState =
  | { kind: "idle" }
  | { kind: "loading"; verificationCode: string }
  | { kind: "valid"; certificate: CertificateVerificationResult }
  | { kind: "revoked"; certificate: CertificateVerificationResult }
  | { kind: "not_found"; verificationCode: string; message: string }
  | { kind: "error"; message: string };

export function deriveVerificationViewState(params: {
  submittedCode: string | null;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  error: unknown;
  data?: CertificateVerificationResult;
}): VerificationViewState {
  if (!params.submittedCode) {
    return { kind: "idle" };
  }

  if (params.isLoading || params.isFetching) {
    return { kind: "loading", verificationCode: params.submittedCode };
  }

  if (params.isError) {
    if (params.error instanceof ApiError && params.error.status === 404) {
      return {
        kind: "not_found",
        verificationCode: params.submittedCode,
        message: params.error.message || "Certificate not found",
      };
    }

    return {
      kind: "error",
      message:
        params.error instanceof Error && params.error.message
          ? params.error.message
          : "Unable to verify certificate right now. Please try again.",
    };
  }

  if (params.data) {
    if (params.data.status === "REVOKED" || !params.data.verified) {
      return { kind: "revoked", certificate: params.data };
    }
    return { kind: "valid", certificate: params.data };
  }

  return { kind: "idle" };
}
