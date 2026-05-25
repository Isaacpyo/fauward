# Finance Wire-Up — Changelog

Executes [FINANCE_WIRE_UP_BRIEF.md](FINANCE_WIRE_UP_BRIEF.md). Audit input: [FINANCE_AUDIT.md](FINANCE_AUDIT.md).

---

## 1. Reconciliation table (spec → real → action taken)

Carried over from the audit, with new names introduced in this PR appended.

| Name | Real repo name | Action taken |
|---|---|---|
| `apps/backend/src/modules/finance/` | `apps/backend/src/modules/finance/finance.routes.ts` (no service file) | Extended in place — no new finance.service.ts |
| Finance sub-tab "Returns" | `returns` (renamed from `refunds`) | **Renamed + re-anchored** on `ReturnRequest`; manual credit notes moved behind a "Manual adjustments" filter chip |
| "Settlements Reconciliation" tab | `settlements` (Enterprise) — `reconciliation` tab deleted | **Collapsed**: both old tabs merged into `settlements` per brief §5.1 recommendation |
| "COD & Collections" | `collections` (Pro) | Rewired to new `/v1/finance/collections` endpoint |
| `InvoiceLineItem` Prisma model | Stays as `Invoice.lineItems Json` | Not introduced |
| `Settlement` / `BankReconciliation` | **Not added** | Explicitly deferred per brief §5.2 |
| `GatewayPayout` / `GatewayPayoutLine` | **New** Prisma models | Added (migration `0029_gateway_payouts`) |
| `CashOnDelivery` model | Not introduced | COD inferred via `Payment.method='CASH'` + `COD_COLLECTED` `ShipmentEvent` |
| `Return` model | `ReturnRequest` | Reused (read-only this round) |
| `Refund` model | `Refund` | Surfaced in Returns tab via `shipment.payment.refunds` |
| `PaymentMethod` enum | Stays free-form `String` | Conventions: `'CASH'`, `'MANUAL'`, `'NONE'`, `'CARD_TERMINAL'`, `'BANK_TRANSFER'` |
| Shipment-create hook point | `POST /api/v1/shipments` `$transaction` | Link-or-create logic inlined |
| Stripe service | `stripe.service.ts` | Extended with `listPayoutBalanceTransactions` |
| AuditLog writes on finance mutations | Added to `/send`, `/pay`, `/void`, `/credit-notes` POST, `payout/:lineId/manual-match`, and the new shipment→payment link/create and COD pipelines |
| Per-feature plan gates | `financeReturns`, `financeCod`, `financeSettlementsReconciliation` | Added to both backend `plan.service.ts` and frontend `plan-features.ts` |
| **NEW** `SHIPMENT_EVENT_COD_COLLECTED` constant | `apps/backend/src/modules/shipments/shipment-events.const.ts` | New file |
| **NEW** COD payload type `PodCodCollection` | `apps/fauward-Go/src/types/field.ts` | New type added |

---

## 2. Changed / created files, grouped by phase

### Phase 8 — per-feature entitlements
- `apps/backend/src/modules/tenants/plan.service.ts` — added `financeReturns`, `financeCod`, `financeSettlementsReconciliation` across STARTER/PRO/ENTERPRISE.
- `apps/tenant-portal/src/lib/plan-features.ts` — mirrored the three flags client-side.

### Phase 5 — schema (do not split from §8 because the routes depend on these)
- `apps/backend/prisma/schema.prisma` — new `GatewayPayout` + `GatewayPayoutLine` models; added `gatewayPayouts` back-relation on `Tenant`; added `gatewayPayoutLines` + `@@index([tenantId, gatewayRef])` on `Payment`.
- `apps/backend/prisma/migrations/0029_gateway_payouts/migration.sql` — additive migration. Composite unique `(tenantId, providerPayoutId)` (Stripe single-account multi-tenant tolerant); composite unique `(tenantId, providerTxnId)`; indexes for arrival date and source lookup.

### Phase 2 — Payments ⇄ Shipment lifecycle (link-or-create)
- `apps/backend/src/modules/shipments/shipments.routes.ts` — inside the existing `$transaction` at the shipment-create success path: lookup-by-gatewayRef → lookup-by-idempotencyKey → create (COD/zero-price/manual). `P2002` recovery re-queries by `shipmentId`. Writes `AuditLog{ action: PAYMENT_LINKED | PAYMENT_CREATED }`. New payload fields: `paymentMethod`, `gatewayRef`, `paymentIntentId`.

### Phase 3 — Invoices
- `apps/backend/src/modules/finance/finance.routes.ts`:
  - `GET /invoices` now supports `status` (comma list), `dateFrom`, `dateTo`, `customerId`, `organisationId`, `minTotal`, `maxTotal`, `page`, `limit`. Backwards-compatible: no params returns the old un-paginated shape.
  - `POST /invoices/:id/send` writes `AuditLog{ INVOICE_SENT }`.
  - `POST /invoices/:id/pay` writes `AuditLog{ INVOICE_MARKED_PAID | INVOICE_PARTIALLY_PAID }`.
  - `POST /invoices/:id/void` wrapped in `$transaction` with `AuditLog{ INVOICE_VOIDED }`.
  - `POST /credit-notes` wrapped in `$transaction` with `AuditLog{ CREDIT_NOTE_CREATED }`.
  - New `GET /api/v1/finance/admin/shipments-missing-payment` (Phase 2 backfill report — read-only).
- `apps/tenant-portal/src/pages/finance/TenantFinancePage.tsx`:
  - Added "Mark paid" row-action on the invoice table; calls `POST /v1/finance/invoices/:id/pay` with `{ amount: invoice.total, currency, method: "MANUAL" }`. No state-machine surgery — uses the existing endpoint as the brief mandated. Optimistic invalidation of `["finance-invoices", "finance-summary", "finance-payments"]`.
- Create Invoice form: verified to already POST DRAFT via `handleCreateInvoiceSubmit` → `/v1/finance/invoices`. No code change required.

### Phase 4 — Returns
- `apps/backend/src/modules/finance/finance.routes.ts` — new `GET /api/v1/finance/returns` (Pro, gated by `requireFeature('financeReturns')`). Joins `ReturnRequest` → `Shipment.items/payment.refunds/invoice.creditNotes` and `customer` / `organisation`. Returns count + value of returned items + total refunded + total credited per return.
- `apps/tenant-portal/src/pages/finance/TenantFinancePage.tsx`:
  - Tab `refunds` renamed to `returns`. URL legacy `?tab=refunds` → `?tab=returns` (normalised at read time, no flash).
  - New `ReturnsAndAdjustments` sub-component: spine on the new endpoint with a toggle to "Manual adjustments" (credit notes with no linked invoice).

### Phase 5 — Settlements Reconciliation (`GatewayPayout` only)
- `apps/backend/src/modules/payments/stripe.service.ts` — new `listPayoutBalanceTransactions(payoutId)` that paginates `stripe.balanceTransactions.list({ payout, expand: ['data.source'] })`.
- `apps/backend/src/modules/payments/payments.routes.ts`:
  - Webhook handler now also handles `payout.paid` and `payout.updated` → `ingestStripePayout()`.
  - `ingestStripePayout()` groups balance transactions by `tenantId` (read from PaymentIntent metadata that `/payments/intent` already sets), upserts one `GatewayPayout` per tenant (idempotent via composite `(tenantId, providerPayoutId)`), upserts each `GatewayPayoutLine`, matches on `Payment.gatewayRef`, writes `AuditLog{ PAYOUT_LINE_MATCHED }` on hits.
- `apps/backend/src/modules/finance/finance.routes.ts` — new endpoints (all gated by `requireFeature('financeSettlementsReconciliation')`):
  - `GET /payouts` — paginated list of payouts.
  - `GET /payouts/unmatched` — lines awaiting match.
  - `GET /payouts/:id` — payout + lines + matched counts.
  - `POST /payouts/:lineId/manual-match` — operator override; `AuditLog{ PAYOUT_LINE_MATCHED_MANUAL }`.
- `apps/tenant-portal/src/pages/finance/TenantFinancePage.tsx`:
  - **Collapsed** `settlements` + `reconciliation` into a single `settlements` tab (Enterprise). Old `reconciliation` URL → `settlements`.
  - New `SettlementsReconciliation` sub-component reading the new endpoints + summary's `payoutsMatchedPct`/`payoutsUnmatchedCount`.

### Phase 5b — COD & Collections
- `apps/backend/src/modules/shipments/shipment-events.const.ts` — new file with `SHIPMENT_EVENT_COD_COLLECTED` and other event-status conventions + `CodCollectionPayload` type.
- `apps/backend/src/modules/driver/driver.routes.ts` — `POST /driver/pod` accepts optional `codCollection`. When present, in the same `$transaction`:
  1. Writes a second `ShipmentEvent{ status: 'COD_COLLECTED' }`.
  2. Updates the existing `Payment` row for the shipment to `COMPLETED` (or creates one if none — defensive; link-or-create in Phase 2 should already have created it for COD-at-booking).
  3. Recomputes the linked `Invoice` status if any.
  4. Writes `AuditLog{ COD_COLLECTED }`.
- `apps/backend/src/modules/field/field.routes.ts` — `pod_upload` mutation handler in the field-sync batch also reads `codCollection` from the payload and does the same COD pipeline. This is the path the offline driver app actually uses (`/api/v1/field/sync/batch`), not `/driver/pod`.
- `apps/backend/src/modules/finance/finance.routes.ts` — `GET /api/v1/finance/collections` (Pro, `requireFeature('financeCod')`). Returns `outstandingCount/Value`, `collectedCount/Value`, `byDriver`, `outstandingList`.
- `apps/tenant-portal/src/pages/finance/TenantFinancePage.tsx` — new `CodCollections` sub-component reads `/v1/finance/collections` instead of string-matching `Payment.method`. The string match path is fully removed.
- `apps/fauward-Go/src/types/field.ts` — new `PodCodCollection` type; added `codCollection?: PodCodCollection` to `PodDraft`.
- `apps/fauward-Go/src/store/useFieldDataStore.ts` — added `codCollection` to `PodDraftUpdate`. Existing spread-based `submitPodForStop` flows it through unchanged.
- `apps/fauward-Go/src/features/pod/PodCaptureScreen.tsx` — added a "Cash on delivery collected" toggle + amount/currency/method inputs; flows into the draft and via the sync batch into the backend handler above.

### Phase 6 — Overview rollup
- `apps/backend/src/modules/finance/finance.routes.ts` — `GET /api/v1/finance/summary` now:
  - `outstanding = sum(total)` where `status IN (SENT, PARTIALLY_PAID, OVERDUE)` (DRAFT excluded — was wrongly included before).
  - Adds `codOutstanding`, `codCollected` from the Payment aggregate.
  - Adds `payoutsMatchedPct`, `payoutsUnmatchedCount` — only when the tenant has `financeSettlementsReconciliation` (read-site gate).
- `apps/tenant-portal/src/pages/finance/TenantFinancePage.tsx` — Overview KPI grid: added two conditional tiles (COD outstanding, Payout match rate) using `FinanceKpiCard`. `FinanceKpiCard.changePct` made optional and the trend chip hidden when not provided (no previous-period for these two yet).

---

## 3. Before → after per wired contract

### Shipment → Payment
- **Before:** Shipment created with no `Payment` row. `/payments/intent` separately upserted one keyed by `shipmentId`, leaving orphan payments if widget paid before the shipment landed.
- **After:** Shipment-create transaction does link-or-create. Existing `Payment(gatewayRef=…, shipmentId=null)` rows get attached on creation. COD-at-booking and zero-price create a new row inline. `Payment.shipmentId @unique` enforces ≤1, with `P2002` re-query fallback. `AuditLog` records which path ran.

### Invoice Paid toggle
- **Before:** No row-level action. `/invoices/:id/pay` only reachable from invoice detail.
- **After:** "Mark paid" button on each non-PAID, non-VOID row of the invoice list; same endpoint. No new state machine; `/send` remains the only path that fires `invoice_sent`. `AuditLog{ INVOICE_MARKED_PAID | INVOICE_PARTIALLY_PAID }`.

### Returns spine
- **Before:** Tab labelled "Refunds", listed only `CreditNote` rows. `ReturnRequest` ignored; `Refund` ignored.
- **After:** Tab renamed to "Returns", anchored on `ReturnRequest`. Each row shows return identity, item count + value, refunded total (`shipment.payment.refunds`), credited total (`shipment.invoice.creditNotes`), fee, payment status. Manual credit notes accessible via a filter chip on the same tab.

### GatewayPayout matching
- **Before:** Settlements/Reconciliation tabs derived labels from in-browser sums of `payments` and `creditNotes`. No payout import.
- **After:** Stripe `payout.paid` webhook ingests balance transactions, groups by tenant (via PaymentIntent metadata), upserts `GatewayPayout` + `GatewayPayoutLine`, auto-matches on `gatewayRef`. Settlements tab reads matched/unmatched + summary `payoutsMatchedPct`. Manual match endpoint available for operator overrides.

### COD via `ShipmentEvent`
- **Before:** COD inferred client-side by string-matching `Payment.method ∈ {COD, CASH, CASH_ON_DELIVERY}`. No driver-side capture. No "collected" timestamp.
- **After:** Driver app captures `codCollection` in the POD step. Sync path (or `/driver/pod`) writes a second `ShipmentEvent{ status: 'COD_COLLECTED' }`, updates/creates the `Payment` to `COMPLETED` with `method='CASH'`, recomputes invoice status, writes `AuditLog{ COD_COLLECTED }`. Collections tab reads `/v1/finance/collections` (no more string match).

### Overview rollup
- **Before:** `outstanding` included DRAFT; no COD/payout KPIs.
- **After:** `outstanding` excludes DRAFT. Two new conditional KPIs (COD outstanding, Payout match rate) feed from the same endpoints the sub-tabs use.

---

## 4. Per-sub-tab manual verification checklist

| Tab | Golden-path check |
|---|---|
| **Overview** | Open `/finance` as a Pro tenant. Confirm four base KPIs + "COD outstanding" tile appear; outstanding excludes DRAFT invoices. As Enterprise, the "Payout match rate" tile also appears. |
| **Invoices** | List loads; add filters via URL (`?status=SENT&page=1&limit=5`) to confirm new query params return paginated `{ data, meta }`. On a SENT or PARTIALLY_PAID row, click "Mark paid", confirm the toast, confirm the row flips to PAID and `payments` tab shows a new `MANUAL` payment. AuditLog has `INVOICE_MARKED_PAID`. |
| **Create invoice** | Save a draft once. Confirm DB row exists with `status='DRAFT'`. (No code changed — verification only.) |
| **Payments** | Create a shipment via `POST /api/v1/shipments` with `{ paymentMethod: 'COD' }`. Confirm a `Payment(method='CASH', status=PENDING)` row appears here, linked to the shipment. AuditLog has `PAYMENT_CREATED`. Then create another shipment with a `gatewayRef` that already has a pending `Payment` (simulating widget pre-payment): confirm the existing payment is attached (no duplicate row); AuditLog has `PAYMENT_LINKED`. |
| **Collections (Pro)** | Log a `POST /driver/pod` with `codCollection: { amount: 50, currency: 'GBP', method: 'CASH' }`. Confirm the Collections tab now shows the shipment under "collected", driver attribution if assigned, `byDriver` row, AuditLog `COD_COLLECTED`. |
| **Returns (Pro)** | Create a `ReturnRequest` for a delivered shipment with a refund. Open the Returns tab → row shows item count, item value, refunded total, credited total. Toggle "Manual adjustments" → credit notes with no invoice attach show up. |
| **Settlements (Enterprise)** | Trigger a Stripe `payout.paid` webhook (test event with linked balance transactions). Confirm a `GatewayPayout` row per tenant appears; matched lines have `matchedPaymentId` set; unmatched lines surface in the "Unmatched payout lines" panel; summary `payoutsMatchedPct` shows on Overview. |
| **Tier enforcement** | As a Starter tenant, hit `/api/v1/finance/returns`, `/collections`, `/payouts` directly — all should 403 with `code: FEATURE_NOT_AVAILABLE`. As Pro, `/returns` and `/collections` 200; `/payouts` 403. As Enterprise, all 200. |
| **Driver app COD step** | In fauward-Go, open a POD capture screen. Tick "Cash on delivery collected", enter amount + currency + method, submit. Confirm the POD is queued; on next sync the backend should emit `COD_COLLECTED` and update the corresponding Payment. |

---

## 5. Stubbed / assumed (read before reviewing)

- **Stripe tenant attribution** in `payments.routes.ts:ingestStripePayout` reads `tenantId` from `PaymentIntent.metadata.tenantId`. That metadata is already set by `/payments/intent` ([payments.routes.ts:118-121](apps/backend/src/modules/payments/payments.routes.ts#L118-L121)). Lines whose source has no resolvable tenantId are dropped with a `warn` log. If the platform later moves to Stripe Connect per tenant, replace this with the connected `account` field — composite unique on `(tenantId, providerPayoutId)` is already correct for that scenario.
- **No `Settlement` / `BankReconciliation` / `CashOnDelivery` model.** Per brief §5.2 and §6.4 — explicitly deferred. `GatewayPayout` covers the gateway side; bank-line import is its own future feature.
- **fauward-Go COD detection.** The PodCaptureScreen shows the COD toggle on every POD; it's not gated on a "shipment is COD" signal because `Shipment` has no `isCod` column (brief §6.4 says don't add one). Driver decides. This is a known UX simplification — a future iteration could surface a hint when the shipment's outstanding `Payment(method='CASH')` exists.
- **`Payment.method` enum**: kept as free-form `String`. Conventions used: `'CASH'`, `'MANUAL'`, `'NONE'`, `'CARD_TERMINAL'`, `'BANK_TRANSFER'`, plus whatever the Stripe webhook stores (unchanged). If you want a hard enum, that's a separate migration.
- **Backfill report** at `GET /api/v1/finance/admin/shipments-missing-payment` is gated by `requireFeature('financeModule')` only. The brief mentioned an "AuditLog-read role" — I left it on the umbrella flag rather than inventing a new role; tighten if you want operator-only access.
- **Tenant-portal `markPaidMutation`** uses `window.confirm()` for the toggle confirmation. If you have a project-standard confirm modal, swap that in (didn't see one in the page's existing patterns).
- **Stripe API version mismatch** at [stripe.service.ts:22](apps/backend/src/modules/payments/stripe.service.ts#L22) is **pre-existing** (was `'2026-03-25.dahlia'`, SDK now wants `'2026-04-22.dahlia'`) — not from this PR; flagged here so you don't think the new code introduced it.
- **`field.routes.ts(799)` ShipmentWhereInput readonly tuple** is also pre-existing — not from this PR.

---

## 6. Migrations

| Migration | Direction | Notes |
|---|---|---|
| `0029_gateway_payouts/migration.sql` | Forward-only, additive | Creates `gateway_payouts` and `gateway_payout_lines` tables; adds `payments_tenantId_gatewayRef_idx`. No data changes. **Rollback:** `DROP TABLE gateway_payout_lines; DROP TABLE gateway_payouts; DROP INDEX payments_tenantId_gatewayRef_idx;` |

No tenant-schema template migration needed — all new tables are platform-scoped via `tenantId`.

---

## 7. Known follow-ups (deliberately not in scope)

- Bank-line / CAMT.053 / CSV settlement import.
- Paystack payout ingestion (the widget Paystack flow exists, but no backend Paystack webhook handling here).
- A `Shipment.isCod` flag to drive the driver app's COD UI proactively.
- COD backfill for historical deliveries.
- Replacing `window.confirm` with the project's UI modal pattern.
- Moving the in-line Stripe webhook handlers to a dedicated service file if they keep growing.

---

## 8. Typecheck status

- `apps/backend`: only pre-existing errors (`field.routes.ts(799)` readonly tuple, `stripe.service.ts(22)` API-version mismatch). My changes typecheck cleanly.
- `apps/tenant-portal`: clean.
- `apps/fauward-Go`: clean.

**Prisma client regen** (`npx prisma generate`) reported `EPERM` on the Windows DLL during my run (almost certainly because the dev server has the file locked). The generated `index.d.ts` was updated regardless (contains all `gatewayPayout` types), so typecheck passes. **Re-run `npm run prisma:generate --workspace=apps/backend` once the dev server is stopped before running the migration**, just to be sure the runtime engine matches.
