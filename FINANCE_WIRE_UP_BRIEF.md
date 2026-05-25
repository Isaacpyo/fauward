# Fauward — Finance Tab Wire-Up: Phase 2+ Brief

> **Status:** Phase 0 (audit) + Phase 1 sign-off complete. This brief supersedes the
> generic prompt for Phases 2-6 and the original "Read first / Process" preamble
> stays in force unless contradicted below.
>
> Read alongside [FINANCE_AUDIT.md](FINANCE_AUDIT.md). When the audit and this brief
> conflict, the brief wins.

---

## 0. Ground rules (changed since the original prompt)

- **Money:** keep `Decimal(12,2)` in Prisma. Transport as **decimal strings** on the wire. Never parse to JS float client-side; use a decimal lib if arithmetic is needed. Minor-unit integers exist **only** at the Stripe adapter edge ([apps/backend/src/modules/payments/stripe.service.ts](apps/backend/src/modules/payments/stripe.service.ts) already converts). The original "integer minor units everywhere" rule is **withdrawn**.
- **Tenant scope:** every query `tenantId`-scoped. No exceptions.
- **Auth:** reuse `authenticate` + `requireFeature(...)`. See §6 for new feature flags.
- **AuditLog:** every mutation in this brief writes an `AuditLog` row.
- **Stripe service:** reuse, don't replace. Paystack stays widget-only — no backend work this round.
- **Tier matrix (server-enforced, not just UI):**

  | Tier | Tabs |
  |---|---|
  | Starter | Overview, Invoices, Create invoice, Payments |
  | Pro | + Returns, COD & Collections |
  | Enterprise | + Settlements Reconciliation |

  Backend's single `financeModule` flag is insufficient. Add per-feature entitlements (see §6).

---

## 1. Scope changes vs the original prompt

| Original Phase | Revised scope |
|---|---|
| Phase 2 — auto-create Payment on shipment-create | **Link-or-create.** See §2. The original "always create" rule would double-row every gateway-paid shipment. |
| Phase 3 — persist Create Invoice form as DRAFT + Paid toggle | **Paid toggle only.** Form already persists DRAFT via `handleCreateInvoiceSubmit` ([TenantFinancePage.tsx:925-947](apps/tenant-portal/src/pages/finance/TenantFinancePage.tsx#L925-L947)) → `/v1/finance/invoices` with idempotency key → backend writes `status:'DRAFT'` ([finance.routes.ts:137](apps/backend/src/modules/finance/finance.routes.ts#L137)). Verify with one manual save; do not rebuild. |
| Phase 4 — Returns tab | **Rename + re-anchor** the existing `refunds` tab to `returns`, spine on `ReturnRequest`. Do not add a new tab. See §4. |
| Phase 5 — Settlements + COD + Reconciliation | **Split:** build `GatewayPayout` matching now; defer all bank-line reconciliation. COD via `COD_COLLECTED` `ShipmentEvent`. See §5. |
| Cross-cutting | New small workstream: per-feature entitlement gates. See §6. |

---

## 2. Phase 2 — Payments ⇄ Shipment lifecycle (link-or-create)

**Where:** inside the existing `$transaction` at [shipments.routes.ts:350-502](apps/backend/src/modules/shipments/shipments.routes.ts#L350-L502).

**Rule:** at shipment-create, attach to an existing `Payment` row first; only insert a new one if none matches. Idempotent on gateway ref.

**Resolution order:**

1. If the request carries a `gatewayRef` / `paymentIntentId` (the widget/portal flow), look up `Payment` by `gatewayRef = <ref> AND tenantId = ctx.tenantId AND shipmentId IS NULL`. If found: update with the new `shipmentId`. Done.
2. Else if the request carries an `idempotencyKey` matching a Payment's `idempotencyKey`: same — attach.
3. Else (COD-at-booking, zero-price, internal-create): insert a new `Payment` with the appropriate method/status. Idempotent on a stable hash (reuse the helper at [payments.routes.ts:80-83](apps/backend/src/modules/payments/payments.routes.ts#L80-L83)).

**Status mapping at creation:**

| Source | New Payment status | Method |
|---|---|---|
| Linked from `/payments/intent` (Stripe pending) | unchanged (still `PENDING`) | unchanged |
| Linked from a webhook that already fired | unchanged (`COMPLETED`) | unchanged |
| COD at booking | `PENDING` | `'CASH'` |
| Zero-price (`price == 0`) | `COMPLETED` | `'NONE'` (skip Stripe entirely) |
| Manual internal | `PENDING` | `'MANUAL'` |

Per-shipment guarantee: `Payment.shipmentId @unique` already enforces "≤1 payment per shipment" at the DB level — let the constraint do the work; on `P2002` ("unique constraint"), re-query and attach.

**Backfill (read-only):** add `GET /api/v1/finance/admin/shipments-missing-payment?dateFrom=&dateTo=` (Pro+, AuditLog-read role) returning a paginated list — never mutate.

**Audit:** the link-or-create writes an `AuditLog{ action: 'PAYMENT_LINKED' | 'PAYMENT_CREATED', resourceType: 'PAYMENT' }`.

---

## 3. Phase 3 — Invoices (toggle + filters)

### 3.1 Skipped (already done)

Create Invoice form already POSTs DRAFT. Verify by saving once; do **not** touch the form.

### 3.2 Invoice list filters + pagination

Extend `GET /api/v1/finance/invoices`:

- `?status=DRAFT,SENT,PAID,OVERDUE,PARTIALLY_PAID,VOID` (comma list, like the shipments route at [shipments.routes.ts:215-217](apps/backend/src/modules/shipments/shipments.routes.ts#L215-L217)).
- `?dateFrom=&dateTo=` against `createdAt`.
- `?customerId=` and `?organisationId=`.
- `?minTotal=&maxTotal=` against `total`.
- `?page=&limit=` (default 1 / 20, max 100). Response shape: `{ data, meta: { page, limit, total, totalPages } }` — mirror shipments.
- Backwards-compat: no query params = current behaviour.

Frontend ([TenantFinancePage.tsx:1483-1526](apps/tenant-portal/src/pages/finance/TenantFinancePage.tsx#L1483-L1526)) gets a filter bar + a paginator. Pull filter UI from the existing shipments page if there's a shared component; otherwise inline — don't build new abstractions for one screen.

### 3.3 Paid toggle (the only new mutation)

**Decision: the toggle maps onto the existing `POST /v1/finance/invoices/:id/pay` with no state-machine changes.**

- Allowed from any non-VOID, non-PAID status (matches current `/pay` behaviour).
- Does **not** stamp `sentAt` and does **not** queue the `invoice_sent` email. Rationale: a manual "mark paid" toggle is an operator recording an out-of-band payment, not the "we emailed it and it came back paid" flow. The `/send` action stays the only path that fires `invoice_sent`.
- Creates a `Payment` (status `COMPLETED`, `method: 'MANUAL'` unless body says otherwise) and lets the existing aggregate-and-set logic at [finance.routes.ts:272-286](apps/backend/src/modules/finance/finance.routes.ts#L272-L286) decide PAID vs PARTIALLY_PAID.
- Frontend: add a row-level toggle in the invoices table; on click, confirm-modal → `POST /pay { amount: invoice.total, currency: invoice.currency }`. Optimistic update + invalidate `["finance-invoices", "finance-summary", "finance-payments"]`.
- Audit: add `AuditLog{ action: 'INVOICE_MARKED_PAID' }`.

### 3.4 AuditLog backfill on existing routes

While in `finance.routes.ts`, add `AuditLog.create` to: `/invoices/:id/send`, `/invoices/:id/pay`, `/invoices/:id/void`, `/credit-notes` POST. One line per route; do not refactor.

---

## 4. Phase 4 — Returns (Pro)

### 4.1 Tab rename

In [TenantFinancePage.tsx:199](apps/tenant-portal/src/pages/finance/TenantFinancePage.tsx#L199): `{ value: "refunds", label: "Refunds", minimumPlan: "pro" }` → `{ value: "returns", label: "Returns", minimumPlan: "pro" }`. Update the `TabsContent value="refunds"` block at line 2030 accordingly. The URL `?tab=refunds` should redirect to `?tab=returns` so old links don't 404 — single `useEffect` is fine.

### 4.2 Data shape

Spine: `ReturnRequest` ([schema.prisma:1191](apps/backend/prisma/schema.prisma#L1191)). Each row surfaces:

- Return identity: `id`, status, `shipment.trackingNumber`, customer/org name, `createdAt`, `resolvedAt`.
- Items: count + value (from `items: Json` and the linked `Shipment.items`).
- Money: any linked `Refund` rows (via `payment.shipmentId == returnRequest.shipmentId`) and linked `CreditNote` rows (via `creditNote.invoice.shipmentId == returnRequest.shipmentId`). Show total refunded + total credited.
- Fee: `returnFee` + `paymentStatus`.

Add `GET /api/v1/finance/returns?status=&dateFrom=&dateTo=&page=&limit=` gated by **new** `requireFeature('financeReturns')` (see §6). Read-only this round — no new mutations.

### 4.3 Manual-adjustment credit notes

Credit notes with no `returnRequest` association stay visible under a filter chip ("Manual adjustments") on the same tab. Reuse `/v1/finance/credit-notes` for that branch — don't fold it server-side.

---

## 5. Phase 5 — Settlements Reconciliation (`GatewayPayout` only)

### 5.1 In scope this round

- New model `GatewayPayout`:

  ```
  model GatewayPayout {
    id              String   @id @default(uuid())
    tenantId        String
    tenant          Tenant   @relation(fields: [tenantId], references: [id])
    provider        String           // 'stripe' for now
    providerPayoutId String  @unique // e.g. po_xxx
    arrivalDate     DateTime
    amount          Decimal  @db.Decimal(12, 2)
    currency        String
    status          String           // 'paid' | 'pending' | 'failed' (provider's value, lowercased)
    rawPayload      Json
    createdAt       DateTime @default(now())

    lines           GatewayPayoutLine[]
    @@index([tenantId, arrivalDate])
    @@map("gateway_payouts")
  }

  model GatewayPayoutLine {
    id              String   @id @default(uuid())
    tenantId        String
    payoutId        String
    payout          GatewayPayout @relation(fields: [payoutId], references: [id], onDelete: Cascade)
    providerTxnId   String   // balance_transaction id
    providerSourceId String? // pi_xxx / ch_xxx
    amount          Decimal  @db.Decimal(12, 2)
    currency        String
    type            String   // 'charge' | 'refund' | 'fee' | 'other'
    matchedPaymentId String?
    matchedPayment  Payment? @relation(fields: [matchedPaymentId], references: [id])
    rawPayload      Json
    @@unique([tenantId, providerTxnId])
    @@index([payoutId])
    @@map("gateway_payout_lines")
  }
  ```

  Add the corresponding `gatewayPayoutLines Payment[]` back-relation on `Payment` (no migration risk — it's a back-ref).

- Stripe webhook handler additions in [payments.routes.ts:217](apps/backend/src/modules/payments/payments.routes.ts#L217): on `payout.paid`, fetch the payout's balance-transactions (`stripe.balanceTransactions.list({ payout: <id>, expand: ['data.source'] })`), upsert one `GatewayPayout` + N `GatewayPayoutLine`. Idempotent on `providerPayoutId`.

- Matcher: each `GatewayPayoutLine.providerSourceId` (e.g. `pi_xxx`) is joined to `Payment.gatewayRef` for the same tenant. On match, set `matchedPaymentId` and write `AuditLog{ action: 'PAYOUT_LINE_MATCHED' }`. No mutation to `Payment`.

- New endpoints (all Enterprise, see §6):
  - `GET /api/v1/finance/payouts?dateFrom=&dateTo=&status=&page=&limit=`
  - `GET /api/v1/finance/payouts/:id` — payout + lines + match status
  - `GET /api/v1/finance/payouts/unmatched` — lines with `matchedPaymentId IS NULL`
  - `POST /api/v1/finance/payouts/:lineId/manual-match` body `{ paymentId }` — operator override, AuditLogged

- Frontend tabs: `settlements` and `reconciliation` both read from the same endpoints. Decide whether to collapse them into one tab during implementation; the audit flagged this — recommend collapse to `settlements` (Enterprise) and delete the `reconciliation` tab, since they're the same dataset viewed two ways. If you keep both, both move to Enterprise.

### 5.2 Explicitly deferred

- Any bank-line / CAMT.053 / CSV statement import.
- Multi-currency FX matching beyond what Stripe already reports.
- Paystack/other gateway payout ingestion.

A doc stub `docs/finance/settlements.md` listing these as deferred is the only docs deliverable.

---

## 6. Phase 5b — COD & Collections (Pro)

### 6.1 Source of truth: a new `ShipmentEvent` type

`ShipmentEvent.status` is a free-form `String`, so adding a new type is a constant + handler, not a schema migration.

- **Constant:** `export const SHIPMENT_EVENT_COD_COLLECTED = 'COD_COLLECTED'` in a shared module (`apps/backend/src/modules/shipments/shipment-events.const.ts` if it doesn't exist, otherwise extend the nearest existing constants file — do not invent if it already exists).
- **Event payload (`notes` / `metadata`):** `{ amount, currency, collectedBy, collectionMethod: 'CASH' | 'CARD_TERMINAL' | 'BANK_TRANSFER' }`.

### 6.2 Driver app — emit the event

Today the POD path at [driver.routes.ts:140-178](apps/backend/src/modules/driver/driver.routes.ts#L140-L178) writes a `DELIVERED` event. **It does not capture COD.** fauward-Go has no COD UI today (`grep -i cod` returns only `codeType`).

Two-sided deliverable:

- **Backend:** extend `PATCH /api/v1/driver/shipments/:id/pod` to accept an optional `codCollection: { amount, currency, method }`. When present, write a second `ShipmentEvent{ status: 'COD_COLLECTED', actorId: userId, actorType: 'TENANT_DRIVER', source: 'DRIVER_APP', notes: JSON.stringify(payload) }` inside the same transaction.
- **fauward-Go (apps/fauward-Go):** in the POD wizard, if the shipment is flagged COD (see §6.4), show a "Collect cash" step before the signature/photo step. On submit, include `codCollection` in the PATCH body.

### 6.3 Backend worker advances Payment

A subscriber on the `COD_COLLECTED` event (BullMQ — wrap in `tenantStorage.run()` per [[project-bullmq-tenant-context]]):

1. Find `Payment` by `shipmentId`. If absent (the shipment was COD-at-booking, link-or-create §2 should have created it; if not, this is the create branch), upsert one with `method:'CASH'`.
2. Set `status: COMPLETED`, `gatewayRef: 'cod:<shipmentEvent.id>'`, populate `amount`/`currency` from the event payload.
3. If a linked `Invoice` exists, recompute PAID vs PARTIALLY_PAID using the same aggregate as [finance.routes.ts:272-286](apps/backend/src/modules/finance/finance.routes.ts#L272-L286).
4. `AuditLog{ action: 'COD_COLLECTED' }`.

### 6.4 How a shipment is flagged COD

`Shipment` has no `isCod` column today. **Do not add one** for this round — infer from the `Payment.method == 'CASH'` row created in §2 (COD-at-booking). The shipment-creation API should accept `{ paymentMethod: 'COD' }` and route through the §2 COD branch. If a tenant needs to flip an existing shipment to COD post-creation, that's an explicit follow-up — not in scope.

### 6.5 Collections tab data

`GET /api/v1/finance/collections` (Pro, `requireFeature('financeCod')`) returns:

```
{
  outstandingCount, outstandingValue,   // Payment.method='CASH' AND status!='COMPLETED'
  collectedCount, collectedValue,       // Payment.method='CASH' AND status='COMPLETED'
  byDriver: [ { driverId, name, outstandingValue, collectedValue } ],
  outstandingList: [ { shipmentId, trackingNumber, amount, currency, assignedDriverId } ]
}
```

Frontend ([TenantFinancePage.tsx:1962-2028](apps/tenant-portal/src/pages/finance/TenantFinancePage.tsx#L1962-L2028)) reads this endpoint instead of the current `payments.filter(method ∈ ...)` string match. The string match stays as a fallback only for legacy data without the event.

---

## 7. Phase 6 — Overview roll-up

Overview reads from the same endpoints the sub-tabs use — no parallel queries. Changes:

- `/v1/finance/summary` is augmented:
  - `outstanding` excludes `DRAFT`. New definition: `outstanding = sum(total)` where `status IN (SENT, PARTIALLY_PAID, OVERDUE)`.
  - Add `codOutstanding`, `codCollected` from `/v1/finance/collections`.
  - Add `payoutsMatchedPct`, `payoutsUnmatchedCount` from `/v1/finance/payouts` (Enterprise only — gate at the read site).
- Frontend updates the four KPI tiles + adds two new ones (COD outstanding, Payout match rate) at the bottom of the grid.

No new endpoints for Overview.

---

## 8. Per-feature entitlement gates

In [apps/backend/src/modules/tenants/plan.service.ts](apps/backend/src/modules/tenants/plan.service.ts), add three new flags:

| Flag | Starter | Pro | Enterprise |
|---|---|---|---|
| `financeReturns` | false | **true** | true |
| `financeCod` | false | **true** | true |
| `financeSettlementsReconciliation` | false | false | **true** |

Existing `financeModule` stays as the umbrella gate on Starter (false) for shared invoice/payment endpoints.

Apply `requireFeature(...)` on every new endpoint as listed above. **Frontend tab tier labels must match these flags exactly** — otherwise a Pro user sees a tab that the API refuses.

Update [apps/tenant-portal/src/lib/plan-features.ts](apps/tenant-portal/src/lib/plan-features.ts) (or wherever the client mirrors the plan matrix) to keep them in sync. One file change.

---

## 9. Reporting before code (the items that still need your call)

These can be answered in the implementation PR description rather than blocking the start of work, but flag them when you hit them:

- **Settlements vs Reconciliation tabs:** collapse to one (recommended) or keep both, with sign-off on which.
- **COD payment-method enum:** stay free-form `String` (recommended) or introduce an enum. Brief assumes free-form.
- **`/send` email when toggling Paid from DRAFT:** the brief says don't fire it. If you want it fired, call it out in the PR.

---

## 10. Output when done

`FINANCE_WIRE_UP_CHANGELOG.md` containing:

1. Reconciliation table (placeholder name → real name → action) — copy from FINANCE_AUDIT.md §1, append any new names introduced.
2. Changed/created files, one line each, grouped by phase.
3. Before → after for each wired contract: shipment→payment link-or-create, invoice Paid toggle, Returns spine, GatewayPayout matching, COD via ShipmentEvent, Overview roll-up.
4. Per-sub-tab manual verification checklist (one path per tab).
5. Anything stubbed or assumed, with file/line.
6. Migration list (Prisma + Supabase tenant template if any) with rollback notes.

---

## 11. Out of scope (explicit)

- Paystack backend integration.
- Bank-line / CAMT.053 / CSV settlement import.
- E-invoicing, FIRS/ZATCA/eTIMS/PEPPOL adapters.
- Money-unit migration of existing `Decimal(12,2)` columns.
- New invoice form work.
- New `Settlement` / `BankReconciliation` / `CashOnDelivery` Prisma models.
- Backfilling COD events for historical deliveries.

Anything in §11 lands as a separate, signed-off piece of work.
