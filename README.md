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
