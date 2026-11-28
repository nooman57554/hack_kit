import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generatePartnerKey,
  hashPartnerKey,
  parsePartnerKeyPrefix,
  verifyPartnerKeySecret,
} from "../src/modules/partner-keys/partner-keys.crypto.js";
import {
  createPartnerKeyResponseSchema,
  listPartnerKeysResponseSchema,
} from "../src/modules/partner-keys/partner-keys.contracts.js";
import {
  derivePartnerKeyStatus,
} from "../src/modules/partner-keys/partner-keys.service.js";
import { verificationCodeParamsSchema } from "../src/modules/verification/verification.schema.js";
import { verifyCertificateResponseSchema } from "../src/modules/verification/verification.contracts.js";

describe("Partner API key cryptography and metadata helpers", () => {
  it("generates high-entropy prefixed keys and verifies secrets via HMAC-SHA256", () => {
    const generated = generatePartnerKey();

    assert.match(generated.prefix, /^sppk_[a-f0-9]{12}$/);
    assert.ok(generated.rawKey.startsWith(`${generated.prefix}.`));
    assert.notEqual(generated.secretHash, generated.rawKey);
    assert.match(generated.secretHash, /^[a-f0-9]{64}$/);
    assert.equal(parsePartnerKeyPrefix(generated.rawKey), generated.prefix);
    assert.equal(
      verifyPartnerKeySecret(generated.rawKey, generated.secretHash),
      true
    );

    const wrongKey = `${generated.prefix}.incorrect_secret_material_0123456789abcdef`;
    assert.equal(verifyPartnerKeySecret(wrongKey, generated.secretHash), false);
    assert.equal(verifyPartnerKeySecret(generated.rawKey, "not-a-hash"), false);
    assert.equal(parsePartnerKeyPrefix("malformed-key"), null);
    assert.equal(hashPartnerKey(generated.rawKey), generated.secretHash);
  });

  it("derives ACTIVE, EXPIRED, and REVOKED states accurately", () => {
    const now = new Date("2026-11-28T12:00:00.000Z");
    assert.equal(
      derivePartnerKeyStatus({ revokedAt: null, expiresAt: null }, now),
      "ACTIVE"
    );
    assert.equal(
      derivePartnerKeyStatus(
        {
          revokedAt: null,
          expiresAt: new Date("2026-11-29T12:00:00.000Z"),
        },
        now
      ),
      "ACTIVE"
    );
    assert.equal(
      derivePartnerKeyStatus(
        {
          revokedAt: null,
          expiresAt: new Date("2026-11-27T12:00:00.000Z"),
        },
        now
      ),
      "EXPIRED"
    );
    assert.equal(
      derivePartnerKeyStatus(
        {
          revokedAt: new Date("2026-11-28T10:00:00.000Z"),
          expiresAt: new Date("2026-11-29T12:00:00.000Z"),
        },
        now
      ),
      "REVOKED"
    );
  });
});

describe("Verification and partner-key contract validation", () => {
  it("enforces exact canonical format on verification codes", () => {
    assert.equal(
      verificationCodeParamsSchema.safeParse({
        verificationCode: "SP-ABCD1234-EF567890",
      }).success,
      true
    );
    assert.equal(
      verificationCodeParamsSchema.safeParse({
        verificationCode: "SP-ABCD1234",
      }).success,
      false
    );
    assert.equal(
      verificationCodeParamsSchema.safeParse({
        verificationCode: "sp-abcd1234-ef567890",
      }).success,
      false
    );
    assert.equal(
      verificationCodeParamsSchema.safeParse({
        verificationCode: "SP-ABCD1234-EF567890-EXTRA1234567890",
      }).success,
      false
    );
  });

  it("strictly rejects extra personal or internal fields in verification contracts", () => {
    const valid = verifyCertificateResponseSchema.safeParse({
      success: true,
      data: {
        verified: true,
        status: "ISSUED",
        verificationCode: "SP-ABCD1234-EF567890",
        issuedAt: "2026-11-28T10:00:00.000Z",
        course: "Full-Stack Web Development",
        trainingCentre: "North Skill Academy",
      },
    });
    assert.equal(valid.success, true);

    const leaked = verifyCertificateResponseSchema.safeParse({
      success: true,
      data: {
        verified: true,
        status: "ISSUED",
        verificationCode: "SP-ABCD1234-EF567890",
        issuedAt: "2026-11-28T10:00:00.000Z",
        course: "Full-Stack Web Development",
        trainingCentre: "North Skill Academy",
        fullName: "Candidate Name",
      },
    });
    assert.equal(leaked.success, false);
  });

  it("strictly rejects secretHash or plaintext keys in list contract responses", () => {
    const metadata = {
      id: "11111111-1111-4111-8111-111111111111",
      name: "Partner One",
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

    assert.equal(
      createPartnerKeyResponseSchema.safeParse({
        success: true,
        data: {
          partnerKey: metadata,
          apiKey: "sppk_0123456789ab.supersecret",
          warning: "Store safely",
        },
      }).success,
      true
    );

    assert.equal(
      listPartnerKeysResponseSchema.safeParse({
        success: true,
        data: {
          partnerKeys: [{ ...metadata, secretHash: "leak" }],
        },
      }).success,
      false
    );
  });
});
