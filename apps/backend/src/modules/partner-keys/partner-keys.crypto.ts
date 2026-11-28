import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env.js";

export const PARTNER_KEY_SCOPES = {
  CERTIFICATES_VERIFY: "certificates:verify",
} as const;

export type PartnerKeyScope =
  (typeof PARTNER_KEY_SCOPES)[keyof typeof PARTNER_KEY_SCOPES];

export const ALL_PARTNER_KEY_SCOPES: readonly PartnerKeyScope[] = [
  PARTNER_KEY_SCOPES.CERTIFICATES_VERIFY,
];

const RAW_KEY_REGEX = /^(sppk_[a-f0-9]{12})\.([A-Za-z0-9_-]{32,128})$/;
const SHA256_HEX_REGEX = /^[a-f0-9]{64}$/;

/**
 * Derive a dedicated HMAC key for partner API key hashes.
 * Uses PARTNER_KEY_HASH_SECRET if configured, or a domain-separated key
 * derived from JWT_SECRET so offline DB dumps cannot be brute-forced.
 */
function getHmacKey(): Buffer {
  if (env.PARTNER_KEY_HASH_SECRET) {
    return Buffer.from(env.PARTNER_KEY_HASH_SECRET, "utf8");
  }
  return createHmac("sha256", env.JWT_SECRET)
    .update("skillpass:partner-api-key-hash:v1")
    .digest();
}

export interface GeneratedPartnerKey {
  prefix: string;
  rawKey: string;
  secretHash: string;
}

export function generatePartnerKey(): GeneratedPartnerKey {
  const prefix = `sppk_${randomBytes(6).toString("hex")}`;
  const secret = randomBytes(32).toString("base64url");
  const rawKey = `${prefix}.${secret}`;
  const secretHash = hashPartnerKey(rawKey);
  return {
    prefix,
    rawKey,
    secretHash,
  };
}

export function parsePartnerKeyPrefix(rawKey: string): string | null {
  const match = RAW_KEY_REGEX.exec(rawKey);
  if (!match) {
    return null;
  }
  return match[1];
}

export function hashPartnerKey(rawKey: string): string {
  return createHmac("sha256", getHmacKey()).update(rawKey, "utf8").digest("hex");
}

export function verifyPartnerKeySecret(rawKey: string, storedHashHex: string): boolean {
  if (!SHA256_HEX_REGEX.test(storedHashHex) || !RAW_KEY_REGEX.test(rawKey)) {
    return false;
  }
  const computedHex = hashPartnerKey(rawKey);
  const computedBuf = Buffer.from(computedHex, "hex");
  const storedBuf = Buffer.from(storedHashHex, "hex");
  if (computedBuf.length !== storedBuf.length) {
    return false;
  }
  return timingSafeEqual(computedBuf, storedBuf);
}
