# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copy root workspace manifest + every workspace's package.json
# (npm workspaces requires all package.json files present before `npm ci`)
COPY package*.json ./
COPY apps/backend/package*.json       apps/backend/
COPY apps/frontend/package*.json      apps/frontend/
COPY apps/tenant-portal/package*.json apps/tenant-portal/
COPY apps/super-admin/package*.json   apps/super-admin/
COPY apps/agents/package*.json        apps/agents/
COPY packages/brand/package*.json           packages/brand/
COPY packages/design-tokens/package*.json   packages/design-tokens/
COPY packages/domain-types/package*.json    packages/domain-types/
COPY packages/formatting/package*.json      packages/formatting/
COPY packages/shared-types/package*.json    packages/shared-types/
COPY packages/theme-engine/package*.json    packages/theme-engine/
COPY packages/tracking-core/package*.json   packages/tracking-core/
COPY packages/pricing-core/package*.json    packages/pricing-core/
COPY packages/relay-api/package*.json       packages/relay-api/
COPY packages/internal-audit/package*.json  packages/internal-audit/
COPY packages/internal-rbac/package*.json   packages/internal-rbac/

RUN npm ci

# ── Backend source ─────────────────────────────────────────────────────────────
COPY apps/backend/src         apps/backend/src
COPY apps/backend/tsconfig.json apps/backend/tsconfig.json
COPY apps/backend/prisma      apps/backend/prisma

# ── Workspace package sources ──────────────────────────────────────────────────
# Packages whose `main` points to src/index.ts — TypeScript resolves them directly
COPY packages/shared-types/src    packages/shared-types/src
COPY packages/domain-types/src    packages/domain-types/src
COPY packages/formatting/src      packages/formatting/src
COPY packages/theme-engine/src    packages/theme-engine/src
COPY packages/tracking-core/src   packages/tracking-core/src
COPY packages/pricing-core/src    packages/pricing-core/src
COPY packages/relay-api/src       packages/relay-api/src

# Packages whose `main` points to dist/ — copy pre-built output
COPY packages/internal-audit/dist  packages/internal-audit/dist
COPY packages/internal-rbac/dist   packages/internal-rbac/dist

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
