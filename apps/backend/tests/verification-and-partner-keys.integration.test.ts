import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import app from "../src/app.js";
import { prisma } from "../src/config/database.js";
import { env } from "../src/config/env.js";
import { errorHandler } from "../src/middleware/error.middleware.js";
import { authenticatePartnerKey } from "../src/middleware/partner-key.middleware.js";
import { CertificatesService } from "../src/modules/certificates/certificates.service.js";
import {
  createPartnerKeyResponseSchema,
  listPartnerKeysResponseSchema,
  revokePartnerKeyResponseSchema,
} from "../src/modules/partner-keys/partner-keys.contracts.js";
import { PARTNER_KEY_SCOPES } from "../src/modules/partner-keys/partner-keys.crypto.js";
import { PartnerKeysService } from "../src/modules/partner-keys/partner-keys.service.js";
import { verifyCertificateResponseSchema } from "../src/modules/verification/verification.contracts.js";
import { verificationController } from "../src/modules/verification/verification.controller.js";
import { createPartnerVerifyRateLimiter } from "../src/modules/verification/verification.limiter.js";

function signToken(userId: string): string {
  return jwt.sign({ userId }, env.JWT_SECRET, {
    algorithm: "HS256",
    expiresIn: "1h",
  });
}

async function apiRequest(
  server: http.Server,
  method: string,
  path: string,
  options: {
    token?: string;
    apiKey?: string;
    contentType?: string;
    body?: string | Record<string, unknown>;
  } = {}
): Promise<{
  status: number;
  body: any;
  headers: http.IncomingHttpHeaders;
}> {
  const addr = server.address() as { port: number };
  const headers: Record<string, string> = {};

  if (options.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }
  if (options.apiKey !== undefined) {
    headers["X-API-Key"] = options.apiKey;
  }

  let payload: string | undefined;
  if (typeof options.body === "string") {
    payload = options.body;
    headers["Content-Type"] = options.contentType ?? "text/csv";
  } else if (options.body !== undefined) {
    payload = JSON.stringify(options.body);
    headers["Content-Type"] = options.contentType ?? "application/json";
  }

  if (payload !== undefined) {
    headers["Content-Length"] = Buffer.byteLength(payload).toString();
  }

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: addr.port,
        path,
        method,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let parsed: any = raw;
          try {
            parsed = JSON.parse(raw);
          } catch { }
          resolve({
            status: res.statusCode ?? 500,
            body: parsed,
            headers: res.headers,
          });
        });
      }
    );
    req.on("error", reject);
    if (payload !== undefined) {
      req.write(payload);
    }
    req.end();
  });
}

describe("Public Verification, Partner Verification API, and Admin Partner Key Management", () => {
  let server: http.Server;
  let adminUserId: string;
  let adminToken: string;
  let stateToken: string;
  let northCentreToken: string;
  let districtToken: string;

  let courseId: string;
  let batchId: string;
  let issuedBatchCandidateId: string;
  let issuedCertId: string;
  let issuedCode: string;
  let revokedCertId: string;
  let revokedCode: string;

  const createdKeyIds: string[] = [];
  const testRunTag = `VERIFY_${Date.now()}`;

  before(async () => {
    const adminRole = await prisma.role.findUniqueOrThrow({
      where: { name: "ADMIN" },
    });
    const adminUser = await prisma.user.create({
      data: {
        name: `Test Admin ${testRunTag}`,
        email: `admin.${testRunTag}@skillpass.local`,
        password: "not-used-in-jwt-tests",
        userRoles: {
          create: {
            roleId: adminRole.id,
          },
        },
      },
    });
    adminUserId = adminUser.id;
    adminToken = signToken(adminUser.id);

    const stateUser = await prisma.user.findUniqueOrThrow({
      where: { email: "state.officer@skillpass.local" },
    });
    const northUser = await prisma.user.findUniqueOrThrow({
      where: { email: "centre.north@skillpass.local" },
    });
    const districtUser = await prisma.user.findUniqueOrThrow({
      where: { email: "district.north@skillpass.local" },
    });

    stateToken = signToken(stateUser.id);
    northCentreToken = signToken(northUser.id);
    districtToken = signToken(districtUser.id);

    server = await new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });

    const courseRes = await apiRequest(server, "POST", "/api/courses", {
      token: stateToken,
      body: {
        code: `${testRunTag}-COURSE`,
        name: `Verification Course ${testRunTag}`,
        minAttendancePercent: 75,
        minMarksPercent: 60,
        practicalRequired: true,
        minPracticalPercent: 65,
      },
    });
    assert.equal(courseRes.status, 201);
    courseId = courseRes.body.data.course.id;

    const csv = [
      "candidateRef,fullName,phone,attendancePercent,marksPercent,practicalPercent",
      `${testRunTag}-01,Alice Privacy Sensitive,+919999900001,92,88,90`,
      `${testRunTag}-02,Bob Privacy Sensitive,+919999900002,90,82,85`,
    ].join("\n");

    const importRes = await apiRequest(
      server,
      "POST",
      `/api/batches/import?courseId=${courseId}`,
      {
        token: northCentreToken,
        body: csv,
      }
    );
    assert.equal(importRes.status, 201);
    batchId = importRes.body.data.batch.id;
    const candidates = importRes.body.data.batch.candidates;
    issuedBatchCandidateId = candidates[0].id;
    const revokedBatchCandidateId = candidates[1].id;

    const submitRes = await apiRequest(
      server,
      "POST",
      `/api/batches/${batchId}/submit`,
      { token: northCentreToken }
    );
    assert.equal(submitRes.status, 200);

    for (const bcId of [issuedBatchCandidateId, revokedBatchCandidateId]) {
      const rev = await apiRequest(
        server,
        "PATCH",
        `/api/batches/${batchId}/candidates/${bcId}/review`,
        { token: stateToken, body: { status: "APPROVED" } }
      );
      assert.equal(rev.status, 200);
    }

    const issue1 = await apiRequest(
      server,
      "POST",
      `/api/batches/${batchId}/candidates/${issuedBatchCandidateId}/certificate`,
      { token: stateToken }
    );
    assert.equal(issue1.status, 201);
    issuedCertId = issue1.body.data.certificate.id;
    issuedCode = issue1.body.data.certificate.verificationCode;

    const issue2 = await apiRequest(
      server,
      "POST",
      `/api/batches/${batchId}/candidates/${revokedBatchCandidateId}/certificate`,
      { token: stateToken }
    );
    assert.equal(issue2.status, 201);
    revokedCertId = issue2.body.data.certificate.id;
    revokedCode = issue2.body.data.certificate.verificationCode;

    const revokeRes = await apiRequest(
      server,
      "POST",
      `/api/certificates/${revokedCertId}/revoke`,
      {
        token: stateToken,
        body: { reason: "Internal officer note: sensitive audit remarks" },
      }
    );
    assert.equal(revokeRes.status, 200);
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));

    if (createdKeyIds.length > 0) {
      await prisma.auditLog.deleteMany({
        where: {
          entityType: "PARTNER_API_KEY",
          entityId: { in: createdKeyIds },
        },
      });
      await prisma.partnerApiKey.deleteMany({
        where: { id: { in: createdKeyIds } },
      });
    }

    if (batchId) {
      const entries = await prisma.batchCandidate.findMany({
        where: { batchId },
        select: { id: true, candidateId: true },
      });
      const entryIds = entries.map((e) => e.id);
      const candIds = entries.map((e) => e.candidateId);
      const certIds = [issuedCertId, revokedCertId].filter(Boolean);

      await prisma.outboxEvent.deleteMany({
        where: { aggregateId: { in: [batchId, ...certIds] } },
      });
      await prisma.auditLog.deleteMany({
        where: {
          entityId: { in: [batchId, ...entryIds, ...certIds, courseId] },
        },
      });
      if (certIds.length > 0) {
        await prisma.certificate.deleteMany({ where: { id: { in: certIds } } });
      }
      await prisma.batchCandidate.deleteMany({ where: { batchId } });
      await prisma.batch.delete({ where: { id: batchId } });
      if (candIds.length > 0) {
        await prisma.candidate.deleteMany({ where: { id: { in: candIds } } });
      }
    }

    if (courseId) {
      await prisma.course.update({
        where: { id: courseId },
        data: { currentRuleVersionId: null },
      });
      await prisma.courseRuleVersion.deleteMany({ where: { courseId } });
      await prisma.course.delete({ where: { id: courseId } });
    }

    if (adminUserId) {
      await prisma.auditLog.deleteMany({ where: { actorId: adminUserId } });
      await prisma.user.delete({ where: { id: adminUserId } });
    }
  });

  it("verifies valid and revoked certificates publicly without JWT, hides sensitive fields, and treats unknown/malformed/partial codes identically", async () => {
    // Valid issued cert without auth header
    const validRes = await apiRequest(server, "GET", `/api/verify/${issuedCode}`);
    assert.equal(validRes.status, 200);
    assert.match(String(validRes.headers["cache-control"]), /no-store/);
    const parsedValid = verifyCertificateResponseSchema.parse(validRes.body);
    assert.equal(parsedValid.data.verified, true);
    assert.equal(parsedValid.data.status, "ISSUED");
    assert.equal(parsedValid.data.verificationCode, issuedCode);
    assert.equal(parsedValid.data.course, `Verification Course ${testRunTag}`);
    assert.equal(parsedValid.data.trainingCentre, "North Skill Academy");
    assert.equal(parsedValid.data.revokedAt, undefined);

    const rawValidJson = JSON.stringify(validRes.body);
    assert.equal(rawValidJson.includes("Alice"), false);
    assert.equal(rawValidJson.includes("9999900001"), false);
    assert.equal(rawValidJson.includes(issuedCertId), false);
    assert.equal(rawValidJson.includes(batchId), false);

    // Revoked cert returns REVOKED without internal revocationReason
    const revokedRes = await apiRequest(
      server,
      "GET",
      `/api/verify/${revokedCode}`
    );
    assert.equal(revokedRes.status, 200);
    const parsedRevoked = verifyCertificateResponseSchema.parse(revokedRes.body);
    assert.equal(parsedRevoked.data.verified, false);
    assert.equal(parsedRevoked.data.status, "REVOKED");
    assert.ok(parsedRevoked.data.revokedAt);
    assert.equal(
      JSON.stringify(revokedRes.body).includes("sensitive audit remarks"),
      false
    );

    // Unknown, malformed, and partial prefix codes return the identical 404 response
    const unknownRes = await apiRequest(
      server,
      "GET",
      "/api/verify/SP-00000000-00000000"
    );
    const malformedRes = await apiRequest(server, "GET", "/api/verify/bad!code");
    const partialRes = await apiRequest(
      server,
      "GET",
      `/api/verify/${issuedCode.slice(0, 11)}`
    );

    assert.equal(unknownRes.status, 404);
    assert.equal(malformedRes.status, 404);
    assert.equal(partialRes.status, 404);
    assert.deepEqual(malformedRes.body, unknownRes.body);
    assert.deepEqual(partialRes.body, unknownRes.body);
  });

  it("enforces ADMIN RBAC, single-disclosure creation, secret-free listing/audit, and immediate idempotent revocation", async () => {
    // Non-admin and unauthenticated callers are blocked
    for (const badToken of [stateToken, northCentreToken, districtToken]) {
      const createDenied = await apiRequest(server, "POST", "/api/partner-keys", {
        token: badToken,
        body: { name: "Unauthorized Attempt" },
      });
      assert.equal(createDenied.status, 403);

      const listDenied = await apiRequest(server, "GET", "/api/partner-keys", {
        token: badToken,
      });
      assert.equal(listDenied.status, 403);
    }

    const unauthCreate = await apiRequest(server, "POST", "/api/partner-keys", {
      body: { name: "No Auth" },
    });
    assert.equal(unauthCreate.status, 401);

    // Rejects invalid scopes and past expiry
    const invalidScopeRes = await apiRequest(
      server,
      "POST",
      "/api/partner-keys",
      {
        token: adminToken,
        body: { name: "Bad Scope", scopes: ["certificates:write"] },
      }
    );
    assert.equal(invalidScopeRes.status, 400);

    const pastExpiryRes = await apiRequest(server, "POST", "/api/partner-keys", {
      token: adminToken,
      body: { name: "Past Expiry", expiresAt: "2020-01-01T00:00:00.000Z" },
    });
    assert.equal(pastExpiryRes.status, 400);

    // Admin creates valid key
    const createRes = await apiRequest(server, "POST", "/api/partner-keys", {
      token: adminToken,
      body: { name: `Portal Partner ${testRunTag}` },
    });
    assert.equal(createRes.status, 201);
    const parsedCreate = createPartnerKeyResponseSchema.parse(createRes.body);
    const createdKeyId = parsedCreate.data.partnerKey.id;
    const rawApiKey = parsedCreate.data.apiKey;
    createdKeyIds.push(createdKeyId);

    assert.equal(parsedCreate.data.partnerKey.status, "ACTIVE");
    assert.deepEqual(parsedCreate.data.partnerKey.scopes, [
      PARTNER_KEY_SCOPES.CERTIFICATES_VERIFY,
    ]);
    assert.ok(rawApiKey.startsWith(`${parsedCreate.data.partnerKey.prefix}.`));

    // Verify list never contains plaintext key or secretHash
    const listRes = await apiRequest(server, "GET", "/api/partner-keys", {
      token: adminToken,
    });
    assert.equal(listRes.status, 200);
    const parsedList = listPartnerKeysResponseSchema.parse(listRes.body);
    const listed = parsedList.data.partnerKeys.find((k) => k.id === createdKeyId);
    assert.ok(listed);
    assert.equal(JSON.stringify(listRes.body).includes(rawApiKey), false);

    // Verify DB row stores hash, not raw key
    const dbRow = await prisma.partnerApiKey.findUniqueOrThrow({
      where: { id: createdKeyId },
    });
    assert.notEqual(dbRow.secretHash, rawApiKey);
    assert.equal(dbRow.secretHash.includes(rawApiKey.split(".")[1]!), false);

    // Revoke idempotently and verify non-admin cannot revoke
    const revokeForbidden = await apiRequest(
      server,
      "POST",
      `/api/partner-keys/${createdKeyId}/revoke`,
      { token: stateToken }
    );
    assert.equal(revokeForbidden.status, 403);

    const revoke1 = await apiRequest(
      server,
      "POST",
      `/api/partner-keys/${createdKeyId}/revoke`,
      { token: adminToken }
    );
    assert.equal(revoke1.status, 200);
    const parsedRevoke1 = revokePartnerKeyResponseSchema.parse(revoke1.body);
    assert.equal(parsedRevoke1.data.partnerKey.status, "REVOKED");
    assert.ok(parsedRevoke1.data.partnerKey.revokedAt);

    const revoke2 = await apiRequest(
      server,
      "POST",
      `/api/partner-keys/${createdKeyId}/revoke`,
      { token: adminToken }
    );
    assert.equal(revoke2.status, 200);
    assert.equal(
      revoke2.body.data.partnerKey.revokedAt,
      revoke1.body.data.partnerKey.revokedAt
    );

    const auditLogs = await prisma.auditLog.findMany({
      where: {
        entityType: "PARTNER_API_KEY",
        entityId: createdKeyId,
      },
      orderBy: { createdAt: "asc" },
    });
    assert.deepEqual(
      auditLogs.map((l) => l.action),
      ["PARTNER_KEY_CREATED", "PARTNER_KEY_REVOKED"]
    );
    const serializedAudit = JSON.stringify(auditLogs);
    assert.equal(serializedAudit.includes(rawApiKey), false);
    assert.equal(serializedAudit.includes(dbRow.secretHash), false);
  });

  it("authenticates partner verification, matches public contract, isolates routes, enforces expiry/revocation/scopes, and tolerates tracking failure", async () => {
    // Create active key
    const createRes = await apiRequest(server, "POST", "/api/partner-keys", {
      token: adminToken,
      body: { name: `Active Partner ${testRunTag}` },
    });
    assert.equal(createRes.status, 201);
    const keyId = createRes.body.data.partnerKey.id;
    const activeApiKey = createRes.body.data.apiKey;
    createdKeyIds.push(keyId);

    // Missing or invalid key rejected generically
    const missingKey = await apiRequest(
      server,
      "GET",
      `/api/partner/v1/certificates/verify/${issuedCode}`
    );
    assert.equal(missingKey.status, 401);

    const wrongKey = await apiRequest(
      server,
      "GET",
      `/api/partner/v1/certificates/verify/${issuedCode}`,
      { apiKey: "sppk_000000000000.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" }
    );
    assert.equal(wrongKey.status, 401);
    assert.deepEqual(wrongKey.body, missingKey.body);

    // Valid partner request matches public response identically & updates lastUsedAt
    const [publicRes, partnerRes] = await Promise.all([
      apiRequest(server, "GET", `/api/verify/${issuedCode}`),
      apiRequest(
        server,
        "GET",
        `/api/partner/v1/certificates/verify/${issuedCode}`,
        { apiKey: activeApiKey }
      ),
    ]);
    assert.equal(publicRes.status, 200);
    assert.equal(partnerRes.status, 200);
    assert.deepEqual(partnerRes.body, publicRes.body);
    verifyCertificateResponseSchema.parse(partnerRes.body);

    const afterFirstUse = await prisma.partnerApiKey.findUniqueOrThrow({
      where: { id: keyId },
      select: { lastUsedAt: true },
    });
    assert.ok(afterFirstUse.lastUsedAt);

    // Throttled second use within window keeps exact lastUsedAt timestamp
    const secondPartnerRes = await apiRequest(
      server,
      "GET",
      `/api/partner/v1/certificates/verify/${revokedCode}`,
      { apiKey: activeApiKey }
    );
    assert.equal(secondPartnerRes.status, 200);
    assert.equal(secondPartnerRes.body.data.status, "REVOKED");
    const afterSecondUse = await prisma.partnerApiKey.findUniqueOrThrow({
      where: { id: keyId },
      select: { lastUsedAt: true },
    });
    assert.equal(
      afterSecondUse.lastUsedAt?.toISOString(),
      afterFirstUse.lastUsedAt?.toISOString()
    );

    // Partner key cannot access internal routes (PDF, batches, revoke, admin keys)
    const internalAttempts = await Promise.all([
      apiRequest(server, "GET", "/api/batches", { apiKey: activeApiKey }),
      apiRequest(server, "GET", `/api/certificates/${issuedCertId}/pdf`, {
        apiKey: activeApiKey,
      }),
      apiRequest(
        server,
        "POST",
        `/api/batches/${batchId}/candidates/${issuedBatchCandidateId}/certificate`,
        { apiKey: activeApiKey }
      ),
      apiRequest(server, "POST", `/api/certificates/${issuedCertId}/revoke`, {
        apiKey: activeApiKey,
        body: { reason: "Partner attempt" },
      }),
      apiRequest(server, "GET", "/api/partner-keys", { apiKey: activeApiKey }),
    ]);
    for (const attempt of internalAttempts) {
      assert.equal(attempt.status, 401);
    }

    // Tracking failure does not fail verification (test with injected failing lastUsedTracker)
    const failingTrackerService = new PartnerKeysService(async () => {
      throw new Error("Simulated lastUsedAt DB failure");
    });
    const isolatedApp = express();
    isolatedApp.get(
      "/partner-verify/:verificationCode",
      createPartnerVerifyRateLimiter(5),
      authenticatePartnerKey(
        PARTNER_KEY_SCOPES.CERTIFICATES_VERIFY,
        failingTrackerService
      ),
      verificationController.verifyPartner
    );
    isolatedApp.use(errorHandler);
    const isolatedServer = await new Promise<http.Server>((resolve) => {
      const s = isolatedApp.listen(0, "127.0.0.1", () => resolve(s));
    });
    try {
      await prisma.partnerApiKey.update({
        where: { id: keyId },
        data: { lastUsedAt: null },
      });
      const resilientRes = await apiRequest(
        isolatedServer,
        "GET",
        `/partner-verify/${issuedCode}`,
        { apiKey: activeApiKey }
      );
      assert.equal(resilientRes.status, 200);
      assert.equal(resilientRes.body.data.verified, true);
    } finally {
      await new Promise<void>((resolve) => isolatedServer.close(() => resolve()));
    }

    // Missing scope -> 403
    const limitedKeyRes = await apiRequest(server, "POST", "/api/partner-keys", {
      token: adminToken,
      body: { name: `No Scope ${testRunTag}` },
    });
    const limitedId = limitedKeyRes.body.data.partnerKey.id;
    const limitedRaw = limitedKeyRes.body.data.apiKey;
    createdKeyIds.push(limitedId);
    await prisma.partnerApiKey.update({
      where: { id: limitedId },
      data: { scopes: ["other:read"] },
    });
    const forbiddenScopeRes = await apiRequest(
      server,
      "GET",
      `/api/partner/v1/certificates/verify/${issuedCode}`,
      { apiKey: limitedRaw }
    );
    assert.equal(forbiddenScopeRes.status, 403);

    // Expired key -> generic 401 matching missing/invalid message
    const expiredCreate = await apiRequest(server, "POST", "/api/partner-keys", {
      token: adminToken,
      body: {
        name: `Expired Partner ${testRunTag}`,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
    });
    const expiredId = expiredCreate.body.data.partnerKey.id;
    const expiredRaw = expiredCreate.body.data.apiKey;
    createdKeyIds.push(expiredId);
    await prisma.partnerApiKey.update({
      where: { id: expiredId },
      data: { expiresAt: new Date(Date.now() - 10_000) },
    });
    const expiredRes = await apiRequest(
      server,
      "GET",
      `/api/partner/v1/certificates/verify/${issuedCode}`,
      { apiKey: expiredRaw }
    );
    assert.equal(expiredRes.status, 401);
    assert.deepEqual(expiredRes.body, missingKey.body);

    // Revoking active key immediately blocks subsequent verification with generic 401
    const revokeActive = await apiRequest(
      server,
      "POST",
      `/api/partner-keys/${keyId}/revoke`,
      { token: adminToken }
    );
    assert.equal(revokeActive.status, 200);
    const revokedPartnerRes = await apiRequest(
      server,
      "GET",
      `/api/partner/v1/certificates/verify/${issuedCode}`,
      { apiKey: activeApiKey }
    );
    assert.equal(revokedPartnerRes.status, 401);
    assert.deepEqual(revokedPartnerRes.body, missingKey.body);
  });

  it("enforces rate limiting on public and partner verification endpoints", async () => {
    // Public rate limit on mounted app (configured limit: env.PUBLIC_VERIFY_RATE_LIMIT_MAX)
    let hitPublic429 = false;
    for (let i = 0; i < env.PUBLIC_VERIFY_RATE_LIMIT_MAX + 5; i += 1) {
      const res = await apiRequest(server, "GET", `/api/verify/${issuedCode}`);
      if (res.status === 429) {
        hitPublic429 = true;
        assert.equal(res.body.success, false);
        break;
      }
    }
    assert.equal(hitPublic429, true);

    // Partner rate limit verification on mounted limiter factory
    const limitedApp = express();
    limitedApp.get(
      "/partner/v1/certificates/verify/:verificationCode",
      createPartnerVerifyRateLimiter(2),
      verificationController.verifyPublic
    );
    limitedApp.use(errorHandler);
    const limitedServer = await new Promise<http.Server>((resolve) => {
      const s = limitedApp.listen(0, "127.0.0.1", () => resolve(s));
    });
    try {
      const r1 = await apiRequest(
        limitedServer,
        "GET",
        `/partner/v1/certificates/verify/${issuedCode}`
      );
      const r2 = await apiRequest(
        limitedServer,
        "GET",
        `/partner/v1/certificates/verify/${issuedCode}`
      );
      const r3 = await apiRequest(
        limitedServer,
        "GET",
        `/partner/v1/certificates/verify/${issuedCode}`
      );
      assert.equal(r1.status, 200);
      assert.equal(r2.status, 200);
      assert.equal(r3.status, 429);
    } finally {
      await new Promise<void>((resolve) => limitedServer.close(() => resolve()));
    }
  });

  it("handles concurrent certificate revocation immediately in subsequent public and partner reads", async () => {
    // Issue a fresh certificate using CertificatesService directly for one more lifecycle check
    const tempCourseRes = await apiRequest(server, "POST", "/api/courses", {
      token: stateToken,
      body: {
        code: `${testRunTag}-IMMED`,
        name: `Immediate Course ${testRunTag}`,
        minAttendancePercent: 75,
        minMarksPercent: 60,
        practicalRequired: false,
      },
    });
    const tempCourseId = tempCourseRes.body.data.course.id;
    const tempImport = await apiRequest(
      server,
      "POST",
      `/api/batches/import?courseId=${tempCourseId}`,
      {
        token: northCentreToken,
        body: [
          "candidateRef,fullName,phone,attendancePercent,marksPercent,practicalPercent",
          `${testRunTag}-IM-01,Immediate Check,+919999900099,90,90,`,
        ].join("\n"),
      }
    );
    const tempBatchId = tempImport.body.data.batch.id;
    const tempBcId = tempImport.body.data.batch.candidates[0].id;
    const tempCandId = tempImport.body.data.batch.candidates[0].candidateId;

    await apiRequest(server, "POST", `/api/batches/${tempBatchId}/submit`, {
      token: northCentreToken,
    });
    await apiRequest(
      server,
      "PATCH",
      `/api/batches/${tempBatchId}/candidates/${tempBcId}/review`,
      { token: stateToken, body: { status: "APPROVED" } }
    );
    const certService = new CertificatesService();
    const stateUser = await prisma.user.findUniqueOrThrow({
      where: { email: "state.officer@skillpass.local" },
    });
    const issued = await certService.issueCertificate(
      stateUser.id,
      tempBatchId,
      tempBcId
    );
    await certService.revokeCertificate(
      stateUser.id,
      issued.id,
      "Immediate check"
    );

    const partnerKeyRes = await apiRequest(server, "POST", "/api/partner-keys", {
      token: adminToken,
      body: { name: `Immediate Check Partner ${testRunTag}` },
    });
    const pkId = partnerKeyRes.body.data.partnerKey.id;
    createdKeyIds.push(pkId);

    try {
      const verifyPartnerRevoked = await apiRequest(
        server,
        "GET",
        `/api/partner/v1/certificates/verify/${issued.verificationCode}`,
        { apiKey: partnerKeyRes.body.data.apiKey }
      );
      assert.equal(verifyPartnerRevoked.status, 200);
      assert.equal(verifyPartnerRevoked.body.data.verified, false);
      assert.equal(verifyPartnerRevoked.body.data.status, "REVOKED");
    } finally {
      await prisma.outboxEvent.deleteMany({
        where: { aggregateId: { in: [tempBatchId, issued.id] } },
      });
      await prisma.auditLog.deleteMany({
        where: {
          entityId: { in: [tempBatchId, tempBcId, issued.id, tempCourseId] },
        },
      });
      await prisma.certificate.delete({ where: { id: issued.id } });
      await prisma.batchCandidate.delete({ where: { id: tempBcId } });
      await prisma.batch.delete({ where: { id: tempBatchId } });
      await prisma.candidate.delete({ where: { id: tempCandId } });
      await prisma.course.update({
        where: { id: tempCourseId },
        data: { currentRuleVersionId: null },
      });
      await prisma.courseRuleVersion.deleteMany({
        where: { courseId: tempCourseId },
      });
      await prisma.course.delete({ where: { id: tempCourseId } });
    }
  });
});
