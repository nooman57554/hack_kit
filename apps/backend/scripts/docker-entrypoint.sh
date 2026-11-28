#!/bin/sh
set -eu

echo "[backend] Running Prisma migrations..."
npx prisma migrate deploy --schema=./prisma/schema.prisma

echo "[backend] Seeding database demo data idempotently..."
npx tsx prisma/seed.ts

echo "[backend] Starting backend server and outbox worker..."
exec node dist/server.js
