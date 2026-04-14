# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copy root workspace manifest + all app/package manifests
# (npm workspaces requires every workspace's package.json to be present)
COPY package*.json ./
COPY apps/backend/package*.json      apps/backend/
COPY apps/frontend/package*.json     apps/frontend/
COPY apps/tenant-portal/package*.json apps/tenant-portal/
COPY apps/super-admin/package*.json  apps/super-admin/
COPY apps/driver/package*.json       apps/driver/
COPY packages/brand/package*.json           packages/brand/
COPY packages/design-tokens/package*.json   packages/design-tokens/
COPY packages/domain-types/package*.json    packages/domain-types/
COPY packages/formatting/package*.json      packages/formatting/
COPY packages/shared-types/package*.json    packages/shared-types/
COPY packages/theme-engine/package*.json    packages/theme-engine/

RUN npm ci

# Copy only backend source + prisma schema
COPY apps/backend/src      apps/backend/src
COPY apps/backend/tsconfig.json apps/backend/tsconfig.json
COPY apps/backend/prisma   apps/backend/prisma

# Generate Prisma client then compile TypeScript
RUN cd apps/backend && npx prisma generate && npm run build

# Install backend production deps in an isolated directory (no workspace hoisting issues)
RUN mkdir /prod && cp apps/backend/package.json /prod/ && \
    cd /prod && npm install --omit=dev

# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production

# Backend package.json declares "type":"module" — required for ESM
COPY --from=builder /app/apps/backend/package.json ./package.json

# Production node_modules from isolated install (all deps guaranteed present)
COPY --from=builder /prod/node_modules ./node_modules

# Compiled output and Prisma schema
COPY --from=builder /app/apps/backend/dist/   ./dist/
COPY --from=builder /app/apps/backend/prisma/ ./prisma/

# Re-generate Prisma client against the production node_modules
RUN npx prisma generate

EXPOSE 3001
CMD ["node", "dist/server.js"]
