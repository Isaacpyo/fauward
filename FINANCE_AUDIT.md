# Finance Tab — Phase 1 Audit

> Read against [apps/backend/prisma/schema.prisma](apps/backend/prisma/schema.prisma),
> [apps/backend/src/modules/finance/finance.routes.ts](apps/backend/src/modules/finance/finance.routes.ts),
> [apps/backend/src/modules/payments/payments.routes.ts](apps/backend/src/modules/payments/payments.routes.ts),
> [apps/backend/src/modules/shipments/shipments.routes.ts](apps/backend/src/modules/shipments/shipments.routes.ts),
> [apps/backend/src/modules/returns/returns.routes.ts](apps/backend/src/modules/returns/returns.routes.ts),
> [apps/backend/src/modules/tenants/plan.service.ts](apps/backend/src/modules/tenants/plan.service.ts),
> [apps/backend/src/shared/middleware/featureGuard.ts](apps/backend/src/shared/middleware/featureGuard.ts),
> [apps/tenant-portal/src/pages/finance/TenantFinancePage.tsx](apps/tenant-portal/src/pages/finance/TenantFinancePage.tsx).

---

## 1. Reconciliation table (spec name → real name → action)

| Spec name | Real repo name | Where | Action |
|---|---|---|---|
| `apps/backend/src/modules/finance/` | `apps/backend/src/modules/finance/` (single `finance.routes.ts`, no service file) | [finance.routes.ts](apps/backend/src/modules/finance/finance.routes.ts) | **Reuse** — add a `finance.service.ts` only if new logic warrants it; do not introduce one preemptively. |
| Finance sub-tab "Returns" | Tab id `refunds` (currently shows credit notes only) | [TenantFinancePage.tsx:199](apps/tenant-portal/src/pages/finance/TenantFinancePage.tsx#L199) | **Extend** — either rename the tab to "Returns" and join in `ReturnRequest` data, or add a new tab. Spec mismatch must be resolved before Phase 4. |
| Finance sub-tab "Settlements Reconciliation" | Two distinct tabs: `settlements` (Pro) and `reconciliation` (Enterprise) | [TenantFinancePage.tsx:200-201](apps/tenant-portal/src/pages/finance/TenantFinancePage.tsx#L200-L201) | **Decide** — collapse to one tab or keep split. Today both are pure in-memory derivations. |
| Finance sub-tab "COD & Collections" | Tab id `collections` (Pro) | [TenantFinancePage.tsx:198](apps/tenant-portal/src/pages/finance/TenantFinancePage.tsx#L198) | **Reuse** name, **extend** content — no COD model exists. |
| `InvoiceLineItem` Prisma model | Does not exist. Line items live as `Json` on `Invoice.lineItems` | [schema.prisma:1382](apps/backend/prisma/schema.prisma#L1382) | **Do not invent**. The Create Invoice form already serialises to this `Json` shape via `buildCreateInvoicePayload`. Only promote to a real model if a query requirement forces it. |
| `Settlement` / `GatewayPayout` model | None | n/a | **Add (with sign-off)**. Phase 5 needs at least a payout-line table to make matching anything more than UI sugar. |
| `CashOnDelivery` / `COD` model | None | n/a | **Add (with sign-off)**. Today COD is inferred from `Payment.method` being a free-form string. |
| `Return` model | `ReturnRequest` (note the name) with `paymentStatus`, `returnFee`, `feeCurrency`, `stripeSessionId` | [schema.prisma:1191](apps/backend/prisma/schema.prisma#L1191) | **Reuse**. Returns money already flows via the Stripe webhook path in `payments.routes.ts:handleReturnPayment`. |
| `Refund` model | Exists, attached to `Payment` | [schema.prisma:1435](apps/backend/prisma/schema.prisma#L1435) | **Reuse**. Currently surfaced nowhere in the UI. |
| `PaymentMethod` enum | None — `Payment.method` is `String?` | [schema.prisma:1420](apps/backend/prisma/schema.prisma#L1420) | **Defer** introducing an enum. UI today filters COD by string-match `["COD","CASH","CASH_ON_DELIVERY"]` at [TenantFinancePage.tsx:1025-1028](apps/tenant-portal/src/pages/finance/TenantFinancePage.tsx#L1025-L1028). |
| "Hook point: where a shipment is created" | `POST /api/v1/shipments` in [shipments.routes.ts:266-502](apps/backend/src/modules/shipments/shipments.routes.ts#L266-L502) | inside `app.prisma.$transaction` after `tx.shipment.create(...)` | **Extend**. Already writes `ShipmentEvent`, `TrackingEvent`, `TrackingSnapshot`, `UsageRecord`, `OutboxEvent`. A `Payment` row is the obvious missing sibling. |
| "Reuse the existing Stripe/Paystack service" | Stripe yes ([payments/stripe.service.ts](apps/backend/src/modules/payments/stripe.service.ts), used by `payments.routes.ts`). Paystack **not in backend** — only in the widget ([apps/widget/lib/payments/providers.ts](apps/widget/lib/payments/providers.ts) per the changelog) | n/a | **Reuse Stripe; flag Paystack as widget-only** in Phase 2 design. Don't duplicate. |
| `AuditLog` writes on mutations | Model exists. Finance routes **do not** currently write to it. Shipments route does for `SHIPPING_RULE_TRIGGERED` only. | [shipments.routes.ts:484](apps/backend/src/modules/shipments/shipments.routes.ts#L484) | **Add** AuditLog writes to invoice send / pay / void and to the new shipment→payment creation. |
| Per-tab Pro-tier gating | Backend has one flag, `financeModule` (false on STARTER, true on PRO/ENTERPRISE). No per-tab/per-feature gating. | [plan.service.ts:1-59](apps/backend/src/modules/tenants/plan.service.ts#L1-L59), [featureGuard.ts:4](apps/backend/src/shared/middleware/featureGuard.ts#L4) | **Decide**. Frontend gates collections/refunds/settlements/reconciliation client-side. Backend lets a Pro tenant call all finance endpoints. Real Pro-tier enforcement for Returns/Settlements/COD needs either new feature flags or moving guards onto the endpoints those tabs use. |

---

## 2. Current finance API surface

All gated by `requireFeature('financeModule')` ([finance.routes.ts:82-490](apps/backend/src/modules/finance/finance.routes.ts#L82-L490)):

| Method | Path | What it does |
|---|---|---|
| GET | `/api/v1/finance/invoices` | List invoices (tenant-scoped, with organisation) |
| POST | `/api/v1/finance/invoices` | Create invoice **as DRAFT** (idempotent) |
| GET | `/api/v1/finance/invoices/:id` | Invoice + payments + creditNotes + organisation + shipment |
| PATCH | `/api/v1/finance/invoices/:id` | Update DRAFT only |
| POST | `/api/v1/finance/invoices/:id/send` | DRAFT→SENT + queues `invoice_sent` email |
| POST | `/api/v1/finance/invoices/:id/pay` | Creates a `Payment` (status COMPLETED), recomputes PAID vs PARTIALLY_PAID |
| POST | `/api/v1/finance/invoices/:id/void` | →VOID (blocks if already PAID) |
| POST | `/api/v1/finance/invoices/bulk` | Auto-draft invoices for DELIVERED shipments without `invoice` in a date window |
| GET | `/api/v1/finance/payments` | List payments + linked invoice |
| POST | `/api/v1/finance/credit-notes` | Create credit note against an invoice |
| GET | `/api/v1/finance/credit-notes` | List credit notes |
| GET | `/api/v1/finance/report/csv` | Invoice CSV export |
| GET | `/api/v1/finance/summary` | `{ totalInvoiced, collected, outstanding, overdue }` |
| (cron) | `runOverdueInvoiceSweep` | SENT + past `dueDate` → OVERDUE + queues `invoice_overdue` email |

Adjacent (live on the `payments` module — NOT gated by `financeModule`):

| Method | Path | What it does |
|---|---|---|
| POST | `/api/v1/payments/intent` | Stripe `PaymentIntent` + **upserts a `Payment(shipmentId)` row in PENDING**. Idempotent on a stable hash. [payments.routes.ts:86-158](apps/backend/src/modules/payments/payments.routes.ts#L86-L158) |
| GET | `/api/v1/payments/billing-status` | Tenant billing state for the banner |
| GET | `/api/v1/payments/:shipmentId` | Payment lookup by shipment |
| POST | `/api/v1/payments/webhook/stripe` | `payment_intent.succeeded` → Payment=COMPLETED, Invoice=PAID; failure path; `checkout.session.completed` runs the return-fee flow |

**No Paystack on the backend.** Paystack lives in the widget only per `FAUWARD_FORM_GLOBAL_REBUILD_CHANGELOG.md` (referenced in current selection).

---

## 3. Schema reality (what Phase 2+ will write against)

- `Invoice` ([schema.prisma:1372](apps/backend/prisma/schema.prisma#L1372)): `lineItems: Json` (no `InvoiceLineItem` model). `shipmentId @unique`. Status `InvoiceStatus { DRAFT | SENT | PAID | OVERDUE | PARTIALLY_PAID | VOID }`. Stamps: `sentAt`, `paidAt`, `voidedAt`. Amounts are `Decimal(12,2)` — **stored as major units, not minor units**. (Spec says minor units; reality is major.)
- `Payment` ([schema.prisma:1409](apps/backend/prisma/schema.prisma#L1409)): `shipmentId String? @unique` — at most one payment per shipment via the FK. `invoiceId` optional. `method: String?` (free-form). `idempotencyKey String? @unique`. Status `PaymentStatus { PENDING | COMPLETED | FAILED | REFUNDED }`. `refundedAmount Decimal`.
- `Refund` ([schema.prisma:1435](apps/backend/prisma/schema.prisma#L1435)): exists, has `RefundApproval` children. Not surfaced in finance UI.
- `CreditNote` ([schema.prisma:1471](apps/backend/prisma/schema.prisma#L1471)): exists, listed in the `refunds` tab today.
- `ReturnRequest` ([schema.prisma:1191](apps/backend/prisma/schema.prisma#L1191)): real model. Has own `paymentStatus: ReturnPaymentStatus`, `returnFee`, `stripeSessionId`, `returnPickupShipmentId @unique`. The Stripe webhook in `payments.routes.ts:handleReturnPayment` already creates a reverse shipment when the return fee is paid.
- `Shipment` ([schema.prisma:764](apps/backend/prisma/schema.prisma#L764)): single nullable `payment Payment?` back-relation, single nullable `invoice Invoice?`. `price: Decimal?` major units.
- **No** `Settlement`, `GatewayPayout`, `BankReconciliation`, `CashOnDelivery`, or `CodCollection` model. There is `CommissionPayout` but it is unrelated (driver/sales commissions).
- `AuditLog` model exists and is used elsewhere; **no finance route currently writes to it.**

---

## 4. Per-tab audit

Frontend tab definitions: [TenantFinancePage.tsx:193-202](apps/tenant-portal/src/pages/finance/TenantFinancePage.tsx#L193-L202).

### Overview (`overview`, Starter)

- **Screen real?** Yes. KPIs + revenue-flow bar + payment-mix bar + status breakdown.
- **Data real?** Mostly. `/v1/finance/summary` is real; daily series are computed in the browser from `invoices + payments`. Falls back to **mock data when token absent** (`fallbackSummary`, `fallbackInvoices`, `fallbackPayments` at [TenantFinancePage.tsx:230-272](apps/tenant-portal/src/pages/finance/TenantFinancePage.tsx#L230-L272)).
- **Endpoints back it?** Yes — `summary`, `invoices`, `payments`, `credit-notes`.
- **UI ↔ DB gap?** Summary computes `outstanding = total of non-PAID invoices`. That includes `DRAFT` (not yet billed). May overstate receivables.
- **Tier gating?** No backend separate gating beyond `financeModule`.

### Invoices (`invoices`, Starter)

- **Screen real?** Yes — list with link to `/finance/:id` detail page.
- **Data real?** Yes via `/v1/finance/invoices`; mock fallback when no token.
- **UI ↔ DB gap?** No client-side filters (status/date/customer/amount/pagination) yet — spec calls for these.
- **No row-action "Paid toggle"** — only a link to detail.

### Create invoice (`create-invoice`, Starter)

- **Screen real?** Yes — full WYSIWYG editor.
- **Data real?** **Already persisting as DRAFT.** `handleCreateInvoiceSubmit` calls `createInvoiceMutation` which POSTs `/v1/finance/invoices` with `Idempotency-Key`. Backend writes status DRAFT. ([TenantFinancePage.tsx:925-947](apps/tenant-portal/src/pages/finance/TenantFinancePage.tsx#L925-L947), [finance.routes.ts:137](apps/backend/src/modules/finance/finance.routes.ts#L137))
- **Spec mismatch**: Phase 3 says *"the existing Create Invoice form must persist a completed invoice as status `DRAFT` on save (not just hold it in local state)."* This is already true. Verify by clicking save and reading the DB rather than rebuilding.

### Payments (`payments`, Starter)

- **Screen real?** Yes — table of payments with invoice link.
- **Data real?** Yes via `/v1/finance/payments`. Mock fallback when no token.
- **UI ↔ DB gap (this is the big one for Phase 2)**: today a `Payment` row only exists if (a) `/api/v1/payments/intent` was called and (b) the Stripe webhook landed, **or** the invoice was paid via `/finance/invoices/:id/pay`. **The shipment-create path at [shipments.routes.ts:351](apps/backend/src/modules/shipments/shipments.routes.ts#L351) writes `Shipment` but no `Payment`.** That is the missing wiring spec Phase 2 demands.
- No filters, no refund/reconcile actions.

### COD & Collections (`collections`, Pro)

- **Screen real?** Yes — derived tiles + COD queue list.
- **Data real?** Pure derivation in the browser. `codPayments = payments where method ∈ {COD, CASH, CASH_ON_DELIVERY}` ([TenantFinancePage.tsx:1025-1028](apps/tenant-portal/src/pages/finance/TenantFinancePage.tsx#L1025-L1028)). There is **no source of truth for COD** — no model, no driver-collected event, no "owed vs collected" split.
- **Endpoints back it?** None specifically. Reuses `/finance/payments` + `/finance/summary`.
- **Tier gating?** Frontend-only (`minimumPlan: "pro"`). Backend `financeModule` is Pro+, so accessible by any Pro tenant.

### Refunds (`refunds`, Pro)

- **Screen real?** Yes — table of credit notes.
- **Data real?** Yes via `/v1/finance/credit-notes`.
- **UI ↔ DB gap**: shows only `CreditNote`. Does not show the `Refund` model rows, does not show `ReturnRequest` financial figures, does not link refunds back to returns. Spec's Phase 4 ("Returns tab") is **not the same tab as this** — there is no Returns tab today.
- **Tier gating?** Frontend-only.

### Settlements (`settlements`, Pro)

- **Screen real?** Yes — three derived tiles + "settlement candidates" list.
- **Data real?** **No — all in-browser derivation** from `payments`, `creditNotes`, `summary.outstanding` ([TenantFinancePage.tsx:1046-1075](apps/tenant-portal/src/pages/finance/TenantFinancePage.tsx#L1046-L1075)). Labels like "SETTLED", "IN_REVIEW", "ADJUSTED" are invented; no payout-line data, no bank-line import.
- **Endpoints back it?** None.
- **Tier gating?** Frontend-only.

### Reconciliation (`reconciliation`, **Enterprise** today — spec says Pro)

- **Screen real?** Yes — invoice-by-invoice paid-vs-total table.
- **Data real?** Derived in browser by summing payments per invoice ([TenantFinancePage.tsx:1077-1095](apps/tenant-portal/src/pages/finance/TenantFinancePage.tsx#L1077-L1095)). Labels MATCHED / PARTIAL / UNRECONCILED are invented. Not bank/gateway-level reconciliation.
- **Endpoints back it?** None.
- **Tier gating mismatch**: code sets `minimumPlan: "enterprise"`; spec lumps this with Pro. Decide which is right before Phase 5.

---

## 5. Prioritised gap list

In rough order of dependency:

1. **(Phase 2 — blocking link)** Shipment-create path does not write a `Payment`. Wire it inside the existing `$transaction` at [shipments.routes.ts:350-502](apps/backend/src/modules/shipments/shipments.routes.ts#L350-L502). Idempotent on `gatewayRef`/`idempotencyKey`. Decide policy for COD-at-booking, prepaid-from-widget (gateway already created the payment), and zero-price shipments before coding.
2. **(Phase 2)** Backfill report endpoint — list shipments without a payment row so existing data can be reconciled (read-only).
3. **(Phase 2/3)** AuditLog writes for invoice send/pay/void and the new shipment→payment creation.
4. **(Phase 3)** Invoice list filters (status, date, customer, amount) + pagination on `/v1/finance/invoices`.
5. **(Phase 3)** Invoice list row-action "Paid toggle" — and spec sign-off on whether toggling from `DRAFT` should also stamp `SENT` or jump straight to `PAID`. Today the state machine assumes `DRAFT → SENT → PAID/PARTIALLY_PAID/VOID`, and `/pay` does not require `SENT` first.
6. **(Phase 4)** Resolve "Returns" tab ambiguity. Either repurpose `refunds` to join `ReturnRequest` + `CreditNote` + `Refund` and rename it, or add a new `returns` tab. Backend can already produce all three.
7. **(Phase 4)** Surface `Refund` rows (not just `CreditNote`) — the model exists, the UI ignores it.
8. **(Phase 5 — needs design sign-off, see §6 below)** Real model for Settlements (gateway payouts) and COD collections. Without it, Settlements and COD remain cosmetic.
9. **(Phase 5)** Decide if `reconciliation` is its own tab or merged into `settlements`, and align tier (Enterprise today vs Pro in spec).
10. **(Phase 5 / cross-cutting)** Backend-side per-feature gates beyond `financeModule` if Returns / Settlements / COD really need a higher floor than Pro. Today a Pro tenant can call every finance endpoint, regardless of the frontend tier label.
11. **(Phase 6)** Overview's `outstanding` includes DRAFT invoices. Decide whether it should be `SENT + PARTIALLY_PAID + OVERDUE` only.
12. **(Cross-cutting)** Money units. Spec says minor units; DB stores major units (`Decimal(12,2)`). Don't migrate the schema as part of this work — adopt a convention at the API boundary or accept the existing major-unit contract and document it.

---

## 6. Items that need sign-off before any Phase 5 code

- **Settlements source of truth**: do we (a) import gateway payouts from Stripe (`/v1/balance_transactions`, `/v1/payouts`) into a new `GatewayPayout` table and match against `Payment.gatewayRef`, or (b) start with manual bank-line CSV import? Recommendation: (a) for Stripe + manual for everything else, since the Stripe service is already in the repo.
- **COD "collected" source of truth**: candidates are (a) a `ShipmentEvent` of type `COD_COLLECTED` emitted by the field/driver app on delivery, or (b) a manual mark in the tenant portal. Recommendation: (a) — `ShipmentEvent` already exists and the driver app already writes events. Auto-create a `Payment(method='CASH', status=COMPLETED, shipmentId)` when that event lands; manual marking is the override.
- **Invoice state machine**: confirm `DRAFT → SENT → (PARTIALLY_PAID|PAID|OVERDUE) → VOID`. Today `/pay` is callable from any state and `/void` is blocked only when already PAID. The "Paid toggle" needs an explicit rule.
- **`reconciliation` tier**: Enterprise (current code) or Pro (spec)?
- **"Returns" tab**: repurpose `refunds`, or add a new `returns` tab next to it?

---

## 7. What is NOT in this audit (so we don't drift)

- No proposed file/folder layout for Phases 2+ — that belongs in the implementation plan once Phase 0 is signed off.
- No changes to schema or routes were made. This is read-only.
