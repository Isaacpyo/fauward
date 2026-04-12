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

# ── Stage 2: Production image ─────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules  ./node_modules
COPY --from=builder /app/apps/backend/dist    ./apps/backend/dist
COPY --from=builder /app/apps/backend/prisma  ./apps/backend/prisma

EXPOSE 3001
CMD ["node", "apps/backend/dist/server.js"]
