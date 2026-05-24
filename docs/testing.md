# Testing Guide

This guide describes how Fauward tests are organized today and how to run the current suite without relying on production infrastructure.

## Principles

- Test behavior at module boundaries, not private implementation details.
- Keep unit and route tests next to the code under test.
- Mock infrastructure such as Prisma, Redis, queues, SendGrid, Twilio, Stripe, and external HTTP services.
- Tenant isolation, RBAC, authentication, and idempotency checks are release blockers.

## Tooling

| Layer | Runner | Location |
|-------|--------|----------|
| Backend unit and route tests | Vitest | `apps/backend/src/**/*.test.ts`, `apps/backend/test/**/*.test.ts` |
| Package tests | Vitest | `packages/*/src/**/*.test.ts` |
| Super-admin E2E | Playwright | `apps/super-admin/e2e/` |
| Python services | pytest | `services/python-services/tests/` |
| Route optimizer | pytest | `services/route-optimizer/tests/` |

Backend Vitest config lives at `apps/backend/vitest.config.ts`. It injects local test env vars for `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_DB_URL`, `SUPABASE_DIRECT_URL`, Redis, JWT, Vercel, and reserved-domain settings.

## Running Tests

Run from the repo root unless noted.

```bash
npm ci
npm run build --workspace=@fauward/internal-audit --workspace=@fauward/internal-rbac
npm run test --workspace=@fauward/backend
npm run typecheck --workspace=@fauward/backend
```

Focused backend test runs can be started from `apps/backend`:

```bash
../../node_modules/.bin/vitest run --config vitest.config.ts src/modules/users/users.routes.test.ts
```

The full backend test suite imports built workspace packages such as `@fauward/internal-audit` and `@fauward/internal-rbac`, so build those packages first for local full-suite runs. The CI workflow runs a root build before `npm test`.

## CI Workflow

`.github/workflows/ci.yml` runs on pull requests, scheduled runs, and pushes to configured branches. The current job sequence is:

1. `npm ci`
2. `npx prisma generate --schema=apps/backend/prisma/schema.prisma`
3. `npx prisma db push --schema=apps/backend/prisma/schema.prisma`
4. `npm run typecheck`
5. `npm run lint`
6. `npm run build`
7. `npm test`
8. `npm run test:coverage --workspace=apps/backend`
9. `npm run audit:chain:verify --workspace=apps/backend`

The Prisma push uses the local Postgres service and sets `DATABASE_URL` plus `DIRECT_URL` in the workflow. The current Prisma schema reads those names.

## Backend Test Patterns

Use `Fastify.inject()` for route tests. Decorate mocked dependencies on the test app and set `request.user` or `request.tenant` in hooks when the route expects authenticated or tenant-scoped context.

```ts
const app = Fastify();
(app as any).decorate('prisma', prismaMock);
app.addHook('preHandler', async (request) => {
  (request as any).tenant = { id: 'tenant-1', slug: 'acme' };
  (request as any).user = { sub: 'user-1', role: 'TENANT_ADMIN', tenantId: 'tenant-1' };
});
```

For service tests, call the service directly with mocked collaborators and assert both the result and the persistence or queue calls.

```ts
expect(prisma.shipment.findFirst).toHaveBeenCalledWith(
  expect.objectContaining({
    where: expect.objectContaining({ tenantId: 'tenant-1' })
  })
);
```

## Salvaged Backend Coverage From PR #4

These additions were preserved because they were missing from master and pass under the current Vitest setup:

| File | Focus |
|------|-------|
| `apps/backend/src/modules/crm/crm.routes.test.ts` | CRM lead and quote route behavior |
| `apps/backend/src/modules/driver/driver.routes.test.ts` | Driver route and POD behavior |
| `apps/backend/src/modules/finance/finance.routes.test.ts` | Invoice creation, update, payment, void, and overdue sweep behavior |
| `apps/backend/src/modules/notifications/notifications.service.test.ts` | Notification queue payloads, Python notification publishing, template catalogue |
| `apps/backend/src/modules/returns/returns.routes.test.ts` | Return creation, approval, rejection, and transition validation |
| `apps/backend/src/modules/support/support.routes.test.ts` | Support ticket creation, replies, resolution, and notifications |
| `apps/backend/src/modules/tenants/tenant.service.test.ts` | Tenant service branding, settings, domain, and usage behavior |
| `apps/backend/src/modules/tracking/tracking.routes.test.ts` | Tenant-scoped public tracking route behavior |
| `apps/backend/src/modules/users/users.routes.test.ts` | User profile, password change, list, and invite behavior |
| `apps/backend/src/shared/middleware/idempotency.test.ts` | Idempotency key resolution and response storage |

Conflicting or superseded PR #4 changes were intentionally not restored: backend package scripts, Vitest config, auth/api-key/webhook tests, tenant-match tests, and `cross_tenant_test.sh`.

## Minimum Local Verification For Backend Test PRs

```bash
npm run build --workspace=@fauward/internal-audit --workspace=@fauward/internal-rbac
npm run typecheck --workspace=@fauward/backend
npm run test --workspace=@fauward/backend
```

For changes that touch Prisma models or route registration, also run:

```bash
node_modules/.bin/prisma generate --schema=apps/backend/prisma/schema.prisma
```
