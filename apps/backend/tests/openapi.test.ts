import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import http from "node:http";
import { resolve } from "node:path";
import { after, before, describe, it } from "node:test";
import YAML from "yaml";
import app from "../src/app.js";

describe("OpenAPI specification and Swagger UI", () => {
  let server: http.Server;

  before(async () => {
    server = await new Promise((resolveServer) => {
      const s = app.listen(0, "127.0.0.1", () => resolveServer(s));
    });
  });

  after(async () => {
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
  });

  it("documents all implemented API paths in docs/openapi.yaml and serves /openapi.yaml and /api-docs", async () => {
    const specRaw = readFileSync(
      resolve(process.cwd(), "../../docs/openapi.yaml"),
      "utf8"
    );
    const parsed = YAML.parse(specRaw) as {
      openapi: string;
      paths: Record<string, Record<string, unknown>>;
    };

    assert.match(parsed.openapi, /^3\./);
    assert.equal(specRaw.toLowerCase().includes("redis"), false);

    const expectedRoutes: Array<[string, string]> = [
      ["/", "get"],
      ["/api/health", "get"],
      ["/api/health/outbox", "get"],
      ["/api/auth/register", "post"],
      ["/api/auth/login", "post"],
      ["/api/auth/me", "get"],
      ["/api/courses", "get"],
      ["/api/courses", "post"],
      ["/api/courses/{courseId}/rules", "get"],
      ["/api/courses/{courseId}/rules", "post"],
      ["/api/batches", "get"],
      ["/api/batches/import", "post"],
      ["/api/batches/{batchId}", "get"],
      ["/api/batches/{batchId}/submit", "post"],
      ["/api/batches/{batchId}/candidates/{batchCandidateId}/review", "patch"],
      [
        "/api/batches/{batchId}/candidates/{batchCandidateId}/certificate",
        "post",
      ],
      ["/api/certificates/{certificateId}/pdf", "get"],
      ["/api/certificates/{certificateId}/revoke", "post"],
      ["/api/verify/{verificationCode}", "get"],
      ["/api/partner/v1/certificates/verify/{verificationCode}", "get"],
      ["/api/partner/v1/certificates/verify-bulk", "post"],
      ["/api/partner-keys", "post"],
      ["/api/partner-keys", "get"],
      ["/api/partner-keys/{keyId}/revoke", "post"],
    ];

    for (const [pathKey, method] of expectedRoutes) {
      assert.ok(
        parsed.paths[pathKey]?.[method],
        `Missing ${method.toUpperCase()} ${pathKey} in docs/openapi.yaml`
      );
    }

    const addr = server.address() as { port: number };
    const [yamlRes, docsRes] = await Promise.all([
      fetch(`http://127.0.0.1:${addr.port}/openapi.yaml`),
      fetch(`http://127.0.0.1:${addr.port}/api-docs/`),
    ]);

    assert.equal(yamlRes.status, 200);
    assert.equal(docsRes.status, 200);
    const docsHtml = await docsRes.text();
    assert.match(docsHtml, /swagger-ui/i);
    assert.match(docsHtml, /SkillPass API Documentation/);

    const initJsRes = await fetch(
      `http://127.0.0.1:${addr.port}/api-docs/swagger-ui-init.js`
    );
    assert.equal(initJsRes.status, 200);
  });
});
