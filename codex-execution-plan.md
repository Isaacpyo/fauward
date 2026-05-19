# Fauward — Codex Full Execution Plan

> **Purpose:** This file is a self-contained prompt for an autonomous coding agent (Codex / o3).
> Work through every phase in order. Each phase has explicit acceptance criteria.
> When a spec is silent, invent the minimal sensible implementation that fits the codebase patterns.
> Never stop at "it compiles" — write tests. Never leave a stub with a `TODO` comment.

---

## Repository context

**Stack:** Node 20 · Fastify · TypeScript · Prisma (PostgreSQL) · Redis · BullMQ · React 18 · Vite · Next.js 14 · Turborepo  
**Monorepo root:** `fauward/`  
**Key paths:**
- Backend API → `apps/backend/src/`
- Backend module pattern → `apps/backend/src/modules/<name>/`
- Prisma schema → `apps/backend/prisma/schema.prisma`
- Tenant portal (React/Vite) → `apps/tenant-portal/src/`
- Super admin (React/Vite) → `apps/super-admin/src/`
- Driver PWA (React/Vite) → `apps/agents/src/`
- Marketing site (Next.js 14) → `apps/frontend/src/`

**Invariants that must never be violated:**
1. Every Prisma query must include `where: { tenantId }` — no exceptions.
2. Never use `any` in TypeScript — use `unknown` or a named type.
3. Route handlers use `app.httpErrors.*` from `@fastify/sensible`, never `throw new Error()`.
4. Fastify logger (`req.log`, `app.log`) only — never `console.log`.
5. Auth: `app.authenticate` verifies JWT and sets `req.user`. `requireRole([...])` is the RBAC guard.
6. Tenant context in service code: `getTenantContext()` from `src/context/tenant.context.ts`.
7. `req.user.sub` is the user ID; `req.user.role` is the role string; `req.tenant.id` is the tenant ID.

**Test runner:** Vitest. Tests live alongside source in `*.test.ts` files or `__tests__/` folders.  
**Run tests:** `cd apps/backend && npx vitest run`  
**TypeScript check:** `cd apps/backend && npx tsc --noEmit`  
**Lint:** `npm run lint` from repo root

---

## Phase 0 — Security & Ship-stoppers (P0)

> These are hard blockers. Fix all four before touching anything else.
> Each fix must ship with an acceptance test.

### P0-1 · Wrong permission guard on secrets PATCH endpoint

**File to fix:** Locate the `PATCH /api/internal/secrets/:id` route (likely in `apps/backend/src/modules/internal/`).  
**Problem:** The route uses `writePre('trust.secrets.read')` — a read permission guarding a write operation. A read-only user can mutate secrets.  
**Fix:**
1. Replace the guard with `writePre('trust.secrets.write')` (or the equivalent `requireInternalPermission('trust.secrets.write')`).
2. Grep the entire backend for `writePre('<resource>.read')` patterns on PATCH/POST/PUT/DELETE routes and fix every instance you find.

**Test to write** (`apps/backend/src/routes/internal/secrets.test.ts` or nearest test file):
```typescript
// User with only trust.secrets.read → 403 on PATCH
// User with trust.secrets.write → 200 on PATCH
// Enumerate every mutating internal route by HTTP verb and assert the guard is a write permission
```

---

### P0-2 · Persistent ROOT grants bypass hardware-key gate

**File:** `apps/backend/src/modules/internal/iam.routes.ts`  
**Problem:** JIT ROOT requires `constantTimeStringEquals(hardwareKeyAssertion, expectedRootHardwareAssertion())`. Persistent ROOT grants via the IAM grant-role route only check `trust.iam.root` permission and skip the hardware assertion entirely.  
**Fix:**
1. Find every code path in `iam.routes.ts` and `staff-iam.service.ts` that produces a `ROOT` role assignment (persistent or JIT).
2. Route all of them through the hardware-assertion check — call `requireRootGrantAuthorization` or inline the same logic.
3. Strongly consider deleting the persistent ROOT assignment path entirely. If you delete it, update callers and tests.
4. Every ROOT grant must write the hardware key fingerprint to the audit log.

**Test to write:**
```typescript
// POST grant-role with ROOT role but no hardware assertion → 403
// POST grant-role with ROOT role + invalid assertion → 403
// POST grant-role with ROOT role + correct assertion → 200 + audit log row contains fingerprint
```

---

### P0-3 · Stripe refund and payment-intent calls lack idempotency keys

**File:** `apps/backend/src/modules/payments/stripe.service.ts` and `apps/backend/src/modules/payments/billing.service.ts`  
**Problem:** `stripe.refunds.create(...)` and `stripe.paymentIntents.confirm(...)` are called without `idempotencyKey`. Under network instability, retried calls can issue duplicate refunds.  
**Fix:**
1. In `stripeService`, add an `idempotencyKey: string` parameter to `createRefund`, `confirmPaymentIntent`, and any other money-moving call.
2. Callers must generate a deterministic key tied to the logical operation ID (e.g., `refund-${refundRecordId}`, `confirm-${paymentIntentId}`). Use `crypto.randomUUID()` at record-creation time and persist it alongside the record.
3. Pass the key as `{ idempotencyKey }` in the Stripe SDK options object (second argument to the API call).
4. Add a grep-gate comment in CI: `# GATE: no refunds.create or paymentIntents.create/confirm without idempotencyKey`.

**Test to write:**
```typescript
// Spy on stripe.refunds.create — assert idempotencyKey is always present
// Spy on stripe.paymentIntents.create — assert idempotencyKey is always present
// Call refund endpoint twice with same refund ID → assert only one Stripe call is made (stub Stripe)
```

---

### P0-4 · Vendor webhooks use shared-secret headers instead of HMAC-SHA256

**Files to create/update:** Find vendor webhook handler routes (search for PagerDuty, Persona, ComplyAdvantage, DocuSign in `apps/backend/src/`).  
**Problem:** Webhook authenticity is validated by checking a shared header value. A leaked value allows arbitrary request spoofing.  
**Fix per vendor — implement HMAC-SHA256 validation:**

**PagerDuty:**
- Read raw body (not parsed JSON).
- Check `X-PagerDuty-Signature` header: `v1=<hmac-sha256(rawBody, integrationSecret)>`.
- Reject if missing, invalid, or if `X-PagerDuty-Request-Timestamp` skew > 5 minutes.

**Persona:**
- Check `Persona-Signature` header: `t=<timestamp>,v1=<hmac-sha256(timestamp + "." + rawBody, webhookSecret)>`.
- Reject on missing signature or timestamp skew > 5 minutes.

**DocuSign:**
- Check `X-DocuSign-Signature-1` header: HMAC-SHA256 over the raw request body with the Connect HMAC secret.
- Reject if missing or invalid.

**ComplyAdvantage:**
- Confirm their current scheme from their docs (HMAC-SHA256 with shared key). Implement accordingly.

**Common requirements for all four:**
- Parse the raw body as `Buffer` before any JSON parsing (use `addContentTypeParser` or `preParsing` hook).
- Reject on missing or invalid signature → `403`.
- Reject on timestamp skew > 5 minutes → `400 { error: "Webhook timestamp too old" }`.
- Store the verified signature string with the webhook event record for audit.

**Tests to write (per vendor):**
```typescript
// Valid signature + fresh timestamp → 200
// Invalid signature → 403
// Valid signature + stale timestamp (>5 min) → 400
// Missing signature header → 403
```

---

## Phase 1 — Infrastructure & CI (P1)

> These items must be green before any feature work is mergeable.

### P1-1 · Add root typecheck script

**File:** `package.json` (repo root)  
Add:
```json
"scripts": {
  "typecheck": "tsc -b"
}
```
Also ensure each workspace (`apps/backend`, `apps/tenant-portal`, `apps/agents`, `apps/frontend`, `apps/super-admin`) has its own `"typecheck": "tsc --noEmit"` script.  
Add `npm run typecheck` as a CI step that runs on every PR.

---

### P1-2 · Fix all lint errors

Run `npm run lint` from the root. Fix every error (not warning) across all workspaces:
- Backend: resolve the 5 ESLint errors (likely `@typescript-eslint/no-explicit-any` violations — replace `any` with typed alternatives).
- Frontend: fix the 2 `react/no-unescaped-entities` errors (replace `'` with `&apos;` or use `{"'"}` in JSX).
- For warnings you intentionally defer, add a `// eslint-disable-next-line rule-name -- reason` comment so CI tracks them explicitly.

**Acceptance:** `npm run lint` exits 0 across all workspaces.

---

### P1-3 · Fix build failures

**agents app — `@zxing/library` missing:**
- Either `npm install @zxing/browser @zxing/library --workspace=apps/agents` and verify imports, or
- Remove the import if QR scanning is not yet in scope for this phase, and replace with a `// TODO: install @zxing/browser` comment in the component stub.

**frontend + widget — `tenant-db` JS imports:**
- The widget and frontend reference `tenant-db` which doesn't exist as a built JS artifact. Find the import, remove or replace with the correct package reference (`@fauward/shared-types` or inline the needed types).

**frontend — `.next/trace` EPERM on Windows:**
- Add `apps/frontend/.next/` to `.gitignore` if not already there.
- In the backend vitest config, ensure `testPathPattern` excludes `apps/frontend/`.

**Acceptance:** `npm run build` exits 0 in every workspace.

---

### P1-4 · Fix test failures

**Backend EPERM on `apps/frontend/.next/trace`:**
- Find which test imports or requires a path that resolves into the frontend build directory.
- Fix the import or mock the file system path so backend tests are fully isolated from frontend build artifacts.

**pricing-core / tracking-core EISDIR:**
- This is usually `postcss.config` resolving to a directory. Check `packages/pricing-core/postcss.config.*` — ensure the file is not a directory. If there is no PostCSS config needed, delete it.

**Acceptance:** All 218 backend tests pass. pricing-core and tracking-core Vitest suites exit 0.

---

### P1-5 · Add test coverage tooling

In every `vitest.config.ts` across all workspaces, add:
```typescript
coverage: {
  provider: 'v8',
  reporter: ['text', 'json-summary', 'lcov'],
  thresholds: { lines: 60, functions: 60 }
}
```
Add a `"test:coverage": "vitest run --coverage"` script to each workspace `package.json`.  
Add a CI step that runs `npm run test:coverage --workspace=apps/backend` and uploads the `lcov.info` artifact.

---

### P1-6 · Wire `TEST_DATABASE_URL` for CI and audit chain

Create a `docker-compose.ci.yml` (or extend the existing `docker-compose.yml`) with a named PostgreSQL service `postgres-test` on port `5433`.  
In the CI workflow (`.github/workflows/ci.yml`), add:
```yaml
env:
  TEST_DATABASE_URL: postgresql://postgres:postgres@localhost:5433/fauward_test
  DIRECT_URL: postgresql://postgres:postgres@localhost:5433/fauward_test
```
Add a job step that runs `apps/backend/scripts/verify-audit-chain.ts` (already exists) against the test DB.  
**Acceptance:** CI job `audit-chain-integrity` runs and exits 0.

---

### P1-7 · SOC 2 control evidence wiring

For each of these controls, identify or write the test that produces evidence, ensure it runs in CI, and add its output to `docs/SOC2_EVIDENCE_INDEX.md`:

| Control | Required evidence |
|---------|------------------|
| CC6.1 | RBAC test: mutating routes require write permissions (P0-1 acceptance test) |
| CC6.6 | Secrets are encrypted at rest (grep gate: no plaintext secret storage; PATCH uses write perm) |
| CC7.2 | Anomaly detection scheduled worker runs and logs (write a test that confirms the worker fires) |
| CC7.3 | Incident response: exception creation audit log row (existing exception tests cover this) |
| CC8.1 | Audit chain integrity job runs nightly (P3-6) |
| P4.2 | DSAR workflow covers all 8 states (P3-1) |
| P5.1 | DSAR data-gathering job produces export (P3-1) |

---

## Phase 2 — Architecture Decisions (P2)

### P2-1 & P2-2 · Console services scope ADR

**File to write:** `docs/adr/0001-console-service-scope.md` (the shell already exists — complete it).  

Enumerate all 41 services listed in the console manifest. For each service:
- **Live in v1** — physical folder exists and routes are registered.
- **Placeholder in v1** — keep the route, render a "Coming soon" banner component, mark the manifest entry `status: "coming-soon"`.
- **Deferred** — remove from the manifest and the architecture route map.

Write a reconciliation script at `apps/super-admin/scripts/reconcile-routes.ts`:
```typescript
// Reads the architecture route map and apps/super-admin/src/router.tsx
// Asserts: every "live" service in the manifest has a matching route registration
// Asserts: no route is registered for a "deferred" service
// Exits non-zero if any assertion fails
```
Add this script to CI: `node --loader ts-node/esm apps/super-admin/scripts/reconcile-routes.ts`.

---

### P2-3 · Static/placeholder data banners

Create `apps/super-admin/src/components/ui/SampleDataBanner.tsx`:
```tsx
// A visible yellow banner: "Sample data — replace before launch"
// Props: targetDate?: string
// Use this on every page rendering non-API data
```

Audit every pillar page in `apps/super-admin/src/pillars/`. For any page rendering hardcoded, seeded, or `placeholder` strings:
1. Wrap the static data in `<SampleDataBanner targetDate="2026-06-01" />`.
2. Replace `placeholder` strings with `"—"` or a "No data" empty state.

**Grep check to add to CI:** `rg "placeholder|PLACEHOLDER|seed" apps/super-admin/src/pillars --type tsx` — any match that is not inside a `SampleDataBanner` must fail CI.

---

### P2-4 · Customer 360 tab isolation

**File:** `apps/super-admin/src/pillars/customer/Customer360Page.tsx` (or equivalent).  

**Problems to fix:**
1. Replace the single parent `useQuery` (which fetches all tab data at once) with per-tab `useQuery` hooks. The parent query fetches only tenant identity (`id`, `name`, `slug`).
2. Wrap each tab panel in a React `ErrorBoundary` component so one tab's API failure does not unmount others.
3. Add a `permission` prop to each tab definition. Hide tabs the current user cannot access (render a "Permission required" state, not an error).
4. Replace `MRR placeholder` and `Last login placeholder` in the Customer 360 header with real values from the platform metrics API (`GET /api/internal/platform/metrics/:tenantId`).
5. For the 4 extra tabs (Dunning, Incidents, Pipeline, Attribution) — if the backend API exists, wire them up. If not, render a `<SampleDataBanner />` with a "Coming soon" notice. Do not silently render empty or fake data.

**Tests to write:**
```typescript
// Block one tab's API → assert other tabs still render (React Testing Library)
// User without tab permission → tab is not visible
// Header shows real MRR value from mocked API response (not "placeholder")
```

---

## Phase 3 — Background Jobs & Functional Gaps (P3)

### P3-1 · DSAR data-gathering as a real BullMQ job

**Current state:** `POST /api/internal/trust/dsar` creates a queued export row but the worker does nothing.  
**Fix — implement `dsar-data-gather.worker.ts`:**

State machine: `REQUESTED → GATHERING → READY → DELIVERED → EXPIRED`

The worker must:
1. Walk every table that contains personal data for the subject user ID: `User`, `Shipment` (sender/recipient), `SupportTicket`, `TicketMessage`, `InAppNotification`, `ReturnRequest`, `AuditLog` (if applicable).
2. For each table, query `WHERE userId = subjectId AND tenantId = tenantId` (tenant-scoped).
3. Serialize results to JSON, zip the archive, upload to the tenant's configured storage (use an environment variable `DSAR_EXPORT_BUCKET` or fall back to a local temp path in development).
4. Update the DSAR record: `status: 'READY'`, `exportUrl: <signed URL>`, `readyAt: now`.
5. Send an in-app notification to the requesting platform user.
6. Schedule a cleanup job to set `status: 'EXPIRED'` and delete the file after 30 days.

**Register the worker** in `apps/backend/src/queues/start-workers.ts`.

**Tests:**
```typescript
// Worker processes a DSAR request → all 6 personal-data tables are queried with correct tenantId + userId
// Export URL is set on the record when worker completes
// Status machine transitions: REQUESTED → GATHERING → READY
// Cleanup job → status → EXPIRED after 30 days (use fake timers)
```

---

### P3-2 · QBR generation as a real BullMQ job

**File to create:** `apps/backend/src/queues/workers/qbr-generate.worker.ts`  

The worker receives `{ tenantId, requestedBy }`. It must:
1. Fetch real data from existing tables: shipment volume, delivery rates, support ticket summary, MRR from invoices, exception count, top 5 routes.
2. Compose a structured deck object (`{ sections: [...] }`). Each section has `title`, `data`, and `isEmpty: boolean`.
3. Sections with no real data must be explicitly labelled `isEmpty: true` — the consumer renders "No data for this period", not silence.
4. Persist the deck to the `QbrReport` model (create it if it doesn't exist in the schema: `id`, `tenantId`, `requestedBy`, `generatedAt`, `deck Json`, `periodStart DateTime`, `periodEnd DateTime`).
5. Notify the requesting user via in-app notification with a link to the report.

**Tests:**
```typescript
// Worker produces a deck where every section has either real data or isEmpty: true
// No section ever has hardcoded or placeholder values
// QbrReport record is persisted with correct tenantId
```

---

### P3-3 · Attribution computation as a scheduled job

**File to create:** `apps/backend/src/queues/workers/attribution-compute.worker.ts`  

Schedule: daily at 02:00 UTC (BullMQ repeatable job).  
The worker must:
1. Pull the previous day's shipment creation events, grouped by `customerId` and `organisationId`.
2. Apply last-touch attribution: the most recent marketing channel recorded in `User.metadata` (or a `UserAttributionEvent` table if it exists).
3. Write daily snapshots to `AttributionSnapshot` model (`id`, `tenantId`, `date Date`, `channel String`, `shipmentCount Int`, `revenue Decimal`). Create the model if it doesn't exist.
4. The endpoints `/revenue/analytics/cohorts`, `/revenue/analytics/forecasts` must read from this snapshot table — not return static data.

---

### P3-4 · HubSpot sync as a nightly job

**File to create:** `apps/backend/src/queues/workers/hubspot-sync.worker.ts`  

Schedule: nightly at 01:00 UTC.  
The worker must:
1. Read `HUBSPOT_API_KEY` from config.
2. For each active tenant, upsert a HubSpot company (matching on `domain` or `externalId`).
3. For each `TENANT_ADMIN` user, upsert a HubSpot contact linked to the company.
4. Implement exponential backoff with a 3-retry limit when the HubSpot API rate-limits.
5. Conflict resolution: platform is source of truth — HubSpot fields are overwritten, not merged.
6. Log `{ tenantId, hubspotCompanyId, action: 'created' | 'updated' }` for every upsert.

**Tests:**
```typescript
// Worker calls HubSpot upsert for each active tenant
// Rate limit response → retries with backoff → success on third attempt
// HubSpot error beyond retries → logs error, does not crash worker
```

---

### P3-5 · Commission monthly aggregation

**File:** `apps/backend/src/queues/workers/commission-aggregate.worker.ts`  

**Current state:** The worker logs a placeholder line and exits.  
**Fix:**
1. Run on the 1st of each month (BullMQ `cron: '0 0 1 * *'`).
2. For the previous month, query all delivered `Shipment` rows grouped by `driverId` (or `assignedTo`).
3. Apply commission rules from `TenantSettings.commissionConfig` JSON (invent a sensible schema if not defined: `{ defaultRatePct: 5, overrides: [{ userId, ratePct }] }`).
4. Write rows to a `CommissionRecord` model (`id`, `tenantId`, `userId`, `month Date`, `shipmentCount Int`, `basePayout Decimal`, `status 'PENDING' | 'APPROVED' | 'PAID'`). Create this model if it doesn't exist.
5. Add routes: `GET /api/v1/commissions` and `GET /api/v1/commissions/:id` (tenant-scoped, `TENANT_ADMIN` + `TENANT_MANAGER` only).

**Tests:**
```typescript
// Worker produces correct commission rows matching hand-calculated fixtures
// Commission rate override for a specific userId is applied correctly
// Month boundary: only shipments delivered within the month are included
```

---

### P3-6 · Audit chain integrity nightly job

**File:** `apps/backend/src/queues/workers/audit-chain-integrity.worker.ts`  

**Current state:** `apps/backend/scripts/verify-audit-chain.ts` exists.  
**Fix:**
1. Wrap `verify-audit-chain.ts` as a BullMQ repeatable job: `cron: '0 3 * * *'` (03:00 UTC daily).
2. On failure, write a `PlatformAlertEvent` row (or equivalent — invent if needed) with `type: 'AUDIT_CHAIN_BREACH'` and send an in-app notification to all `PLATFORM_ADMIN` users.
3. Register in `apps/backend/src/queues/start-workers.ts`.

---

### P3-7 · TenantChip adoption across console pillar surfaces

**File to create:** `apps/super-admin/src/components/ui/TenantChip.tsx` (check if it already exists first).  

`TenantChip` renders: tenant avatar initial, tenant name as a link to Customer 360, status badge.  
Props: `{ tenantId: string; name: string; slug: string; status: string; planTier?: string }`

Replace every raw tenant name / tenant ID string render in `apps/super-admin/src/pillars/` with `<TenantChip />`. At minimum:
- Platform tenant list rows
- Revenue invoice list / detail
- Billing form tenant fields
- Customer 360 header breadcrumb links
- Workflow form tenant selector display

**Acceptance:** `rg "tenantId.*plain\|tenant\.name" apps/super-admin/src/pillars` returns 0 matches where a TenantChip would be appropriate.

---

## Phase 4 — Tenant Portal: Pricing System (Full Build)

> All 13 pricing pages exist as stubs in `apps/tenant-portal/src/pages/pricing/`.
> Make every page fully functional — connected to real API calls, real state, real mutations.
> Use React Query (`useQuery` / `useMutation`) for all data fetching.
> All tables with > 100 possible rows must use TanStack Virtual (`@tanstack/react-virtual`).

### Shared patterns for all pricing pages

- API base: `GET|POST|PATCH|DELETE /api/v1/pricing/...` (backend already registered)
- Auth header: `Authorization: Bearer <accessToken>` from the auth context
- Error display: toast notifications (use existing toast utility) on mutation failure
- Loading state: skeleton placeholders (existing `Skeleton` component)
- Empty state: an illustration + "No items yet" + primary action button

### 4.1 · ZonesPage.tsx

Full implementation:
- Table: name, zone type badge (NATIONAL/INTERNATIONAL/REGIONAL), description, row count of rate cards using it, actions.
- "Add Zone" button → modal with form fields: name (required), zoneType (select), description.
- "Edit" → same modal pre-filled.
- "Delete" → confirmation dialog. Disabled with tooltip if rate cards reference the zone.
- Calls: `GET /pricing/zones`, `POST /pricing/zones`, `PATCH /pricing/zones/:id`, `DELETE /pricing/zones/:id`.

### 4.2 · RateCardsPage.tsx

Full implementation:
- View toggle: **Grid view** (zone × zone matrix) and **List view** (sortable table).
- Grid view: render the matrix from `GET /pricing/rate-cards/matrix`. Each cell shows baseFee + perKgRate. Click a cell → drawer with the active rate card for that zone pair.
- List view: columns: name, originZone → destZone, serviceTier, baseFee, perKgRate, effectiveFrom, status (ACTIVE/INACTIVE), actions.
- "Add Rate Card" → multi-step form: step 1 origin/dest zones, step 2 rates, step 3 effective dates.
- "Activate" → `PATCH /pricing/rate-cards/:id/activate` (deactivates others for same pair + tier).
- "Duplicate" → `POST /pricing/rate-cards/:id/duplicate` → opens edit form pre-filled.
- "Import CSV" → file input, parse with Papa Parse, preview table, confirm → `POST /pricing/rate-cards/matrix/import`.

### 4.3 · ServiceTiersPage.tsx

Full implementation:
- Card layout, one card per tier (STANDARD, EXPRESS, OVERNIGHT).
- Each card: label (editable), multiplier (numeric input), description (text), enabled toggle.
- Live price preview: show what £10.00 base becomes with this multiplier.
- "Save" → `PATCH /pricing/service-tiers`. Validation: at least one tier must be enabled.

### 4.4 · SurchargesPage.tsx

Full implementation:
- Table: name, type badge, condition badge, value (formatted), threshold, enabled status, visibility to customer, actions.
- "Seed defaults" button → seeds the 6 default surcharges (Fuel, Oversize, Remote Area, Dangerous Goods, Residential, Peak Season). Calls `POST /pricing/surcharges/seed` — implement this backend route if it doesn't exist.
- "Toggle" column with inline switch → `PATCH /pricing/surcharges/:id/toggle`.
- Add/Edit modal: all fields including peakFrom/peakTo date pickers (only shown when condition is PEAK_SEASON).

### 4.5 · InsurancePage.tsx

Full implementation:
- Expandable tier cards: NONE, BASIC, STANDARD, PREMIUM.
- Each card: label (editable), type, rate % (for PERCENT_OF_DECLARED), minFee, maxCover, enabled toggle.
- Preview table: for a sample declared value of £500, show the calculated fee for each enabled tier.
- "Save" → `PATCH /pricing/insurance`. Validation: NONE tier must always exist and be enabled.

### 4.6 · WeightTiersPage.tsx

Full implementation:
- Table: min weight, max weight (∞ if null), discount type badge, discount value, enabled status.
- "Add Weight Tier" → modal with min/max/type/value fields.
- Conflict policy selector at the top: `MOST_SPECIFIC | BEST_FOR_CUSTOMER | FIRST_MATCH`.
- Changing conflict policy → `PATCH /pricing/settings` with `weightTierConflictPolicy`.

### 4.7 · PricingRulesPage.tsx

Full implementation:
- Drag-to-reorder list using `@dnd-kit/sortable`. Install if not present: `npm install @dnd-kit/core @dnd-kit/sortable --workspace=apps/tenant-portal`.
- Each row: drag handle, priority number, rule name, condition summary, action badge, enabled toggle, edit/delete.
- "Reorder" → dragging auto-saves via `PATCH /pricing/rules/reorder` (debounced 500ms after drag end).
- "Add/Edit Rule" → modal with a conditions builder:
  - Origin zone multi-select
  - Destination zone multi-select
  - Service tier multi-select
  - Weight range (min/max sliders)
  - Value range (min/max inputs)
  - Days of week checkboxes
  - Date range pickers (optional)
  - Action type select + value input
  - Stop-after-match toggle

### 4.8 · PromoCodesPage.tsx

Full implementation:
- Table: code, type badge, value, min order, max discount, uses (progress bar: `usedCount / maxUses`), expires at, enabled toggle, actions.
- "Add Promo Code" → modal: code (uppercase-enforced input), type, value, minOrderValue, maxDiscountValue, maxUses, customerIds (multi-select user search), expiresAt.
- "Deactivate" → `PATCH /pricing/promo-codes/:id` with `{ isEnabled: false }`.

### 4.9 · TaxPage.tsx

Full implementation:
- Single form card: enabled toggle, taxName text input, rate % number input (0–100), taxNumber, taxIncluded checkbox, exemptOrgs multi-select.
- Live preview: "A £100 order would show £120.00 total (20% VAT added)" or "£100.00 includes £16.67 VAT (20%)".
- Save → `PATCH /pricing/tax`. Validation: rate must be 0–100.

### 4.10 · CurrencyRatesPage.tsx

Full implementation:
- Table: currency pair (FROM → TO), rate, source (MANUAL/API), last updated.
- "Override" → inline edit cell for rate.
- "Refresh All" button → `POST /pricing/currency-rates/refresh` → toast "Rates refresh queued".
- "Add Manual Rate" → modal: fromCurrency, toCurrency, rate.

### 4.11 · PricingSettingsPage.tsx

Full implementation:
- Form fields: dimensional divisor (5000/6000 quick-select + custom), rounding mode select, rounding precision, default currency, quote validity minutes, show price breakdown to customer toggle, auto-invoice on delivery toggle.
- Save → `PATCH /pricing/settings`.

### 4.12 · PricingCalculatorPage.tsx

Full implementation:
- Left panel (inputs): origin zone select, destination zone select, service tier select, weight (kg), dimensions (L×W×H cm), declared value, insurance tier select, promo code input, customer select (optional), date picker (optional).
- Right panel (results): chargeable weight highlighted, full layered breakdown table, subtotal, tax row, **total**, quote expiry timer (countdown).
- Live calculation: debounced 400ms on any input change → `POST /pricing/calculate`.
- "Save as Quote" button → creates a `RateQuote` record (calls existing rating endpoint).
- Error state: if any required zone/rate card is missing, show a helpful setup prompt with a link to ZonesPage.

### 4.13 · PricingOverviewPage.tsx

Full implementation:
- Summary cards: number of zones, rate cards, active surcharges, promo codes, active pricing rules.
- "Quick actions" links to each sub-page.
- Shortcut to `PricingCalculatorPage`.
- Warning banners if: no zones configured, no rate cards configured, no service tier enabled.

---

## Phase 5 — Tenant Portal: Analytics & Reports

### 5.1 · AnalyticsPage.tsx — full data wiring

**File:** `apps/tenant-portal/src/pages/analytics/AnalyticsPage.tsx`

Make every metric real (the backend endpoints exist in `analytics.routes.ts`):

**KPI cards with trend indicators:**
Each KPI stat must show:
- Current value (large)
- Change percentage vs previous period (green arrow up / red arrow down)
- Period label

Wire to `GET /api/v1/analytics/full?dateFrom=&dateTo=` which returns `{ totals: { shipments, revenue, onTimeRate, avgDeliveryDays } }` with `{ value, previousValue, changePct }` per metric.

**Animated KPI numbers:**
Create `apps/tenant-portal/src/components/ui/AnimatedNumber.tsx`:
```tsx
// Uses requestAnimationFrame to count from 0 to the target value over 600ms
// Props: value: number; decimals?: number; prefix?: string; suffix?: string
// Restarts animation when value prop changes
```
Apply this component to all KPI stat values on the page.

**Shipment lifecycle funnel:**
Render a horizontal funnel/bar chart from `GET /api/v1/analytics/shipments` → `lifecycleFunnel`.  
Each status is a bar with its count and percentage. Use the existing charting library (check `apps/tenant-portal/package.json` for installed chart libraries — use what's there, or install `recharts` if nothing is installed).

**SLA compliance panel:**
From the same endpoint → `slaCompliance`: show on-time vs late counts, compliance %, average delivery hours, breaches by reason (small bar chart).

**Risk / exceptions panel:**
From `analytics.exceptions`: active exceptions count, stale pending (>24h), failed delivery rate, top exception routes list.

**Date range controls:**
Preset buttons: Today · Last 7 days · Last 30 days · Last 90 days · Custom (date picker pair).  
Changing the range reruns all queries with the new `dateFrom`/`dateTo`.

---

### 5.2 · ReportsPage.tsx — full implementation

**File:** `apps/tenant-portal/src/pages/reports/ReportsPage.tsx`

Full implementation:
- Report type selector (radio cards): Shipments · Revenue · Returns · Tickets · Staff Performance · Customers.
- Date range presets: Today · Yesterday · Last 7d · Last 30d · Last 90d · Custom.
- Format selector: CSV · JSON · PDF (radio group).
- Filters (vary by type):
  - Shipments: status multiselect, driverId select, customerId search.
  - Revenue: invoice status multiselect.
  - Returns: return status multiselect.
  - Tickets: priority multiselect, category multiselect.
- "Generate Report" → triggers download via `GET /api/v1/reports/{type}?...params...&format=csv|json|pdf`.
  - Use `window.open(signedUrl)` or `<a download href={blobUrl}>` to trigger browser download.
  - Show loading spinner on the button during generation.
  - On success: "Report downloaded" toast.
  - On failure: error toast with retry.

Backend routes to ensure exist in `apps/backend/src/modules/analytics/analytics.routes.ts`:
```
GET /api/v1/reports/shipments?dateFrom&dateTo&format&status[]&driverId&customerId
GET /api/v1/reports/revenue?dateFrom&dateTo&format&invoiceStatus[]
GET /api/v1/reports/returns?dateFrom&dateTo&format&status[]
GET /api/v1/reports/tickets?dateFrom&dateTo&format&priority[]&category[]
GET /api/v1/reports/staff?dateFrom&dateTo&format
GET /api/v1/reports/customers?dateFrom&dateTo&format
```
Each returns CSV (`Content-Type: text/csv`, `Content-Disposition: attachment; filename="fauward-{type}-{date}.csv"`) or JSON.  
Stream rows for CSV — use Fastify's streaming response. Minimum 10 columns per report type.

---

### 5.3 · ActivityTimelinePage.tsx — full implementation

**File:** `apps/tenant-portal/src/pages/activity/ActivityTimelinePage.tsx`

Full implementation:
- Ensure `GET /api/v1/activity?timeframe=1h|24h|7d|30d&type=shipment|return|ticket|invoice|audit` exists in the backend. If not, implement it in `analytics.routes.ts`:
  - UNION across `ShipmentEvent`, `AuditLog`, `ReturnRequest` status changes, `TicketMessage`, `Invoice` (sentAt/paidAt).
  - Return `ActivityItem[]` (id, type, title, subtitle, link, timestamp, icon, colour) sorted by timestamp DESC, limit 100.
- Timeframe filter buttons: 1h · 24h · 7d · 30d.
- Type filter pills: All · Shipments · Returns · Tickets · Invoices · Audit.
- Vertical timeline: icon (by type, use emoji or SVG), title, subtitle, relative timestamp (`"2 hours ago"`).
- Auto-refresh every 60s (`refetchInterval: 60000` in React Query).
- Skeleton loading on initial render.
- Empty state when no items match the filter.

---

## Phase 6 — Tenant Portal: Operations & Fleet

### 6.1 · FleetPage.tsx — full implementation

**File:** `apps/tenant-portal/src/pages/fleet/FleetPage.tsx`

Full implementation with two tabs (Drivers / Vehicles):

**Drivers tab:**
- Table columns: name, email, vehicle (registration), licence number, availability toggle, today's stats (stops assigned / completed / on-time), actions.
- "Add Driver" → modal: select existing TENANT_DRIVER user, licence number, assign vehicle.
- "Toggle availability" → `PATCH /api/v1/fleet/drivers/:id` with `{ isAvailable: boolean }`.
- Route to driver detail: clicking name opens a drawer with full driver stats.

**Vehicles tab:**
- Table columns: registration, make & model, type badge, capacity (kg / m³), assigned driver (name), actions.
- "Add Vehicle" → modal: registration (required), type (VAN/TRUCK/BIKE/CAR), capacityKg, capacityM3, make, model.
- "Edit" → same modal pre-filled.
- "Delete" → confirmation dialog. Warn if vehicle has an assigned driver.

**Backend routes to verify/complete in `fleet.routes.ts`:**
```
GET    /api/v1/fleet/vehicles
POST   /api/v1/fleet/vehicles
PATCH  /api/v1/fleet/vehicles/:id
DELETE /api/v1/fleet/vehicles/:id
GET    /api/v1/fleet/drivers
POST   /api/v1/fleet/drivers
PATCH  /api/v1/fleet/drivers/:id
```
All require `[authenticate, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER'])]`.

---

### 6.2 · LiveMapPage.tsx — full implementation (Pro+ gated)

**File:** `apps/tenant-portal/src/pages/operations/LiveMapPage.tsx`

**Plan-gating:** Wrap the entire page in a `<FeatureGate feature="LIVE_MAP" planTier="PRO">` component. If the tenant's plan doesn't include it, show an upgrade prompt — not a blank page or an error.

**Backend routes to implement** (if they don't exist):
```
GET   /api/v1/driver/locations   → all drivers + last known location (lat, lng, accuracy, updatedAt, driverName)
PATCH /api/v1/driver/location    → { lat, lng, accuracy }; driver sends; store in Redis key driver:location:{driverId} with TTL 300s
GET   /api/v1/shipments/live-map → IN_TRANSIT + OUT_FOR_DELIVERY shipments with last TrackingEvent location
```

**Map implementation:**
- Install `@vis.gl/react-google-maps` if not present: `npm install @vis.gl/react-google-maps --workspace=apps/tenant-portal`.
- Require `VITE_GOOGLE_MAPS_API_KEY` env var. If missing, show a configuration banner instead of crashing.
- Driver markers: custom SVG icon with driver initials, click → info card (name, vehicle, stops remaining, last update time).
- Shipment markers: clustered using the library's built-in clustering, expand on click to show individual shipment cards.
- Filter sidebar: by driver (multiselect), by status (multiselect), by route (select).
- Live refresh every 60s (`refetchInterval: 60000`).

---

### 6.3 · POD Viewer in ShipmentDetailPage.tsx

**File:** `apps/tenant-portal/src/pages/shipments/ShipmentDetailPage.tsx`

In the Documents tab, add a "Proof of Delivery" section that renders when `shipment.status === 'DELIVERED'`:

**Create** `apps/tenant-portal/src/components/shipments/PODViewer.tsx`:
```tsx
// Props: shipmentId: string
// Fetches GET /api/v1/shipments/:id/pod
// Returns: { podAssets: string[], signature: string, recipientName: string, deliveredAt: string, capturedBy: string, deliveryNotes: string }
// Renders:
//   - Photo thumbnails (click → full-screen lightbox, implement inline with a fixed overlay)
//   - Signature image (300×150px, border, "Signed by {recipientName}")
//   - Delivery metadata row
//   - "Download POD" button → POST /api/v1/documents/pod/:shipmentId → opens returned PDF URL
```

**Backend routes to implement:**
```
GET  /api/v1/shipments/:id/pod       → find the DELIVERED TrackingEvent with POD data, return assets
POST /api/v1/documents/pod/:id       → generate one-page PDF POD, return { url: string }
```
In the PDF: tenant logo, tracking number, QR code of tracking number, sender/recipient, delivery address, "Delivered to: {recipientName}", signature image embedded, photo count, timestamp, driver name.

---

### 6.4 · Inline Status Updates in ShipmentTable.tsx

**File:** `apps/tenant-portal/src/components/shipments/ShipmentTable.tsx` (or wherever the table lives)

Add per-row inline actions:
- **Status dropdown** column: shows the valid next states from `ALLOWED_TRANSITIONS` (define the same map as the detail page uses). Clicking a state opens a confirmation popover.
  - → DELIVERED: mini POD capture modal inline (photo upload + recipient name input) before confirming.
  - → FAILED_DELIVERY: inline reason selector (NOBODY_HOME, ACCESS_ISSUE, REFUSED, ADDRESS_UNKNOWN, DAMAGED).
  - All other transitions: direct confirmation popover "Change status to X?".
- **Assign Driver** inline dropdown for rows in `PROCESSING` status with no assigned driver.
- On confirm: `PATCH /api/v1/shipments/:id/status` → optimistic row refresh (update React Query cache immediately, roll back on error).

**Performance rule:** Use a single shared popover instance (lazy-mounted once, repositioned on row click). Do not render a popover DOM node for every row.

---

## Phase 7 — Tenant Portal: Communication & Team

### 7.1 · Notification Center in TopBar

**File to create:** `apps/tenant-portal/src/components/shared/NotificationCenter.tsx`  
**File to update:** Wherever the top navigation bar is rendered.

Full implementation:
- Bell icon button with unread count badge (red dot with number, hidden when 0).
- Unread count: `GET /api/v1/notifications/unread-count` polled every 30s.
- Click → dropdown panel (max-height 400px, scrollable, min-width 360px):
  - Each notification row: icon (by type), title (bold), body (truncated to 2 lines), relative timestamp, unread dot (blue), entire row is clickable → navigate to `notification.link`.
  - Clicking a notification → `PATCH /api/v1/notifications/:id/read` → mark read + navigate.
  - "Mark all read" button at top → `POST /api/v1/notifications/read-all`.
  - Empty state: bell icon + "You're all caught up".
- Close on click outside or Escape key.

---

### 7.2 · Email Settings Tab — full implementation

**File:** `apps/tenant-portal/src/pages/settings/EmailSettingsTab.tsx`

Full implementation:
- Global settings card: "From Name" text input, "Reply-To" email input, "Ops Recipients" tag input (comma-separated emails).
- Save global settings → `PATCH /api/v1/tenant/email-settings`.
- Template table (one row per template key from the full list of 22 templates):
  - Columns: template name (human-readable), trigger description, enabled toggle, custom subject input (expands on row click), "Send test" button.
  - Enabled toggle → `PATCH /api/v1/tenant/email-templates/:key` with `{ isEnabled }`.
  - Custom subject save → debounced 800ms → same PATCH endpoint with `{ customSubject }`.
  - "Send test" → `POST /api/v1/tenant/email-templates/:key/test` → toast "Test email sent to {userEmail}".

**Backend routes to verify/complete in `tenant.routes.ts`:**
```
GET    /api/v1/tenant/email-templates
PATCH  /api/v1/tenant/email-templates/:key   ↳ { isEnabled?, customSubject? }; TENANT_ADMIN only
PATCH  /api/v1/tenant/email-settings         ↳ { emailFromName, emailReplyTo, opsEmailRecipients[] }
POST   /api/v1/tenant/email-templates/:key/test  ↳ sends a test email to req.user.email
```
All use `EmailTemplateConfig` model (already in schema) and the SendGrid service.

---

### 7.3 · User Suspension in TeamPage.tsx

**File:** `apps/tenant-portal/src/pages/team/TeamPage.tsx`

Add to the team member table:
- "Status" column: `<Badge variant={user.isActive ? 'success' : 'danger'}>Active | Suspended</Badge>`.
- Three-dot actions menu: Change Role · **Suspend** · **Activate** · Remove.
  - "Suspend" (shown only when `isActive === true` and user is not self): confirmation dialog "This user will immediately lose access. Continue?" → `PATCH /api/v1/users/:id/suspend`.
  - "Activate" (shown only when `isActive === false`): no dialog → `PATCH /api/v1/users/:id/activate`.

**Backend routes to implement** in `users.routes.ts`:
```typescript
// PATCH /api/v1/users/:id/suspend
// - preHandler: [authenticate, requireRole(['TENANT_ADMIN'])]
// - Cannot suspend self (req.user.sub === id → 400)
// - Sets isActive = false, writes AuditLog row
// - Returns updated user

// PATCH /api/v1/users/:id/activate
// - preHandler: [authenticate, requireRole(['TENANT_ADMIN'])]
// - Sets isActive = true, writes AuditLog row
```

**In `authenticate.ts`**, after JWT verification and user lookup, add:
```typescript
if (!user.isActive) {
  return reply.code(401).send({ error: 'Account suspended', code: 'USER_SUSPENDED' });
}
```

**Tests:**
```typescript
// Suspend own account → 400
// Suspend with non-ADMIN role → 403
// Suspended user's next request → 401 with USER_SUSPENDED code
// Activate suspended user → isActive becomes true
```

---

## Phase 8 — Driver App: QR Scanning

**File to create:** `apps/agents/src/components/agent/QRScanner.tsx`

**Prerequisites:** `npm install @zxing/browser --workspace=apps/agents`

Implementation:
- Uses `BrowserQRCodeReader` from `@zxing/browser`.
- Renders a `<video>` element with a crosshair SVG overlay.
- Torch/flash toggle button (calls `track.applyConstraints({ advanced: [{ torch: true }] })`).
- On permission denied → fallback to a text input for manual tracking number entry.
- On successful scan → calls `onScan(decodedText: string)` prop.
- Stops the camera stream on component unmount.

**Wire QR scanning into the driver app:**
- `RoutePage.tsx` header: add a "Scan" button → opens `QRScanner` modal → on scan, find the matching stop by tracking number → navigate to `StopDetailPage`.
- `CapturePODPage.tsx`: before the photo capture step, show the scanner to confirm the correct package. If scanned tracking number doesn't match the stop, show a warning "Wrong package — expected {expected}, got {scanned}". Allow override.

**Shipping label QR code:**
In `apps/backend/src/modules/documents/documents.service.ts` (or `label.routes.ts`):
- Install `qrcode` if not present: `npm install qrcode --workspace=apps/backend` + `npm install @types/qrcode -D --workspace=apps/backend`.
- When generating a label, encode the tracking number as a QR code PNG (base64) using `QRCode.toDataURL(trackingNumber)`.
- Embed the base64 PNG as an `<img>` in the label HTML template (128×128px).

---

## Phase 9 — Performance Patterns

> These changes require no new features — only structural improvements.
> Apply them systematically across all listed files.

### 9.1 · Lazy tab mounting

Pattern:
```typescript
const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(['timeline']));
// On tab click: setVisitedTabs(prev => new Set([...prev, tabId]))
// Render: {visitedTabs.has(tabId) && <TabContent />}
```

Apply to (mount only on first visit, not on every tab switch):
- `apps/tenant-portal/src/pages/shipments/ShipmentDetailPage.tsx` — Documents, Timeline, POD, Customs tabs.
- `apps/tenant-portal/src/pages/settings/*.tsx` — all settings tabs.
- `apps/super-admin/src/pages/TenantDetailPage.tsx` (or equivalent) — all detail tabs.

### 9.2 · Debounced search (300ms)

Use `useDebounce` from `usehooks-ts` (install if not present). Apply 300ms debounce to every filter input that triggers an API call:
- `apps/tenant-portal/src/pages/shipments/ShipmentsListPage.tsx` — tracking number / customer search.
- `apps/tenant-portal/src/pages/support/TicketsListPage.tsx` — ticket search.
- `apps/tenant-portal/src/pages/returns/ReturnsListPage.tsx` — returns search.
- `apps/tenant-portal/src/pages/team/TeamPage.tsx` — user search.
- `apps/super-admin/src/` — tenant list search.

### 9.3 · Virtual scrolling for large tables

Install TanStack Virtual: `npm install @tanstack/react-virtual --workspace=apps/super-admin`

Apply `useVirtualizer` to tables that can exceed 100+ rows:
- Super admin tenant list.
- Audit log table.
- Queue message list (if present).

Pattern:
```typescript
const parentRef = useRef<HTMLDivElement>(null);
const rowVirtualizer = useVirtualizer({
  count: rows.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 52,
  overscan: 5,
});
// Render: rowVirtualizer.getVirtualItems().map(virtualRow => ...)
```

### 9.4 · React Query polling intervals

Ensure these polling intervals are set across the portal:
| Query | `refetchInterval` |
|-------|:-----------------:|
| Unread notification count | 30000 |
| Live map driver locations | 60000 |
| Activity timeline | 60000 |
| Queue stats (super admin) | 10000 |
| System health metrics | 15000 |

---

## Phase 10 — Console Completion (Remaining P3 / P4)

### 10.1 · Retire deprecated `SUPER_ADMIN` compat routes

**Find:** `rg "SUPER_ADMIN" apps/backend/src --type ts`  
For each `/api/v1/admin/*` route that still uses the legacy `SUPER_ADMIN` role:
1. Map it to the granular `requireInternalPermission(...)` guard.
2. If the route has no active callers (check the super admin app and test files), delete it.
3. If callers remain, add a deprecation response header `Deprecation: true` and log a warning.

**Acceptance:** `rg "SUPER_ADMIN" apps/backend/src --type ts` returns 0 non-test matches.

### 10.2 · Stub badges → real metrics

**Find:** Every `<Badge>` or dashboard metric in `apps/super-admin/src/pillars/` that shows a static value (p95 latency, error rate, service health).  

For each:
- If a real metrics API endpoint exists: wire it.
- If not: render `—` with a tooltip "Metrics not yet configured" — never a fake number.

### 10.3 · npm version alignment

In `.npmrc` (root):
```
engine-strict=false
```
Or update `package.json` `engines.npm` to `>=10.8.2`. Whichever removes the warning.

### 10.4 · Sanctions re-screen naming

Find the sanctions re-screen BullMQ job. If it's named `"quarterly-sanctions-rescreen"` but scheduled monthly (`cron: '0 0 1 * *'`), rename it to `"monthly-sanctions-rescreen"`. Update the name in the job registration and any dashboard/monitoring references.

### 10.5 · Commit testing guide

```bash
git add docs/FAUWARD_CONSOLE_TESTING_GUIDE.md
git commit -m "docs: track console testing guide"
```

---

## Final acceptance checklist

Before declaring the plan complete, every item below must be true:

- [ ] `npm run typecheck` exits 0 from repo root (all workspaces)
- [ ] `npm run lint` exits 0 from repo root (all workspaces)
- [ ] `npm run build` exits 0 in every workspace
- [ ] `npx vitest run` in `apps/backend` shows 0 failures (≥ 218 passing)
- [ ] P0-1: `PATCH /api/internal/secrets/:id` returns 403 for read-only users
- [ ] P0-2: ROOT grant without hardware assertion returns 403
- [ ] P0-3: Stripe refund called twice with same logical key → one Stripe call
- [ ] P0-4: All four vendor webhook handlers reject invalid/missing HMAC signatures
- [ ] P1-6: CI job `audit-chain-integrity` runs against a real DB and exits 0
- [ ] P2-1/P2-2: Reconciliation script runs in CI and passes
- [ ] All tenant portal pricing pages (13) are fully functional — no placeholder text
- [ ] `AnalyticsPage` shows real KPI trend indicators, animated numbers, and funnel chart
- [ ] `ReportsPage` triggers real file downloads
- [ ] `ActivityTimelinePage` auto-refreshes and filters correctly
- [ ] `FleetPage` Drivers and Vehicles tabs are fully CRUD-functional
- [ ] `LiveMapPage` is plan-gated and shows real driver/shipment markers
- [ ] `PODViewer` component renders photos, signature, and generates a downloadable PDF
- [ ] Inline status update in shipment table works with a single shared popover
- [ ] Notification center bell shows real unread count, polling every 30s
- [ ] Email settings tab enables/disables real templates via API
- [ ] User suspension: suspended user's next API call returns `{ code: "USER_SUSPENDED" }`
- [ ] QR scanner in driver app opens camera and matches tracking numbers
- [ ] Lazy tab mounting applied to shipment detail, settings, and super-admin detail pages
- [ ] 300ms debounce applied to all search inputs
- [ ] TanStack Virtual applied to super-admin tenant list, audit log, and queue tables
- [ ] `rg "SUPER_ADMIN" apps/backend/src --type ts` returns 0 non-test matches
- [ ] `docs/SOC2_EVIDENCE_INDEX.md` lists all 7 controls with their passing CI run references

---

*Generated 2026-05-18 for Fauward platform — Temitope Agbola / Treny Limited*
