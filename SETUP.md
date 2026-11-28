# Local Setup Guide (Ubuntu)

This guide runs the entire SkillPass stack locally using Docker containers. You do **not** need to install Node.js, npm, or PostgreSQL on your Ubuntu machine, and you do **not** need to create a `.env` file manually.

---

## 1. Prerequisites

Install **Docker Engine** and the **Docker Compose plugin** on Ubuntu following the official Docker repository instructions (`docker-ce`, `docker-ce-cli`, `containerd.io`, `docker-compose-plugin`), then verify both work:

```bash
docker --version
docker compose version
```

Make sure your user can run Docker commands (for example via the `docker` group or `sudo`).

---

## 2. Start the Application

From the repository root, build and start all services in detached mode:

```bash
docker compose up --build -d
```

What happens automatically on startup:
1. `postgres` (`postgres:16-alpine`) starts with a persistent `postgres_data` volume and waits until healthy.
2. `backend` applies existing Prisma database migrations (`prisma migrate deploy`), idempotently seeds permissions, roles, demo training centres, courses, and demo accounts (`prisma/seed.ts`), and starts the API server + internal outbox worker on port `5000`.
3. `frontend` builds the React application, serves it with Nginx on port `5173`, and proxies `/api/*`, `/api-docs`, and `/openapi.yaml` to the backend service over the Compose network.

> **Environment note:** When no `.env` file is present, `docker-compose.yml` supplies safe **development-only fallback values** for secrets and configuration. You can optionally create a `.env` file (or copy `.env.example`) to override variables locally. **Never use the fallback secrets outside local development.**

---

## 3. Application URLs

Once containers report healthy:

- **Frontend Web App:** http://localhost:5173
- **Public Certificate Verification Page:** http://localhost:5173/verify
- **Swagger UI API Docs:** http://localhost:5000/api-docs (also reachable via frontend proxy at http://localhost:5173/api-docs)
- **OpenAPI 3.0 Spec:** http://localhost:5000/openapi.yaml
- **Backend Health Check:** http://localhost:5000/api/health
- **Outbox Status Summary:** http://localhost:5000/api/health/outbox
- **PostgreSQL (local loopback):** `127.0.0.1:5433`

---

## 4. Check Status, View Logs, and Stop

Check container status and health checks:

```bash
docker compose ps
```

Stream live logs from all services (or a specific service such as `backend`):

```bash
docker compose logs -f
docker compose logs -f backend
```

Stop containers while preserving database data:

```bash
docker rm -f hackkit-frontend hackkit-backend hackkit-postgres
```

Stop containers **and delete the PostgreSQL data volume** for a clean reset:

```bash
docker compose down -v
```

---

## 5. Seeded Demo Accounts (Local/Demo Only)

> **Warning:** These accounts and their shared password are **for local development and demo testing only**, you can use them for testing the application after you have cloned the repo and ran docker compose commad which starts the services and seeds these test accounts by default. Do not expose or reuse them in any deployed or production environment.

All seeded demo accounts share the default demo password:

- **Password:** `SkillPassDemo123!`

| Email | Role | Scope / Purpose |
| --- | --- | --- |
| `state.officer@skillpass.local` | `STATE_OFFICE` | Cross-centre courses & rule versions, review candidates, issue/revoke certificates, manage partner API keys, access bulk verification demo |
| `centre.north@skillpass.local` | `TRAINING_CENTER` | Scoped to **North Skill Academy** (`TC-NORTH-01`): import CSV batches, submit draft batches, view centre batches & PDFs |
| `centre.south@skillpass.local` | `TRAINING_CENTER` | Scoped to **South Technical Institute** (`TC-SOUTH-01`): import CSV batches, submit draft batches, view centre batches & PDFs |
| `district.north@skillpass.local` | `DISTRICT_OFFICER` | Scoped to **North District** (`DIST-NORTH`): seeded with zero operational permissions for negative RBAC testing |

> Public self-registration (`/register` or `POST /api/auth/register`) assigns the `MEMBER` role only. If you want an `ADMIN` user locally, register a user first and run `docker compose exec backend npm run user:promote-admin -- user@example.com`.
