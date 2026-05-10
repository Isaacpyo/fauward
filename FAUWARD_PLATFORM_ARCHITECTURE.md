# Fauward Platform Architecture
## System Design, Competitive Gap Analysis, and Service Expansion Roadmap

> **Audience:** Engineering leads, product owners, LLM coding agents working in this repository.
> **Purpose:** Define what Fauward is, what it needs to become, and the exact sequence and design to get there.
> **Codebase snapshot:** 2026-05-10

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Platform State](#2-current-platform-state)
3. [Competitor Benchmark](#3-competitor-benchmark)
4. [Feature Gap Matrix](#4-feature-gap-matrix)
5. [Recommended New Services](#5-recommended-new-services)
6. [Top 6 Services to Build First](#6-top-6-services-to-build-first)
7. [Service Architecture](#7-service-architecture)
8. [Shared Packages](#8-shared-packages)
9. [Data Model Recommendations](#9-data-model-recommendations)
10. [API Route Recommendations](#10-api-route-recommendations)
11. [Event and Webhook System](#11-event-and-webhook-system)
12. [Frontend Recommendations](#12-frontend-recommendations)
13. [Prioritised Roadmap](#13-prioritised-roadmap)
14. [Implementation Prompts — Top 6 Services](#14-implementation-prompts--top-6-services)
15. [AI Model Strategy — DeepSeek Flash vs Pro](#15-ai-model-strategy--deepseek-flash-vs-pro)
16. [Risks and Warnings](#16-risks-and-warnings)
17. [Final Recommendation](#17-final-recommendation)

---

## 1. Executive Summary

Fauward is a white-label logistics SaaS platform targeting courier, freight, last-mile, and regional logistics operators across the UK, Africa, and MENA. Its primary value proposition is giving logistics businesses a fully branded, multi-tenant operations platform without building it themselves.

**The platform is architecturally solid.** The monorepo (Turborepo), multi-tenant Prisma schema, modular backend, shared packages, Python async workers, and driver app represent serious engineering investment.

**The commercial gap is in operational depth.** Features that logistics buyers evaluate before paying — carrier rate shopping, label generation, customs handling, shipping rules automation, returns, and a proper developer API — are present in skeleton form but not yet production-grade.

**The priority is not to add more features. It is to finish and harden the ones that already exist in partial form.** Buyers for logistics SaaS care less about feature count and more about whether the core workflow — book, price, label, track, deliver, return — works end-to-end without gaps.

---

## Current Implementation Update - 2026-05-10

The May 2026 implementation run completed the operational, commercial, AI, and tenant-portal workstreams described in this architecture document.

| Area | Status | Notes |
|------|:------:|-------|
| Phase 1 - Operational core | COMPLETE | Rating, labels, webhook retry/dead-letter/replay, API key scopes/sandbox, and usage analytics are implemented and tested. |
| Phase 2 - Commercial core | COMPLETE | Shipping rules, customs orchestration, returns workflow, tracking events, and reverse pickup support are implemented and tested. |
| Phase 3 - AI layer | COMPLETE | `LLMGatewayService`, Relay AI, Tracking AI, exceptions, SLA policies, and control tower health are implemented and tested. |
| Tenant portal additions | COMPLETE | `/rates`, `/shipping-rules`, `/labels`, `/customs/:shipmentId`, `/returns`, and `/developer` are implemented against live APIs. |
| Verification | COMPLETE | Backend Vitest reached 149 passing tests; backend, tenant portal, and Fauward-Go TypeScript checks passed in the final verification run. |
| Prisma deployment | DEFERRED LOCALLY | Prisma generate is clean. Migration files are present; local `migrate status` is blocked by direct Supabase port 5432 network access and should run in CI/CD or a network with direct DB access. |

All AI calls route through `apps/backend/src/shared/services/llm-gateway.service.ts`. Relay AI output is always saved as a draft and customer delivery requires `POST /api/v1/tenant/relay/messages/:id/approve-and-send`.

---

## 2. Current Platform State

### 2.1 Repository Structure

```
fauward/
├── apps/
│   ├── backend/            # Node.js / Fastify API (26 modules, Prisma/Postgres)
│   ├── frontend/           # Next.js marketing + public pages
│   ├── tenant-portal/      # Vue.js tenant dashboard
│   ├── super-admin/        # Vue.js platform admin
│   ├── admin/              # Admin interface
│   ├── agents/             # AI agent management UI
│   ├── fauward-Go/         # Vue.js driver/field operations app (offline-capable)
│   ├── widget/             # Next.js embeddable booking/tracking widget
│   └── python-services/    # FastAPI + Celery async workers (ML, OCR, PDF, routing)
├── packages/
│   ├── brand/              # Brand assets
│   ├── design-tokens/      # Design system tokens
│   ├── domain-types/       # Shared TypeScript domain models
│   ├── formatting/         # Date, currency, phone formatters
│   ├── relay-api/          # Relay AI service API client
│   ├── relay-ui/           # Relay UI component library
│   ├── shared-types/       # Common TypeScript types
│   ├── tenant-db/          # Tenant database utilities
│   ├── theme-engine/       # Dynamic tenant branding/theming
│   ├── tracking-core/      # Core tracking domain types
│   └── widget-sdk/         # Embeddable widget SDK
└── supabase/               # Migrations, RLS policies
```

### 2.2 Module Audit

| Module | Status | Notes |
|--------|--------|-------|
| `auth` | IMPLEMENTED | Firebase token + custom JWT, multi-tenant |
| `tenants` | IMPLEMENTED | Branding, domain, plan, usage services |
| `users` | IMPLEMENTED | 8 roles across tenant and customer |
| `shipments` | IMPLEMENTED | Booking flow includes rating links, shipping-rule evaluation, customs flags, sandbox scoping, and tracking integration |
| `tracking` | IMPLEMENTED | TrackingEvent, TrackingSnapshot, public/platform/go routes, 80+ event types |
| `pricing` | IMPLEMENTED | RateCard, Surcharge, WeightTier, PricingRule, PromoCode models and rating integration |
| `documents` | IMPLEMENTED | Label generation, reprint handling, tenant branding, manifests, packing slips, and worker integration |
| `returns` | IMPLEMENTED | Create, approve, reject, reverse label, receive-at-hub, tracking events, public status, and analytics |
| `webhooks` | IMPLEMENTED | HMAC signing, event idempotency header, retry schedule, dead-letter queue, replay, and failure visibility |
| `api-keys` | IMPLEMENTED | Scoped keys, sandbox isolation, usage records, and per-key usage analytics |
| `notifications` | PARTIAL | Templates + service — **branded tracking page, WhatsApp, reschedule request not confirmed** |
| `relay` | IMPLEMENTED | AI classification and escalation through `LLMGatewayService`, draft-only replies, approve-and-send delivery, KB support, handoff, and tracking integration. See [docs/relay.md](./docs/relay.md) |
| `payments` | PARTIAL | Stripe + billing service — **Paystack, tenant customer payment collection, wallet not confirmed** |
| `analytics` | IMPLEMENTED | Operational analytics plus returns analytics, API usage analytics, exception metrics, and control tower health |
| `audit` | PARTIAL | Routes exist — **PlatformAuditLog model present; completeness unclear** |
| `driver` | PARTIAL | Routes exist; Fauward-Go app has jobs/stops/POD/location |
| `fleet` | PARTIAL | Routes exist — **carrier accounts, external carrier integration not present** |
| `route` | PARTIAL | Route + RouteStop models — **optimization via Python workers; dispatch integration unclear** |
| `pod` | IMPLEMENTED | ProofOfDelivery model with signature, photo, OTP, name capture |
| `crm` | PARTIAL | Leads + organisation models — **depth unclear** |
| `support` | PARTIAL | SupportTicket + TicketMessage — **integration with relay unclear** |
| `agent` | IMPLEMENTED | Policy-controlled agent layer routed through the LLM gateway with tenant-scoped tools and audit records |
| `platform` | IMPLEMENTED | Control plane routes, platform health, webhook failure visibility, and technical reference docs |
| `super-admin` | PARTIAL | Routes present — **scope and coverage unclear** |
| `customs` | IMPLEMENTED | Node orchestrator, Python worker queue integration, HS lookup proxy, restricted-items route, and tracking events |
| `address-validation` | NOT FOUND | Not present in any module |
| `shipping-rules` | IMPLEMENTED | Tenant-scoped IF/THEN rules engine, dry-run endpoint, booking integration, and AuditLog triggers |
| `claims` | NOT_FOUND | No ClaimService, no claim routes |
| `hub-operations` | NOT_FOUND | No HubScan, no manifests, no bin/location |
| `integration-marketplace` | PARTIAL | AccountingConnection model — **no connector framework, no Shopify/WooCommerce** |
| `control-tower` | IMPLEMENTED | ExceptionCase, SlaPolicy, stuck shipment detector, tenant exceptions, and platform health endpoints |

### 2.3 Python Services

The Python layer handles compute-heavy async tasks via Celery:

| Worker | Purpose |
|--------|---------|
| `analytics_worker` | Batch analytics processing |
| `customs_worker` | Customs declaration processing |
| `ml_worker` | ML predictions, recommendations, feedback |
| `notifications_worker` | Email/SMS/push delivery |
| `ocr_worker` | Document OCR extraction |
| `pdf_worker` | PDF label/document generation |
| `pricing_worker` | Async pricing calculations |
| `route_worker` | Route optimisation |

**This is solid infrastructure.** The gap is that several Python services (customs, OCR, ML) are not exposed through Node.js tenant-facing API routes.

### 2.4 Database Schema Summary

84 Prisma models across: platform/auth, tenants, users, shipments, tracking, pricing/finance, documents, routes, POD, CRM, support, webhooks, API keys, audit. Full tenant isolation via `tenantId` on all operational models.

**Models confirmed to exist:** `Shipment`, `ShipmentItem`, `ShipmentEvent`, `TrackingEvent`, `TrackingSnapshot`, `TrackingShare`, `ProofOfDelivery`, `RateCard`, `Surcharge`, `WeightDiscountTier`, `PricingRule`, `PromoCode`, `Quote`, `Invoice`, `Payment`, `Refund`, `ReturnRequest`, `Route`, `RouteStop`, `ApiKey`, `WebhookEndpoint`, `WebhookDelivery`, `AuditLog`, `PlatformAuditLog`, `OutboxEvent`, `SupportTicket`, `AccountingConnection`, `Lead`

**Models now implemented from the May 2026 build:** `CarrierAccount`, `CarrierServiceLevel`, `RateQuote`, `ShippingRule`, `GeneratedLabel`, `CustomsDeclaration`, `ExceptionCase`, `SlaPolicy`, `TenantAiUsage`, `TenantAiLimit`, and `AiAgentRun`.

**Models still outside the completed May 2026 scope:** `AddressValidationResult`, `HubScanEvent`, `Claim`, `InsurancePolicy`, and a generalized `IntegrationConnection` framework.

---

## 3. Competitor Benchmark

### 3.1 Platform Categories

| Category | Examples | Core Differentiators |
|----------|---------|----------------------|
| Multi-carrier shipping | ShipStation, Shippo, Easyship, Sendcloud | Rate shopping, 40+ carriers, label generation, returns |
| Post-purchase / WISMO | AfterShip, parcelLab, Loop Returns | Branded tracking, EDD, returns portal, CSAT |
| Digital freight / supply chain | Flexport, Freightos, Logward | Visibility, AI, control tower, supplier collaboration |
| Courier / last-mile dispatch | Onfleet, Tookan, Bringg, Track-POD | Route optimisation, driver dispatch, real-time map |
| Freight forwarding software | Logistaas, Forward Solutions, Magaya | Customs, HS codes, commercial invoices, AWB |

### 3.2 Capability Checklist

| Capability | ShipStation | Shippo | AfterShip | Flexport | Onfleet | Fauward |
|-----------|:-----------:|:------:|:---------:|:--------:|:-------:|:-------:|
| Multi-carrier rate shopping | yes | yes | - | yes | - | Implemented |
| Label generation | yes | yes | - | - | - | Implemented |
| Customs / HS codes | yes | yes | - | yes | - | Implemented |
| Returns portal | yes | yes | yes | - | - | Implemented |
| Branded tracking page | ✓ | — | ✓ | — | — | Unclear |
| EDD / delivery date prediction | — | — | ✓ | — | — | Not found |
| Shipping rules automation | yes | - | - | - | - | Implemented |
| Route optimisation | — | — | — | ✓ | ✓ | Python worker |
| Driver app / POD | ✓ | — | — | — | ✓ | Implemented (Go) |
| Control tower / exceptions | - | - | - | yes | yes | Implemented |
| Webhooks | yes | yes | yes | yes | yes | Implemented |
| API keys + sandbox | yes | yes | yes | yes | yes | Implemented |
| Claims / insurance | — | ✓ | ✓ | — | — | Not found |
| Integration marketplace | ✓ | ✓ | ✓ | ✓ | ✓ | Accounting only |
| Analytics / BI | ✓ | — | ✓ | ✓ | ✓ | Partial |
| AI operations | - | - | - | yes | - | Implemented |
| Hub / warehouse-lite | ✓ | — | — | — | — | Not found |
| Multi-tenant white-label | — | — | — | — | — | **Core strength** |
| Region-specific (Africa/MENA) | — | — | — | — | — | **Core strength** |

---

## 4. Feature Gap Matrix

| Capability | Fauward State | Competitor Standard | Gap Severity | Recommended Action | Target Module |
|-----------|:-------------:|:-------------------:|:------------:|-------------------|---------------|
| Carrier rate shopping | IMPLEMENTED | Industry standard (Shippo, Easyship) | CLOSED | Maintain carrier adapters and rate-card coverage | `modules/rating/` |
| Label generation | IMPLEMENTED | Industry standard | CLOSED | Maintain worker reliability and print formats | `modules/documents/` |
| Shipping rules automation | IMPLEMENTED | Strong differentiator (Sendcloud) | CLOSED | Expand rule templates and UI presets | `modules/shipping-rules/` |
| Customs / trade compliance | IMPLEMENTED | Required for intl routes (Easyship) | CLOSED | Maintain Python worker and restricted item data | `modules/customs/` |
| Returns workflow | IMPLEMENTED | Industry standard | CLOSED | Expand refund integrations and customer UX | `modules/returns/` |
| Address validation | NOT_FOUND | Standard (Shippo, Sendcloud) | HIGH | Build + integrate landmark support for Africa | `modules/address-validation/` |
| Control tower / exceptions | IMPLEMENTED | Enterprise standard (Flexport, Onfleet) | CLOSED | Tune detector thresholds and health scoring | `modules/control-tower/` |
| Branded tracking page | UNCLEAR | Strong differentiator (AfterShip) | HIGH | Confirm + harden public tracking surface | `apps/widget/` |
| Webhook reliability | IMPLEMENTED | Industry standard | CLOSED | Monitor dead-letter replay and endpoint health | `modules/webhooks/` |
| Developer API + sandbox | IMPLEMENTED | Industry standard | CLOSED | Expand scopes and developer docs | `modules/api-keys/` |
| Customer payment collection | PARTIAL | Required for B2C tenants | HIGH | Add Paystack, payment links, cash-on-delivery | `modules/payments/` |
| WhatsApp notifications | NOT_CONFIRMED | Strong for Africa/MENA (Twilio) | MEDIUM | Add WhatsApp channel to notifications | `modules/notifications/` |
| EDD / delivery prediction | NOT_FOUND | AfterShip core feature | MEDIUM | Use ML worker to predict delivery date | `python-services/` |
| Claims / shipment protection | NOT_FOUND | Upsell product (AfterShip, Shippo) | MEDIUM | Build claim submission + approval workflow | `modules/claims/` |
| Hub / warehouse-lite | NOT_FOUND | Differentiator (ShipStation) | MEDIUM | Scan-in/scan-out, bin location, manifests | `modules/hub-operations/` |
| Integration marketplace | PARTIAL | Sticky feature (Shippo, ShipStation) | MEDIUM | Shopify, WooCommerce connectors | `modules/integrations/` |
| Carbon reporting | NOT_FOUND | Growing ESG requirement | LOW | Per-shipment CO2 estimate | `modules/sustainability/` |
| Fraud / risk scoring | NOT_FOUND | Enterprise fraud prevention | LOW | Address + order anomaly detection | `modules/fraud/` |

---

## 5. Recommended New Services

### 5.1 RatingService / CarrierRateService

**Why it matters:** Without rate shopping, tenants cannot compare carriers or prices. Every serious logistics platform exposes this. It is the first thing an operations manager checks before booking.

**Fits ICP:** Yes. UK→Africa lanes have wildly different carrier rates per weight band and region.

**MVP scope:**
- Accept `{origin, destination, weight, dimensions, serviceType}` and return a list of `RateQuote` objects
- Support internal fleet pricing (from existing `RateCard` + `PricingRule`) and at least 2 external carrier APIs
- Rank by price / speed / tenant preference

**Enterprise scope:**
- Real-time carrier API polling with caching
- Fuel surcharge overlays
- Volumetric weight calculation
- Tenant-configured carrier preferences and blacklists
- Surcharge transparency (customs, insurance, remote area)

**Backend modules:** `modules/rating/` — `rating.service.ts`, `rating.routes.ts`, `carrier-account.service.ts`

**Data models needed:** `CarrierAccount`, `CarrierServiceLevel`, `RateQuote`

**APIs:** `POST /api/v1/tenant/rates/quote`

**Events:** `rate.quoted`

**Dependencies:** Existing `PricingRule`, `RateCard`, `Surcharge`, `WeightDiscountTier` models; external carrier API credentials

---

### 5.2 ShippingRulesService / AutomationRulesService

**Why it matters:** Removes manual carrier/route decisions. Sendcloud built a significant market position on this one feature. Tenants with 100+ shipments/day will not use a platform that requires manual selection every time.

**Fits ICP:** Yes. Especially for tenants running UK→Nigeria express vs economy routes.

**MVP scope:**
- Rule model: `IF condition group THEN action list`
- Conditions: destination country, weight, dimensions, declared value, service type, customer tag, origin branch
- Actions: assign carrier, assign route, require customs declaration, add insurance, block booking, alert operator
- Rule evaluation order with priority
- Rule test sandbox (dry-run against a shipment)

**Enterprise scope:**
- Time-based rules (e.g. after 3pm use next-day carrier)
- Tenant-scoped rule libraries with clone/share
- A/B rule testing
- Rule performance analytics (how often triggered, carrier outcome, delivery success)

**Backend modules:** `modules/shipping-rules/` — new module; `rules.routes` currently in pricing should migrate here

**Data models needed:** `ShippingRule`, `ShippingRuleCondition`, `ShippingRuleAction`

**APIs:** `GET/POST /api/v1/tenant/shipping-rules/`, `POST /api/v1/tenant/shipping-rules/:id/test`

**Events:** `shipping_rule.triggered`, `shipping_rule.skipped`

---

### 5.3 LabelService / DocumentGenerationService

**Why it matters:** Tenants cannot operate without shipping labels. This is table stakes. The Python `pdf_worker` exists; the gap is a clean, tenant-facing, multi-format label pipeline integrated into the shipment booking flow.

**Fits ICP:** Yes — every shipment needs a label.

**MVP scope:**
- Generate label from confirmed shipment (PDF + ZPL for thermal printers)
- Barcode and QR code on label
- Tenant branding (logo, colours) on label
- Download + reprint from tenant portal
- Packing slip generation

**Enterprise scope:**
- Bulk label generation
- Airway bill (AWB) generation
- Pickup manifest
- Delivery manifest
- Commercial invoice (feeds into customs)
- POD document assembly

**Backend modules:** `modules/documents/` — existing module needs completing; `label.routes.ts` already exists

**Data models needed:** `GeneratedLabel`, `GeneratedDocument` (confirm against existing `ShipmentDocument`)

**APIs:**
```
POST /api/v1/tenant/shipments/:id/labels
GET  /api/v1/tenant/shipments/:id/labels/:labelId
POST /api/v1/tenant/shipments/:id/documents/commercial-invoice
POST /api/v1/tenant/manifests/pickup
POST /api/v1/tenant/manifests/delivery
```

**Events:** `label.generated`, `document.generated`

**Dependencies:** Python `pdf_worker`; tenant branding from `packages/theme-engine`

---

### 5.4 CustomsService / TradeComplianceService

**Why it matters:** Fauward's positioning is UK → Africa → MENA. Every cross-border shipment in these lanes requires customs documentation. This is not optional — it is a compliance requirement. The Python service already exists; it is not yet a first-class tenant feature.

**Fits ICP:** Core requirement for target market.

**MVP scope:**
- Customs declaration form per shipment (commodity, HS code, value, origin, DDP/DDU)
- Commercial invoice generation (feeds `DocumentGenerationService`)
- HS code lookup / suggestion (via `lib/hs_lookup.py` — already exists in Python)
- Prohibited item check
- DDP vs DDU toggle

**Enterprise scope:**
- Duty/tax estimate at booking time
- Customs hold tracking
- Customs document upload (from carrier)
- Restricted goods database
- UK export declarations
- Country-specific customs form templates (e.g. CN22, CN23 for postal)

**Backend modules:** `modules/customs/` — new Node.js module; bridge to existing Python `customs_worker`

**Data models needed:** `CustomsDeclaration`, `CustomsItem` (line items), `DutyEstimate`

**APIs:**
```
POST /api/v1/tenant/shipments/:id/customs/declaration
GET  /api/v1/tenant/shipments/:id/customs/declaration
POST /api/v1/tenant/customs/hs-lookup
GET  /api/v1/tenant/customs/restricted-items?country=
```

**Events:** `customs.declaration.created`, `customs.hold`, `customs.released`

---

### 5.5 ReturnsService / ReverseLogisticsService

**Why it matters:** AfterShip and Shippo both use returns as a premium product. A logistics platform without returns handling forces tenants to manage reverse logistics manually or use a separate tool — increasing churn risk.

**Fits ICP:** Yes, especially B2C tenants.

**MVP scope:**
- Customer initiates return request (reason, item list, photo)
- Tenant approves or rejects
- Return label generation (reverse label)
- Reverse pickup scheduling
- Return status tracking (same TrackingEvent system)
- Refund/replacement status link

**Enterprise scope:**
- Return reason analytics
- Return-to-sender vs return-to-hub routing
- Failed delivery auto-return workflow
- Bulk return processing
- Carrier-specific return label formats

**Backend modules:** `modules/returns/` — routes already exist; complete the service layer

**Data models needed:** `ReturnRequest` (already exists — confirm fields: `reason`, `items`, `status`, `approvedAt`, `labelId`, `refundStatus`), `ReturnEvent`

**APIs:**
```
POST /api/v1/tenant/returns/
GET  /api/v1/tenant/returns/:id
POST /api/v1/tenant/returns/:id/approve
POST /api/v1/tenant/returns/:id/reject
POST /api/v1/tenant/returns/:id/label
GET  /api/v1/customer/returns/:id/status
```

**Events:** `return.requested`, `return.approved`, `return.rejected`, `return.received`, `return.label.generated`

---

### 5.6 ControlTowerService / ExceptionManagementService

**Why it matters:** Enterprise logistics buyers specifically ask for this. It is the difference between a tool that shows data and a platform that manages operations. Flexport and Onfleet both position around this. Fauward already has the event data — it just needs the detection and alerting layer.

**Fits ICP:** Yes for operations managers and platform admins.

**MVP scope:**
- Stuck shipment detection (no status update in X hours based on expected SLA)
- Failed delivery queue
- Customs hold queue
- Carrier update failure alerts
- Per-tenant health score

**Enterprise scope:**
- SLA breach prediction (before it happens)
- Driver no-update alerts
- Webhook delivery failure queue
- Tenant health score with trend
- Exception assignment and resolution workflow
- Escalation rules

**Backend modules:** `modules/control-tower/` (new), `modules/exceptions/` (new), `modules/sla/` (new)

**Data models needed:** `ExceptionCase`, `SlaPolicy`, `SlaBreachEvent`

**APIs:**
```
GET  /api/v1/tenant/exceptions/
POST /api/v1/tenant/exceptions/:id/resolve
GET  /api/v1/platform/control-tower/health
GET  /api/v1/platform/control-tower/tenants/:tenantId/health
```

**Events:** `exception.created`, `exception.resolved`, `sla.breach.predicted`, `sla.breach.confirmed`

---

### 5.7 CustomerNotificationService (WISMO reduction)

**Why it matters:** "Where is my order?" support tickets are the single highest volume support category for any logistics operation. AfterShip built a $2B company on solving this. Fauward's `relay` module and `notifications` module partially overlap here — they need to be unified into a coherent WISMO solution.

**Fits ICP:** Yes. Essential for tenants with B2C customers.

**MVP scope:**
- Branded tracking page (tenant-branded, embeddable or hosted)
- Email updates at key status changes (booked, picked up, out for delivery, delivered, failed)
- SMS updates (Twilio)

**Enterprise scope:**
- WhatsApp updates
- Estimated delivery date display on tracking page
- Customer delivery reschedule request
- Delivery instruction update
- Failed delivery communication with redelivery link
- CSAT/NPS survey trigger on delivery

**Backend modules:** `modules/notifications/` (extend), `modules/relay/` (WISMO surface)

**APIs:**
```
GET  /api/v1/public/tracking/:trackingNumber        # existing
POST /api/v1/customer/tracking/:trackingNumber/reschedule
POST /api/v1/customer/tracking/:trackingNumber/instructions
GET  /api/v1/tenant/notifications/preferences
POST /api/v1/tenant/notifications/templates/:event
```

---

### 5.8 DeveloperPlatformService

**Why it matters:** API access is a forcing function for enterprise clients. It enables integrations with WMS, ERP, and ecommerce platforms. It also signals platform maturity. `api-keys` module already exists — complete it.

**MVP scope:**
- API key creation with scopes
- Sandbox mode (isolated test environment per tenant)
- Per-key rate limiting
- API usage log (endpoint, status, latency)
- Webhook endpoint management (already partially built)
- Basic API docs

**Enterprise scope:**
- Webhook HMAC signature verification
- Webhook retry with exponential backoff + dead-letter queue
- Event log with replay
- API usage analytics dashboard
- OAuth2 for third-party app integrations

**Backend modules:** `modules/api-keys/` (extend), `modules/webhooks/` (harden)

**Data models needed:** `ApiKeyScope`, `ApiUsageRecord`, `WebhookDeliveryAttempt` (extend existing `WebhookDelivery`)

---

### 5.9 CustomerPaymentService / TenantBillingService

**Why it matters:** Two distinct billing layers must not be confused. Platform billing (tenant pays Fauward) is partly implemented via Stripe. Tenant customer billing (tenant charges their own customers) requires Paystack and payment links for UK/Africa routes.

**Two separate services:**
1. `TenantBillingService` — tenant subscription, usage-based billing, invoicing to Fauward (Stripe, already partially built)
2. `CustomerPaymentService` — tenant collects from their own customers (Paystack, Stripe, cash-on-delivery, payment links, wallet balance)

**MVP scope for CustomerPaymentService:**
- Payment link generation per shipment
- Paystack integration
- Cash-on-delivery marking
- Payment status on shipment

**Enterprise scope:**
- Wallet/balance for repeat customers
- Partial payment
- Instalment support
- Invoice payment
- Automated payment reminders
- Reconciliation dashboard

---

### 5.10 AIOperationsService / FauwardAgentService

**Priority: Phase 5.** Do not build this before the operational foundation. The `agent` and `relay` modules already exist and provide a foundation. Expand AI operations only after tracking, rating, labels, customs, returns, and webhooks are solid.

**Model strategy:** Use a hybrid of DeepSeek-V4-Flash (preprocessing, classification, drafting) and DeepSeek-V4-Pro (reasoning, decisions, actions). All AI calls route through a single `LLMGatewayService`. See [Section 15](#15-ai-model-strategy--deepseek-flash-vs-pro) for full routing design.

**Planned capabilities:**
- Suggest best driver/carrier for a shipment (Pro)
- Detect stuck shipments — feeds into ControlTowerService (Pro)
- Summarise tenant health for superadmin (Pro)
- Explain delivery exceptions in plain language to customers (Flash)
- Suggest HS codes — already in Python `hs_lookup.py` (Flash extraction, Pro risk review)
- Draft customer update messages (Flash)
- Classify support messages — feeds into RelayService (Flash)
- Detect suspicious address/order patterns — FraudRiskService (Pro)

**Agent loop architecture:**
```
Event arrives
  -> Flash: classify + summarise input
  -> Rules engine: check if deterministic action applies
  -> Pro (if needed): reason and select action
  -> Tool call: execute backend action via validated service
  -> AuditLog: record everything
```

**Dangerous actions that always require human approval:**
- refund or compensation decisions
- cancel shipment
- override pricing
- mark as delivered
- suspend tenant
- expose sensitive customer data

---

## 6. Top 6 Services to Build First

In order of priority:

| Priority | Service | Why Now |
|:--------:|---------|---------|
| 1 | **RatingService** | Without pricing/quoting, tenants cannot book shipments commercially |
| 2 | **LabelService** (DocumentGenerationService) | Every shipment needs a label; Python worker exists, just wire it up |
| 3 | **ShippingRulesService** | Removes manual work; strong differentiator; rules.routes stub already exists |
| 4 | **CustomsService** | Required for UK→Africa; Python customs worker already exists |
| 5 | **ReturnsService** | ReturnRequest model and routes exist; complete the workflow |
| 6 | **DeveloperPlatformService** (Webhooks hardening) | API keys + webhooks partially built; finishing them unlocks enterprise integrations |

---

## 7. Service Architecture

### 7.1 Backend Module Structure

Follow the existing 26-module convention at `apps/backend/src/modules/`. Each module owns its own routes, service, schema, and tests.

**New modules to create:**

```
apps/backend/src/modules/
  rating/
    rating.routes.ts
    rating.service.ts
    carrier-account.service.ts
    rating.schema.ts

  shipping-rules/
    shipping-rules.routes.ts
    shipping-rules.service.ts
    shipping-rules.engine.ts       # IF/THEN evaluation logic
    shipping-rules.schema.ts

  customs/
    customs.routes.ts
    customs.service.ts             # bridges to Python customs worker
    hs-lookup.service.ts           # proxies Python hs_lookup.py
    customs.schema.ts

  control-tower/
    control-tower.routes.ts
    control-tower.service.ts
    stuck-shipment.detector.ts
    control-tower.schema.ts

  exceptions/
    exceptions.routes.ts
    exceptions.service.ts
    exceptions.schema.ts

  sla/
    sla.routes.ts
    sla.service.ts
    sla.schema.ts

  hub-operations/
    hub.routes.ts
    hub.service.ts
    hub.schema.ts

  claims/
    claims.routes.ts
    claims.service.ts
    claims.schema.ts

  integrations/
    integrations.routes.ts
    integrations.service.ts
    connector.registry.ts
```

**Modules to extend:**

```
apps/backend/src/modules/
  documents/                       # add label pipeline, AWB, manifests
  returns/                         # complete approval + reverse pickup + analytics
  webhooks/                        # add HMAC, retry, dead-letter
  api-keys/                        # add sandbox, scopes, usage logs
  notifications/                   # add WhatsApp, reschedule request
  payments/                        # add Paystack, payment links, COD
```

### 7.2 Python Services

The Python layer handles compute-heavy tasks. New workers to add:

```
apps/python-services/workers/
  label_worker.py                  # ZPL + PDF label assembly
  address_validation_worker.py     # Postcodes + geocoding + landmark support
  edd_worker.py                    # Estimated delivery date prediction
  exception_detection_worker.py    # Stuck shipment, SLA breach prediction
```

### 7.3 Fauward-Go (Driver App)

The driver app already has `jobs/`, `stops/`, `pod/`, `location/`, `sync/`. Extensions needed:

```
apps/fauward-Go/src/features/
  hub/                             # scan-in / scan-out for warehouse-lite
  returns/                         # driver handles reverse pickup
  customs/                         # driver captures customs reference on pickup
```

---

## 8. Shared Packages

Existing packages are well-structured. Recommended additions:

| Package | What Goes Here |
|---------|---------------|
| `packages/tracking-core` | Already exists — TrackingEvent types, TrackingSnapshot, event type enum |
| `packages/pricing-core` | Rate quote types, surcharge calculation utilities, volumetric weight formula |
| `packages/logistics-events` | Canonical event name constants, event payload types (used by backend outbox and webhook service) |
| `packages/api-contracts` | OpenAPI-style request/response types shared between backend and all frontend apps |
| `packages/notification-templates` | Email/SMS/WhatsApp template definitions; consumed by notifications module and Python worker |
| `packages/customs-types` | HS code types, customs declaration schema, country-specific form types |
| `packages/rbac` | Role and permission definitions, `can(user, action, resource)` utility |

---

## 9. Data Model Recommendations

### Models to Create

```prisma
model CarrierAccount {
  id            String   @id @default(cuid())
  tenantId      String
  tenant        Tenant   @relation(fields: [tenantId], references: [id])
  name          String
  carrier       String   // "DHL" | "FedEx" | "InternalFleet" | etc.
  credentials   Json     // encrypted carrier API credentials
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model CarrierServiceLevel {
  id                String   @id @default(cuid())
  carrierAccountId  String
  carrierAccount    CarrierAccount @relation(fields: [carrierAccountId], references: [id])
  name              String   // "Express", "Economy", "Same Day"
  transitDays       Int?
  regions           String[] // applicable region codes
  isActive          Boolean  @default(true)
}

model RateQuote {
  id                    String   @id @default(cuid())
  tenantId              String
  shipmentId            String?
  origin                Json
  destination           Json
  weightKg              Float
  volumetricWeightKg    Float?
  quotes                Json     // array of carrier quotes
  selectedCarrier       String?
  selectedServiceLevel  String?
  expiresAt             DateTime
  createdAt             DateTime @default(now())
}

model ShippingRule {
  id          String   @id @default(cuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  name        String
  isActive    Boolean  @default(true)
  priority    Int      @default(0)
  conditions  Json     // array of { field, operator, value }
  actions     Json     // array of { type, value }
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model GeneratedLabel {
  id          String   @id @default(cuid())
  tenantId    String
  shipmentId  String
  shipment    Shipment @relation(fields: [shipmentId], references: [id])
  format      String   // "PDF" | "ZPL" | "PNG"
  url         String
  carrier     String?
  barcodeData String?
  generatedAt DateTime @default(now())
}

model CustomsDeclaration {
  id            String   @id @default(cuid())
  tenantId      String
  shipmentId    String   @unique
  shipment      Shipment @relation(fields: [shipmentId], references: [id])
  type          String   // "DDP" | "DDU"
  items         Json     // array of { description, hsCode, quantity, value, weight, origin }
  totalValue    Float
  currency      String
  documents     Json?    // uploaded document references
  status        String   // "DRAFT" | "SUBMITTED" | "CLEARED" | "HELD" | "REJECTED"
  holdReason    String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model ExceptionCase {
  id          String   @id @default(cuid())
  tenantId    String
  shipmentId  String?
  type        String   // "STUCK" | "FAILED_DELIVERY" | "CUSTOMS_HOLD" | "NO_DRIVER_UPDATE" | "WEBHOOK_FAILURE"
  severity    String   // "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"
  status      String   // "OPEN" | "IN_PROGRESS" | "RESOLVED" | "ESCALATED"
  assignedTo  String?
  notes       String?
  resolvedAt  DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model SlaPolicy {
  id                    String   @id @default(cuid())
  tenantId              String
  name                  String
  serviceType           String?
  pickupWindowHours     Int
  deliveryWindowHours   Int
  escalationHours       Int
  isDefault             Boolean  @default(false)
  createdAt             DateTime @default(now())
}

model HubScanEvent {
  id          String   @id @default(cuid())
  tenantId    String
  shipmentId  String
  hubId       String?
  action      String   // "SCAN_IN" | "SCAN_OUT" | "DAMAGED" | "TRANSFERRED"
  scannedBy   String   // userId
  location    String?
  binCode     String?
  notes       String?
  createdAt   DateTime @default(now())
}

model Claim {
  id          String   @id @default(cuid())
  tenantId    String
  shipmentId  String
  type        String   // "LOST" | "DAMAGED" | "STOLEN" | "LATE"
  status      String   // "SUBMITTED" | "UNDER_REVIEW" | "APPROVED" | "REJECTED" | "PAID"
  amount      Float?
  currency    String?
  evidence    Json?    // photo URLs, descriptions
  submittedAt DateTime @default(now())
  resolvedAt  DateTime?
  updatedAt   DateTime @updatedAt
}

model AiAgentRun {
  id          String   @id @default(cuid())
  tenantId    String?
  agentType   String   // "ROUTING" | "EXCEPTION_DETECTION" | "HS_CODE" | "DRAFT_MESSAGE"
  input       Json
  output      Json?
  status      String   // "RUNNING" | "COMPLETED" | "FAILED"
  durationMs  Int?
  createdAt   DateTime @default(now())
}
```

### Models to Extend

| Model | Extension Needed |
|-------|-----------------|
| `ReturnRequest` | Add `reason`, `items` (Json), `labelId`, `refundStatus`, `reversedAt` |
| `WebhookDelivery` | Add `attemptCount`, `nextRetryAt`, `deadLetteredAt`, `hmacSignature` |
| `ApiKey` | Add `scopes` (String[]), `isSandbox` (Boolean), `lastUsedAt`, `monthlyRequestCount` |
| `Shipment` | Add `rateQuoteId`, `carrierAccountId`, `customsDeclarationId`, `insuranceValue` |
| `Notification` | Add `channel` (EMAIL/SMS/WHATSAPP/PUSH), `templateId`, `recipientPhone` |

---

## 10. API Route Recommendations

Group by surface. All routes follow existing `/api/v1/` convention.

### Tenant Portal

```
# Rating
POST   /api/v1/tenant/rates/quote
GET    /api/v1/tenant/rates/carriers
GET    /api/v1/tenant/rates/service-levels

# Shipping Rules
GET    /api/v1/tenant/shipping-rules
POST   /api/v1/tenant/shipping-rules
PUT    /api/v1/tenant/shipping-rules/:id
DELETE /api/v1/tenant/shipping-rules/:id
POST   /api/v1/tenant/shipping-rules/:id/test

# Labels + Documents
POST   /api/v1/tenant/shipments/:id/labels
GET    /api/v1/tenant/shipments/:id/labels/:labelId
POST   /api/v1/tenant/shipments/:id/documents/commercial-invoice
POST   /api/v1/tenant/shipments/:id/documents/packing-slip
POST   /api/v1/tenant/manifests/pickup
POST   /api/v1/tenant/manifests/delivery

# Customs
POST   /api/v1/tenant/shipments/:id/customs/declaration
GET    /api/v1/tenant/shipments/:id/customs/declaration
PUT    /api/v1/tenant/shipments/:id/customs/declaration
POST   /api/v1/tenant/customs/hs-lookup
GET    /api/v1/tenant/customs/restricted-items

# Returns
GET    /api/v1/tenant/returns
POST   /api/v1/tenant/returns
GET    /api/v1/tenant/returns/:id
POST   /api/v1/tenant/returns/:id/approve
POST   /api/v1/tenant/returns/:id/reject
POST   /api/v1/tenant/returns/:id/label

# Exceptions + Control Tower
GET    /api/v1/tenant/exceptions
GET    /api/v1/tenant/exceptions/:id
POST   /api/v1/tenant/exceptions/:id/resolve
GET    /api/v1/tenant/sla-policies
POST   /api/v1/tenant/sla-policies

# Hub Operations
POST   /api/v1/tenant/hub/scan
GET    /api/v1/tenant/hub/shipments/:id/scans
GET    /api/v1/tenant/hub/manifests

# Claims
POST   /api/v1/tenant/claims
GET    /api/v1/tenant/claims/:id
PUT    /api/v1/tenant/claims/:id/status

# Developer Platform
GET    /api/v1/tenant/api-keys
POST   /api/v1/tenant/api-keys
DELETE /api/v1/tenant/api-keys/:id
GET    /api/v1/tenant/webhooks
POST   /api/v1/tenant/webhooks
PUT    /api/v1/tenant/webhooks/:id
DELETE /api/v1/tenant/webhooks/:id
GET    /api/v1/tenant/webhooks/:id/deliveries
POST   /api/v1/tenant/webhooks/:id/test
GET    /api/v1/tenant/api-usage

# Payments (Customer Collection)
POST   /api/v1/tenant/shipments/:id/payment-link
GET    /api/v1/tenant/payments
POST   /api/v1/tenant/payments/:id/mark-cash-on-delivery
```

### Customer / Public Portal

```
GET    /api/v1/public/tracking/:trackingNumber
POST   /api/v1/customer/tracking/:trackingNumber/reschedule
POST   /api/v1/customer/tracking/:trackingNumber/instructions
POST   /api/v1/customer/returns                              # initiate return
GET    /api/v1/customer/returns/:id
POST   /api/v1/customer/payments/:paymentLinkId/pay
GET    /api/v1/public/widget/config/:widgetKey               # existing widget
```

### Fauward-Go (Driver / Field App)

```
GET    /api/v1/go/jobs
GET    /api/v1/go/jobs/:id
PUT    /api/v1/go/shipments/:id/status
POST   /api/v1/go/shipments/:id/pod
POST   /api/v1/go/hub/scan                                   # scan-in/out at hub
PATCH  /api/v1/go/location                                   # driver location update
```

### Platform / Superadmin

```
GET    /api/v1/platform/control-tower/health
GET    /api/v1/platform/control-tower/tenants/:tenantId/health
GET    /api/v1/platform/control-tower/exceptions
GET    /api/v1/platform/webhooks/failures
GET    /api/v1/platform/tracking/health
GET    /api/v1/platform/tenants/:id/api-usage
GET    /api/v1/platform/audit-logs
```

### External API (Public SDK / Integrations)

```
POST   /api/v1/external/shipments
GET    /api/v1/external/shipments/:id
POST   /api/v1/external/rates/quote
GET    /api/v1/external/tracking/:trackingNumber
POST   /api/v1/external/webhooks                             # programmatic webhook registration
GET    /api/v1/external/events                               # event log
```

---

## 11. Event and Webhook System

### 11.1 Canonical Event Names

All events use `noun.verb` dot-notation. Produced by the outbox pattern (`OutboxEvent` model already exists).

```
shipment.created
shipment.booked
shipment.assigned
shipment.picked_up
shipment.in_transit
shipment.out_for_delivery
shipment.delivered
shipment.failed_delivery
shipment.cancelled
shipment.exception.created
shipment.exception.resolved

tracking.event.created
tracking.snapshot.updated

return.requested
return.approved
return.rejected
return.in_transit
return.received
return.label.generated

label.generated
document.generated
customs.declaration.created
customs.hold
customs.released

payment.succeeded
payment.failed
payment.link.created
invoice.created
invoice.paid

pod.uploaded
driver.location.updated
driver.job.accepted

webhook.delivery.failed
webhook.delivery.dead_lettered

rate.quoted
shipping_rule.triggered

exception.created
exception.resolved
sla.breach.predicted
sla.breach.confirmed

claim.submitted
claim.approved
claim.rejected
claim.paid
```

### 11.2 Event Metadata

Each event must carry:

```typescript
{
  id: string           // unique event ID (idempotency)
  type: string         // event name from canonical list
  tenantId: string     // tenant isolation
  shipmentId?: string
  occurredAt: string   // ISO 8601
  source: TrackingSource
  visibility: TrackingVisibility
  webhookEligible: boolean
  auditRequired: boolean
  payload: Record<string, unknown>
}
```

### 11.3 Webhook Reliability Requirements

The current `WebhookDelivery` model must be extended to support:

1. **Retry with exponential backoff** — attempts 1, 2, 4, 8, 16 minutes
2. **Dead-letter queue** — after 5 failed attempts, move to dead-letter state
3. **HMAC-SHA256 signature** — `X-Fauward-Signature` header on every delivery
4. **Idempotency** — `X-Fauward-Event-Id` header on every delivery
5. **Delivery log** — every attempt logged with response code and latency
6. **Manual replay** — superadmin can replay any dead-lettered event

---

## 12. Frontend Recommendations

### 12.1 Tenant Portal (`apps/tenant-portal/`)

Pages to add or harden:

| Page | Status | Action |
|------|--------|--------|
| Rate quote / carrier comparison | Missing | Create: show `RateQuote` options before booking |
| Shipping rules management | Missing | Create: rule builder with condition/action UI |
| Label download + reprint | Partial | Complete: integrate with `GeneratedLabel` |
| Customs declaration form | Missing | Create: per-shipment customs details |
| Returns management | Partial | Complete: approval queue, return tracking |
| Developer / API settings | Partial | Complete: key management, webhook config, usage log |
| Control tower / exceptions | Missing | Create: exception queue, SLA status |
| Analytics - return reasons | Missing | Add to analytics module |
| Payment collection | Partial | Complete: Paystack integration, payment links |

### 12.2 Superadmin (`apps/super-admin/`)

Pages to add:

| Page | Action |
|------|--------|
| Platform exception queue | Create |
| Webhook failure + dead-letter queue | Create |
| Tenant API usage analytics | Create |
| Customs hold tracking | Create |
| Revenue + billing breakdown | Complete |

### 12.3 Customer / Public (`apps/frontend/` + `apps/widget/`)

| Surface | Action |
|---------|--------|
| Branded tracking page | Confirm it exists and is tenant-branded; add EDD display |
| Return request form | Create: customer self-service return initiation |
| Delivery reschedule / instructions | Create: customer changes delivery preference |
| Payment page | Create: customer pays via payment link |

### 12.4 Fauward-Go (`apps/fauward-Go/`)

| Feature | Action |
|---------|--------|
| Hub scan UI | Create: scan-in/scan-out at hub with barcode scanner support |
| Return pickup flow | Create: driver accepts and processes reverse pickup |
| Customs reference capture | Create: driver records customs reference on pickup |

---

## 13. Prioritised Roadmap

### Phase 1 — Operational Core (Build now)

**Goal:** Make every shipment bookable, priceable, labelled, and trackable end-to-end.

| Service | Complexity | Business Value |
|---------|:----------:|:--------------:|
| RatingService — rate shopping + carrier comparison | MEDIUM | CRITICAL |
| LabelService — label generation pipeline | MEDIUM | CRITICAL |
| WebhookService hardening — HMAC, retry, dead-letter | LOW | HIGH |
| DeveloperPlatformService — sandbox, scopes, usage | LOW | HIGH |

**Why now:** These are the features that enterprise buyers check in the first 30 minutes of a demo. Without them, no commercial deal closes.

---

### Phase 2 — Commercial Core (After Phase 1)

**Goal:** Add automation and compliance features that differentiate Fauward in its target market.

| Service | Complexity | Business Value |
|---------|:----------:|:--------------:|
| ShippingRulesService — IF/THEN automation | MEDIUM | HIGH |
| CustomsService — Node.js wrapper over Python worker | MEDIUM | CRITICAL for intl routes |
| CustomerPaymentService — Paystack, payment links | MEDIUM | HIGH |
| ReturnsService — complete the workflow | LOW | HIGH |

**Why now:** Phase 1 gets tenants in the door. Phase 2 makes them operational and compliant.

---

### Phase 3 — Customer Experience (After Phase 2)

**Goal:** Reduce WISMO tickets, improve customer-facing quality.

| Service | Complexity | Business Value |
|---------|:----------:|:--------------:|
| CustomerNotificationService — WhatsApp, branded tracking | MEDIUM | HIGH |
| AddressValidationService — postcodes + landmarks | LOW | MEDIUM |
| EstimatedDeliveryDate — ML-based (Python EDD worker) | HIGH | MEDIUM |
| CustomerPaymentPortal — payment link page | LOW | HIGH |

---

### Phase 4 — Enterprise Operations (After Phase 3)

**Goal:** Unlock enterprise contracts with operational management tools.

| Service | Complexity | Business Value |
|---------|:----------:|:--------------:|
| ControlTowerService — stuck shipment detection | MEDIUM | HIGH |
| ExceptionManagementService — exception queue + resolution | MEDIUM | HIGH |
| SlaMonitoringService — breach prediction | HIGH | HIGH |
| HubOperationsService — scan-in/scan-out | MEDIUM | MEDIUM |

---

### Phase 5 — Marketplace and Intelligence (After Phase 4)

**Goal:** Create platform stickiness via integrations and AI assistance.

| Service | Complexity | Business Value |
|---------|:----------:|:--------------:|
| IntegrationMarketplaceService — Shopify, WooCommerce | HIGH | MEDIUM |
| ClaimsService — lost/damaged shipment claims | MEDIUM | MEDIUM |
| AIOperationsService — agent for ops decisions | HIGH | MEDIUM |
| CarbonReportingService — ESG CO2 estimates | LOW | LOW-MEDIUM |
| FraudRiskService — address/order anomaly detection | MEDIUM | MEDIUM |

---

## 14. Implementation Prompts — Top 6 Services

---

### Prompt 1: RatingService

**Objective:** Build a carrier rate shopping service that accepts shipment parameters and returns a ranked list of available carriers/routes with prices.

**Inspect first:**
- `apps/backend/src/modules/pricing/` — existing RateCard, Surcharge, WeightDiscountTier, PricingRule
- `apps/backend/prisma/schema.prisma` — Surcharge, RateCard, WeightDiscountTier, PricingRule models
- `apps/python-services/services/pricing_service.py` — existing pricing logic

**Create:**
- `apps/backend/src/modules/rating/rating.routes.ts`
- `apps/backend/src/modules/rating/rating.service.ts`
- `apps/backend/src/modules/rating/carrier-account.service.ts`
- `apps/backend/src/modules/rating/rating.schema.ts`
- `packages/pricing-core/src/` — volumetric weight formula, quote types

**Database changes:**
- Add `CarrierAccount` model to schema
- Add `CarrierServiceLevel` model
- Add `RateQuote` model
- Add `rateQuoteId` and `carrierAccountId` to `Shipment`

**API routes:**
```
POST /api/v1/tenant/rates/quote
GET  /api/v1/tenant/rates/carriers
```

**Frontend changes:**
- `apps/tenant-portal/` — rate comparison step in shipment creation flow

**Tests:**
- Unit: volumetric weight calculation, surcharge stacking, carrier preference ordering
- Integration: quote endpoint returns ranked results, tenant isolation enforced

**Acceptance criteria:**
- Tenant can request a quote with origin, destination, weight, and dimensions
- Response includes ≥1 carrier option with price, transit days, service level
- Internal fleet pricing uses existing RateCard + PricingRule
- Tenant preferred carrier ranks first if configured
- Quote expires after 30 minutes

---

### Prompt 2: LabelService

**Objective:** Complete the label generation pipeline so tenants can generate, download, and reprint shipping labels for any confirmed shipment.

**Inspect first:**
- `apps/backend/src/modules/documents/` — existing documents.routes.ts, label.routes.ts, documents.service.ts
- `apps/python-services/workers/pdf_worker.py` — PDF generation
- `apps/backend/prisma/schema.prisma` — ShipmentDocument model
- `packages/theme-engine/` — tenant branding

**Create:**
- `apps/backend/src/modules/documents/label.service.ts`
- `apps/backend/src/modules/documents/label.schema.ts`
- `apps/python-services/workers/label_worker.py` — ZPL + PDF label rendering

**Database changes:**
- Add `GeneratedLabel` model
- Confirm/extend `ShipmentDocument` if label records live there

**API routes:**
```
POST /api/v1/tenant/shipments/:id/labels
GET  /api/v1/tenant/shipments/:id/labels/:labelId
POST /api/v1/tenant/shipments/:id/labels/:labelId/reprint
```

**Frontend changes:**
- `apps/tenant-portal/` — label download button on shipment detail page, bulk label print on shipment list

**Tests:**
- Integration: POST to label endpoint creates PDF, returns download URL
- Unit: barcode data assembly, branding injection

**Acceptance criteria:**
- Label includes: tracking number, barcode, QR code, origin, destination, weight, tenant logo
- Supports PDF (A4 and A6) and ZPL
- Label is re-downloadable after initial generation
- Failed PDF worker job retries and surfaces error in tenant portal

---

### Prompt 3: ShippingRulesService

**Objective:** Build a rules automation engine that evaluates IF/THEN rules against shipment attributes and applies actions automatically at booking time.

**Inspect first:**
- `apps/backend/src/modules/pricing/rules.routes.ts` — existing stub; migrate logic to new module
- `apps/backend/src/modules/shipments/` — booking flow to integrate rule evaluation

**Create:**
- `apps/backend/src/modules/shipping-rules/shipping-rules.routes.ts`
- `apps/backend/src/modules/shipping-rules/shipping-rules.service.ts`
- `apps/backend/src/modules/shipping-rules/shipping-rules.engine.ts`
- `apps/backend/src/modules/shipping-rules/shipping-rules.schema.ts`

**Database changes:**
- Add `ShippingRule` model with `conditions` (Json) and `actions` (Json)

**API routes:**
```
GET    /api/v1/tenant/shipping-rules
POST   /api/v1/tenant/shipping-rules
PUT    /api/v1/tenant/shipping-rules/:id
DELETE /api/v1/tenant/shipping-rules/:id
POST   /api/v1/tenant/shipping-rules/:id/test
```

**Conditions to support (MVP):**
`destinationCountry`, `weight`, `dimensions`, `declaredValue`, `serviceType`, `originBranch`

**Actions to support (MVP):**
`assignCarrier`, `assignRoute`, `requireCustomsDeclaration`, `addInsurance`, `blockBooking`, `flagForReview`

**Frontend changes:**
- `apps/tenant-portal/` — shipping rules page with rule builder (condition/action UI)

**Tests:**
- Unit: rule evaluation engine for each condition operator (equals, greaterThan, in, notIn)
- Integration: rule triggered at shipment booking; correct action applied; audit log created

**Acceptance criteria:**
- Rules evaluated in priority order
- First matching rule wins (configurable: first-match vs all-match)
- Dry-run test endpoint accepts a mock shipment and returns which rules would trigger
- Rule trigger logged to audit trail

---

### Prompt 4: CustomsService

**Objective:** Expose the existing Python customs worker as a first-class tenant-facing module, enabling tenants to create, manage, and submit customs declarations for cross-border shipments.

**Inspect first:**
- `apps/python-services/api/customs.py` — existing FastAPI customs endpoint
- `apps/python-services/workers/customs_worker.py` — async customs processing
- `apps/python-services/lib/hs_lookup.py` — HS code lookup
- `apps/backend/src/modules/shipments/` — shipment model to link declarations

**Create:**
- `apps/backend/src/modules/customs/customs.routes.ts`
- `apps/backend/src/modules/customs/customs.service.ts` — proxy to Python service
- `apps/backend/src/modules/customs/hs-lookup.service.ts`
- `apps/backend/src/modules/customs/customs.schema.ts`

**Database changes:**
- Add `CustomsDeclaration` model
- Add `customsDeclarationId` to `Shipment`

**API routes:**
```
POST /api/v1/tenant/shipments/:id/customs/declaration
GET  /api/v1/tenant/shipments/:id/customs/declaration
PUT  /api/v1/tenant/shipments/:id/customs/declaration
POST /api/v1/tenant/customs/hs-lookup
GET  /api/v1/tenant/customs/restricted-items?country=
```

**Frontend changes:**
- `apps/tenant-portal/` — customs declaration step in shipment creation (shown when destination is cross-border)

**Tests:**
- Integration: declaration created for cross-border shipment; document generated from declaration
- Unit: DDP vs DDU toggle affects duty responsibility field

**Acceptance criteria:**
- Declaration required automatically when shipping rules detect cross-border route
- HS code lookup returns top 5 suggestions from description
- Commercial invoice auto-generated from declaration (feeds `DocumentGenerationService`)
- Customs hold status surfaced in shipment timeline
- Restricted items check warns but does not hard-block (tenant override with audit log)

---

### Prompt 5: ReturnsService

**Objective:** Complete the return request workflow from customer initiation through tenant approval, reverse label generation, pickup, and analytics.

**Inspect first:**
- `apps/backend/src/modules/returns/returns.routes.ts` — existing routes stub
- `apps/backend/prisma/schema.prisma` — `ReturnRequest` model
- `apps/backend/src/modules/documents/label.service.ts` — for reverse label generation (after Prompt 2)

**Extend:**
- `apps/backend/src/modules/returns/returns.service.ts` — complete approval, rejection, label, analytics
- `ReturnRequest` model — add `reason`, `items`, `labelId`, `refundStatus`, `reversedAt`, `pickupScheduledAt`

**API routes:**
```
GET    /api/v1/tenant/returns
POST   /api/v1/tenant/returns
GET    /api/v1/tenant/returns/:id
POST   /api/v1/tenant/returns/:id/approve
POST   /api/v1/tenant/returns/:id/reject
POST   /api/v1/tenant/returns/:id/label
GET    /api/v1/customer/returns/:id/status
```

**Frontend changes:**
- `apps/tenant-portal/` — returns queue page; approval/rejection flow
- `apps/frontend/` or `apps/widget/` — customer return request form

**Fauward-Go changes:**
- `apps/fauward-Go/src/features/returns/` — driver accepts and processes reverse pickup

**Tests:**
- Integration: customer creates return → tenant approves → reverse label generated → tracking events created
- Unit: return reason analytics aggregation

**Acceptance criteria:**
- Customer can initiate return with reason, items, and photo evidence
- Tenant receives return request in portal queue
- Tenant approval triggers reverse label generation and notifies customer
- Return tracked via same `TrackingEvent` system as forward shipment
- Return reason analytics available in tenant analytics module

---

### Prompt 6: WebhookService Hardening + DeveloperPlatformService

**Objective:** Harden the existing webhook and API key infrastructure to production-grade: HMAC signing, retry with exponential backoff, dead-letter queue, sandbox mode, and usage analytics.

**Inspect first:**
- `apps/backend/src/modules/webhooks/webhooks.routes.ts`
- `apps/backend/src/modules/webhooks/webhooks.service.ts`
- `apps/backend/src/modules/api-keys/api-keys.routes.ts`
- `apps/backend/src/modules/api-keys/api-keys.service.ts`
- `apps/backend/prisma/schema.prisma` — `WebhookEndpoint`, `WebhookDelivery`, `ApiKey`

**Extend:**
- `WebhookDelivery` model — add `attemptCount`, `nextRetryAt`, `deadLetteredAt`, `hmacSignature`, `responseCode`, `responseLatencyMs`
- `ApiKey` model — add `scopes` (String[]), `isSandbox` (Boolean), `lastUsedAt`
- `webhooks.service.ts` — add HMAC generation, retry scheduler, dead-letter logic
- `api-keys.service.ts` — add sandbox flag, scope validation, usage recording

**New routes:**
```
GET  /api/v1/tenant/webhooks/:id/deliveries
POST /api/v1/tenant/webhooks/:id/test
POST /api/v1/tenant/webhooks/:id/deliveries/:deliveryId/replay
GET  /api/v1/tenant/api-usage
GET  /api/v1/platform/webhooks/failures
```

**Frontend changes:**
- `apps/tenant-portal/` — developer settings page: API key management with scopes, webhook log with delivery status, replay button for dead-lettered events

**Tests:**
- Unit: HMAC signature generated correctly; retry backoff schedule
- Integration: failed delivery retried 5 times then dead-lettered; manual replay succeeds

**Acceptance criteria:**
- Every webhook delivery includes `X-Fauward-Signature` (HMAC-SHA256 of payload with endpoint secret)
- Failed deliveries retried at 1m, 2m, 4m, 8m, 16m intervals
- After 5 failures, event moved to dead-letter state and surfaced in superadmin
- API keys have scope restrictions; requests with insufficient scope return 403
- Sandbox API keys only access sandbox shipment data
- API usage dashboard shows per-key request counts by endpoint and day

---

## 15. AI Model Strategy — DeepSeek Flash vs Pro

Fauward already has an `agent` module and a `relay` module. The question is not whether to use AI — it is how to use it without burning cost on tasks that don't need reasoning, and without using cheap models for decisions that affect operations.

The answer is strict model routing behind a single `LLMGatewayService`.

---

### 15.1 Model Selection Rule

```
DeepSeek-V4-Flash  =  reads, classifies, extracts, drafts
DeepSeek-V4-Pro    =  decides, reasons, plans, acts
```

**Use Flash for:**
- Support message classification
- Shipment status summarisation for customers
- Customer-facing tracking message drafts
- FAQ answers
- Document field extraction (customs invoices, OCR output)
- Address cleanup and normalisation
- Webhook error summarisation
- Ticket tagging and category assignment
- Tenant onboarding assistant responses
- Notification copy generation
- Simple invoice/payment explanations

**Use Pro for:**
- Driver assignment reasoning (multi-variable)
- Exception handling and escalation decisions
- SLA breach analysis
- Route/carrier recommendation with explanation
- Customs and compliance risk reasoning
- Pricing anomaly detection
- Superadmin tenant health diagnosis
- AI agent tool-calling workflows
- Dispute and claim assessment
- Business analytics explanation for tenants

---

### 15.2 Per-Service Model Routing

| Service | Model | Reason |
|---------|:-----:|--------|
| Relay — message classification | Flash | High-volume, cheap, fast |
| Relay — escalation reasoning | Pro | Needs judgement on sensitive cases |
| Tracking — customer status summary | Flash | Simple customer-safe language |
| Tracking — exception diagnosis | Pro | Multi-factor reasoning |
| SLA — risk explanation | Pro | Operational judgement |
| Driver assignment recommendation | Pro | Multi-variable decision |
| Address cleanup/normalisation | Flash | Extraction task |
| Customs declaration draft | Flash | Structured generation |
| Customs risk review | Pro | Compliance reasoning |
| Quote explanation to customer | Flash | Simple explanation |
| Pricing anomaly detection | Pro | Needs reasoning |
| Document text generation | Flash | Template support |
| Claims assessment | Pro | Risk and financial judgement |
| Returns classification | Flash | Simple categorisation |
| Superadmin tenant health | Pro | Cross-system diagnosis |
| Webhook error summary | Flash | Log summarisation |
| API docs assistant (Q&A) | Flash | Simple Q&A |
| Fauward Agent orchestration | Hybrid | Flash preprocessing, Pro for action |

---

### 15.3 Per-Module AI Integration Design

#### Relay / Support Messaging

The relay module is the best first integration point for AI.

```
New message arrives
  -> Flash: classify intent, detect urgency, detect sentiment
  -> If classification is SIMPLE: Flash drafts reply
  -> If classification is COMPLEX or HIGH_RISK: Pro analyses full case
  -> Human admin approves before send
```

**Flash handles:** intent classification, urgency detection, angry customer flag, refund request detection, failed delivery complaint, customs question detection, conversation summary, category assignment

**Pro handles only:** multi-exception cases, compensation recommendations, escalation decisions, operational recommendations to tenant

**Rule:** Do not auto-send any AI reply yet. Always draft → human approves → send.

---

#### Tracking AI Assistant

```
Internal status: CUSTOMS_HOLD
  -> Flash: "Your shipment is delayed while additional checks are completed."

Shipment delayed 36h, no driver update, webhook failed twice, SLA breach likely
  -> Pro: { likelyCause, recommendedAction, customerUpdate, escalationPriority }
```

**Flash:** translate internal status codes to customer-safe language

**Pro:** diagnose exception cases — takes structured shipment data, event history, SLA policy, outputs recommended action

---

#### Control Tower / SLA Monitoring

Deterministic rules fire first. AI explains and recommends.

```
Deterministic:
  if ETA missed by 60 min -> flag RISK
  if no scan for 24h      -> STUCK
  if out_for_delivery > 8h -> DELAYED

Then Pro:
  Why is this shipment risky?
  What should ops do next?
  Should the customer be notified?
  Is this tenant experiencing a wider issue?
```

Services: `ControlTowerService`, `SlaMonitoringService`, `ExceptionManagementService`

---

#### Driver Assignment / Dispatch

The system calculates hard data first. Pro ranks and explains with that structured input — it never invents distances or capacity.

```
System computes:
  - driver distance to pickup
  - current active workload
  - vehicle type vs shipment requirements
  - route compatibility
  - tenant-configured driver preference
  - shipment priority

Pro receives structured data and outputs:
  "Driver A is closest but at capacity.
   Driver B is 2km farther with matching vehicle and route.
   Recommend Driver B."
```

---

#### Pricing / Rating Assistant

**Flash:** Explain quote breakdown to customer — `"Your quote includes base rate, volumetric weight, insurance, and fuel surcharge."`

**Pro:** Detect pricing anomalies — `"This quote is unusually low for UK → Lagos 20kg express. Possible missing customs surcharge."`

Services: `RatingService`, `PricingAnomalyService`, `QuoteExplanationService`

---

#### Customs / Trade Compliance

Flash handles extraction and formatting. Pro handles risk and compliance reasoning. Staff must always confirm AI customs suggestions — AI cannot make final classifications.

**Flash:** Extract item descriptions from uploaded invoices, format declaration text, check for missing required fields, summarise uploaded document

**Pro:** Suggest HS code categories (staff confirms), detect restricted item risk, explain customs hold, generate commercial invoice notes

**Rule:** `AI can suggest classifications. Staff must confirm before submission.`

Services: `CustomsAssistantService`, `TradeComplianceAssistantService`

---

#### Claims / Returns Assessment

**Flash:** Return reason classification, customer message summary, claim document checklist, simple reply drafts

**Pro:** Lost/damaged shipment assessment, compensation recommendation, fraud pattern explanation, claim risk scoring

Services: `ClaimsAssistantService`, `ReturnsAssistantService`

---

#### Superadmin Tenant Health

Strong Pro use case. Input is structured metrics; output is diagnosis and recommended action.

```typescript
// Input to Pro
{
  tenantId,
  shipmentVolumeLastWeek: 342,
  failedDeliveryRate: 0.18,        // unusually high
  webhookFailures: 12,
  activeExceptions: 7,
  openSupportTickets: 23,
  slaBreachesLast24h: 4,
  paymentFailures: 2,
  queueDepth: 156
}

// Pro output
{
  healthScore: 42,
  topRisks: ["HIGH failed delivery rate", "SLA breach trend"],
  recommendedAction: "Contact tenant operations lead. Possible courier partner issue.",
  platformIssue: false,
  escalate: true
}
```

Services: `TenantHealthAIService`, `PlatformOpsAssistantService`

---

### 15.4 LLMGatewayService

Do not call DeepSeek directly in individual service files. All AI calls go through a single gateway.

**Location:** `apps/backend/src/shared/services/llm-gateway.service.ts`

**Responsibilities:**
- Model routing by task name
- Retry on transient errors
- Timeout enforcement
- Token usage logging
- Prompt versioning
- JSON output validation (Zod)
- Tool call validation
- Fallback model on Pro failure → Flash with degraded response
- Per-tenant AI usage limits
- Cost tracking per tenant per feature

**Interface:**

```typescript
llmGateway.run({
  task: "tracking_exception_analysis",    // maps to model via routing table
  tenantId: string,
  input: Record<string, unknown>,
  outputSchema: ZodSchema,               // always validate structured output
  tools?: LLMTool[],
  allowAutoAction?: boolean,             // default false — humans approve
});
```

**Model routing table:**

```typescript
const MODEL_ROUTING: Record<string, "deepseek-v4-flash" | "deepseek-v4-pro"> = {
  relay_classify:                  "deepseek-v4-flash",
  relay_reply_draft:               "deepseek-v4-flash",
  relay_escalation_analysis:       "deepseek-v4-pro",
  tracking_customer_summary:       "deepseek-v4-flash",
  tracking_exception_analysis:     "deepseek-v4-pro",
  sla_risk_explanation:            "deepseek-v4-pro",
  driver_assignment:               "deepseek-v4-pro",
  address_cleanup:                 "deepseek-v4-flash",
  customs_declaration_draft:       "deepseek-v4-flash",
  customs_risk_review:             "deepseek-v4-pro",
  quote_explanation:               "deepseek-v4-flash",
  pricing_anomaly_detection:       "deepseek-v4-pro",
  document_text_generation:        "deepseek-v4-flash",
  claims_assessment:               "deepseek-v4-pro",
  returns_classification:          "deepseek-v4-flash",
  tenant_health_summary:           "deepseek-v4-pro",
  webhook_error_summary:           "deepseek-v4-flash",
};
```

---

### 15.5 Structured Output and JSON Mode

Always request JSON output for parseable results. Always validate with Zod before using the result.

**Good JSON output structure:**

```typescript
// Relay classification output
{
  category: "FAILED_DELIVERY" | "CUSTOMS_QUESTION" | "REFUND_REQUEST" | "GENERAL_ENQUIRY",
  urgency: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  customerSentiment: "NEUTRAL" | "FRUSTRATED" | "ANGRY",
  recommendedAction: "AUTO_REPLY" | "QUEUE_FOR_AGENT" | "ESCALATE_TO_SUPPORT",
  confidence: 0.91,
  draftReply: "We're checking on this now..."
}

// Exception diagnosis output
{
  likelyCause: string,
  recommendedAction: string,
  shouldNotifyCustomer: boolean,
  customerUpdate: string,
  escalationPriority: "LOW" | "MEDIUM" | "HIGH",
  confidence: number
}
```

---

### 15.6 Confidence Thresholds

Every AI result should return a `confidence` score. Use it to gate automation.

```
confidence >= 0.85  ->  allow automation for low-risk tasks
0.60 – 0.84         ->  surface suggestion to human for approval
< 0.60              ->  require human review, do not surface AI suggestion
```

---

### 15.7 Tool / Function Calling Rules

DeepSeek supports tool calling via OpenAI-compatible chat format.

**Tools the agent may call:**
```typescript
getShipment(id)
getTrackingEvents(shipmentId)
getAvailableDrivers(criteria)
createTrackingEvent(shipmentId, eventType, note)
sendCustomerNotification(shipmentId, channel, message)
createSupportNote(ticketId, note)
escalateCase(exceptionId, reason)
```

**Tools that require human approval before execution:**
```typescript
assignDriver(shipmentId, driverId)        // reversible but operational impact
refundPayment(paymentId, amount)          // financial
compensateCustomer(shipmentId, amount)    // financial
cancelShipment(shipmentId)               // irreversible
overridePricing(quoteId, newPrice)       // financial
markDelivered(shipmentId)                // data integrity
suspendTenant(tenantId)                  // platform-level
```

**Rule:** Flash can suggest. Pro can decide. Backend validates before any action. Dangerous actions log to `AuditLog` and surface in superadmin approval queue.

---

### 15.8 Prompt Caching Optimisation

DeepSeek context caching is on by default and benefits requests with overlapping prompt prefixes. Structure prompts to keep the stable prefix as long as possible.

```
SYSTEM (stable):
  You are the Fauward Relay Classifier.
  Rules: ...
  Output schema: ...

USER (variable per request):
  Message: {messageText}
  Shipment context: {shipmentSummary}
```

**For long context:** Reserve long context for Pro on complex tasks (tenant health review, full conversation summary, multi-document customs review, claim investigation). Do not use long prompts for Flash classification — keep it small and fast.

---

### 15.9 Tenant-Level AI Usage Limits

Because Fauward is multi-tenant, track and limit AI usage per tenant per plan tier.

**New Prisma models needed:**

```prisma
model TenantAiUsage {
  id          String   @id @default(cuid())
  tenantId    String
  month       String   // "2026-05"
  model       String   // "deepseek-v4-flash" | "deepseek-v4-pro"
  feature     String   // task name from routing table
  requestCount Int     @default(0)
  tokenCount  Int      @default(0)
  costUsd     Float    @default(0)
  updatedAt   DateTime @updatedAt
}

model TenantAiLimit {
  id            String @id @default(cuid())
  tenantId      String @unique
  monthlyBudgetUsd Float?
  flashRequestLimit Int?
  proRequestLimit   Int?
  featuresEnabled  String[]  // which AI features are active for this tenant
}
```

**Plan-based AI feature tiers:**

| Plan | AI Features |
|------|------------|
| Starter | Basic tracking summaries (Flash only) |
| Pro | Relay classification + tracking AI + customs draft |
| Enterprise | Full agent, control tower AI, tenant health diagnosis, custom workflows |

---

### 15.10 What Not to Use AI For

Do not use LLMs for:

- Basic CRUD operations
- Simple status transitions (these belong in the state machine)
- Standard dashboard filters and queries
- Basic email template rendering
- Deterministic pricing calculations
- Final customs classification without staff review
- Final refund/claim approval without human sign-off
- Payment processing decisions

Use deterministic code for these. Every LLM call that replaces a database query is a cost and latency regression.

---

### 15.11 Recommended AI Service Build Order

| Priority | Service | Model | Business Value |
|:--------:|---------|:-----:|:--------------:|
| 1 | RelayAIService | Flash → Pro | Immediate; reduces support workload |
| 2 | TrackingAIService | Flash → Pro | Customer experience + exception ops |
| 3 | ControlTowerAIService | Pro | Enterprise positioning |
| 4 | CustomsAIService | Flash + Pro | Required for UK→Africa market |
| 5 | PricingAIService | Flash + Pro | Commercial value, quote confidence |
| 6 | FauwardAgentService | Hybrid | After all foundations are solid |

---

## 16. Risks and Warnings

### Architecture

- **Do not split tracking logic.** The `TrackingEvent` + `TrackingSnapshot` system in `packages/tracking-core` must be the single source of truth. Do not build separate tracking per module (e.g. a separate return tracking table). Route all status events through the tracking system.
- **Do not mix platform billing and tenant customer billing.** These are separate flows, separate models, and likely separate Stripe accounts. Conflating them will cause revenue reconciliation nightmares.
- **Python-Node.js boundary.** The Python service is for compute-heavy async work. Do not move business logic (rule evaluation, pricing, billing) into Python workers. Node.js owns orchestration; Python owns computation.
- **Tenant isolation.** Every new model must include `tenantId`. Every new route must validate that the authenticated user's `tenantId` matches the resource's `tenantId`. The `tenants.isolation.test.ts` must be updated for every new module.

### Operational

- **Customs is not optional for UK→Africa.** Any tenant running cross-border shipments who cannot generate compliant customs documents will not use Fauward for those lanes. `CustomsService` is effectively a blocker for the core market.
- **Africa/MENA address validation.** Do not use postcode-only address validation. Landmark-based delivery notes (`"Near the market, red gate"`) are common and must be supported as a free-text field. Western postcode assumptions will cause high failed-delivery rates.
- **WhatsApp for WISMO.** In Nigeria, Ghana, Kenya, and UAE, WhatsApp is the primary digital communication channel. Email-only notifications will have low open rates. WhatsApp is not a nice-to-have for the target market.

### Product

- **Do not start with AI or the integration marketplace.** Both require operational foundations to be credible. An AI assistant that suggests carriers before rate shopping exists is useless. An integration marketplace before a stable public API is backwards.
- **Claims before insurance.** Do not build an insurance product until the claims workflow is solid. Users file claims first; insurance is an upsell on top.
- **Fauward-Go offline sync.** The driver app already has a `sync/` feature. Any new Go features (hub scanning, return pickup) must work offline and sync on reconnection. Do not assume reliable mobile data in target markets.

---

## 17. Final Recommendation

Fauward has stronger architectural foundations than most logistics startups at this stage. The Prisma schema, multi-tenant isolation, Python async workers, Turborepo monorepo, and driver app represent months of correct engineering decisions.

The commercial gap is execution depth, not breadth. The next 6 months should be entirely focused on the first two phases of the roadmap: making the core shipment workflow — **quote → book → label → track → deliver → return** — work end-to-end without gaps.

**Build in this order. Stop before Phase 3 until Phase 1 and 2 are demo-ready:**

```
Phase 1 (Now):
  1. RatingService          — tenants can compare prices and book with confidence
  2. LabelService           — every shipment gets a label; thermal printer support
  3. WebhookService         — HMAC, retry, dead-letter; enterprise buyers require this
  4. DeveloperPlatformService — sandbox mode, scopes, usage logs

Phase 2 (Next):
  5. ShippingRulesService   — automation; strongest differentiator vs simple logistics tools
  6. CustomsService         — required for UK→Africa; Python worker already exists
  7. CustomerPaymentService — Paystack; needed for B2C tenants in target market
  8. ReturnsService         — complete the existing partial implementation

Phase 3 (After):
  9. CustomerNotificationService — branded tracking, WhatsApp, WISMO reduction
 10. AddressValidationService    — landmark support for Africa/MENA
 11. ControlTowerService         — exceptions, stuck shipments, SLA monitoring

Phase 4+:
 12-16. Hub operations, claims, integrations, AI, carbon reporting
```

The boring logistics core is the product. Build it first, build it well.
