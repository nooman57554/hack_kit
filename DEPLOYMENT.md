# Production Deployment & Architecture Planning Guide

This document separates **what SkillPass implements today** from **what would be required to operate reliably in production**. It does **not** select a cloud provider, region, instance size, managed database service, or external broker; those infrastructure decisions remain open and should be made using the technical criteria below.

---

## 1. Current State vs. Target Planning Scale

### What Exists Today (Verified in Code)
- **Single-process Express 5 backend** (`apps/backend`) serving staff/admin REST APIs, public verification, partner verification (`v1`), Swagger UI, and certificate PDF streaming.
- **Single in-process `OutboxWorker`** started alongside the HTTP server (`OUTBOX_POLL_INTERVAL_MS=2000`, `OUTBOX_BATCH_SIZE=10`), handling `CERTIFICATE_ISSUED` and `CERTIFICATE_REVOKED` via internal structured logs only.
- **Single PostgreSQL 16 database** storing transactional domain data, `BYTEA` PDF bytes (`certificates.pdfBytes`), `audit_logs`, and `outbox_events`.
- **In-memory `express-rate-limit` counters** per backend process (register: `5/15m`, login: `10/15m`, public verify: `30/15m`, partner single verify: `120/15m`, partner bulk verify: `30/15m`).
- **Synchronous PDF generation** using `pdfkit` inside `CertificatesService.issueCertificate`.
- **Deferred / unimplemented integrations:** External WhatsApp/SMS notifications and outbound partner webhooks are **not implemented**.

### Target Planning Requirements (Not Yet Load-Tested)
The current single-node Docker Compose implementation has **not** been load-tested against production volume. Architecture sizing and changes should be planned against these targets:
- **200,000** registered users and **20,000** daily active users (DAU).
- **800 batches/hour**, generating approximately **60,000 PDFs/hour** and **60,000 outbound messages/hour** (~16.7 certificates/sec sustained, higher under batch bursts).
- **50 partner portals** consuming verification APIs.
- Up to **2,000,000 verifications/day** (~23 req/sec average, potentially hundreds to 1,000+ req/sec during bursts).

---

## 2. Production Gap Analysis & Technical Decision Criteria

### A. API Capacity & Stateless Scaling
- **Current limitation:** Single backend Node.js instance; in-memory `express-rate-limit` state does not synchronize across replicas, and Express does not configure `trust proxy` by default (required behind TLS load balancers so client IPs are not collapsed to the proxy IP).
- **Required changes & open decisions:**
  - Configure Express `trust proxy` strictly for trusted reverse proxies/load balancers.
  - Run multiple stateless API replicas behind a Layer-7 load balancer/ingress with `/api/health` readiness/liveness probes.
  - Replace per-process rate-limit memory stores with either a shared external rate-limit store or edge/API gateway throttling so partner and public quotas stay accurate across replicas.

### B. Database Performance & Isolation
- **Current limitation:** One PostgreSQL instance handles OLTP batch imports/issuance, verification lookups (2M/day target), PDF binary reads/writes, and outbox polling simultaneously.
- **Required changes & open decisions:**
  - Add connection pooling (e.g., external pooler or calibrated Prisma pool limits) sized to avoid exhausting DB `max_connections` across API and worker replicas.
  - Evaluate isolating verification read load (e.g., PostgreSQL read replica for verification reads or a dedicated read model), ensuring replication lag or cache TTL does **not** serve stale `ISSUED` status after certificate revocation.
  - Benchmark composite indexes on `certificates(verificationCode)`, `batches(trainingCenterId, createdAt)`, `partner_api_keys(prefix)`, and `outbox_events(status, availableAt, createdAt)`.

### C. PDF Generation, Storage, and Retention
- **Current limitation:** `pdfkit` generates PDFs synchronously on the API request path and stores binary `BYTEA` directly in `certificates.pdfBytes`. At ~60,000 PDFs/hour (~1.44M/day if sustained, ~144M+ bytes/hour even for small 2.4 KB PDFs, or much higher with richer templates), storing blobs in PostgreSQL bloats table size, vacuum overhead, WAL volume, and backups.
- **Required changes & open decisions:**
  - Decide whether to move PDF rendering to asynchronous worker jobs triggered by `CERTIFICATE_ISSUED` outbox events and store generated PDFs in durable object storage with a lifecycle/retention policy, keeping PostgreSQL focused on metadata and hashes/keys.
  - Define retention, archival, and audit-export requirements for historical `BatchCandidate` snapshots, PDFs, `AuditLog`, and processed `OutboxEvent` rows (partitioning or archival pruning policy).

### D. Outbox & Background Worker Throughput
- **Current limitation:** One worker polling every 2s for 10 events processes at most ~5 events/s when serial, well below 60,000 certificates + 60,000 notifications/hour (~33 events/s combined during peak hours plus retries).
- **Required changes & open decisions:**
  - Run dedicated worker processes (`OUTBOX_WORKER_ENABLED=false` on API containers so API nodes only serve HTTP traffic) leveraging the existing `FOR UPDATE SKIP LOCKED` lease model, OR introduce a durable message broker fed by an outbox relay when adding external SMS/WhatsApp/webhook workers.
  - Tune batch sizes, worker concurrency, poll intervals, and index maintenance on `outbox_events`.
  - Build operational replay/inspection tooling for `DEAD_LETTER` events before turning on customer-facing notifications.

### E. Verification Traffic & Rate Limits
- **Current limitation:** Default verification limits (`30/15m` public IP, `120/15m` partner single, `30/15m` partner bulk) are conservative for 2M verifications/day across 50 partner portals (~40,000 requests/day average per portal if evenly distributed, likely skewed toward bulk peaks).
- **Required changes & open decisions:**
  - Calibrate per-partner quotas (`PARTNER_VERIFY_RATE_LIMIT_MAX`, `PARTNER_BULK_VERIFY_RATE_LIMIT_MAX`) or implement per-key tiering at the API gateway.
  - Preserve `Cache-Control: no-store` semantics (or enforce active invalidation) on verification endpoints so revocations apply immediately.

### F. Monitoring, Backups & Recovery
- **Required changes:**
  - Emit structured logs and metrics (HTTP latency/error rates, DB pool saturation, outbox `pending` depth, `oldestPendingAgeMs`, and `deadLetter` count via `/api/health/outbox` concepts) to a central observability stack with alerting.
  - Automate encrypted PostgreSQL backups with Point-in-Time Recovery (PITR) and regularly test restoration procedures (RPO/RTO targets chosen per operational SLA).

---

## 3. Failure Scenarios & Resilience Expectations

| Scenario | Current Behavior | Production Requirement / Mitigation |
| --- | --- | --- |
| **App container restart** | Express drains gracefully on `SIGINT`/`SIGTERM`; `OutboxWorker` stops claiming and waits for active cycle or releases unstarted leases. | Load balancer healthchecks drain traffic before termination; stateless replicas allow rolling restarts with zero downtime. |
| **PostgreSQL unavailability** | Healthcheck fails; startup entrypoint exits non-zero if migrations fail; API returns `500` on DB errors. | Managed HA primary with automatic failover, bounded DB connect/statement timeouts, and degraded readiness probes. |
| **Worker crash mid-processing** | Lease expires after `OUTBOX_LEASE_DURATION_MS`; next healthy worker reclaims the row atomically; idempotent handlers tolerate at-least-once delivery. | Maintain strict idempotency keys across all future notification/webhook providers; tune lease duration above normal job p99 latency. |
| **Outbox backlog / spikes** | Events wait safely in `PENDING`; capped exponential backoff isolates failing items; exhausted retries move to `DEAD_LETTER`. | Alert on `oldestPendingAgeMs` and `deadLetter > 0`; horizontally scale workers or relay to a durable broker; provide operator dead-letter replay. |
| **Partner webhook downtime (deferred)** | *Not yet implemented.* | Isolate partner delivery from core issuance via outbox/broker queues, per-partner circuit breakers, bounded timeouts, and dead-letter queues. |
| **SMS / WhatsApp outage (deferred)** | *Not yet implemented.* | Decouple delivery from certificate issuance transactions; support retry backoff, provider failover criteria, and delivery status tracking without blocking issuance. |

---

## 4. Security Checklist Before Production

- **Secrets management:** Inject `JWT_SECRET` and `PARTNER_KEY_HASH_SECRET` from a secrets manager or KMS; **never** reuse the Compose local fallback secrets or `.env` files on production hosts. Plan key-rotation procedures.
- **Disable demo credentials:** Do **not** run development seeding (`SkillPassDemo123!` demo accounts) in production environments; ensure initial `ADMIN` users are provisioned securely with strong credentials.
- **TLS & transport security:** Terminate TLS 1.2+ at the edge load balancer/reverse proxy (`Strict-Transport-Security`, HTTPS-only cookies/headers, internal service encryption as required).
- **Proxy IP handling:** Configure Express `trust proxy` explicitly so rate limiting and security logs reflect true caller IPs behind reverse proxies.
- **Partner API keys:** Keys use `crypto.randomBytes` secrets with keyed HMAC-SHA-256 hashes (`secretHash`), constant-time `timingSafeEqual`, one-time display on creation, scoped to `certificates:verify`, and support expiry and immediate revocation. Keep partner verification strictly isolated from JWT staff routes and PDF downloads.
- **Logging & PII hygiene:** Current verification endpoints, audit logs, and outbox error sanitization suppress candidate phone numbers, raw API keys, and PDF bytes. Ensure proxy access logs and future APM tooling also avoid logging sensitive headers (`Authorization`, `X-API-Key`) or personal fields in URL query strings.
- **Data retention:** Define statutory retention periods for candidate snapshots, issued/revoked certificates, audit logs, and outbox history before launch.
