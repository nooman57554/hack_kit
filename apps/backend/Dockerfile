FROM node:24-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/frontend/package.json ./apps/frontend/package.json

RUN npm ci --workspace=@hackkit/backend --include-workspace-root

COPY apps/backend ./apps/backend
COPY docs/openapi.yaml ./docs/openapi.yaml

RUN npx prisma generate --schema=apps/backend/prisma/schema.prisma \
  && npm run build --workspace=@hackkit/backend \
  && chmod +x /app/apps/backend/scripts/docker-entrypoint.sh

WORKDIR /app/apps/backend

EXPOSE 5000

ENTRYPOINT ["/app/apps/backend/scripts/docker-entrypoint.sh"]
