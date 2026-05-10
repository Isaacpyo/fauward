# Fauward

Multi-tenant B2B SaaS platform for logistics businesses (couriers, freight forwarders, 3PLs).
Owner: Temitope Agbola · Treny Limited · Active development.

## Stack

| Layer | Tech |
|---|---|
| API | Node 20 · Fastify · TypeScript · Prisma ORM |
| Database | PostgreSQL 15 (Supabase) + Redis 7 |
| Auth | JWT (access + refresh) · `@fastify/jwt` · `@fastify/cookie` |
| Frontend | Next.js 14 App Router (marketing site — fauward.com) |
| Tenant Portal | React 18 · Vite |
| Agents App | React 18 · Vite · PWA |
| Super Admin | React 18 · Vite |
| Build | Turborepo · npm workspaces (Node 20) |
| Queue | BullMQ on Redis |
| Email | SendGrid |
| Deploy | Railway (backend + Python services) · Vercel (frontends) |

## Monorepo

```
apps/
├── backend/          Fastify API — all routes, modules, middleware
├── frontend/         Next.js 14 — marketing site (fauward.com)
├── tenant-portal/    React/Vite — tenant ops portal
├── agents/           React/Vite PWA — field agent mobile app
├── fauward-Go/       Field logistics app
├── super-admin/      React/Vite — Fauward internal admin
└── admin/            Admin app

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
