# Testing Guidelines

> Testing philosophy · Test pyramid · Running tests · Coverage targets · Per-layer test catalogue

**Navigation →** [Implementation Status](./implementation-status.md) · [System Architecture](./system-architecture.md) · [API Design](./api.md) · [← README](../README.md)

---

## Contents

1. [Philosophy](#1-philosophy)
2. [Test Pyramid](#2-test-pyramid)
3. [Tooling & Setup](#3-tooling--setup)
4. [Running Tests](#4-running-tests)
5. [Coverage Targets](#5-coverage-targets)
6. [Layer 1 — Utility & Pure Logic Tests](#6-layer-1--utility--pure-logic-tests)
7. [Layer 2 — Service Unit Tests](#7-layer-2--service-unit-tests)
8. [Layer 3 — Route Integration Tests](#8-layer-3--route-integration-tests)
9. [Layer 4 — Security & Isolation Tests](#9-layer-4--security--isolation-tests)
10. [Layer 5 — End-to-End Tests](#10-layer-5--end-to-end-tests)
11. [Layer 6 — Shell / Contract Tests](#11-layer-6--shell--contract-tests)
12. [Frontend Testing](#12-frontend-testing)
13. [Test File Conventions](#13-test-file-conventions)
14. [CI Integration](#14-ci-integration)
15. [Test Catalogue](#15-test-catalogue)

---

## 1. Philosophy

> **Test behaviour, not implementation.** A test that breaks when you rename an internal variable is worthless. A test that breaks when the system behaves differently from the spec is essential.

Four non-negotiable rules:

1. **Security tests are never optional.** Cross-tenant isolation and authentication tests must pass before any deployment. There is no "we'll write those later."
2. **Tests live next to the code they test.** `auth.service.ts` → `auth.service.test.ts` in the same folder, not in a separate `/tests` tree.
3. **Mocks replace infrastructure, not business logic.** Prisma, Redis, SendGrid, and Twilio calls are mocked. The service logic under test is always real.
4. **One test file per module boundary.** Service tests live with the service; route tests live with the routes.

---

## 2. Test Pyramid

```
                         ┌──────────────────────────────┐
                         │       END-TO-END (E2E)        │  Playwright
                         │   Full user flows in browser  │  ~20 tests
                         │   Slow, run in CI only        │
                         └──────────────┬───────────────┘
                                        │
                    ┌───────────────────▼──────────────────────┐
                    │         INTEGRATION TESTS                 │  Vitest
                    │   Route handlers with Fastify inject()    │  ~80 tests
                    │   Mocked Prisma + mocked external APIs    │
                    └───────────────────┬──────────────────────┘
                                        │
           ┌────────────────────────────▼──────────────────────────────┐
           │                    UNIT TESTS                              │  Vitest
           │   Pure functions, service methods, state machine logic     │  ~200 tests
           │   Zero I/O — all dependencies mocked or injected          │
           └────────────────────────────┬──────────────────────────────┘
                                        │
  ┌─────────────────────────────────────▼──────────────────────────────────────┐
  │                         SECURITY / ISOLATION TESTS                         │  Bash + Vitest
  │   Cross-tenant data leakage · RBAC enforcement · Token expiry              │  ~30 tests
  │   These run on every push — they are not optional                          │
  └────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Tooling & Setup

| Tool | Purpose | Config file |
|------|---------|-------------|
| **Vitest** | Unit + integration tests (backend) | `apps/backend/vitest.config.ts` |
| **Fastify `inject()`** | HTTP route testing without a running server | Built into Fastify |
| **Playwright** | E2E browser tests | `playwright.config.ts` *(to be created)* |
| **Vitest Coverage** | Coverage reporting via v8 | `coverage` key in vitest config |
| **`cross_tenant_test.sh`** | Shell-based cross-tenant security test | `cross_tenant_test.sh` (repo root) |

### Backend test environment

The `vitest.config.ts` injects these env vars so tests run without a real database or Redis:

```typescript
env: {
  DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
  DIRECT_URL:   'postgresql://test:test@localhost:5432/test',
  REDIS_URL:    'redis://localhost:6379',
  JWT_ACCESS_SECRET:  'test-access-secret-minimum-16-chars',
  JWT_REFRESH_SECRET: 'test-refresh-secret-minimum-16-chars',
}
```

All Prisma and Redis calls are mocked via `vi.fn()` — no running database is required for the unit/integration test suite.

---

## 4. Running Tests

```bash
# ── Backend unit + integration tests ──────────────────────────────
cd apps/backend
npm test                              # run once
npm run test:watch                    # watch mode
npm run test:coverage                 # with coverage report

# ── Cross-tenant security test (requires running server) ──────────
docker-compose up -d                  # start PostgreSQL + Redis
npm run dev                           # start backend on :3001
bash cross_tenant_test.sh             # run security checks

# ── E2E tests (requires all services running) ─────────────────────
npx playwright test                   # run all E2E tests
npx playwright test --ui              # interactive mode

# ── All tests in CI ───────────────────────────────────────────────
npm test --workspace=apps/backend
```

---

## 5. Coverage Targets

| Area | Target | Current |
|------|:------:|:-------:|
| `shared/utils/` | 100% | ~60% |
| `shared/middleware/` | 95% | ~30% |
| `modules/auth/` | 95% | ~70% |
| `modules/shipments/` | 90% | ~40% |
| `modules/pricing/` | 95% | ~50% |
| `modules/finance/` | 85% | 0% |
| `modules/payments/` | 85% | 0% |
| `modules/tenants/` | 85% | 0% |
| `modules/users/` | 85% | 0% |
| `modules/crm/` | 80% | 0% |
| `modules/driver/` | 80% | 0% |
| `modules/returns/` | 80% | 0% |
| `modules/support/` | 80% | 0% |
| `modules/webhooks/` | 85% | ~20% |
| `modules/notifications/` | 80% | 0% |
| `modules/tracking/` | 85% | 0% |
| Security / isolation | 100% | ~60% |

> Coverage is a floor, not a goal. 100% coverage with weak assertions is worse than 80% coverage with thorough assertions.

---

## 6. Layer 1 — Utility & Pure Logic Tests

These test functions with no side effects. No mocking needed except where the function calls external code.

**Files:**
- `shared/utils/trackingNumber.test.ts` ✅ *exists*
- `shared/utils/hash.test.ts` *(to add)*
- `shared/utils/jwt.test.ts` *(to add)*

### What to test

| Function | Test cases |
|----------|-----------|
| `generateTrackingNumber` | Correct format `SLUG-YYYYMM-XXXXXX`; retries on collision; throws after 5 retries |
| `hashPassword` / `verifyPassword` | Hash is bcrypt; correct password verifies; wrong password rejects; different calls produce different hashes |
| `signAccessToken` / `verifyAccessToken` | Valid token verifies; expired token throws; tampered token throws; payload fields preserved |
| `signRefreshToken` / `verifyRefreshToken` | Same as access token; different secret used |
| `slugify` *(in auth.service)* | Lowercases; replaces spaces/specials with hyphens; strips leading/trailing hyphens; truncates at 60 chars |

---

## 7. Layer 2 — Service Unit Tests

Service tests exercise business logic with all infrastructure (Prisma, Redis, external APIs) replaced by `vi.fn()` mocks.

**Pattern:**

```typescript
// 1. Build a typed Prisma mock
const prisma = {
  modelName: {
    findFirst: vi.fn().mockResolvedValue({ ...fixture }),
    create:    vi.fn().mockResolvedValue({ ...fixture }),
  }
} as any;

// 2. Call the service directly
const result = await someService.doThing(payload, prisma);

// 3. Assert on return value AND on what Prisma was called with
expect(result.id).toBe('expected-id');
expect(prisma.modelName.create).toHaveBeenCalledWith(
  expect.objectContaining({ tenantId: 'tenant-1' })
);
```

### Auth service — `auth.service.test.ts` ✅

| Test | Assertion |
|------|-----------|
| `register` creates Tenant + TenantSettings + User + UsageRecord in one transaction | All transaction `create` mocks called once |
| `register` normalises email to lowercase | `result.user.email` is lowercase |
| `register` rejects duplicate email | Throws `'Email already in use'` |
| `login` with correct password issues tokens | Returns `{ accessToken, refreshToken, user }` |
| `login` with wrong password rejects | Throws `'Invalid credentials'` |
| `login` with suspended user rejects | Throws `'Account suspended'` |
| `refresh` rotates token (old deleted, new created) | Old token deleted; new token created; tokens differ |
| `forgotPassword` sends reset email | `notificationQueue.add` called with `password_reset` template |
| `resetPassword` invalidates all refresh tokens | All refresh tokens for user deleted |

### Tenant service — `tenant.service.test.ts`

| Test | Assertion |
|------|-----------|
| `updateBranding` writes `logoUrl`, `primaryColor`, `accentColor` to TenantSettings | Prisma update called with correct fields |
| `verifyDomain` returns `verified: true` on DNS TXT match | Returns correct object |
| `verifyDomain` returns `verified: false` on DNS TXT mismatch | Does not throw |
| `getUsage` returns current month usage | Correct `month` key used in query |
| `checkShipmentLimit` at 80% returns `{ warning: true }` | Correct threshold comparison |
| `checkShipmentLimit` at 100% throws `PLAN_LIMIT` | Throws with correct code |

### Pricing service — `pricing.service.test.ts` ✅

| Test | Assertion |
|------|-----------|
| Correct zone rate card lookup | `rateCard.findFirst` called with `tenantId`, `originZoneId`, `destZoneId`, `serviceTier`, `isActive: true` |
| STANDARD multiplier (1.0×) | `total === baseFee + perKgRate * weight` |
| EXPRESS multiplier (1.6×) | Express total = standard total × 1.6 |
| OVERNIGHT multiplier (2.2×) | Overnight total = standard total × 2.2 |
| Oversize surcharge applied when dimension > threshold | Total increases by surcharge amount |
| Oversize surcharge not applied when under threshold | Total unchanged |
| PERCENT_OF_BASE surcharge | Correct percentage applied to base |
| FLAT_FEE surcharge | Exact flat amount added |
| PER_KG surcharge | `value × chargeableKg` added |
| Dimensional weight beats actual weight | `chargeableKg = volumetric_kg` when higher |
| Actual weight beats dimensional weight | `chargeableKg = actual_kg` when higher |
| Promo code PERCENT_OFF | Correct percentage deducted from total |
| Promo code FIXED_OFF | Fixed amount deducted |
| Tax applied when `taxConfig.enabled = true` | `taxAmount = subtotal × rate / 100` |
| Tax not applied when `taxConfig.enabled = false` | `taxAmount = 0` |
| `minCharge` enforced | Total not below minimum |
| `maxCharge` enforced | Total not above maximum |

### Webhooks service — `webhooks.service.test.ts`

| Test | Assertion |
|------|-----------|
| `deliverEvent` builds correct HMAC-SHA256 signature | `X-Webhook-Signature` matches expected HMAC |
| `deliverEvent` POSTs to endpoint URL with correct payload | HTTP POST called with JSON body |
| `deliverEvent` logs to `webhook_deliveries` with response status | `webhookDelivery.create` called |
| `deliverEvent` on HTTP failure marks delivery as `FAILED` | Delivery record status is `FAILED` |
| `createApiKey` stores bcrypt hash, not plaintext | Stored value ≠ original; bcrypt verify passes |
| `revokeApiKey` sets `isActive = false` | `apiKey.update` called with `{ isActive: false }` |

### Notifications service — `notifications.service.test.ts`

| Test | Assertion |
|------|-----------|
| `sendEmail` calls SendGrid with correct `to`, `templateId`, `dynamicTemplateData` | SendGrid mock called with expected args |
| `sendEmail` logs to `notification_log` with `SENT` status | `notificationLog.create` called |
| `sendEmail` on SendGrid failure logs `FAILED` status | Error caught; log status = `FAILED` |
| `sendSms` calls Twilio with correct `to`, `body` | Twilio mock called |
| `sendSms` skipped when tenant plan is Starter | Twilio mock not called |

---

## 8. Layer 3 — Route Integration Tests

Route tests use Fastify's `app.inject()` to simulate real HTTP requests through the full middleware stack — without a network or running process. Prisma is mocked; middleware is partially real or stubbed.

**Pattern:**

```typescript
async function buildApp(overrides?: { user?: Partial<JwtPayload>; tenant?: Partial<Tenant> }) {
  const app = Fastify();

  app.decorate('prisma', buildPrismaMock());
  app.decorate('authenticate', async (req: FastifyRequest) => {
    req.user = { sub: 'user-1', role: 'TENANT_ADMIN', tenantId: 'tenant-1', ...overrides?.user };
  });
  app.addHook('onRequest', (req, _reply, done) => {
    (req as any).tenant = { id: 'tenant-1', slug: 'acme', plan: 'PRO', ...overrides?.tenant };
    done();
  });

  await registerXxxRoutes(app);
  return app;
}

// In test:
const app = await buildApp();
const res = await app.inject({ method: 'GET', url: '/api/v1/xxx', headers: { Authorization: 'Bearer token' } });
expect(res.statusCode).toBe(200);
```

### Shipments routes — `shipments.routes.test.ts` (extends existing)

| Endpoint | Test cases |
|----------|-----------|
| `GET /shipments` | Returns only tenant-scoped shipments; pagination params respected; status filter applied; tracking number search applied |
| `POST /shipments` | Returns `201` with tracking number; `usage_records` incremented; `ShipmentEvent (PENDING)` created; returns `422` when plan limit exceeded |
| `GET /shipments/:id` | Returns `200` with full includes; returns `404` for cross-tenant ID (no `403`) |
| `PATCH /shipments/:id/status` | Valid transition returns `200`; invalid transition returns `400`; `DELIVERED` without POD returns `422`; `FAILED_DELIVERY` without reason returns `422`; fires webhook on transition |
| `PATCH /shipments/:id/assign` | `TENANT_STAFF` role returns `403`; `TENANT_ADMIN` returns `200` |
| `DELETE /shipments/:id` | `PROCESSING` shipment soft-deleted; `IN_TRANSIT` shipment returns `409` |

### Finance routes — `finance.routes.test.ts`

| Endpoint | Test cases |
|----------|-----------|
| `POST /finance/invoices` | Creates invoice with correct `invoice_number` format; links to shipment/org/customer; status = `DRAFT` |
| `PATCH /finance/invoices/:id` | Update allowed on `DRAFT`; returns `409` on `SENT` invoice |
| `POST /finance/invoices/:id/send` | Status → `SENT`; `sentAt` populated; notification enqueued |
| `POST /finance/invoices/:id/pay` | Creates `Payment` record; marks invoice `PAID` when fully paid; `paidAt` populated |
| `POST /finance/invoices/:id/void` | `DRAFT` → `VOID`; `PAID` invoice returns `409` |
| `POST /finance/invoices/:id/void` | `TENANT_STAFF` role returns `403` |

### CRM routes — `crm.routes.test.ts`

| Endpoint | Test cases |
|----------|-----------|
| `POST /crm/leads` | Creates lead with `stage = PROSPECT`; CRM feature missing on Starter returns `403` |
| `PATCH /crm/leads/:id` | Stage update persisted; `lostReason` required when stage = `LOST` |
| `POST /crm/quotes/:id/accept` | Creates `Shipment` from `quote.shipment_data`; links `quote.shipment_id`; marks lead `WON` |
| `POST /crm/quotes/:id/reject` | Marks quote `REJECTED`; marks lead `LOST` |
| `GET /crm/customers/:id` | Returns org with users, shipments, invoices |

### Users routes — `users.routes.test.ts`

| Endpoint | Test cases |
|----------|-----------|
| `GET /users/me` | Returns correct user from JWT `sub` |
| `PATCH /users/me` | Name/phone updated; password change requires `currentPassword`; wrong `currentPassword` returns `401` |
| `POST /users/invite` | `TENANT_ADMIN` creates user + sends `staff_invite` notification; `TENANT_STAFF` returns `403` |
| `PATCH /users/:id/role` | Role changed by admin; attempting to demote self returns `409` |
| `PATCH /users/:id/suspend` | `isActive` set to `false`; cannot suspend self; audit log entry created |
| `DELETE /users/:id` | Sets `isActive = false`; cannot delete self |

### Returns routes — `returns.routes.test.ts`

| Endpoint | Test cases |
|----------|-----------|
| `POST /returns` | Valid return on `DELIVERED` shipment; returns `400` if shipment not `DELIVERED`; returns `403` if shipment belongs to different customer |
| `PATCH /returns/:id/approve` | Status → `APPROVED`; return label notification enqueued; `TENANT_STAFF` allowed |
| `PATCH /returns/:id/reject` | Status → `REJECTED`; reason email enqueued |
| `PATCH /returns/:id/status` | Invalid transition (e.g. `REQUESTED` → `RECEIVED`) returns `400` |
| `POST /returns/:id/refund` | `TENANT_FINANCE` allowed; `TENANT_STAFF` returns `403` |

### Support routes — `support.routes.test.ts`

| Endpoint | Test cases |
|----------|-----------|
| `POST /support/tickets` | Creates ticket + first `TicketMessage`; generates `ticketNumber` in format `SLUG-TKT-YYYYMM-NNNN` |
| `GET /support/tickets/:id` | Staff sees `isInternal = true` messages; customer does not see internal messages |
| `POST /support/tickets/:id/messages` | Staff reply → notification to customer enqueued; customer reply → notification to assignee enqueued |
| `POST /support/tickets/:id/resolve` | Status → `RESOLVED`; resolution email enqueued; `CLOSED` ticket returns `409` on message attempt |

### Tracking routes — `tracking.routes.test.ts`

| Endpoint | Test cases |
|----------|-----------|
| `GET /tracking/:trackingNumber` | Public — no auth required; returns status + events array; `estimatedDelivery`, `origin`, `destination` present |
| `GET /tracking/:trackingNumber` | Returns `404` for unknown tracking number; does not leak tenant data |

### Driver routes — `driver.routes.test.ts`

| Endpoint | Test cases |
|----------|-----------|
| `GET /driver/route` | Returns stops for today's date; only `TENANT_DRIVER` role allowed |
| `PATCH /driver/stops/:id/status` | `COMPLETED` with location updates stop; wrong role returns `403` |
| `POST /driver/pod` | Creates `PodAsset` records; triggers `DELIVERED` transition on shipment |
| `PATCH /driver/shipments/:id/failed` | Transitions to `FAILED_DELIVERY`; creates `ShipmentEvent`; notification enqueued |

---

## 9. Layer 4 — Security & Isolation Tests

> These tests are the most critical in the entire suite. They must pass on every push.

### Tenant isolation — `shipments/tenants.isolation.test.ts` ✅

| Test | Expected |
|------|----------|
| Tenant A token on tenant A list | Returns only tenant A shipments |
| Tenant A token — cross-tenant ID lookup | `404` not `403` (no information leak) |
| Tenant A token on tenant B list (simulated by context switch) | Returns zero results |

### Authentication middleware — `middleware/authenticate.test.ts`

| Test | Expected |
|------|----------|
| Valid JWT — request proceeds | `req.user` decorated correctly |
| Expired JWT — request blocked | `401 UNAUTHORIZED` |
| Tampered JWT (modified payload) — blocked | `401 UNAUTHORIZED` |
| Missing Authorization header — blocked | `401 UNAUTHORIZED` |
| `isActive = false` user — blocked | `401 USER_SUSPENDED` |
| SUPER_ADMIN token on tenant route — blocked by `tenantMatch` | `403 FORBIDDEN` |

### RBAC — tests embedded in route tests above

| Role | Resource | Expected |
|------|----------|----------|
| `TENANT_DRIVER` | `POST /shipments` | `403` |
| `TENANT_STAFF` | `DELETE /shipments/:id` | `403` |
| `TENANT_FINANCE` | `PATCH /shipments/:id/status` | `403` |
| `CUSTOMER_USER` | `GET /users` (staff list) | `403` |
| `TENANT_STAFF` | `POST /users/invite` | `403` |
| `TENANT_ADMIN` | `GET /admin/tenants` | `403` (not SUPER_ADMIN) |

### Idempotency middleware — `middleware/idempotency.test.ts`

| Test | Expected |
|------|----------|
| First request — key stored as `PROCESSING` then `COMPLETED` | Handler called once |
| Second identical request with same key — handler not re-executed | Cached response returned; handler mock not called again |
| Request with key in `PROCESSING` state | `409 CONFLICT` |
| Request without `Idempotency-Key` header | Handler called normally (no idempotency check) |
| Key expires after 24 hours | Row `expires_at` set correctly |

### TenantMatch middleware — `middleware/tenantMatch.test.ts` ✅

| Test | Expected |
|------|----------|
| JWT `tenantId` matches resolved tenant | Passes through |
| JWT `tenantId` mismatches resolved tenant | `403 FORBIDDEN` |

---

## 10. Layer 5 — End-to-End Tests

E2E tests use Playwright to drive a real browser against a locally running full stack.

> **Prerequisite:** `docker-compose up -d && npm run dev` and `npm run dev --workspace=apps/tenant-portal`

**File location:** `e2e/` at repo root *(to be created)*

### Critical user journeys

| Journey | File | Steps |
|---------|------|-------|
| Tenant signup + onboarding | `e2e/onboarding.spec.ts` | Visit `/signup` → fill form → verify redirect to onboarding → complete brand step → verify dashboard |
| Create + track shipment | `e2e/shipment-lifecycle.spec.ts` | Login → create shipment via wizard → verify tracking number → open public tracking page → verify timeline |
| Invoice lifecycle | `e2e/invoice.spec.ts` | Create shipment → mark delivered → create invoice → mark sent → record payment → verify PAID status |
| Customer public tracking | `e2e/public-tracking.spec.ts` | Visit `/track` on tenant subdomain → enter tracking number → verify timeline renders without login |
| Onboarding wizard completion | `e2e/onboarding.spec.ts` | Complete all 5 steps → verify checklist shows complete → verify "Go Live" step shows portal URL |

---

## 11. Layer 6 — Shell / Contract Tests

### `cross_tenant_test.sh`

Requires a running backend. Tests that data from one tenant is never accessible from another.

**Current coverage:**
- Tenant B `GET /shipments` with Tenant A slug → `403`
- Tenant B `GET /shipments/:id` of Tenant A shipment → `404`
- Tenant B `PATCH /shipments/:id/status` of Tenant A shipment → `404`
- Tenant A API key on Tenant B slug → not `200`
- SUPER_ADMIN impersonation token expires ≤ 1800 s

**Added coverage (see expanded script):**
- Invoice cross-tenant isolation
- User list cross-tenant isolation
- Returns cross-tenant isolation
- Support ticket cross-tenant isolation
- Webhook secret cross-tenant isolation

---

## 12. Frontend Testing

The frontend apps currently have **no test infrastructure**. The recommended approach:

| App | Recommended tooling | Priority |
|-----|---------------------|----------|
| `tenant-portal` | Vitest + React Testing Library | High |
| `driver` | Vitest + React Testing Library | Medium |
| `frontend` (Next.js) | Vitest + React Testing Library | Medium |
| `super-admin` | Vitest + React Testing Library | Low |

### What to test in `tenant-portal`

| Component | Tests |
|-----------|-------|
| `StatusBadge` | Renders correct colour class for each of 10 shipment statuses |
| `UsageMeter` | Shows warning state at > 80%; shows error state at 100% |
| `PlanGate` | Renders children when plan has feature; renders upgrade prompt when not |
| `PermissionGate` | Renders children for allowed role; renders nothing for disallowed role |
| `UpdateStatusModal` | Only shows valid next transitions; DELIVERED flow requires POD upload |
| `ShipmentFilterBar` | Debounces search input (no API call on every keystroke) |
| Zustand `auth.store` | `login` sets user and tokens; `logout` clears state |

---

## 13. Test File Conventions

```
apps/backend/src/
├── modules/
│   ├── auth/
│   │   ├── auth.service.ts
│   │   └── auth.service.test.ts          ← service unit tests
│   ├── shipments/
│   │   ├── shipments.routes.ts
│   │   ├── shipments.routes.test.ts      ← route integration tests  (to add)
│   │   ├── shipments.state-machine.test.ts  ← logic unit tests ✅
│   │   └── tenants.isolation.test.ts     ← isolation security tests ✅
│   └── ...
└── shared/
    ├── middleware/
    │   ├── authenticate.ts
    │   ├── authenticate.test.ts           ← middleware tests  (to add)
    │   ├── idempotency.ts
    │   ├── idempotency.test.ts            ← middleware tests  (to add)
    │   └── tenantMatch.test.ts           ← ✅ exists
    └── utils/
        ├── trackingNumber.ts
        └── trackingNumber.test.ts        ← ✅ exists
```

### Naming rules

| Type | Suffix | Location |
|------|--------|----------|
| Service unit test | `.service.test.ts` | Same folder as service |
| Route integration test | `.routes.test.ts` | Same folder as routes |
| Logic unit test | `.test.ts` | Same folder as source file |
| Middleware test | `.test.ts` | Same folder as middleware |

### describe / it naming convention

```typescript
describe('moduleName.methodName', () => {
  it('does X when Y', () => { ... });
  it('rejects/throws/returns 4xx when Z', () => { ... });
});
```

Keep `it()` descriptions in plain English. They should read like a specification, not a code comment.

---

## 14. CI Integration

Tests run automatically on every push via GitHub Actions (`.github/workflows/ci.yml`).

```yaml
# Relevant test steps
- name: Run backend unit + integration tests
  run: npm test --workspace=apps/backend

- name: Run cross-tenant security test
  run: |
    npm run dev --workspace=apps/backend &
    sleep 5
    bash cross_tenant_test.sh
  env:
    BASE_URL: http://localhost:3001

- name: Upload coverage report
  uses: codecov/codecov-action@v4
  with:
    files: apps/backend/coverage/lcov.info
```

**Merge policy:** PRs cannot be merged if:
- Any unit or integration test fails
- The cross-tenant security test fails
- Backend coverage drops below the targets in [Section 5](#5-coverage-targets)

---

## 15. Test Catalogue

Quick reference — every test file, its type, and current status.

| File | Type | Status |
|------|------|--------|
| `shared/utils/trackingNumber.test.ts` | Unit | ✅ Complete |
| `shared/utils/hash.test.ts` | Unit | ⬜ To add |
| `shared/utils/jwt.test.ts` | Unit | ⬜ To add |
| `shared/middleware/tenantMatch.test.ts` | Unit | ✅ Complete |
| `shared/middleware/authenticate.test.ts` | Unit | ⬜ To add |
| `shared/middleware/idempotency.test.ts` | Unit | ⬜ To add |
| `modules/auth/auth.service.test.ts` | Unit | ✅ Core complete · ⬜ forgot/reset missing |
| `modules/tenants/tenant.service.test.ts` | Unit | ⬜ To add |
| `modules/users/users.routes.test.ts` | Integration | ⬜ To add |
| `modules/shipments/shipments.state-machine.test.ts` | Unit | ✅ Complete |
| `modules/shipments/tenants.isolation.test.ts` | Security | ✅ Complete |
| `modules/shipments/shipments.routes.test.ts` | Integration | ⬜ To add |
| `modules/pricing/pricing.test.ts` | Unit | ✅ Core complete · ⬜ promo/tax/rules missing |
| `modules/finance/finance.routes.test.ts` | Integration | ⬜ To add |
| `modules/payments/payments.routes.test.ts` | Integration | ⬜ To add |
| `modules/crm/crm.routes.test.ts` | Integration | ⬜ To add |
| `modules/driver/driver.routes.test.ts` | Integration | ⬜ To add |
| `modules/returns/returns.routes.test.ts` | Integration | ⬜ To add |
| `modules/support/support.routes.test.ts` | Integration | ⬜ To add |
| `modules/tracking/tracking.routes.test.ts` | Integration | ⬜ To add |
| `modules/webhooks/webhooks.service.test.ts` | Unit | ⬜ To add |
| `modules/notifications/notifications.service.test.ts` | Unit | ⬜ To add |
| `modules/api-keys/api-keys.service.test.ts` | Unit | ⬜ To add |
| `cross_tenant_test.sh` | Shell / E2E | ✅ Core · ⬜ extended scenarios to add |
| `e2e/onboarding.spec.ts` | E2E | ⬜ To add |
| `e2e/shipment-lifecycle.spec.ts` | E2E | ⬜ To add |
| `e2e/invoice.spec.ts` | E2E | ⬜ To add |
| `e2e/public-tracking.spec.ts` | E2E | ⬜ To add |

---

*Part of the [Fauward documentation](../README.md)*
