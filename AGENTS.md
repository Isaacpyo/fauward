# Fauward Codex Guide

Fauward is a multi-tenant B2B SaaS platform for logistics businesses — couriers, freight forwarders, and 3PLs. Each tenant gets a white-labelled operations portal, customer tracking, driver mobile apps, billing, and API access.

Owner: Temitope Agbola / Treny Limited. Active development.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Package manager | npm 10.9.2 (workspaces) |
| Build orchestration | Turborepo 2.9.6 |
| Backend runtime | Node.js 20, Fastify 4, TypeScript 5.5 |
| Backend ORM | Prisma 5 (PostgreSQL provider) |
| Database | PostgreSQL 15 (Supabase in production) |
| Cache / PubSub / Queues | Redis 7 (Upstash in production), BullMQ |
| WebSockets | Socket.io + Redis adapter |
| Auth | JWT (RS256 access, HS256 refresh) + bcrypt (cost 12) + TOTP MFA |
| Payments | Stripe, Paystack, regional gateways |
| Email / SMS | SendGrid, Twilio |
| File storage | AWS S3 |
| Marketing site | Next.js 14 App Router, Tailwind CSS v3, React 18 |
| Tenant portals | React 18, Vite 5, Tailwind CSS v3, Zustand, React Query |
| Driver / Field apps | React 18, Vite 5, PWA (vite-plugin-pwa) |
| Super Admin console | React 18, Vite 5, Playwright E2E |
| Python services | FastAPI, Celery (Redis-backed), Uvicorn |
| Route optimizer | FastAPI, scikit-learn, OR-Tools |
| Widgets | Vanilla JS + esbuild (IIFE bundles with Shadow DOM) |
| Testing | Vitest 2 (Node), Playwright 1.60 (E2E), pytest 8 (Python) |
| CI | GitHub Actions |
| Containers | Docker (node:20-alpine for Node apps, python:3.12-slim for Python) |

---

## Repository Map

```
fauward/
├── apps/
│   ├── backend/            Fastify API, Prisma schema, BullMQ workers, modules
│   ├── frontend/           Next.js 14 marketing site (fauward.com)
│   ├── tenant-portal/      React + Vite ops portal ({slug}.fauward.com)
│   ├── agents/             React + Vite PWA for field agents
│   ├── fauward-Go/         React + Vite PWA for driver/field logistics (Dexie offline sync)
│   ├── super-admin/        React + Vite internal Fauward console
│   ├── admin/              React + Vite legacy admin (minimal, custom Node server)
│   └── widget/             React-based tracking widget host page
├── packages/
│   ├── brand/              Inline SVG speed-mark logo
│   ├── design-tokens/      CSS custom-properties token system
│   ├── domain-types/       Shared shipment status state machine
│   ├── formatting/         Date, currency, and plan label formatters
│   ├── internal-audit/     Tamper-evident audit logging + React UI components
│   ├── internal-rbac/      Permission union, role maps, React guards, server middleware
│   ├── internal-ui/        Shared React components for super-admin (tables, diffs, stats)
│   ├── pricing-core/       Volumetric weight and quote type utilities
│   ├── relay-api/          Supabase-backed messaging API (conversations, feedback)
│   ├── relay-ui/           Relay chat widget + messaging tab React components
│   ├── shared-types/       Cross-app TypeScript stubs
│   ├── tenant-db/          Supabase client factories and tenant schema provisioning
│   ├── theme-engine/       Tenant white-label CSS variable injection
│   ├── tracking-core/      Tracking statuses, events, visibility rules, field sync types
│   └── widget-sdk/         Embeddable shipment-creation SDK (esbuild → dist/embed.js)
├── widget/                 Vanilla JS embeddable tracking lookup widget
├── status-dashboard/       Express status dashboard (proxied by super-admin)
├── services/
│   ├── python-services/    FastAPI + Celery (PDF, OCR, routes, customs, pricing, analytics, ML)
│   └── route-optimizer/    Standalone FastAPI microservice for route optimization + ETA ML
├── docs/                   Architecture, API, deployment, testing, and product specs
├── supabase/migrations/    Supabase-specific migrations
├── .github/workflows/      CI pipeline
├── docker-compose.yml      Local dev infrastructure
├── railway.json            Railway deployment config (backend)
├── playwright.config.ts    Root Playwright config (super-admin E2E)
└── turbo.json              Turborepo task graph
```

---

## Local Development Setup

**Prerequisites:** Node.js 20+, Docker Desktop, Python 3.12+ (for Python services)

```bash
# 1. Install root dependencies
npm install

# 2. Start local infrastructure
docker-compose up -d
# Services: PostgreSQL 15 (:5432), Redis 7 (:6379), MailHog (:8025 UI, :1025 SMTP),
#           Python API (:8000), Python Celery worker, Python Celery beat

# 3. Configure backend environment
cp apps/backend/.env.example apps/backend/.env
# Edit DATABASE_URL, DIRECT_URL, REDIS_URL, JWT secrets

# 4. Generate Prisma client and apply migrations
cd apps/backend
npx prisma generate
npx prisma migrate dev

# 5. Start the dev cluster (from repo root)
npm run dev
# This starts: backend (:3001), frontend (:5000), tenant-portal (:3000),
#              super-admin (:5173), status-dashboard
```

**MailHog UI:** http://localhost:8025

---

## Build, Test and Lint Commands

Run from the repository root unless noted otherwise.

```bash
# Development
npm run dev                       # Turbo dev for backend + frontend + tenant-portal + super-admin + status-dashboard
npm run dev:all                   # Turbo dev for every workspace
npm run dev:backend               # Backend only
npm run dev:frontend              # Frontend + tenant-portal only

# Build
npm run build                     # Turbo build (dependsOn ^build)

# Test
npm test                          # Turbo test (runs workspace test scripts only)
npm run test --workspace=apps/backend
npm run test --workspace=apps/fauward-Go
npm run test --workspace=packages/pricing-core
npm run test --workspace=packages/tracking-core
npx playwright test apps/super-admin/e2e/   # Super-admin E2E

# Lint / Typecheck
npm run lint                      # Turbo lint
npm run typecheck                 # Available in individual apps (e.g. tsc --noEmit)

# Database (backend)
npm run prisma:generate --workspace=apps/backend
npm run prisma:migrate --workspace=apps/backend
npm run tracking:migrate --workspace=apps/backend

# Platform admin bootstrap
npm run platform:admin:create --workspace=apps/backend
```

**Note:** The root `npm test` only exercises workspaces that define a `test` script. Several apps (frontend, tenant-portal, agents, admin, super-admin) currently have no unit-test runner configured.

---

## Code Style and Engineering Rules

- **Preserve tenant isolation.** Every tenant-scoped DB query must include `tenantId`; no exceptions. The Prisma middleware in `apps/backend/src/plugins/prisma.ts` injects `tenantId` automatically for models listed in `TENANT_SCOPED_MODELS`.
- **Do not bypass `authenticate`, `requireRole`, or feature guards** on protected routes.
- **Never commit secrets, credentials, or `.env` values.**
- **Do not use `any` in TypeScript** unless the surrounding file already requires it and there is no safer local type. Prefer `unknown` or named types.
- **Use Fastify logging** (`req.log`, `app.log`) instead of `console.log` in production code.
- **Use `app.httpErrors.*` in Fastify route handlers** instead of `throw new Error()`.
- **Avoid raw SQL** unless Prisma cannot express the query. Parameterize any raw query.
- **Do not run `prisma migrate reset`;** it wipes the database.
- **Keep changes tightly scoped** and avoid unrelated refactors.
- **Branch naming:** `feat/short-description`, `fix/short-description`, `chore/short-description`.
- **Commit messages:** Follow [Conventional Commits](https://www.conventionalcommits.org/):
  ```
  feat(shipments): add carrier booking FK to shipment model
  fix(auth): prevent refresh token reuse after rotation
  ```

---

## Backend Architecture and Conventions

These instructions apply to `apps/backend/**`. For deeper guidance, read `apps/backend/AGENTS.md`.

### Module Pattern
Every module lives at `src/modules/<name>/` and exports a register function:

```ts
export async function registerXRoutes(app: FastifyInstance) {
  app.get(
    '/api/resource',
    { preHandler: [app.authenticate, requireRole(['ADMIN'])] },
    async (req, reply) => {
      const ctx = getTenantContext();
      const result = await app.prisma.model.findMany({
        where: { tenantId: ctx.tenantId },
      });
      return reply.send(result);
    },
  );
}
```

Register new route modules in `src/app.ts`.

### Key Directories
- `src/app.ts` — Fastify factory: plugins, hooks, route registration.
- `src/server.ts` — Entry point: `buildApp()` → `startWorkers()` → `listen()`.
- `src/config/` — Zod-validated environment config.
- `src/context/tenant.context.ts` — `AsyncLocalStorage`-based tenant context.
- `src/middleware/` — Platform-level middleware (CSRF, platform permissions, legal holds).
- `src/modules/` — ~30 domain modules (auth, shipments, tracking, fleet, pricing, finance, crm, returns, support, notifications, webhooks, api-keys, audit, analytics, users, tenants, payments, driver, super-admin, etc.).
- `src/shared/middleware/` — Reusable auth, RBAC, tenant resolution, idempotency.
- `src/queues/` — BullMQ queue definitions and workers (outbox, analytics, scheduled, webhooks, route optimization).
- `src/plugins/prisma.ts` — Prisma client + tenant-scoped middleware.
- `src/types/fastify.d.ts` — Fastify type extensions.

### Request Lifecycle
```
HTTP Request → Fastify → Plugins (prisma, redis, auth) → TenantResolver
  → requireTenantMatch() → requireRole() / requireFeature() → Route Handler
  → Zod validation → Idempotency check → Prisma query → OutboxEvent write
  → Response
```

### Tenant Isolation
- `req.tenant` is set by `tenantResolver` middleware (subdomain, custom domain, or `X-Tenant-ID` header).
- `req.user` is set by `app.authenticate` (JWT or API key).
- Use `getTenantContext()` from `src/context/tenant.context.ts` in service logic.
- Every tenant-scoped Prisma query must include `where: { tenantId: ctx.tenantId }`.

### Auth Guards
```ts
preHandler: [app.authenticate]
preHandler: [app.authenticate, requireRole(['ADMIN'])]
preHandler: [app.authenticate, requireFeature('FLEET')]
```

### Error Handling
Use `@fastify/sensible` errors:
```ts
throw app.httpErrors.notFound('Shipment not found');
throw app.httpErrors.forbidden('Insufficient permissions');
throw app.httpErrors.badRequest('Invalid status transition');
throw app.httpErrors.conflict('Tracking number already exists');
```

### Types and Logging
- Extend Fastify request types in `src/types/fastify.d.ts` when adding decorations.
- Use Fastify logger calls, not `console.log`.
```ts
req.log.info({ shipmentId }, 'Shipment dispatched');
req.log.error({ err }, 'Failed to send webhook');
```

### Adding a New Model
1. Add to `apps/backend/prisma/schema.prisma`.
2. Create a migration: `npx prisma migrate dev --name <name> --schema=apps/backend/prisma/schema.prisma`.
3. Run `npx prisma generate`.
4. Add the model to the relevant `Tenant` relations if tenant-scoped.
5. Ensure `plugins/prisma.ts` middleware covers the new model.
6. Write at least one Vitest test for the new model's primary business logic.

### Adding a New Route
1. Create `src/modules/{domain}/{domain}.routes.ts`.
2. Register it in `src/app.ts`.
3. Add Zod validation schemas.
4. Apply `requireTenantMatch()`, `requireRole()`, and `requireFeature()` as appropriate.
5. Write a Vitest test mocking Prisma for the happy path and at least one error case.

---

## Frontend Conventions

These instructions apply to `apps/frontend/**`. For deeper guidance, read `apps/frontend/AGENTS.md`.

### Next.js App Router
- All pages live under `src/app/`; **do not add a Pages Router**.
- Server components are the default. Add `'use client'` only for hooks, browser APIs, or event handlers.
- Route groups use `(group-name)` folders and do not affect the URL.
- Use `loading.tsx` for loading states and `error.tsx` for error boundaries.
- Export `metadata` or `generateMetadata` from page files when metadata is needed.

### API Routes
```ts
import { NextRequest, NextResponse } from 'next/server';
export async function GET(req: NextRequest) {
  return NextResponse.json({ data });
}
```

### Styling
- Use Tailwind CSS.
- Prefer design tokens from `@fauward/brand` and `@fauward/design-tokens`.
- Tenant theme variables come from `@fauward/theme-engine`.
- Avoid inline styles unless the existing pattern leaves no practical alternative.

### Navigation and Images
```tsx
import Link from 'next/link';
import Image from 'next/image';
```
Use `Link` for internal links and `Image` for images.

### Components
- Co-locate page-specific components with the page.
- Shared UI components live in `src/components/`.
- Marketing components live in `src/components/marketing/`.

### Other Frontend Apps
All non-Next.js frontends follow the same React 18 + Vite 5 + Tailwind CSS v3 pattern:
- `apps/tenant-portal/` — Ops dashboard. Port 3000. Proxies `/api` → `:3001`, `/api/relay` → `:5000`.
- `apps/super-admin/` — Internal console. Port 5173. Proxies `/api/v1` and `/api/internal` → `:3001`, `/status` → `:4000`.
- `apps/agents/` — Field agent PWA. Port 5175. `vite-plugin-pwa` with `injectManifest` strategy.
- `apps/fauward-Go/` — Driver logistics PWA. Uses Dexie (IndexedDB) for offline sync. Vitest tests in `tests/`.
- `apps/admin/` — Minimal legacy admin. Port 5174. Uses a custom `server.mjs` static server in production.
- `apps/widget/` — React host page for the embeddable widget.

---

## Testing Strategy

| Layer | Runner | Config | Command |
|---|---|---|---|
| Backend unit/integration | Vitest 2 | `apps/backend/vitest.config.ts` | `npm run test --workspace=apps/backend` |
| fauward-Go unit | Vitest 2 | default | `npm run test --workspace=apps/fauward-Go` |
| Package unit (pricing, tracking, audit) | Vitest 2 | default | `npm run test --workspace=packages/<name>` |
| Super-admin E2E | Playwright 1.60 | `playwright.config.ts` (root) | `npx playwright test apps/super-admin/e2e/` |
| Python services | pytest 8 | none (uses marks) | `pytest tests` (from `services/python-services/`) |
| Route optimizer | pytest 8 | `services/route-optimizer/pytest.ini` | `python -m pytest tests/ -v` |

### Backend Vitest Notes
- Environment: `node`.
- `passWithNoTests: true`.
- Test env vars are injected for a local test DB (`postgresql://test:test@localhost:5432/test`), Redis, and JWT secrets. However, the current test suite mocks Prisma calls with `vi.fn()` and does not require a real database.
- Tests are co-located with source files (e.g. `auth.service.test.ts`, `pricing.test.ts`).

### Playwright E2E Notes
- `testDir` is `apps/super-admin/e2e`.
- Base URL: `http://127.0.0.1:4174`.
- WebServer command starts `npm run dev --workspace=apps/super-admin -- --host 127.0.0.1 --port 4174`.
- Tests mock platform auth and internal API routes for workflow verification.

### CI Pipeline (`.github/workflows/ci.yml`)
- Triggers: push to `main`, `develop`, or `phase/**`; all `pull_request` events.
- Services: `postgres:15` (DB `fauward_test`) and `redis:7`.
- Steps:
  1. `npm ci`
  2. `npx prisma generate --schema=apps/backend/prisma/schema.prisma`
  3. `npx prisma db push --schema=apps/backend/prisma/schema.prisma`
  4. `npm test --workspace=apps/backend`
  5. `npm run build --workspace=apps/backend`
  6. `npm run build --workspace=apps/frontend`
  7. `npm run build --workspace=apps/tenant-portal`

There is **no deploy step** in CI. Deployment is handled by platform triggers (Railway, Vercel) or manual processes.

---

## Security Considerations

| Control | Implementation |
|---|---|
| Password hashing | bcrypt, cost factor 12 |
| Access token | JWT RS256, 15-minute expiry |
| Refresh token | JWT HS256, 7-day expiry, hashed + stored in DB, rotated on every use |
| MFA | TOTP (RFC 6238), 30-second window, backup codes |
| SSO (Enterprise) | SAML 2.0 / OIDC, JIT user provisioning |
| API key storage | bcrypt hashed; prefix only shown in UI after creation |
| Webhook signing | HMAC-SHA256 over payload; `X-Webhook-Signature` header |
| Tenant isolation | Prisma middleware injects `tenantId` on all queries via AsyncLocalStorage |
| Rate limiting | 100 req/min general, 10/min auth endpoints, per-API-key limits |
| Input validation | Zod schemas on all request bodies and query params |
| SQL injection | Prisma ORM exclusively — no raw SQL anywhere |
| File upload security | ClamAV scan, S3 signed URLs (1-hour expiry) |
| Impersonation (Super Admin) | Audit logged, 30-minute session cap |
| Secrets | AWS Secrets Manager — no secrets in code or env files in production |

**Never commit secrets, credentials, or `.env` values.**

---

## Database and Migrations

- **Canonical schema:** `apps/backend/prisma/schema.prisma` (~2,800 lines).
- **Migrations:** `apps/backend/prisma/migrations/`.
- **Production:** PostgreSQL on Supabase. `DATABASE_URL` points to the pooled connection; `DIRECT_URL` is required for Prisma migrations.
- **Tenant isolation:** Enforced at the application layer via Prisma middleware, not schema separation. Every tenant-scoped table has a `tenantId` column.
- **Do not run `prisma migrate reset`** — it wipes the database.
- **Do not bootstrap new environments from `supabase_init.sql`** at the repo root; it is stale. Use Prisma migrations as the source of truth.

---

## Deployment

### Railway (Backend)
- Config: `railway.json` at repo root.
- Builder: `DOCKERFILE` pointing to `apps/backend/Dockerfile`.
- Healthcheck: `GET /health`.
- Start command: `node dist/server.js`.
- Required env vars (set in Railway dashboard): `DATABASE_URL`, `DIRECT_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `PORT`.

### Vercel (Marketing Site)
- Config: `apps/frontend/vercel.json`.
- Framework: `nextjs`.
- `next.config.mjs` rewrites `/api/v1/:path*` to `BACKEND_URL` at runtime.
- Required env vars: `BACKEND_URL`.

### Other Apps
Per `docs/deployment.md`, tenant portal, super-admin, and agent portal deployment platforms are marked **TBD**. They each have Dockerfiles but no platform-specific JSON config.

### Self-Hosted / VPS Domain Routing
For single-server deployment, `docs/deployment.md` references a reverse proxy routing by subdomain:

| Subdomain | App | Port |
|---|---|---|
| `fauward.com` | frontend | 3002 |
| `app.fauward.com` | tenant-portal | 3003 |
| `admin.fauward.com` | super-admin | 3004 |
| `api.fauward.com` | backend | 3001 |

---

## Python Services

### `services/python-services/`
- **Framework:** FastAPI + Celery (Redis-backed queues)
- **Runtime:** Python 3.12+
- **Entry points:** `main.py` (FastAPI), `celery_app.py` (workers)
- **Capabilities:** PDF generation, OCR, route optimization, customs/HS lookup, pricing quotes, analytics, ML scoring, notifications
- **Tests:** `pytest tests/` (from the service directory)

**Local setup:**
```powershell
cd services/python-services
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item env.local.example .env
uvicorn main:app --reload --host 0.0.0.0 --port 8000
celery -A celery_app worker --loglevel=info -Q pdf,routes,analytics,ocr,notifications,pricing,customs,ml
```

### `services/route-optimizer/`
- **Framework:** FastAPI (standalone microservice)
- **Runtime:** Python 3.11
- **Tests:** `python -m pytest tests/ -v` (25 tests)
- **Capabilities:** Nearest-neighbor + 2-opt route optimization, ML-based ETA prediction

---

## Queue and Worker Architecture

### Node.js (BullMQ on Redis)
- **Outbox worker:** Polls `outbox_events` every 1s and enqueues to BullMQ queues.
- **Queues:** `notifications:queue`, `webhooks:queue`, `analytics:queue`, plus domain-specific queues.
- **Failed jobs:** After 3 attempts, moved to a dead-letter queue (`dlq:{queue_name}`).
- Workers are started in `apps/backend/src/server.ts` via `startWorkers(app)`.

### Python (Celery on Redis)
- **Worker queues:** `pdf`, `routes`, `analytics`, `ocr`, `notifications`, `pricing`, `customs`, `ml`.
- **Beat scheduler:** `celery -A celery_app beat` for periodic tasks.
- In local Docker Compose, the API has `PYTHON_QUEUE_LISTENERS_ENABLED=false`; workers run in a separate container.

---

## Environment Variables

All backend variables are validated at startup by `apps/backend/src/config/index.ts` using Zod. The process throws immediately if any required variable is missing.

**Required backend vars:**
- `DATABASE_URL` — PostgreSQL connection string (pooled)
- `DIRECT_URL` — PostgreSQL direct connection (for migrations)
- `REDIS_URL` — Redis connection string
- `JWT_ACCESS_SECRET` — ≥16 chars
- `JWT_REFRESH_SECRET` — ≥16 chars

**Common optional vars:**
- `JWT_ACCESS_EXPIRES_IN` (default `15m`)
- `JWT_REFRESH_EXPIRES_IN` (default `7d`)
- `MFA_ISSUER` (default `Fauward`)
- `PLATFORM_DOMAIN` (default `fauward.com`)
- `PORT` (default `3001`)
- `NODE_ENV` (default `development`)

See `.env.example` at the repo root for the full variable list (includes SendGrid, Twilio, Stripe, Firebase, DeepSeek AI, and many internal console vendor integrations).

---

## Project-Specific Tooling

- `.codex/` — Project-scoped custom subagents, lifecycle hooks, and command approval rules.
- `.agents/skills/` — Repo-scoped reusable workflows (e.g., `fauward-database` for Prisma commands).
- `playwright.config.ts` — Root-level Playwright configuration for super-admin E2E.
- `test-results/.last-run.json` — Playwright last-run metadata.

---

## App-Specific Deep-Dive Files

Before editing code in these directories, read their local `AGENTS.md` or `README.md`:
- `apps/backend/AGENTS.md` — Module pattern, tenant isolation, auth guards, error handling.
- `apps/frontend/AGENTS.md` — Next.js App Router, Tailwind, design tokens, component layout.
- `apps/fauward-Go/README.md` + `docs/` — Offline sync architecture, API contracts, PWA config.
- `services/python-services/README.md` + `docs/` — FastAPI layer layout, security, workers, operations.
