# Fauward — Replit Project

## Overview
White-label logistics SaaS platform. Monorepo with multiple apps.

## Architecture

### Apps
- **`apps/frontend`** — Next.js 14 marketing/signup site (port 5000, webview)
- **`apps/backend`** — Fastify API server (port 3001, console)
- **`apps/super-admin`** — Vite React super-admin panel
- **`apps/driver`** — Vite React driver mobile app
- **`apps/admin`** — Admin app (minimal)
- **`apps/tenant-portal`** — Tenant portal

### Packages (shared)
- `packages/shared-types` — Shared TypeScript types
- `packages/domain-types` — Domain-specific types
- `packages/formatting` — Formatting utilities
- `packages/design-tokens` — Design tokens
- `packages/brand` — Brand config
- `packages/theme-engine` — Theme engine

## Workflows
- **Start application** — runs `cd apps/frontend && npm install && npm run dev` on port 5000

## Package Manager
npm (npm workspaces monorepo)

## Required Environment Variables
The **frontend** requires:
- (none mandatory — `BACKEND_URL` is optional for registration proxy)

The **backend** requires:
- `DATABASE_URL` — PostgreSQL connection string (already set via Replit DB)
- `REDIS_URL` — Redis connection URL
- `JWT_ACCESS_SECRET` — JWT signing secret (min 16 chars)
- `JWT_REFRESH_SECRET` — JWT refresh secret (min 16 chars)
- `JWT_ACCESS_EXPIRES_IN` — defaults to `15m`
- `JWT_REFRESH_EXPIRES_IN` — defaults to `7d`

## Replit Configuration
- Frontend runs on port 5000 (required for Replit webview)
- Backend runs on port 3001
- Node.js 20 installed
