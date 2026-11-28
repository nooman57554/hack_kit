# Hack Kit

Reusable full-stack starter kit for hackathon development.

## Stack

- React + TypeScript + Vite
- Node.js + Express + TypeScript
- Tailwind CSS
- React Router
- TanStack Query
- PostgreSQL (Prisma ORM)
- Redis
- Docker Compose

## Prerequisites

- Node.js
- npm
- Docker
- Docker Compose

## Installation

Install dependencies:

    npm install

Create environment configuration:

    cp .env.example .env

Start infrastructure:

    docker compose up -d

Run database migrations and seed default roles/permissions:

    npm run db:migrate
    npm run db:seed

Start frontend and backend:

    npm run dev

## Development URLs

- Frontend: http://localhost:5173
- Backend: http://localhost:5000
- Backend health: http://localhost:5000/api/health
- PostgreSQL: localhost:5433
- Redis: localhost:6379

---

## Authentication & RBAC API

### 1. Register a New User

**Endpoint:** `POST /api/auth/register`  
**Rate Limit:** 5 requests per 15 minutes per IP.  
**Default Role:** Automatically assigns `MEMBER`.

**Request Body:**
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "password": "securepassword123"
}
```

**Success Response (HTTP 201 Created):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "c7a84022-f04b-4a3e-b7d1-e6556c5a3d7e",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "createdAt": "2026-11-21T02:00:00.000Z",
      "updatedAt": "2026-11-21T02:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Responses:**
- `400 Bad Request`: Input validation failed (e.g., password shorter than 8 characters, invalid email format).
- `409 Conflict`: Email address is already registered.
- `429 Too Many Requests`: Registration rate limit exceeded.

---

### 2. Login

**Endpoint:** `POST /api/auth/login`  
**Rate Limit:** 10 requests per 15 minutes per IP.

**Request Body:**
```json
{
  "email": "jane@example.com",
  "password": "securepassword123"
}
```

**Success Response (HTTP 200 OK):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "c7a84022-f04b-4a3e-b7d1-e6556c5a3d7e",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "createdAt": "2026-11-21T02:00:00.000Z",
      "updatedAt": "2026-11-21T02:00:00.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid email or password (generic message protecting against user enumeration).
- `429 Too Many Requests`: Login rate limit exceeded.

---

### 3. Get Current User (`/api/auth/me`)

**Endpoint:** `GET /api/auth/me`  
**Authentication:** Required (Bearer token).

**Headers:**
```http
Authorization: Bearer <your_access_token>
```

**Success Response (HTTP 200 OK):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "c7a84022-f04b-4a3e-b7d1-e6556c5a3d7e",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "createdAt": "2026-11-21T02:00:00.000Z",
      "updatedAt": "2026-11-21T02:00:00.000Z",
      "roles": ["MEMBER"],
      "permissions": [
        "tasks.read",
        "tasks.create",
        "tasks.update"
      ]
    }
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Missing, invalid, or expired Bearer token.
- `404 Not Found`: Authenticated user no longer exists in database.

---

### 4. Using the Bearer Token for Protected Endpoints

All protected endpoints require the JWT returned from registration or login to be passed in the `Authorization` header:

```bash
curl -X GET http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer <your_token_here>"
```

---

### 5. First Administrator Bootstrap

By design, public registration only assigns the `MEMBER` role. To promote an already registered user to `ADMIN`, run the CLI command:

From repository root:
```bash
npm run user:promote-admin -- user@example.com
```

Or from `apps/backend`:
```bash
npm run user:promote-admin user@example.com
```

**Requirements:**
- The target user must already be registered.
- Assigns the `ADMIN` role idempotently without removing any existing roles.

---

## Certificate Verification & Partner API

The system supports public verification (`GET /api/verify/:verificationCode`), a versioned read-only partner API (`GET /api/partner/v1/certificates/verify/:verificationCode`), and administrator-managed partner API keys. Public verification routes are also exposed in the frontend at `/verify` and `/verify/:verificationCode`.

### 1. Public Certificate Verification

**Endpoint:** `GET /api/verify/:verificationCode`  
**Authentication:** None (public, read-only).  
**Rate Limit:** `PUBLIC_VERIFY_RATE_LIMIT_MAX` (default `30` requests per 15 minutes per IP) returning `429 Too Many Requests`.  
**Caching:** Responds with `Cache-Control: no-store, max-age=0` and `Pragma: no-cache` so revocations take effect immediately.

**Valid Issued Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "verified": true,
    "status": "ISSUED",
    "verificationCode": "SP-ABCD1234-EF567890",
    "issuedAt": "2026-11-28T07:00:00.000Z",
    "course": "Full-Stack Web Development",
    "trainingCentre": "North Skill Academy"
  }
}
```

**Revoked Certificate Response (`200 OK`):**
```json
{
  "success": true,
  "data": {
    "verified": false,
    "status": "REVOKED",
    "verificationCode": "SP-ABCD1234-EF567890",
    "issuedAt": "2026-11-28T07:00:00.000Z",
    "course": "Full-Stack Web Development",
    "trainingCentre": "North Skill Academy",
    "revokedAt": "2026-11-28T08:30:00.000Z"
  }
}
```

**Unknown or Malformed Code (`404 Not Found`):**
Both unknown codes and invalid/partial code formats return the identical not-found response without exposing candidate PII, internal IDs, PDF bytes, or lookup details:
```json
{
  "success": false,
  "error": {
    "message": "Certificate not found"
  }
}
```

---

### 2. Partner Verification API (`v1`)

**Endpoint:** `GET /api/partner/v1/certificates/verify/:verificationCode`  
**Authentication:** `X-API-Key: <prefix>.<secret>` header.  
**Required Scope:** `certificates:verify` (assigned to valid, non-expired, non-revoked partner keys).  
**Rate Limit:** `PARTNER_VERIFY_RATE_LIMIT_MAX` (default `120` requests per 15 minutes per IP) returning `429 Too Many Requests`.  
**Caching:** `Cache-Control: no-store, max-age=0`, `Pragma: no-cache`.

```bash
curl -X GET http://localhost:5000/api/partner/v1/certificates/verify/SP-ABCD1234-EF567890 \
  -H "X-API-Key: sppk_000000000000.<generated-secret>"
```

- Returns the exact same minimal read-only payload as `GET /api/verify/:verificationCode`.
- Invalid, missing, expired, or revoked partner keys all fail with a generic `401 Unauthorized` (`"Invalid partner API key"`). Keys missing `certificates:verify` fail with `403 Forbidden`.
- **Read-only boundary:** Partner API keys are strictly read-only credentials for verification. They are not JWT user sessions and **cannot** access internal batch records, candidate details, certificate PDF downloads, certificate issuance, revocation, or key management routes.

---

### 3. Administrator Partner API Key Management

All key-management endpoints require JWT authentication plus explicit RBAC permissions (`ADMIN` role by default):
- `partner_keys.manage` — `POST /api/partner-keys`, `POST /api/partner-keys/:keyId/revoke`
- `partner_keys.read` — `GET /api/partner-keys`

#### Create a Partner API Key (`POST /api/partner-keys`)
- Validates `name` (1–100 chars), `scopes` (currently only `["certificates:verify"]`), and optional future `expiresAt` (ISO-8601 datetime).
- Generates a high-entropy key using Node.js `crypto.randomBytes` and stores only a non-secret `prefix` (`sppk_<12-hex>`) and keyed HMAC-SHA-256 digest (`secretHash`, keyed via `PARTNER_KEY_HASH_SECRET` or domain-separated derivation from `JWT_SECRET`).
- **One-time secret disclosure:** `data.apiKey` is returned **only once** in the `201 Created` creation response and is never logged or retrievable afterwards.

#### List Partner API Keys (`GET /api/partner-keys`)
- Returns key metadata (`id`, `name`, `prefix`, `scopes`, `status` [`ACTIVE` | `REVOKED` | `EXPIRED`], `createdById`, `createdAt`, `expiresAt`, `revokedById`, `revokedAt`, `lastUsedAt`, `updatedAt`). Never returns secrets or hashes.

#### Revoke a Partner API Key (`POST /api/partner-keys/:keyId/revoke`)
- Revokes the key immediately and idempotently, creating an `AuditLog` entry (`PARTNER_KEY_REVOKED`) without secret material. Subsequent partner API requests using that key fail immediately with `401 Unauthorized`.

### Database Migration Note

After pulling changes that add `PartnerApiKey` and RBAC permissions (`partner_keys.read`, `partner_keys.manage`), run:
```bash
npm run db:migrate
npm run db:seed
```

