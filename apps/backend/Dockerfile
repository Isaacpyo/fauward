# Backend image. Build context: repository root.
#   docker build -f apps/backend/Dockerfile .
#
# Workspace packages (@fauward/*) come only from this repository, never from the npm registry:
# the @fauward scope is not registered on npm, so a registry install would 404 or, worse,
# pull a package someone else published under that name.

# ── Stage 1: workspace manifests only, so `npm ci` stays cached until a package.json changes ──
FROM node:24-alpine AS manifests
WORKDIR /src
COPY . .
RUN mkdir -p /out && for f in package.json package-lock.json apps/*/package.json packages/*/package.json; do \
      mkdir -p "/out/$(dirname "$f")" && cp "$f" "/out/$f"; \
    done

# ── Stage 2: install, generate, build ──
FROM node:24-alpine AS builder
# Prisma picks its query engine from the OpenSSL it finds; match the runtime stage (openssl 3).
RUN apk add --no-cache openssl
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=1 \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    CYPRESS_INSTALL_BINARY=0 \
    HUSKY=0
COPY --from=manifests /out/ ./
RUN npm ci --no-audit --no-fund

COPY packages/ packages/
COPY apps/backend/ apps/backend/

# internal-audit and internal-rbac resolve to dist/, which is not committed: build them here.
RUN cd apps/backend && npx prisma generate
RUN npm run build --workspace=@fauward/internal-rbac --workspace=@fauward/internal-audit
RUN npm run build --workspace=@fauward/backend

# ── Stage 3: runtime ──
FROM node:24-alpine
RUN apk add --no-cache openssl wget
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/backend/package.json ./apps/backend/package.json
# npm leaves deps whose versions clash with other workspaces (e.g. @fastify/jwt) un-hoisted here
COPY --from=builder /app/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/backend/prisma ./apps/backend/prisma
# documents.service.ts reads HTML templates from <cwd>/src/modules/documents/templates
COPY --from=builder /app/apps/backend/src ./apps/backend/src

WORKDIR /app/apps/backend
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT:-3001}/health" >/dev/null || exit 1
# tracking-core, pricing-core, relay-api and theme-engine ship TypeScript sources (main: src/index.ts),
# so the compiled backend loads them through the tsx loader.
CMD ["node", "--import", "tsx", "dist/server.js"]
