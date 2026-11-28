import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "../src/api/auth.ts";
import {
  deriveVerificationViewState,
  verifyCertificatePublic,
} from "../src/api/verify.ts";
import {
  normalizeVerificationCode,
  verifyCertificateSchema,
} from "../src/schemas/verify.ts";

describe("Frontend certificate verification validation and state handling", () => {
  it("normalizes and validates verification code format before submission", () => {
    assert.equal(
      normalizeVerificationCode("  sp-abcd1234-ef567890 "),
      "SP-ABCD1234-EF567890"
    );
    assert.equal(
      verifyCertificateSchema.safeParse({
        verificationCode: "sp-abcd1234-ef567890",
      }).success,
      true
    );
    assert.equal(
      verifyCertificateSchema.safeParse({ verificationCode: "" }).success,
      false
    );
    assert.equal(
      verifyCertificateSchema.safeParse({ verificationCode: "SP-123" }).success,
      false
    );
  });

  it("derives valid, revoked, not-found, loading, and network-error states cleanly", async () => {
    const validPayload = {
      verified: true,
      status: "ISSUED" as const,
      verificationCode: "SP-ABCD1234-EF567890",
      issuedAt: "2026-11-28T10:00:00.000Z",
      course: "Full-Stack Web Development",
      trainingCentre: "North Skill Academy",
    };

    assert.deepEqual(
      deriveVerificationViewState({
        submittedCode: "SP-ABCD1234-EF567890",
        isLoading: true,
        isFetching: true,
        isError: false,
        error: null,
      }),
      { kind: "loading", verificationCode: "SP-ABCD1234-EF567890" }
    );

    assert.deepEqual(
      deriveVerificationViewState({
        submittedCode: "SP-ABCD1234-EF567890",
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        data: validPayload,
      }),
      { kind: "valid", certificate: validPayload }
    );

    const revokedPayload = {
      ...validPayload,
      verified: false,
      status: "REVOKED" as const,
      revokedAt: "2026-11-28T11:00:00.000Z",
    };
    assert.deepEqual(
      deriveVerificationViewState({
        submittedCode: "SP-ABCD1234-EF567890",
        isLoading: false,
        isFetching: false,
        isError: false,
        error: null,
        data: revokedPayload,
      }),
      { kind: "revoked", certificate: revokedPayload }
    );

    assert.deepEqual(
      deriveVerificationViewState({
        submittedCode: "SP-00000000-00000000",
        isLoading: false,
        isFetching: false,
        isError: true,
        error: new ApiError("Certificate not found", 404),
      }),
      {
        kind: "not_found",
        verificationCode: "SP-00000000-00000000",
        message: "Certificate not found",
      }
    );

    assert.deepEqual(
      deriveVerificationViewState({
        submittedCode: "SP-ABCD1234-EF567890",
        isLoading: false,
        isFetching: false,
        isError: true,
        error: new TypeError("Failed to fetch"),
      }),
      { kind: "error", message: "Failed to fetch" }
    );

    // Exercise verifyCertificatePublic API client across valid/404/network responses
    const originalFetch = globalThis.fetch;
    try {
      globalThis.fetch = async (input, init) => {
        assert.equal(input, "/api/verify/SP-ABCD1234-EF567890");
        assert.equal(init?.cache, "no-store");
        return new Response(JSON.stringify({ success: true, data: validPayload }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };
      const result = await verifyCertificatePublic(" sp-abcd1234-ef567890 ");
      assert.deepEqual(result, validPayload);

      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            success: false,
            error: { message: "Certificate not found" },
          }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      await assert.rejects(
        () => verifyCertificatePublic("SP-00000000-00000000"),
        (err: unknown) =>
          err instanceof ApiError &&
          err.status === 404 &&
          err.message === "Certificate not found"
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
