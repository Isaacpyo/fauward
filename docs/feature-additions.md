# Fauward — Feature Additions from TrenyConnect Audit

> **Source:** Cross-referenced against the TrenyConnect admin console (a production logistics platform built by the same team). Every feature in this document was present in TrenyConnect, confirmed absent or underspecified in Fauward's existing spec, and is directly applicable to Fauward's use case. All of these must be implemented.
>
> Build these **after** completing all Priority 1–15 items in [implementation-status.md](./implementation-status.md).

---

## 25.1 Returns Management (Reverse Logistics)

**Status: Not in Fauward spec at all. Must add.**

A full reverse-logistics workflow for when a recipient wants to return a shipment.

### Return Status Machine

```
REQUESTED → APPROVED → LABEL_ISSUED → PICKED_UP → IN_HUB → RECEIVED → REFUNDED → RESOLVED
                                                                               ↘ REJECTED
```

### Database

Add to `apps/backend/prisma/schema.prisma`:

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
  id              String        @id @default(uuid()) @db.Uuid
  tenantId        String        @db.Uuid
  shipmentId      String        @db.Uuid
  customerId      String        @db.Uuid
  organisationId  String?       @db.Uuid
  status          ReturnStatus  @default(REQUESTED)
  reason          ReturnReason
  notes           String?
  returnLabel     String?       // S3 URL for return label PDF
  handledBy       String?       @db.Uuid
  approvedAt      DateTime?
  receivedAt      DateTime?
  resolvedAt      DateTime?
  refundedAt      DateTime?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  tenant        Tenant        @relation(fields: [tenantId], references: [id])
  shipment      Shipment      @relation(fields: [shipmentId], references: [id])
  customer      User          @relation(fields: [customerId], references: [id])
  organisation  Organisation? @relation(fields: [organisationId], references: [id])
}
```

Also add `returnRequests ReturnRequest[]` relation to `Shipment` and `User` models.

### Backend — Create `apps/backend/src/modules/returns/returns.routes.ts`

```
GET    /api/v1/returns              — list returns for tenant; filter by status; pagination
POST   /api/v1/returns              — customer creates return request; body: { shipmentId, reason, notes }; validates shipment is DELIVERED and belongs to requesting customer; status=REQUESTED
GET    /api/v1/returns/:id          — return detail with shipment summary
PATCH  /api/v1/returns/:id/approve  — staff approves; status=APPROVED; generate return label PDF; email customer with label; roles: TENANT_ADMIN, TENANT_MANAGER, TENANT_STAFF
PATCH  /api/v1/returns/:id/reject   — staff rejects; body: { reason }; email customer; roles: same as approve
PATCH  /api/v1/returns/:id/status   — advance status (LABEL_ISSUED → PICKED_UP → IN_HUB → RECEIVED → RESOLVED); validate transition
POST   /api/v1/returns/:id/refund   — mark REFUNDED; links to payment refund; roles: TENANT_ADMIN, TENANT_FINANCE
```

Register in `app.ts` as `await registerReturnsRoutes(app)`.

### Tenant Portal UI

Create `apps/tenant-portal/src/pages/returns/`:
- `ReturnsListPage.tsx` — Returns table: tracking number, customer, reason, status badge, created date. Filter by status.
- `ReturnDetailPage.tsx` — Return detail: shipment summary card, return reason, status timeline, approve/reject buttons, return label download, refund action.

Customer-facing: In the customer shipment detail view (when status=DELIVERED), show "Request Return" button → modal with reason selector + notes.

Add "Returns" nav item to `layouts/navigation.ts` for TENANT_ADMIN, TENANT_MANAGER, TENANT_STAFF.

**Notifications on return events:**
- On REQUESTED: email to TENANT_ADMIN/TENANT_MANAGER
- On APPROVED: email to customer with return label attachment
- On REJECTED: email to customer with reason
- On RECEIVED: email to customer confirming receipt
- On REFUNDED: email to customer

---

## 25.2 Support Ticket System

**Status: Completely absent from Fauward spec. Must add.**

Customers raise support tickets with the logistics business (tenant) directly inside the platform. This is the tenant's customer support tool — not Fauward's own support.

### Database

```prisma
enum TicketStatus {
  OPEN
  IN_PROGRESS
  WAITING_CUSTOMER
  RESOLVED
  CLOSED
}

enum TicketPriority {
  LOW
  NORMAL
  HIGH
  URGENT
}

enum TicketCategory {
  DELIVERY_ISSUE
  PAYMENT_ISSUE
  DAMAGED_GOODS
  WRONG_ADDRESS
  TRACKING_ISSUE
  RETURN_REQUEST
  BILLING_QUERY
  OTHER
}

model SupportTicket {
  id             String         @id @default(uuid()) @db.Uuid
  tenantId       String         @db.Uuid
  ticketNumber   String         @unique  // {TENANT_SLUG}-TKT-{YYYYMM}-{4DIGIT}
  customerId     String?        @db.Uuid
  shipmentId     String?        @db.Uuid
  subject        String
  category       TicketCategory
  priority       TicketPriority @default(NORMAL)
  status         TicketStatus   @default(OPEN)
  assignedTo     String?        @db.Uuid
  resolvedAt     DateTime?
  closedAt       DateTime?
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  tenant    Tenant          @relation(fields: [tenantId], references: [id])
  customer  User?           @relation(fields: [customerId], references: [id])
  shipment  Shipment?       @relation(fields: [shipmentId], references: [id])
  assignee  User?           @relation("TicketAssignee", fields: [assignedTo], references: [id])
  messages  TicketMessage[]
}

model TicketMessage {
  id        String   @id @default(uuid()) @db.Uuid
  tenantId  String   @db.Uuid
  ticketId  String   @db.Uuid
  authorId  String   @db.Uuid
  body      String
  isInternal Boolean @default(false)  // internal staff notes not visible to customer
  createdAt DateTime @default(now())

  ticket  SupportTicket @relation(fields: [ticketId], references: [id])
  author  User          @relation(fields: [authorId], references: [id])
}
```

### Backend — Create `apps/backend/src/modules/support/support.routes.ts`

```
GET    /api/v1/support/tickets              — list tickets; filter by status, priority, category, assignedTo; search; pagination; roles: TENANT_ADMIN, TENANT_MANAGER, TENANT_STAFF
POST   /api/v1/support/tickets              — create ticket; body: { subject, category, priority, shipmentId?, message }; generates ticketNumber; creates first TicketMessage
GET    /api/v1/support/tickets/:id          — ticket detail with messages; staff sees internal notes; customer sees only non-internal messages
POST   /api/v1/support/tickets/:id/messages — add reply; body: { body, isInternal? }; notifies other party by email
PATCH  /api/v1/support/tickets/:id          — update status, priority, assignedTo; roles: TENANT_ADMIN, TENANT_MANAGER, TENANT_STAFF
POST   /api/v1/support/tickets/:id/resolve  — mark RESOLVED; email customer
POST   /api/v1/support/tickets/:id/close    — mark CLOSED (no further replies)
```

### Tenant Portal UI

Create `apps/tenant-portal/src/pages/support/`:
- `TicketsListPage.tsx` — Table: ticket number, subject, customer, category, priority badge, status badge, assigned to, created. Filter + search.
- `TicketDetailPage.tsx` — Message thread (customer on right, staff on left, internal notes with yellow background). Reply textarea + "Internal note" toggle. Status + assignee controls in sidebar.

Customer-facing: "Get Help" button on shipment detail → opens new ticket pre-filled with shipmentId.

**Email notifications:**
- On ticket created: email to TENANT_ADMIN + assignedTo; confirmation to customer
- On staff reply: email to customer
- On customer reply: email to assignedTo or TENANT_ADMIN
- On resolved: email to customer

---

## 25.3 Email Template Management (Admin UI)

**Status: Fauward sends emails but has no UI to manage templates. Must add.**

### Database

```prisma
model EmailTemplateConfig {
  id          String  @id @default(uuid()) @db.Uuid
  tenantId    String  @db.Uuid
  templateKey String  // e.g. "booking_confirmed", "invoice_sent"
  isEnabled   Boolean @default(true)
  customSubject String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id])
  @@unique([tenantId, templateKey])
}
```

Also add to `TenantSettings`: `emailFromName String?`, `emailReplyTo String?`, `opsEmailRecipients String[]`.

### Backend

Add to `tenant.routes.ts`:
```
GET    /api/v1/tenant/email-templates              — list all templates with enabled status
PATCH  /api/v1/tenant/email-templates/:key         — enable/disable, set custom subject; roles: TENANT_ADMIN
PATCH  /api/v1/tenant/email-settings               — update fromName, replyTo, opsRecipients
POST   /api/v1/tenant/email-templates/:key/test    — send test email to requesting user; roles: TENANT_ADMIN
```

### Template Keys (all must exist in `email-templates.ts`)

| Key | Trigger | Recipients |
|-----|---------|-----------|
| `booking_confirmed` | Shipment created | Customer |
| `shipment_picked_up` | Status → PICKED_UP | Customer |
| `out_for_delivery` | Status → OUT_FOR_DELIVERY | Customer |
| `delivered` | Status → DELIVERED | Customer |
| `failed_delivery` | Status → FAILED_DELIVERY | Customer |
| `shipment_exception` | Status → EXCEPTION | Customer + TENANT_ADMIN |
| `invoice_sent` | Invoice marked SENT | Customer |
| `invoice_overdue` | Invoice overdue (daily job) | Customer |
| `payment_received` | Payment recorded | Customer |
| `return_approved` | Return → APPROVED | Customer |
| `return_received` | Return → RECEIVED | Customer |
| `return_refunded` | Return → REFUNDED | Customer |
| `ticket_created` | Ticket opened | TENANT_ADMIN + assignee |
| `ticket_reply_from_staff` | Staff replies | Customer |
| `ticket_reply_from_customer` | Customer replies | Assignee / TENANT_ADMIN |
| `ticket_resolved` | Ticket resolved | Customer |
| `staff_invite` | User invited | Invited user |
| `password_reset` | Forgot password | User |
| `trial_expiring` | 3 days before trial end | TENANT_ADMIN |
| `usage_warning_80` | 80% shipment limit | TENANT_ADMIN |
| `usage_limit_reached` | 100% shipment limit | TENANT_ADMIN |
| `ops_new_shipment` | Shipment created | Ops recipients list |

### Tenant Portal UI

Create `apps/tenant-portal/src/pages/settings/EmailSettingsTab.tsx`:
- Global settings card: From Name, Reply-To, Ops Notification Recipients
- Template table: template name, description, toggle enabled/disabled, custom subject input, "Send test" button
- Add "Email" tab to settings navigation

---

## 25.4 Tenant Pricing System (Full Self-Serve Control)

**Status: Fauward has skeletal rate cards with hardcoded multipliers. Must replace with a fully configurable, multi-layer pricing system.**

The pricing system has 10 layers, evaluated in order for every shipment:

```
1. Zone lookup           — which origin→destination zone pair applies
2. Base rate             — base fee + per-kg rate from the matching rate card
3. Dimensional weight    — use max(actual_kg, volumetric_kg) as chargeable weight
4. Service tier          — multiply by tier factor (tenant-configured, not hardcoded)
5. Surcharges            — stack of enabled surcharge rules (oversize, fuel, remote, etc.)
6. Insurance             — tenant-configured insurance tier pricing
7. Weight discount tiers — bulk/heavy shipment discounts by weight band
8. Dynamic rules         — priority-ordered conditional rules (ADD/MULTIPLY/OVERRIDE/MIN/MAX)
9. Promo code            — final discount applied after all rules
10. Tax                  — VAT/GST at tenant's configured rate
```

The output is a **price breakdown** — every layer's contribution is returned so customers and staff see exactly how the price was built.

---

### 25.4.1 Service Zones — Full CRUD

The `service_zones` and `rate_cards` tables already exist in the Prisma schema.

**Backend — `zones.routes.ts`:**
```
GET    /api/v1/pricing/zones
POST   /api/v1/pricing/zones              — { name, zoneType: NATIONAL|INTERNATIONAL|REGIONAL, description }
PATCH  /api/v1/pricing/zones/:id
DELETE /api/v1/pricing/zones/:id          — only if no active rate cards reference it
```

---

### 25.4.2 Rate Cards — Full CRUD

**Backend — `rate-cards.routes.ts`:**
```
GET    /api/v1/pricing/rate-cards
POST   /api/v1/pricing/rate-cards                      — { name, originZoneId, destZoneId, serviceTier, baseFee, perKgRate, currency, effectiveFrom, effectiveTo? }
GET    /api/v1/pricing/rate-cards/:id
PATCH  /api/v1/pricing/rate-cards/:id
DELETE /api/v1/pricing/rate-cards/:id
PATCH  /api/v1/pricing/rate-cards/:id/activate         — set isActive=true; deactivate others for same zone pair + tier
POST   /api/v1/pricing/rate-cards/:id/duplicate        — clone with new name + effectiveFrom
GET    /api/v1/pricing/rate-cards/matrix               — zone×zone matrix: { zones, matrix: Record<originId, Record<destId, RateCard|null>> }
POST   /api/v1/pricing/rate-cards/matrix/import        — CSV bulk import: origin_zone, dest_zone, service_tier, base_fee, per_kg_rate
```

**Rate card fields:** `baseFee`, `perKgRate`, `minCharge`, `maxCharge`, `currency`, `effectiveFrom`, `effectiveTo`, `serviceTier`

---

### 25.4.3 Service Tier Configuration (Tenant-Controlled)

Section 9 hardcodes STANDARD=1.0×, EXPRESS=1.6×, OVERNIGHT=2.2×. These must be tenant-configurable.

Add `serviceTierConfig Json` to `TenantSettings`. Default:
```json
{
  "STANDARD":  { "label": "Standard",  "multiplier": 1.0, "description": "3-5 business days", "isEnabled": true },
  "EXPRESS":   { "label": "Express",   "multiplier": 1.6, "description": "Next business day",  "isEnabled": true },
  "OVERNIGHT": { "label": "Overnight", "multiplier": 2.2, "description": "By 9am next day",    "isEnabled": false }
}
```

Backend: `PATCH /api/v1/pricing/service-tiers` — validates at least one tier is enabled.

The pricing engine reads `tenant.settings.serviceTierConfig[shipment.serviceTier].multiplier` — never a hardcoded constant.

---

### 25.4.4 Surcharge Configuration

Replace hardcoded surcharges with a configurable `Surcharge` table:

```prisma
enum SurchargeType { PERCENT_OF_BASE | PERCENT_OF_TOTAL | FLAT_FEE | PER_KG }
enum SurchargeCondition { ALWAYS | OVERSIZE | OVERWEIGHT | REMOTE_AREA | RESIDENTIAL | DANGEROUS_GOODS | FUEL | PEAK_SEASON }

model Surcharge {
  id           String            @id @default(uuid()) @db.Uuid
  tenantId     String            @db.Uuid
  name         String
  description  String?
  type         SurchargeType
  condition    SurchargeCondition
  value        Decimal           @db.Decimal(10, 4)
  threshold    Decimal?          @db.Decimal(10, 2)
  peakFrom     DateTime?
  peakTo       DateTime?
  isEnabled    Boolean           @default(true)
  isVisibleToCustomer Boolean    @default(true)
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt
  tenant Tenant @relation(fields: [tenantId], references: [id])
}
```

**Backend:**
```
GET/POST/PATCH/DELETE  /api/v1/pricing/surcharges
PATCH                  /api/v1/pricing/surcharges/:id/toggle
```

**Default surcharges seeded on tenant creation (all disabled — tenant must enable):**
- Fuel Surcharge (ALWAYS, PERCENT_OF_BASE, 0%)
- Oversize Fee (OVERSIZE, FLAT_FEE, £0, threshold: 120cm)
- Remote Area Surcharge (REMOTE_AREA, FLAT_FEE, £0)
- Dangerous Goods (DANGEROUS_GOODS, PERCENT_OF_BASE, 0%)
- Residential Delivery (RESIDENTIAL, FLAT_FEE, £0)
- Peak Season (PEAK_SEASON, PERCENT_OF_BASE, 0%)

---

### 25.4.5 Dimensional (Volumetric) Weight

Add `dimensionalDivisor Int @default(5000)` to `TenantSettings` (road/courier: 5000, air: 6000).

Update pricing engine:
```typescript
const totalChargeableKg = shipment.items.reduce((sum, item) =>
  sum + Math.max(item.weightKg, (item.lengthCm * item.widthCm * item.heightCm) / dimDivisor), 0);
```

`StepService.tsx` shows: Actual weight / Volumetric weight / **Chargeable weight** (clearly highlighted).

---

### 25.4.6 Insurance Configuration (Tenant-Priced)

Replace hardcoded 2% insurance with `TenantSettings.insuranceConfig` (Json). Default tiers: NONE / BASIC (1.5%, min £2, max £250) / STANDARD (2.5%, min £5, max £1000) / PREMIUM (3.5%, min £15, max £5000, disabled).

Backend: `PATCH /api/v1/pricing/insurance` — validates NONE tier always exists and is always enabled.

---

### 25.4.7 Weight Discount Tiers (Bulk Pricing)

```prisma
model WeightDiscountTier {
  id           String   @id @default(uuid()) @db.Uuid
  tenantId     String   @db.Uuid
  name         String?
  minWeightKg  Decimal  @db.Decimal(8, 2)
  maxWeightKg  Decimal? @db.Decimal(8, 2)
  discountType String   @default("PERCENT")  // PERCENT | FLAT_FEE_REDUCTION | FIXED_PER_KG_OVERRIDE
  discountValue Decimal @db.Decimal(8, 4)
  isEnabled    Boolean  @default(true)
  createdAt    DateTime @default(now())
  tenant Tenant @relation(fields: [tenantId], references: [id])
}
```

**Backend:** `GET/POST/PATCH/DELETE /api/v1/pricing/weight-tiers`

Conflict policy: `TenantSettings.weightTierConflictPolicy: 'MOST_SPECIFIC' | 'BEST_FOR_CUSTOMER' | 'FIRST_MATCH'`

---

### 25.4.8 Dynamic Pricing Rules (Conditional Overrides)

```prisma
enum PricingRuleAction { ADD | SUBTRACT | MULTIPLY | OVERRIDE_TOTAL | OVERRIDE_PER_KG | SET_MIN | SET_MAX }

model PricingRule {
  id           String            @id @default(uuid()) @db.Uuid
  tenantId     String            @db.Uuid
  name         String
  description  String?
  isEnabled    Boolean           @default(true)
  priority     Int               @default(100)
  conditions   Json
  // { originZoneIds?, destZoneIds?, serviceTiers?, weightMinKg?, weightMaxKg?,
  //   valueMinGBP?, valueMaxGBP?, customerIds?, organisationIds?,
  //   daysOfWeek?, timeFrom?, timeTo?, dateFrom?, dateTo? }
  action       PricingRuleAction
  actionValue  Decimal           @db.Decimal(12, 4)
  stopAfter    Boolean           @default(false)
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt
  tenant Tenant @relation(fields: [tenantId], references: [id])
}
```

**Backend:**
```
GET/POST/PATCH/DELETE  /api/v1/pricing/rules
PATCH                  /api/v1/pricing/rules/reorder    — { orderedIds: string[] }
PATCH                  /api/v1/pricing/rules/:id/toggle
```

Example rules: weekend surcharge (MULTIPLY 1.1), loyal customer discount (MULTIPLY 0.85), express minimum (SET_MIN 12.00).

---

### 25.4.9 Promo Codes

```prisma
enum PromoType { PERCENT_OFF | FIXED_OFF | FREE_INSURANCE | FREE_EXPRESS }

model PromoCode {
  id              String    @id @default(uuid()) @db.Uuid
  tenantId        String    @db.Uuid
  code            String    // uppercase; unique per tenant
  type            PromoType
  value           Decimal   @db.Decimal(10, 2)
  minOrderValue   Decimal?  @db.Decimal(10, 2)
  maxDiscountValue Decimal? @db.Decimal(10, 2)
  maxUses         Int?
  usedCount       Int       @default(0)
  customerIds     String[]
  isEnabled       Boolean   @default(true)
  expiresAt       DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  tenant     Tenant      @relation(fields: [tenantId], references: [id])
  @@unique([tenantId, code])
}
```

Add `promoCodeId String? @db.Uuid` to `Shipment` model.

**Backend:**
```
GET/POST/PATCH/DELETE  /api/v1/pricing/promo-codes
POST                   /api/v1/pricing/promo-codes/validate   — { code, subtotal, customerId? } → { valid, discountAmount, message }
```

On shipment creation, if promoCodeId provided, increment `usedCount` in the same transaction.

---

### 25.4.10 Tax Configuration

Add to `TenantSettings`:
```prisma
taxConfig Json
// { "enabled": true, "taxName": "VAT", "rate": 20, "taxNumber": "GB123456789",
//   "taxIncluded": false, "exemptOrgs": [] }
```

Backend: `PATCH /api/v1/pricing/tax`. Tax is the absolute last step in the pricing engine.

---

### 25.4.11 Exchange Rate Management

**Backend:**
```
GET   /api/v1/pricing/currency-rates
POST  /api/v1/pricing/currency-rates              — manual override: { fromCurrency, toCurrency, rate }
POST  /api/v1/pricing/currency-rates/refresh      — enqueues fetch from Open Exchange Rates API
```

BullMQ repeatable job (daily at 06:00 UTC): fetch all rates needed across all tenants.

---

### 25.4.12 Pricing Settings

`GET/PATCH /api/v1/pricing/settings`:
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

### 25.4.13 Pricing Calculator (Quote Preview Tool)

```
POST /api/v1/pricing/calculate   — { originZoneId, destZoneId, serviceTier, weightKg, lengthCm, widthCm, heightCm, declaredValue, insuranceTier, promoCode?, customerId?, date? }
```

Returns full layered breakdown with subtotal, taxRate, taxAmount, total, quoteExpiresAt.

`StepService.tsx` calls this endpoint live as the user changes inputs — debounced 400ms. Full breakdown in "How is this calculated?" expandable section.

---

### 25.4.14 All Pricing Backend in One Module

Create `apps/backend/src/modules/pricing/`:
```
pricing/
├── pricing.routes.ts        — registers ALL pricing routes
├── zones.routes.ts
├── rate-cards.routes.ts
├── surcharges.routes.ts
├── rules.routes.ts
├── promo-codes.routes.ts
├── weight-tiers.routes.ts
├── pricing.service.ts       — the calculate() function implementing all 10 layers
└── pricing.schema.ts        — Zod validation schemas
```

Register in `app.ts` as `await registerPricingRoutes(app)`.

All pricing routes require `requireRole(['TENANT_ADMIN', 'TENANT_MANAGER'])` except:
- `POST /pricing/calculate` — accessible to any authenticated user
- `POST /pricing/promo-codes/validate` — accessible to any authenticated user

---

### 25.4.15 Pricing Admin UI

Create `apps/tenant-portal/src/pages/pricing/` with these pages under a "Pricing" top-level nav section:

- **`PricingOverviewPage.tsx`** — Summary cards + quick links + calculator shortcut
- **`ZonesPage.tsx`** — Zone table + add/edit modal
- **`RateCardsPage.tsx`** — Grid view (zone×zone matrix) + list view + CSV import + duplicate
- **`ServiceTiersPage.tsx`** — Per-tier label/multiplier/description editor + live preview
- **`SurchargesPage.tsx`** — Surcharge table + add/edit modal + seed defaults button
- **`InsurancePage.tsx`** — Expandable tier cards + preview table + add custom tiers
- **`WeightTiersPage.tsx`** — Weight band table + add/edit + conflict policy selector
- **`PricingRulesPage.tsx`** — Drag-to-reorder rules list + conditions builder modal (`@dnd-kit/sortable`)
- **`PromoCodesPage.tsx`** — Promo code table + usage bars + add/edit modal
- **`TaxPage.tsx`** — Tax toggle/name/rate/number/included toggle/exempt orgs
- **`CurrencyRatesPage.tsx`** — Rates table + override + refresh all
- **`PricingSettingsPage.tsx`** — Dimensional divisor, rounding, quote validity, breakdown visibility
- **`PricingCalculatorPage.tsx`** — Quote test tool with full breakdown + "Save as quote" button

Add "Pricing" to `layouts/navigation.ts` for TENANT_ADMIN, TENANT_MANAGER with all sub-items.

---

## 25.5 QR Code Scanning in Driver App

**Status: Must add.**

Add `apps/driver/src/components/driver/QRScanner.tsx` using `@zxing/browser`:
- Continuous camera decode; crosshair overlay; torch toggle; camera permission error state; manual fallback
- Add "Scan" button to `RoutePage.tsx` — finds matching stop and navigates to `StopDetailPage`
- Add QR scan to `CapturePODPage.tsx` to confirm correct shipment before POD capture
- Install: `@zxing/browser` in `apps/driver/package.json`

**Shipping labels:** Add QR code generation (`qrcode` npm package) to `documents.service.ts` — embed as base64 PNG in label HTML template.

**Backend:** Create `apps/backend/src/modules/documents/label.routes.ts`:
```
GET /api/v1/label/:trackingNumber  — HTML/PDF optimised for thermal printer (100mm × 150mm)
```

Label must include: tenant logo, tracking number (large mono), QR code (128×128px), sender/recipient address, service tier badge, weight, special handling instructions.

---

## 25.6 In-App Notification Center

**Status: No in-app notification panel. Must add.**

### Database

```prisma
model InAppNotification {
  id         String   @id @default(uuid()) @db.Uuid
  tenantId   String   @db.Uuid
  userId     String   @db.Uuid
  type       String   // "shipment_exception" | "return_requested" | "ticket_opened" | "usage_warning" | "payment_failed" etc.
  title      String
  body       String?
  link       String?
  isRead     Boolean  @default(false)
  readAt     DateTime?
  createdAt  DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id])
  user   User   @relation(fields: [userId], references: [id])
}
```

### Backend

```
GET    /api/v1/notifications              — list for current user; limit 50 most recent
PATCH  /api/v1/notifications/:id/read
POST   /api/v1/notifications/read-all
GET    /api/v1/notifications/unread-count — returns { count: number }
```

**When to create in-app notifications:**
- Shipment → EXCEPTION: TENANT_ADMIN + TENANT_MANAGER
- Return request created: TENANT_ADMIN + TENANT_MANAGER
- Support ticket opened: TENANT_ADMIN + assignedTo
- Support ticket reply from customer: assignedTo
- Usage at 80% / 100%: TENANT_ADMIN
- Payment failed: TENANT_ADMIN
- New quote accepted: assignedTo (sales rep)

### Tenant Portal UI

Create `components/shared/NotificationCenter.tsx`:
- Bell icon in TopBar with unread count badge (red dot)
- Unread count polled every 30s (`refetchInterval: 30000`)
- Dropdown panel: icon, title, body, relative timestamp, unread indicator, link on click
- "Mark all read" button, "No notifications" empty state

---

## 25.7 Activity Timeline

**Status: No unified cross-entity activity stream. Must add.**

### Backend

```
GET /api/v1/activity?timeframe=1h|24h|7d|30d&type=shipment|return|ticket|invoice|audit
```

UNION across: `shipment_events`, `audit_log`, `return_requests`, `support_ticket messages`, `invoices (sentAt, paidAt)` — ordered by timestamp DESC, limit 100.

Returns: `{ id, type, title, subtitle, link, timestamp, icon, colour }`

### Tenant Portal UI

Create `pages/activity/ActivityTimelinePage.tsx`:
- Time filter: 1h | 24h | 7d | 30d
- Type filter pills: All | Shipments | Returns | Tickets | Invoices | Audit
- Vertical timeline with icon, title, subtitle, relative timestamp
- Auto-refresh every 60s; skeleton loading

Add "Activity" nav item for TENANT_ADMIN, TENANT_MANAGER.

---

## 25.8 Analytics Enhancements

### 25.8.1 Shipment Lifecycle Funnel

Add `lifecycleFunnel` to `GET /api/v1/analytics/shipments`:
```json
[
  { "status": "PENDING",    "count": 1200, "pct": 100 },
  { "status": "PROCESSING", "count": 1150, "pct": 96 },
  ...
  { "status": "DELIVERED",  "count": 910,  "pct": 76 }
]
```

Use `ShipmentEvent` records to count how many shipments reached each status in the date range.

### 25.8.2 KPI Trend Indicators

All KPIs in `GET /api/v1/analytics/full` must include previous-period comparison:
```json
{
  "totals": {
    "shipments": { "value": 450, "previousValue": 380, "changePct": 18.4 },
    ...
  }
}
```

Accept `dateFrom` + `dateTo` params. Compute previous period as same duration before `dateFrom`.

### 25.8.3 SLA Compliance Tracking

Add `slaCompliance` to `GET /api/v1/analytics/shipments`:
```json
{ "onTime": 910, "late": 70, "compliancePct": 92.8, "avgDeliveryHours": 26.4, "breachesByReason": [...] }
```

SLA: shipment is on-time if first `DELIVERED` event is within `tenant.slaDeliveryHours` of `PROCESSING` event. Add `slaDeliveryHours Int @default(72)` to `TenantSettings`.

### 25.8.4 Risk / Exceptions Panel

Add `exceptions` to analytics response:
```json
{ "activeExceptions": 12, "stalePendingOver24h": 5, "failedDeliveryRate": 4.2, "topExceptionRoutes": [...] }
```

### 25.8.5 Animated KPI Cards

Create `components/ui/AnimatedNumber.tsx` — uses `requestAnimationFrame` to count from 0 to value over 600ms. Apply to all KPI stat values in `AnalyticsPage.tsx`.

---

## 25.9 Dedicated Reports Page

### Backend

```
GET /api/v1/reports/shipments    — CSV/JSON/PDF; params: dateFrom, dateTo, format, status[], driverId, customerId
GET /api/v1/reports/revenue
GET /api/v1/reports/returns
GET /api/v1/reports/tickets
GET /api/v1/reports/staff
GET /api/v1/reports/customers
```

CSV: `Content-Type: text/csv`, `Content-Disposition: attachment; filename="fauward-report-{type}-{date}.csv"`, stream rows.

### Tenant Portal UI

Create `pages/reports/ReportsPage.tsx`:
- Report type selector: Shipments | Revenue | Returns | Tickets | Staff Performance | Customers
- Date range presets + custom date picker
- Export format selector: CSV | JSON | PDF
- "Generate Report" → download trigger; loading state
- "Scheduled Reports" section (Pro+): recurring report email

Add "Reports" nav item for TENANT_ADMIN, TENANT_MANAGER, TENANT_FINANCE.

---

## 25.10 Live Operational Map (Pro+)

**Status: No live ops map. Must add.**

### Backend

```
GET   /api/v1/driver/locations    — all drivers with last known location; roles: TENANT_ADMIN, TENANT_MANAGER
PATCH /api/v1/driver/location     — { lat, lng, accuracy }; driver sends every 60s; stored in Redis (TTL: 5min)
GET   /api/v1/shipments/live-map  — active shipments (IN_TRANSIT, OUT_FOR_DELIVERY) with last location event
```

### Tenant Portal UI

Create `pages/operations/LiveMapPage.tsx` (Pro+ gated, `@vis.gl/react-google-maps`):
- Full-width Google Maps; driver markers; shipment cluster markers; filter sidebar
- Live refresh every 60s

---

## 25.11 Fleet & Vehicle Management

**Status: `Driver` and `Vehicle` models exist in schema but no routes or UI. Must add.**

### Backend — Create `apps/backend/src/modules/fleet/fleet.routes.ts`

```
GET/POST/PATCH/DELETE  /api/v1/fleet/vehicles
GET/POST/PATCH         /api/v1/fleet/drivers
```

### Tenant Portal UI

Create `pages/fleet/FleetPage.tsx`:
- Tabs: Drivers | Vehicles
- Drivers tab: today's stats (stops assigned, completed, on-time rate), vehicle, availability toggle
- Vehicles tab: registration, type, capacity, assigned driver, edit/delete

---

## 25.12 POD Viewer (Staff Admin)

**Status: POD is captured by drivers but staff cannot view it. Must add.**

In `ShipmentDetailPage.tsx` Documents tab, add "Proof of Delivery" section when `status === 'DELIVERED'`:
- Photo thumbnails (click to full-screen lightbox), signature image
- Recipient name, delivery notes, captured timestamp, driver name
- "Download POD" button

Create `components/shipments/PODViewer.tsx` with photo grid and signature display.

**Backend:**
```
GET  /api/v1/shipments/:id/pod              — returns { podAssets, recipientName, deliveredAt, capturedBy }
POST /api/v1/documents/pod/:shipmentId      — generates POD summary PDF, returns signed URL
```

---

## 25.13 Inline Status Updates in Shipment Table

**Status: Shipment table exists but has no inline row actions. Must add.**

In `components/shipments/ShipmentTable.tsx`:
- "Status" dropdown per row showing valid next states (same `ALLOWED_TRANSITIONS` logic)
- If DELIVERED: mini POD modal inline before confirming
- If FAILED_DELIVERY: inline reason selector
- Inline "Assign Driver" dropdown for unassigned PROCESSING shipments
- **Performance:** use a single shared lazy-mounted popover component — do not render all options for every row

---

## 25.14 Individual User Suspension

**Status: `isActive` field exists on `User` model but is not wired. Must add.**

### Backend (add to `users.routes.ts`)

```
PATCH /api/v1/users/:id/suspend    — set isActive=false; TENANT_ADMIN only; cannot suspend self; audit log
PATCH /api/v1/users/:id/activate   — set isActive=true; TENANT_ADMIN only
```

In `authenticate.ts`: after JWT verification, check `user.isActive === true`. If false, return 401 `{ error: "Account suspended", code: "USER_SUSPENDED" }`.

### Tenant Portal UI

In `TeamPage.tsx`:
- Status column: "Active" / "Suspended" badge
- Three-dot menu: "Change Role" | "Suspend" | "Activate" | "Remove"
- Suspend confirmation dialog

---

## 25.15 Performance Patterns to Enforce

### Lazy Tab Loading

```typescript
const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(['timeline']));
// On tab click: setVisitedTabs(prev => new Set([...prev, tabId]))
// Render tab content only if visitedTabs.has(tabId)
```

Apply to: `ShipmentDetailPage.tsx`, `TenantDetailTabs.tsx`, settings page tabs.

### Debounced Search (300ms)

Apply to: `ShipmentFilterBar.tsx`, `TicketsListPage.tsx`, `ReturnsListPage.tsx`, `TeamPage.tsx`, super-admin `TenantsListPage.tsx`.

### Virtual Scrolling

Use TanStack Virtual (`@tanstack/react-virtual`) for tables that can exceed 100+ rows.
Apply to: super-admin tenant list, audit log table, queue message list.

### React Query Polling Intervals

| Data | Interval |
|------|---------|
| Unread notification count | 30s |
| Live map driver locations | 60s |
| Activity timeline | 60s |
| Queue stats (super admin) | 10s |
| System health metrics | 15s |

---

## 25.16 Summary — Build Order (Priorities 16–32)

| Priority | Feature | Key New Files | DB Changes |
|----------|---------|---------------|------------|
| 16 | Returns management | `modules/returns/returns.routes.ts`, `pages/returns/*.tsx` | New `ReturnRequest` model + enums |
| 17 | Support tickets | `modules/support/support.routes.ts`, `pages/support/*.tsx` | New `SupportTicket`, `TicketMessage` models + enums |
| 18 | Email template admin | `pages/settings/EmailSettingsTab.tsx`, routes in `tenant.routes.ts` | New `EmailTemplateConfig` model; add fields to `TenantSettings` |
| 19 | Full tenant pricing system | `modules/pricing/` (entire module), `pages/pricing/` (15 pages) | New: `Surcharge`, `PricingRule`, `PromoCode`, `WeightDiscountTier`; add JSON fields to `TenantSettings` |
| 20 | QR scanning in driver app | `apps/driver/src/components/driver/QRScanner.tsx` | Install `@zxing/browser` |
| 21 | Shipping label print page | `modules/documents/label.routes.ts`, `documents/templates/label.html` | Install `qrcode` |
| 22 | In-app notification center | `components/shared/NotificationCenter.tsx`, notification routes | New `InAppNotification` model |
| 23 | Activity timeline | `pages/activity/ActivityTimelinePage.tsx`, `GET /analytics/activity` | None |
| 24 | Analytics enhancements | Update `analytics.routes.ts` | Add `slaDeliveryHours` to `TenantSettings` |
| 25 | Animated KPI cards | `components/ui/AnimatedNumber.tsx` | None |
| 26 | Dedicated reports page | `pages/reports/ReportsPage.tsx`, `GET /reports/*` | None |
| 27 | Live operational map | `pages/operations/LiveMapPage.tsx`, driver location routes | None (Redis) |
| 28 | Fleet & vehicle management | `modules/fleet/fleet.routes.ts`, `pages/fleet/FleetPage.tsx` | None (models exist) |
| 29 | POD viewer for staff | `components/shipments/PODViewer.tsx`, `POST /documents/pod/:id` | None |
| 30 | Inline status update in shipment table | Update `ShipmentTable.tsx` | None |
| 31 | Individual user suspension | `PATCH /users/:id/suspend` + `/activate`, update `authenticate.ts` | None (`isActive` exists) |
| 32 | Performance patterns | Update `ShipmentDetailPage.tsx`, `ShipmentFilterBar.tsx`, super-admin tables | None |
