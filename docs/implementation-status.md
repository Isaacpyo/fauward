# Fauward — Implementation Status (April 2026)

> **Ground truth of what exists today vs what the spec requires.** Read [the spec docs](../docs/) for full requirements. Read this document to know exactly what to build next, what files to fill in, and what to create from scratch. Every item below has been verified against the actual codebase.

---

## 24.1 Monorepo Structure

```
fauward/
├── apps/
│   ├── backend/          Node.js · Fastify · TypeScript · Prisma
│   ├── frontend/         Next.js 14 App Router (marketing site)
│   ├── tenant-portal/    React 18 · Vite (ops portal)
│   ├── driver/           React 18 · Vite · PWA (driver app)
│   └── super-admin/      React 18 · Vite (internal admin)
├── packages/
│   ├── brand/            brand.css (design tokens, colours, typography)
│   ├── shared-types/     index.ts (cross-app TypeScript types)
│   ├── domain-types/     index.ts (domain model types)
│   ├── theme-engine/     index.ts (tenant CSS var injection)
│   ├── design-tokens/    (token definitions)
│   └── formatting/       (currency, date, weight formatters)
├── widget/               Vanilla JS embeddable tracking widget
├── docker-compose.yml    Local dev: PostgreSQL 15, Redis 7, MailHog
└── supabase_init.sql     (present — relationship to Prisma schema unclear)
```

**Package manager:** npm workspaces. Run `npm run dev` from root to start the backend.

---

## 24.2 Backend — `apps/backend/src/`

### What exists and works

**Server / Plugins**
- `server.ts` — Fastify server entry, starts on configured port
- `app.ts` — `buildApp()` registers all plugins and routes
- `plugins/prisma.ts` — Prisma client decorated onto Fastify as `app.prisma`
- `plugins/redis.ts` — Redis client decorated onto Fastify as `app.redis`
- `config/index.ts` — Central env var config
- `context/tenant.context.ts` — `AsyncLocalStorage` for tenant context throughout request lifecycle

**Shared Middleware**
- `shared/middleware/authenticate.ts` — JWT Bearer token verification, decorates `req.user`
- `shared/middleware/tenant.resolver.ts` — Resolves tenant from subdomain/header, decorates `req.tenant`
- `shared/middleware/tenantMatch.ts` — Ensures JWT `tenantId` matches resolved tenant
- `shared/middleware/featureGuard.ts` — `requireFeature(featureName)` checks plan capabilities via `planService`
- `shared/middleware/requireRole.ts` — `requireRole(roles[])` RBAC check

**Shared Utils**
- `shared/utils/hash.ts` — bcrypt hash/verify (cost factor 12)
- `shared/utils/jwt.ts` — RS256 access token (15min) + refresh token (7d) sign/verify
- `shared/utils/logger.ts` — Structured logger
- `shared/utils/totp.ts` — TOTP generation and verification for MFA

**Auth module** — `modules/auth/`
- `auth.routes.ts` — Routes registered: `POST /api/v1/auth/register`, `/login`, `/refresh`, `/logout`, `GET /me`, `POST /mfa/setup`, `/mfa/verify`, `/mfa/validate`
- `auth.service.ts` — Full register flow: slugify company name, ensure unique slug, bcrypt password, Prisma transaction creates Tenant + TenantSettings + User + UsageRecord; login with password verify + JWT issue; refresh token rotation; MFA TOTP setup/verify
- `auth.controller.ts` — Thin controller delegating to service
- `auth.schema.ts` — Zod schemas for register and login bodies
- **Missing in auth:** `POST /auth/forgot-password`, `POST /auth/reset-password` (routes declared in spec, not implemented)

**Tenant module** — `modules/tenants/`
- `tenant.routes.ts` — `GET /api/v1/tenant/me`, `PATCH /branding`, `PATCH /settings`, `PATCH /domain` (Pro+), `GET /domain/status`, `GET /usage`, `GET /onboarding`, `GET /plan-features`
- `tenant.service.ts` — Tenant CRUD, `getTenantBySlug`, `updateSettings`
- `branding.service.ts` — Logo + colour update, writes to TenantSettings
- `domain.service.ts` — Custom domain record create/verify (DNS TXT check logic)
- `plan.service.ts` — `hasFeature(plan, feature)` map for feature gating; plan limits (shipment counts, staff counts)
- `usage.service.ts` — Increments `usage_records` for current month; checks against plan limits
- **Missing in tenants:** staff invite (`POST /users/invite`), staff list (`GET /users`), user profile (`GET/PATCH /users/me`), team management routes

**API Keys module** — `modules/api-keys/`
- `api-keys.routes.ts` — `GET /api/v1/tenant/api-keys`, `POST` (create), `DELETE /:id` (revoke)
- `api-keys.service.ts` — Generate key with `fwd_` prefix, bcrypt hash for storage, show-once plaintext return, list, revoke

**Webhooks module** — `modules/webhooks/`
- `webhooks.routes.ts` — `GET /api/v1/tenant/webhooks`, `POST` (create), `GET /deliveries`
- `webhooks.service.ts` — CRUD for webhook endpoints; `deliverEvent(tenantId, eventType, payload)` with HMAC-SHA256 signing and delivery logging
- **Missing:** `DELETE /webhooks/:id`, `PATCH /webhooks/:id`, `POST /webhooks/:id/test` (send test event)

**Shipment module** — `modules/shipments/` — **SKELETAL**
- `shipments.routes.ts` — Only `GET /api/v1/shipments` (returns last 50, no tenant filter, no pagination, no filters)
- **Everything else is missing.** See Priority 1 below.

**Finance module** — `modules/finance/` — **SKELETAL**
- `finance.routes.ts` — `GET /api/v1/finance/invoices`, `GET /finance/summary`, `POST /finance/invoices/:id/send`
- **Missing:** `POST /finance/invoices` (create), `GET /finance/invoices/:id`, `PATCH /finance/invoices/:id`, `POST /finance/invoices/:id/pay`, `POST /finance/invoices/:id/void`, credit notes, refunds, overdue reminders

**CRM module** — `modules/crm/` — **SKELETAL**
- `crm.routes.ts` — Only `GET /api/v1/crm/leads` (returns all, no pagination)
- **Missing:** `POST /crm/leads`, `PATCH /crm/leads/:id`, `GET /crm/leads/:id`, `GET /crm/quotes`, `POST /crm/quotes`, `PATCH /crm/quotes/:id`, `POST /crm/quotes/:id/accept`, `GET /crm/customers`, `GET /crm/customers/:id`

**Analytics module** — `modules/analytics/`
- `analytics.routes.ts` — `GET /api/v1/analytics/full` — returns shipment count, revenue total, volume by day (last 30 days), revenue by day (last 30 days). `onTimeRate` and `avgDeliveryDays` are **hardcoded 0**.
- **Missing:** `GET /analytics/shipments`, `GET /analytics/revenue`, staff performance, top customers, CSV export endpoint

**Audit module** — `modules/audit/`
- `audit.routes.ts` — `GET /api/v1/audit-log` with pagination (page/limit), includes actor user, ordered by timestamp desc, gated by `auditLog` feature ✅

**Driver module** — `modules/driver/`
- `driver.routes.ts` — `GET /api/v1/driver/route` — resolves driver record for current user, finds route for given date, returns stops with shipment data
- **Missing:** `PATCH /driver/stops/:id/status`, `POST /driver/pod`, `GET /driver/history`, `PATCH /driver/shipments/:id/failed`

### Not yet created — entire modules

- `modules/tracking/` — Public `GET /api/v1/tracking/:trackingNumber`, WebSocket setup with Socket.io + Redis adapter
- `modules/payments/` — Stripe intent, webhook handler, Paystack integration
- `modules/notifications/` — BullMQ queue setup, SendGrid email sender, Twilio SMS sender, email templates per event
- `modules/documents/` — PDF generation (Puppeteer/PDFKit), S3 upload, signed URL generation
- `modules/users/` — Staff management (`GET/POST /users`, `GET/PATCH /users/me`, `POST /users/invite`, `DELETE /users/:id`)
- `modules/super-admin/` — Super admin API: tenant list/detail, impersonation, plan override, suspend, queue stats

### Not yet created — infrastructure

- BullMQ queue workers (notification worker, outbox worker, webhook delivery worker)
- Socket.io server with Redis adapter for multi-instance real-time tracking
- Rate limiting (`@fastify/rate-limit`): 100/min general, 10/min auth endpoints, 500/hr for API key auth
- Idempotency middleware (check/store in `idempotency_keys` table for POST mutations)
- Prisma middleware for automatic `tenant_id` injection and multi-tenant isolation enforcement
- Outbox event pattern: write to `outbox_events` on state changes, worker publishes to queues

---

## 24.3 Prisma Schema — `apps/backend/prisma/schema.prisma`

**Status: Complete (893 lines).** All 35 models are defined matching the data model spec. All enums are defined. Relations are correct.

**Models present:**
`Tenant`, `TenantSettings`, `User`, `RefreshToken`, `Organisation`, `Shipment`, `ShipmentItem`, `ShipmentEvent`, `PodAsset`, `Driver`, `Vehicle`, `Route`, `RouteStop`, `ServiceZone`, `RateCard`, `Invoice`, `Payment`, `Refund`, `CreditNote`, `CurrencyRate`, `Lead`, `Quote`, `Subscription`, `ApiKey`, `WebhookEndpoint`, `WebhookDelivery`, `ShipmentDocument`, `UsageRecord`, `NotificationLog`, `OutboxEvent`, `AuditLog`, `Branch`, `SsoProvider`, `AccountingConnection`, `IdempotencyKey`

**Action required:** Verify migrations have been run (`npx prisma migrate dev`). If starting fresh, run `npx prisma db push` against the local docker-compose PostgreSQL.

---

## 24.4 Marketing Site — `apps/frontend/src/`

**Status: ~85% complete.** All primary pages and components exist.

**What exists:**
- `app/page.tsx` — Landing page
- `app/pricing/page.tsx` — Full pricing page
- `app/features/page.tsx` and `app/features/[slug]/page.tsx` — Features overview and per-feature detail
- `app/regions/[region]/page.tsx` — Regional landing pages
- `app/signup/page.tsx` — Signup form
- `app/docs/page.tsx` — Docs entry page
- `app/legal/privacy/page.tsx`, `app/legal/terms/page.tsx`, `app/legal/cookies/page.tsx`
- `app/error.tsx`, `app/loading.tsx`, `app/not-found.tsx`
- `app/permission-denied/page.tsx`, `app/plan-gated/page.tsx`
- Marketing components: `Navbar`, `Hero`, `SocialProof`, `FeatureSection`, `ScreenshotShowcase`, `PricingCards`, `RegionStrip`, `TestimonialCarousel`, `FAQAccordion`, `CTABanner`, `Footer`, `BrandLogo`, `SignupForm`, `FeatureComparisonTable`, `FadeInOnScroll`
- `lib/marketing-data.ts`, `lib/seo.ts`
- `api/auth/register/route.ts` — Next.js API route proxying registration to backend

**What is missing:**
- `app/login/page.tsx` — No login page exists (only signup). Needs email/password form + redirect to tenant portal subdomain
- `app/forgot-password/page.tsx` and `app/reset-password/page.tsx`
- Real screenshot assets in `ScreenshotShowcase`

---

## 24.5 Tenant Portal — `apps/tenant-portal/src/`

**Status: ~70% complete UI; backend integration is partial.**

### What exists

**UI Library (`components/ui/`):**
`Button`, `Input`, `Textarea`, `Select`, `Switch`, `Badge`, `Avatar`, `Dialog`, `Dropdown`, `Skeleton`, `Spinner`, `StatCard`, `StatusBadge`, `Table`, `Tabs`, `Tooltip`, `UsageMeter`, `EmptyState`

**Layouts:**
`AppShell`, `Sidebar`, `TopBar`, `MobileNav`, `PageShell`, `PublicLayout`, `navigation.ts`

**Stores (Zustand):**
`auth.store.ts`, `useTenantStore.ts`, `useAppStore.ts`

**Hooks:**
`useAuth`, `useTenant`, `useBilling`, `usePermission`

**Shared Components:**
`PermissionGate`, `PlanGate`, `StatusBadge`, `TrackingNumber`, `EmptyState`, `ErrorState`, `CommandPalette`, `ToastStack`, `OnboardingChecklist`

**Shipments:** Full list page, detail page, 4-step create wizard, all step components (`StepAddresses`, `StepPackage`, `StepService`, `StepReview`), `ShipmentTable`, `ShipmentFilterBar`, `ShipmentTimeline`, `UpdateStatusModal`, `AssignDriverModal`, `DocumentsPanel`, `NotesPanel`, `ExceptionBanner`, `FailedDeliveryReasonSelect`

**Tracking (Public):** `TrackingLookupPage`, `TrackingResultPage`, all tracking sub-components

**Onboarding:** `OnboardingPage`, `OnboardingStepper`, all 5 step components, `DashboardChecklist`

**Billing:** `BillingTab`, `CurrentPlanCard`, `UsageSection`, `PlanComparisonTable`, `InvoiceHistoryTable`, `ChangePlanModal`, `TrialBanner`, `UsageWarningBanner`, `LimitReachedBanner`, `FailedPaymentBanner`, `SuspendedOverlay`

**Settings:** `ApiKeysTab`, `WebhooksTab`, all API key and webhook sub-components

**Admin features:** `AnalyticsPage`, `AuditLogPage`, `CrmPipelinePage`, `AdminFinancePage`, `EmbedWidgetTab`

**Driver features:** `DriverDashboard`, `DeliveryDetail`, `CapturePoD`

**Router:** React Router v6 routes covering all public, auth, onboarding, app, and admin routes

### What is missing

- **`/login` page** — No login page. Needs email/password form, calls auth API, redirects to dashboard
- **Team management page** — No page to view staff list, invite, remove staff (`GET /users`, `POST /users/invite`, `DELETE /users/:id`)
- **Dispatch / Routes board** — No daily dispatch page grouping shipments by driver
- **Customer portal views** — Customer-role users need scoped dashboard (their shipments only, booking, invoices)
- **Profile / account settings page** — No `GET/PATCH /users/me` page (name, email, password, MFA)
- **Custom domain settings UI** — API exists; UI to enter domain + DNS instructions is missing
- **Accounting integrations page** — Xero/QuickBooks OAuth connect flow
- **CSV import UI** — Import wizard for customers, shipment history, rate cards
- **Real-time tracking connection** — `TrackingResultPage` needs Socket.io client. Currently static.
- **`/book` public booking page** — Public shipment booking form

---

## 24.6 Driver PWA — `apps/driver/src/`

**Status: ~90% complete UI. Backend integration wired for route; POD upload not wired.**

All pages exist: `LoginPage`, `RoutePage`, `StopDetailPage`, `ShipmentDetailPage`, `CapturePODPage`, `FailedDeliveryPage`, `HistoryPage`, `ProfilePage`

All components exist: `BottomTabBar`, `CameraCapture`, `SignaturePad`, `OfflineBanner`, `RouteHeader`, `ShipmentCard`, `StopCard`, `SyncIndicator`, `ReasonSelector`

All hooks and stores exist. Service worker (`sw.ts`) exists.

**What is missing (all backend routes):**
- `PATCH /driver/stops/:id/status` — needed for RoutePage to mark stops started/completed
- `POST /driver/pod` — needed for CapturePODPage to upload photo/signature → trigger DELIVERED
- `PATCH /driver/shipments/:id/failed` — needed for FailedDeliveryPage
- Offline sync: `useSyncStore` needs to flush queued mutations when back online; no `/sync` backend endpoint exists

---

## 24.7 Super Admin — `apps/super-admin/src/`

**Status: ~85% complete UI. No backend super-admin API routes exist.**

All pages exist: `DashboardPage`, `TenantsListPage`, `TenantDetailPage`, `RevenuePage`, `QueuesPage`, `SystemHealthPage`, `ImpersonationPage`

All components exist: `MRRChart`, `RevenueCharts`, `ShipmentsChart`, `TenantTable`, `TenantDetailTabs`, `PlanOverrideModal`, `SuspendDialog`, `MetricCard`, `AlertCard`, `ActivityFeed`, `QueueTable`, `QueueMessageViewer`, `SystemMetrics`, `ImpersonationBanner`

**Entire backend surface is missing.** All routes under `GET/PATCH/POST /api/v1/admin/*` need to be created. See Priority 10 below.

---

## 24.8 Embeddable Widget — `widget/src/`

**Status: ~80% complete.** Core files exist: `widget.js`, `embed.js`, `api.js`, `styles.css`

**What is missing:**
- Build pipeline for `<15KB gzipped` bundle — no `vite.config.js` or rollup config
- Real-time updates via WebSocket within widget (currently only fetches once)
- Widget CDN hosting path (`cdn.fauward.com/widget.js`)

---

## 24.9 Packages — `packages/`

| Package | Status | Notes |
|---------|--------|-------|
| `brand` | Exists — `brand.css` | Design tokens, colour vars, typography |
| `shared-types` | Exists — `index.ts` | Verify all shared TypeScript interfaces are exported |
| `domain-types` | Exists — `index.ts` | Shipment, Tenant, User domain model types |
| `theme-engine` | Exists — `index.ts` | CSS var injection from tenant branding API response |
| `design-tokens` | Exists | Token definitions |
| `formatting` | Exists | Currency, date, weight formatters — verify all regional currencies from section 11 |

---

## 24.10 What Must Be Built Next — Priority Order

Build in this exact sequence. Each item is a discrete unit of work.

---

### PRIORITY 1 — Shipment Core (without this, the product cannot function)

**1A. Fill `apps/backend/src/modules/shipments/shipments.routes.ts`**

```
GET    /api/v1/shipments              — list with tenant filter, pagination (page/limit), filters (status, dateFrom, dateTo, driverId, customerId), search by trackingNumber
POST   /api/v1/shipments              — create shipment: validate body, run pricing engine, generate tracking number ({TENANT_SLUG}-{YYYYMM}-{6CHAR}), create ShipmentEvent (PENDING), increment usage_records, return shipment with tracking number
GET    /api/v1/shipments/:id          — single shipment with includes: items, events, podAssets, driver, organisation, invoice
PATCH  /api/v1/shipments/:id/status   — enforce ALLOWED_TRANSITIONS; on DELIVERED require podAssets; on FAILED_DELIVERY require failedReason; create ShipmentEvent; emit outbox event; fire webhook if endpoints exist
PATCH  /api/v1/shipments/:id/assign   — assign driverId; roles: TENANT_ADMIN, TENANT_MANAGER only
DELETE /api/v1/shipments/:id          — soft delete (status = CANCELLED); only if status is PENDING or PROCESSING
```

**Pricing engine** (implement in `shared/utils/pricing.ts`):
```
base = weight_kg × zone_rate[originZoneId][destZoneId]  (from rate_cards table)
multiplier: STANDARD=1.0 | EXPRESS=1.6 | OVERNIGHT=2.2
surcharge: oversized (+15% if any dimension >120cm) | insurance (+2% of declaredValue) | remoteArea (+configurable flat fee)
finalPrice = (base × multiplier × surcharges) rounded to 2dp
VAT applied based on tenant region
```

**Tracking number generation** (implement in `shared/utils/trackingNumber.ts`):
```typescript
// {TENANT_SLUG}-{YYYYMM}-{6CHAR uppercase alphanumeric}
// Must check uniqueness against DB. Retry up to 5 times.
export async function generateTrackingNumber(prisma, tenantSlug: string): Promise<string>
```

**1B. Create `apps/backend/src/modules/tracking/tracking.routes.ts`**

```
GET /api/v1/tracking/:trackingNumber  — PUBLIC (no auth). Returns: tracking number, status, events array (timestamp, status, location, note), estimatedDelivery, origin, destination.
```

**1C. Create `apps/backend/src/modules/tracking/tracking.websocket.ts`**

Set up Socket.io with Redis adapter:
- Client sends `{ type: "subscribe", trackingNumber: "..." }` → server joins room `{tenantId}:{trackingNumber}`
- On shipment status update: emit `{ type: "status_update", data: { status, location, timestamp } }` to room
- Register in `app.ts` after Fastify server creation

---

### PRIORITY 2 — User / Team Management

**2A. Create `apps/backend/src/modules/users/users.routes.ts`**

```
GET    /api/v1/users/me           — own profile
PATCH  /api/v1/users/me           — update name, phone; password change requires currentPassword + newPassword
GET    /api/v1/users              — list staff; roles: TENANT_ADMIN, TENANT_MANAGER
POST   /api/v1/users/invite       — create User with role, send invite email; roles: TENANT_ADMIN only
PATCH  /api/v1/users/:id/role     — change role; TENANT_ADMIN only; cannot demote self
DELETE /api/v1/users/:id          — deactivate (set isActive=false); cannot delete self
```

**2B. Complete auth routes**
- `POST /auth/forgot-password` — generate signed reset token (hash in DB, 1hr expiry), send email
- `POST /auth/reset-password` — verify token, hash new password, invalidate all refresh tokens

---

### PRIORITY 3 — Notifications & Outbox

**3A. Create `apps/backend/src/modules/notifications/`**
- `notifications.service.ts` — `sendEmail(to, template, data)` via SendGrid; `sendSms(to, message)` via Twilio; logs to `notification_log`
- `email-templates.ts` — Template IDs for all events (see [feature-additions.md](./feature-additions.md) for full list)
- `notifications.worker.ts` — BullMQ worker processing `notification` queue jobs

**3B. Create `apps/backend/src/queues/`**
- `queues.ts` — BullMQ Queue instances: `notificationQueue`, `webhookQueue`, `outboxQueue`
- `outbox.worker.ts` — Polls `outbox_events` where `published=false`, dispatches to queues, marks published
- Register workers in `server.ts`

**3C. Wire notifications into shipment status changes** — map each status transition to the correct email template; SMS only for Pro/Enterprise

---

### PRIORITY 4 — Document Generation

**4A. Create `apps/backend/src/modules/documents/`**
- `documents.service.ts` — `generateDeliveryNote(shipmentId)`, `generateInvoicePdf(invoiceId)`, `generateManifest(routeId)` via Puppeteer. Uploads to S3 (or local in dev). Returns signed URL.
- `documents.routes.ts`:
  ```
  POST /api/v1/documents/delivery-note/:shipmentId
  POST /api/v1/documents/invoice/:invoiceId
  GET  /api/v1/documents/:id   — get signed download URL
  ```
- HTML templates in `documents/templates/`: `delivery-note.html`, `invoice.html` — inject tenant branding at render time
- Use `STORAGE_DRIVER=local|s3` env var to switch storage

---

### PRIORITY 5 — Finance Module

**5A. Fill `apps/backend/src/modules/finance/finance.routes.ts`**

```
POST   /api/v1/finance/invoices              — create invoice (invoice_number: {TENANT_SLUG}-INV-{YYYY}-{4DIGIT})
GET    /api/v1/finance/invoices/:id          — single invoice with line_items, payments, credit_notes
PATCH  /api/v1/finance/invoices/:id          — update (only if DRAFT)
POST   /api/v1/finance/invoices/:id/send     — mark SENT, send PDF email to customer
POST   /api/v1/finance/invoices/:id/pay      — record payment, mark PAID if total satisfied
POST   /api/v1/finance/invoices/:id/void     — mark VOID; cannot void PAID
POST   /api/v1/finance/invoices/bulk         — bulk create for date range of delivered shipments without invoices
GET    /api/v1/finance/payments              — list payments
POST   /api/v1/finance/credit-notes          — create credit note against invoice
GET    /api/v1/finance/credit-notes
GET    /api/v1/finance/report/csv            — stream CSV for date range
```

**Overdue detection:** BullMQ repeatable job (daily) — find SENT invoices where `due_date < today`, mark OVERDUE, notify customer + TENANT_ADMIN.

---

### PRIORITY 6 — Payments / Stripe

**6A. Create `apps/backend/src/modules/payments/`**
- `payments.routes.ts`:
  ```
  POST /api/v1/payments/intent           — create Stripe PaymentIntent; return clientSecret
  GET  /api/v1/payments/:shipmentId      — get payment record
  POST /api/v1/payments/webhook/stripe   — verify signature, handle payment_intent.succeeded + payment_intent.payment_failed
  ```
- `stripe.service.ts` — Stripe SDK wrapper: `createPaymentIntent`, `createCustomer`, `createSubscription`, `cancelSubscription`, `handleWebhook`
- `billing.service.ts` — Subscription lifecycle + dunning:
  - `invoice.payment_failed` attempt 1 → email warning, retry in 3 days
  - attempt 2 (day 3) → suspend tenant, email
  - attempt 3 (day 7) → final warning
  - After 30 days SUSPENDED → CANCELLED

---

### PRIORITY 7 — CRM Module

**7A. Fill `apps/backend/src/modules/crm/crm.routes.ts`**

```
GET/POST/PATCH/DELETE  /api/v1/crm/leads
GET/POST/PATCH         /api/v1/crm/quotes
POST                   /api/v1/crm/quotes/:id/send
POST                   /api/v1/crm/quotes/:id/accept   — creates Shipment, marks lead WON
POST                   /api/v1/crm/quotes/:id/reject   — marks lead LOST
GET/POST/PATCH         /api/v1/crm/customers
GET                    /api/v1/crm/customers/:id
```

---

### PRIORITY 8 — Analytics

**8A. Fill `apps/backend/src/modules/analytics/analytics.routes.ts`**

```
GET /api/v1/analytics/shipments   — by status breakdown, on-time rate (fix hardcoded 0), avg delivery days, top 5 routes
GET /api/v1/analytics/revenue     — by service tier, by customer (top 10), collection rate
GET /api/v1/analytics/staff       — shipments per staff member, avg handle time
GET /api/v1/analytics/export/csv  — stream CSV for date range
```

---

### PRIORITY 9 — Driver Backend

**9A. Fill `apps/backend/src/modules/driver/driver.routes.ts`**

```
PATCH /api/v1/driver/stops/:stopId/status    — mark stop IN_PROGRESS or COMPLETED; body: { status, location }
POST  /api/v1/driver/pod                     — upload POD: { shipmentId, photoBase64?, signatureBase64?, recipientName, notes }; save to S3; create PodAsset; trigger DELIVERED
PATCH /api/v1/driver/shipments/:id/failed    — { reason, notes, attemptedAt }; transition to FAILED_DELIVERY
GET   /api/v1/driver/history                 — completed stops for last 30 days
```

---

### PRIORITY 10 — Super Admin Backend

**10A. Create `apps/backend/src/modules/super-admin/super-admin.routes.ts`**

Gate every route with `requireRole(['SUPER_ADMIN'])`.

```
GET    /api/v1/admin/tenants
GET    /api/v1/admin/tenants/:id
PATCH  /api/v1/admin/tenants/:id/plan         — override plan; audit log required
POST   /api/v1/admin/tenants/:id/suspend      — set SUSPENDED; email TENANT_ADMIN
POST   /api/v1/admin/tenants/:id/unsuspend    — set ACTIVE; email TENANT_ADMIN
POST   /api/v1/admin/tenants/:id/impersonate  — 30min JWT; write to audit_log
DELETE /api/v1/admin/impersonate
GET    /api/v1/admin/metrics
GET    /api/v1/admin/queues
GET    /api/v1/admin/health
```

---

### PRIORITY 11 — Frontend Missing Pages

**11A.** Create `apps/frontend/src/app/login/page.tsx`, `forgot-password/page.tsx`, `reset-password/page.tsx`

**11B.** Create `apps/tenant-portal/src/pages/team/TeamPage.tsx` — staff list + invite + role change + remove; TENANT_ADMIN only

**11C.** Create `apps/tenant-portal/src/pages/settings/ProfileTab.tsx` — name, email (readonly), phone, password change, MFA toggle

**11D.** Add Domain tab to settings — custom domain input + verification status + DNS instructions

**11E.** Wire real-time tracking in `TrackingResultPage.tsx` — Socket.io client subscribing to `{trackingNumber}` room; update timeline on `status_update` events

**11F.** Create `apps/tenant-portal/src/pages/dispatch/DispatchPage.tsx` — today's shipments grouped by driver; capacity warnings; quick assign

---

### PRIORITY 12 — Rate Limiting

Install `@fastify/rate-limit`. Register globally with `global: false`. Apply:
- Auth routes: `{ max: 10, timeWindow: '1 minute' }`
- General API: `{ max: 100, timeWindow: '1 minute' }`
- API key routes: `{ max: 500, timeWindow: '1 hour' }` (check `ApiKey.rateLimit` from DB)

---

### PRIORITY 13 — Idempotency Middleware

Create `apps/backend/src/shared/middleware/idempotency.ts`:
- Read `Idempotency-Key` header; hash (SHA-256); check `idempotency_keys` table
- COMPLETED → return cached response; PROCESSING → 409; not found → insert PROCESSING, execute, update COMPLETED
- 24hr expiry. Apply to: `POST /shipments`, `POST /invoices`, `POST /payments/intent`, `POST /quotes`

---

### PRIORITY 14 — CI/CD and Docker

**14A.** Create `apps/backend/Dockerfile` (multi-stage, node:20-alpine). Create similar for `apps/frontend`, `apps/tenant-portal`, `apps/super-admin`.

**14B.** Create `.github/workflows/ci.yml`:
- Services: postgres:15, redis:7
- Steps: checkout → setup-node → npm ci → prisma generate → prisma db push → npm test (backend) → npm run build (frontend, tenant-portal)

---

### PRIORITY 15 — Tests

**15A. Backend unit tests:**
- `auth.service.test.ts` — register, duplicate email, wrong password, token rotation
- `pricing.test.ts` — all multipliers, surcharges, zone rate lookup
- `shipments.state-machine.test.ts` — all valid/invalid transitions, DELIVERED requires POD, FAILED requires reason
- `tenants.isolation.test.ts` — cross-tenant requests return 404 (not 403 — no information leak)

**15B. Cross-tenant security test** (`cross_tenant_test.sh` already exists — expand to cover):
- Tenant A token cannot see tenant B shipments
- Tenant A token cannot PATCH tenant B shipments
- API key from tenant A cannot call tenant B endpoints
- SUPER_ADMIN impersonation token is time-limited (30 min) and audit-logged

---

## 24.11 Environment Variables Required

```env
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/fauward_dev
DIRECT_URL=postgresql://postgres:postgres@localhost:5432/fauward_dev

# JWT — generate with: openssl genrsa -out private.pem 2048 && openssl rsa -in private.pem -pubout -out public.pem
JWT_ACCESS_SECRET=<RS256 private key or symmetric secret>
JWT_REFRESH_SECRET=<separate secret>
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Redis
REDIS_URL=redis://localhost:6379

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# SendGrid
SENDGRID_API_KEY=SG....
SENDGRID_FROM_EMAIL=noreply@fauward.com

# Twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_FROM_NUMBER=+1...

# AWS S3 (or use local storage in dev)
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_S3_BUCKET=fauward-documents
AWS_REGION=eu-west-2
STORAGE_DRIVER=local  # or s3

# App
PORT=3000
NODE_ENV=development
FAUWARD_BASE_DOMAIN=fauward.com  # subdomains are {slug}.fauward.com
```

---

## 24.12 Phase Completion Summary

| Phase | Spec File | Status | Remaining |
|-------|-----------|--------|-----------|
| 1 — Foundation | PHASE-1-FOUNDATION.md | **Complete** | — |
| 2 — Tenant Onboarding | PHASE-2-TENANT-ONBOARDING.md | **~85%** | Auth forgot/reset password; team invite backend; rate limiting |
| 3 — Billing | PHASE-3-BILLING.md | **~10%** | Stripe subscriptions, trial, dunning, metered overage, Paystack |
| 4 — Logistics Core | PHASE-4-LOGISTICS-CORE.md | **~15%** | Shipment full CRUD, state machine, tracking WebSocket, notifications, driver POD, documents |
| 5 — Frontend | PHASE-5-FRONTEND.md | **~75%** | Login page, team management, dispatch board, customer portal, profile, domain settings |
| 6 — Pro Features | PHASE-6-PRO-FEATURES.md | **~50%** | API keys ✓, webhooks ✓, widget ✓; idempotency missing; widget build pipeline missing |
| 6b — CRM / Docs / Finance | PHASE-6B-CRM-DOCS-FINANCE.md | **~15%** | CRM full CRUD, document generation, full finance lifecycle |
| 6c — Integrations | PHASE-6C-INTEGRATIONS.md | **0%** | Xero, QuickBooks, carrier APIs, e-invoicing, import tools |
| 7 — Testing | PHASE-7-TESTING.md | **0%** | All tests |
| 8 — Deploy | PHASE-8-DEPLOY.md | **~5%** | docker-compose for local ✓; production Dockerfiles, CI/CD, AWS |
| 9 — Enterprise | PHASE-9-ENTERPRISE.md | **0%** | SSO, multi-branch, advanced RBAC, dedicated infra, MFA enforcement |
