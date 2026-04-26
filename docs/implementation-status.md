# Implementation Status — April 2026

> **Ground truth of what exists in the codebase vs what the spec requires.**
> Read the [spec docs](../README.md) for full requirements.
> Read *this document* to know exactly what to build next, what files to fill in, and what to create from scratch.
> Every item has been verified against the actual codebase.

**Navigation →** [Implementation Phases](./implementation-phases.md) · [Feature Additions](./feature-additions.md) · [← README](../README.md)

---

## Contents

1. [Monorepo Structure](#1-monorepo-structure)
2. [Backend Status](#2-backend-status)
3. [Prisma Schema](#3-prisma-schema)
4. [Marketing Site](#4-marketing-site)
5. [Tenant Portal](#5-tenant-portal)
6. [Agents PWA](#6-agents-pwa)
7. [Super Admin](#7-super-admin)
8. [Embeddable Widget](#8-embeddable-widget)
9. [Shared Packages](#9-shared-packages)
10. [Priority Build Order](#10-priority-build-order)
11. [Environment Variables](#11-environment-variables)
12. [Phase Completion Summary](#12-phase-completion-summary)

---

## 1. Monorepo Structure

```
fauward/
├── apps/
│   ├── backend/          Node.js · Fastify · TypeScript · Prisma
│   ├── frontend/         Next.js 14 App Router  (marketing site)
│   ├── tenant-portal/    React 18 · Vite  (ops portal)
│   ├── agents/           React 18 · Vite · PWA  (agent app)
│   └── super-admin/      React 18 · Vite  (internal admin)
├── packages/
│   ├── brand/            brand.css  (design tokens, colours, typography)
│   ├── shared-types/     index.ts  (cross-app TypeScript types)
│   ├── domain-types/     index.ts  (domain model types)
│   ├── theme-engine/     index.ts  (tenant CSS var injection)
│   ├── design-tokens/    (token definitions)
│   └── formatting/       (currency, date, weight formatters)
├── widget/               Vanilla JS embeddable tracking widget
├── docker-compose.yml    Local dev: PostgreSQL 15 · Redis 7 · MailHog
└── supabase_init.sql     (present — relationship to Prisma schema unclear)
```

**Package manager:** npm workspaces · Run `npm run dev` from root to start the backend.

---

## 2. Backend Status

### ✅ What exists and works

**Server & plugins**

| File | Purpose |
|------|---------|
| `server.ts` | Fastify entry point |
| `app.ts` | `buildApp()` — registers all plugins and routes |
| `plugins/prisma.ts` | Prisma client on `app.prisma` |
| `plugins/redis.ts` | Redis client on `app.redis` |
| `config/index.ts` | Central env var config |
| `context/tenant.context.ts` | `AsyncLocalStorage` tenant context |

**Shared middleware**

| File | Purpose |
|------|---------|
| `authenticate.ts` | JWT Bearer verification → `req.user` |
| `tenant.resolver.ts` | Resolves tenant from subdomain / header → `req.tenant` |
| `tenantMatch.ts` | Ensures JWT `tenantId` matches resolved tenant |
| `featureGuard.ts` | `requireFeature(name)` — checks plan via `planService` |
| `requireRole.ts` | `requireRole(roles[])` — RBAC check |

**Shared utilities**

| File | Purpose |
|------|---------|
| `hash.ts` | bcrypt hash/verify (cost factor 12) |
| `jwt.ts` | RS256 access token (15 min) + refresh token (7 d) |
| `logger.ts` | Structured logger |
| `totp.ts` | TOTP generation and verification for MFA |

**Module: `modules/auth/`**

| File | Status |
|------|--------|
| `auth.routes.ts` | ✅ register, login, refresh, logout, `/me`, MFA setup/verify/validate |
| `auth.service.ts` | ✅ full register flow (Tenant + User + TenantSettings + UsageRecord in one transaction) |
| `auth.controller.ts` | ✅ thin controller |
| `auth.schema.ts` | ✅ Zod schemas |
| `forgot-password` + `reset-password` | ❌ **Missing** |

**Module: `modules/tenants/`**

| File | Status |
|------|--------|
| `tenant.routes.ts` | ✅ me, branding, settings, domain (Pro+), usage, onboarding, plan-features |
| `tenant.service.ts` | ✅ CRUD, `getTenantBySlug`, `updateSettings` |
| `branding.service.ts` | ✅ logo + colour |
| `domain.service.ts` | ✅ DNS TXT check |
| `plan.service.ts` | ✅ feature gating, plan limits |
| `usage.service.ts` | ✅ usage_records increment + checks |
| Staff invite / list / profile routes | ❌ **Missing** |

**Module: `modules/api-keys/`** — ✅ Create, list, revoke

**Module: `modules/webhooks/`** — ✅ Create, list, deliveries, HMAC signing
- ❌ Missing: `DELETE`, `PATCH`, `POST /:id/test`

**Module: `modules/shipments/`** — ⚠️ **SKELETAL**
- Only `GET /shipments` exists (last 50, no tenant filter, no pagination)
- Everything else is missing — see [Priority 1](#priority-1--shipment-core)

**Module: `modules/finance/`** — ⚠️ **SKELETAL**
- `GET /invoices`, `GET /summary`, `POST /invoices/:id/send` only
- ❌ Missing: create, get by ID, update, pay, void, bulk, credit-notes, refunds, overdue job

**Module: `modules/crm/`** — ⚠️ **SKELETAL**
- `GET /leads` only (no pagination, no filters)
- ❌ Missing: all CRUD for leads, quotes, customers

**Module: `modules/analytics/`** — ⚠️ **PARTIALLY BROKEN**
- `GET /analytics/full` exists but `onTimeRate` and `avgDeliveryDays` are **hardcoded 0**
- ❌ Missing: shipments breakdown, revenue breakdown, staff, CSV export

**Module: `modules/audit/`** — ✅ Paginated audit log, feature-gated

**Module: `modules/driver/`** — ⚠️ **PARTIAL**
- `GET /driver/route` ✅
- ❌ Missing: stop status update, POD upload, failed delivery, history

### ❌ Entire modules not yet created

| Module | What it needs |
|--------|--------------|
| `modules/tracking/` | Public `GET /tracking/:number` · WebSocket (Socket.io + Redis adapter) |
| `modules/payments/` | Stripe intent · webhook handler · Paystack |
| `modules/notifications/` | BullMQ queue · SendGrid · Twilio · email templates |
| `modules/documents/` | Puppeteer PDF generation · S3 upload · signed URLs |
| `modules/users/` | `GET/PATCH /users/me` · `GET /users` · invite · deactivate |
| `modules/super-admin/` | Full admin API (see Priority 10) |
| `modules/pricing/` | Full pricing module (see Feature Additions Priority 19) |
| `modules/fleet/` | Vehicle + driver management CRUD |
| `modules/returns/` | Returns lifecycle (see Feature Additions Priority 16) |
| `modules/support/` | Support ticket system (see Feature Additions Priority 17) |

### ❌ Infrastructure not yet created

- BullMQ workers: notification, outbox, webhook delivery
- Socket.io server with Redis adapter (multi-instance real-time)
- `@fastify/rate-limit` — 100/min general, 10/min auth, 500/hr API keys
- Idempotency middleware (`idempotency_keys` table check/store)
- Prisma middleware for automatic `tenant_id` scoping
- Outbox event pattern (write + publish workers)

---

## 3. Prisma Schema

**Status: ✅ Complete — 893 lines, all 35 models present.**

All models: `Tenant`, `TenantSettings`, `User`, `RefreshToken`, `Organisation`, `Shipment`, `ShipmentItem`, `ShipmentEvent`, `PodAsset`, `Driver`, `Vehicle`, `Route`, `RouteStop`, `ServiceZone`, `RateCard`, `Invoice`, `Payment`, `Refund`, `CreditNote`, `CurrencyRate`, `Lead`, `Quote`, `Subscription`, `ApiKey`, `WebhookEndpoint`, `WebhookDelivery`, `ShipmentDocument`, `UsageRecord`, `NotificationLog`, `OutboxEvent`, `AuditLog`, `Branch`, `SsoProvider`, `AccountingConnection`, `IdempotencyKey`

> **Action required:** Run `npx prisma db push --schema=apps/backend/prisma/schema.prisma` against the local docker-compose PostgreSQL before starting dev.

---

## 4. Marketing Site

**Status: ~85% complete** — `apps/frontend/src/`

### ✅ What exists

- All primary pages: `page.tsx`, `pricing/`, `features/`, `regions/`, `signup/`, `docs/`, `legal/`
- Error states: `error.tsx`, `loading.tsx`, `not-found.tsx`, `permission-denied/`, `plan-gated/`
- All marketing components: `Navbar`, `Hero`, `SocialProof`, `FeatureSection`, `ScreenshotShowcase`, `PricingCards`, `RegionStrip`, `TestimonialCarousel`, `FAQAccordion`, `CTABanner`, `Footer`, `SignupForm`, `FeatureComparisonTable`, `FadeInOnScroll`
- `lib/marketing-data.ts` · `lib/seo.ts`
- `api/auth/register/route.ts` — Next.js API proxy to backend

### ❌ What is missing

| Missing | Notes |
|---------|-------|
| `app/login/page.tsx` | Email/password form + redirect to `{slug}.fauward.com` |
| `app/forgot-password/page.tsx` | — |
| `app/reset-password/page.tsx` | — |
| Screenshot assets in `ScreenshotShowcase` | Currently placeholders |

---

## 5. Tenant Portal

**Status: ~70% complete UI, backend integration partial** — `apps/tenant-portal/src/`

### ✅ What exists

**UI Library:** `Button`, `Input`, `Textarea`, `Select`, `Switch`, `Badge`, `Avatar`, `Dialog`, `Dropdown`, `Skeleton`, `Spinner`, `StatCard`, `StatusBadge`, `Table`, `Tabs`, `Tooltip`, `UsageMeter`, `EmptyState`

**Layouts:** `AppShell`, `Sidebar` (role-aware, 256 px), `TopBar`, `MobileNav`, `PageShell`, `PublicLayout`, `navigation.ts`

**Stores:** `auth.store.ts`, `useTenantStore.ts`, `useAppStore.ts`

**Hooks:** `useAuth`, `useTenant`, `useBilling`, `usePermission`

**Shared components:** `PermissionGate`, `PlanGate`, `StatusBadge`, `TrackingNumber`, `EmptyState`, `ErrorState`, `CommandPalette`, `ToastStack`, `OnboardingChecklist`

**Shipments:** Full list page · detail page · 4-step create wizard (`StepAddresses`, `StepPackage`, `StepService`, `StepReview`) · `ShipmentTable` · `ShipmentFilterBar` · `ShipmentTimeline` · `UpdateStatusModal` · `AssignDriverModal` · `DocumentsPanel` · `NotesPanel`

**Tracking (public):** `TrackingLookupPage`, `TrackingResultPage`, all sub-components

**Onboarding:** All 5 step components + `DashboardChecklist`

**Billing:** `BillingTab`, `CurrentPlanCard`, `UsageSection`, `PlanComparisonTable`, `InvoiceHistoryTable`, `ChangePlanModal`, `TrialBanner`, `UsageWarningBanner`, `LimitReachedBanner`, `FailedPaymentBanner`, `SuspendedOverlay`

**Settings:** `ApiKeysTab`, `WebhooksTab`, all sub-components

**Admin features:** `AnalyticsPage`, `AuditLogPage`, `CrmPipelinePage`, `AdminFinancePage`, `EmbedWidgetTab`

### ❌ What is missing

| Missing page / feature | Detail |
|-----------------------|--------|
| `/login` page | Email/password form → auth API → dashboard redirect |
| Team management page | Staff list + invite + role change + remove |
| Dispatch / routes board | Today's shipments grouped by driver, capacity warnings |
| Customer portal views | Scoped dashboard for `CUSTOMER_ADMIN` / `CUSTOMER_USER` roles |
| Profile / account settings | Name, email, password change, MFA toggle |
| Custom domain settings UI | Domain input + verification status + DNS instructions |
| Accounting integrations page | Xero/QuickBooks OAuth connect flow (Pro+) |
| CSV import UI | Import wizard for customers, shipments, rate cards |
| Real-time tracking | `TrackingResultPage` needs Socket.io — currently static |
| `/book` public booking page | Customer-facing no-auth booking form |

---

## 6. Agents PWA

**Status: ✅ Complete** — `apps/agents/src/`

Replaces the old `apps/driver` surface. Field-operations mobile web app for scanning shipments and advancing statuses with audit-friendly notes and location.

### ✅ What exists

All pages: `WelcomePage`, `LoginPage`, `DashboardPage`, `ScanPage`, `ShipmentPage`, `ConfirmPage`, `ShipmentsPage`

All components: `AgentGate`, `AgentLayout`, `AgentNav`, `AgentSyncListener`, `QRScanner`, `AccessPending`, `Button`, `Input`, `Textarea`

All hooks: `useOnlineStatus`

Context: `AgentAuthContext` (session/auth state + token refresh)

Core lib: `api.ts` (authenticated API client), `session.ts` (localStorage persistence), `agentOfflineQueue.ts` (scan + advance queues), `agentWorkflow.ts` (status flow), `agentPaths.ts` (route helpers)

Service worker `sw.ts` — stale-while-revalidate app shell + network-first agents API

### ✅ Backend routes (all implemented)

| Route | Purpose |
|-------|---------|
| `GET /api/v1/agents/shipments/by-ref/:trackingRef` | Shipment summary + timeline for a tracking reference |
| `POST /api/v1/agents/shipments/advance` | Advance shipment to next status with location + notes |
| `GET /api/v1/agents/shipments/recent?limit=50` | Recent shipments last touched by authenticated user |

### ⚠️ Known gap

| Item | Detail |
|------|--------|
| Offline advance queue doesn't re-auth before replay | `AgentSyncListener` stops on first server error; if the error is a 401 the queue stalls until the user logs in again |

---

## 7. Super Admin

**Status: ~85% complete UI — no backend routes exist** — `apps/super-admin/src/`

### ✅ What exists

All pages: `DashboardPage`, `TenantsListPage`, `TenantDetailPage`, `RevenuePage`, `QueuesPage`, `SystemHealthPage`, `ImpersonationPage`

All components: `MRRChart`, `RevenueCharts`, `ShipmentsChart`, `TenantTable`, `TenantDetailTabs`, `PlanOverrideModal`, `SuspendDialog`, `MetricCard`, `AlertCard`, `ActivityFeed`, `QueueTable`, `QueueMessageViewer`, `SystemMetrics`, `ImpersonationBanner`

### ❌ What is missing

The **entire backend surface** — every route under `/api/v1/admin/*`. See [Priority 10](#priority-10--super-admin-backend).

---

## 8. Embeddable Widget

**Status: ~80% complete** — `widget/src/`

### ✅ What exists

`widget.js` · `embed.js` · `api.js` · `styles.css`

### ❌ What is missing

| Gap | Notes |
|-----|-------|
| Build pipeline | No `vite.config.js` / rollup config — bundle not produced |
| WebSocket support | Currently fetches once only |
| CDN path | Needs to be served from `cdn.fauward.com/widget.js` |

---

## 9. Shared Packages

| Package | Status | Notes |
|---------|--------|-------|
| `brand` | ✅ `brand.css` | Design tokens, colour vars, typography |
| `shared-types` | ✅ `index.ts` | Verify all cross-app interfaces are exported |
| `domain-types` | ✅ `index.ts` | Shipment, Tenant, User domain types |
| `theme-engine` | ✅ `index.ts` | CSS var injection from branding API response |
| `design-tokens` | ✅ | Token definitions |
| `formatting` | ✅ | Currency, date, weight formatters — verify all regional currencies |

---

## 10. Priority Build Order

Build in this exact sequence. Each item is a discrete, unambiguous unit of work.

---

### Priority 1 — Shipment Core

> **Without this, the product cannot function.**

**1A — Fill `apps/backend/src/modules/shipments/shipments.routes.ts`**

```
GET    /api/v1/shipments
         ↳ tenant filter · pagination (page/limit)
         ↳ filters: status, dateFrom, dateTo, driverId, customerId
         ↳ search by trackingNumber

POST   /api/v1/shipments
         ↳ validate body
         ↳ run pricing engine (shared/utils/pricing.ts)
         ↳ generate tracking number (shared/utils/trackingNumber.ts)
         ↳ create ShipmentEvent (PENDING)
         ↳ increment usage_records
         ↳ return shipment with tracking number

GET    /api/v1/shipments/:id
         ↳ includes: items, events, podAssets, driver, organisation, invoice

PATCH  /api/v1/shipments/:id/status
         ↳ enforce ALLOWED_TRANSITIONS (reject invalid with 400)
         ↳ DELIVERED: require podAssets to exist
         ↳ FAILED_DELIVERY: require failedReason
         ↳ write ShipmentEvent · emit outbox event · fire webhooks

PATCH  /api/v1/shipments/:id/assign
         ↳ assign driverId
         ↳ roles: TENANT_ADMIN, TENANT_MANAGER only

DELETE /api/v1/shipments/:id
         ↳ soft-delete (status → CANCELLED)
         ↳ only if PENDING or PROCESSING
```

**Pricing engine** — implement in `shared/utils/pricing.ts`:

```
base price = weight_kg × zone_rate[originZoneId][destZoneId]
multiplier: STANDARD=1.0 | EXPRESS=1.6 | OVERNIGHT=2.2
surcharges: oversize (+15% if dim > 120 cm) | insurance (+2% declared value) | remote area
finalPrice = round((base × multiplier × surcharges) + VAT, 2)
```

**Tracking number** — implement in `shared/utils/trackingNumber.ts`:

```typescript
// Format: {TENANT_SLUG}-{YYYYMM}-{6CHAR uppercase alphanumeric}
// Check uniqueness in DB · retry up to 5 times
export async function generateTrackingNumber(prisma, tenantSlug: string): Promise<string>
```

**1B — Create `modules/tracking/tracking.routes.ts`**

```
GET /api/v1/tracking/:trackingNumber   PUBLIC — no auth required
  ↳ returns: status, events[], estimatedDelivery, origin, destination
```

**1C — Create `modules/tracking/tracking.websocket.ts`**

```typescript
// Socket.io + Redis adapter
// Room: `{tenantId}:{trackingNumber}`
// Client → Server: { type: "subscribe", trackingNumber }
// Server → Client: { type: "status_update", data: { status, location, timestamp } }
// Register in app.ts after Fastify server creation
```

---

### Priority 2 — User / Team Management

**2A — Create `modules/users/users.routes.ts`**

```
GET    /api/v1/users/me
PATCH  /api/v1/users/me        ↳ password change: currentPassword + newPassword required
GET    /api/v1/users           ↳ roles: TENANT_ADMIN, TENANT_MANAGER
POST   /api/v1/users/invite    ↳ TENANT_ADMIN only; sends invite email
PATCH  /api/v1/users/:id/role  ↳ TENANT_ADMIN only; cannot demote self
DELETE /api/v1/users/:id       ↳ set isActive=false; cannot delete self
```

**2B — Complete auth routes**

```
POST /auth/forgot-password  ↳ signed reset token (hash in DB, 1 hr expiry) → email
POST /auth/reset-password   ↳ verify token, hash new password, invalidate all refresh tokens
```

---

### Priority 3 — Notifications & Outbox

**3A — Create `modules/notifications/`**

```
notifications.service.ts   sendEmail(to, template, data)  via SendGrid
                           sendSms(to, message)            via Twilio
                           → logs all to notification_log

email-templates.ts         Template key → SendGrid template ID map
                           (see Feature Additions §25.3 for full key list)

notifications.worker.ts    BullMQ worker for `notification` queue
```

**3B — Create `queues/`**

```
queues.ts           notificationQueue · webhookQueue · outboxQueue

outbox.worker.ts    Poll outbox_events WHERE published=false
                    → dispatch to correct queue
                    → set published=true

Register workers in server.ts
```

**3C — Wire into shipment status changes**

After each `ShipmentEvent` write: enqueue notification job for customer + TENANT_ADMIN. SMS only for Pro/Enterprise.

---

### Priority 4 — Document Generation

**4A — Create `modules/documents/`**

```
documents.service.ts
  generateDeliveryNote(shipmentId)   → Puppeteer → S3/local → signed URL
  generateInvoicePdf(invoiceId)      → Puppeteer → S3/local → signed URL
  generateManifest(routeId)          → Puppeteer → S3/local → signed URL

documents.routes.ts
  POST /api/v1/documents/delivery-note/:shipmentId
  POST /api/v1/documents/invoice/:invoiceId
  GET  /api/v1/documents/:id          ↳ get/refresh signed URL

documents/templates/
  delivery-note.html    ↳ inject tenant logo, primary colour, brand name at render time
  invoice.html          ↳ same
```

> Use `STORAGE_DRIVER=local|s3` env var to switch between filesystem (dev) and S3 (production).

---

### Priority 5 — Finance Module

**5A — Fill `modules/finance/finance.routes.ts`**

```
POST   /finance/invoices               ↳ invoice_number: {TENANT_SLUG}-INV-{YYYY}-{NNNN}
GET    /finance/invoices/:id           ↳ include line_items, payments, credit_notes
PATCH  /finance/invoices/:id           ↳ DRAFT only
POST   /finance/invoices/:id/send      ↳ mark SENT · send PDF email to customer
POST   /finance/invoices/:id/pay       ↳ create Payment · mark PAID if total satisfied
POST   /finance/invoices/:id/void      ↳ mark VOID · cannot void PAID
POST   /finance/invoices/bulk          ↳ bulk create for date range of unvoiced deliveries
GET    /finance/payments
POST   /finance/credit-notes
GET    /finance/credit-notes
GET    /finance/report/csv             ↳ stream CSV for date range
```

**Overdue detection:** BullMQ repeatable job (daily):

```
Find SENT invoices WHERE due_date < today
  → mark OVERDUE
  → enqueue email to customer + TENANT_ADMIN
```

---

### Priority 6 — Payments / Stripe

**6A — Create `modules/payments/`**

```
payments.routes.ts
  POST /payments/intent            ↳ create Stripe PaymentIntent → return clientSecret
  GET  /payments/:shipmentId       ↳ get payment record
  POST /payments/webhook/stripe    ↳ verify signature · handle succeeded + failed

stripe.service.ts
  createPaymentIntent, createCustomer, createSubscription, cancelSubscription, handleWebhook

billing.service.ts
  Subscription lifecycle:
    invoice.payment_failed (attempt 1) → email warning · retry in 3 days
    invoice.payment_failed (attempt 2) → SUSPENDED · email
    invoice.payment_failed (attempt 3) → final warning
    After 30 days SUSPENDED           → CANCELLED
```

---

### Priority 7 — CRM Module

**7A — Fill `modules/crm/crm.routes.ts`**

```
GET/POST/PATCH/DELETE  /crm/leads
GET    /crm/leads/:id

GET/POST/PATCH         /crm/quotes
POST   /crm/quotes/:id/send         ↳ PDF email to customer
POST   /crm/quotes/:id/accept       ↳ creates Shipment · marks lead WON
POST   /crm/quotes/:id/reject       ↳ marks lead LOST

GET/POST/PATCH         /crm/customers
GET    /crm/customers/:id
```

---

### Priority 8 — Analytics

**8A — Fill `modules/analytics/analytics.routes.ts`**

```
GET /analytics/shipments
    ↳ by status breakdown · lifecycle funnel · on-time rate (fix hardcoded 0)
    ↳ avg delivery days · SLA compliance · top 5 routes · exceptions panel

GET /analytics/revenue
    ↳ by service tier · by customer (top 10) · collection rate

GET /analytics/staff
    ↳ shipments per staff member · avg handle time

GET /analytics/export/csv
    ↳ stream CSV for date range · roles: TENANT_ADMIN, TENANT_MANAGER, TENANT_FINANCE
```

---

### Priority 9 — Driver Backend

**9A — Fill `modules/driver/driver.routes.ts`**

```
PATCH /driver/stops/:stopId/status
    ↳ IN_PROGRESS or COMPLETED · body: { status, location: { lat, lng } }

POST  /driver/pod
    ↳ body: { shipmentId, photoBase64?, signatureBase64?, recipientName, notes }
    ↳ save to S3 · create PodAsset records · trigger DELIVERED status

PATCH /driver/shipments/:id/failed
    ↳ body: { reason, notes, attemptedAt }
    ↳ transition to FAILED_DELIVERY · create ShipmentEvent · enqueue notification

GET   /driver/history
    ↳ completed stops for last 30 days
```

---

### Priority 10 — Super Admin Backend

**10A — Create `modules/super-admin/super-admin.routes.ts`**

> Gate every route: `requireRole(['SUPER_ADMIN'])`

```
GET    /admin/tenants                       ↳ pagination · search · plan/status filter
GET    /admin/tenants/:id                   ↳ branding, settings, usage, subscription, staff
PATCH  /admin/tenants/:id/plan              ↳ audit log required · body: { plan, reason }
POST   /admin/tenants/:id/suspend           ↳ set SUSPENDED · email TENANT_ADMIN
POST   /admin/tenants/:id/unsuspend         ↳ set ACTIVE · email TENANT_ADMIN
POST   /admin/tenants/:id/impersonate       ↳ 30-min JWT · write to audit_log
DELETE /admin/impersonate
GET    /admin/metrics                       ↳ MRR · active tenants · shipments today · DLQ depth
GET    /admin/queues                        ↳ per-queue BullMQ stats
GET    /admin/health                        ↳ DB ping · Redis ping · uptime
```

---

### Priority 11 — Frontend Missing Pages

**11A — Marketing site auth pages**

- `apps/frontend/src/app/login/page.tsx` — email/password → auth API → redirect to `{slug}.fauward.com/dashboard`
- `apps/frontend/src/app/forgot-password/page.tsx`
- `apps/frontend/src/app/reset-password/page.tsx`

**11B — Tenant portal: Team management**

- `pages/team/TeamPage.tsx` — staff list + invite + role change + remove (TENANT_ADMIN only)
- Wire: `GET/POST/PATCH/DELETE /users`

**11C — Tenant portal: Profile / account settings**

- `pages/settings/ProfileTab.tsx` — name, email (readonly), phone, password change, MFA toggle
- Wire: `GET/PATCH /users/me`

**11D — Tenant portal: Custom domain settings**

- Add Domain tab to settings — input + verification status + DNS CNAME instructions

**11E — Tenant portal: Real-time tracking**

- `TrackingResultPage.tsx` — connect Socket.io after initial fetch; update timeline on `status_update`
- Install `socket.io-client` in tenant-portal

**11F — Tenant portal: Dispatch board**

- `pages/dispatch/DispatchPage.tsx` — today's shipments grouped by driver; capacity warnings (> 20 stops); quick-assign

---

### Priority 12 — Rate Limiting

Install `@fastify/rate-limit`. Register with `global: false` in `app.ts`.

```typescript
// Auth routes
{ max: 10, timeWindow: '1 minute' }

// General API (JWT auth)
{ max: 100, timeWindow: '1 minute' }

// API key auth — read limit from ApiKey.rateLimit in DB
{ max: apiKey.rateLimit, timeWindow: '1 hour' }
```

---

### Priority 13 — Idempotency Middleware

Create `shared/middleware/idempotency.ts`:

```typescript
// 1. Read Idempotency-Key header
// 2. SHA-256 hash the key
// 3. Check idempotency_keys table
//    - COMPLETED → return cached response (no re-execution)
//    - PROCESSING → 409 Conflict
//    - not found  → insert PROCESSING, execute, update COMPLETED
// 4. Keys expire after 24 hours
// Apply to: POST /shipments, POST /invoices, POST /payments/intent, POST /quotes
```

---

### Priority 14 — CI/CD and Docker

**14A — Dockerfiles**

Multi-stage `node:20-alpine` Dockerfiles for `backend`, `frontend`, `tenant-portal`, `super-admin`.

**14B — `.github/workflows/ci.yml`**

```yaml
services:
  postgres: postgres:15
  redis:    redis:7

steps:
  - checkout
  - setup-node (v20)
  - npm ci
  - npx prisma generate
  - npx prisma db push
  - npm test --workspace=apps/backend
  - npm run build --workspace=apps/frontend
  - npm run build --workspace=apps/tenant-portal
```

---

### Priority 15 — Tests

**Backend unit tests:**

| Test file | Coverage |
|-----------|---------|
| `auth.service.test.ts` | register, duplicate email, wrong password, token rotation |
| `pricing.test.ts` | all multipliers, surcharges, zone rate lookup |
| `shipments.state-machine.test.ts` | all valid/invalid transitions; DELIVERED requires POD; FAILED requires reason |
| `tenants.isolation.test.ts` | cross-tenant returns 404 not 403 (no information leak) |

**Cross-tenant security test** (`cross_tenant_test.sh` already exists — expand it):

- Tenant A token cannot see / modify Tenant B shipments
- API key from Tenant A cannot call Tenant B endpoints
- SUPER_ADMIN impersonation JWT expires after 30 min and is audit-logged

---

## 11. Environment Variables

```bash
# ── Database ──────────────────────────────────────────────
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/fauward_dev
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/fauward_dev

# ── JWT ───────────────────────────────────────────────────
# Generate: openssl genrsa -out private.pem 2048
#           openssl rsa -in private.pem -pubout -out public.pem
JWT_ACCESS_SECRET=<RS256 private key>
JWT_REFRESH_SECRET=<separate secret>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# ── Redis ─────────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ── Stripe ────────────────────────────────────────────────
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# ── SendGrid ──────────────────────────────────────────────
SENDGRID_API_KEY=SG....
SENDGRID_FROM_EMAIL=noreply@fauward.com

# ── Twilio ────────────────────────────────────────────────
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1...

# ── AWS S3 (use STORAGE_DRIVER=local in dev) ──────────────
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=fauward-documents
AWS_REGION=eu-west-2
STORAGE_DRIVER=local     # or: s3

# ── App ───────────────────────────────────────────────────
PORT=3000
NODE_ENV=development
FAUWARD_BASE_DOMAIN=fauward.com
```

---

## 12. Phase Completion Summary

| Phase | Spec File | Status | Key remaining work |
|-------|-----------|:------:|-------------------|
| **1** Foundation | PHASE-1-FOUNDATION.md | ✅ **Complete** | — |
| **2** Tenant Onboarding | PHASE-2-TENANT-ONBOARDING.md | 🟡 **~85%** | Auth forgot/reset; team invite backend; rate limiting |
| **3** Billing | PHASE-3-BILLING.md | 🔴 **~10%** | Stripe subscriptions, trial, dunning, metered overage, Paystack |
| **4** Logistics Core | PHASE-4-LOGISTICS-CORE.md | 🔴 **~15%** | Shipment CRUD, state machine, tracking WebSocket, notifications, driver POD, documents |
| **5** Frontend | PHASE-5-FRONTEND.md | 🟡 **~75%** | Login page, team management, dispatch board, customer portal, profile, domain settings |
| **6** Pro Features | PHASE-6-PRO-FEATURES.md | 🟡 **~50%** | API keys ✅ · webhooks ✅ · widget ✅ · idempotency ❌ · widget build pipeline ❌ |
| **6b** CRM / Docs / Finance | PHASE-6B-CRM-DOCS-FINANCE.md | 🔴 **~15%** | CRM full CRUD, document generation, full finance lifecycle |
| **6c** Integrations | PHASE-6C-INTEGRATIONS.md | 🔴 **0%** | Xero, QuickBooks, carrier APIs, e-invoicing, import tools |
| **7** Testing | PHASE-7-TESTING.md | 🔴 **0%** | All tests |
| **8** Deploy | PHASE-8-DEPLOY.md | 🔴 **~5%** | docker-compose ✅ · production Dockerfiles ❌ · CI/CD ❌ · AWS ❌ |
| **9** Enterprise | PHASE-9-ENTERPRISE.md | 🔴 **0%** | SSO, multi-branch, advanced RBAC, dedicated infra, MFA enforcement |

---

*Part of the [Fauward documentation](../README.md)*
