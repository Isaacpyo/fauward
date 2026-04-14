# Feature Additions — TrenyConnect Audit

> **Source:** Cross-referenced against the TrenyConnect admin console — a production logistics platform built by the same team. Every feature here was confirmed present in TrenyConnect and absent (or underspecified) in Fauward's base spec.
>
> Build these **after** completing Priorities 1–15 in [Implementation Status](./implementation-status.md).

**Navigation →** [Implementation Status](./implementation-status.md) · [← README](../README.md)

---

## Contents

1. [Returns Management](#1-returns-management)
2. [Support Ticket System](#2-support-ticket-system)
3. [Email Template Management](#3-email-template-management)
4. [Tenant Pricing System](#4-tenant-pricing-system)
5. [QR Code Scanning in Driver App](#5-qr-code-scanning-in-driver-app)
6. [In-App Notification Center](#6-in-app-notification-center)
7. [Activity Timeline](#7-activity-timeline)
8. [Analytics Enhancements](#8-analytics-enhancements)
9. [Dedicated Reports Page](#9-dedicated-reports-page)
10. [Live Operational Map](#10-live-operational-map)
11. [Fleet & Vehicle Management](#11-fleet--vehicle-management)
12. [POD Viewer for Staff](#12-pod-viewer-for-staff)
13. [Inline Status Updates in Shipment Table](#13-inline-status-updates-in-shipment-table)
14. [Individual User Suspension](#14-individual-user-suspension)
15. [Performance Patterns](#15-performance-patterns)
16. [Build Order Summary](#16-build-order-summary)

---

## 1. Returns Management

> **Priority 16** — Not in base spec. Must add.

A full reverse-logistics workflow for recipients returning shipments.

### State Machine

```
REQUESTED → APPROVED → LABEL_ISSUED → PICKED_UP → IN_HUB → RECEIVED → REFUNDED → RESOLVED
                                                                              ↘ REJECTED
```

### Database

```prisma
enum ReturnStatus {
  REQUESTED
  APPROVED
  LABEL_ISSUED
  PICKED_UP
  IN_HUB
  RECEIVED
  REFUNDED
  RESOLVED
  REJECTED
}

enum ReturnReason {
  WRONG_ITEM
  DAMAGED
  NOT_AS_DESCRIBED
  NO_LONGER_NEEDED
  REFUSED_DELIVERY
  OTHER
}

model ReturnRequest {
  id             String       @id @default(uuid()) @db.Uuid
  tenantId       String       @db.Uuid
  shipmentId     String       @db.Uuid
  customerId     String       @db.Uuid
  organisationId String?      @db.Uuid
  status         ReturnStatus @default(REQUESTED)
  reason         ReturnReason
  notes          String?
  returnLabel    String?       // S3 URL for return label PDF
  handledBy      String?      @db.Uuid
  approvedAt     DateTime?
  receivedAt     DateTime?
  resolvedAt     DateTime?
  refundedAt     DateTime?
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  tenant       Tenant        @relation(fields: [tenantId], references: [id])
  shipment     Shipment      @relation(fields: [shipmentId], references: [id])
  customer     User          @relation(fields: [customerId], references: [id])
  organisation Organisation? @relation(fields: [organisationId], references: [id])
}
```

Also add `returnRequests ReturnRequest[]` to `Shipment` and `User` models.

### Backend — `modules/returns/returns.routes.ts`

```
GET    /api/v1/returns                ↳ list; filter by status; pagination
POST   /api/v1/returns                ↳ customer creates; validates shipment is DELIVERED + belongs to them
GET    /api/v1/returns/:id            ↳ detail with shipment summary
PATCH  /api/v1/returns/:id/approve    ↳ generate return label PDF; email customer
PATCH  /api/v1/returns/:id/reject     ↳ body: { reason }; email customer
PATCH  /api/v1/returns/:id/status     ↳ advance lifecycle; validate transition
POST   /api/v1/returns/:id/refund     ↳ mark REFUNDED; link to Payment refund; roles: T_ADMIN, T_FINANCE
```

Register in `app.ts`: `await registerReturnsRoutes(app)`

### Tenant Portal UI

- `pages/returns/ReturnsListPage.tsx` — table with status filter
- `pages/returns/ReturnDetailPage.tsx` — shipment card, timeline, approve/reject, label download, refund action
- Customer-facing: "Request Return" button on delivered shipment detail → modal with reason selector

**Email notifications:**

| Event | Recipients |
|-------|-----------|
| REQUESTED | TENANT_ADMIN + TENANT_MANAGER |
| APPROVED | Customer (with return label attached) |
| REJECTED | Customer (with reason) |
| RECEIVED | Customer (confirming receipt) |
| REFUNDED | Customer |

---

## 2. Support Ticket System

> **Priority 17** — Completely absent from base spec. Must add.

Customers raise tickets with the logistics business (the *tenant*) from inside the portal. This is **not** Fauward's own support — it is the tenant's customer support tool.

### Database

```prisma
enum TicketStatus   { OPEN | IN_PROGRESS | WAITING_CUSTOMER | RESOLVED | CLOSED }
enum TicketPriority { LOW | NORMAL | HIGH | URGENT }
enum TicketCategory {
  DELIVERY_ISSUE | PAYMENT_ISSUE | DAMAGED_GOODS | WRONG_ADDRESS
  TRACKING_ISSUE | RETURN_REQUEST | BILLING_QUERY | OTHER
}

model SupportTicket {
  id           String         @id @default(uuid()) @db.Uuid
  tenantId     String         @db.Uuid
  ticketNumber String         @unique   // {TENANT_SLUG}-TKT-{YYYYMM}-{NNNN}
  customerId   String?        @db.Uuid
  shipmentId   String?        @db.Uuid
  subject      String
  category     TicketCategory
  priority     TicketPriority @default(NORMAL)
  status       TicketStatus   @default(OPEN)
  assignedTo   String?        @db.Uuid
  resolvedAt   DateTime?
  closedAt     DateTime?
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt

  tenant   Tenant          @relation(fields: [tenantId], references: [id])
  customer User?           @relation(fields: [customerId], references: [id])
  shipment Shipment?       @relation(fields: [shipmentId], references: [id])
  assignee User?           @relation("TicketAssignee", fields: [assignedTo], references: [id])
  messages TicketMessage[]
}

model TicketMessage {
  id         String   @id @default(uuid()) @db.Uuid
  tenantId   String   @db.Uuid
  ticketId   String   @db.Uuid
  authorId   String   @db.Uuid
  body       String
  isInternal Boolean  @default(false)  // staff-only notes not visible to customer
  createdAt  DateTime @default(now())

  ticket SupportTicket @relation(fields: [ticketId], references: [id])
  author User          @relation(fields: [authorId], references: [id])
}
```

### Backend — `modules/support/support.routes.ts`

```
GET    /api/v1/support/tickets              ↳ filter by status/priority/category/assignedTo; search
POST   /api/v1/support/tickets              ↳ any authenticated user; creates first TicketMessage
GET    /api/v1/support/tickets/:id          ↳ staff sees internal notes; customer sees non-internal only
POST   /api/v1/support/tickets/:id/messages ↳ body: { body, isInternal? }; notifies other party
PATCH  /api/v1/support/tickets/:id          ↳ status, priority, assignedTo; roles: T_ADMIN, T_MGR, T_STAFF
POST   /api/v1/support/tickets/:id/resolve  ↳ mark RESOLVED; email customer
POST   /api/v1/support/tickets/:id/close    ↳ mark CLOSED (no further replies)
```

### Tenant Portal UI

- `pages/support/TicketsListPage.tsx` — table with filter bar (status/priority/category) + search + bulk update
- `pages/support/TicketDetailPage.tsx` — message thread (customer right, staff left, internal notes yellow) + reply area + sidebar controls

Customer-facing: "Get Help" button on shipment detail → pre-filled ticket form with `shipmentId`.

---

## 3. Email Template Management

> **Priority 18** — Fauward sends emails but has no admin UI. Must add.

Tenant admins configure sender settings, toggle templates, and send test emails — without touching code.

### Database

```prisma
model EmailTemplateConfig {
  id            String   @id @default(uuid()) @db.Uuid
  tenantId      String   @db.Uuid
  templateKey   String   // e.g. "booking_confirmed"
  isEnabled     Boolean  @default(true)
  customSubject String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id])
  @@unique([tenantId, templateKey])
}
```

Add to `TenantSettings`: `emailFromName String?`, `emailReplyTo String?`, `opsEmailRecipients String[]`

### Backend routes *(add to `tenant.routes.ts`)*

```
GET    /tenant/email-templates
PATCH  /tenant/email-templates/:key      ↳ enable/disable, custom subject; TENANT_ADMIN only
PATCH  /tenant/email-settings            ↳ fromName, replyTo, opsRecipients
POST   /tenant/email-templates/:key/test ↳ sends test email to requesting user
```

### Full Template Key List

| Key | Trigger | Recipients |
|-----|---------|-----------|
| `booking_confirmed` | Shipment created | Customer |
| `shipment_picked_up` | Status → PICKED_UP | Customer |
| `out_for_delivery` | Status → OUT_FOR_DELIVERY | Customer |
| `delivered` | Status → DELIVERED | Customer |
| `failed_delivery` | Status → FAILED_DELIVERY | Customer |
| `shipment_exception` | Status → EXCEPTION | Customer + TENANT_ADMIN |
| `invoice_sent` | Invoice → SENT | Customer |
| `invoice_overdue` | Daily overdue job | Customer |
| `payment_received` | Payment recorded | Customer |
| `return_approved` | Return → APPROVED | Customer |
| `return_received` | Return → RECEIVED | Customer |
| `return_refunded` | Return → REFUNDED | Customer |
| `ticket_created` | Ticket opened | TENANT_ADMIN + assignee |
| `ticket_reply_from_staff` | Staff reply | Customer |
| `ticket_reply_from_customer` | Customer reply | Assignee / TENANT_ADMIN |
| `ticket_resolved` | Resolved | Customer |
| `staff_invite` | User invited | Invited user |
| `password_reset` | Forgot password | User |
| `trial_expiring` | 3 days before trial end | TENANT_ADMIN |
| `usage_warning_80` | 80% shipment limit | TENANT_ADMIN |
| `usage_limit_reached` | 100% shipment limit | TENANT_ADMIN |
| `ops_new_shipment` | Shipment created | Ops recipients list |

### Tenant Portal UI

Create `pages/settings/EmailSettingsTab.tsx`:
- Global settings card: From Name, Reply-To, Ops Recipients
- Template table: name, description, enabled toggle, custom subject input, "Send test" button

---

## 4. Tenant Pricing System

> **Priority 19** — Base spec has hardcoded multipliers. Must replace with a fully tenant-configurable system.

### 10-Layer Pricing Engine

```
Layer  1 — Zone lookup        which origin→destination zone pair applies
Layer  2 — Base rate          baseFee + (perKgRate × chargeableWeight)
Layer  3 — Dimensional weight max(actual_kg, volumetricKg)
Layer  4 — Service tier       multiply by tenant-configured tier factor
Layer  5 — Surcharges         stack of enabled surcharge rules
Layer  6 — Insurance          tenant-configured insurance tier
Layer  7 — Weight discounts   bulk/heavy shipment discount tiers
Layer  8 — Dynamic rules      priority-ordered conditional overrides
Layer  9 — Promo code         final discount after all rules
Layer 10 — Tax                VAT/GST at tenant's configured rate
```

> The engine returns a **full price breakdown** — every layer's contribution — so customers and staff see exactly how the total was calculated.

---

### 4.1 Service Zones *(schema already exists)*

```
GET/POST/PATCH/DELETE  /api/v1/pricing/zones
  POST body: { name, zoneType: NATIONAL|INTERNATIONAL|REGIONAL, description }
  DELETE: only if no active rate cards reference the zone
```

---

### 4.2 Rate Cards *(schema already exists)*

```
GET/POST/PATCH/DELETE  /api/v1/pricing/rate-cards
PATCH  /pricing/rate-cards/:id/activate      ↳ deactivates others for same zone pair + tier
POST   /pricing/rate-cards/:id/duplicate     ↳ clone with new name + effectiveFrom
GET    /pricing/rate-cards/matrix            ↳ zone×zone grid: { zones, matrix }
POST   /pricing/rate-cards/matrix/import     ↳ CSV bulk import
```

**Tenant-controlled fields:** `baseFee`, `perKgRate`, `minCharge`, `maxCharge`, `currency`, `effectiveFrom`, `effectiveTo`, `serviceTier`

---

### 4.3 Service Tier Configuration *(currently hardcoded — must fix)*

Add `serviceTierConfig Json` to `TenantSettings`. Default:

```json
{
  "STANDARD":  { "label": "Standard",  "multiplier": 1.0, "description": "3-5 business days", "isEnabled": true },
  "EXPRESS":   { "label": "Express",   "multiplier": 1.6, "description": "Next business day",  "isEnabled": true },
  "OVERNIGHT": { "label": "Overnight", "multiplier": 2.2, "description": "By 9am next day",    "isEnabled": false }
}
```

Backend: `PATCH /pricing/service-tiers` — validates at least one tier is enabled.

> The pricing engine reads `tenant.settings.serviceTierConfig[tier].multiplier` — **never a hardcoded constant**.

---

### 4.4 Surcharge Configuration *(currently hardcoded — must fix)*

```prisma
enum SurchargeType      { PERCENT_OF_BASE | PERCENT_OF_TOTAL | FLAT_FEE | PER_KG }
enum SurchargeCondition { ALWAYS | OVERSIZE | OVERWEIGHT | REMOTE_AREA | RESIDENTIAL | DANGEROUS_GOODS | FUEL | PEAK_SEASON }

model Surcharge {
  id                  String            @id @default(uuid()) @db.Uuid
  tenantId            String            @db.Uuid
  name                String
  description         String?
  type                SurchargeType
  condition           SurchargeCondition
  value               Decimal           @db.Decimal(10, 4)
  threshold           Decimal?          @db.Decimal(10, 2)
  peakFrom            DateTime?
  peakTo              DateTime?
  isEnabled           Boolean           @default(true)
  isVisibleToCustomer Boolean           @default(true)
  createdAt           DateTime          @default(now())
  updatedAt           DateTime          @updatedAt
  tenant Tenant @relation(fields: [tenantId], references: [id])
}
```

```
GET/POST/PATCH/DELETE  /pricing/surcharges
PATCH                  /pricing/surcharges/:id/toggle
```

**Default surcharges seeded on tenant creation (all disabled):**
Fuel · Oversize (threshold 120 cm) · Remote Area · Dangerous Goods · Residential · Peak Season

---

### 4.5 Dimensional (Volumetric) Weight *(currently ignored — must fix)*

Add `dimensionalDivisor Int @default(5000)` to `TenantSettings` (road: 5000, air: 6000).

```typescript
const chargeableKg = Math.max(
  item.weightKg,
  (item.lengthCm * item.widthCm * item.heightCm) / dimDivisor
);
```

`StepService.tsx` shows: Actual weight · Volumetric weight · **Chargeable weight** (highlighted).

---

### 4.6 Insurance Configuration *(currently 2% hardcoded — must fix)*

Add `insuranceConfig Json` to `TenantSettings`:

```json
{
  "tiers": [
    { "key": "NONE",     "label": "No Insurance",    "type": "NONE",               "enabled": true  },
    { "key": "BASIC",    "label": "Basic Cover",     "type": "PERCENT_OF_DECLARED", "rate": 1.5, "minFee": 2.00,  "maxCover": 250,  "enabled": true  },
    { "key": "STANDARD", "label": "Standard Cover",  "type": "PERCENT_OF_DECLARED", "rate": 2.5, "minFee": 5.00,  "maxCover": 1000, "enabled": true  },
    { "key": "PREMIUM",  "label": "Premium Cover",   "type": "PERCENT_OF_DECLARED", "rate": 3.5, "minFee": 15.00, "maxCover": 5000, "enabled": false }
  ]
}
```

Backend: `PATCH /pricing/insurance` — validates NONE tier always exists and is enabled.

---

### 4.7 Weight Discount Tiers *(bulk pricing)*

```prisma
model WeightDiscountTier {
  id            String   @id @default(uuid()) @db.Uuid
  tenantId      String   @db.Uuid
  name          String?
  minWeightKg   Decimal  @db.Decimal(8, 2)
  maxWeightKg   Decimal? @db.Decimal(8, 2)
  discountType  String   @default("PERCENT")
  // PERCENT | FLAT_FEE_REDUCTION | FIXED_PER_KG_OVERRIDE
  discountValue Decimal  @db.Decimal(8, 4)
  isEnabled     Boolean  @default(true)
  createdAt     DateTime @default(now())
  tenant Tenant @relation(fields: [tenantId], references: [id])
}
```

```
GET/POST/PATCH/DELETE  /pricing/weight-tiers
```

Conflict policy: `TenantSettings.weightTierConflictPolicy: 'MOST_SPECIFIC' | 'BEST_FOR_CUSTOMER' | 'FIRST_MATCH'`

---

### 4.8 Dynamic Pricing Rules *(conditional overrides)*

```prisma
enum PricingRuleAction { ADD | SUBTRACT | MULTIPLY | OVERRIDE_TOTAL | OVERRIDE_PER_KG | SET_MIN | SET_MAX }

model PricingRule {
  id          String            @id @default(uuid()) @db.Uuid
  tenantId    String            @db.Uuid
  name        String
  description String?
  isEnabled   Boolean           @default(true)
  priority    Int               @default(100)   // lower = evaluated first
  conditions  Json
  // {
  //   originZoneIds?: string[], destZoneIds?: string[],
  //   serviceTiers?: string[], weightMinKg?: number, weightMaxKg?: number,
  //   valueMinGBP?: number, valueMaxGBP?: number,
  //   customerIds?: string[], organisationIds?: string[],
  //   daysOfWeek?: number[], timeFrom?: string, timeTo?: string,
  //   dateFrom?: string, dateTo?: string
  // }
  action      PricingRuleAction
  actionValue Decimal           @db.Decimal(12, 4)
  stopAfter   Boolean           @default(false)
  createdAt   DateTime          @default(now())
  updatedAt   DateTime          @updatedAt
  tenant Tenant @relation(fields: [tenantId], references: [id])
}
```

```
GET/POST/PATCH/DELETE  /pricing/rules
PATCH                  /pricing/rules/reorder       ↳ body: { orderedIds }
PATCH                  /pricing/rules/:id/toggle
```

**Example rules:**

| Rule | Conditions | Action |
|------|-----------|--------|
| Weekend surcharge | `daysOfWeek: [0, 6]` | MULTIPLY 1.1 |
| Loyal customer discount | `organisationIds: [acme-uuid]` | MULTIPLY 0.85 |
| Express minimum | `serviceTiers: ["EXPRESS"]` | SET_MIN 12.00 |
| Heavy freight override | `weightMinKg: 200` | OVERRIDE_PER_KG 0.42 |

---

### 4.9 Promo Codes

```prisma
enum PromoType { PERCENT_OFF | FIXED_OFF | FREE_INSURANCE | FREE_EXPRESS }

model PromoCode {
  id               String    @id @default(uuid()) @db.Uuid
  tenantId         String    @db.Uuid
  code             String    // uppercase; unique per tenant
  type             PromoType
  value            Decimal   @db.Decimal(10, 2)
  minOrderValue    Decimal?  @db.Decimal(10, 2)
  maxDiscountValue Decimal?  @db.Decimal(10, 2)
  maxUses          Int?
  usedCount        Int       @default(0)
  customerIds      String[]
  isEnabled        Boolean   @default(true)
  expiresAt        DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  tenant    Tenant    @relation(fields: [tenantId], references: [id])
  @@unique([tenantId, code])
}
```

Add `promoCodeId String? @db.Uuid` to `Shipment`.

```
GET/POST/PATCH/DELETE  /pricing/promo-codes
POST                   /pricing/promo-codes/validate   ↳ { code, subtotal, customerId? } → { valid, discountAmount, message }
```

On shipment creation: increment `usedCount` within the same transaction.

---

### 4.10 Tax Configuration *(currently VAT "based on region" — never implemented)*

Add to `TenantSettings`:

```json
{
  "enabled": true,
  "taxName": "VAT",
  "rate": 20,
  "taxNumber": "GB123456789",
  "taxIncluded": false,
  "exemptOrgs": []
}
```

Backend: `PATCH /pricing/tax` — validates `rate` is 0–100.

---

### 4.11 Exchange Rate Management

```
GET   /pricing/currency-rates
POST  /pricing/currency-rates              ↳ manual override: { fromCurrency, toCurrency, rate }
POST  /pricing/currency-rates/refresh      ↳ enqueues Open Exchange Rates API fetch
```

BullMQ repeatable job (daily 06:00 UTC): fetch all rates needed across all tenants.

---

### 4.12 Pricing Settings

`GET/PATCH /pricing/settings`:

```json
{
  "dimensionalDivisor": 5000,
  "roundingMode": "ROUND_HALF_UP",
  "roundingPrecision": 2,
  "defaultCurrency": "GBP",
  "weightTierConflictPolicy": "BEST_FOR_CUSTOMER",
  "quoteValidityMinutes": 30,
  "showPriceBreakdownToCustomer": true,
  "autoInvoiceOnDelivery": true
}
```

---

### 4.13 Pricing Calculator

```
POST /pricing/calculate
  body: { originZoneId, destZoneId, serviceTier, weightKg, lengthCm, widthCm, heightCm,
          declaredValue, insuranceTier, promoCode?, customerId?, date? }
```

Returns full layered breakdown:

```json
{
  "chargeableWeightKg": 6.0,
  "breakdown": [
    { "label": "Base fee",                "amount": 3.50 },
    { "label": "Weight (6.0 kg @ £0.85)", "amount": 5.10 },
    { "label": "Express multiplier (1.6×)","amount": 4.26 },
    { "label": "Fuel Surcharge (3%)",     "amount": 0.39 },
    { "label": "Standard Cover (2.5%)",   "amount": 1.40 },
    { "label": "Weekend booking (+10%)",  "amount": 1.46, "appliedRule": "Weekend Surcharge" },
    { "label": "Promo: SUMMER10 (−10%)",  "amount": -1.60 }
  ],
  "subtotal": 14.51,
  "taxRate": 20,
  "taxAmount": 2.90,
  "total": 17.41,
  "currency": "GBP",
  "quoteExpiresAt": "2026-04-06T15:32:00Z"
}
```

`StepService.tsx` calls this endpoint live as inputs change — **debounced 400 ms**.

---

### 4.14 Pricing Module Structure

```
apps/backend/src/modules/pricing/
├── pricing.routes.ts        register all pricing routes
├── zones.routes.ts
├── rate-cards.routes.ts
├── surcharges.routes.ts
├── rules.routes.ts
├── promo-codes.routes.ts
├── weight-tiers.routes.ts
├── pricing.service.ts       the calculate() function — all 10 layers
└── pricing.schema.ts        Zod validation schemas
```

Register in `app.ts`: `await registerPricingRoutes(app)`

> All pricing routes require `requireRole(['TENANT_ADMIN', 'TENANT_MANAGER'])` **except:**
> - `POST /pricing/calculate` — any authenticated user (staff use it for quoting)
> - `POST /pricing/promo-codes/validate` — any authenticated user (customers use it at booking)

---

### 4.15 Pricing Admin UI

Create `apps/tenant-portal/src/pages/pricing/` — all under a "Pricing" top-level nav section:

| Page | Purpose |
|------|---------|
| `PricingOverviewPage.tsx` | Summary cards + quick links + calculator shortcut |
| `ZonesPage.tsx` | Zone table + add/edit modal |
| `RateCardsPage.tsx` | Grid view (zone×zone) + list view + CSV import + duplicate |
| `ServiceTiersPage.tsx` | Per-tier label/multiplier/description + live price preview |
| `SurchargesPage.tsx` | Surcharge table + add/edit modal + "Seed defaults" button |
| `InsurancePage.tsx` | Expandable tier cards + preview table |
| `WeightTiersPage.tsx` | Weight band table + conflict policy selector |
| `PricingRulesPage.tsx` | Drag-to-reorder list (`@dnd-kit/sortable`) + conditions builder modal |
| `PromoCodesPage.tsx` | Code table + usage bars + add/edit modal |
| `TaxPage.tsx` | Tax toggle/name/rate/number/included/exempt-orgs |
| `CurrencyRatesPage.tsx` | Rates table + override + refresh all |
| `PricingSettingsPage.tsx` | Dimensional divisor, rounding, quote validity, breakdown visibility |
| `PricingCalculatorPage.tsx` | Quote test tool + full breakdown + "Save as quote" button |

---

## 5. QR Code Scanning in Driver App

> **Priority 20** — Driver app has no QR scanning. Must add.

**Component:** `apps/agents/src/components/agent/QRScanner.tsx`
- Library: `@zxing/browser`
- Continuous camera decode, crosshair overlay, torch/flash toggle
- Camera permission denied → fallback to manual text input
- Add "Scan" button to `RoutePage.tsx` header — finds matching stop, navigates to `StopDetailPage`
- Add scan to `CapturePODPage.tsx` to confirm correct package before capturing POD

**Shipping labels:** Add QR code (`qrcode` npm package) to `documents.service.ts` — encode tracking number as base64 PNG, embed in label HTML.

**Backend — `modules/documents/label.routes.ts`:**

```
GET /api/v1/label/:trackingNumber
  ↳ HTML / PDF optimised for thermal printer (100mm × 150mm)
  ↳ includes: tenant logo, tracking number (large mono), QR (128×128 px),
              sender/recipient addresses, service tier badge, weight, handling instructions
  ↳ @media print CSS removes UI chrome
```

---

## 6. In-App Notification Center

> **Priority 22** — Email/SMS notifications exist but no in-app panel. Must add.

### Database

```prisma
model InAppNotification {
  id        String   @id @default(uuid()) @db.Uuid
  tenantId  String   @db.Uuid
  userId    String   @db.Uuid
  type      String
  // "shipment_exception" | "return_requested" | "ticket_opened"
  // "usage_warning" | "payment_failed" | "quote_accepted"
  title     String
  body      String?
  link      String?
  isRead    Boolean  @default(false)
  readAt    DateTime?
  createdAt DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id])
  user   User   @relation(fields: [userId], references: [id])
}
```

### Backend

```
GET    /api/v1/notifications              ↳ list for current user; limit 50
PATCH  /api/v1/notifications/:id/read
POST   /api/v1/notifications/read-all
GET    /api/v1/notifications/unread-count ↳ returns { count: number } — polled every 30 s
```

**When to create in-app notifications (in addition to email):**

| Event | Notify |
|-------|--------|
| Shipment → EXCEPTION | TENANT_ADMIN + TENANT_MANAGER |
| Return request created | TENANT_ADMIN + TENANT_MANAGER |
| Support ticket opened | TENANT_ADMIN + assignedTo |
| Ticket reply from customer | assignedTo |
| Usage at 80% / 100% | TENANT_ADMIN |
| Payment failed | TENANT_ADMIN |
| Quote accepted | assignedTo (sales rep) |

### Tenant Portal UI

Create `components/shared/NotificationCenter.tsx`:
- Bell icon in `TopBar.tsx` with unread count badge (red dot)
- Unread count polled every 30 s (`refetchInterval: 30000`)
- Dropdown panel (max 400 px tall, scrollable): icon by type, title, body, relative timestamp, unread dot, link on click
- "Mark all read" button, "No notifications" empty state

---

## 7. Activity Timeline

> **Priority 23** — Per-shipment timelines exist; no unified cross-entity stream. Must add.

### Backend

```
GET /api/v1/activity?timeframe=1h|24h|7d|30d&type=shipment|return|ticket|invoice|audit
```

UNION query across multiple tables, ordered by timestamp DESC, limit 100:

| Source table | Type |
|-------------|------|
| `shipment_events` | `shipment` |
| `audit_log` | `audit` |
| `return_requests.updatedAt` | `return` |
| `support_ticket messages.createdAt` | `ticket` |
| `invoices.sentAt` / `paidAt` | `invoice` |

Returns unified schema:
```typescript
interface ActivityItem {
  id:        string;
  type:      'shipment' | 'return' | 'ticket' | 'invoice' | 'audit';
  title:     string;    // e.g. "Shipment FWD-202506-A3F9K2 delivered"
  subtitle:  string;    // e.g. "By driver James O."
  link:      string;    // "/shipments/uuid"
  timestamp: string;    // ISO 8601
  icon:      string;    // icon name hint
  colour:    string;    // semantic colour hint
}
```

### Tenant Portal UI

`pages/activity/ActivityTimelinePage.tsx`:
- Time filter: 1h · 24h · 7d · 30d
- Type filter pills: All · Shipments · Returns · Tickets · Invoices · Audit
- Vertical timeline: icon + title + subtitle + relative timestamp
- Auto-refresh every 60 s, skeleton loading on initial render

---

## 8. Analytics Enhancements

> **Priority 24** — Current analytics are basic aggregates with hardcoded zeros. Must add.

### 8.1 Shipment Lifecycle Funnel

Add `lifecycleFunnel` to `GET /analytics/shipments`:

```json
[
  { "status": "PENDING",          "count": 1200, "pct": 100 },
  { "status": "PROCESSING",       "count": 1150, "pct": 96  },
  { "status": "PICKED_UP",        "count": 1100, "pct": 92  },
  { "status": "IN_TRANSIT",       "count": 1050, "pct": 88  },
  { "status": "OUT_FOR_DELIVERY", "count": 980,  "pct": 82  },
  { "status": "DELIVERED",        "count": 910,  "pct": 76  },
  { "status": "FAILED_DELIVERY",  "count": 70,   "pct": 6   },
  { "status": "RETURNED",         "count": 20,   "pct": 2   }
]
```

### 8.2 KPI Trend Indicators

All KPIs in `GET /analytics/full` must include previous-period comparison:

```json
{
  "totals": {
    "shipments":       { "value": 450,  "previousValue": 380,  "changePct": 18.4  },
    "revenue":         { "value": 12400,"previousValue": 10200, "changePct": 21.6  },
    "onTimeRate":      { "value": 94.2, "previousValue": 91.0,  "changePct": 3.5   },
    "avgDeliveryDays": { "value": 2.3,  "previousValue": 2.7,   "changePct": -14.8 }
  }
}
```

Accept `dateFrom` + `dateTo`; compute previous period as same duration before `dateFrom`.

### 8.3 SLA Compliance

Add `slaCompliance` to `GET /analytics/shipments`:

```json
{
  "onTime": 910, "late": 70, "compliancePct": 92.8, "avgDeliveryHours": 26.4,
  "breachesByReason": [
    { "reason": "FAILED_DELIVERY", "count": 40 },
    { "reason": "EXCEPTION",       "count": 30 }
  ]
}
```

SLA definition: on-time if first `DELIVERED` event ≤ `tenant.slaDeliveryHours` after `PROCESSING`.
Add `slaDeliveryHours Int @default(72)` to `TenantSettings`.

### 8.4 Risk / Exceptions Panel

Add `exceptions` to analytics response:

```json
{
  "activeExceptions": 12,
  "stalePendingOver24h": 5,
  "failedDeliveryRate": 4.2,
  "topExceptionRoutes": [{ "route": "Lagos → Abuja", "count": 8 }]
}
```

### 8.5 Animated KPI Cards *(Priority 25)*

Create `components/ui/AnimatedNumber.tsx` — `requestAnimationFrame` count-up animation over 600 ms. Apply to all KPI stat values in `AnalyticsPage.tsx`.

---

## 9. Dedicated Reports Page

> **Priority 26** — Fauward mentions CSV export but has no structured reports page. Must add.

### Backend

```
GET /api/v1/reports/shipments   ↳ params: dateFrom, dateTo, format=csv|json|pdf, status[], driverId, customerId
GET /api/v1/reports/revenue
GET /api/v1/reports/returns
GET /api/v1/reports/tickets
GET /api/v1/reports/staff
GET /api/v1/reports/customers
```

CSV response: `Content-Type: text/csv` + `Content-Disposition: attachment; filename="fauward-report-{type}-{date}.csv"` → stream rows.

### Tenant Portal UI

`pages/reports/ReportsPage.tsx`:
- Report type selector: Shipments · Revenue · Returns · Tickets · Staff Performance · Customers
- Date range presets: Today · Yesterday · Last 7 d · Last 30 d · Last 90 d · Custom
- Export format: CSV · JSON · PDF
- "Generate Report" → triggers download with loading state
- "Scheduled Reports" *(Pro+)*: daily / weekly / monthly email to recipient list

---

## 10. Live Operational Map *(Pro+)*

> **Priority 27** — Google Maps referenced for routing, but no live ops map. Must add.

### Backend

```
GET   /driver/locations    ↳ all drivers + last known location; T_ADMIN/T_MGR only
PATCH /driver/location     ↳ { lat, lng, accuracy }; driver sends every 60 s; Redis TTL 5 min
GET   /shipments/live-map  ↳ IN_TRANSIT + OUT_FOR_DELIVERY shipments with last location event
```

### Tenant Portal UI

`pages/operations/LiveMapPage.tsx` (Pro+ gated, `@vis.gl/react-google-maps`):
- Full-width Google Maps instance
- Driver markers with click-info card (name, vehicle, stops remaining)
- Shipment cluster markers (expand on click)
- Filter sidebar: by driver, by status, by route
- Live refresh every 60 s

---

## 11. Fleet & Vehicle Management

> **Priority 28** — `Driver` and `Vehicle` models exist in schema but have no routes or UI. Must add.

### Backend — `modules/fleet/fleet.routes.ts`

```
GET/POST/PATCH/DELETE  /fleet/vehicles
  POST body: { registration, type, capacityKg, capacityM3, make, model }

GET/POST/PATCH         /fleet/drivers
  POST body: { userId, licenceNumber, vehicleId }
  ↳ creates driver profile for an existing TENANT_DRIVER user
```

Register in `app.ts`: `await registerFleetRoutes(app)`

### Tenant Portal UI

`pages/fleet/FleetPage.tsx` — tabs:
- **Drivers:** table with today's stats (stops assigned/completed/on-time), vehicle, availability toggle
- **Vehicles:** registration, type, capacity, assigned driver, edit/delete

---

## 12. POD Viewer for Staff

> **Priority 29** — POD capture works in driver app but staff cannot view it. Must add.

In `ShipmentDetailPage.tsx` → Documents tab, add "Proof of Delivery" section when `status === 'DELIVERED'`:
- Photo thumbnails (click → full-screen lightbox)
- Signature image (300×150 px with border)
- Recipient name · delivery notes · captured timestamp · driver name
- "Download POD" button

Create `components/shipments/PODViewer.tsx`.

**Backend:**

```
GET  /shipments/:id/pod              ↳ { podAssets, recipientName, deliveredAt, capturedBy }
POST /documents/pod/:shipmentId      ↳ generate one-page PDF → return signed URL
```

---

## 13. Inline Status Updates in Shipment Table

> **Priority 30** — `ShipmentTable.tsx` exists but has no inline row actions. Must add.

In `components/shipments/ShipmentTable.tsx`:
- "Status" dropdown per row showing valid next states (same `ALLOWED_TRANSITIONS` as detail page)
- → DELIVERED: show mini POD modal inline (photo + recipient name) before confirming
- → FAILED_DELIVERY: show inline reason selector
- Inline "Assign Driver" dropdown for unassigned PROCESSING rows
- On confirm: `PATCH /shipments/:id/status` → optimistic row refresh

> **Performance rule:** Use a single shared lazy-mounted popover. Do not render all option sets for every row simultaneously.

---

## 14. Individual User Suspension

> **Priority 31** — Tenant-level suspension exists. User-level `isActive` field exists but is not wired. Must add.

### Backend *(add to `users.routes.ts`)*

```
PATCH /users/:id/suspend    ↳ set isActive=false; TENANT_ADMIN only; cannot suspend self; audit log
PATCH /users/:id/activate   ↳ set isActive=true; TENANT_ADMIN only
```

In `authenticate.ts`, after JWT verification:

```typescript
if (!user.isActive) {
  return reply.code(401).send({ error: 'Account suspended', code: 'USER_SUSPENDED' });
}
```

> Suspended users lose access on their next request (within 15 minutes at most — current access token TTL).

### Tenant Portal UI *(in `TeamPage.tsx`)*

- Status column: "Active" / "Suspended" badge
- Three-dot menu: Change Role · **Suspend** · **Activate** · Remove
- Suspend confirmation dialog: *"This user will immediately lose access. Continue?"*

---

## 15. Performance Patterns

> **Priority 32** — Present in TrenyConnect; required for acceptable performance at scale.

### Lazy Tab Loading

```typescript
// Only mount tab content when that tab is first visited
const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(['timeline']));

// On tab click:
setVisitedTabs(prev => new Set([...prev, tabId]));

// Render:
{visitedTabs.has(tabId) && <TabContent />}
```

Apply to: `ShipmentDetailPage.tsx`, `TenantDetailTabs.tsx` (super admin), settings page tabs.

### Debounced Search

All filter inputs that trigger API calls must debounce **300 ms**.

Apply to: `ShipmentFilterBar.tsx`, `TicketsListPage.tsx`, `ReturnsListPage.tsx`, `TeamPage.tsx`, super-admin `TenantsListPage.tsx`.

### Virtual Scrolling

Use TanStack Virtual (`@tanstack/react-virtual`) for tables that can exceed 100+ rows.

Apply to: super-admin tenant list · audit log table · queue message list.

### React Query Polling Intervals

| Data | Interval |
|------|:--------:|
| Unread notification count | 30 s |
| Live map driver locations | 60 s |
| Activity timeline | 60 s |
| Queue stats (super admin) | 10 s |
| System health metrics | 15 s |

---

## 16. Build Order Summary

Build these **after** completing Priorities 1–15 in [Implementation Status](./implementation-status.md).

| Priority | Feature | Key New Files | DB Changes |
|:--------:|---------|---------------|------------|
| **16** | Returns management | `modules/returns/`, `pages/returns/*.tsx` | `ReturnRequest` model + enums |
| **17** | Support tickets | `modules/support/`, `pages/support/*.tsx` | `SupportTicket`, `TicketMessage` + enums |
| **18** | Email template admin | `pages/settings/EmailSettingsTab.tsx`, routes in `tenant.routes.ts` | `EmailTemplateConfig`; add fields to `TenantSettings` |
| **19** | Full tenant pricing system | `modules/pricing/` (entire), `pages/pricing/` (13 pages) | `Surcharge`, `PricingRule`, `PromoCode`, `WeightDiscountTier`; JSON fields on `TenantSettings` |
| **20** | QR scanning in driver app | `components/driver/QRScanner.tsx` | Install `@zxing/browser` |
| **21** | Shipping label print page | `modules/documents/label.routes.ts`, `templates/label.html` | Install `qrcode` |
| **22** | In-app notification center | `components/shared/NotificationCenter.tsx`, notification routes | `InAppNotification` model |
| **23** | Activity timeline | `pages/activity/ActivityTimelinePage.tsx`, `GET /analytics/activity` | None |
| **24** | Analytics enhancements | Update `analytics.routes.ts` | Add `slaDeliveryHours` to `TenantSettings` |
| **25** | Animated KPI cards | `components/ui/AnimatedNumber.tsx` | None |
| **26** | Dedicated reports page | `pages/reports/ReportsPage.tsx`, `GET /reports/*` routes | None |
| **27** | Live operational map | `pages/operations/LiveMapPage.tsx`, driver location routes | None (Redis only) |
| **28** | Fleet & vehicle management | `modules/fleet/`, `pages/fleet/FleetPage.tsx` | None (`Driver`/`Vehicle` already in schema) |
| **29** | POD viewer for staff | `components/shipments/PODViewer.tsx`, `POST /documents/pod/:id` | None |
| **30** | Inline status update in shipment table | Update `ShipmentTable.tsx` | None |
| **31** | Individual user suspension | `PATCH /users/:id/suspend` + `/activate`; update `authenticate.ts` | None (`isActive` exists) |
| **32** | Performance patterns | `ShipmentDetailPage.tsx`, `ShipmentFilterBar.tsx`, super-admin tables | None |

---

*Part of the [Fauward documentation](../README.md)*
