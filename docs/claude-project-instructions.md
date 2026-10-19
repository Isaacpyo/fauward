# Fauward — Claude Project Instructions

You are working on Fauward, a multi-tenant B2B SaaS for logistics businesses (couriers, freight forwarders, 3PLs). Owner: Temitope Agbola, Treny Limited. Active development.

## Current objective

Turn `CONSOLE_REAUDIT_2026-10-17.md` into a design spec for the Super Admin console, then implement it phase by phase. Target state: every placeholder works, every tenant-portal activity reaches the console, every console action has a real downstream effect. Follow the phasing in §9.2 of the re-audit and resolve the ten decisions in §9.1 before specifying any service. Do not re-invent anything listed in §9.3.

## Stack

- Backend: Node 20, Fastify, TypeScript, Prisma, PostgreSQL 15 (Supabase), Redis 7, BullMQ, SendGrid. Deployed on Railway.
- Tenant portal, super-admin, agents app: React 18 + Vite. Marketing site: Next.js 14 App Router. Deployed on Vercel.
- Monorepo: Turborepo + npm workspaces. `apps/backend`, `apps/tenant-portal`, `apps/super-admin`, `apps/frontend`, `apps/agents`, `apps/fauward-Go`; shared `packages/*` (brand, shared-types, domain-types, theme-engine, tracking-core, pricing-core, formatting, internal-ui, internal-rbac, internal-audit, relay-ui, relay-api).
- Docker runs on an Oracle VM via `scripts/vm-slot.sh`, never locally.

## Backend rules (non-negotiable)

- Every module is `src/modules/<name>/` exporting `register*Routes(app)` and registered in `src/app.ts`.
- Tenant resolved per request by `tenantResolver`; context via `getTenantContext()`. **Every DB query is scoped to `tenantId`. No exceptions.**
- Prisma client on `app.prisma`. No raw SQL unless Prisma cannot express it.
- Protected routes use `preHandler: [app.authenticate, requireRole([...])]` or `requireFeature(...)`. Never bypass them.
- Errors via `app.httpErrors.*` from `@fastify/sensible`. Never `throw new Error()` in handlers.
- Logging via `req.log` / `app.log`. Never `console.log`.
- BullMQ workers run outside Fastify scope: wrap worker bodies in `tenantStorage.run()` with SUPER_ADMIN context or every Prisma write is blocked.
- Fire-and-forget `void fn()` calls must have `.catch` — unhandled rejections crash-loop the server.
- Money stays `Decimal(12,2)` as strings across the API boundary.

## Super-admin console specifics

- Two auth namespaces today: `/api/v1/platform/*` (legacy `PlatformRole` map, cookie session) and `/api/internal/*` (staff RBAC + JIT via `requireInternalPermission`). The spec must collapse these to one (decision 2).
- `/api/internal` client (`lib/internal-api.ts`) has no token refresh; `/api/v1/platform` client (`lib/api.ts`) does.
- Service catalogue is `apps/super-admin/src/pillars/_manifests.ts` (5 pillars, 41 services). Routes in `apps/super-admin/src/router.tsx`. Generic pages are `InternalOpsPage` / `WorkflowOpsPage`; dedicated pages live under `pillars/<pillar>/<service>/`.
- Backend for the generic pages is `apps/backend/src/modules/internal/console-phases.routes.ts` (126 routes). Platform tenant CRUD is `modules/platform/platform.routes.ts`.
- Dangerous platform actions require CSRF + fresh MFA (10 min) + reason ≥ 8 chars (`dangerousPre`). The MFA step is currently missing from the UI and login never sets `mfaVerifiedAt` — this is blocker B1.
- Prior decisions: `adr/0001-console-service-scope.md` (9 live / 28 preview / 4 deferred). Prior backlog: `CONSOLE_REMEDIATION_TRACKER.md`. Target architecture: `FAUWARD_INTERNAL_OPS_ARCHITECTURE.md`.

## Forbidden

- DB query without `tenantId` scope · `any` in TypeScript · committing secrets or `.env` · `console.log` in production code · bypassing `authenticate`/`requireRole` · Next.js Pages Router · `prisma migrate reset` · running Docker locally · hardcoded numbers, sample rows or fake success toasts presented as real data.

## How to work

- Cite code as `path:line`. Prefer the re-audit's line references; verify before relying on them if the file has changed.
- When writing spec sections, use the re-audit's §4 "to go live needs" classification (UI / wire / producer / vendor / job / model) per service, and name the Prisma models, routes and permissions involved.
- When something in the re-audit conflicts with the code, the code wins — say so and update the finding.
- Every service in the spec needs: data model changes, backend routes + guards, frontend page, tenant-portal touchpoint (if any), job (if any), vendor-free default behaviour, and acceptance tests.
- Do not claim a service is "live" unless it meets ADR 0001's definition: dedicated page under `pillars/<pillar>/<service>/`, backed by real API data or a clearly labelled degraded state.
