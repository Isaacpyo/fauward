# Fauward — Developer Reference

> Complete technical reference for engineers working on the Fauward codebase.
> Covers architecture, database schema, test suite, known gaps, and contribution conventions.

---

## Table of Contents

1. [What Is Fauward](#1-what-is-fauward)
2. [Monorepo Structure](#2-monorepo-structure)
3. [Tech Stack](#3-tech-stack)
4. [Local Development Setup](#4-local-development-setup)
5. [Environment Variables](#5-environment-variables)
6. [Database Schema](#6-database-schema)
   - [Enums](#61-enums)
   - [Core Platform Models](#62-core-platform-models)
   - [Organisations](#63-organisations)
   - [Shipments & Tracking](#64-shipments--tracking)
   - [Fleet](#65-fleet)
   - [Pricing Engine](#66-pricing-engine)
   - [CRM & Sales](#67-crm--sales)
   - [Finance](#68-finance)
   - [Support & Returns](#69-support--returns)
   - [Platform Infrastructure](#610-platform-infrastructure)
   - [Enterprise](#611-enterprise)
   - [Entity Relationship Summary](#612-entity-relationship-summary)
7. [Shipment State Machine](#7-shipment-state-machine)
8. [Pricing Engine Logic](#8-pricing-engine-logic)
9. [Backend Architecture](#9-backend-architecture)
   - [Request Lifecycle](#91-request-lifecycle)
   - [Multi-Tenancy](#92-multi-tenancy)
   - [Event-Driven Architecture](#93-event-driven-architecture)
   - [Module Map](#94-module-map)
10. [Test Suite](#10-test-suite)
    - [Running Tests](#101-running-tests)
    - [Test File Reference](#102-test-file-reference)
    - [Test Coverage by Domain](#103-test-coverage-by-domain)
11. [CI Pipeline](#11-ci-pipeline)
12. [Missing and Incomplete Areas](#12-missing-and-incomplete-areas)
    - [Hard Gaps — Models in Spec but Not in Prisma](#121-hard-gaps--models-in-spec-but-not-in-prisma)
    - [Missing Indexes](#122-missing-indexes)
    - [Structural Issues](#123-structural-issues)
    - [Missing Functionality](#124-missing-functionality)
    - [Schema Drift](#125-schema-drift)
    - [Missing Tests](#126-missing-tests)
13. [API Reference](#13-api-reference)
14. [WebSocket Events](#14-websocket-events)
15. [Security Model](#15-security-model)
16. [Contribution Guide](#16-contribution-guide)

---

## 1. What Is Fauward

Fauward is a **multi-tenant B2B SaaS platform** that gives logistics businesses — couriers, freight forwarders, and third-party logistics providers — their own fully branded, operational platform.

Each subscribing logistics business ("tenant") gets:

- A customer-facing portal for booking, tracking, and payment
- An ops dashboard for managing shipments end-to-end
- Real-time tracking via WebSocket
- A payment pipeline with multi-gateway support
- Email and SMS notification layer
- A driver mobile PWA for field operations
- An embeddable tracking widget for third-party websites
- Full white-label branding

**Pricing model:** Flat per-company, not per-user. Starter at £29/month (3 staff, 300 shipments), Pro at £79/month (15 staff, 2,000 shipments), Enterprise from £500/month (unlimited).

**Target markets:** UK, West Africa (Nigeria, Ghana), East Africa (Kenya, Uganda), Middle East (UAE, Saudi), Southern Africa, North America, Asia Pacific.

---

## 2. Monorepo Structure

```
fauward/
├── apps/
│   ├── backend/            Fastify API, Prisma, BullMQ (primary service)
│   ├── frontend/           Next.js 14 App Router — marketing site (fauward.com)
│   ├── tenant-portal/      React 18 + Vite — ops portal ({slug}.fauward.com)
│   ├── driver/             React 18 + Vite + PWA — driver mobile app
│   └── super-admin/        React 18 + Vite — internal Fauward admin
├── packages/
│   ├── brand/              brand.css — Fauward design tokens
│   ├── design-tokens/      tokens.css, fauward.css
│   ├── theme-engine/       applyTenantTheme() — injects CSS vars per tenant
│   ├── shared-types/       Cross-app TypeScript interfaces
│   ├── domain-types/       Shipment, User, Tenant domain types
│   └── formatting/         Currency, date, weight formatters
├── widget/                 Vanilla JS + Shadow DOM — embeddable tracking widget
├── docker-compose.yml      Local: PostgreSQL 15, Redis 7, MailHog
├── supabase_init.sql       Early SQL snapshot (STALE — see §12.5)
├── cross_tenant_test.sh    HTTP-level tenant isolation smoke test
└── package.json            npm workspaces root
```

**Package manager:** npm workspaces. All commands run from root unless noted.

---

## 3. Tech Stack

| Layer | Technology |
|---|---|
| Backend runtime | Node.js 20, Fastify, TypeScript |
| ORM | Prisma 5 (PostgreSQL provider) |
| Database | PostgreSQL 15 (Supabase in production) |
| Cache / PubSub | Redis 7 (Upstash in production) |
| Job queue | BullMQ |
| WebSockets | Socket.io + Redis adapter |
| Auth | JWT (RS256 access, HS256 refresh) + bcrypt (cost 12) |
| Payments | Stripe, Paystack, regional gateways |
| Email | SendGrid |
| SMS | Twilio |
| File storage | AWS S3 |
| Marketing site | Next.js 14 App Router, Tailwind |
| Tenant portal | React 18, Vite, Tailwind, Zustand, React Query, Radix UI |
| Driver PWA | React 18, Vite, PWA plugin |
| Testing | Vitest (unit + integration), cross_tenant_test.sh (HTTP smoke) |
| CI | GitHub Actions |
| Containers | Docker, AWS ECS/Fargate |
| Monitoring | CloudWatch + Sentry |

---

## 4. Local Development Setup

**Prerequisites:** Node.js 20+, Docker Desktop

```bash
# 1. Clone and install
git clone https://github.com/your-org/fauward
cd fauward
npm install

# 2. Start infrastructure
docker-compose up -d
# Starts: PostgreSQL 15 on :5432, Redis 7 on :6379, MailHog on :8025

# 3. Configure environment
cp apps/backend/.env.example apps/backend/.env
# Edit DATABASE_URL, REDIS_URL, JWT secrets (see §5)

# 4. Generate Prisma client and push schema
cd apps/backend
npx prisma generate
npx prisma db push

# 5. Start backend
npm run dev        # from repo root — starts Fastify on :3001

# 6. Run tests
npm test           # from repo root — delegates to backend Vitest
```

**MailHog UI:** http://localhost:8025 — catches all dev emails.

**Docker Compose services:**

| Service | Image | Port | Credentials |
|---|---|---|---|
| postgres | postgres:15 | 5432 | fauward_dev / fauward_dev |
| redis | redis:7 | 6379 | none |
| mailhog | mailhog | 8025 (UI), 1025 (SMTP) | none |

---

## 5. Environment Variables

All variables are validated at startup by `src/config/index.ts` using Zod. The process throws immediately if any required variable is missing or invalid — this is intentional.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string (pooled, e.g. Supabase pooler) |
| `DIRECT_URL` | Yes | PostgreSQL direct connection (used by Prisma migrations) |
| `REDIS_URL` | Yes | Redis connection string |
| `JWT_ACCESS_SECRET` | Yes | ≥16 chars, signs 15-minute access JWTs |
| `JWT_REFRESH_SECRET` | Yes | ≥16 chars, signs 7-day refresh JWTs |
| `JWT_ACCESS_EXPIRES_IN` | No | Default: `15m` |
| `JWT_REFRESH_EXPIRES_IN` | No | Default: `7d` |
| `MFA_ISSUER` | No | Default: `Fauward` |
| `PLATFORM_DOMAIN` | No | Default: `fauward.com` |
| `PORT` | No | Default: `3001` |
| `NODE_ENV` | No | Default: `development` |

**For tests:** Vitest injects stub values via `test.env` in `vitest.config.ts`. No real DB or Redis is used in unit tests.

---

## 6. Database Schema

The canonical schema is `apps/backend/prisma/schema.prisma`. The database is PostgreSQL, managed via `prisma db push` (no migration folder — CI pushes the schema directly). All tables are in a single shared database; tenant isolation is enforced via `tenantId` on every row, not via schema separation.

### 6.1 Enums

| Enum | Values |
|---|---|
| `ShipmentStatus` | `PENDING`, `PROCESSING`, `PICKED_UP`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERED`, `FAILED_DELIVERY`, `RETURNED`, `CANCELLED`, `EXCEPTION` |
| `UserRole` | `SUPER_ADMIN`, `TENANT_ADMIN`, `TENANT_MANAGER`, `TENANT_FINANCE`, `TENANT_STAFF`, `TENANT_DRIVER`, `CUSTOMER_ADMIN`, `CUSTOMER_USER` |
| `TenantStatus` | `TRIALING`, `ACTIVE`, `SUSPENDED`, `CANCELLED` |
| `TenantPlan` | `STARTER`, `PRO`, `ENTERPRISE`, `TRIALING` |
| `InvoiceStatus` | `DRAFT`, `SENT`, `PAID`, `OVERDUE`, `PARTIALLY_PAID`, `VOID` |
| `PaymentStatus` | `PENDING`, `COMPLETED`, `FAILED`, `REFUNDED` |
| `QuoteStatus` | `DRAFT`, `SENT`, `ACCEPTED`, `REJECTED`, `EXPIRED`, `CONVERTED` |
| `LeadStage` | `PROSPECT`, `QUOTED`, `NEGOTIATING`, `WON`, `LOST` |
| `DocumentType` | `DELIVERY_NOTE`, `INVOICE`, `QUOTE`, `CARGO_MANIFEST`, `POD_RECEIPT`, `CREDIT_NOTE`, `AIR_WAYBILL`, `BILL_OF_LADING` |
| `NotificationChannel` | `EMAIL`, `SMS`, `PUSH` |
| `WebhookDeliveryStatus` | `PENDING`, `DELIVERED`, `FAILED` |
| `ReturnStatus` | `REQUESTED`, `APPROVED`, `LABEL_ISSUED`, `PICKED_UP`, `IN_HUB`, `RECEIVED`, `REFUNDED`, `RESOLVED`, `REJECTED` |
| `ReturnReason` | `WRONG_ITEM`, `DAMAGED`, `NOT_AS_DESCRIBED`, `NO_LONGER_NEEDED`, `REFUSED_DELIVERY`, `OTHER` |
| `TicketStatus` | `OPEN`, `IN_PROGRESS`, `WAITING_CUSTOMER`, `RESOLVED`, `CLOSED` |
| `TicketPriority` | `LOW`, `NORMAL`, `HIGH`, `URGENT` |
| `TicketCategory` | `DELIVERY_ISSUE`, `PAYMENT_ISSUE`, `DAMAGED_GOODS`, `WRONG_ADDRESS`, `TRACKING_ISSUE`, `RETURN_REQUEST`, `BILLING_QUERY`, `OTHER` |
| `SurchargeType` | `PERCENT_OF_BASE`, `PERCENT_OF_TOTAL`, `FLAT_FEE`, `PER_KG` |
| `SurchargeCondition` | `ALWAYS`, `OVERSIZE`, `OVERWEIGHT`, `REMOTE_AREA`, `RESIDENTIAL`, `DANGEROUS_GOODS`, `FUEL`, `PEAK_SEASON` |
| `PricingRuleAction` | `ADD`, `SUBTRACT`, `MULTIPLY`, `OVERRIDE_TOTAL`, `OVERRIDE_PER_KG`, `SET_MIN`, `SET_MAX` |
| `PromoType` | `PERCENT_OFF`, `FIXED_OFF`, `FREE_INSURANCE`, `FREE_EXPRESS` |

---

### 6.2 Core Platform Models

#### `Tenant` → table `tenants`

The root entity. Every other record belongs to a tenant.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `name` | String | Display name of the logistics business |
| `slug` | String | Unique. Subdomain: `{slug}.fauward.com` |
| `customDomain` | String? | Unique. Verified custom domain |
| `domainVerified` | Boolean | Whether DNS verification passed |
| `plan` | `TenantPlan` | Current plan enum. **Note:** duplicated in `Subscription.plan` — see §12.3 |
| `status` | `TenantStatus` | Lifecycle: TRIALING → ACTIVE → SUSPENDED → CANCELLED |
| `infrastructureType` | String | `SHARED` or `DEDICATED` (Enterprise) |
| `region` | String | e.g. `uk_europe`, `west_africa` |
| `logoUrl` | String? | Brand logo URL |
| `primaryColor` | String | Hex, default `#0D1F3C` |
| `accentColor` | String | Hex, default `#D97706` |
| `brandName` | String? | Override name for white-label |
| `isRtl` | Boolean | Right-to-left UI (Arabic etc.) |
| `defaultCurrency` | String | ISO 4217, default `GBP` |
| `defaultLanguage` | String | BCP 47, default `en` |
| `timezone` | String | IANA, default `Europe/London` |
| `showPoweredBy` | Boolean | Show "Powered by Fauward" footer |
| `smsEnabled` | Boolean | SMS notifications toggle |
| `maxStaff` | Int | Plan limit: 3 (Starter), 15 (Pro), unlimited (Enterprise) |
| `maxShipmentsPm` | Int | Plan limit: 300 (Starter), 2000 (Pro), unlimited (Enterprise) |
| `maxOrganisations` | Int | Plan limit: 10 (Starter), unlimited (Pro+) |
| `createdAt` / `updatedAt` | DateTime | Timestamps |

Relations: owns all other domain entities.

---

#### `TenantSettings` → table `tenant_settings`

One-to-one extension of `Tenant` for operational configuration. PK is `tenantId`.

Key columns: `paymentGateway`, `paymentGatewayKey`, `customEmailDomain`, `webhookUrl`, `webhookSecret`, `currency`, `timezone`, `emailFromName`, `emailReplyTo`, `opsEmailRecipients` (String[]), `serviceTierConfig` (Json), `insuranceConfig` (Json), `taxConfig` (Json), `dimensionalDivisor` (Int, default 5000), `weightTierConflictPolicy`, `quoteValidityMinutes`, `showPriceBreakdownToCustomer`, `autoInvoiceOnDelivery`, `slaDeliveryHours`, `roundingMode`, `roundingPrecision`.

---

#### `Subscription` → table `subscriptions`

Stripe subscription state. One per tenant (`tenantId` unique).

| Column | Type | Notes |
|---|---|---|
| `plan` | String | Active plan name. **Note:** separate from `Tenant.plan` enum — see §12.3 |
| `billingCycle` | String | `MONTHLY` or `ANNUAL` |
| `status` | String | `TRIALING`, `ACTIVE`, `PAST_DUE`, `SUSPENDED`, `CANCELLED` |
| `stripeSubscriptionId` | String? | Stripe object ID |
| `stripeCustomerId` | String? | Stripe customer ID |
| `currentPeriodStart/End` | DateTime? | Billing period boundaries |
| `trialStart/End` | DateTime? | Trial window |
| `cancelledAt` | DateTime? | When cancelled |
| `cancelAtPeriodEnd` | Boolean | Stripe cancel-at-period-end flag |

---

#### `User` → table `users`

All human actors on the platform.

| Column | Type | Notes |
|---|---|---|
| `tenantId` | String | FK → `tenants` |
| `organisationId` | String? | FK → `organisations` (customer users) |
| `branchId` | String? | FK → `branches` (Enterprise) |
| `email` | String | Unique per tenant: `(tenantId, email)` |
| `phone` | String? | |
| `passwordHash` | String? | bcrypt, null for SSO-only users |
| `role` | `UserRole` | Governs all permission checks |
| `firstName` / `lastName` | String? | |
| `isActive` | Boolean | Soft-disable without deleting |
| `mfaEnabled` | Boolean | TOTP-based MFA toggle |
| `mfaSecret` | String? | Encrypted TOTP secret |
| `lastLogin` | DateTime? | |
| `invitedBy` | String? | User ID of inviter. **No FK, no Invitation model** — see §12.4 |
| `ssoProvider` / `ssoSubject` | String? | SSO JIT provisioning fields |

Indexes: `tenantId`, unique `(tenantId, email)`.

---

#### `RefreshToken` → table `refresh_tokens`

Hashed JWT refresh tokens. Cascade-deleted when user is deleted.

| Column | Notes |
|---|---|
| `token` | Unique. The raw token (should be stored hashed — see §12.4) |
| `userId` | FK → `users` ON DELETE CASCADE |
| `expiresAt` | 7-day TTL |

---

#### `PasswordResetToken` → table `password_reset_tokens`

| Column | Notes |
|---|---|
| `tokenHash` | SHA-256 hash of the reset token. Unique. |
| `userId` | FK → `users` ON DELETE CASCADE |
| `tenantId` | FK → `tenants` ON DELETE CASCADE |
| `expiresAt` | Short TTL |
| `usedAt` | Set on consumption; prevents reuse |

---

#### `Branch` → table `branches`

Enterprise multi-branch support. Users and shipments can be scoped to a branch.

| Column | Notes |
|---|---|
| `tenantId` | FK → `tenants` |
| `name` | Branch display name |
| `region` | Optional regional label |
| `address` | Json |
| `managerId` | String? — no FK enforced to a User; see §12.4 |

---

### 6.3 Organisations

#### `Organisation` → table `organisations`

B2B client companies. A tenant's customers are organisations, not just individual users.

| Column | Notes |
|---|---|
| `tenantId` | FK → `tenants` |
| `name` | Company name |
| `companyNumber` / `taxNumber` | Legal identifiers |
| `billingEmail` | Finance contact |
| `billingAddress` | Json |
| `paymentTerms` | Net days: 0 = immediate, 30 = Net 30, etc. |
| `creditLimit` | Decimal(12,2) — credit exposure cap |
| `billingOwnerId` | String? — the user who receives invoices. **No FK** — see §12.4 |
| `isActive` | Boolean |

Relations: owns `User[]`, `Shipment[]`, `Invoice[]`, `Quote[]`, `CreditNote[]`, `ReturnRequest[]`.

---

### 6.4 Shipments & Tracking

#### `Shipment` → table `shipments`

The primary operational entity.

| Column | Type | Notes |
|---|---|---|
| `tenantId` | String | FK → `tenants`. All queries must filter by this. |
| `branchId` | String? | FK → `branches` |
| `trackingNumber` | String | Unique. Format: `{SLUG}-{YYYYMM}-{6CHAR}` |
| `customerId` | String? | User ID (no FK enforced — plain string) |
| `organisationId` | String? | FK → `organisations` |
| `assignedStaffId` | String? | User ID (no FK — plain string) |
| `assignedDriverId` | String? | FK → `drivers` |
| `vehicleId` | String? | FK → `vehicles` |
| `routeId` | String? | Plain string — no FK enforced |
| `status` | `ShipmentStatus` | Controlled by state machine (§7) |
| `originAddress` | Json | `{ line1, line2, city, postcode, country }` |
| `destinationAddress` | Json | Same structure |
| `serviceTier` | String | `STANDARD`, `EXPRESS`, `OVERNIGHT` |
| `serviceZoneId` | String? | FK → `service_zones` |
| `estimatedDelivery` | DateTime? | |
| `actualDelivery` | DateTime? | Set on DELIVERED transition |
| `price` | Decimal(12,2)? | Final calculated price |
| `currency` | String | ISO 4217 |
| `weightKg` | Decimal(8,3)? | Total weight |
| `insuranceValue` | Decimal(12,2)? | Declared value for insurance surcharge |
| `promoCodeId` | String? | FK → `promo_codes` |
| `idempotencyKey` | String? | Unique — prevents duplicate creation |

Indexes: `tenantId`, `status`, `trackingNumber`, `customerId`, `promoCodeId`.

**Missing indexes:** `organisationId`, `assignedDriverId` — see §12.2.

**Missing columns vs spec:** `carrierBookingId`, `customsDeclarationId` — see §12.1.

---

#### `ShipmentItem` → table `shipment_items`

Line items (individual packages) within a shipment.

| Column | Notes |
|---|---|
| `shipmentId` | FK → `shipments` ON DELETE CASCADE |
| `quantity` | Int, default 1 |
| `weightKg`, `lengthCm`, `widthCm`, `heightCm` | Decimal dimensions |
| `declaredValue` | Decimal(12,2) — customs value |
| `hsCode` | Harmonised System code (customs) |
| `isDangerous` | Boolean — triggers dangerous-goods surcharge |

---

#### `ShipmentEvent` → table `shipment_events`

Immutable append-only timeline of status transitions.

| Column | Notes |
|---|---|
| `shipmentId` | FK → `shipments` ON DELETE CASCADE |
| `status` | String (not enum — allows custom event labels) |
| `location` | Json? — GPS or address at event time |
| `actorId` | String? — user or driver who triggered |
| `actorType` | String? — `USER`, `DRIVER`, `SYSTEM`, `API` |
| `source` | String — `MANUAL`, `API`, `WEBHOOK`, `CARRIER` |
| `timestamp` | DateTime |

---

#### `ShipmentDocument` → table `shipment_documents`

Generated PDFs attached to shipments.

| Column | Notes |
|---|---|
| `type` | `DocumentType` enum |
| `templateId` | Optional template reference |
| `fileUrl` | S3 signed URL |
| `generatedBy` | User ID string |
| `expiresAt` | URL expiry |

---

#### `PodAsset` → table `pod_assets`

Proof-of-delivery assets (photos, signatures, scanned documents).

| Column | Notes |
|---|---|
| `type` | String: `PHOTO`, `SIGNATURE`, `DOCUMENT` |
| `fileUrl` | S3 URL |
| `capturedBy` | User ID string |
| `capturedAt` | DateTime |

---

### 6.5 Fleet

#### `Driver` → table `drivers`

Extends `User` with driver-specific fields. One-to-one with `User` (`userId` unique).

| Column | Notes |
|---|---|
| `userId` | FK → `users`. Unique. |
| `licenceNumber` / `licenceExpiry` | Driving licence details |
| `vehicleId` | FK → `vehicles` — assigned vehicle |
| `isAvailable` | Boolean — availability for dispatch |
| `currentLat` / `currentLng` | Decimal — last known GPS position |
| `lastLocationAt` | DateTime |

**Gap:** Only stores current position. No `DriverLocationHistory` table — see §12.4.

Relations: `Shipment[]` (assigned), `RouteStop[]`.

---

#### `Vehicle` → table `vehicles`

| Column | Notes |
|---|---|
| `registration` | Plate number |
| `make` / `model` / `year` | Vehicle details |
| `type` | String: `VAN`, `TRUCK`, `MOTORCYCLE`, `BICYCLE` |
| `capacityKg` / `capacityM3` | Load capacity |
| `isActive` | Boolean |

---

#### `Route` → table `routes`

A planned dispatch run for a given day.

| Column | Notes |
|---|---|
| `driverId` / `vehicleId` | Plain strings (no FK enforced) |
| `date` | DateTime |
| `status` | String: `PLANNED`, `IN_PROGRESS`, `COMPLETED` |
| `startedAt` / `completedAt` | DateTime? |

---

#### `RouteStop` → table `route_stops`

Ordered stops on a route. Cascade-deleted with `Route`.

| Column | Notes |
|---|---|
| `routeId` | FK → `routes` ON DELETE CASCADE |
| `shipmentId` | String (no FK enforced) |
| `driverId` | FK → `drivers` (nullable) |
| `stopOrder` | Int — sequence within route |
| `type` | String: `PICKUP` or `DELIVERY` |
| `estimatedAt` / `arrivedAt` / `completedAt` | DateTime? |

---

### 6.6 Pricing Engine

#### `ServiceZone` → table `service_zones`

Named geographic zones used as origin/destination in rate cards.

| Column | Notes |
|---|---|
| `name` | Zone name (e.g. "London Zone 1", "West Africa") |
| `zoneType` | String: `NATIONAL`, `INTERNATIONAL`, `REGIONAL` |

---

#### `RateCard` → table `rate_cards`

Base pricing matrix for a zone pair and service tier.

| Column | Notes |
|---|---|
| `originZoneId` / `destZoneId` | FK → `service_zones` (nullable — catch-all if null) |
| `serviceTier` | String: `STANDARD`, `EXPRESS`, `OVERNIGHT` |
| `basePrice` | Decimal(12,2) |
| `pricePerKg` | Decimal(10,4) |
| `minCharge` / `maxCharge` | Decimal(12,2)? — floor and ceiling |
| `currency` | ISO 4217 |
| `isActive` | Boolean |
| `effectiveFrom` / `effectiveTo` | DateTime? — date-range validity |

---

#### `Surcharge` → table `surcharges`

Conditional additions to the base price.

| Column | Notes |
|---|---|
| `type` | `SurchargeType` — how the value is applied |
| `condition` | `SurchargeCondition` — when it triggers |
| `value` | Decimal(10,4) — amount or percentage |
| `threshold` | Decimal? — trigger threshold (e.g. girth cm for oversize) |
| `peakFrom` / `peakTo` | DateTime? — active window for `PEAK_SEASON` |
| `isEnabled` / `isVisibleToCustomer` | Boolean |

---

#### `WeightDiscountTier` → table `weight_discount_tiers`

Volume/weight-based discounts applied before surcharges.

| Column | Notes |
|---|---|
| `minWeightKg` / `maxWeightKg` | Weight bracket |
| `discountType` | String: `PERCENT` or `FLAT` |
| `discountValue` | Decimal(8,4) |
| `isEnabled` | Boolean |

---

#### `PricingRule` → table `pricing_rules`

Flexible rule engine applied after base pricing.

| Column | Notes |
|---|---|
| `conditions` | Json — arbitrary condition tree (service tier, zone, weight, etc.) |
| `action` | `PricingRuleAction` |
| `actionValue` | Decimal(12,4) |
| `priority` | Int — rules are evaluated in ascending priority order |
| `stopAfter` | Boolean — stops further rule evaluation if this rule matches |

---

#### `PromoCode` → table `promo_codes`

Discount codes applied at shipment creation.

| Column | Notes |
|---|---|
| `code` | String — unique per `(tenantId, code)` |
| `type` | `PromoType` |
| `value` | Decimal(10,2) |
| `minOrderValue` / `maxDiscountValue` | Decimal? — guards |
| `maxUses` / `usedCount` | Int — usage cap |
| `customerIds` | String[] — optional allowlist |
| `expiresAt` | DateTime? |

---

### 6.7 CRM & Sales

#### `Lead` → table `leads`

Sales pipeline records.

| Column | Notes |
|---|---|
| `stage` | `LeadStage` — pipeline position |
| `company` / `contactName` / `email` / `phone` | Contact details |
| `assignedTo` | String? — User ID |
| `source` | String? — marketing source |
| `wonAt` / `lostAt` / `lostReason` | Outcome timestamps |

---

#### `Quote` → table `quotes`

Shipping quotes, optionally linked to a lead and/or converted to a shipment.

| Column | Notes |
|---|---|
| `quoteNumber` | String — unique |
| `leadId` | FK → `leads` (nullable) |
| `organisationId` | FK → `organisations` (nullable) |
| `shipmentData` | Json — full shipment spec used for pricing |
| `lineItems` | Json? — itemised breakdown |
| `subtotal` / `total` | Decimal? |
| `status` | `QuoteStatus` |
| `validUntil` | DateTime? |
| `shipmentId` | String? — set when accepted and converted |

---

### 6.8 Finance

#### `Invoice` → table `invoices`

| Column | Notes |
|---|---|
| `invoiceNumber` | String — unique |
| `shipmentId` | String? — **unique** — hard 1:1 constraint; see §12.3 |
| `organisationId` | FK → `organisations` (nullable) |
| `lineItems` | Json — itemised charges |
| `subtotal` | Decimal(12,2) |
| `taxRate` / `taxAmount` | Decimal |
| `discountAmount` | Decimal |
| `total` | Decimal(12,2) |
| `status` | `InvoiceStatus` |
| `dueDate` | DateTime? |
| `paymentTerms` | Int — Net days |
| `eInvoiceRef` / `eInvoiceStatus` | String? — e-invoicing compliance fields |
| `sentAt` / `paidAt` / `voidedAt` | DateTime? |

---

#### `Payment` → table `payments`

| Column | Notes |
|---|---|
| `invoiceId` | FK → `invoices` (nullable) |
| `shipmentId` | String? — unique — one payment per shipment |
| `amount` / `currency` | Decimal, String |
| `method` | String? — `STRIPE`, `PAYSTACK`, `BANK_TRANSFER`, `CASH`, `M_PESA` |
| `status` | `PaymentStatus` |
| `gatewayRef` / `gatewayResponse` | String?, Json? |
| `idempotencyKey` | String? — unique |
| `refundedAmount` | Decimal(12,2) |

---

#### `Refund` → table `refunds`

| Column | Notes |
|---|---|
| `paymentId` | FK → `payments` |
| `amount` | Decimal(12,2) |
| `reason` | String? |
| `gatewayRef` | String? |
| `status` | String: `PENDING`, `COMPLETED`, `FAILED` |
| `initiatedBy` | String? — User ID |

---

#### `CreditNote` → table `credit_notes`

| Column | Notes |
|---|---|
| `creditNumber` | String — unique |
| `invoiceId` | FK → `invoices` (nullable) |
| `organisationId` | FK → `organisations` (nullable) |
| `amount` / `currency` | Decimal, String |
| `reason` | String? |
| `appliedTo` | String? — Invoice ID this was offset against |

---

#### `CurrencyRate` → table `currency_rates`

FX rate cache. Not tenant-scoped. Unique on `(fromCurrency, toCurrency)`.

| Column | Notes |
|---|---|
| `rate` | Decimal(18,8) |
| `source` | String — e.g. `OPEN_EXCHANGE` |
| `fetchedAt` | DateTime |

---

#### `AccountingConnection` → table `accounting_connections`

OAuth token store for accounting integrations (Xero, QuickBooks, Sage, etc.).

| Column | Notes |
|---|---|
| `provider` | String — `XERO`, `QUICKBOOKS`, `SAGE`, `SAP`, `ZOHO` |
| `accessToken` / `refreshToken` | String? — encrypted in prod |
| `tokenExpiry` | DateTime? |
| `tenantRef` | String? — the accounting system's own tenant/org ID |
| `isActive` | Boolean |
| `lastSync` | DateTime? |

---

### 6.9 Support & Returns

#### `ReturnRequest` → table `return_requests`

Full return lifecycle from customer request to resolution.

| Column | Notes |
|---|---|
| `shipmentId` | FK → `shipments` |
| `customerId` | FK → `users` (as `ReturnCustomer` relation) |
| `organisationId` | FK → `organisations` (nullable) |
| `status` | `ReturnStatus` |
| `reason` | `ReturnReason` |
| `returnLabel` | String? — S3 URL |
| `handledBy` | FK → `users` (as `ReturnHandledBy` relation) |
| `approvedAt` / `receivedAt` / `resolvedAt` / `refundedAt` | DateTime? |

---

#### `SupportTicket` → table `support_tickets`

| Column | Notes |
|---|---|
| `ticketNumber` | String — unique |
| `customerId` | FK → `users` (nullable, as `TicketCustomer`) |
| `shipmentId` | FK → `shipments` (nullable) |
| `category` | `TicketCategory` |
| `priority` | `TicketPriority` |
| `status` | `TicketStatus` |
| `assignedTo` | FK → `users` (nullable, as `TicketAssignee`) |
| `resolvedAt` / `closedAt` | DateTime? |

---

#### `TicketMessage` → table `ticket_messages`

Thread messages on a ticket. Cascade-deleted with ticket.

| Column | Notes |
|---|---|
| `ticketId` | FK → `support_tickets` ON DELETE CASCADE |
| `authorId` | FK → `users` |
| `body` | String |
| `isInternal` | Boolean — internal notes vs customer-visible |

---

#### `EmailTemplateConfig` → table `email_template_configs`

Per-tenant email template overrides. Unique on `(tenantId, templateKey)`.

| Column | Notes |
|---|---|
| `templateKey` | String — e.g. `shipment_picked_up`, `invoice_sent` |
| `isEnabled` | Boolean — can disable specific email types |
| `customSubject` | String? — override subject line |

---

#### `InAppNotification` → table `in_app_notifications`

Notification inbox per user.

| Column | Notes |
|---|---|
| `userId` | FK → `users` |
| `type` | String |
| `title` | String |
| `body` | String? |
| `link` | String? |
| `isRead` | Boolean |
| `readAt` | DateTime? |

Indexes: `tenantId`, `(userId, isRead)`.

---

### 6.10 Platform Infrastructure

#### `ApiKey` → table `api_keys`

| Column | Notes |
|---|---|
| `keyHash` | String — bcrypt hash. Unique. Show-once at creation. |
| `keyPrefix` | String — first 8 chars shown in UI |
| `scopes` | String[] — e.g. `["read:shipments", "write:shipments"]` |
| `rateLimit` | Int — requests per hour, default 500 |
| `lastUsed` | DateTime? |
| `expiresAt` | DateTime? |

---

#### `WebhookEndpoint` → table `webhook_endpoints`

| Column | Notes |
|---|---|
| `url` | String |
| `secret` | String — HMAC-SHA256 signing secret |
| `events` | String[] — e.g. `["shipment.delivered", "payment.completed"]` |
| `isActive` | Boolean |

---

#### `WebhookDelivery` → table `webhook_deliveries`

Delivery log per event per endpoint.

| Column | Notes |
|---|---|
| `endpointId` | FK → `webhook_endpoints` |
| `eventType` | String |
| `payload` | Json |
| `responseStatus` / `responseBody` / `durationMs` | Response capture |
| `attempt` | Int — retry count |
| `status` | `WebhookDeliveryStatus` |
| `nextRetryAt` | DateTime? |

---

#### `NotificationLog` → table `notification_logs`

Log of all sent notifications.

| Column | Notes |
|---|---|
| `userId` / `shipmentId` | String? — context |
| `channel` | `NotificationChannel` |
| `event` | String — template key |
| `status` | String: `QUEUED`, `SENT`, `FAILED` |
| `providerRef` | String? — SendGrid / Twilio message ID |
| `error` | String? |

---

#### `UsageRecord` → table `usage_records`

Monthly metered usage counters per tenant. Unique on `(tenantId, month)`.

| Column | Notes |
|---|---|
| `month` | String — `YYYY-MM` |
| `shipments` | Int — incremented on each shipment creation |
| `apiCalls` | Int |
| `smsSent` / `emailsSent` | Int |
| `storageMb` | Int |

Used by plan enforcement (`featureGuard.ts`) to block shipments at limit.

---

#### `IdempotencyKey` → table `idempotency_keys`

24-hour idempotency store. Unique on `(tenantId, key)`. Prevents duplicate API requests from creating duplicate records.

| Column | Notes |
|---|---|
| `key` | Client-supplied `Idempotency-Key` header value |
| `requestHash` | String? — hash of the request body |
| `response` | Json? — cached response |
| `statusCode` | Int? |
| `expiresAt` | DateTime — `NOW() + INTERVAL '24 hours'` |

---

#### `OutboxEvent` → table `outbox_events`

Transactional outbox for guaranteed event delivery. Written in the same DB transaction as the business action; a polling worker picks it up and enqueues to BullMQ.

| Column | Notes |
|---|---|
| `aggregateType` | String — e.g. `shipment`, `payment` |
| `aggregateId` | String — entity UUID |
| `eventType` | String — e.g. `shipment.status_updated` |
| `payload` | Json |
| `published` | Boolean |
| `publishedAt` | DateTime? |

Index: `(published, createdAt)` — the poller's query pattern.

---

#### `AuditLog` → table `audit_log`

Immutable audit trail. Never updated or deleted.

| Column | Notes |
|---|---|
| `actorId` | FK → `users` (nullable — system actions have no actor) |
| `actorType` | String: `USER`, `SYSTEM`, `API` |
| `actorIp` / `sessionId` | String? |
| `action` | String — e.g. `shipment.status_updated` |
| `resourceType` / `resourceId` | String? |
| `beforeState` / `afterState` | Json? |
| `metadata` | Json? |

Index: `(tenantId, timestamp DESC)`.

---

### 6.11 Enterprise

#### `SsoProvider` → table `sso_providers`

SAML 2.0 / OIDC configuration. One per tenant (`tenantId` unique).

| Column | Notes |
|---|---|
| `providerType` | String: `SAML`, `OIDC` |
| `entityId` / `ssoUrl` / `certificate` | SAML protocol fields |
| `attributeMap` | Json — IdP attribute → Fauward role mapping |
| `isActive` | Boolean |

---

### 6.12 Entity Relationship Summary

```
Tenant ──┬── TenantSettings (1:1)
         ├── Subscription (1:1)
         ├── User[] ──── Driver (1:1)
         │              └── Vehicle
         ├── Branch[]
         ├── Organisation[] ── User[]
         │                  └── Shipment[]
         ├── Shipment[] ──┬── ShipmentItem[]
         │               ├── ShipmentEvent[]
         │               ├── ShipmentDocument[]
         │               ├── PodAsset[]
         │               ├── Invoice (1:1)
         │               ├── Payment (1:1)
         │               ├── ReturnRequest[]
         │               └── SupportTicket[]
         ├── Route[] ── RouteStop[]
         ├── ServiceZone[] ── RateCard[]
         ├── Surcharge[]
         ├── WeightDiscountTier[]
         ├── PricingRule[]
         ├── PromoCode[] ── Shipment[]
         ├── Lead[] ── Quote[]
         ├── Invoice[] ── Payment[] ── Refund[]
         │            └── CreditNote[]
         ├── ApiKey[]
         ├── WebhookEndpoint[] ── WebhookDelivery[]
         ├── NotificationLog[]
         ├── UsageRecord[]
         ├── IdempotencyKey[]
         ├── AuditLog[]
         ├── AccountingConnection[]
         ├── EmailTemplateConfig[]
         ├── InAppNotification[]
         ├── SupportTicket[] ── TicketMessage[]
         ├── ReturnRequest[]
         └── SsoProvider (1:1)

CurrencyRate           (global — no tenantId)
OutboxEvent            (global — no tenantId)
```

---

## 7. Shipment State Machine

All status transitions are validated by `ALLOWED_TRANSITIONS` in `src/modules/shipments/shipments.routes.ts`. Any transition not listed returns HTTP 400.

```
PENDING ──────► PROCESSING ──► PICKED_UP ──► IN_TRANSIT ──► OUT_FOR_DELIVERY ──► DELIVERED (terminal)
   │               │                │              │                 │
   └── CANCELLED   └── CANCELLED    └── EXCEPTION  └── EXCEPTION     └── FAILED_DELIVERY
       (terminal)      (terminal)        │              │                      │
                                         └──────────────┘                      │
                                                                                ▼
                                                                           RETURNED (terminal)
                                                                           OUT_FOR_DELIVERY (re-attempt)

EXCEPTION → PROCESSING | OUT_FOR_DELIVERY | FAILED_DELIVERY
```

**Full transition table:**

| From | To (allowed) |
|---|---|
| `PENDING` | `PROCESSING`, `CANCELLED` |
| `PROCESSING` | `PICKED_UP`, `CANCELLED` |
| `PICKED_UP` | `IN_TRANSIT`, `EXCEPTION`, `FAILED_DELIVERY` |
| `IN_TRANSIT` | `OUT_FOR_DELIVERY`, `EXCEPTION`, `FAILED_DELIVERY` |
| `OUT_FOR_DELIVERY` | `DELIVERED`, `FAILED_DELIVERY`, `EXCEPTION` |
| `DELIVERED` | `RETURNED` |
| `FAILED_DELIVERY` | `OUT_FOR_DELIVERY`, `RETURNED`, `EXCEPTION` |
| `EXCEPTION` | `PROCESSING`, `OUT_FOR_DELIVERY`, `FAILED_DELIVERY` |
| `RETURNED` | *(terminal)* |
| `CANCELLED` | *(terminal)* |

**Tracking number format:** `{TENANT_SLUG}-{YYYYMM}-{6CHAR_UPPERCASE_ALPHANUMERIC}`
Example: `FWD-202506-A3F9K2`

---

## 8. Pricing Engine Logic

The pricing service (`src/modules/pricing/pricing.service.ts`) calculates the final shipment price in this order:

```
1. Resolve billable weight
   billableWeight = max(actualWeightKg, volumetricWeightKg)
   volumetricWeight = (L × W × H) / dimensionalDivisor   (default 5000)

2. Look up rate card
   WHERE tenantId = X AND originZoneId = Y AND destZoneId = Z
     AND serviceTier = T AND isActive = true
   ORDER BY effectiveFrom DESC LIMIT 1

3. Base price
   base = rateCard.basePrice + (billableWeight × rateCard.pricePerKg)

4. Service tier multiplier (from TenantSettings.serviceTierConfig)
   STANDARD=1.0x | EXPRESS=1.6x | OVERNIGHT=2.2x

5. Apply weight discount tiers (sorted ascending by minWeightKg)

6. Apply surcharges (for each enabled surcharge, check condition)
   ALWAYS       → always applied
   OVERSIZE     → sum(L+W+H) > threshold
   OVERWEIGHT   → billableWeight > threshold
   REMOTE_AREA  → destination zone flag
   DANGEROUS    → any ShipmentItem.isDangerous = true
   FUEL         → always (if enabled)
   PEAK_SEASON  → now() between peakFrom and peakTo

7. Apply PricingRules (sorted by priority ASC)
   Each rule checks JSON conditions, applies PricingRuleAction
   stopAfter=true halts further rule processing

8. Apply promo code (if promoCodeId provided and valid)

9. Enforce min/max from rate card
   final = clamp(subtotal, minCharge, maxCharge)

10. Apply tax (from TenantSettings.taxConfig)

11. Round to TenantSettings.roundingPrecision using roundingMode
```

---

## 9. Backend Architecture

### 9.1 Request Lifecycle

```
HTTP Request
  │
Fastify server (src/server.ts)
  │
buildApp() (src/app.ts)
  │
Plugins: prisma, redis, authenticate (JWT or API key)
  │
TenantResolver middleware
  ├── Subdomain → SELECT * FROM tenants WHERE slug = X
  ├── X-Tenant-ID header → direct ID lookup
  ├── Custom domain → SELECT * FROM tenants WHERE customDomain = X
  └── Tenant attached to req.tenant + AsyncLocalStorage
  │
requireTenantMatch() — JWT tenantId must match req.tenant.id
  │
requireRole([...]) — RBAC gate
  │
requireFeature('feature') — plan gate (checks planService)
  │
Route handler
  ├── Zod schema validation
  ├── Idempotency check (IdempotencyKey lookup)
  ├── Prisma query (auto-scoped via req.tenant.id)
  ├── Write to OutboxEvent (same transaction)
  └── Return response + cache idempotency result
  │
Outbox poller (every 1s)
  ├── notifications:queue → SendGrid / Twilio
  ├── webhooks:queue → tenant endpoint (HMAC-SHA256 signed)
  └── analytics:queue → usage aggregation
```

### 9.2 Multi-Tenancy

All data isolation is enforced in application code, not at the database level. The Prisma middleware in `plugins/prisma.ts` injects `tenantId` into every `findMany`, `findFirst`, `update`, `delete`, and `create` call using `AsyncLocalStorage`. There is no bypass path — raw SQL is not used anywhere.

The isolation is verified by the `tenants.isolation.test.ts` test suite, which proves that a JWT for Tenant A cannot retrieve Tenant B's shipments.

### 9.3 Event-Driven Architecture

Fauward uses the **transactional outbox pattern**:

1. Business action (e.g. status update) writes to the DB and writes an `OutboxEvent` row in the same Prisma transaction.
2. The outbox worker polls `outbox_events WHERE published = false ORDER BY createdAt` every 1 second.
3. The worker enqueues jobs to BullMQ queues: `notifications:queue`, `webhooks:queue`, `analytics:queue`.
4. Failed jobs (3 attempts) move to a dead-letter queue (`dlq:{queue_name}`).

This guarantees events are published even if the process crashes between the DB write and the queue push.

### 9.4 Module Map

```
src/
├── config/index.ts             Zod env validation
├── server.ts                   Entry point
├── app.ts                      buildApp() — registers plugins + routes
├── context/tenant.context.ts   AsyncLocalStorage tenant context
├── plugins/
│   ├── prisma.ts               Prisma client + tenant isolation middleware
│   └── redis.ts                Redis client
├── queues/
│   ├── queues.ts               BullMQ queue definitions
│   └── outbox.worker.ts        Outbox → BullMQ publisher
├── shared/
│   ├── middleware/
│   │   ├── authenticate.ts     JWT / API key verification
│   │   ├── tenant.resolver.ts  Subdomain / domain / header tenant resolution
│   │   ├── tenantMatch.ts      JWT tenantId vs resolved tenant check
│   │   ├── requireRole.ts      RBAC
│   │   ├── featureGuard.ts     Plan feature gates
│   │   └── idempotency.ts      Idempotency key middleware
│   └── utils/
│       ├── hash.ts             bcrypt
│       ├── jwt.ts              Sign / verify access + refresh tokens
│       ├── logger.ts           Structured logging
│       ├── totp.ts             MFA TOTP
│       ├── trackingNumber.ts   Tracking number generation
│       └── pricing.ts          Lightweight price calculation wrapper
└── modules/
    ├── auth/                   Register, login, logout, refresh, MFA
    ├── shipments/              CRUD, status transitions, assignment
    ├── tracking/               Public tracking, WebSocket
    ├── fleet/                  Drivers, vehicles, routes
    ├── pricing/                Rate cards, zones, surcharges, rules, promos
    ├── finance/                Invoices, payments, refunds, credit notes
    ├── crm/                    Leads, quotes
    ├── documents/              PDF generation, labels
    ├── returns/                Return request lifecycle
    ├── support/                Tickets, messages
    ├── notifications/          Email/SMS dispatch, in-app notifications
    ├── webhooks/               Endpoint management, delivery, HMAC signing
    ├── api-keys/               Key generation, scopes, rate limiting
    ├── audit/                  Audit log query
    ├── analytics/              Tenant analytics aggregations
    ├── users/                  User management, invites
    ├── tenants/                Branding, domain, settings, usage, plan
    ├── payments/               Stripe / Paystack service, billing
    ├── driver/                 Driver-specific routes (PWA)
    └── super-admin/            Fauward internal admin routes
```

---

## 10. Test Suite

### 10.1 Running Tests

```bash
# From repo root (delegates to backend Vitest)
npm test

# From backend directory directly
cd apps/backend
npm test

# Watch mode
npx vitest --config vitest.config.ts

# Single file
npx vitest run src/modules/pricing/pricing.test.ts
```

**Test runner:** Vitest 2.1 with `environment: node`.

**Environment:** Stub values are injected via `test.env` in `vitest.config.ts`. No database or Redis connection is required. All Prisma calls are mocked with `vi.fn()`.

### 10.2 Test File Reference

#### `src/modules/pricing/pricing.test.ts` — 3 tests

Tests `pricingService.calculate()` end-to-end with mocked Prisma.

| Test | What it verifies |
|---|---|
| `uses zone rate card lookup for the requested zone pair` | `rateCard.findFirst` is called with the correct `tenantId`, `originZoneId`, `destZoneId`, `serviceTier`, `isActive` |
| `applies configured service tier multipliers` | STANDARD=22, EXPRESS=34, OVERNIGHT=46 given base=10, pricePerKg=2, weight=5kg, 10% fuel surcharge always applied |
| `applies surcharges when conditions match` | Oversize flat fee of £5 applied only when `L+W+H > threshold` (130cm girth > 120cm threshold) |

---

#### `src/shared/utils/trackingNumber.test.ts` — 2 tests

Tests `generateTrackingNumber()`.

| Test | What it verifies |
|---|---|
| `generates unique tracking numbers` | Two calls with the same slug return different numbers |
| `uses correct format` | Output matches `{SLUG}-{YYYYMM}-{6CHARS}` pattern |

---

#### `src/shared/middleware/tenantMatch.test.ts` — 2 tests

Tests `requireTenantMatch()` middleware.

| Test | What it verifies |
|---|---|
| `allows request when tenantId matches` | No error when `req.user.tenantId === req.tenant.id` |
| `rejects request when tenantId mismatch` | Returns 403 when JWT tenant differs from resolved tenant |

---

#### `src/modules/shipments/tenants.isolation.test.ts` — 2 tests

Builds a real Fastify app with mocked Prisma. Authenticated as Tenant A. Verifies cross-tenant data isolation.

| Test | What it verifies |
|---|---|
| `does not return tenant B shipments in tenant A list` | GET /api/v1/shipments returns only Tenant A's shipments; Prisma called with `where: { tenantId: 'tenant-a' }` |
| `returns 404 for cross-tenant shipment id lookup` | GET /api/v1/shipments/ship-b1 (a Tenant B ID) returns `{ error: 'Shipment not found' }` |

---

#### `src/modules/shipments/shipments.state-machine.test.ts` — 3 tests

Tests the `ALLOWED_TRANSITIONS` constant exported from `shipments.routes.ts`.

| Test | What it verifies |
|---|---|
| `allows expected forward transitions` | PENDING→PROCESSING, PROCESSING→PICKED_UP, OUT_FOR_DELIVERY→DELIVERED all in allowed list |
| `disallows invalid transitions` | PENDING→DELIVERED not allowed; CANCELLED=[], RETURNED=[] (terminal states) |
| `requires failed delivery to move through allowed path` | FAILED_DELIVERY→OUT_FOR_DELIVERY is allowed; FAILED_DELIVERY→DELIVERED is not |

---

#### `src/modules/auth/auth.service.test.ts` — 4 tests

Tests `authService` methods with fully mocked Prisma.

| Test | What it verifies |
|---|---|
| `register creates tenant and admin user` | Full registration transaction: `tenant.create`, `tenantSettings.create`, `emailTemplateConfig.createMany`, `surcharge.createMany`, `usageRecord.create`, `user.create`, `subscription.create` all called; returned user email is normalised to lowercase |
| `rejects duplicate register email` | Throws `'Email already in use'` when `user.findFirst` returns an existing user |
| `rejects login with wrong password` | Throws `'Invalid credentials'` when bcrypt compare fails (500ms for real hash computation) |
| `rotates refresh token on refresh` | Old token deleted, new token created in transaction; returned `refreshToken` differs from input |

---

### 10.3 Test Coverage by Domain

| Domain | Unit tested | Integration tested | E2E tested |
|---|---|---|---|
| Auth (register, login, refresh, MFA) | ✅ Partial | ❌ | ❌ |
| Shipment CRUD | ❌ | ✅ (isolation) | ❌ |
| Shipment state machine | ✅ | ❌ | ❌ |
| Tenant isolation | ❌ | ✅ | ✅ (cross_tenant_test.sh) |
| Pricing engine | ✅ | ❌ | ❌ |
| Tracking number generation | ✅ | ❌ | ❌ |
| Tenant middleware | ✅ (tenantMatch) | ❌ | ❌ |
| Fleet / Routes | ❌ | ❌ | ❌ |
| Finance (invoices, payments) | ❌ | ❌ | ❌ |
| CRM (leads, quotes) | ❌ | ❌ | ❌ |
| Webhooks / API keys | ❌ | ❌ | ❌ |
| Returns / Support tickets | ❌ | ❌ | ❌ |
| Notifications | ❌ | ❌ | ❌ |
| Password reset | ❌ | ❌ | ❌ |
| Audit log | ❌ | ❌ | ❌ |
| Plan enforcement / usage limits | ❌ | ❌ | ❌ |

---

## 11. CI Pipeline

File: `.github/workflows/ci.yml`

```
Trigger: push to any branch, PR to master

Services spun up:
  - PostgreSQL 15 (fauward_test / fauward_test)
  - Redis 7

Steps:
  1. Checkout
  2. Setup Node 20
  3. npm ci
  4. npx prisma generate
  5. npx prisma db push --schema=apps/backend/prisma/schema.prisma
  6. npm test (backend Vitest)
  7. Backend build (tsc)
  8. Frontend build (next build)
```

CI sets `DATABASE_URL` and `DIRECT_URL` as environment secrets. Tests run against a real PostgreSQL instance in CI (unlike local Vitest which uses stubs).

---

## 12. Missing and Incomplete Areas

This section documents every confirmed gap between the product specification (README.md), the Prisma schema, and the existing tests. It is intended to drive the next development iteration.

---

### 12.1 Hard Gaps — Models in Spec but Not in Prisma

These tables are defined in the product spec's SQL DDL (README section 8) and in `supabase_init.sql` but are entirely absent from `prisma/schema.prisma`. Without them, the Enterprise tier and cross-border features cannot be implemented.

#### `CarrierConnection`

Stores API credentials for external carrier integrations (DHL, FedEx, UPS, Aramex, DPD, Royal Mail, Delhivery, etc.).

```prisma
model CarrierConnection {
  id         String   @id @default(uuid())
  tenantId   String
  tenant     Tenant   @relation(fields: [tenantId], references: [id])
  carrier    String   // "DHL" | "FEDEX" | "UPS" | "ARAMEX" | "ROYAL_MAIL" ...
  credentials Json    // encrypted at-rest in prod
  isActive   Boolean  @default(true)
  createdAt  DateTime @default(now())

  bookings CarrierBooking[]

  @@index([tenantId])
  @@map("carrier_connections")
}
```

#### `CarrierBooking`

Records a booking placed with an external carrier for a shipment. Enables dual tracking (internal + carrier).

```prisma
model CarrierBooking {
  id               String   @id @default(uuid())
  tenantId         String
  shipmentId       String
  carrierId        String
  carrier          CarrierConnection @relation(fields: [carrierId], references: [id])
  bookingRef       String?
  carrierTracking  String?
  status           String   @default("BOOKED")
  bookingData      Json?
  bookedAt         DateTime @default(now())

  @@index([tenantId])
  @@index([shipmentId])
  @@map("carrier_bookings")
}
```

The `Shipment` model also needs `carrierBookingId String?` and the corresponding relation.

#### `CustomsDeclaration`

Required for cross-border shipments. Enables Enterprise-tier e-invoicing and customs integration (UK CDS, EU AES, ZATCA, eTIMS, etc.).

```prisma
model CustomsDeclaration {
  id              String    @id @default(uuid())
  tenantId        String
  shipmentId      String
  declarationType String    // "EXPORT" | "IMPORT" | "TRANSIT"
  declarationRef  String?
  hsCodes         Json      // [{ code, description, quantity, value }]
  totalValue      Decimal   @db.Decimal(12, 2)
  currency        String
  status          String    @default("DRAFT")
  submittedAt     DateTime?
  clearedAt       DateTime?
  documents       Json?

  tenant   Tenant   @relation(fields: [tenantId], references: [id])
  shipment Shipment @relation(fields: [shipmentId], references: [id])

  @@index([tenantId])
  @@index([shipmentId])
  @@map("customs_declarations")
}
```

The `Shipment` model also needs `customsDeclarationId String?`.

#### `RegionalProfile`

Platform-level (not tenant-level) configuration per geographic region. Drives which payment gateways, currencies, languages, and carriers are available when a tenant signs up in a given region.

```prisma
model RegionalProfile {
  id              String   @id @default(uuid())
  region          String   @unique  // "uk_europe" | "west_africa" | "east_africa" ...
  currencies      String[]
  languages       String[]
  paymentGateways String[]
  config          Json     // carriers, tax modules, customs systems, etc.

  @@map("regional_profiles")
}
```

---

### 12.2 Missing Indexes

These columns are absent from Prisma `@@index` declarations but are standard query filters in the application:

| Table | Column | Why it matters |
|---|---|---|
| `shipments` | `organisationId` | Org-scoped shipment lists are a primary view for `CUSTOMER_ADMIN` users |
| `shipments` | `assignedDriverId` | Driver's own shipment queue — queried constantly from the PWA |
| `invoices` | `status` | Finance dashboard filters by `OVERDUE`, `SENT` daily |
| `payments` | `status` | Payment reconciliation sweeps filter by `PENDING` |
| `leads` | `stage` | CRM pipeline groups leads by stage in a Kanban view |
| `return_requests` | `status` | Returns dashboard filters by `REQUESTED`, `APPROVED` |
| `support_tickets` | `customerId` | Customer's own ticket history |

---

### 12.3 Structural Issues

#### Two sources of truth for plan

`Tenant.plan` (a `TenantPlan` enum) and `Subscription.plan` (a plain String) are independent fields. Feature guards in `featureGuard.ts` read `Tenant.plan`. Billing webhooks from Stripe update `Subscription`. If the sync between them fails silently, users on a cancelled subscription continue to receive Pro features.

**Fix needed:** Define a single source of truth (preferably `Subscription.status` + `Subscription.plan`) and derive `Tenant.plan`/`Tenant.status` from it, or enforce a DB trigger / application constraint that keeps them in sync.

#### Invoice is a hard 1:1 with Shipment

`Invoice.shipmentId` has `@unique`, enforcing exactly one invoice per shipment. Logistics requires:
- Partial invoicing for split deliveries
- A new invoice after voiding the original
- Supplementary charges post-delivery

**Fix needed:** Remove the `@unique` constraint and instead enforce "one active invoice per shipment" in the application layer, or introduce an `invoiceGroupId` concept.

#### `routeId` on `Shipment` has no FK

`Shipment.routeId` is a plain `String?` with no Prisma relation to `Route`. A deleted route leaves orphaned `routeId` strings on shipments.

#### `assignedStaffId` on `Shipment` has no FK

Same pattern as above. `assignedStaffId` is a plain string, not a relation to `User`. Querying the assigned staff user requires an additional lookup.

---

### 12.4 Missing Functionality

#### No `Invitation` model

`User.invitedBy` stores the inviting user's ID as a plain string. There is no model to represent a *pending* invitation (before the invitee creates an account). This means:

- Invite tokens cannot be stored, verified, or expired
- Invite resend is not possible
- The `/api/v1/users/invite` route has no DB table to back the invite state

**Minimum model needed:**

```prisma
model Invitation {
  id        String    @id @default(uuid())
  tenantId  String
  email     String
  role      UserRole
  tokenHash String    @unique
  invitedBy String
  expiresAt DateTime
  acceptedAt DateTime?
  createdAt DateTime  @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
  @@map("invitations")
}
```

#### No `DriverLocationHistory`

`Driver` stores only the current GPS position. There is no historical GPS trail, which makes it impossible to:
- Replay a driver's route for dispatch review or dispute resolution
- Calculate actual route deviation vs planned
- Provide customers with a live-map view of their driver's path

#### No soft-delete on any model

Every model uses hard deletes. Deleting a `User`, `Shipment`, or `Organisation` is permanent and will break any `AuditLog` or `ShipmentEvent` that references that entity (the FKs are nullable, so the rows survive, but the references become unresolvable).

GDPR right-to-erasure and 7-year financial data retention are in direct conflict without a per-record soft-delete mechanism.

**Recommended:** Add `deletedAt DateTime?` to `User`, `Shipment`, `Organisation`, `Driver`, and `Vehicle`. Filter `WHERE deletedAt IS NULL` in all queries via Prisma middleware.

#### No `FeatureFlag` / plan-gate table

Plan limits and feature availability are hardcoded in `planService.ts`. There is no data-driven feature-flag model, which means:

- Granting a Starter tenant temporary access to a Pro feature requires a deploy
- A/B testing features across tenant cohorts is not possible
- The plan → feature mapping cannot be changed at runtime

#### No analytics events table

`UsageRecord` tracks monthly totals but there is no time-series events store for:
- Cohort analysis (which tenants activated within 7 days of signup)
- Funnel analysis (trial → first shipment → payment → conversion)
- Per-tenant health scores (referenced in the spec but unbacked)

#### No organisation contacts model

`Organisation.billingOwnerId` stores a single billing contact as a plain string (no FK). Real B2B operations have multiple contacts per account: a billing contact, an operations contact, and an account manager. A `OrganisationContact` join table is a standard requirement.

#### `Branch.managerId` has no FK

`Branch.managerId` is a plain `String?` with no relation to `User`. A branch's manager cannot be navigated to or validated in queries.

---

### 12.5 Schema Drift — `supabase_init.sql` Is Stale

`supabase_init.sql` at the repository root is an early-stage SQL snapshot. The Prisma schema has grown significantly beyond it. The following models and fields are in Prisma but **not** in `supabase_init.sql`:

**Entire models missing from SQL file:**
`PasswordResetToken`, `ReturnRequest`, `SupportTicket`, `TicketMessage`, `EmailTemplateConfig`, `InAppNotification`, `Surcharge`, `WeightDiscountTier`, `PricingRule`, `PromoCode`

**Fields missing from SQL's existing tables:**
- `tenant_settings`: `emailFromName`, `emailReplyTo`, `opsEmailRecipients`, `serviceTierConfig`, `insuranceConfig`, `taxConfig`, `dimensionalDivisor`, `weightTierConflictPolicy`, `quoteValidityMinutes`, `showPriceBreakdownToCustomer`, `autoInvoiceOnDelivery`, `slaDeliveryHours`, `roundingMode`, `roundingPrecision`
- `shipments`: `promoCodeId`
- `rate_cards`: `minCharge`, `maxCharge`

**Risk:** If any developer or CI pipeline bootstraps a new environment using `supabase_init.sql`, they get a database that is incompatible with the Prisma schema. The `prisma db push` step in CI is the correct source of truth.

**Recommended action:** Either delete `supabase_init.sql` and document that `prisma db push` is the bootstrap mechanism, or regenerate it from Prisma using `prisma migrate diff`.

---

### 12.6 Missing Tests

The following domains have zero test coverage:

| Domain | Risk |
|---|---|
| Finance (invoices, payments, refunds) | Invoice generation logic has no correctness assertions |
| Password reset flow | Token generation, expiry, single-use enforcement untested |
| Plan enforcement (usage limits, feature gates) | 80%/100% threshold logic untested |
| Webhook delivery (HMAC signing, retry logic) | Security-critical code path untested |
| Idempotency middleware | Deduplication logic untested |
| Notification dispatch | Email/SMS routing logic untested |
| API key auth path | Alternative auth route untested |
| MFA validate flow | TOTP verification untested |
| Return request lifecycle | State transitions untested |
| Support ticket flow | Message threading untested |
| Pricing rule engine | Complex rule evaluation (conditions JSON, priority, stopAfter) untested |
| PromoCode validation | Expiry, maxUses, customerIds allowlist untested |
| Tenant registration edge cases | Slug collision, duplicate domain untested |

**Priority order for new tests:**
1. Finance — incorrect invoice/payment logic has direct revenue impact
2. Plan enforcement — incorrect limit enforcement has direct product integrity impact
3. Webhook HMAC signing — security regression would affect all API integrations
4. Idempotency — duplicate shipments or payments are a business-critical failure mode
5. Password reset — token reuse is a security vulnerability

---

## 13. API Reference

**Base URL:** `https://api.fauward.com/v1`

**Authentication:**
- Bearer JWT: `Authorization: Bearer <access_token>`
- API key: `Authorization: Bearer fw_live_<key>` or `X-API-Key: fw_live_<key>`

**Tenant resolution:** The API resolves the tenant from the subdomain (`{slug}.fauward.com`), `X-Tenant-ID` header, or the API key's owning tenant.

**Standard error format (RFC 7807):**

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE",
  "statusCode": 422,
  "details": [{ "field": "weightKg", "message": "Must be greater than 0" }],
  "requestId": "uuid"
}
```

**Endpoint overview:**

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/auth/register` | None | Register new tenant + admin user |
| `POST` | `/auth/login` | None | Login; returns access + refresh tokens |
| `POST` | `/auth/refresh` | None | Rotate refresh token |
| `POST` | `/auth/logout` | Bearer | Revoke refresh token |
| `GET` | `/auth/me` | Bearer | Current user + tenant info |
| `POST` | `/auth/mfa/setup` | Bearer | Generate TOTP secret + QR |
| `POST` | `/auth/mfa/verify` | Bearer | Verify TOTP and enable MFA |
| `POST` | `/auth/mfa/validate` | Bearer | Validate TOTP on login |
| `POST` | `/auth/forgot-password` | None | Send reset email |
| `POST` | `/auth/reset-password` | None | Consume token, set new password |
| `GET` | `/shipments` | Bearer | List shipments (paginated, filterable) |
| `POST` | `/shipments` | Bearer | Create shipment (pricing calculated server-side) |
| `GET` | `/shipments/:id` | Bearer | Get shipment detail |
| `PATCH` | `/shipments/:id/status` | Bearer | Transition status (state machine enforced) |
| `PATCH` | `/shipments/:id/assign` | Bearer | Assign driver/staff |
| `DELETE` | `/shipments/:id` | Bearer | Cancel shipment |
| `GET` | `/tracking/:trackingNumber` | None (public) | Public tracking endpoint |
| `POST` | `/payments/intent` | Bearer | Create payment intent |
| `GET` | `/payments/:shipmentId` | Bearer | Get payment for shipment |
| `POST` | `/webhooks/stripe` | Stripe signature | Stripe event receiver |
| `GET` | `/invoices` | Bearer | List invoices |
| `POST` | `/invoices` | Bearer | Create invoice |
| `GET` | `/invoices/:id` | Bearer | Get invoice |
| `POST` | `/invoices/:id/send` | Bearer | Send invoice to customer |
| `GET` | `/quotes` | Bearer | List quotes |
| `POST` | `/quotes` | Bearer | Create quote |
| `PATCH` | `/quotes/:id` | Bearer | Update / accept / reject quote |
| `GET` | `/users/me` | Bearer | Current user profile |
| `PATCH` | `/users/me` | Bearer | Update profile |
| `GET` | `/users` | Bearer | List tenant users |
| `POST` | `/users/invite` | Bearer | Invite staff by email |
| `GET` | `/analytics/overview` | Bearer | Dashboard KPI summary |
| `GET` | `/analytics/shipments` | Bearer | Shipment volume trends |
| `GET` | `/analytics/revenue` | Bearer | Revenue breakdown |
| `GET` | `/usage` | Bearer | Current month usage vs limits |
| `POST` | `/webhooks` | Bearer | Register webhook endpoint |
| `GET` | `/webhooks` | Bearer | List endpoints |
| `GET` | `/api-keys` | Bearer | List API keys |
| `POST` | `/api-keys` | Bearer | Generate new API key |
| `DELETE` | `/api-keys/:id` | Bearer | Revoke key |

---

## 14. WebSocket Events

**Connection:** `wss://api.fauward.com/tracking`

```
Client → Server:
  { "type": "subscribe", "trackingNumber": "FWD-202506-A3F9K2" }
  { "type": "unsubscribe", "trackingNumber": "FWD-202506-A3F9K2" }

Server → Client:
  { "type": "status_update", "data": { "status": "OUT_FOR_DELIVERY", "location": {...}, "timestamp": "..." } }
  { "type": "subscribed", "trackingNumber": "FWD-202506-A3F9K2" }
  { "type": "error", "message": "Tracking number not found" }
```

Connections are tenant-scoped. The Socket.io Redis adapter ensures updates broadcast correctly across multiple API instances.

---

## 15. Security Model

| Control | Implementation |
|---|---|
| Password hashing | bcrypt, cost factor 12 |
| Access token | JWT RS256, 15-minute expiry |
| Refresh token | JWT HS256, 7-day expiry, hashed + stored in DB, rotated on every use |
| MFA | TOTP (RFC 6238), 30-second window, backup codes |
| SSO (Enterprise) | SAML 2.0 / OIDC, JIT user provisioning |
| API key storage | bcrypt hashed; prefix only shown in UI after creation |
| Webhook signing | HMAC-SHA256 over payload; `X-Webhook-Signature` header |
| Tenant isolation | Prisma middleware injects `tenantId` on all queries |
| Rate limiting | 100 req/min general, 10/min auth endpoints, per-API-key limits |
| Input validation | Zod schemas on all request bodies and query params |
| SQL injection | Prisma ORM exclusively — no raw SQL anywhere |
| File upload security | ClamAV scan, S3 signed URLs (1-hour expiry) |
| Impersonation (Super Admin) | Audit logged, 30-minute session cap |
| Secrets | AWS Secrets Manager — no secrets in code or env files in production |

---

## 16. Contribution Guide

### Branch naming

```
feat/short-description
fix/short-description
chore/short-description
```

### Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):
```
feat(shipments): add carrier booking FK to shipment model
fix(auth): prevent refresh token reuse after rotation
chore(deps): bump prisma to 5.14
```

### Before opening a PR

```bash
# From backend directory
npm test          # all 16 tests must pass
npx tsc --noEmit  # type check must be clean
```

### Adding a new model

1. Add to `apps/backend/prisma/schema.prisma`
2. Run `npx prisma db push` locally
3. Run `npx prisma generate` to regenerate the client
4. Add the model to the relevant `Tenant` relations if it is tenant-scoped
5. Ensure the Prisma middleware in `plugins/prisma.ts` covers the new model's operations with `tenantId` injection
6. Write at least one unit test covering the new model's primary business logic

### Adding a new route

1. Create `src/modules/{domain}/{domain}.routes.ts`
2. Register it in `src/app.ts`
3. Add Zod validation schemas
4. Apply `requireTenantMatch()`, `requireRole()`, and `requireFeature()` as appropriate
5. Write a Vitest test mocking Prisma for the primary happy path and at least one error case

### Environment setup for new contributors

The Vitest config in `apps/backend/vitest.config.ts` provides all required stub environment variables for tests. You do not need a running database to run the test suite.

For running the full server locally, see §4.
