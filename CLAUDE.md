# Fauward

Multi-tenant B2B SaaS platform for logistics businesses (couriers, freight forwarders, 3PLs).
Owner: Temitope Agbola · Treny Limited · Active development.

## Stack

| Layer | Tech |
|---|---|
| API | Node 24 · Fastify · TypeScript · Prisma ORM |
| Database | PostgreSQL 15 (Supabase) + Redis 7 |
| Auth | JWT (access + refresh) · `@fastify/jwt` · `@fastify/cookie` |
| Frontend | Next.js 14 App Router (marketing site — fauward.com) |
| Tenant Portal | React 18 · Vite |
| Agents App | React 18 · Vite · PWA |
| Super Admin | React 18 · Vite |
| Build | Turborepo · npm workspaces (Node 24) |
| Queue | BullMQ on Redis |
| Email | SendGrid |
| Deploy | Oracle VM via Cloudflare Tunnel (backend + Python services, `scripts/prod-vm.sh`, docs/deploy-oracle-prod.md) · Vercel (frontends) |

## Monorepo

```
apps/
├── backend/          Fastify API — all routes, modules, middleware
├── frontend/         Next.js 14 — marketing site (fauward.com)
├── tenant-portal/    React/Vite — tenant ops portal
├── agents/           React/Vite PWA — field agent mobile app
├── fauward-Go/       Field logistics app
└── super-admin/      React/Vite — Fauward internal admin

packages/
├── brand/            brand.css — design tokens
├── shared-types/     Cross-app TypeScript types
├── domain-types/     Domain model types
├── theme-engine/     Tenant CSS variable injection
├── tracking-core/    Unified tracking types (TrackingEvent, TrackingSnapshot)
├── pricing-core/     Pricing engine types
└── formatting/       Currency, date, weight formatters

widget/               Vanilla JS embeddable tracking widget
```

## Key Commands

```bash
npm run dev                   # Start backend + frontend + tenant-portal + super-admin
npm run dev:backend           # Backend only (tsx watch)
npm run dev:frontend          # Frontend + tenant-portal only
npm run build                 # Build all workspaces via Turbo
npm run test                  # Run all tests (Vitest)
npm run lint                  # Lint all workspaces

# Prisma (run from root)
npm run prisma:migrate --workspace=apps/backend   # prisma migrate dev
npm run prisma:generate --workspace=apps/backend  # regenerate client
npm run tracking:migrate --workspace=apps/backend # run tracking migration script

# Local services
docker-compose up -d          # PostgreSQL 15, Redis 7, MailHog
```

## Backend Architecture

### Module structure (`apps/backend/src/modules/<name>/`)
Every module exports a `register*Routes(app: FastifyInstance)` function and is registered in `app.ts`.

### Multi-tenancy — CRITICAL
- Tenant resolved per-request via `tenantResolver` middleware (subdomain or `X-Tenant-Slug` header)
- Tenant context available via `getTenantContext()` (AsyncLocalStorage)
- `req.tenant` set after resolution · `req.user` set after JWT verification
- **Every single DB query must be scoped to `tenantId` — no exceptions**

### Prisma
- Client on `app.prisma` (Fastify plugin) · Schema: `apps/backend/prisma/schema.prisma`
- Never use raw SQL unless Prisma cannot express it

### Auth
- `app.authenticate` hook: verifies JWT Bearer, sets `req.user`
- `requireRole(['ROLE'])`: RBAC guard, used as `preHandler`
- Access token: short-lived JWT · Refresh token: httpOnly cookie

### Error handling
- Always use `app.httpErrors.*` from `@fastify/sensible`
- Never `throw new Error()` in route handlers

## Frontend (Next.js — `apps/frontend/`)
- App Router (`src/app/`) only — no Pages Router
- Server components by default; `'use client'` only when using hooks/events
- Tailwind CSS for all styling

## Forbidden Patterns

- NEVER query the DB without `tenantId` scope (tenant isolation leak)
- NEVER use `any` in TypeScript — use `unknown` or define the type
- NEVER commit secrets or `.env` files
- NEVER use `console.log` in production code — use Fastify logger (`req.log`, `app.log`)
- NEVER bypass `authenticate` or `requireRole` on protected routes
- NEVER use the Next.js Pages Router
- NEVER run `prisma migrate reset` — it wipes the database

## Docs

Full spec in `docs/` — **start with `docs/implementation-status.md`** for what to build next.

## Docker runs on the Oracle VM, never on this laptop
Full guide: `docs/vm-docker.md`. Short version:
- Never run `docker compose` or Docker Desktop locally. Use `bash scripts/vm-slot.sh`; it forces the `oracle` Docker context and runs `docker-compose.yml` plus `docker-compose.remote.yml` on the VM.
- Main checkout = slot 0 on the ports `docker-compose.yml` already uses (8000, 5432, 6379, 8025, 1025, 4002): `bash scripts/vm-slot.sh setup`.
- Every other checkout, worktree or parallel session claims its own slot and never touches slot 0: `n=$(bash scripts/vm-slot.sh claim)`, then `up $n`, `env $n`, `tunnel $n`; `release $n` when done. No free slot: stop and report, never share one. Remember your slot number.
- Status and logs: `bash scripts/vm-slot.sh status <slot>`, `logs <slot> [service]`.
- Mail catcher: the mailhog image is x86-only and crashes on the ARM VM, so `docker-compose.remote.yml` swaps in Mailpit (UI `:8025`, SMTP `:1025`, same ports; the compose service is still named `mailhog`). Never switch it back.
- Ports for slot n (n=1-3): API 57000+100n, Kuma +2, Mailhog UI +25, SMTP +26, Postgres +32, Redis +79. TipSignal and vitalos-platform share the VM: never stop or remove their containers. Never open ports in the Oracle firewall; use the tunnel.
