import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ApiError } from "../src/api/auth.ts";
import {
  createPartnerKey,
  listPartnerKeys,
  revokePartnerKey,
} from "../src/api/partnerKeys.ts";
import {
  bulkVerifyCertificatesPartner,
  deriveVerificationViewState,
  parseBulkVerificationCodesInput,
  summarizeBulkVerificationResults,
  verifyCertificatePublic,
} from "../src/api/verify.ts";
import { createPartnerKeyFormSchema } from "../src/schemas/partnerKeys.ts";
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

  it("validates bulk verification input, summarizes mixed results, and enforces demo/key-management API contracts", async () => {
    const emptyParsed = parseBulkVerificationCodesInput("   \n  \n");
    assert.deepEqual(emptyParsed.codes, []);
    assert.ok(emptyParsed.error);

    const over100Text = Array.from(
      { length: 101 },
      (_, idx) => `SP-${idx.toString().padStart(8, "0")}-00000000`
    ).join("\n");
    const overParsed = parseBulkVerificationCodesInput(over100Text);
    assert.deepEqual(overParsed.codes, []);
    assert.match(overParsed.error ?? "", /Maximum 100/);

    const mixedParsed = parseBulkVerificationCodesInput(
      "  SP-12345678-12345678 \n\n SP-87654321-87654321\nSP-12345678-12345678"
    );
    assert.equal(mixedParsed.error, null);
    assert.deepEqual(mixedParsed.codes, [
      "SP-12345678-12345678",
      "SP-87654321-87654321",
      "SP-12345678-12345678",
    ]);

    const summary = summarizeBulkVerificationResults([
      {
        found: true,
        verified: true,
        status: "ISSUED",
        verificationCode: "SP-12345678-12345678",
        issuedAt: "2026-11-28T10:00:00.000Z",
        course: "Course A",
        trainingCentre: "Centre A",
      },
      {
        found: true,
        verified: false,
        status: "REVOKED",
        verificationCode: "SP-87654321-87654321",
        issuedAt: "2026-11-28T10:00:00.000Z",
        revokedAt: "2026-11-28T11:00:00.000Z",
        course: "Course A",
        trainingCentre: "Centre A",
      },
      {
        found: false,
        verificationCode: "SP-00000000-00000000",
      },
    ]);
    assert.deepEqual(summary, {
      submitted: 3,
      found: 2,
      issued: 1,
      revoked: 1,
      notFound: 1,
    });

    assert.equal(
      createPartnerKeyFormSchema.safeParse({ name: "" }).success,
      false
    );
    assert.equal(
      createPartnerKeyFormSchema.safeParse({
        name: "Valid Name",
        expiresAtLocal: "2020-01-01T00:00",
      }).success,
      false
    );
    assert.equal(
      createPartnerKeyFormSchema.safeParse({
        name: "Valid Name",
        expiresAtLocal: "",
      }).success,
      true
    );

    const originalFetch = globalThis.fetch;
    try {
      // Bulk API sends X-API-Key header cleanly and handles 429 rate limits
      globalThis.fetch = async (input, init) => {
        assert.equal(input, "/api/partner/v1/certificates/verify-bulk");
        assert.equal(init?.method, "POST");
        assert.equal(init?.cache, "no-store");
        assert.deepEqual(init?.headers, {
          "Content-Type": "application/json",
          "X-API-Key": "sppk_test.secret",
        });
        assert.equal(
          init?.body,
          JSON.stringify({ verificationCodes: ["SP-12345678-12345678"] })
        );
        return new Response(
          JSON.stringify({
            success: false,
            error: { message: "Too many bulk verification requests" },
          }),
          { status: 429, headers: { "Content-Type": "application/json" } }
        );
      };

      await assert.rejects(
        () =>
          bulkVerifyCertificatesPartner("sppk_test.secret", [
            "SP-12345678-12345678",
          ]),
        (err: unknown) => err instanceof ApiError && err.status === 429
      );

      // Partner key admin client hits expected endpoints & envelopes
      const keyMeta = {
        id: "11111111-1111-4111-8111-111111111111",
        name: "Partner Demo",
        prefix: "sppk_0123456789ab",
        scopes: ["certificates:verify"],
        status: "ACTIVE",
        createdById: "22222222-2222-4222-8222-222222222222",
        createdAt: "2026-11-28T10:00:00.000Z",
        expiresAt: null,
        revokedById: null,
        revokedAt: null,
        lastUsedAt: null,
        updatedAt: "2026-11-28T10:00:00.000Z",
      };

      globalThis.fetch = async (input) => {
        if (input === "/api/partner-keys") {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                partnerKeys: [keyMeta],
                partnerKey: keyMeta,
                apiKey: "sppk_0123456789ab.secret",
                warning: "Store once",
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(
          JSON.stringify({
            success: true,
            data: { partnerKey: { ...keyMeta, status: "REVOKED" } },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      };

      const created = await createPartnerKey("jwt", { name: "Partner Demo" });
      assert.equal(created.apiKey, "sppk_0123456789ab.secret");
      const list = await listPartnerKeys("jwt");
      assert.equal(list.length, 1);
      const revoked = await revokePartnerKey("jwt", keyMeta.id);
      assert.equal(revoked.status, "REVOKED");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
