# SkillPass

SkillPass is a full-stack skill-certification management and verification platform built with React, TypeScript, Vite, Express 5, Prisma, and PostgreSQL.

## Implemented Features

- **Authentication & RBAC:** JWT login/registration, database-backed roles and fine-grained permissions (`ADMIN`, `STATE_OFFICE`, `TRAINING_CENTER`, `DISTRICT_OFFICER`, `MANAGER`, `MEMBER`), and centre/district scope enforcement.
- **Course & Rule Versioning:** State Office creation of courses and immutable qualifying rule versions (`minAttendancePercent`, `minMarksPercent`, `practicalRequired`, `minPracticalPercent`).
- **Batch Import & Candidate Review:** Centre-scoped CSV candidate import capturing immutable candidate/rule snapshots, automated qualification evaluation, draft submission (`DRAFT` → `SUBMITTED`), and per-candidate review (`APPROVED` / `REJECTED`).
- **Certificate Lifecycle:** Atomic issuance with non-sequential verification codes (`SP-<8HEX>-<8HEX>`), pure-Node `pdfkit` PDF generation stored in PostgreSQL `BYTEA`, scoped PDF download, and idempotent revocation.
- **Public & Partner Verification:** Unauthenticated `GET /api/verify/:verificationCode`, `/verify` frontend lookup page, versioned partner API (`GET /api/partner/v1/certificates/verify/:verificationCode` and bulk `POST /api/partner/v1/certificates/verify-bulk`), rate limiting, and `X-API-Key` authentication using keyed HMAC-SHA-256 hashes.
- **Partner Key Management & Demo UI:** `/partner-keys` (for `ADMIN` and `STATE_OFFICE`) with one-time secret reveal, listing, and revocation; `/partner-verify-demo` integration-testing page for bulk verification.
- **Transactional Outbox Processing:** In-process worker claiming `CERTIFICATE_ISSUED` and `CERTIFICATE_REVOKED` events with PostgreSQL `FOR UPDATE SKIP LOCKED`, leases, capped exponential backoff, dead-letter handling, and `/api/health/outbox`.

## Architecture & Request Flow

```text
Browser / Client (http://localhost:5173)
  │
  ▼
Frontend Container (Nginx serving React/Vite bundle)
  │  proxies /api/*, /api-docs, /openapi.yaml
  ▼
Backend Container (Express 5 API + OutboxWorker on :5000)
  ├── Public & Partner Verification (rate-limited, read-only)
  ├── Staff / Admin APIs (Bearer JWT + DB RBAC)
  └── Transactional Writes + OutboxWorker (FOR UPDATE SKIP LOCKED)
        │
        ▼
PostgreSQL 16 (relational tables, certificate PDF BYTEA, audit_logs, outbox_events)
```

## Quick Start (Docker Compose)

Start PostgreSQL, backend (runs migrations and seeds demo data automatically), and frontend with one command:

```bash
docker compose up --build -d
```

See [SETUP.md](./SETUP.md) for prerequisites, URLs, logs, and demo accounts.

## Documentation

- **Local Setup Guide:** [SETUP.md](./SETUP.md)
- **API Reference:** [`docs/openapi.yaml`](./docs/openapi.yaml) and interactive Swagger UI at `/api-docs` (`http://localhost:5000/api-docs` or `http://localhost:5173/api-docs`)
- **Production Planning Guide:** [DEPLOYMENT.md](./DEPLOYMENT.md)

## Implemented / Demo Scope vs. Deferred Work

- **Implemented for local evaluation:** Synchronous PostgreSQL `BYTEA` PDF storage, in-process rate limiting (`express-rate-limit`), single-process `OutboxWorker` logging internal certificate events, seeded demo accounts, and the `/partner-verify-demo` bulk verification UI.
- **Deferred / not implemented:** External WhatsApp/SMS notifications, outbound partner webhook delivery, standalone worker/verification microservices, external message brokers, and external PDF object storage.
