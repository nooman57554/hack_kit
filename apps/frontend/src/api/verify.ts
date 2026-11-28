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
