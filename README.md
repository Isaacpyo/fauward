# FAUWARD — Root Implementation Guide

> **The single source of truth for building Fauward.**
> Merged from: System Design v1 · Platform Spec v3 · Fauward Master Spec v1 · Frontend Design Spec
> Owner: Temitope Agbola, Treny Limited
> Status: Ready for Codex execution

---

## Table of Contents

1. [What Is Fauward](#1-what-is-fauward)
2. [Brand & Identity](#2-brand--identity)
3. [Product Surfaces](#3-product-surfaces)
4. [Target Market & Positioning](#4-target-market--positioning)
5. [Pricing, Billing & Unit Economics](#5-pricing-billing--unit-economics)
6. [User Roles & Permissions](#6-user-roles--permissions)
7. [System Architecture](#7-system-architecture)
8. [Data Model — Complete Schema](#8-data-model--complete-schema)
9. [Shipment State Machine](#9-shipment-state-machine)
10. [Feature Modules](#10-feature-modules)
11. [Regional Deployment & Tailoring](#11-regional-deployment--tailoring)
12. [Enterprise Tier — Full Specification](#12-enterprise-tier--full-specification)
13. [Frontend Design System](#13-frontend-design-system)
14. [Frontend Surface Specifications](#14-frontend-surface-specifications)
15. [API Design](#15-api-design)
16. [Infrastructure & Non-Functional Requirements](#16-infrastructure--non-functional-requirements)
17. [Security Architecture](#17-security-architecture)
18. [Product Experience — Onboarding, Errors & Migration](#18-product-experience)
19. [Analytics & SaaS Metrics](#19-analytics--saas-metrics)
20. [Go-To-Market & Revenue Model](#20-go-to-market--revenue-model)
21. [Legal & Compliance](#21-legal--compliance)
22. [Implementation Phases](#22-implementation-phases)
23. [Tech Stack Summary](#23-tech-stack-summary)

---

## 1. What Is Fauward

Fauward is a **multi-tenant B2B SaaS platform** that gives logistics businesses — couriers, freight forwarders, and 3PLs — their own branded, fully operational platform in 10 minutes, for less than the cost of one extra staff member per month.

**What it replaces:**
- WhatsApp shipment coordination
- Excel shipment tracking
- Expensive bespoke TMS (£20k–£100k to build, £500+/month to buy)
- Per-user SaaS that penalises growth ($45–$85/user means £450+/month for a 10-person team)

**What it provides:**
- A customer-facing portal for booking, tracking, and payment
- An operations dashboard for internal staff to manage shipments end-to-end
- A real-time tracking engine with WebSocket broadcasting
- A secure payment pipeline with multi-gateway support
- A notification layer (email + SMS) for all key events
- A driver mobile PWA for field operations
- An embeddable tracking widget for third-party websites
- Full white-label branding per tenant

**Why it wins:**
- Flat company pricing — not per user. A 50-person logistics company pays £79/month, not £4,250/month
- Self-serve in 10 minutes — no demo calls, no implementation teams
- Region-specific from day one — right payment gateways, tax compliance, and carrier integrations per market
- White-label — their customers see their brand, not ours

---

## 2. Brand & Identity

**Name:** Fauward — /fɔː-wəd/ — from "forward" + "forwarder"
**Domain:** fauward.com · fauward.io

**Colours:**
- Primary: Navy `#0D1F3C` (headers, navigation, trust)
- Accent: Amber `#D97706` (CTAs, highlights, energy)
- Surface: White `#FFFFFF`
- Background: `#F8FAFC`
- Border: `#E2E8F0`
- Text: `#1E293B`
- Muted: `#64748B`

**Typography:**
- UI: `Inter`, system-ui, sans-serif
- Monospace: `JetBrains Mono` — for tracking numbers, API keys, logs, webhook signatures, system IDs

**Tone:** Reliable, modern, global but grounded — not startup-playful.

**Tagline:** *"Ship smarter. Everywhere."*

---

## 3. Product Surfaces

Fauward is not one app. It is a multi-surface product ecosystem. Each surface follows its own UX persona and density.

| # | Surface | Tech Stack | Audience | Design Intent |
|---|---------|-----------|----------|---------------|
| 1 | Marketing site | Next.js 14, SSR, SEO-first | Prospects | Premium, conversion-focused, spacious |
| 2 | Tenant portal | React 18, Vite, Tailwind, Zustand, React Query, Radix | Logistics businesses + their customers | Data-dense, operational, white-label themed |
| 3 | Driver mobile PWA | React 18, Vite, PWA plugin | Delivery drivers | Touch-first, high contrast, offline-capable |
| 4 | Super admin panel | React 18, Vite, Tailwind | Fauward internal team | Maximum density, internal-tool efficient |
| 5 | Embeddable widget | Vanilla JS, Shadow DOM | Third-party websites | < 15KB, zero dependencies, host-safe |

**Do not apply one generic SaaS design to everything.** Each surface has different density, theming, and interaction patterns.

---

## 4. Target Market & Positioning

### Primary Buyers

Small to mid-size logistics businesses across 7 global regions who are:
- Running operations on WhatsApp, spreadsheets, or outdated software
- Priced out of enterprise TMS solutions ($500–$2,000/month)
- Looking for a platform they can brand as their own
- Growing fast enough to need real operational infrastructure

### Personas by Region

| Persona | Region | Staff | Monthly Volume | Pain |
|---------|--------|-------|----------------|------|
| Last-mile courier startup | West Africa | 3–15 | 200–800 shipments | No tracking, manual payments |
| Regional freight forwarder | UK / Middle East | 15–60 | 500–5,000 shipments | Disconnected tools, no portal |
| Cross-border 3PL | East Africa / UK-Africa | 10–40 | 300–2,000 shipments | No real-time visibility for clients |
| E-commerce fulfilment | South Africa / UAE | 20–80 | 1,000–10,000 shipments | Can't connect to Shopify/WooCommerce |
| Air/ocean freight SME | Middle East / North Africa | 20–100 | Complex multi-modal | Needs carrier integrations + customs |

### Competitive Landscape

| Competitor | Type | Price | Why customers leave them |
|------------|------|-------|--------------------------|
| WhatsApp + Excel | Current state | Free | No tracking, no payments, no scale |
| Logistaas | TMS SaaS | $45–$85/user/month | Too expensive for small teams, no SMB self-serve |
| Shipday | Delivery mgmt | $49–$299/month | US-focused, no B2B finance module |
| Tookan | Delivery mgmt | $25–$95/month | No white-label, no Africa/MENA payment gateways |
| Onro | White-label TMS | Custom pricing | Expensive, slow onboarding |
| Enterprise TMS (SAP, Oracle) | Enterprise | $2,000–$50,000/month | Not for SMBs, requires implementation team |

### Differentiation vs Logistaas

| Dimension | Logistaas | Fauward |
|-----------|-----------|---------|
| Pricing model | $45–$85/user/month | £29–£199/company/month flat |
| Entry price (10 users) | ~$450/month | £29/month |
| Self-serve signup | No (demo required) | Yes (live in 10 min) |
| White-label | No | Yes (Pro+) |
| PWA / mobile | No | Yes |
| Embeddable widget | No | Yes (Pro+) |
| African payment gateways | No | Yes (Paystack, M-Pesa, Flutterwave) |
| Arabic RTL | No | Yes |
| Per-user penalty | Yes | No (flat rate) |

---

## 5. Pricing, Billing & Unit Economics

### 5.1 Tier Definitions

| | Starter | Pro | Enterprise |
|---|---------|-----|-----------|
| **Price** | £29/month · £290/year | £79/month · £790/year | From £500/month |
| **Shipments/month** | 300 | 2,000 | Unlimited |
| **Staff accounts** | 3 | 15 | Unlimited |
| **Organisations (B2B clients)** | 10 | Unlimited | Unlimited |
| **Custom domain** | ❌ | ✅ | ✅ |
| **White-label** | ❌ (Powered by Fauward) | ✅ | ✅ |
| **CRM & Sales** | ❌ | ✅ | ✅ |
| **Document generation** | Basic (delivery note, invoice) | Full suite | Full + custom templates |
| **Finance module** | Basic invoicing | Full | Full + accounting |
| **Accounting integrations** | ❌ | 1 integration | All integrations |
| **SMS notifications** | ❌ | ✅ | ✅ |
| **API access** | ❌ | ✅ | ✅ (higher rate limits) |
| **Webhooks** | ❌ | ✅ | ✅ |
| **Carrier integrations** | ❌ | ❌ | ✅ |
| **E-invoicing / customs** | ❌ | ❌ | ✅ |
| **Multi-branch** | ❌ | ❌ | ✅ |
| **SSO** | ❌ | ❌ | ✅ |
| **Dedicated infrastructure** | ❌ | ❌ | ✅ |
| **SLA guarantee** | ❌ | ❌ | 99.9% with credits |
| **Data residency** | ❌ | ❌ | ✅ |
| **Support** | Email 48h | Email+Slack 12h | 24/7 dedicated |

### 5.2 Usage Enforcement

**At 80% of shipment limit:**
- In-app banner: "You've used 240 of your 300 shipments this month"
- Email notification to TENANT_ADMIN

**At 100% — Starter (hard stop with grace):**
- HTTP 429 with upgrade URL and overage option
- Admin emailed immediately

**At 100% — Pro (pay-as-you-go overage):**
- Shipments continue at £0.08/shipment
- Billed at end of month via Stripe metered billing

**Grace period on failed payment:**
- Day 0: Payment fails — retry in 3 days
- Day 3: Retry. If fails — SUSPENDED, email warning
- Day 7: Final retry. If fails — portal shows "account suspended"
- Day 30: CANCELLED — data retained 30 days then purged

### 5.3 Unit Economics

| Tier | Price | Infra Cost | SMS/Email | Support | Total Cost | Gross Margin |
|------|-------|-----------|-----------|---------|-----------|-------------|
| Starter | £29 | £2.50 | £0.50 | £2.00 | £5.00 | £24 (83%) |
| Pro | £79 | £4.00 | £3.00 | £5.00 | £12.00 | £67 (85%) |
| Enterprise | £800 avg | £150.00 | £15.00 | £80.00 | £245.00 | £555 (69%) |

**Break-even:** 10 Starter + 4 Pro = £508 margin vs £440 fixed costs ✅

### 5.4 Enterprise Pricing Variables

| Variable | Range | Impact |
|----------|-------|--------|
| Monthly shipment volume | 2,000–unlimited | Base price |
| Staff users | 15–unlimited | +£3/user above 50 |
| Regions activated | 1–7 | +£100–500/region |
| Custom integrations | Per integration | £500–£5,000 one-time |
| Data residency | EU/UK standard; others | +£100/month |
| SLA level | 99.9% standard; 99.95% | +£200/month |
| Contract duration | Monthly/Annual/2yr | 5%/15%/25% discount |

---

## 6. User Roles & Permissions

### 6.1 Role Hierarchy

```
SUPER_ADMIN (Fauward internal — full access to all tenants)
  └── TENANT_ADMIN (scoped to their tenant)
        ├── TENANT_MANAGER
        │     └── TENANT_STAFF
        │           └── TENANT_DRIVER
        └── TENANT_FINANCE
              (no operational access)

CUSTOMER_ADMIN (scoped to their organisation)
  └── CUSTOMER_USER
```

### 6.2 Full Permission Matrix

| Permission | SUPER | T_ADMIN | T_MANAGER | T_FINANCE | T_STAFF | T_DRIVER | C_ADMIN | C_USER |
|------------|-------|---------|-----------|-----------|---------|----------|---------|--------|
| View all tenants | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Impersonate tenant | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Create shipment | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ✅ |
| Edit any shipment | ✅ | ✅ | ✅ | ❌ | own | ❌ | own | own |
| Update status | ✅ | ✅ | ✅ | ❌ | ✅ | assigned | ❌ | ❌ |
| Assign driver | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View all shipments | ✅ | ✅ | ✅ | ✅ | ✅ | assigned | own org | own |
| Create invoice | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| View invoices | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | own org | own |
| View P&L / financials | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Manage staff | ✅ | ✅ | limited | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage branding | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage billing | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | own | ❌ |
| View analytics | ✅ | ✅ | ✅ | ✅ | limited | ❌ | own org | ❌ |
| Manage API keys | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Capture POD | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ |
| View audit log | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

### 6.3 Customer Organisation Model

Logistics is B2B — customers are companies, not just individuals.

```
Organisation (B2B client)
├── billing_owner_id → User (pays the invoices)
├── admin_users → [User] (can manage org bookings)
└── regular_users → [User] (can book + track only)
```

This enables: multi-user companies as clients, organisation-level invoicing, Net 30/60 payment terms, consolidated shipment views per organisation.

### 6.4 Cross-Branch Visibility (Enterprise)

```
TENANT_ADMIN: sees all branches
TENANT_MANAGER: sees their assigned branch(es)
TENANT_STAFF: sees their branch only
TENANT_FINANCE: sees all branches (financial data only)
```

---

## 7. System Architecture

### 7.1 Architecture Style

**Modular monolith** initially, designed for seamless extraction into microservices as scale demands. This balances development velocity with long-term scalability.

### 7.2 High-Level Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                       CLIENT LAYER                            │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌────────┐  ┌────────┐  │
│  │  Marketing   │  │   Tenant     │  │ Driver │  │ Super  │  │
│  │    Site      │  │   Portal     │  │  PWA   │  │ Admin  │  │
│  │  (Next.js)   │  │  (React 18)  │  │(React) │  │(React) │  │
│  └──────┬───────┘  └──────┬───────┘  └───┬────┘  └───┬────┘  │
└─────────┼─────────────────┼──────────────┼───────────┼────────┘
          │ HTTPS           │ HTTPS/WS     │           │
┌─────────▼─────────────────▼──────────────▼───────────▼────────┐
│                     API GATEWAY LAYER                          │
│        Rate Limiting · CORS · Auth Middleware · Logging        │
└──────────────────────────┬────────────────────────────────────┘
                           │
┌──────────────────────────▼────────────────────────────────────┐
│                   BACKEND SERVICE LAYER                        │
│            Node.js · Fastify · TypeScript · Prisma             │
│                                                                │
│  ┌───────────┐ ┌───────────┐ ┌──────────┐ ┌───────────────┐  │
│  │   Auth    │ │ Shipment  │ │ Tracking │ │   Payment     │  │
│  │  Service  │ │  Service  │ │  Service │ │   Service     │  │
│  └───────────┘ └───────────┘ └──────────┘ └───────────────┘  │
│  ┌───────────┐ ┌───────────┐ ┌──────────┐ ┌───────────────┐  │
│  │   User    │ │  Notif.   │ │ Finance  │ │  CRM / Docs   │  │
│  │  Service  │ │  Service  │ │  Service │ │   Service     │  │
│  └───────────┘ └───────────┘ └──────────┘ └───────────────┘  │
└──────────────────────────┬────────────────────────────────────┘
                           │
┌──────────────────────────▼────────────────────────────────────┐
│                   DATA & MESSAGING LAYER                       │
│                                                                │
│  ┌───────────┐  ┌───────────┐  ┌──────────────────────────┐  │
│  │PostgreSQL │  │   Redis   │  │     BullMQ Queues        │  │
│  │(Supabase) │  │ (Upstash) │  │  (notifications, hooks,  │  │
│  │           │  │           │  │   analytics, webhooks)   │  │
│  └───────────┘  └───────────┘  └──────────────────────────┘  │
│                                                                │
│  ┌───────────┐  ┌──────────────────────────────────────────┐  │
│  │    S3     │  │        External Integrations              │  │
│  │  (Files)  │  │  Stripe · Paystack · SendGrid · Twilio   │  │
│  │           │  │  Google Maps · M-Pesa · Flutterwave      │  │
│  └───────────┘  └──────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

### 7.3 Multi-Tenancy Architecture

**Shared infrastructure (Starter + Pro):**
- One PostgreSQL database, every table scoped with `tenant_id`
- Prisma middleware enforces isolation on every query — no bypass path
- AsyncLocalStorage carries tenant context through the request lifecycle

**Dedicated infrastructure (Enterprise):**
- Each Enterprise tenant gets own PostgreSQL instance, Redis cluster, and container group
- Same application code, isolated data
- Data residency configured per tenant

**Tenant context flow:**
```
Request hits API
  │
TenantResolver middleware
  │
  Subdomain? → SELECT * FROM tenants WHERE slug = X
  Custom domain? → SELECT * FROM tenants WHERE custom_domain = X
  API key? → SELECT * FROM api_keys JOIN tenants WHERE key_hash = X
  SSO token? → SELECT * FROM tenants WHERE sso_provider_id = X
  │
Tenant attached to AsyncLocalStorage
  │
All queries auto-scoped via Prisma middleware
```

### 7.4 Event-Driven Architecture

```
Business action (e.g. status update)
  │
Service writes to DB (transactional)
  ├── Write to outbox_events table (same transaction)
  │
Outbox publisher (polls every 1s)
  ├── notifications:queue → SendGrid / Twilio
  ├── webhooks:queue → tenant endpoint (HMAC signed)
  └── analytics:queue → aggregate counts
```

The outbox pattern guarantees events are published even if the process crashes between the DB write and the queue publish.

**Dead Letter Queue:** Jobs that fail 3 times → moved to `dlq:{queue_name}`. CloudWatch alarm fires if DLQ depth > 10.

### 7.5 Idempotency

Every state-changing API endpoint accepts an `Idempotency-Key` header. Duplicate requests return the cached response without re-executing. Webhook deliveries include `X-Delivery-ID` for consumer-side deduplication.

---

## 8. Data Model — Complete Schema

### 8.1 Core Tables

```sql
-- TENANTS (logistics businesses that subscribe)
CREATE TABLE tenants (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                   VARCHAR(255) NOT NULL,
  slug                   VARCHAR(100) UNIQUE NOT NULL,
  custom_domain          VARCHAR(255) UNIQUE,
  domain_verified        BOOLEAN DEFAULT FALSE,
  plan                   VARCHAR(20) DEFAULT 'TRIALING',
  status                 VARCHAR(20) DEFAULT 'TRIALING',
  infrastructure_type    VARCHAR(20) DEFAULT 'SHARED',
  region                 VARCHAR(50) DEFAULT 'uk_europe',
  logo_url               TEXT,
  primary_color          VARCHAR(7) DEFAULT '#0D1F3C',
  accent_color           VARCHAR(7) DEFAULT '#D97706',
  brand_name             VARCHAR(255),
  is_rtl                 BOOLEAN DEFAULT FALSE,
  default_currency       CHAR(3) DEFAULT 'GBP',
  default_language       VARCHAR(10) DEFAULT 'en',
  timezone               VARCHAR(50) DEFAULT 'Europe/London',
  show_powered_by        BOOLEAN DEFAULT TRUE,
  sms_enabled            BOOLEAN DEFAULT FALSE,
  max_staff              INT DEFAULT 3,
  max_shipments_pm       INT DEFAULT 300,
  max_organisations      INT DEFAULT 10,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- USERS
CREATE TABLE users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID REFERENCES tenants(id),
  organisation_id UUID REFERENCES organisations(id),
  branch_id      UUID REFERENCES branches(id),
  email          VARCHAR(255) NOT NULL,
  phone          VARCHAR(50),
  password_hash  TEXT,
  role           VARCHAR(30) NOT NULL,
  first_name     VARCHAR(100),
  last_name      VARCHAR(100),
  avatar_url     TEXT,
  is_active      BOOLEAN DEFAULT TRUE,
  mfa_enabled    BOOLEAN DEFAULT FALSE,
  mfa_secret     TEXT,
  last_login     TIMESTAMPTZ,
  invited_by     UUID REFERENCES users(id),
  sso_provider   VARCHAR(30),
  sso_subject    VARCHAR(255),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, email)
);

-- ORGANISATIONS (B2B client companies)
CREATE TABLE organisations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id),
  name            VARCHAR(255) NOT NULL,
  company_number  VARCHAR(100),
  tax_number      VARCHAR(100),
  billing_email   VARCHAR(255),
  billing_address JSONB,
  payment_terms   INT DEFAULT 0,
  credit_limit    DECIMAL(12,2) DEFAULT 0,
  billing_owner_id UUID REFERENCES users(id),
  notes           TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- SHIPMENTS
CREATE TYPE shipment_status AS ENUM (
  'PENDING','PROCESSING','PICKED_UP','IN_TRANSIT',
  'OUT_FOR_DELIVERY','DELIVERED','FAILED_DELIVERY',
  'RETURNED','CANCELLED','EXCEPTION'
);

CREATE TABLE shipments (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID REFERENCES tenants(id),
  branch_id             UUID REFERENCES branches(id),
  tracking_number       VARCHAR(50) UNIQUE NOT NULL,
  customer_id           UUID REFERENCES users(id),
  organisation_id       UUID REFERENCES organisations(id),
  assigned_staff_id     UUID REFERENCES users(id),
  assigned_driver_id    UUID REFERENCES drivers(id),
  vehicle_id            UUID REFERENCES vehicles(id),
  route_id              UUID REFERENCES routes(id),
  carrier_booking_id    UUID REFERENCES carrier_bookings(id),
  status                shipment_status NOT NULL DEFAULT 'PENDING',
  origin_address        JSONB NOT NULL,
  destination_address   JSONB NOT NULL,
  service_tier          VARCHAR(20) DEFAULT 'STANDARD',
  service_zone_id       UUID REFERENCES service_zones(id),
  estimated_delivery    TIMESTAMPTZ,
  actual_delivery       TIMESTAMPTZ,
  price                 DECIMAL(12,2),
  currency              CHAR(3) DEFAULT 'GBP',
  weight_kg             DECIMAL(8,3),
  notes                 TEXT,
  special_instructions  TEXT,
  insurance_value       DECIMAL(12,2),
  customs_declaration_id UUID REFERENCES customs_declarations(id),
  idempotency_key       VARCHAR(255) UNIQUE,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

-- SHIPMENT ITEMS (packages within a shipment)
CREATE TABLE shipment_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id),
  shipment_id   UUID REFERENCES shipments(id) ON DELETE CASCADE,
  description   VARCHAR(255),
  quantity      INT DEFAULT 1,
  weight_kg     DECIMAL(8,3),
  length_cm     DECIMAL(8,2),
  width_cm      DECIMAL(8,2),
  height_cm     DECIMAL(8,2),
  declared_value DECIMAL(12,2),
  hs_code       VARCHAR(20),
  is_dangerous  BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- SHIPMENT EVENTS (immutable timeline)
CREATE TABLE shipment_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id),
  shipment_id UUID REFERENCES shipments(id) ON DELETE CASCADE,
  status      VARCHAR(30) NOT NULL,
  location    JSONB,
  notes       TEXT,
  actor_id    UUID REFERENCES users(id),
  actor_type  VARCHAR(20),
  source      VARCHAR(20) DEFAULT 'MANUAL',
  timestamp   TIMESTAMPTZ DEFAULT NOW()
);
```

### 8.2 Operations Tables

```sql
-- DRIVERS
CREATE TABLE drivers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id),
  user_id         UUID REFERENCES users(id) UNIQUE,
  licence_number  VARCHAR(100),
  licence_expiry  DATE,
  vehicle_id      UUID REFERENCES vehicles(id),
  is_available    BOOLEAN DEFAULT TRUE,
  current_lat     DECIMAL(10,8),
  current_lng     DECIMAL(11,8),
  last_location_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- VEHICLES
CREATE TABLE vehicles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id),
  registration    VARCHAR(50),
  make            VARCHAR(100),
  model           VARCHAR(100),
  year            INT,
  type            VARCHAR(30),  -- VAN | TRUCK | MOTORCYCLE | BICYCLE
  capacity_kg     DECIMAL(8,2),
  capacity_m3     DECIMAL(8,2),
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ROUTES / TRIPS
CREATE TABLE routes (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id),
  driver_id     UUID REFERENCES drivers(id),
  vehicle_id    UUID REFERENCES vehicles(id),
  date          DATE NOT NULL,
  status        VARCHAR(20) DEFAULT 'PLANNED',
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE route_stops (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id      UUID REFERENCES routes(id) ON DELETE CASCADE,
  shipment_id   UUID REFERENCES shipments(id),
  stop_order    INT NOT NULL,
  type          VARCHAR(20) NOT NULL,  -- PICKUP | DELIVERY
  estimated_at  TIMESTAMPTZ,
  arrived_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ
);

-- POD ASSETS
CREATE TABLE pod_assets (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID REFERENCES tenants(id),
  shipment_id  UUID REFERENCES shipments(id),
  type         VARCHAR(20) NOT NULL,  -- PHOTO | SIGNATURE | DOCUMENT
  file_url     TEXT NOT NULL,
  file_size    INT,
  captured_by  UUID REFERENCES users(id),
  captured_at  TIMESTAMPTZ DEFAULT NOW()
);

-- SERVICE ZONES & RATE CARDS
CREATE TABLE service_zones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id),
  name        VARCHAR(100) NOT NULL,
  zone_type   VARCHAR(20) DEFAULT 'NATIONAL',
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE rate_cards (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID REFERENCES tenants(id),
  name             VARCHAR(100),
  origin_zone_id   UUID REFERENCES service_zones(id),
  dest_zone_id     UUID REFERENCES service_zones(id),
  service_tier     VARCHAR(20),
  base_price       DECIMAL(12,2),
  price_per_kg     DECIMAL(10,4),
  currency         CHAR(3),
  is_active        BOOLEAN DEFAULT TRUE,
  effective_from   DATE,
  effective_to     DATE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
```

### 8.3 Finance Tables

```sql
-- INVOICES
CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id),
  invoice_number  VARCHAR(50) UNIQUE NOT NULL,
  customer_id     UUID REFERENCES users(id),
  organisation_id UUID REFERENCES organisations(id),
  shipment_id     UUID REFERENCES shipments(id),
  line_items      JSONB NOT NULL,
  subtotal        DECIMAL(12,2),
  tax_rate        DECIMAL(5,2) DEFAULT 0,
  tax_amount      DECIMAL(12,2) DEFAULT 0,
  discount_amount DECIMAL(12,2) DEFAULT 0,
  total           DECIMAL(12,2),
  currency        CHAR(3),
  status          VARCHAR(20) DEFAULT 'DRAFT',
  due_date        DATE,
  payment_terms   INT DEFAULT 0,
  notes           TEXT,
  e_invoice_ref   VARCHAR(255),
  e_invoice_status VARCHAR(30),
  sent_at         TIMESTAMPTZ,
  paid_at         TIMESTAMPTZ,
  voided_at       TIMESTAMPTZ,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- PAYMENTS
CREATE TABLE payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID REFERENCES tenants(id),
  invoice_id        UUID REFERENCES invoices(id),
  shipment_id       UUID REFERENCES shipments(id),
  customer_id       UUID REFERENCES users(id),
  amount            DECIMAL(12,2) NOT NULL,
  currency          CHAR(3) NOT NULL,
  method            VARCHAR(30),   -- STRIPE | PAYSTACK | BANK_TRANSFER | CASH | M_PESA
  status            VARCHAR(20) DEFAULT 'PENDING',
  gateway_ref       VARCHAR(255),
  gateway_response  JSONB,
  idempotency_key   VARCHAR(255) UNIQUE,
  refunded_amount   DECIMAL(12,2) DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- REFUNDS
CREATE TABLE refunds (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id),
  payment_id  UUID REFERENCES payments(id),
  amount      DECIMAL(12,2) NOT NULL,
  reason      TEXT,
  gateway_ref VARCHAR(255),
  status      VARCHAR(20) DEFAULT 'PENDING',
  initiated_by UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- CREDIT NOTES
CREATE TABLE credit_notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id),
  invoice_id      UUID REFERENCES invoices(id),
  customer_id     UUID REFERENCES users(id),
  organisation_id UUID REFERENCES organisations(id),
  credit_number   VARCHAR(50) UNIQUE NOT NULL,
  amount          DECIMAL(12,2) NOT NULL,
  currency        CHAR(3),
  reason          TEXT,
  applied_to      UUID REFERENCES invoices(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- CURRENCY RATES
CREATE TABLE currency_rates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency CHAR(3) NOT NULL,
  to_currency   CHAR(3) NOT NULL,
  rate          DECIMAL(18,8) NOT NULL,
  source        VARCHAR(30) DEFAULT 'OPEN_EXCHANGE',
  fetched_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(from_currency, to_currency, fetched_at::DATE)
);
```

### 8.4 CRM Tables

```sql
-- LEADS
CREATE TABLE leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id),
  company         VARCHAR(255),
  contact_name    VARCHAR(255),
  email           VARCHAR(255),
  phone           VARCHAR(50),
  stage           VARCHAR(30) DEFAULT 'PROSPECT',  -- PROSPECT | QUOTED | NEGOTIATING | WON | LOST
  assigned_to     UUID REFERENCES users(id),
  source          VARCHAR(50),
  notes           TEXT,
  won_at          TIMESTAMPTZ,
  lost_at         TIMESTAMPTZ,
  lost_reason     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- QUOTES
CREATE TABLE quotes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id),
  quote_number    VARCHAR(50) UNIQUE NOT NULL,
  lead_id         UUID REFERENCES leads(id),
  customer_id     UUID REFERENCES users(id),
  organisation_id UUID REFERENCES organisations(id),
  shipment_data   JSONB NOT NULL,
  line_items      JSONB,
  subtotal        DECIMAL(12,2),
  total           DECIMAL(12,2),
  currency        CHAR(3),
  status          VARCHAR(20) DEFAULT 'DRAFT',  -- DRAFT | SENT | ACCEPTED | REJECTED | EXPIRED
  valid_until     TIMESTAMPTZ,
  accepted_at     TIMESTAMPTZ,
  rejected_at     TIMESTAMPTZ,
  shipment_id     UUID REFERENCES shipments(id),  -- linked on acceptance
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 8.5 Platform & Integration Tables

```sql
-- SUBSCRIPTIONS
CREATE TABLE subscriptions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID REFERENCES tenants(id),
  plan                   VARCHAR(20) NOT NULL,
  billing_cycle          VARCHAR(10) DEFAULT 'MONTHLY',
  status                 VARCHAR(20) DEFAULT 'TRIALING',
  stripe_subscription_id VARCHAR(255),
  stripe_customer_id     VARCHAR(255),
  current_period_start   TIMESTAMPTZ,
  current_period_end     TIMESTAMPTZ,
  trial_start            TIMESTAMPTZ,
  trial_end              TIMESTAMPTZ,
  cancelled_at           TIMESTAMPTZ,
  cancel_at_period_end   BOOLEAN DEFAULT FALSE,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- API KEYS
CREATE TABLE api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id),
  name        VARCHAR(100),
  key_hash    TEXT UNIQUE NOT NULL,
  key_prefix  VARCHAR(16) NOT NULL,
  scopes      TEXT[] DEFAULT ARRAY['read:shipments','write:shipments'],
  rate_limit  INT DEFAULT 500,
  last_used   TIMESTAMPTZ,
  is_active   BOOLEAN DEFAULT TRUE,
  expires_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- WEBHOOK ENDPOINTS
CREATE TABLE webhook_endpoints (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id),
  url         TEXT NOT NULL,
  secret      TEXT NOT NULL,
  events      TEXT[] NOT NULL,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- WEBHOOK DELIVERIES
CREATE TABLE webhook_deliveries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id     UUID REFERENCES webhook_endpoints(id),
  event_type      VARCHAR(100) NOT NULL,
  payload         JSONB NOT NULL,
  response_status INT,
  response_body   TEXT,
  duration_ms     INT,
  attempt         INT DEFAULT 1,
  status          VARCHAR(20) DEFAULT 'PENDING',
  next_retry_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- SHIPMENT DOCUMENTS
CREATE TABLE shipment_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID REFERENCES tenants(id),
  shipment_id  UUID REFERENCES shipments(id),
  type         VARCHAR(50) NOT NULL,  -- DELIVERY_NOTE | MANIFEST | AWB | BOL | POD | INVOICE
  template_id  VARCHAR(50),
  file_url     TEXT NOT NULL,
  file_size    INT,
  expires_at   TIMESTAMPTZ,
  generated_by UUID REFERENCES users(id),
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

-- USAGE TRACKING
CREATE TABLE usage_records (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id),
  month       CHAR(7) NOT NULL,
  shipments   INT DEFAULT 0,
  api_calls   INT DEFAULT 0,
  sms_sent    INT DEFAULT 0,
  emails_sent INT DEFAULT 0,
  storage_mb  INT DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, month)
);

-- NOTIFICATION LOG
CREATE TABLE notification_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id),
  user_id     UUID REFERENCES users(id),
  shipment_id UUID REFERENCES shipments(id),
  channel     VARCHAR(10) NOT NULL,  -- EMAIL | SMS | PUSH
  event       VARCHAR(50) NOT NULL,
  status      VARCHAR(20) DEFAULT 'QUEUED',
  provider_ref VARCHAR(255),
  error       TEXT,
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- OUTBOX (event-driven consistency)
CREATE TABLE outbox_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type VARCHAR(50) NOT NULL,
  aggregate_id   UUID NOT NULL,
  event_type     VARCHAR(100) NOT NULL,
  payload        JSONB NOT NULL,
  published      BOOLEAN DEFAULT FALSE,
  published_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- AUDIT LOG
CREATE TABLE audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id),
  actor_id      UUID REFERENCES users(id),
  actor_type    VARCHAR(20) DEFAULT 'USER',
  actor_ip      INET,
  session_id    UUID,
  action        VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id   UUID,
  before_state  JSONB,
  after_state   JSONB,
  metadata      JSONB,
  timestamp     TIMESTAMPTZ DEFAULT NOW()
);

-- REGIONAL PROFILES
CREATE TABLE regional_profiles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region      VARCHAR(50) UNIQUE NOT NULL,
  currencies  TEXT[] NOT NULL,
  languages   TEXT[] NOT NULL,
  payment_gateways TEXT[] NOT NULL,
  config      JSONB NOT NULL
);

-- BRANCHES (Enterprise)
CREATE TABLE branches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id),
  name        VARCHAR(255),
  region      VARCHAR(50),
  address     JSONB,
  manager_id  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- SSO PROVIDERS (Enterprise)
CREATE TABLE sso_providers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID REFERENCES tenants(id),
  provider_type   VARCHAR(20) NOT NULL,  -- SAML | OIDC
  entity_id       TEXT,
  sso_url         TEXT,
  certificate     TEXT,
  attribute_map   JSONB,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ACCOUNTING CONNECTIONS
CREATE TABLE accounting_connections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id),
  provider      VARCHAR(30) NOT NULL,  -- XERO | QUICKBOOKS | SAGE | SAP | ZOHO
  access_token  TEXT,
  refresh_token TEXT,
  token_expiry  TIMESTAMPTZ,
  tenant_ref    VARCHAR(255),
  is_active     BOOLEAN DEFAULT TRUE,
  last_sync     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- CARRIER CONNECTIONS (Enterprise)
CREATE TABLE carrier_connections (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id),
  carrier       VARCHAR(50) NOT NULL,
  credentials   JSONB,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- CARRIER BOOKINGS (Enterprise)
CREATE TABLE carrier_bookings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID REFERENCES tenants(id),
  shipment_id      UUID REFERENCES shipments(id),
  carrier          VARCHAR(50) NOT NULL,
  booking_ref      VARCHAR(255),
  carrier_tracking VARCHAR(255),
  status           VARCHAR(30),
  booking_data     JSONB,
  booked_at        TIMESTAMPTZ DEFAULT NOW()
);

-- CUSTOMS DECLARATIONS (Enterprise)
CREATE TABLE customs_declarations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID REFERENCES tenants(id),
  shipment_id      UUID REFERENCES shipments(id),
  declaration_type VARCHAR(30),
  declaration_ref  VARCHAR(255),
  hs_codes         JSONB,
  total_value      DECIMAL(12,2),
  currency         CHAR(3),
  status           VARCHAR(30) DEFAULT 'DRAFT',
  submitted_at     TIMESTAMPTZ,
  cleared_at       TIMESTAMPTZ,
  documents        JSONB
);

-- IDEMPOTENCY KEYS
CREATE TABLE idempotency_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID REFERENCES tenants(id),
  key          VARCHAR(255) NOT NULL,
  request_hash TEXT,
  response     JSONB,
  status_code  INT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  expires_at   TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
  UNIQUE(tenant_id, key)
);
```

---

## 9. Shipment State Machine

```
                ┌─────────────┐
                │   PENDING   │ ← Created, payment pending
                └──────┬──────┘
                       │ Payment confirmed / manual
                ┌──────▼──────┐
                │ PROCESSING  │ ← Awaiting pickup
                └──────┬──────┘
                       │ Driver collects
                ┌──────▼──────┐
                │  PICKED_UP  │
                └──────┬──────┘
                       │ In transport network
                ┌──────▼──────┐
          ┌─────│  IN_TRANSIT │─────┐
          │     └──────┬──────┘     │
          │     ┌──────▼──────┐     │
          │     │OUT_FOR_DELVRY│     │
          │     └──────┬──────┘     │
          │     ┌──────▼──────┐     │
          │     │  DELIVERED   │     │ (terminal)
          │     └─────────────┘     │
          │     ┌──────────────┐    │
          └────►│FAILED_DELIV. │◄───┘
                └──────┬───────┘
                       │ Re-attempt / return
                ┌──────▼──────┐
                │  RETURNED   │ (terminal)
                └─────────────┘

Any non-terminal state → CANCELLED (if before PICKED_UP)
Any state → EXCEPTION (admin override — re-enters flow)
```

### Allowed Transitions (enforced in code — all others rejected with 400)

```typescript
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PENDING:          ['PROCESSING', 'CANCELLED'],
  PROCESSING:       ['PICKED_UP', 'CANCELLED'],
  PICKED_UP:        ['IN_TRANSIT', 'EXCEPTION'],
  IN_TRANSIT:       ['OUT_FOR_DELIVERY', 'FAILED_DELIVERY', 'EXCEPTION'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED_DELIVERY', 'EXCEPTION'],
  FAILED_DELIVERY:  ['OUT_FOR_DELIVERY', 'RETURNED', 'EXCEPTION'],
  EXCEPTION:        ['PROCESSING', 'IN_TRANSIT', 'CANCELLED'],
  DELIVERED:        [],  // terminal
  RETURNED:         [],  // terminal
  CANCELLED:        [],  // terminal
};
```

### Tracking Number Format

```
{TENANT_SLUG}-{YYYYMM}-{6CHAR}
Example: FWD-202506-A3F9K2
```

### Pricing Engine

```
Base price = weight_kg × zone_rate[origin_zone][dest_zone]
Service multiplier: STANDARD=1.0× | EXPRESS=1.6× | OVERNIGHT=2.2×
Surcharges: Oversize (+15%) | Insurance (+2% declared value) | Remote area (+£5–£20)
Final price = (base × multiplier × surcharges) + VAT
```

---

## 10. Feature Modules

### 10.1 Core Platform (All Tiers)

- Multi-tenant portal — branded subdomain or custom domain
- Shipment lifecycle with state machine
- Real-time status updates via WebSocket, scoped per tenant
- Role system with 8 roles
- Staff management — invite by email, assign roles
- Customer portal — self-service booking, order history, payment
- Basic analytics — shipment volumes, status breakdown
- Email notifications
- PDF delivery note generation
- PWA (installable, offline-capable)

### 10.2 CRM & Sales (Pro + Enterprise)

- Customer records with full shipment history
- Lead pipeline: Prospect → Quoted → Negotiating → Won/Lost
- Quotation engine with pricing breakdown
- Accepted quote → auto-creates shipment booking
- Revenue per sales rep, conversion rate, win/loss tracking

### 10.3 Operations & Document Management (Pro + Enterprise)

Document types generated (PDF, all tenant-branded):
- Booking confirmation, delivery note, proof of delivery
- Cargo manifest, packing list
- Air waybill (Enterprise — IATA format)
- Bill of lading (Enterprise — IMO format)
- Commercial invoice for customs

Operations features:
- Daily dispatch board — shipments grouped by driver
- Route optimisation view
- Capacity planning — shipments per driver, overload warnings
- Carrier assignment (Enterprise)

### 10.4 Finance & Invoicing (Pro + Enterprise)

- Auto-generate invoices on delivery or manual trigger
- Invoice status: Draft → Sent → Paid → Overdue
- Automatic overdue reminders (configurable: 7, 14, 30 days)
- Bulk invoicing for date ranges
- Record manual payments (bank transfer, cash)
- Revenue dashboard, outstanding receivables, cash vs invoiced
- Expense tracking and gross margin per shipment (Enterprise)

### 10.5 Accounting Integrations (Pro: 1 · Enterprise: All)

Bidirectional sync: invoices, payments, contacts, expenses.

| Software | Regions |
|----------|---------|
| Xero | UK, AU, NZ, South Africa |
| QuickBooks Online | US, Canada, UK, AU |
| Sage | UK, South Africa |
| SAP Business One / S/4HANA | Global Enterprise |
| Microsoft Dynamics 365 | Global Enterprise |
| Zoho Books | India, Middle East |
| TallyPrime | India, East Africa |

### 10.6 Carrier Integrations (Enterprise)

Air: Traxon CargoHUB, Descartes, WebCargo, CCNhub, Cargonaut
Ocean: INTTRA, CargoFive, Chain.io
Visibility: Wakeo, project44, FourKites
Last-mile: region-specific (see Section 11)

### 10.7 E-Invoicing & Tax Compliance (Enterprise)

| Region | Standard | Authority |
|--------|----------|-----------|
| UK | PEPPOL / MTD | HMRC |
| EU | PEPPOL EN16931 | National authorities |
| Nigeria | BIS Billing 3.0 | FIRS |
| Kenya | eTIMS | KRA |
| Saudi Arabia | ZATCA Phase 2 | ZATCA |
| UAE | VAT compliant | FTA |
| Egypt | ETA | Egyptian Tax Authority |
| South Africa | SARS e-filing | SARS |

### 10.8 API Access & Webhooks (Pro + Enterprise)

Full REST API with API key authentication, per-key rate limiting, scoped permissions.
Webhooks fire on: `shipment.*`, `payment.*`, `invoice.*`, `quote.*`
Each request signed with HMAC-SHA256 in `X-Webhook-Signature` header.

### 10.9 Notifications

| Event | Starter | Pro/Enterprise |
|-------|---------|----------------|
| Booking confirmed | Email | Email + SMS |
| Payment received | Email | Email + SMS |
| Shipment picked up | Email | Email + SMS |
| In transit | Email | Email |
| Out for delivery | Email | Email + SMS |
| Delivered | Email | Email + SMS |
| Invoice sent | Email | Email |
| Invoice overdue | Email | Email + SMS |

### 10.10 Analytics & Reporting

**Starter:** Shipments this month by status, recent activity feed.
**Pro:** Revenue charts, volume trends, on-time rate, top customers, staff performance, CSV export.
**Enterprise:** Profit margin per shipment/route/customer, multi-branch comparison, custom report builder, scheduled report emails, data warehouse export.

---

## 11. Regional Deployment & Tailoring

Each region is a configuration profile applied at tenant signup. It activates the correct payment gateway, currency, tax module, carriers, and language defaults.

### 11.1 UK & Western Europe

- **Payments:** Stripe, GoCardless
- **Currencies:** GBP, EUR, CHF
- **Languages:** English, French, German, Spanish, Dutch
- **Accounting:** Xero, QuickBooks, Sage
- **Tax:** MTD (UK), PEPPOL, VAT per country
- **Carriers:** Royal Mail, DPD, Evri, Parcelforce, DHL UK, FedEx UK
- **Customs:** UK CDS, EU AES/ICS2
- **Regulatory:** GDPR, ICO registration

### 11.2 West Africa

- **Markets:** Nigeria, Ghana, Côte d'Ivoire, Senegal, Cameroon, Benin
- **Payments:** Paystack, Flutterwave, Remita
- **Currencies:** NGN, GHS, XOF, XAF
- **Languages:** English, French
- **Tax:** FIRS e-invoicing (Nigeria), GRA VAT (Ghana)
- **Carriers:** GIG Logistics, Red Star Express, DHL Nigeria, Kwik
- **Customs:** NICIS II (Nigeria), GCNET (Ghana)
- **Features:** Mobile Money reconciliation, SMS-first notifications, offline-first operations

### 11.3 East Africa

- **Markets:** Kenya, Uganda, Tanzania, Ethiopia, Rwanda, Zambia
- **Payments:** M-Pesa, Flutterwave, Pesapal
- **Currencies:** KES, UGX, TZS, ETB, RWF, ZMW
- **Languages:** English, Swahili
- **Tax:** KRA eTIMS (Kenya), URA (Uganda)
- **Carriers:** Sendy, Fargo Courier, DHL Kenya
- **Features:** M-Pesa STK Push, multi-currency EAC corridor

### 11.4 Southern Africa

- **Markets:** South Africa, Zimbabwe, Zambia, Mozambique, Botswana, Namibia
- **Payments:** Peach Payments, PayFast, Ozow, Stitch Money
- **Currencies:** ZAR, ZWL, ZMW, MZN, BWP, NAD
- **Tax:** SARS VAT 15%, VAT201 returns
- **Carriers:** The Courier Guy, Courier It, Dawn Wing, PostNet, DHL SA

### 11.5 North Africa & Middle East

- **Markets:** UAE, Saudi Arabia, Egypt, Morocco, Tunisia, Qatar, Kuwait
- **Payments:** Stripe MENA, Checkout.com, HyperPay, Fawry, PayTabs
- **Currencies:** AED, SAR, EGP, MAD, TND, QAR, KWD
- **Languages:** English, Arabic (full RTL)
- **Tax:** UAE VAT 5%, ZATCA Phase 2 (Saudi), ETA e-invoicing (Egypt)
- **Carriers:** Aramex, Fetchr, SMSA Express, Naqel, Bosta
- **Customs:** Dubai Customs (Mirsal 2), FASAH (Saudi), ACID (Egypt)
- **Features:** Full RTL UI, bilingual documents (Arabic + English), Hijri calendar support

### 11.6 North America

- **Markets:** USA, Canada
- **Payments:** Stripe, Square
- **Currencies:** USD, CAD
- **Languages:** English, French (Canada)
- **Tax:** Sales tax per state (TaxJar), GST/HST/PST (Canada)
- **Carriers:** UPS, FedEx, USPS, Canada Post, Purolator
- **Customs:** ACE (USA), CERS (Canada)

### 11.7 Asia Pacific

- **Markets:** India, Australia, Singapore
- **Payments:** Razorpay (India), Stripe (AU/SG), PayNow (SG)
- **Currencies:** INR, AUD, SGD
- **Tax:** GST e-invoicing (India), GST 10% (AU), GST 9% (SG)
- **Carriers:** Delhivery, BlueDart (India), Australia Post, Sendle (AU), SingPost, Ninja Van (SG)

### Regional Launch Sequence

| Quarter | Region | Why |
|---------|--------|-----|
| Q1 | UK + West Africa (Nigeria, Ghana) | Strongest network, Treny presence |
| Q2 | East Africa (Kenya, Uganda) | M-Pesa + fast-growing market |
| Q3 | Middle East (UAE, Saudi Arabia) | High ARPU, enterprise buyers, RTL ready |
| Q4 | Southern Africa + North Africa | SARS + ZATCA compliance unlocks these |
| Year 2 | North America + Asia Pacific | Larger competition, needs SOC2 first |

---

## 12. Enterprise Tier — Full Specification

### Dedicated Infrastructure

```
Enterprise Tenant Stack:
  Dedicated PostgreSQL (db.t3.medium, Multi-AZ)
  Dedicated Redis cluster
  Dedicated ECS task group
  Dedicated S3 bucket
  Data residency: UK (eu-west-2) | EU (eu-central-1) | UAE (me-central-1) |
                  West Africa (af-south-1) | US (us-east-1)
```

### SSO Integration

SAML 2.0 + OAuth 2.0/OIDC. Works with Azure AD, Okta, Google Workspace, OneLogin, Ping Identity. JIT provisioning — users auto-created on first SSO login with role mapping from IdP groups.

### Multi-Branch Support

One account, many offices. Branch-level staff assignment, analytics views, and shipment scoping. Super-admin sees consolidated view.

### Advanced RBAC

Custom roles with granular permission sets beyond the standard 8 roles.

### Audit Log

Every state change recorded: actor, IP, action, before/after state, timestamp, session ID. Immutable, exportable, queryable, retained 7 years, API-accessible for SIEM integration.

### SLA & Support

| Level | Standard | Enterprise |
|-------|----------|-----------|
| Uptime | Best effort | 99.9% (credits for breaches) |
| P1 response | 4h | 1h, 24/7 |
| P2 response | 24h | 4h |
| P3 response | 48h | 8h |
| Support channels | Email | Email + Slack + Phone |
| Account manager | No | Dedicated |

---

## 13. Frontend Design System

### 13.1 Design Tokens

```css
/* Brand (marketing site only) */
--brand-navy: #0D1F3C;
--brand-amber: #D97706;
--brand-white: #FFFFFF;

/* Neutral palette */
--gray-50: #F9FAFB; --gray-100: #F3F4F6; --gray-200: #E5E7EB;
--gray-500: #6B7280; --gray-700: #374151; --gray-900: #111827;

/* Semantic (FIXED — never overridden by tenant brand) */
--color-success: #16A34A;       --color-success-light: #DCFCE7;
--color-warning: #D97706;       --color-warning-light: #FEF3C7;
--color-error: #DC2626;         --color-error-light: #FEE2E2;
--color-info: #2563EB;          --color-info-light: #DBEAFE;

/* Tenant theme (CSS vars loaded from API) */
--tenant-primary: <from API>;
--tenant-primary-hover: <darken 10%>;
--tenant-primary-light: <lighten + opacity>;
--tenant-accent: <from API>;
```

### 13.2 Shipment State → Colour Mapping

| State | Background | Text | Dot |
|-------|-----------|------|-----|
| PENDING | gray-100 | gray-700 | gray-400 |
| PROCESSING | blue-100 | blue-700 | blue-500 |
| PICKED_UP | indigo-100 | indigo-700 | indigo-500 |
| IN_TRANSIT | amber-100 | amber-700 | amber-500 |
| OUT_FOR_DELIVERY | amber-100 | amber-700 | amber-500 (pulse) |
| DELIVERED | green-100 | green-700 | green-500 |
| FAILED_DELIVERY | red-100 | red-700 | red-500 |
| RETURNED | orange-100 | orange-700 | orange-500 |
| CANCELLED | gray-100 | gray-400 | gray-300 (strikethrough) |
| EXCEPTION | red-100 | red-700 | red-500 (alert icon) |

Invoice: DRAFT=gray | SENT=blue | PAID=green | OVERDUE=red | VOID=gray+strikethrough
Subscription: ACTIVE=green | TRIAL=amber | PAST_DUE=red | SUSPENDED=red | CANCELLED=gray

### 13.3 Typography Scale

| Token | Size | Use |
|-------|------|-----|
| xs | 12px | Captions, timestamps |
| sm | 14px | Table cells, secondary text |
| base | 16px | Body text, inputs |
| lg | 18px | Subheadings |
| xl | 20px | Section titles |
| 2xl | 24px | Page titles |
| 3xl–5xl | 30–48px | Marketing headlines |

Weights: 400 (normal), 500 (medium), 600 (semibold), 700 (bold)

**Monospace rules — ALWAYS mono:** tracking numbers, API keys, webhook URLs/secrets, system IDs, queue names, JSON payloads, log entries, status codes, key prefixes.
**NEVER mono:** names, descriptions, labels, buttons, navigation, headings.

### 13.4 Visual Principles

- Professional, modern, operationally clear
- Data-dense where needed
- Flat bordered cards (1px border-gray-200) over heavy shadows
- Accessible contrast (WCAG 2.1 AA)
- Role-aware navigation
- No visual clutter, no "startup gimmick" visuals in operational dashboards
- Elevation priority: borders > shadow-sm (dropdowns) > shadow-md (modals) > shadow-lg (drawers)

### 13.5 Spacing Scale (px)

4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128

### 13.6 Border Radius

none=0 | sm=4 | md=6 | lg=8 | xl=12 | full=9999
Cards: lg | Buttons: md | Badges: full | Inputs: md

### 13.7 Responsive Breakpoints

sm=640 | md=768 | lg=1024 | xl=1280 | 2xl=1536
Sidebar collapses at <lg. Tables convert to cards at <md.

### 13.8 State Patterns (every page must implement)

- **Loading:** skeleton matching content shape
- **Empty:** illustration + heading + description + CTA
- **Error:** error message + retry button
- **Permission denied:** lock icon + "You don't have access" + "Contact your admin"
- **Plan gated:** lock icon + feature description + "Upgrade to Pro" CTA
- **Limit reached:** warning banner + upgrade CTA + action blocked

### 13.9 White-Label Theming Contract

Tenant config API returns: `{ primary_color, accent_color, logo_url, brand_name, rtl, locale, currency, timezone }`

Applied as CSS custom properties on `:root`. Components reference `var(--tenant-primary)`. Semantic colours are hardcoded, never variable. RTL: `dir="rtl"` on html, logical CSS properties.

**Critical rule: No hardcoded tenant colours in any white-label surface.**

---

## 14. Frontend Surface Specifications

### 14.1 Marketing Site — fauward.com

**Stack:** Next.js 14 App Router, TypeScript, Tailwind, SSR/SEO-first, Fauward brand only.

**Pages:** Landing, Pricing, Features (per module), Regional landings, Signup, Docs entry.

**Landing page sections:** Hero → Social proof → Feature sections (Tracking, Finance, Admin) → Screenshot showcase → Pricing preview → Region strip → Testimonials → FAQ → CTA banner → Footer.

**Design:** Large typography, strong section spacing, subtle motion, premium SaaS feel, logistics credibility.

### 14.2 Tenant Portal — {tenant}.fauward.com

**Stack:** React 18, Vite, Tailwind, Zustand, React Query, Radix UI, Socket.io-client.

**Shell:** Left sidebar (256px, collapsible) + top bar (breadcrumb, search, notifications, avatar) + main content.

**Navigation by role:** Role-based sidebar items. Active state uses `var(--tenant-primary)`.

**Public routes (no auth):** `/track`, `/track/:number`, `/book`
**Customer routes:** Dashboard, Shipments, Booking, Invoices, Profile
**Staff/Admin routes:** Admin overview, Shipments management, Routes/dispatch, CRM, Finance, Analytics, Team, Settings (branding, billing, API keys, webhooks)

### 14.3 Shipment Management UI

**List page:** Dense sortable table with filters (status, date, route, driver, customer), bulk actions, search by tracking number.

**Detail page:** Summary card + info grid + tabs (Timeline, Documents, Invoice, Notes) + status transition controls.

**Create wizard:** 4 steps (Addresses → Package → Service/Pricing → Review) → success state with tracking number.

**Status update:** Only valid next states shown. DELIVERED requires POD. FAILED requires reason.

### 14.4 Public Tracking

White-label pages under tenant's branded domain. No login required.

**Lookup:** Tenant logo + tracking input + Track button. Clean, trustworthy, mobile-first.
**Result:** Tracking number + status progress bar + vertical timeline (hero element) + delivery confirmation.

### 14.5 Onboarding Wizard

5 steps: Brand → First Shipment → Invite Team → Connect Payment → Go Live.
Each step achievable in under 2 minutes. Skip options for optional steps. Live preview for branding. Dashboard checklist shown after completion.

### 14.6 Billing & Plan Management

Current plan card + usage meters (80% warning, 100% error) + plan comparison + invoice history + payment method. Global banners for trial expiry, usage warnings, limit reached, failed payment, suspension.

### 14.7 API Keys & Webhooks (Pro+)

**API Keys:** Table + generate modal + one-time reveal + copy + revoke flow.
**Webhooks:** Endpoint table + add/edit modal + send test + delivery log with payload viewer.

### 14.8 Driver Mobile PWA

**Constraints:** Mobile-first, 48px touch targets, high contrast, offline-capable, one-handed use.
**Screens:** Login → Today's route → Stop detail → Shipment detail → Capture POD → Failed delivery → Offline/sync state.
**Bottom tab bar:** Route | Deliveries | History | Profile.

### 14.9 Super Admin Panel — admin.fauward.com

**Separate app, Fauward brand only.** Maximum data density. Heavy tables, filters, charts, logs.

**Pages:** Dashboard (MRR, tenants, shipments, DLQ) → Tenants list/detail → Revenue analytics → System health → Queue monitoring → Impersonation.

### 14.10 Embeddable Widget

Vanilla JS + CSS, Shadow DOM, < 15KB gzipped. Zero dependencies. Configurable via `<script>` tag attributes. Renders tracking input + timeline inline.

---

## 15. API Design

### REST API Conventions

- Base URL: `https://api.fauward.com/v1`
- Auth: `Authorization: Bearer <access_token>` or API key
- Format: JSON
- Errors follow RFC 7807

### Core Endpoints

```
AUTH
POST   /auth/register          POST   /auth/login
POST   /auth/logout             POST   /auth/refresh
POST   /auth/forgot-password    POST   /auth/reset-password

SHIPMENTS
GET    /shipments               POST   /shipments
GET    /shipments/:id           PATCH  /shipments/:id/status
PATCH  /shipments/:id/assign    DELETE /shipments/:id

TRACKING
GET    /tracking/:trackingNumber   (public)

PAYMENTS
POST   /payments/intent         GET    /payments/:shipmentId
POST   /webhooks/stripe         (Stripe webhook receiver)

INVOICES
GET    /invoices                POST   /invoices
GET    /invoices/:id            POST   /invoices/:id/send

CRM
GET    /customers               POST   /quotes
GET    /quotes                  PATCH  /quotes/:id

USERS
GET    /users/me                PATCH  /users/me
GET    /users                   POST   /users/invite

ANALYTICS
GET    /analytics/overview      GET    /analytics/shipments
GET    /analytics/revenue

PLATFORM
GET    /usage                   POST   /webhooks (register endpoint)
```

### WebSocket Events

```
Connection: wss://api.fauward.com/tracking
Client → Server: { type: "subscribe", trackingNumber: "FWD-202506-A3F9K2" }
Server → Client: { type: "status_update", data: { status, location, timestamp } }
```

### Standardised Error Response

```json
{
  "error": "Human-readable message",
  "code": "MACHINE_READABLE_CODE",
  "statusCode": 422,
  "details": [{ "field": "weight_kg", "message": "Must be greater than 0" }],
  "requestId": "uuid"
}
```

---

## 16. Infrastructure & Non-Functional Requirements

### Performance Targets

| Metric | Target |
|--------|--------|
| API p50 | < 100ms |
| API p95 | < 250ms |
| API p99 | < 500ms |
| WebSocket latency | < 2 seconds |
| PDF generation | < 3 seconds |
| Page load (LCP) | < 2.5 seconds |
| Uptime (Starter/Pro) | 99.5% |
| Uptime (Enterprise) | 99.9% |

### Scale Assumptions

| Metric | Year 1 | Year 2 |
|--------|--------|--------|
| Active tenants | 150 | 350 |
| Concurrent API requests | 500 | 2,000 |
| Concurrent WebSocket connections | 1,000 | 5,000 |
| Shipments per day (all tenants) | 5,000 | 25,000 |
| DB rows (shipments) | 2M | 10M |

### Scaling Strategy

**Phase 1 (0–5K users):** Modular monolith, 2–4 ECS tasks, single PostgreSQL + read replica.
**Phase 2 (5K–50K users):** Extract Tracking + Notification services. Shared auth via JWT.
**Phase 3 (50K+ users):** Event-driven (Kafka/SNS+SQS), per-service databases, API gateway + service mesh.

### Caching (Redis)

User sessions (TTL 7d), shipment status (TTL 30s), pricing zone matrix (TTL 24h), analytics aggregates (TTL 5min), rate limiting counters (TTL 1min sliding window).

### Backup & DR

| Parameter | Value |
|-----------|-------|
| Backup | Continuous WAL + daily snapshots |
| PITR | 7 days (Starter/Pro), 35 days (Enterprise) |
| RPO | < 5 minutes |
| RTO | < 1 hour |
| Cross-region | S3 replication London → Frankfurt |
| DR drill | Quarterly |

---

## 17. Security Architecture

### Authentication

| Control | Implementation |
|---------|---------------|
| Password hashing | bcrypt, cost factor 12 |
| JWT access token | 15 min expiry, RS256 |
| Refresh token | 7 days, hashed in DB, rotated on use |
| MFA | TOTP via authenticator app, backup codes |
| SSO (Enterprise) | SAML 2.0 / OIDC, JIT provisioning |
| Suspicious login | New IP + new device → email verification |
| IP allowlisting (Enterprise) | Admin restricts API to IP ranges |

### API Security

| Control | Implementation |
|---------|---------------|
| API key scopes | `read:shipments`, `write:shipments`, `read:invoices`, etc. |
| Rate limiting | 100 req/min (general), 10/min (auth), 500/hr (API keys) |
| Key storage | bcrypt hashed, show-once |
| Document URLs | Signed S3, 1-hour expiry |
| Malware scanning | ClamAV on uploads |
| Input validation | Zod schemas on all inputs |
| SQL injection | Prisma ORM only — zero raw queries |

### Operational Security

| Control | Implementation |
|---------|---------------|
| Impersonation | Audit logged, 30-minute max |
| Key rotation | JWT secrets quarterly, API keys user-rotatable |
| Webhook security | HMAC-SHA256 signature verification |
| Secrets | AWS Secrets Manager — nothing in code |
| Dependency scanning | Dependabot + npm audit in CI |
| Pen testing | Annual third-party |

---

## 18. Product Experience

### 18.1 Onboarding Flow

```
Step 0: Sign up → creates Tenant (TRIALING) + TENANT_ADMIN
Step 1: Logo & Brand (2 min) — upload logo, pick colour, live preview
Step 2: First Shipment (optional) — pre-filled example form
Step 3: Invite Team (optional) — email + role selector
Step 4: Connect Payment (optional) — Stripe Connect OAuth
Step 5: Go Live — platform URL, share button, confetti
```

**Dashboard checklist (shown until complete):**
- Upload logo → Create first shipment → Track a shipment → Invite staff → Connect payment → (Pro) Custom domain → (Pro) Generate API key

### 18.2 Migration & Import

- CSV import for customers, shipment history, rate cards
- Excel (.xlsx) and Google Sheets support
- Validation: duplicate detection, address format, preview before import
- "Import from Logistaas" wizard

### 18.3 Error Handling UX

- 400 validation: highlight specific fields with inline error messages
- 422 business rule: toast with reason
- 429 limit reached: modal with upgrade CTA or pay-per-shipment option
- Payment failure: toast with card decline reason in plain English + retry button
- Offline: persistent banner, pending sync count, auto-sync on reconnection

---

## 19. Analytics & SaaS Metrics

### Internal KPIs (Super Admin Dashboard)

| Metric | Target |
|--------|--------|
| Activation rate (≥1 shipment in 7 days) | > 60% |
| Time to first shipment | < 15 min |
| Trial conversion | > 25% |
| Monthly churn | < 3% |
| Expansion MRR (upgrades) | > 10% of new MRR |
| NPS | > 40 |
| DAU/MAU | > 40% |

### Per-Tenant Health Metrics

Health score (composite), delivery success rate, payment collection rate, feature adoption, support load.

### Super Admin Analytics

MRR movement (new, churned, expansion, net), signup → activation → conversion funnel (monthly cohort), tenant health heatmap, regional MRR breakdown.

---

## 20. Go-To-Market & Revenue Model

### Revenue Projections

| Month | Tenants | Breakdown | MRR |
|-------|---------|-----------|-----|
| 1–2 | 5 (beta) | Free — UK + Nigeria | £0 |
| 3 | 12 | 8 Starter + 4 Pro | £548 |
| 6 | ~50 | Mixed | £2,100 |
| 12 | ~110 | Mixed with Enterprise | £6,200 |
| 18 | ~180 | Growing Enterprise | £13,500 |
| 24 | ~260 | Full portfolio | £22,000 |

*Month 24 ARR: ~£264,000 (with 3% monthly churn)*

### Sales Funnel

**Starter/Pro (fully self-serve):**
Landing page → Pricing → Sign up → 14-day trial (full Pro) → Onboarding → First shipment (activation) → Day 12 email → Day 14 billing

**Enterprise (outbound + inbound):**
LinkedIn outreach / inbound → Discovery call → Demo → Proposal → 30-day managed trial → Contract → Onboarding → Go-live → Quarterly reviews

### Partner & Reseller Programme

**Referral Partners:** 20% recurring commission (12 months), unique link, no minimum.
**Reseller Partners:** 40% discount, full white-label rights, partner portal.
**Technology Partners:** Certified API integrations, co-marketing, revenue share.

---

## 21. Legal & Compliance

### Documents Required

Terms of Service, Privacy Policy, Data Processing Agreement (GDPR Article 28), Acceptable Use Policy, Cookie Policy, Enterprise SLA Addendum, Reseller Agreement, White-label Terms.

### Compliance Roadmap

| Certification | Target | Required For |
|---------------|--------|-------------|
| GDPR | Launch | UK/EU tenants |
| SOC2 Type 1 | Month 12 | Enterprise sales |
| SOC2 Type 2 | Month 24 | Large enterprise |
| ISO 27001 | Month 18 | Middle East enterprise |
| PCI DSS | Via Stripe/Paystack | Payment processing |

### Liability Limits

Fauward is a software platform, not a carrier. Not liable for physical shipment loss. Platform liability capped at 3 months of subscription fees. Tenant responsible for their own tax compliance, customs declarations, and carrier relationships.

---

## 22. Implementation Phases

| Phase | File | Days | Builds |
|-------|------|------|--------|
| 1 | `PHASE-1-FOUNDATION.md` | 1 | Monorepo · Prisma schema · Tenant resolver · Auth · Prisma middleware · AsyncLocalStorage · CI |
| 2 | `PHASE-2-TENANT-ONBOARDING.md` | 1–2 | Tenant CRUD · Branding · Domain verification · Usage tracking · Plan enforcement · Feature guards |
| 3 | `PHASE-3-BILLING.md` | 2 | Stripe subscriptions · Trial · Dunning · Usage metering · Overage · Customer portal |
| 4 | `PHASE-4-LOGISTICS-CORE.md` | 2–4 | Shipment state machine · Tracking · WebSocket · Notifications · Driver model · POD · Documents |
| 5 | `PHASE-5-FRONTEND.md` | 3–5 | Marketing site · Tenant portal · Admin dashboard · Driver PWA · Super admin · Theming |
| 6 | `PHASE-6-PRO-FEATURES.md` | 5–6 | API keys + scopes · Webhooks + HMAC · Embeddable widget · Idempotency |
| 6b | `PHASE-6B-CRM-DOCS-FINANCE.md` | 5–7 | CRM leads/quotes · Document generation · Finance module · Invoice lifecycle · Credit notes |
| 6c | `PHASE-6C-INTEGRATIONS.md` | 6–8 | Xero/QuickBooks sync · Carrier APIs · E-invoicing · Regional payment gateways · Import tools |
| 7 | `PHASE-7-TESTING.md` | 6 | Cross-tenant security tests · State machine tests · Load test · E2E · Accessibility |
| 8 | `PHASE-8-DEPLOY.md` | 7 | Docker · CI/CD · AWS ECS/RDS/Redis/CloudFront · Custom domain SSL · CloudWatch · Launch checklist |
| 9 | `PHASE-9-ENTERPRISE.md` | 8+ | SSO · Multi-branch · Advanced RBAC · Audit log · Dedicated infra · MFA · IP allowlist |

### Strategic Constraint — What We Build First

**Rule:** Nothing gets built that does not directly enable a logistics business to create, manage, track a shipment, collect payment, and look professional to their customers.

**Must-have at launch (V1 — 8 weeks):** Tenant signup + branding, Shipment CRUD + state machine, Real-time tracking, Customer booking portal + public tracking, Stripe payments, Email notifications, PDF delivery note + basic invoice, Admin dashboard, PWA.

**Deferred to V1.1 (weeks 9–16):** CRM, Advanced finance, Accounting integrations, Carrier APIs, Enterprise tier, SMS.

**Deferred to V2 (months 5–12):** Native accounting, E-invoicing/customs, Multi-branch, SSO, All Enterprise features.

### Build vs Buy

| Component | Decision | Why |
|-----------|----------|-----|
| Payments | **Buy:** Stripe / Paystack | PCI compliance |
| Email | **Buy:** SendGrid | Deliverability |
| SMS | **Buy:** Twilio | Global carriers |
| Maps | **Buy:** Google Maps | Accuracy |
| PDF generation | **Build:** Puppeteer / PDFKit | Custom tenant templates |
| Document storage | **Buy:** AWS S3 | Managed, cheap |
| Auth (basic) | **Build:** JWT + bcrypt | Full control |
| SSO | **Build on:** passport-saml | Library handles protocol |
| Accounting integrations | **Buy:** Merge.dev or direct | Normalises 20+ APIs |
| E-invoicing | **Buy:** Regional specialist | Country-specific |
| Monitoring | **Buy:** CloudWatch + Sentry | Infra + app errors |
| Search | **Build:** PostgreSQL full-text | Sufficient at scale |

---

## 23. Tech Stack Summary

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend (Marketing)** | Next.js 14, TypeScript, Tailwind | SSR, SEO-first |
| **Frontend (Portal)** | React 18, Vite, TypeScript, Tailwind | Fast builds, SPA |
| **State Management** | Zustand (global) + React Query (server) | Lightweight |
| **UI Primitives** | Radix UI + CVA + Tailwind | Accessible, composable |
| **Forms** | React Hook Form + Zod | Type-safe validation |
| **Tables** | TanStack Table v8 | Virtualised, sortable |
| **Charts** | Recharts | Declarative, React-native |
| **Icons** | Lucide React | Consistent, MIT |
| **Backend** | Node.js, Fastify, TypeScript | High I/O throughput |
| **ORM** | Prisma | Type-safe, migrations |
| **Database** | PostgreSQL 15 (Supabase) | ACID, JSONB, tenant isolation |
| **Cache / PubSub** | Redis (Upstash) | Sessions, real-time, rate limiting |
| **Job Queue** | BullMQ | Reliable async processing |
| **WebSockets** | Socket.io + Redis adapter | Real-time tracking |
| **Payments** | Stripe + Paystack + regional | PCI-compliant, multi-region |
| **Email** | SendGrid | Transactional at scale |
| **SMS** | Twilio | Programmable SMS |
| **Maps** | Google Maps Platform | Autocomplete, routing |
| **Auth** | JWT + bcrypt + HttpOnly cookies | Stateless, secure |
| **CI/CD** | GitHub Actions | Test → Build → Deploy |
| **Containers** | Docker + AWS ECS/Fargate | Auto-scaling |
| **Monitoring** | CloudWatch + Sentry | Logs, metrics, errors |
| **Testing** | Jest (unit), Supertest (API), Playwright (E2E) | Full pyramid |

---

## 24. Implementation Status (April 2026)

> **For Codex:** This section is the ground truth of what exists today versus what the spec requires. Read sections 1–23 for the full specification. Read this section to know exactly what to build next, what files to fill in, and what to create from scratch. Every item below has been verified against the actual codebase.

---

### 24.1 Monorepo Structure

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

### 24.2 Backend — `apps/backend/src/`

#### What exists and works

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
- **Everything else is missing.** See section 24.5 for full spec.

**Finance module** — `modules/finance/` — **SKELETAL**
- `finance.routes.ts` — `GET /api/v1/finance/invoices`, `GET /finance/summary`, `POST /finance/invoices/:id/send`
- **Missing:** `POST /finance/invoices` (create), `GET /finance/invoices/:id`, `PATCH /finance/invoices/:id`, `POST /finance/invoices/:id/pay` (record payment), `POST /finance/invoices/:id/void`, credit notes, refunds, overdue reminders

**CRM module** — `modules/crm/` — **SKELETAL**
- `crm.routes.ts` — Only `GET /api/v1/crm/leads` (returns all, no pagination)
- **Missing:** `POST /crm/leads`, `PATCH /crm/leads/:id`, `GET /crm/leads/:id`, `GET /crm/quotes`, `POST /crm/quotes`, `PATCH /crm/quotes/:id`, `POST /crm/quotes/:id/accept` (creates shipment), `GET /crm/customers`, `GET /crm/customers/:id`

**Analytics module** — `modules/analytics/`
- `analytics.routes.ts` — `GET /api/v1/analytics/full` — returns shipment count, revenue total, volume by day (raw SQL, last 30 days), revenue by day (raw SQL, last 30 days). `onTimeRate` and `avgDeliveryDays` are hardcoded 0.
- **Missing:** `GET /analytics/shipments` (by status breakdown, by route), `GET /analytics/revenue` (by customer, by service tier), staff performance, top customers, CSV export endpoint

**Audit module** — `modules/audit/`
- `audit.routes.ts` — `GET /api/v1/audit-log` with pagination (page/limit), includes actor user, ordered by timestamp desc, gated by `auditLog` feature

**Driver module** — `modules/driver/`
- `driver.routes.ts` — `GET /api/v1/driver/route` — resolves driver record for current user, finds route for given date, returns stops with shipment data
- **Missing:** `PATCH /driver/stops/:id/status` (start/complete stop), `POST /driver/pod` (upload POD photo/signature), `GET /driver/history`, `PATCH /driver/shipments/:id/failed` (failed delivery with reason)

**Not yet created — entire modules**
- `modules/tracking/` — Public `GET /api/v1/tracking/:trackingNumber`, WebSocket setup with Socket.io + Redis adapter
- `modules/payments/` — Stripe intent, webhook handler, Paystack integration
- `modules/notifications/` — BullMQ queue setup, SendGrid email sender, Twilio SMS sender, email templates per event
- `modules/documents/` — PDF generation (Puppeteer/PDFKit), S3 upload, signed URL generation
- `modules/users/` — Staff management (`GET/POST /users`, `GET/PATCH /users/me`, `POST /users/invite`, `DELETE /users/:id`)
- `modules/super-admin/` — Super admin API: tenant list/detail, impersonation, plan override, suspend, queue stats

**Not yet created — infrastructure**
- BullMQ queue workers (notification worker, outbox worker, webhook delivery worker)
- Socket.io server with Redis adapter for multi-instance real-time tracking
- Rate limiting (fastify-rate-limit): 100/min general, 10/min auth endpoints, 500/hr for API key auth
- Idempotency middleware (check/store in `idempotency_keys` table for POST mutations)
- Prisma middleware for automatic `tenant_id` injection and multi-tenant isolation enforcement
- Outbox event pattern: write to `outbox_events` on state changes, worker publishes to queues

---

### 24.3 Prisma Schema — `apps/backend/prisma/schema.prisma`

**Status: Complete (893 lines).** All 35 models are defined matching section 8 of this spec. All enums are defined. Relations are correct.

**Models present:**
`Tenant`, `TenantSettings`, `User`, `RefreshToken`, `Organisation`, `Shipment`, `ShipmentItem`, `ShipmentEvent`, `PodAsset`, `Driver`, `Vehicle`, `Route`, `RouteStop`, `ServiceZone`, `RateCard`, `Invoice`, `Payment`, `Refund`, `CreditNote`, `CurrencyRate`, `Lead`, `Quote`, `Subscription`, `ApiKey`, `WebhookEndpoint`, `WebhookDelivery`, `ShipmentDocument`, `UsageRecord`, `NotificationLog`, `OutboxEvent`, `AuditLog`, `Branch`, `SsoProvider`, `AccountingConnection`, `IdempotencyKey`

**Action required:** Verify migrations have been run (`npx prisma migrate dev`). If starting fresh, run `npx prisma db push` against the local docker-compose PostgreSQL.

---

### 24.4 Marketing Site — `apps/frontend/src/`

**Status: ~85% complete.** All primary pages and components exist.

**What exists:**
- `app/page.tsx` — Landing page (renders all section components in sequence)
- `app/pricing/page.tsx` — Full pricing page
- `app/features/page.tsx` and `app/features/[slug]/page.tsx` — Features overview and per-feature detail
- `app/regions/[region]/page.tsx` — Regional landing pages
- `app/signup/page.tsx` — Signup form (calls `POST /api/auth/register`)
- `app/docs/page.tsx` — Docs entry page
- `app/legal/privacy/page.tsx`, `app/legal/terms/page.tsx`, `app/legal/cookies/page.tsx`
- `app/error.tsx`, `app/loading.tsx`, `app/not-found.tsx`
- `app/permission-denied/page.tsx`, `app/plan-gated/page.tsx`
- `app/layout.tsx` — Root layout with Inter font, metadata
- Marketing components: `Navbar`, `Hero`, `SocialProof`, `FeatureSection`, `ScreenshotShowcase`, `PricingCards`, `RegionStrip`, `TestimonialCarousel`, `FAQAccordion`, `CTABanner`, `Footer`, `BrandLogo`, `SignupForm`, `FeatureComparisonTable`, `FadeInOnScroll`
- `lib/marketing-data.ts` — Static content (features, FAQs, regions, testimonials)
- `lib/seo.ts` — SEO metadata helpers
- `api/auth/register/route.ts` — Next.js API route proxying registration to backend

**What is missing:**
- `app/login/page.tsx` — Login page for existing tenants (only signup exists). Needs email/password form + redirect to tenant portal subdomain after auth
- `app/blog/` — Not required for V1
- Real screenshot assets in `ScreenshotShowcase` (currently likely placeholder images)

---

### 24.5 Tenant Portal — `apps/tenant-portal/src/`

**Status: ~70% complete UI; backend integration is partial.**

#### What exists

**UI Library (all in `components/ui/`)**
`Button`, `Input`, `Textarea`, `Select`, `Switch`, `Badge`, `Avatar`, `Dialog`, `Dropdown`, `Skeleton`, `Spinner`, `StatCard`, `StatusBadge`, `Table`, `Tabs`, `Tooltip`, `UsageMeter`, `EmptyState`

**Layouts**
- `layouts/AppShell.tsx` — Main authenticated shell wrapping sidebar + topbar + main content
- `layouts/Sidebar.tsx` — Role-aware navigation sidebar (256px, collapsible), active state uses `var(--tenant-primary)`
- `layouts/TopBar.tsx` — Breadcrumb, search, notifications, user avatar + dropdown
- `layouts/MobileNav.tsx` — Mobile bottom navigation
- `layouts/PageShell.tsx` — Page-level wrapper with consistent padding/title
- `layouts/PublicLayout.tsx` — Public pages (tracking, booking) without sidebar
- `layouts/navigation.ts` — Navigation config keyed by role

**Stores (Zustand)**
- `stores/auth.store.ts` — Auth state: user, tokens, login/logout actions
- `stores/useTenantStore.ts` — Tenant config: branding, plan, features
- `stores/useAppStore.ts` — App-level UI state (sidebar open, command palette, toasts)

**Hooks**
- `hooks/useAuth.ts` — Auth state access + redirect logic
- `hooks/useTenant.ts` — Tenant config + branding vars
- `hooks/useBilling.ts` — Usage, plan, billing info from API
- `hooks/usePermission.ts` — Role-based permission checks

**Shared Components**
- `components/shared/PermissionGate.tsx` — Renders children only if role has permission
- `components/shared/PlanGate.tsx` — Renders children only if plan includes feature; else shows upgrade prompt
- `components/shared/StatusBadge.tsx` — Shipment status → colour mapped badge (all 10 states)
- `components/shared/TrackingNumber.tsx` — Monospace tracking number display with copy button
- `components/shared/EmptyState.tsx` — Illustration + heading + description + CTA
- `components/shared/ErrorState.tsx` — Error message + retry button
- `components/shared/CommandPalette.tsx` — Keyboard-triggered search/navigation palette
- `components/shared/ToastStack.tsx` — Toast notification stack
- `components/shared/OnboardingChecklist.tsx` — Dashboard checklist shown until complete

**Shipments**
- `pages/shipments/ShipmentsListPage.tsx` — Full list page with filter bar, sortable table, bulk actions, pagination
- `pages/shipments/ShipmentDetailPage.tsx` — Detail with summary card, info grid, tabs (Timeline, Documents, Invoice, Notes), status transition controls, assign driver modal
- `pages/shipments/CreateShipmentPage.tsx` — Mounts the 4-step wizard
- `components/shipments/CreateShipmentWizard.tsx` — 4-step wizard orchestrator
- `components/shipments/StepAddresses.tsx` — Origin + destination address forms with validation
- `components/shipments/StepPackage.tsx` — Package dimensions, weight, items, declared value
- `components/shipments/StepService.tsx` — Service tier selection (STANDARD/EXPRESS/OVERNIGHT), pricing preview from rate card
- `components/shipments/StepReview.tsx` — Full order summary before submit
- `components/shipments/ShipmentTable.tsx` — TanStack Table with sorting, column config
- `components/shipments/ShipmentFilterBar.tsx` — Status, date range, route, driver, customer filters
- `components/shipments/ShipmentTimeline.tsx` + `ShipmentTimelineEvent.tsx` — Vertical event timeline
- `components/shipments/ShipmentSummaryCard.tsx` — Hero status card at top of detail page
- `components/shipments/UpdateStatusModal.tsx` — Shows only valid next states; DELIVERED requires POD; FAILED requires reason
- `components/shipments/AssignDriverModal.tsx` — Driver assignment dialog
- `components/shipments/DocumentsPanel.tsx` — List + download links for shipment documents
- `components/shipments/NotesPanel.tsx` — Freeform notes per shipment
- `components/shipments/ExceptionBanner.tsx` — Exception state alert bar
- `components/shipments/FailedDeliveryReasonSelect.tsx` — Reason picker for failed delivery
- `components/shipments/ShipmentSuccessState.tsx` — Post-create success with tracking number + share options
- `components/shipments/ShipmentCard.tsx` — Mobile card view of a shipment

**Tracking (Public)**
- `pages/tracking/TrackingLookupPage.tsx` — Tenant-branded lookup: logo + input + track button
- `pages/tracking/TrackingResultPage.tsx` — Status progress bar + vertical timeline + delivery confirmation
- `components/tracking/TrackingInput.tsx`, `TrackingProgressBar.tsx`, `TrackingTimeline.tsx`, `TrackingTimelineEvent.tsx`, `TrackingSummaryCard.tsx`, `DeliveredBanner.tsx`, `ExceptionBanner.tsx`, `PoweredByFooter.tsx`

**Onboarding**
- `pages/onboarding/OnboardingPage.tsx` — Mounts the 5-step wizard
- `components/onboarding/OnboardingStepper.tsx` — Step orchestrator
- `components/onboarding/StepBranding.tsx` — Logo upload + colour picker + live preview
- `components/onboarding/BrandPreview.tsx` — Live preview component for branding step
- `components/onboarding/StepFirstShipment.tsx` — Pre-filled example shipment form
- `components/onboarding/StepInviteTeam.tsx` — Email + role selector for first invite
- `components/onboarding/StepPayments.tsx` — Stripe Connect OAuth trigger
- `components/onboarding/StepGoLive.tsx` — Platform URL, share button, confetti
- `components/onboarding/DashboardChecklist.tsx` — Persistent checklist with completion tracking

**Billing**
- `pages/settings/BillingTab.tsx` — Full billing settings tab
- `components/billing/CurrentPlanCard.tsx` — Current plan + price + renewal date
- `components/billing/UsageSection.tsx` + `UsageMeter.tsx` — Usage bars for shipments, staff, API calls
- `components/billing/PlanComparisonTable.tsx` — Tier comparison matrix
- `components/billing/InvoiceHistoryTable.tsx` — Fauward billing invoice history (not tenant invoices)
- `components/billing/PaymentMethodCard.tsx` — Saved card display + update
- `components/billing/ChangePlanModal.tsx` — Upgrade/downgrade flow
- `components/billing/TrialBanner.tsx` — Trial days remaining with upgrade CTA
- `components/billing/UsageWarningBanner.tsx` — 80% limit warning
- `components/billing/LimitReachedBanner.tsx` — 100% limit with hard stop
- `components/billing/FailedPaymentBanner.tsx` — Failed payment with retry/update card
- `components/billing/SuspendedOverlay.tsx` — Full-page overlay when account suspended

**Settings**
- `pages/settings/ApiKeysTab.tsx` — API key table + generate modal + revoke
- `pages/settings/WebhooksTab.tsx` — Endpoint table + add/edit modal + test + delivery log
- `components/settings/ApiKeyTable.tsx`, `GenerateKeyModal.tsx`, `KeyRevealStep.tsx`, `RevokeKeyDialog.tsx`
- `components/settings/WebhookEndpointTable.tsx`, `AddEditEndpointModal.tsx`, `SendTestResult.tsx`, `WebhookDeliveryLog.tsx`, `WebhookPayloadViewer.tsx`

**Admin features (in `features/admin/`)**
- `analytics/AnalyticsPage.tsx` — Charts (Recharts): shipment volume, revenue over time, status breakdown, top customers; CSV export button
- `audit/AuditLogPage.tsx` — Paginated audit log table with actor, action, resource, timestamp
- `crm/CrmPipelinePage.tsx` — Lead pipeline board (Kanban by stage) + quotes table
- `finance/AdminFinancePage.tsx` — Invoice list, summary stats (invoiced/collected/outstanding/overdue), create invoice button
- `embed/EmbedWidgetTab.tsx` — Widget install instructions + embed code snippet
- `settings/tabs/ApiKeysTab.tsx` — (duplicate of pages/settings, used within admin settings panel)
- `webhooks/WebhooksTab.tsx` — (duplicate of pages/settings, used within admin settings panel)

**Driver (in `features/driver/`)**
- `DriverDashboard.tsx` — Today's stops summary + quick stats
- `DeliveryDetail.tsx` — Stop detail view
- `CapturePoD.tsx` — Camera/signature capture for proof of delivery

**Router**
- `router/index.tsx` — React Router v6 routes: public (`/track`, `/track/:number`, `/book`), auth (`/login`, `/register`), onboarding (`/onboarding`), main app routes, admin routes
- `router/guards/PlanGate.tsx` — Route-level plan guard

**Theme**
- `theme/tenant.ts` — Fetches tenant branding from API, injects CSS custom properties on `:root`

#### What is missing in tenant portal

- **`/login` page** — No login page exists in the tenant portal. Needs email/password form, calls auth API, redirects to dashboard
- **Team management page** — No page to view staff list, invite by email + role, remove staff. Needs `GET /users`, `POST /users/invite`, `DELETE /users/:id` wired up
- **Dispatch / Routes board** — No daily dispatch page grouping shipments by driver, route optimisation view, capacity warnings
- **Customer portal views** — Customer-role users (CUSTOMER_ADMIN, CUSTOMER_USER) need a scoped dashboard: their shipments only, booking form, their invoices, profile. Currently all views are staff-oriented
- **Profile / account settings page** — No `GET/PATCH /users/me` page for name, email, password change, MFA toggle
- **Custom domain settings** — The domain API (`PATCH /tenant/domain`) exists; UI to enter domain + see verification status + DNS instructions is missing from settings
- **Accounting integrations page** — Xero/QuickBooks OAuth connect flow (Pro+), sync status
- **CSV import UI** — Import wizard for customers, shipment history, rate cards
- **Reporting / CSV export** — Analytics page has export button; the backend endpoint to stream CSV is missing
- **Real-time tracking connection** — `TrackingResultPage` needs Socket.io client subscribing to tracking events. Currently static.
- **`/book` public booking page** — Public shipment booking form (for customer-facing portal, no login required on some tenants)

---

### 24.6 Driver PWA — `apps/driver/src/`

**Status: ~90% complete UI. Backend integration wired for route; POD upload not wired.**

**Pages (all exist):**
- `LoginPage.tsx` — Driver login with tenant slug + credentials
- `RoutePage.tsx` — Today's route: stop list with pickup/delivery counts, `GET /api/v1/driver/route`
- `StopDetailPage.tsx` — Individual stop: address, shipment info, navigate + arrive buttons
- `ShipmentDetailPage.tsx` — Shipment details at stop
- `CapturePODPage.tsx` — Camera capture (photo + signature) before marking delivered
- `FailedDeliveryPage.tsx` — Reason selection + notes for failed attempt
- `HistoryPage.tsx` — Completed deliveries
- `ProfilePage.tsx` — Driver profile + logout

**Components (all exist):**
`BottomTabBar`, `CameraCapture`, `SignaturePad`, `OfflineBanner`, `RouteHeader`, `ShipmentCard`, `StopCard`, `SyncIndicator`, `ReasonSelector`

**Hooks (all exist):**
`useCamera`, `useGeolocation`, `useOnlineStatus`

**Stores (all exist):**
`useDriverStore`, `useOfflineQueue`, `useSyncStore`

**Service Worker:** `sw.ts` — offline caching strategy

**What is missing:**
- `PATCH /driver/stops/:id/status` backend route — needed for RoutePage to mark stops as started/completed
- `POST /driver/pod` backend route — needed for CapturePODPage to upload photo/signature and trigger `DELIVERED` status update
- `PATCH /driver/shipments/:id/failed` backend route — needed for FailedDeliveryPage
- Offline sync: `useSyncStore` needs to flush queued mutations when back online; the backend `/sync` endpoint does not exist

---

### 24.7 Super Admin — `apps/super-admin/src/`

**Status: ~85% complete UI. No backend super-admin API routes exist.**

**Pages (all exist):**
- `DashboardPage.tsx` — MRR, tenant count, shipment count, DLQ depth metrics + activity feed
- `TenantsListPage.tsx` — Paginated tenant table with search, plan filter, status filter
- `TenantDetailPage.tsx` — Tenant detail: branding, usage, subscription, staff, impersonate button
- `RevenuePage.tsx` — MRR charts (new, churned, expansion, net), regional breakdown
- `QueuesPage.tsx` — BullMQ queue stats: depth, processing rate, DLQ count; message viewer
- `SystemHealthPage.tsx` — API latency, DB health, Redis health, uptime metrics
- `ImpersonationPage.tsx` — Active impersonation session: tenant, actor, start time, end session

**Components (all exist):**
`MRRChart`, `RevenueCharts`, `ShipmentsChart`, `TenantTable`, `TenantDetailTabs`, `PlanOverrideModal`, `SuspendDialog`, `MetricCard`, `AlertCard`, `ActivityFeed`, `QueueTable`, `QueueMessageViewer`, `SystemMetrics`, `ImpersonationBanner`

**What is missing — entire backend surface for super-admin:**
- `modules/super-admin/super-admin.routes.ts` — Must be gated to `SUPER_ADMIN` role only:
  - `GET /api/v1/admin/tenants` — list all tenants with pagination, plan, status, MRR, shipment count
  - `GET /api/v1/admin/tenants/:id` — full tenant detail
  - `PATCH /api/v1/admin/tenants/:id/plan` — override plan
  - `POST /api/v1/admin/tenants/:id/suspend` — suspend tenant
  - `POST /api/v1/admin/tenants/:id/unsuspend`
  - `POST /api/v1/admin/tenants/:id/impersonate` — start impersonation session (audit logged, 30min max), returns impersonation JWT
  - `DELETE /api/v1/admin/impersonate` — end impersonation
  - `GET /api/v1/admin/metrics` — MRR, active tenants, shipments today, DLQ depth
  - `GET /api/v1/admin/queues` — BullMQ queue stats per queue
  - `GET /api/v1/admin/health` — DB ping, Redis ping, uptime

---

### 24.8 Embeddable Widget — `widget/src/`

**Status: ~80% complete.** Core files exist.

- `widget.js` — Shadow DOM widget: renders tracking input + timeline. Configurable via `data-tenant`, `data-theme` attributes.
- `embed.js` — Script tag loader: injects widget into host page, lazy-loads styles
- `api.js` — Fetch wrapper calling `GET /api/v1/tracking/:number` (public, no auth)
- `styles.css` — Scoped styles for Shadow DOM

**What is missing:**
- Build pipeline to produce single `<15KB gzipped` bundle — no `vite.config.js` or rollup config in widget/
- Real-time updates via WebSocket within widget (currently only fetches once)
- Widget CDN hosting path (needs to be served from `cdn.fauward.com/widget.js`)

---

### 24.9 Packages — `packages/`

| Package | Status | Notes |
|---------|--------|-------|
| `brand` | Exists — `brand.css` | Design tokens, colour vars, typography — used by marketing site |
| `shared-types` | Exists — `index.ts` | Verify it exports all shared TypeScript interfaces needed across apps |
| `domain-types` | Exists — `index.ts` | Shipment, Tenant, User domain model types |
| `theme-engine` | Exists — `index.ts` | CSS var injection from tenant branding API response |
| `design-tokens` | Exists | Token definitions |
| `formatting` | Exists | Currency, date, weight formatters — ensure it covers all regional currencies from section 11 |

---

### 24.10 What Must Be Built Next — Priority Order

The following is the **exact build order** for Codex. Each item is a discrete unit of work with no ambiguity. Build in this sequence.

---

#### PRIORITY 1 — Shipment Core (without this, the product cannot function)

**1A. Fill `apps/backend/src/modules/shipments/shipments.routes.ts`**

Replace the current skeletal file. Implement these routes in full:

```
GET    /api/v1/shipments              — list with tenant filter, pagination (page/limit), filters (status, dateFrom, dateTo, driverId, customerId), search by trackingNumber
POST   /api/v1/shipments              — create shipment: validate body, run pricing engine, generate tracking number ({TENANT_SLUG}-{YYYYMM}-{6CHAR}), create ShipmentEvent (PENDING), increment usage_records, return shipment with tracking number
GET    /api/v1/shipments/:id          — single shipment with includes: items, events, podAssets, driver, organisation, invoice
PATCH  /api/v1/shipments/:id/status   — enforce ALLOWED_TRANSITIONS (see section 9); on DELIVERED require podAssets to exist; on FAILED_DELIVERY require failedReason; create ShipmentEvent record; emit outbox event; fire webhook if endpoints exist
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
GET /api/v1/tracking/:trackingNumber  — PUBLIC (no auth). Resolves tenant from query param ?tenant= or from subdomain. Returns: tracking number, status, events array (timestamp, status, location, note), estimatedDelivery, origin, destination. Used by both public tracking page and embeddable widget.
```

**1C. Create `apps/backend/src/modules/tracking/tracking.websocket.ts`**

Set up Socket.io with Redis adapter on the Fastify server:
- Connection auth: verify JWT or allow anonymous (subscribe by tracking number only)
- Event: client sends `{ type: "subscribe", trackingNumber: "..." }` → server joins room named by tracking number
- On shipment status update (from shipment PATCH route): emit to room `{ type: "status_update", data: { status, location, timestamp } }`
- Tenant isolation: rooms scoped as `{tenantId}:{trackingNumber}`

Register Socket.io in `app.ts` after Fastify server creation.

---

#### PRIORITY 2 — User / Team Management

**2A. Create `apps/backend/src/modules/users/users.routes.ts`**

```
GET    /api/v1/users/me           — own profile (from JWT sub)
PATCH  /api/v1/users/me           — update name, phone; password change requires currentPassword + newPassword
GET    /api/v1/users              — list staff for current tenant; roles: TENANT_ADMIN, TENANT_MANAGER
POST   /api/v1/users/invite       — create User with role, send invite email; roles: TENANT_ADMIN only
PATCH  /api/v1/users/:id/role     — change role; TENANT_ADMIN only; cannot demote self
DELETE /api/v1/users/:id          — deactivate user (set isActive=false); cannot delete self
```

**2B. Complete auth routes**

Add to `auth.routes.ts` and `auth.service.ts`:
- `POST /auth/forgot-password` — lookup user by email, generate signed reset token (store hash in DB with 1hr expiry), send email via notification service
- `POST /auth/reset-password` — verify token, hash new password, invalidate all refresh tokens for user

---

#### PRIORITY 3 — Notifications & Outbox

**3A. Create `apps/backend/src/modules/notifications/`**

Create:
- `notifications.service.ts` — `sendEmail(to, template, data)` via SendGrid; `sendSms(to, message)` via Twilio; logs to `notification_log` table
- `email-templates.ts` — Template strings/IDs for each event: `booking_confirmed`, `shipment_picked_up`, `out_for_delivery`, `delivered`, `failed_delivery`, `invoice_sent`, `invoice_overdue`, `payment_received`, `trial_expiry`, `password_reset`, `staff_invite`
- `notifications.worker.ts` — BullMQ worker processing `notification` queue jobs

**3B. Create `apps/backend/src/queues/`**

- `queues.ts` — Create BullMQ Queue instances: `notificationQueue`, `webhookQueue`, `outboxQueue`
- `outbox.worker.ts` — Polls `outbox_events` where `published=false`; for each event, dispatches to correct queue, marks `published=true`
- Register workers in `server.ts` so they start with the app

**3C. Wire notifications into shipment status changes**

In `shipments.routes.ts`, after writing the `ShipmentEvent`, enqueue a notification job for customer + tenant admin:
- Map each status transition to the correct email template
- Check tenant plan: SMS only for Pro/Enterprise
- Use `notificationQueue.add()`

---

#### PRIORITY 4 — Document Generation

**4A. Create `apps/backend/src/modules/documents/`**

- `documents.service.ts` — `generateDeliveryNote(shipmentId)`, `generateInvoicePdf(invoiceId)`, `generateManifest(routeId)`. Uses Puppeteer with HTML templates rendered with shipment/invoice data. Uploads to S3 (or local in dev). Inserts row into `shipment_documents`. Returns signed URL.
- `documents.routes.ts`:
  ```
  POST /api/v1/documents/delivery-note/:shipmentId  — generate and upload, return signed URL
  POST /api/v1/documents/invoice/:invoiceId         — generate invoice PDF
  GET  /api/v1/documents/:id                        — get signed download URL (refreshed)
  ```
- HTML templates (in `documents/templates/`): `delivery-note.html`, `invoice.html` — must use tenant branding (logo, primary colour, name) injected at render time

**Note:** For local dev, use a local filesystem path instead of S3. Use `STORAGE_DRIVER=local|s3` env var to switch.

---

#### PRIORITY 5 — Finance Module (fill in skeletal)

**5A. Fill `apps/backend/src/modules/finance/finance.routes.ts`**

Add all missing routes:

```
POST   /api/v1/finance/invoices              — create invoice: set invoice_number ({TENANT_SLUG}-INV-{YYYY}-{4DIGIT}), link to shipment/org/customer, status=DRAFT
GET    /api/v1/finance/invoices/:id          — single invoice with line_items, payments, credit_notes
PATCH  /api/v1/finance/invoices/:id          — update line_items, due_date, notes (only if DRAFT)
POST   /api/v1/finance/invoices/:id/send     — mark SENT, set sentAt, send invoice PDF email to customer (already exists but does not send email — wire to notifications)
POST   /api/v1/finance/invoices/:id/pay      — record payment: create Payment record, if total paid mark invoice PAID, set paidAt; body: { amount, currency, method, gatewayRef }
POST   /api/v1/finance/invoices/:id/void     — mark VOID, set voidedAt; cannot void PAID
POST   /api/v1/finance/invoices/bulk         — bulk create invoices for a date range of delivered shipments without invoices
GET    /api/v1/finance/payments              — list payments for tenant
POST   /api/v1/finance/credit-notes          — create credit note against an invoice
GET    /api/v1/finance/credit-notes          — list credit notes
GET    /api/v1/finance/report/csv            — stream CSV of invoices for a date range (for CSV export)
```

**Overdue detection** — Create a scheduled job (BullMQ repeatable, runs daily):
- Find all SENT invoices where `due_date < today`
- Mark as OVERDUE
- Enqueue notification email to customer
- Enqueue notification email to TENANT_ADMIN

---

#### PRIORITY 6 — Payments / Stripe

**6A. Create `apps/backend/src/modules/payments/`**

- `payments.routes.ts`:
  ```
  POST /api/v1/payments/intent           — create Stripe PaymentIntent for shipment; amount from shipment.price; customer from org billing; return clientSecret
  GET  /api/v1/payments/:shipmentId      — get payment record for shipment
  POST /api/v1/payments/webhook/stripe   — Stripe webhook: verify signature, handle payment_intent.succeeded → mark payment COMPLETED + invoice PAID + trigger notification; handle payment_intent.payment_failed
  ```
- `stripe.service.ts` — Stripe SDK wrapper: `createPaymentIntent`, `createCustomer`, `createSubscription`, `cancelSubscription`, `handleWebhook`
- `billing.service.ts` — Subscription lifecycle: create trial subscription on tenant register, handle `customer.subscription.updated`, dunning on `invoice.payment_failed`, suspend on `invoice.payment_failed` after 7 days, cancel after 30 days

**6B. Subscription dunning (implement in `billing.service.ts`)**

Stripe sends webhook events. Map them:
- `invoice.payment_failed` (attempt 1) → email warning to TENANT_ADMIN, set payment retry in 3 days
- `invoice.payment_failed` (attempt 2, day 3) → suspend tenant (`status=SUSPENDED`), email
- `invoice.payment_failed` (attempt 3, day 7) → final warning
- After 30 days SUSPENDED → `status=CANCELLED`, queue data retention countdown

---

#### PRIORITY 7 — CRM Module (fill in skeletal)

**7A. Fill `apps/backend/src/modules/crm/crm.routes.ts`**

```
GET    /api/v1/crm/leads              — list with stage filter, pagination (already exists but add filters)
POST   /api/v1/crm/leads              — create lead: company, contactName, email, phone, stage=PROSPECT, assignedTo
PATCH  /api/v1/crm/leads/:id          — update stage, assignedTo, notes, lostReason
GET    /api/v1/crm/leads/:id          — lead detail with quotes
DELETE /api/v1/crm/leads/:id          — delete lead (only PROSPECT or LOST)

GET    /api/v1/crm/quotes             — list quotes with status filter
POST   /api/v1/crm/quotes             — create quote: generate quoteNumber, link to leadId or customerId, shipment_data JSON, line_items, total, valid_until
PATCH  /api/v1/crm/quotes/:id         — update (only if DRAFT)
POST   /api/v1/crm/quotes/:id/send    — mark SENT, send quote PDF email to customer
POST   /api/v1/crm/quotes/:id/accept  — mark ACCEPTED, create Shipment from quote.shipment_data, link quote.shipment_id, mark lead WON if linked
POST   /api/v1/crm/quotes/:id/reject  — mark REJECTED, mark lead LOST if linked

GET    /api/v1/crm/customers          — list organisations for tenant with shipment count, total revenue
GET    /api/v1/crm/customers/:id      — org detail with users, shipments, invoices
POST   /api/v1/crm/customers          — create organisation
PATCH  /api/v1/crm/customers/:id      — update org details
```

---

#### PRIORITY 8 — Analytics (fill missing endpoints)

**8A. Fill `apps/backend/src/modules/analytics/analytics.routes.ts`**

Add alongside existing `GET /analytics/full`:

```
GET /api/v1/analytics/shipments   — by status breakdown (count per status), on-time rate (DELIVERED where actualDelivery <= estimatedDelivery / total DELIVERED), avg delivery days, top 5 routes by volume
GET /api/v1/analytics/revenue     — by service tier, by customer (top 10 by revenue), collection rate (PAID / total invoiced)
GET /api/v1/analytics/staff       — shipments processed per staff member, avg handle time
GET /api/v1/analytics/export/csv  — streams CSV of shipment records for date range; role: TENANT_ADMIN, TENANT_MANAGER, TENANT_FINANCE
```

Fix `onTimeRate` and `avgDeliveryDays` — currently hardcoded 0. Compute from ShipmentEvents: delivery event timestamp vs estimatedDelivery on Shipment.

---

#### PRIORITY 9 — Driver Backend (fill missing routes)

**9A. Fill `apps/backend/src/modules/driver/driver.routes.ts`**

Add alongside existing `GET /driver/route`:

```
PATCH /api/v1/driver/stops/:stopId/status    — mark stop started (status=IN_PROGRESS) or completed (status=COMPLETED); roles: TENANT_DRIVER only; body: { status, location: { lat, lng } }
POST  /api/v1/driver/pod                     — upload POD: multipart form with photo (file) + signature (base64 string) + shipmentId; save to S3; create PodAsset records; trigger shipment status DELIVERED; body: { shipmentId, photoBase64?, signatureBase64?, recipientName, notes }
PATCH /api/v1/driver/shipments/:id/failed    — mark failed delivery: body: { reason, notes, attemptedAt }; transitions shipment to FAILED_DELIVERY; creates ShipmentEvent; enqueues notification
GET   /api/v1/driver/history                 — completed stops for driver in last 30 days
```

---

#### PRIORITY 10 — Super Admin Backend

**10A. Create `apps/backend/src/modules/super-admin/super-admin.routes.ts`**

Gate every route with `requireRole(['SUPER_ADMIN'])`.

```
GET    /api/v1/admin/tenants                      — all tenants: id, name, plan, status, shipment count this month, MRR contribution; pagination + search + plan/status filter
GET    /api/v1/admin/tenants/:id                  — full detail: branding, settings, usage, subscription, staff count, recent shipments
PATCH  /api/v1/admin/tenants/:id/plan             — override plan; audit log required; body: { plan, reason }
POST   /api/v1/admin/tenants/:id/suspend          — set status=SUSPENDED; body: { reason }; send email to TENANT_ADMIN
POST   /api/v1/admin/tenants/:id/unsuspend        — set status=ACTIVE; send email to TENANT_ADMIN
POST   /api/v1/admin/tenants/:id/impersonate      — create impersonation JWT (30min expiry) with impersonator=SUPER_ADMIN actor; write to audit_log; return token
DELETE /api/v1/admin/impersonate                  — end session (client discards token; server can optionally track in Redis with TTL)
GET    /api/v1/admin/metrics                      — total MRR, active tenant count, shipments today (all tenants), DLQ depth from BullMQ
GET    /api/v1/admin/queues                       — per-queue stats: waiting, active, completed, failed counts; last processed job timestamp
GET    /api/v1/admin/health                       — DB ping latency, Redis ping latency, uptime seconds
```

Register in `app.ts` as `await registerSuperAdminRoutes(app)`.

---

#### PRIORITY 11 — Frontend Missing Pages

**11A. Marketing site — Add login page**

Create `apps/frontend/src/app/login/page.tsx`:
- Email + password form (same style as SignupForm)
- On submit: `POST /api/v1/auth/login` → receive tokens → redirect to `https://{tenantSlug}.fauward.com/dashboard`
- Link to "Forgot password?" → `/forgot-password` page (also create)
- Link to "Sign up" → `/signup`

Create `apps/frontend/src/app/forgot-password/page.tsx` and `apps/frontend/src/app/reset-password/page.tsx`.

**11B. Tenant portal — Add team management page**

Create `apps/tenant-portal/src/pages/team/TeamPage.tsx`:
- Staff list table: name, email, role badge, joined date, last active, actions (change role, remove)
- "Invite staff" button → modal with email input + role selector (TENANT_MANAGER, TENANT_FINANCE, TENANT_STAFF, TENANT_DRIVER)
- Role-gated: only TENANT_ADMIN can access
- Calls `GET /api/v1/users`, `POST /api/v1/users/invite`, `PATCH /api/v1/users/:id/role`, `DELETE /api/v1/users/:id`

Add route in `router/index.tsx`: `/team` → `TeamPage` (gated: TENANT_ADMIN only)
Add "Team" nav item to `layouts/navigation.ts` for TENANT_ADMIN role.

**11C. Tenant portal — Add profile / account settings page**

Create `apps/tenant-portal/src/pages/settings/ProfileTab.tsx`:
- Display name, email (readonly), phone
- Change password form: currentPassword + newPassword + confirm
- MFA section: enable/disable TOTP with QR code setup flow
- Calls `GET /api/v1/users/me`, `PATCH /api/v1/users/me`

**11D. Tenant portal — Add custom domain settings UI**

Add to existing settings page a "Domain" tab or card:
- Input: custom domain (e.g. `track.mycompany.com`)
- On save: calls `PATCH /api/v1/tenant/domain`
- Shows verification status from `GET /api/v1/tenant/domain/status`
- Displays DNS instructions: "Add a CNAME record pointing `track.mycompany.com` → `{tenantSlug}.fauward.com`"

**11E. Tenant portal — Wire real-time tracking**

In `pages/tracking/TrackingResultPage.tsx`:
- After initial `GET /api/v1/tracking/:number` fetch, connect Socket.io client to `wss://api.fauward.com/tracking`
- Send `{ type: "subscribe", trackingNumber }` on connect
- On `status_update` event: update shipment state in component → re-render timeline + progress bar
- On disconnect: show reconnecting indicator
- Install: `socket.io-client` in tenant-portal package.json

**11F. Tenant portal — Add dispatch board**

Create `apps/tenant-portal/src/pages/dispatch/DispatchPage.tsx`:
- Default view: today's date (date picker to change)
- Calls `GET /api/v1/shipments?status=PROCESSING,PICKED_UP,IN_TRANSIT,OUT_FOR_DELIVERY&date={today}`
- Groups shipments by assigned driver (unassigned group shown first)
- Shows driver card: name, vehicle, stop count, delivery progress bar
- Quick action: assign driver to unassigned shipments
- Capacity warning: if driver has >20 stops, show warning badge

Add route in `router/index.tsx`: `/dispatch` → `DispatchPage`
Add "Dispatch" nav item to `layouts/navigation.ts` for TENANT_ADMIN, TENANT_MANAGER.

---

#### PRIORITY 12 — Rate Limiting

**12A. Add rate limiting in `app.ts`**

Install `@fastify/rate-limit`. Register in `app.ts` before routes:

```typescript
await app.register(import('@fastify/rate-limit'), {
  global: false  // apply per-route
});
```

Apply per route group:
- Auth routes (`/auth/login`, `/auth/register`, `/auth/forgot-password`): `{ max: 10, timeWindow: '1 minute' }`
- General API routes: `{ max: 100, timeWindow: '1 minute' }` — applied via preHandler on the API key auth path
- API key authenticated routes: `{ max: 500, timeWindow: '1 hour' }` — check `ApiKey.rateLimit` field from DB

On 429 response, return:
```json
{ "error": "Rate limit exceeded", "code": "RATE_LIMITED", "retryAfter": 60, "upgradeUrl": "https://fauward.com/upgrade" }
```

---

#### PRIORITY 13 — Idempotency Middleware

**13A. Create `apps/backend/src/shared/middleware/idempotency.ts`**

For all POST/PATCH mutation routes:
- Read `Idempotency-Key` header
- If present: hash it (SHA-256), check `idempotency_keys` table for `(tenantId, keyHash)`
- If found and `status=COMPLETED`: return cached `response` with original `status_code` — do not re-execute
- If found and `status=PROCESSING`: return 409 (request in flight)
- If not found: insert row with `status=PROCESSING`, execute handler, update row with `response + status_code + status=COMPLETED`
- Idempotency keys expire after 24 hours

Apply to: `POST /shipments`, `POST /invoices`, `POST /payments/intent`, `POST /quotes`.

---

#### PRIORITY 14 — CI/CD and Docker

**14A. Create `Dockerfile` files**

Create `apps/backend/Dockerfile`:
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY apps/backend/package*.json apps/backend/
RUN npm ci --workspace=apps/backend
COPY apps/backend ./apps/backend
COPY packages ./packages
RUN npm run build --workspace=apps/backend

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/apps/backend/dist ./dist
COPY --from=builder /app/apps/backend/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

Create similar Dockerfiles for `apps/frontend`, `apps/tenant-portal`, `apps/super-admin`.

**14B. Create `.github/workflows/ci.yml`**

```yaml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env: { POSTGRES_PASSWORD: postgres, POSTGRES_DB: fauward_test }
        ports: ['5432:5432']
      redis:
        image: redis:7
        ports: ['6379:6379']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci
      - run: npx prisma generate --schema=apps/backend/prisma/schema.prisma
      - run: npx prisma db push --schema=apps/backend/prisma/schema.prisma
        env: { DATABASE_URL: postgresql://postgres:postgres@localhost:5432/fauward_test }
      - run: npm test --workspace=apps/backend
      - run: npm run build --workspace=apps/frontend
      - run: npm run build --workspace=apps/tenant-portal
```

---

#### PRIORITY 15 — Tests (Phase 7)

**15A. Backend unit tests**

Create test files alongside each service:
- `auth.service.test.ts` — register creates tenant+user; duplicate email rejected; login with wrong password returns 401; refresh token rotation
- `pricing.test.ts` — all service tier multipliers; surcharges; zone rate lookup
- `shipments.state-machine.test.ts` — all valid transitions succeed; all invalid transitions return 400; DELIVERED requires POD; FAILED requires reason
- `tenants.isolation.test.ts` — `GET /shipments` with tenant A token cannot see tenant B shipments; attempting cross-tenant ID returns 404 not 403 (no information leak)

**15B. Cross-tenant security test** (critical — must pass before launch)

`cross_tenant_test.sh` already exists in the repo root. Verify and expand it to cover:
- Auth token from tenant A cannot access `GET /shipments` of tenant B
- Auth token from tenant A cannot `PATCH /shipments/:id` where shipment belongs to tenant B
- API key from tenant A cannot call tenant B endpoints
- SUPER_ADMIN impersonation token is time-limited (30 min) and audit-logged

---

### 24.11 Environment Variables Required

The backend expects these env vars (set in `.env` for local dev, AWS Secrets Manager for production):

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

### 24.12 Phase Completion Summary

| Phase | Spec File | Status | Remaining |
|-------|-----------|--------|-----------|
| 1 — Foundation | PHASE-1-FOUNDATION.md | **Complete** | — |
| 2 — Tenant Onboarding | PHASE-2-TENANT-ONBOARDING.md | **~85%** | Auth forgot/reset password; team invite backend; rate limiting |
| 3 — Billing | PHASE-3-BILLING.md | **~10%** | Stripe subscriptions, trial, dunning, metered overage, Paystack |
| 4 — Logistics Core | PHASE-4-LOGISTICS-CORE.md | **~15%** | Shipment full CRUD, state machine enforcement, tracking WebSocket, notifications, driver POD, documents |
| 5 — Frontend | PHASE-5-FRONTEND.md | **~75%** | Login page, team management, dispatch board, customer portal, profile, domain settings |
| 6 — Pro Features | PHASE-6-PRO-FEATURES.md | **~50%** | API keys ✓, webhooks ✓, widget ✓; idempotency missing; widget build pipeline missing |
| 6b — CRM / Docs / Finance | PHASE-6B-CRM-DOCS-FINANCE.md | **~15%** | CRM full CRUD, document generation, full finance lifecycle |
| 6c — Integrations | PHASE-6C-INTEGRATIONS.md | **0%** | Xero, QuickBooks, carrier APIs, e-invoicing, import tools |
| 7 — Testing | PHASE-7-TESTING.md | **0%** | All tests |
| 8 — Deploy | PHASE-8-DEPLOY.md | **~5%** | docker-compose for local ✓; production Dockerfiles, CI/CD, AWS |
| 9 — Enterprise | PHASE-9-ENTERPRISE.md | **0%** | SSO, multi-branch, advanced RBAC, dedicated infra, MFA enforcement |

---

## 25. Feature Additions from TrenyConnect Audit

> **Source:** Cross-referenced against the TrenyConnect admin console (a production logistics platform built by the same team). Every feature in this section was present in TrenyConnect, confirmed absent or underspecified in Fauward's existing spec (sections 1–24), and is directly applicable to Fauward's use case. Codex must implement all of these.

---

### 25.1 Returns Management (Reverse Logistics)

**Status: Not in Fauward spec at all. Must add.**

A full reverse-logistics workflow for when a recipient wants to return a shipment. This is a standard expectation for any logistics platform.

#### Return Status Machine

```
REQUESTED → APPROVED → LABEL_ISSUED → PICKED_UP → IN_HUB → RECEIVED → REFUNDED → RESOLVED
                                                                               ↘ REJECTED
```

#### Database

Add to Prisma schema — `apps/backend/prisma/schema.prisma`:

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

#### Backend — Create `apps/backend/src/modules/returns/returns.routes.ts`

```
GET    /api/v1/returns              — list returns for tenant; filter by status; pagination
POST   /api/v1/returns              — customer creates return request; body: { shipmentId, reason, notes }; validates shipment is DELIVERED and belongs to requesting customer; status=REQUESTED
GET    /api/v1/returns/:id          — return detail with shipment summary
PATCH  /api/v1/returns/:id/approve  — staff approves; status=APPROVED; generate return label PDF (delivery-note format reversed); email customer with label; roles: TENANT_ADMIN, TENANT_MANAGER, TENANT_STAFF
PATCH  /api/v1/returns/:id/reject   — staff rejects; body: { reason }; email customer; roles: same as approve
PATCH  /api/v1/returns/:id/status   — advance status (LABEL_ISSUED → PICKED_UP → IN_HUB → RECEIVED → RESOLVED); validate transition; roles: TENANT_STAFF, TENANT_DRIVER for physical transitions
POST   /api/v1/returns/:id/refund   — mark REFUNDED; links to payment refund; roles: TENANT_ADMIN, TENANT_FINANCE
```

Register in `app.ts` as `await registerReturnsRoutes(app)`.

#### Tenant Portal UI

Create `apps/tenant-portal/src/pages/returns/`:
- `ReturnsListPage.tsx` — Returns table: tracking number, customer, reason, status badge, created date, actions. Filter by status. Links to detail.
- `ReturnDetailPage.tsx` — Return detail: shipment summary card, return reason, status timeline, approve/reject buttons (role-gated), return label download, refund action.

Customer-facing: In the customer shipment detail view (when status=DELIVERED), show "Request Return" button → modal with reason selector + notes.

Add "Returns" nav item to `layouts/navigation.ts` for TENANT_ADMIN, TENANT_MANAGER, TENANT_STAFF.
Add route `/returns` and `/returns/:id` to `router/index.tsx`.

**Notifications on return events:**
- On REQUESTED: email to TENANT_ADMIN/TENANT_MANAGER
- On APPROVED: email to customer with return label attachment
- On REJECTED: email to customer with reason
- On RECEIVED: email to customer confirming receipt
- On REFUNDED: email to customer

---

### 25.2 Support Ticket System

**Status: Completely absent from Fauward spec. Must add.**

Customers (shippers and recipients) raise support tickets with the logistics business (tenant) directly inside the platform. This is distinct from Fauward's own support for its SaaS customers — this is the tenant's customer support tool.

#### Database

Add to Prisma schema:

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

#### Backend — Create `apps/backend/src/modules/support/support.routes.ts`

```
GET    /api/v1/support/tickets              — list tickets; filter by status, priority, category, assignedTo; search by ticketNumber, subject, customer email; pagination; roles: TENANT_ADMIN, TENANT_MANAGER, TENANT_STAFF
POST   /api/v1/support/tickets              — create ticket; body: { subject, category, priority, shipmentId?, message }; any authenticated user; generates ticketNumber; creates first TicketMessage
GET    /api/v1/support/tickets/:id          — ticket detail with messages; staff sees internal notes; customer sees only non-internal messages
POST   /api/v1/support/tickets/:id/messages — add reply; body: { body, isInternal? }; notifies other party by email
PATCH  /api/v1/support/tickets/:id          — update status, priority, assignedTo; roles: TENANT_ADMIN, TENANT_MANAGER, TENANT_STAFF
POST   /api/v1/support/tickets/:id/resolve  — mark RESOLVED; email customer
POST   /api/v1/support/tickets/:id/close    — mark CLOSED (after resolution, no further replies)
```

Register in `app.ts` as `await registerSupportRoutes(app)`.

#### Tenant Portal UI

Create `apps/tenant-portal/src/pages/support/`:
- `TicketsListPage.tsx` — Table: ticket number, subject, customer, category, priority badge, status badge, assigned to, created. Filter bar: status, priority, category. Search. Bulk status update.
- `TicketDetailPage.tsx` — Subject + metadata at top. Message thread below (customer messages on right, staff on left, internal notes with yellow background visible to staff only). Reply textarea + "Internal note" toggle. Status + assignee controls in sidebar.

Customer-facing: "Get Help" button on shipment detail → opens new ticket form pre-filled with shipmentId.

Add "Support" nav item for TENANT_ADMIN, TENANT_MANAGER, TENANT_STAFF.

**Email notifications:**
- On ticket created: email to TENANT_ADMIN + assignedTo (if set); confirmation to customer
- On staff reply: email to customer with message body
- On customer reply: email to assignedTo or TENANT_ADMIN
- On resolved: email to customer

---

### 25.3 Email Template Management (Admin UI)

**Status: Fauward sends emails but has no UI to manage templates. Must add.**

Tenant admins need to see which email notifications are enabled, configure sender settings, and test templates — without touching code.

#### Database

Add to `TenantSettings` model — add a `emailConfig` JSONB column (or a separate model):

```prisma
model EmailTemplateConfig {
  id          String  @id @default(uuid()) @db.Uuid
  tenantId    String  @db.Uuid
  templateKey String  // e.g. "booking_confirmed", "invoice_sent"
  isEnabled   Boolean @default(true)
  customSubject String?  // tenant can override subject line
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id])
  @@unique([tenantId, templateKey])
}
```

Also add to TenantSettings: `emailFromName String?`, `emailReplyTo String?`, `opsEmailRecipients String[]`.

#### Backend

Add to `tenant.routes.ts`:
```
GET    /api/v1/tenant/email-templates              — list all templates with enabled status for tenant
PATCH  /api/v1/tenant/email-templates/:key         — enable/disable, set custom subject; roles: TENANT_ADMIN
PATCH  /api/v1/tenant/email-settings               — update fromName, replyTo, opsRecipients
POST   /api/v1/tenant/email-templates/:key/test    — send test email to requesting user's email; roles: TENANT_ADMIN
```

#### Template Keys (all must be in `email-templates.ts`)

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

#### Tenant Portal UI

Create `apps/tenant-portal/src/pages/settings/EmailSettingsTab.tsx`:
- Global settings card: From Name, Reply-To, Ops Notification Recipients (comma-separated or tag input)
- Template table: template name, description, toggle enabled/disabled, custom subject input, "Send test" button
- On "Send test": call `POST /tenant/email-templates/:key/test` → shows success/error toast

Add "Email" tab to settings navigation.

---

### 25.4 Tenant Pricing System (Full Self-Serve Control)

**Status: Fauward has skeletal rate cards with hardcoded multipliers. Tenants need complete, self-serve control over every aspect of how they price their shipments — zones, base rates, service tiers, surcharges, insurance, weight bands, dynamic rules, promo codes, and currencies. All of this must be configurable from the portal with no code changes. Must add.**

The pricing system has seven layers, evaluated in this order for every shipment:

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

The output of the engine is a **price breakdown** — not just a total. Every layer's contribution is returned so customers and staff can see exactly how the price was built.

---

#### 25.4.1 Service Zones — Full CRUD (Already in Schema, Needs Full Backend + UI)

The `service_zones` and `rate_cards` tables already exist in the Prisma schema. The backend must expose full CRUD so tenants can define their own geography.

**Backend — Create `apps/backend/src/modules/pricing/zones.routes.ts`**

```
GET    /api/v1/pricing/zones              — list all zones for tenant; includes rate card count per zone pair
POST   /api/v1/pricing/zones              — create zone: { name, zoneType: NATIONAL|INTERNATIONAL|REGIONAL, description }
PATCH  /api/v1/pricing/zones/:id          — rename or update description
DELETE /api/v1/pricing/zones/:id          — only if no active rate cards reference it
```

A "zone" is a named geographic grouping (e.g. "Lagos Metro", "South-West Nigeria", "UK Mainland", "International"). Tenants define what belongs in each zone — Fauward does not prescribe geography.

---

#### 25.4.2 Rate Cards — Full CRUD (Already in Schema, Needs Full Backend + UI)

Rate cards define the price between two zones for a given service tier. Tenants can have multiple rate cards (e.g. one for the current quarter, one marked future, one for a specific customer).

**Backend — Create `apps/backend/src/modules/pricing/rate-cards.routes.ts`**

```
GET    /api/v1/pricing/rate-cards                      — list all rate cards; filter by originZone, destZone, serviceTier, isActive
POST   /api/v1/pricing/rate-cards                      — create rate card: { name, originZoneId, destZoneId, serviceTier, baseFee, perKgRate, currency, effectiveFrom, effectiveTo? }
GET    /api/v1/pricing/rate-cards/:id                  — single rate card detail
PATCH  /api/v1/pricing/rate-cards/:id                  — update any field; cannot edit if shipments have been priced with this card (show warning, offer duplicate + edit instead)
DELETE /api/v1/pricing/rate-cards/:id                  — only if isActive=false and no shipments priced with it
PATCH  /api/v1/pricing/rate-cards/:id/activate         — set isActive=true, set others for same zone pair + tier to isActive=false
POST   /api/v1/pricing/rate-cards/:id/duplicate        — clone a rate card with new name and effectiveFrom date
GET    /api/v1/pricing/rate-cards/matrix               — returns a zone×zone matrix for the UI grid view: { zones: Zone[], matrix: Record<originId, Record<destId, RateCard|null>> }
POST   /api/v1/pricing/rate-cards/matrix/import        — bulk import via CSV: columns = origin_zone, dest_zone, service_tier, base_fee, per_kg_rate; validates, previews, then inserts
```

**Rate card fields tenants control:**
- `baseFee` — flat fee regardless of weight (e.g. £3.50 per shipment)
- `perKgRate` — per chargeable-kg rate (e.g. £0.85/kg)
- `minCharge` — floor price regardless of calculation (e.g. £5.00 minimum)
- `maxCharge` — ceiling price (optional; for capped-rate agreements)
- `currency` — which currency this card is priced in
- `effectiveFrom` / `effectiveTo` — date-bound validity; expired cards are kept for audit but not used
- `serviceTier` — rate cards are per tier (tenants can have different rates for STANDARD vs EXPRESS on the same route)

---

#### 25.4.3 Service Tier Configuration (Tenant-Controlled, Not Hardcoded)

**Status: Section 9 hardcodes STANDARD=1.0×, EXPRESS=1.6×, OVERNIGHT=2.2×. These must be tenant-configurable.**

Add `serviceTierConfig Json` to `TenantSettings`. Default value:

```json
{
  "STANDARD":  { "label": "Standard",  "multiplier": 1.0, "description": "3-5 business days", "isEnabled": true },
  "EXPRESS":   { "label": "Express",   "multiplier": 1.6, "description": "Next business day",  "isEnabled": true },
  "OVERNIGHT": { "label": "Overnight", "multiplier": 2.2, "description": "By 9am next day",    "isEnabled": false }
}
```

Tenants can:
- Change the label shown to customers (e.g. rename "Standard" to "Economy")
- Set their own multiplier per tier
- Write their own description shown in the booking wizard
- Enable/disable tiers (disabled tiers do not appear in the booking wizard)

Backend: add `PATCH /api/v1/pricing/service-tiers` — body: the full `serviceTierConfig` JSON. Validates that at least one tier is enabled.

The pricing engine reads `tenant.settings.serviceTierConfig[shipment.serviceTier].multiplier` — never a hardcoded constant.

---

#### 25.4.4 Surcharge Configuration

**Status: Section 9 mentions oversize (+15%), insurance (+2%), remote area (+£5–£20) as hardcoded values. All surcharges must be tenant-configured.**

Replace the hardcoded surcharges with a `surcharges` table.

**Add to Prisma schema:**

```prisma
enum SurchargeType {
  PERCENT_OF_BASE    // percentage applied to base price
  PERCENT_OF_TOTAL   // percentage applied to running total
  FLAT_FEE           // fixed amount added
  PER_KG             // additional per-kg charge
}

enum SurchargeCondition {
  ALWAYS             // applied to every shipment
  OVERSIZE           // applied if any dimension > threshold
  OVERWEIGHT         // applied if weight > threshold
  REMOTE_AREA        // applied if destination zone tagged as remote
  RESIDENTIAL        // applied if destination is residential
  DANGEROUS_GOODS    // applied if shipment flagged as DG
  FUEL               // fuel surcharge (typically ALWAYS, adjusted periodically)
  PEAK_SEASON        // applied within configured date ranges
}

model Surcharge {
  id           String            @id @default(uuid()) @db.Uuid
  tenantId     String            @db.Uuid
  name         String            // e.g. "Fuel Surcharge", "Oversize Fee", "Remote Area"
  description  String?           // shown to customer in quote breakdown
  type         SurchargeType
  condition    SurchargeCondition
  value        Decimal           @db.Decimal(10, 4)  // the percentage or flat amount
  threshold    Decimal?          @db.Decimal(10, 2)  // for OVERSIZE: max dimension cm; OVERWEIGHT: max kg
  peakFrom     DateTime?         // for PEAK_SEASON
  peakTo       DateTime?         // for PEAK_SEASON
  isEnabled    Boolean           @default(true)
  isVisibleToCustomer Boolean    @default(true)  // if false, absorbed into base price display
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id])
}
```

**Backend — Add to `apps/backend/src/modules/pricing/pricing.routes.ts`:**

```
GET    /api/v1/pricing/surcharges              — list all surcharges for tenant, ordered by condition then name
POST   /api/v1/pricing/surcharges              — create surcharge
PATCH  /api/v1/pricing/surcharges/:id          — update any field
DELETE /api/v1/pricing/surcharges/:id          — delete
PATCH  /api/v1/pricing/surcharges/:id/toggle   — flip isEnabled; audit logged
```

**Default surcharges seeded on tenant creation (all disabled by default — tenant must consciously enable):**
- Fuel Surcharge — ALWAYS, PERCENT_OF_BASE, 0%
- Oversize Fee — OVERSIZE, FLAT_FEE, £0 (threshold: 120cm)
- Remote Area Surcharge — REMOTE_AREA, FLAT_FEE, £0
- Dangerous Goods — DANGEROUS_GOODS, PERCENT_OF_BASE, 0%
- Residential Delivery — RESIDENTIAL, FLAT_FEE, £0
- Peak Season — PEAK_SEASON, PERCENT_OF_BASE, 0%

**Surcharge evaluation in `shared/utils/pricing.ts`:**
```typescript
for (const surcharge of enabledSurcharges) {
  if (!matchesSurchargeCondition(surcharge, shipment)) continue;

  switch (surcharge.type) {
    case 'PERCENT_OF_BASE':  running += base * (surcharge.value / 100); break;
    case 'PERCENT_OF_TOTAL': running += running * (surcharge.value / 100); break;
    case 'FLAT_FEE':         running += surcharge.value; break;
    case 'PER_KG':           running += chargeableWeight * surcharge.value; break;
  }

  breakdown.push({ name: surcharge.name, amount: added, visibleToCustomer: surcharge.isVisibleToCustomer });
}
```

---

#### 25.4.5 Dimensional (Volumetric) Weight

**Status: Fauward pricing engine uses `weight_kg` only. Dimensional weight is standard in all logistics. Must add.**

Add `dimensionalDivisor Int @default(5000)` to `TenantSettings`.

- Road/courier standard: 5000 cm³/kg
- Air freight standard: 6000 cm³/kg
- Tenants in the air freight space can change this to match their actual carrier's divisor

Update `shared/utils/pricing.ts`:

```typescript
const dimDivisor = settings.dimensionalDivisor ?? 5000;
const volumetricKg = (item.lengthCm * item.widthCm * item.heightCm) / dimDivisor;
const chargeableKg = Math.max(item.weightKg, volumetricKg);
// sum chargeableKg across all ShipmentItems
const totalChargeableKg = shipment.items.reduce((sum, item) => sum + Math.max(item.weightKg, (item.lengthCm * item.widthCm * item.heightCm) / dimDivisor), 0);
```

The `StepPackage.tsx` wizard already collects dimensions. The quote preview in `StepService.tsx` must show:
- Actual weight: 4.2 kg
- Volumetric weight: 6.0 kg ← if higher
- Chargeable weight: **6.0 kg** ← clearly highlighted

Tenants configure the divisor from the Pricing settings page. Add to `PATCH /api/v1/pricing/settings`.

---

#### 25.4.6 Insurance Configuration (Tenant-Priced)

**Status: Insurance mentioned as a 2% hardcoded surcharge. Tenants must be able to define their own insurance tiers and pricing.**

Replace hardcoded insurance with tenant-configured tiers stored as a JSONB column on `TenantSettings`:

```json
// TenantSettings.insuranceConfig (Json)
{
  "tiers": [
    {
      "key": "NONE",
      "label": "No Insurance",
      "description": "Carrier liability only (up to £20)",
      "type": "NONE",
      "enabled": true
    },
    {
      "key": "BASIC",
      "label": "Basic Cover",
      "description": "Covers loss or damage up to declared value (max £250)",
      "type": "PERCENT_OF_DECLARED",
      "rate": 1.5,
      "minFee": 2.00,
      "maxCover": 250,
      "enabled": true
    },
    {
      "key": "STANDARD",
      "label": "Standard Cover",
      "description": "Full cover up to £1,000 declared value",
      "type": "PERCENT_OF_DECLARED",
      "rate": 2.5,
      "minFee": 5.00,
      "maxCover": 1000,
      "enabled": true
    },
    {
      "key": "PREMIUM",
      "label": "Premium Cover",
      "description": "Full cover up to £5,000 + next-day replacement",
      "type": "PERCENT_OF_DECLARED",
      "rate": 3.5,
      "minFee": 15.00,
      "maxCover": 5000,
      "enabled": false
    }
  ]
}
```

Each tier `type` can be:
- `NONE` — no fee
- `PERCENT_OF_DECLARED` — `rate`% of `shipment.declaredValue`, floor at `minFee`
- `FLAT_FEE` — fixed fee regardless of declared value

Backend: add `PATCH /api/v1/pricing/insurance` — body: the full `insuranceConfig` JSON. Validates that NONE tier always exists and is always enabled.

The booking wizard `StepPackage.tsx` shows the insurance tier selector with tenant-configured labels, descriptions, and calculated preview prices for the current declared value.

---

#### 25.4.7 Weight Discount Tiers (Bulk Pricing)

Logistics businesses give step discounts for heavy or bulk shipments. Tenants define their own bands.

**Add to Prisma schema:**

```prisma
model WeightDiscountTier {
  id           String   @id @default(uuid()) @db.Uuid
  tenantId     String   @db.Uuid
  name         String?  // e.g. "Heavy freight discount"
  minWeightKg  Decimal  @db.Decimal(8, 2)
  maxWeightKg  Decimal? @db.Decimal(8, 2)  // null = no ceiling
  discountType String   @default("PERCENT")  // PERCENT | FLAT_FEE_REDUCTION | FIXED_PER_KG_OVERRIDE
  discountValue Decimal @db.Decimal(8, 4)   // meaning depends on discountType
  isEnabled    Boolean  @default(true)
  createdAt    DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id])
}
```

`discountType` meanings:
- `PERCENT` — reduce total price by X% (e.g. 5% off for 50–100kg)
- `FLAT_FEE_REDUCTION` — reduce total by a fixed amount (e.g. £10 off for 100kg+)
- `FIXED_PER_KG_OVERRIDE` — replace the per-kg rate entirely with a lower rate (e.g. £0.50/kg for 200kg+)

**Backend:**
```
GET    /api/v1/pricing/weight-tiers
POST   /api/v1/pricing/weight-tiers              — { name, minWeightKg, maxWeightKg, discountType, discountValue }
PATCH  /api/v1/pricing/weight-tiers/:id
DELETE /api/v1/pricing/weight-tiers/:id
```

**Evaluation order:** after insurance, before dynamic rules. Multiple tiers can match if ranges overlap — apply the most specific (narrowest range) or the highest discount; tenant-configurable conflict policy in `TenantSettings.weightTierConflictPolicy: 'MOST_SPECIFIC' | 'BEST_FOR_CUSTOMER' | 'FIRST_MATCH'`.

---

#### 25.4.8 Dynamic Pricing Rules (Conditional Overrides)

After all the structural pricing above is applied, dynamic rules allow tenants to handle exceptions and special cases without creating new rate cards.

**Add to Prisma schema:**

```prisma
enum PricingRuleAction {
  ADD             // adds fixed amount to running total
  SUBTRACT        // subtracts fixed amount (floor at 0)
  MULTIPLY        // multiplies running total by factor (e.g. 0.85 = 15% off)
  OVERRIDE_TOTAL  // replaces the entire total
  OVERRIDE_PER_KG // replaces the per-kg rate for this shipment
  SET_MIN         // sets a floor — total cannot go below this
  SET_MAX         // sets a ceiling — total cannot exceed this
}

model PricingRule {
  id           String            @id @default(uuid()) @db.Uuid
  tenantId     String            @db.Uuid
  name         String
  description  String?           // internal note explaining why the rule exists
  isEnabled    Boolean           @default(true)
  priority     Int               @default(100)  // lower = evaluated first; ties broken by createdAt
  conditions   Json
  // conditions schema:
  // {
  //   originZoneIds?: string[],
  //   destZoneIds?: string[],
  //   serviceTiers?: ("STANDARD"|"EXPRESS"|"OVERNIGHT")[],
  //   weightMinKg?: number,
  //   weightMaxKg?: number,
  //   valueMinGBP?: number,       // min shipment declared value
  //   valueMaxGBP?: number,
  //   customerIds?: string[],     // apply only to specific customers/orgs
  //   organisationIds?: string[],
  //   daysOfWeek?: number[],      // 0=Sun,1=Mon...6=Sat
  //   timeFrom?: string,          // "HH:MM" — time of booking
  //   timeTo?: string,
  //   dateFrom?: string,          // "YYYY-MM-DD" — date range
  //   dateTo?: string
  // }
  action       PricingRuleAction
  actionValue  Decimal           @db.Decimal(12, 4)
  stopAfter    Boolean           @default(false)  // if true, no further rules evaluated after this one matches
  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt

  tenant Tenant @relation(fields: [tenantId], references: [id])
}
```

**Example rules tenants might create:**
- "Weekend booking surcharge" — condition: `daysOfWeek: [0, 6]`, action: MULTIPLY 1.1 (10% more)
- "Loyal customer discount for Acme Ltd" — condition: `organisationIds: ["uuid-of-acme"]`, action: MULTIPLY 0.85
- "Late night express cap" — condition: `serviceTiers: ["EXPRESS"], timeFrom: "22:00", timeTo: "23:59"`, action: SET_MAX 45.00
- "Express minimum charge" — condition: `serviceTiers: ["EXPRESS"]`, action: SET_MIN 12.00
- "Heavy freight override" — condition: `weightMinKg: 200`, action: OVERRIDE_PER_KG 0.42

**Backend — `apps/backend/src/modules/pricing/pricing.routes.ts`:**

```
GET    /api/v1/pricing/rules              — list all rules; ordered by priority ASC; roles: TENANT_ADMIN, TENANT_MANAGER
POST   /api/v1/pricing/rules              — create rule; writes audit log
PATCH  /api/v1/pricing/rules/:id          — update any field; writes audit log
DELETE /api/v1/pricing/rules/:id          — delete; writes audit log
PATCH  /api/v1/pricing/rules/reorder      — body: { orderedIds: string[] }; reassigns priority sequentially (10, 20, 30...)
PATCH  /api/v1/pricing/rules/:id/toggle   — enable/disable; writes audit log
```

**Rule evaluation in `shared/utils/pricing.ts`:**
```typescript
const rules = await prisma.pricingRule.findMany({
  where: { tenantId, isEnabled: true },
  orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }]
});

for (const rule of rules) {
  if (!matchesConditions(rule.conditions, shipmentContext)) continue;

  switch (rule.action) {
    case 'ADD':             running += rule.actionValue; break;
    case 'SUBTRACT':        running = Math.max(0, running - rule.actionValue); break;
    case 'MULTIPLY':        running *= rule.actionValue; break;
    case 'OVERRIDE_TOTAL':  running = rule.actionValue; break;
    case 'OVERRIDE_PER_KG': recomputeWithNewPerKgRate(rule.actionValue); break;
    case 'SET_MIN':         running = Math.max(running, rule.actionValue); break;
    case 'SET_MAX':         running = Math.min(running, rule.actionValue); break;
  }

  breakdown.push({ ruleId: rule.id, ruleName: rule.name, action: rule.action, effect: delta });

  if (rule.stopAfter) break;
}
```

---

#### 25.4.9 Promo Codes

**Add to Prisma schema:**

```prisma
enum PromoType {
  PERCENT_OFF    // e.g. 10% off the total
  FIXED_OFF      // e.g. £5 off
  FREE_INSURANCE // waives the insurance fee only
  FREE_EXPRESS   // sets service tier price to STANDARD rate (effectively free upgrade)
}

model PromoCode {
  id              String    @id @default(uuid()) @db.Uuid
  tenantId        String    @db.Uuid
  code            String    // stored uppercase; unique per tenant
  description     String?
  type            PromoType
  value           Decimal   @db.Decimal(10, 2)
  minOrderValue   Decimal?  @db.Decimal(10, 2)  // minimum subtotal to activate
  maxDiscountValue Decimal? @db.Decimal(10, 2)  // cap on PERCENT_OFF (e.g. max £20 off)
  maxUses         Int?      // null = unlimited
  usedCount       Int       @default(0)
  customerIds     String[]  // if populated, only these customers can use the code
  isEnabled       Boolean   @default(true)
  expiresAt       DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  tenant     Tenant      @relation(fields: [tenantId], references: [id])
  shipments  Shipment[]  // via promoCodeId FK on Shipment
  @@unique([tenantId, code])
}
```

Add `promoCodeId String? @db.Uuid` to the `Shipment` model with relation to `PromoCode`.

**Backend — add to `pricing.routes.ts`:**
```
GET    /api/v1/pricing/promo-codes                    — list all; show usedCount vs maxUses; roles: TENANT_ADMIN, TENANT_MANAGER
POST   /api/v1/pricing/promo-codes                    — create; auto-uppercase code; validate code is alphanumeric
PATCH  /api/v1/pricing/promo-codes/:id                — update (disable, extend expiry, adjust limits); cannot reduce maxUses below usedCount
DELETE /api/v1/pricing/promo-codes/:id                — only if usedCount=0
POST   /api/v1/pricing/promo-codes/validate           — called by booking wizard; body: { code, subtotal, customerId? }; returns { valid, discountAmount, discountType, message }; does NOT increment usedCount yet
```

Promo code is applied in the pricing engine as the very last step, after all rules. On shipment creation, if a promoCodeId is provided, increment `usedCount` within the same transaction.

**In the booking wizard** (`StepService.tsx`): add a "Have a promo code?" expandable input below the price. On entry, call `POST /pricing/promo-codes/validate` and show the discount inline in the price breakdown.

---

#### 25.4.10 Tax Configuration

**Status: Section 9 mentions "VAT applied based on tenant region" but this is never actually implemented. Must add.**

Add to `TenantSettings`:

```prisma
taxConfig Json
// {
//   "enabled": true,
//   "taxName": "VAT",         // label shown on invoice ("VAT", "GST", "Sales Tax")
//   "rate": 20,               // percentage
//   "taxNumber": "GB123456789", // tenant's own tax registration number shown on invoices
//   "taxIncluded": false,     // if true, displayed prices include tax; if false, tax added on top
//   "exemptOrgs": []          // organisation UUIDs that are tax-exempt (B2B zero-rating)
// }
```

Backend: add `PATCH /api/v1/pricing/tax` — body: taxConfig JSON. Validates rate is 0–100.

In the pricing engine, tax is the absolute last step:
```typescript
const taxAmount = settings.taxConfig.enabled
  ? (running * settings.taxConfig.rate) / 100
  : 0;
const totalWithTax = running + taxAmount;
```

The breakdown returned includes `{ subtotal, taxRate, taxAmount, total }`.

Invoices generated by `documents.service.ts` show the tenant's `taxNumber` and itemised tax line.

---

#### 25.4.11 Exchange Rate Management

`currency_rates` table exists in schema. Expose full management to tenants.

**Backend — add to `pricing.routes.ts`:**
```
GET   /api/v1/pricing/currency-rates              — latest rate per from/to pair for tenant's active currencies
POST  /api/v1/pricing/currency-rates              — manual override: { fromCurrency, toCurrency, rate }; source='MANUAL'
POST  /api/v1/pricing/currency-rates/refresh      — enqueues job to fetch from Open Exchange Rates API; returns job ID
```

**BullMQ repeatable job** (daily at 06:00 UTC): fetch rates from Open Exchange Rates API for all currency pairs needed across all tenants; bulk insert into `currency_rates`.

In `StepService.tsx` price preview: if tenant's base currency differs from the rate card currency, show converted amount with the rate used and "Rate as of {date}" footnote.

---

#### 25.4.12 Pricing Settings (Global Controls)

A single endpoint for miscellaneous global pricing controls.

**Backend:** `GET /api/v1/pricing/settings` and `PATCH /api/v1/pricing/settings`

Fields managed here:
```json
{
  "dimensionalDivisor": 5000,
  "roundingMode": "ROUND_HALF_UP",        // or ROUND_UP, ROUND_DOWN
  "roundingPrecision": 2,                 // decimal places
  "defaultCurrency": "GBP",
  "weightTierConflictPolicy": "BEST_FOR_CUSTOMER",
  "quoteValidityMinutes": 30,             // how long a price quote is locked before expiry
  "showPriceBreakdownToCustomer": true,   // if false, customer sees total only
  "autoInvoiceOnDelivery": true           // auto-generate invoice when status → DELIVERED
}
```

---

#### 25.4.13 Pricing Calculator (Quote Preview Tool)

All the pricing layers above must be testable without creating a real shipment.

**Backend:**
```
POST /api/v1/pricing/calculate   — no shipment created; body: { originZoneId, destZoneId, serviceTier, weightKg, lengthCm, widthCm, heightCm, declaredValue, insuranceTier, promoCode?, customerId?, date? }; returns full breakdown
```

Returns:
```json
{
  "chargeableWeightKg": 6.0,
  "breakdown": [
    { "label": "Base fee",              "amount": 3.50 },
    { "label": "Weight charge (6.0 kg @ £0.85)", "amount": 5.10 },
    { "label": "Express multiplier (1.6×)", "amount": 4.26 },
    { "label": "Fuel Surcharge (3%)",   "amount": 0.39 },
    { "label": "Standard Cover (2.5%)", "amount": 1.40 },
    { "label": "Weekend booking (+10%)", "amount": 1.46, "appliedRule": "Weekend Surcharge" },
    { "label": "Promo: SUMMER10 (-10%)", "amount": -1.60 }
  ],
  "subtotal": 14.51,
  "taxRate": 20,
  "taxAmount": 2.90,
  "total": 17.41,
  "currency": "GBP",
  "quoteExpiresAt": "2026-04-06T15:32:00Z"
}
```

The `StepService.tsx` booking wizard calls this endpoint live as the user changes zone/weight/service — debounced 400ms. Shows the full breakdown in an expandable "How is this calculated?" section.

---

#### 25.4.14 All Pricing Backend in One Module

Create **`apps/backend/src/modules/pricing/`** as a single module containing:

```
pricing/
├── pricing.routes.ts        — registers ALL pricing routes below
├── zones.routes.ts          — service zones CRUD
├── rate-cards.routes.ts     — rate cards CRUD + matrix + CSV import
├── surcharges.routes.ts     — surcharges CRUD
├── rules.routes.ts          — dynamic pricing rules CRUD + reorder
├── promo-codes.routes.ts    — promo codes CRUD + validate
├── weight-tiers.routes.ts   — weight discount tiers CRUD
├── pricing.service.ts       — the calculate() function implementing all 10 layers
└── pricing.schema.ts        — Zod validation schemas for all bodies
```

Register in `app.ts` as `await registerPricingRoutes(app)`.

**All pricing routes require authentication and `requireRole(['TENANT_ADMIN', 'TENANT_MANAGER'])` except:**
- `POST /pricing/calculate` — accessible to any authenticated user (staff use it for quoting)
- `POST /pricing/promo-codes/validate` — accessible to any authenticated user (customers use it at booking)

---

#### 25.4.15 Pricing Admin UI

Create **`apps/tenant-portal/src/pages/pricing/`** with these pages, all under a "Pricing" top-level nav section (role: TENANT_ADMIN, TENANT_MANAGER):

**`PricingOverviewPage.tsx`** — Landing page for the Pricing section:
- Summary cards: active rate cards count, enabled rules count, active promo codes, current tax rate, base currency
- Quick links to each sub-section
- "Test your pricing" shortcut that opens the calculator

**`ZonesPage.tsx`** — Manage service zones:
- Table: zone name, type badge (NATIONAL/INTERNATIONAL/REGIONAL), rate cards using it, description, edit/delete
- "New Zone" button → inline form or modal
- Warning on delete if rate cards reference the zone

**`RateCardsPage.tsx`** — Two views toggled by tab:
- **Grid view:** zone×zone matrix table; each cell shows the active rate card for that pair (base fee, per kg, tier); click cell to edit; empty cells show "+ Add rate" in muted style
- **List view:** sortable table of all rate cards with all fields; filter by zone, tier, active status
- "Import from CSV" button → file picker → preview table of parsed rows → confirm import
- "Duplicate" action per card for seasonal repricing
- "New Rate Card" button → form: origin zone, dest zone, service tier, fees, dates

**`ServiceTiersPage.tsx`** — Configure service tier labels, multipliers, descriptions:
- One card per tier (STANDARD, EXPRESS, OVERNIGHT)
- Inline editable fields: label, multiplier (number input with × prefix), description, enabled toggle
- Live preview: "At this multiplier, a £10 base shipment would cost £{10 × multiplier}"
- Save all button

**`SurchargesPage.tsx`** — Surcharge configuration:
- Table: name, condition badge, type, value, enabled toggle, edit/delete
- "New Surcharge" modal: name, condition selector, type selector, value input, threshold (if applicable), date range (if PEAK_SEASON), customer-visible toggle
- "Seed defaults" button (if tenant has no surcharges yet) — creates the default set all disabled

**`InsurancePage.tsx`** — Insurance tier configuration:
- One expandable card per tier (NONE/BASIC/STANDARD/PREMIUM)
- Editable: label, description, type (NONE/PERCENT_OF_DECLARED/FLAT_FEE), rate, minFee, maxCover, enabled toggle
- Preview table: "For a £200 declared value shipment, each tier would cost..."
- Tenants can add custom tiers beyond the four defaults

**`WeightTiersPage.tsx`** — Weight discount tier management:
- Table: weight range, discount type badge, discount value, enabled toggle, edit/delete
- "New Tier" button → modal: min weight, max weight (optional), discount type, value
- Conflict policy selector: Best for customer / Most specific / First match

**`PricingRulesPage.tsx`** — Dynamic pricing rules:
- Rules list with drag handle for priority reordering (`@dnd-kit/sortable`)
- Each row: priority number, name, conditions summary (e.g. "Express + Weekend + >10kg"), action badge (e.g. MULTIPLY 0.85), enabled toggle, edit/delete
- "New Rule" button → modal/drawer:
  - Name + description fields
  - Conditions builder: add/remove conditions from a dropdown (zone, service tier, weight range, customer, org, day of week, time of day, date range)
  - Action selector + value input
  - Stop-after-match toggle
- Conditions shown as readable chips: "Service: EXPRESS" + "Day: Sat, Sun" → easy to read

**`PromoCodesPage.tsx`** — Promo code management:
- Table: code (monospace), type badge, value, min order, used/max uses, expiry, enabled toggle, edit/delete
- "New Code" button → modal: code (auto-uppercase as typed), type, value, min order value, max discount, max uses, customer restriction (optional), expiry date
- Usage bar per code showing used/max

**`TaxPage.tsx`** — Tax configuration:
- Tax enabled toggle
- Tax name (VAT / GST / Sales Tax / custom)
- Tax rate % input
- Tax registration number (shown on invoices)
- Tax included / excluded toggle with explanation
- Exempt organisations: searchable multiselect of organisations

**`CurrencyRatesPage.tsx`** — Exchange rate management:
- Table: from currency, to currency, rate, source (AUTO/MANUAL), last updated
- "Override" button per row → inline edit
- "Refresh all" button → triggers API fetch
- Auto-refresh schedule display: "Rates update daily at 06:00 UTC"

**`PricingSettingsPage.tsx`** — Global pricing controls:
- Dimensional divisor input with help text explaining standard values (5000/6000)
- Rounding mode selector
- Quote validity duration (minutes)
- Show price breakdown to customer toggle
- Auto-invoice on delivery toggle

**`PricingCalculatorPage.tsx`** — Quote test tool:
- Form: origin zone selector, dest zone selector, service tier, weight (kg), dimensions (L×W×H cm), declared value, insurance tier selector, promo code input, customer selector (optional), booking date/time
- "Calculate" button → calls `POST /pricing/calculate`
- Result: full layered breakdown with each row, subtotal, tax, total
- "Save as quote" button → pre-fills `POST /crm/quotes` with the calculated breakdown

Add "Pricing" to `layouts/navigation.ts` for TENANT_ADMIN, TENANT_MANAGER with sub-items: Overview · Zones · Rate Cards · Service Tiers · Surcharges · Insurance · Weight Tiers · Rules · Promo Codes · Tax · Currencies · Settings · Calculator.

---

### 25.5 QR Code Scanning in Driver App

**Status: Fauward driver app has no QR scanning. TrenyConnect uses zxing. Must add.**

Drivers should be able to scan a shipment's QR code (on the printed label) to instantly pull up that shipment — much faster than searching.

#### Driver App — `apps/driver/src/`

Add component `components/driver/QRScanner.tsx`:
- Uses `@zxing/browser` library
- Opens device camera, decodes QR code continuously
- On successful decode: navigate to `/shipment/:id` (QR code encodes the tracking number or shipment ID)
- Overlay with crosshair guide, torch/flash toggle if supported
- Error state: camera permission denied → instructions to enable
- Manual fallback: text input for tracking number

Add to `RoutePage.tsx`: "Scan" button in the header → opens `QRScanner` in a modal/sheet. On decode, find matching stop in current route and navigate to `StopDetailPage`.

Add to `CapturePODPage.tsx`: scanning QR on package to confirm correct shipment before capturing POD.

Install: `@zxing/browser` in `apps/driver/package.json`.

#### Shipping Labels — QR Code on Label

Add QR code generation to the document service. When generating a delivery note / shipping label:
- Encode tracking number as QR code using `qrcode` npm package
- Embed QR as base64 PNG in the HTML template

#### Backend — Shipping Label Print Page

Create `apps/backend/src/modules/documents/label.routes.ts`:
```
GET /api/v1/label/:trackingNumber  — returns HTML (not JSON) optimised for thermal printer. Uses Puppeteer to render to PDF or returns the raw HTML with print CSS. Auth: valid API key or staff session.
```

The HTML label page must include:
- Tenant logo
- Tracking number in large monospace font
- QR code (128×128px)
- Sender name + address
- Recipient name + address
- Service tier badge (STANDARD / EXPRESS / OVERNIGHT)
- Weight + dimensions
- "Do not bend" / special handling instructions if applicable
- `@media print` CSS: remove UI chrome, correct label dimensions (100mm × 150mm for standard shipping label)

---

### 25.6 In-App Notification Center

**Status: Fauward has email/SMS notifications but no in-app notification panel. Must add.**

A dropdown notification panel in the TopBar for staff users showing recent events that need attention.

#### Database

```prisma
model InAppNotification {
  id         String   @id @default(uuid()) @db.Uuid
  tenantId   String   @db.Uuid
  userId     String   @db.Uuid
  type       String   // "shipment_exception" | "return_requested" | "ticket_opened" | "usage_warning" | "payment_failed" etc.
  title      String
  body       String?
  link       String?  // relative URL to navigate to on click
  isRead     Boolean  @default(false)
  readAt     DateTime?
  createdAt  DateTime @default(now())

  tenant Tenant @relation(fields: [tenantId], references: [id])
  user   User   @relation(fields: [userId], references: [id])
}
```

#### Backend

Add to `app.ts` (alongside users module):
```
GET    /api/v1/notifications              — list for current user; filter by isRead; limit 50 most recent
PATCH  /api/v1/notifications/:id/read    — mark one read
POST   /api/v1/notifications/read-all   — mark all read
GET    /api/v1/notifications/unread-count — returns { count: number } — polled every 30s by TopBar
```

**When to create in-app notifications** (in addition to email):
- Shipment → EXCEPTION: notify TENANT_ADMIN + TENANT_MANAGER
- Return request created: notify TENANT_ADMIN + TENANT_MANAGER
- Support ticket opened: notify TENANT_ADMIN + assignedTo
- Support ticket reply from customer: notify assignedTo
- Usage at 80%: notify TENANT_ADMIN
- Usage at 100%: notify TENANT_ADMIN
- Payment failed: notify TENANT_ADMIN
- New quote accepted: notify assignedTo (sales rep)

#### Tenant Portal UI

Create `components/shared/NotificationCenter.tsx`:
- Bell icon in `TopBar.tsx` with unread count badge (red dot)
- Unread count fetched every 30s with React Query (`refetchInterval: 30000`)
- Click opens dropdown panel (max 400px tall, scrollable)
- Each notification: icon by type, title, body, relative timestamp, "unread" indicator (blue dot), link on click
- "Mark all read" button at top
- "No notifications" empty state

---

### 25.7 Activity Timeline

**Status: Fauward has per-shipment event timeline and an audit log. A unified cross-entity activity stream is absent. Must add.**

A single chronological feed showing everything happening across the tenant's account — useful for the ops manager to have a live pulse view.

#### Backend

Add to `analytics.routes.ts`:
```
GET /api/v1/activity?timeframe=1h|24h|7d|30d&type=shipment|return|ticket|invoice|audit
```

Query strategy: UNION across multiple tables ordered by timestamp DESC, limit 100:
- `shipment_events` (type=shipment) — status changes
- `audit_log` (type=audit) — admin actions
- `return_requests` on `updatedAt` (type=return) — return status changes
- `support_tickets` messages on `createdAt` (type=ticket) — new messages
- `invoices` on `sentAt`, `paidAt` (type=invoice)

Return unified schema:
```typescript
{
  id: string,
  type: "shipment" | "return" | "ticket" | "invoice" | "audit",
  title: string,        // e.g. "Shipment FWD-202506-A3F9K2 delivered"
  subtitle: string,     // e.g. "By driver James O."
  link: string,         // "/shipments/uuid"
  timestamp: string,    // ISO
  icon: string,         // icon name hint for frontend
  colour: string        // semantic colour hint
}
```

#### Tenant Portal UI

Create `apps/tenant-portal/src/pages/activity/ActivityTimelinePage.tsx`:
- Time filter buttons: 1h | 24h | 7d | 30d
- Type filter pills: All | Shipments | Returns | Tickets | Invoices | Audit
- Vertical timeline: icon + title + subtitle + relative timestamp
- Auto-refresh every 60s
- Skeleton loading on initial load

Add "Activity" nav item for TENANT_ADMIN, TENANT_MANAGER.

---

### 25.8 Analytics Enhancements

**Status: The current analytics are basic aggregates. The following are confirmed missing. Must add.**

#### 25.8.1 Shipment Lifecycle Funnel

Add to `GET /api/v1/analytics/shipments`:

```json
{
  "lifecycleFunnel": [
    { "status": "PENDING",          "count": 1200, "pct": 100 },
    { "status": "PROCESSING",       "count": 1150, "pct": 96 },
    { "status": "PICKED_UP",        "count": 1100, "pct": 92 },
    { "status": "IN_TRANSIT",       "count": 1050, "pct": 88 },
    { "status": "OUT_FOR_DELIVERY", "count": 980,  "pct": 82 },
    { "status": "DELIVERED",        "count": 910,  "pct": 76 },
    { "status": "FAILED_DELIVERY",  "count": 70,   "pct": 6  },
    { "status": "RETURNED",         "count": 20,   "pct": 2  }
  ]
}
```

Use `ShipmentEvent` records to count how many shipments reached each status in the date range. This shows drop-off rates at each stage.

#### 25.8.2 KPI Trend Indicators (vs Previous Period)

All KPI values in `GET /api/v1/analytics/full` must include a comparison to the previous equivalent period so the frontend can show ↑ / ↓ trend arrows.

Update response shape:
```json
{
  "totals": {
    "shipments": { "value": 450, "previousValue": 380, "changePct": 18.4 },
    "revenue":   { "value": 12400, "previousValue": 10200, "changePct": 21.6 },
    "onTimeRate":{ "value": 94.2, "previousValue": 91.0, "changePct": 3.5 },
    "avgDeliveryDays": { "value": 2.3, "previousValue": 2.7, "changePct": -14.8 }
  }
}
```

Query: accept `dateFrom` + `dateTo` params. Compute previous period as same duration before `dateFrom`. Run both queries in parallel.

#### 25.8.3 SLA Compliance Tracking

Add to `GET /api/v1/analytics/shipments`:

```json
{
  "slaCompliance": {
    "onTime": 910,
    "late": 70,
    "compliancePct": 92.8,
    "avgDeliveryHours": 26.4,
    "breachesByReason": [
      { "reason": "FAILED_DELIVERY", "count": 40 },
      { "reason": "EXCEPTION", "count": 30 }
    ]
  }
}
```

SLA definition: a shipment is on-time if the first `DELIVERED` ShipmentEvent timestamp is within `tenant.slaDeliveryHours` of the `PROCESSING` event timestamp. Add `slaDeliveryHours Int @default(72)` to `TenantSettings`.

#### 25.8.4 Risk / Exceptions Panel

Add to analytics response:
```json
{
  "exceptions": {
    "activeExceptions": 12,
    "stalePendingOver24h": 5,  // shipments still PENDING after 24h
    "failedDeliveryRate": 4.2, // % of OUT_FOR_DELIVERY that became FAILED_DELIVERY
    "topExceptionRoutes": [
      { "route": "Lagos → Abuja", "count": 8 }
    ]
  }
}
```

#### 25.8.5 Animated KPI Cards

In `apps/tenant-portal/src/features/admin/analytics/AnalyticsPage.tsx`, wrap all KPI stat values in an `AnimatedNumber` component:

```typescript
// components/ui/AnimatedNumber.tsx
// Uses requestAnimationFrame to count up from 0 to value over 600ms
// Formats with the same formatter used for the value type (currency/count/percent)
```

---

### 25.9 Dedicated Reports Page

**Status: Fauward mentions CSV export in analytics. A dedicated, structured reports page is absent. Must add.**

#### Backend — Add to analytics routes

```
GET /api/v1/reports/shipments    — full shipment data for date range as CSV/JSON/PDF; query params: dateFrom, dateTo, format=csv|json|pdf, status[], driverId, customerId
GET /api/v1/reports/revenue      — invoice + payment data for date range
GET /api/v1/reports/returns      — return request data
GET /api/v1/reports/tickets      — support ticket data
GET /api/v1/reports/staff        — shipments handled per staff member with performance metrics
GET /api/v1/reports/customers    — customer / organisation revenue ranking
```

Response for `format=csv`: set `Content-Type: text/csv` and `Content-Disposition: attachment; filename="fauward-report-{type}-{dateFrom}-{dateTo}.csv"`, stream rows.
Response for `format=pdf`: generate with Puppeteer, stream PDF.
Response for `format=json`: standard JSON array.

#### Tenant Portal UI

Create `apps/tenant-portal/src/pages/reports/ReportsPage.tsx`:
- Report type selector: Shipments | Revenue | Returns | Tickets | Staff Performance | Customers
- Date range presets: Today | Yesterday | Last 7 days | Last 30 days | Last 90 days | Custom (date picker)
- Export format selector: CSV | JSON | PDF
- Advanced filters per report type (shown/hidden based on selected type)
- "Generate Report" button → triggers download; loading state during generation
- "Scheduled Reports" section (Pro+): configure recurring report email (daily/weekly/monthly, to recipient list)

Add "Reports" nav item for TENANT_ADMIN, TENANT_MANAGER, TENANT_FINANCE.

---

### 25.10 Live Operational Map (Command Center)

**Status: Fauward mentions Google Maps for routing but has no live ops map. Must add for Pro+.**

A real-time map showing where all active shipments are right now. Primary tool for ops managers monitoring the day's deliveries.

#### Backend

Add to `driver.routes.ts`:
```
GET /api/v1/driver/locations    — returns all drivers with their last known location; roles: TENANT_ADMIN, TENANT_MANAGER; response: [{ driverId, driverName, lat, lng, lastUpdated, activeShipments: number, vehicleType }]
```

Add to `shipments.routes.ts`:
```
GET /api/v1/shipments/live-map  — returns active shipments (IN_TRANSIT, OUT_FOR_DELIVERY) with last location event; response: [{ shipmentId, trackingNumber, lat, lng, status, driverName, recipientName, estimatedDelivery }]
```

Driver location update: add to `driver.routes.ts`:
```
PATCH /api/v1/driver/location   — body: { lat, lng, accuracy }; driver sends every 60s when route is active; stores in Redis (key: driver:{driverId}:location, TTL: 5min) and appends to ShipmentEvent for current active stop
```

#### Tenant Portal UI

Create `apps/tenant-portal/src/pages/operations/LiveMapPage.tsx` (Pro+ gated):
- Full-width Google Maps instance (use `@vis.gl/react-google-maps`)
- Driver markers: distinct coloured pins per driver, click to see driver info card (name, vehicle, stops remaining)
- Shipment cluster markers: group nearby shipments, expand on click
- Filter sidebar: by driver, by status, by route
- Live refresh every 60s (React Query `refetchInterval`)
- Status legend

Add "Live Map" nav item for TENANT_ADMIN, TENANT_MANAGER (Pro+).

---

### 25.11 Fleet & Warehouse / Depot Management

**Status: Fauward has `Vehicle` and `Driver` models in the schema but no management UI or backend routes. Must add (at minimum basic CRUD; advanced capacity planning in V2).**

#### Backend — Create `apps/backend/src/modules/fleet/fleet.routes.ts`

```
GET    /api/v1/fleet/vehicles          — list tenant vehicles with driver assignment, availability
POST   /api/v1/fleet/vehicles          — create vehicle: { registration, type, capacityKg, capacityM3, make, model }
PATCH  /api/v1/fleet/vehicles/:id      — update vehicle details / assign driver / set available
DELETE /api/v1/fleet/vehicles/:id      — soft delete

GET    /api/v1/fleet/drivers           — list drivers for tenant: name, vehicle, today's route, stop count, deliveries completed today
POST   /api/v1/fleet/drivers           — create driver profile for an existing TENANT_DRIVER user: { userId, licenceNumber, vehicleId }
PATCH  /api/v1/fleet/drivers/:id       — update driver: vehicle assignment, licence, availability
```

Register in `app.ts` as `await registerFleetRoutes(app)`.

#### Tenant Portal UI

Create `apps/tenant-portal/src/pages/fleet/`:
- `FleetPage.tsx` — Tabs: Drivers | Vehicles
  - Drivers tab: table of drivers with today's stats (stops assigned, completed, on-time rate), vehicle assigned, availability toggle
  - Vehicles tab: table with registration, type, capacity, assigned driver, availability status, edit/delete actions
- "Add Driver" flow: select existing TENANT_DRIVER user + assign vehicle + enter licence number
- "Add Vehicle" form: registration, type (VAN/TRUCK/MOTORBIKE/BICYCLE/CARGO_BIKE), capacity fields, make/model

Add "Fleet" nav item for TENANT_ADMIN, TENANT_MANAGER.

---

### 25.12 POD Viewer (Staff Admin)

**Status: Fauward has POD capture (driver app + backend upload). But staff cannot view submitted PODs in the admin portal. Must add.**

#### Tenant Portal UI

In `pages/shipments/ShipmentDetailPage.tsx`, in the existing **Documents** tab:

Add a "Proof of Delivery" section that appears when `shipment.status === 'DELIVERED'`:
- Shows each `PodAsset` record: photo thumbnails (click to full-screen lightbox), signature image
- Recipient name, delivery notes, captured timestamp, captured by (driver name)
- "Download POD" button → generates a PDF page with all photos + signature + delivery details

Create `components/shipments/PODViewer.tsx`:
- Props: `podAssets: PodAsset[], recipientName: string, deliveredAt: DateTime, capturedBy: string`
- Photo grid: 2-column on desktop, 1 on mobile; click to open full-screen modal
- Signature: displayed at fixed 300×150px with border
- Download button: calls `POST /api/v1/documents/pod/:shipmentId` which generates a one-page PDF

Add backend route:
```
GET /api/v1/shipments/:id/pod       — returns { podAssets, recipientName, deliveredAt, capturedBy }
POST /api/v1/documents/pod/:shipmentId  — generates POD summary PDF, returns signed URL
```

---

### 25.13 Inline Status Updates in Shipment Table

**Status: Fauward's ShipmentTable.tsx exists but inline row actions are not specified. Must add.**

In `components/shipments/ShipmentTable.tsx`, add an inline "Quick Update" action to each row:
- A "Status" dropdown in the table row showing the current status
- Clicking opens a popover with valid next states (same `ALLOWED_TRANSITIONS` logic as the detail page)
- If next state is DELIVERED: show mini POD modal inline (photo upload + recipient name) before confirming
- If next state is FAILED_DELIVERY: show reason selector inline
- On confirm: calls `PATCH /api/v1/shipments/:id/status`, refreshes the row optimistically

Also add inline "Assign Driver" dropdown directly in the table row for unassigned shipments (PROCESSING status only).

**Performance:** these dropdowns must be lazy — don't render all options for every row. Use a single shared popover component that mounts on the specific row being interacted with.

---

### 25.14 Individual User Suspension (Per Tenant)

**Status: Fauward suspends entire tenants. Individual user suspension within a tenant is not wired. The `isActive` field exists on the `User` model. Must wire it up.**

#### Backend

In `users.routes.ts` (to be created per section 24.10 Priority 2):
```
PATCH /api/v1/users/:id/suspend    — set isActive=false; roles: TENANT_ADMIN only; cannot suspend self; cannot suspend another TENANT_ADMIN without SUPER_ADMIN; audit log entry
PATCH /api/v1/users/:id/activate   — set isActive=true; roles: TENANT_ADMIN only
```

In `authenticate.ts` middleware: after verifying JWT, check `user.isActive === true`. If false, return 401 `{ error: "Account suspended", code: "USER_SUSPENDED" }`. This means suspended users cannot use any API even if they have a valid token (their next request after suspension will fail; their current session will expire within 15 minutes at most, since access tokens are 15min).

#### Tenant Portal UI

In `TeamPage.tsx` (to be created per section 24.10 Priority 11B):
- Status column: "Active" / "Suspended" badge
- Three-dot action menu per row: "Change Role" | "Suspend" | "Activate" | "Remove"
- Suspend confirmation dialog: "This user will immediately lose access. Continue?"

---

### 25.15 Performance Patterns to Enforce

**Status: Not explicitly specified in Fauward's spec but present in TrenyConnect and required for acceptable performance at scale.**

Apply these patterns across all frontend apps:

#### Lazy Tab Loading

In `apps/tenant-portal/src/pages/shipments/ShipmentDetailPage.tsx` and any other tab-heavy pages, lazy-load tab content:

```typescript
// Only mount tab component when that tab is first clicked
const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(['timeline']));
// On tab click: setVisitedTabs(prev => new Set([...prev, tabId]))
// Render tab content only if visitedTabs.has(tabId)
```

Similarly apply to the super admin `TenantDetailTabs.tsx` and settings page tabs.

#### Debounced Search

All search inputs must debounce before querying:
```typescript
// Use a 300ms debounce on all filter inputs that trigger API calls
// Do NOT fire a new request on every keystroke
```

Apply to: `ShipmentFilterBar.tsx`, `TicketsListPage.tsx`, `ReturnsListPage.tsx`, `TeamPage.tsx`, `super-admin TenantsListPage.tsx`.

#### Virtual Scrolling for Large Tables

For tables that can exceed 100+ rows (super admin tenant list, shipment history export preview, audit log), use TanStack Virtual (`@tanstack/react-virtual`) alongside the existing TanStack Table.

Apply to: `apps/super-admin` tenant list, audit log table, queue message list.

#### React Query Polling Intervals

| Data | Interval |
|------|---------|
| Unread notification count | 30s |
| Live map driver locations | 60s |
| Activity timeline | 60s |
| Queue stats (super admin) | 10s |
| System health metrics | 15s |

---

### 25.16 Summary of Additions (for Codex build order)

Append these to the Priority list in section 24.10. Build after all Priority 1–15 items are done.

| Priority | Feature | Key New Files | DB Changes |
|----------|---------|---------------|------------|
| 16 | Returns management | `modules/returns/returns.routes.ts`, `pages/returns/ReturnsListPage.tsx`, `pages/returns/ReturnDetailPage.tsx` | New `ReturnRequest` model + enum `ReturnStatus`, `ReturnReason` |
| 17 | Support tickets | `modules/support/support.routes.ts`, `pages/support/TicketsListPage.tsx`, `pages/support/TicketDetailPage.tsx` | New `SupportTicket`, `TicketMessage` models + enums |
| 18 | Email template admin | `pages/settings/EmailSettingsTab.tsx`, add routes to `tenant.routes.ts` | New `EmailTemplateConfig` model; add `emailFromName`, `emailReplyTo`, `opsEmailRecipients` to `TenantSettings` |
| 19 | Full tenant pricing system | `modules/pricing/` (entire module — see 25.4.14), `pages/pricing/` (15 pages — see 25.4.15) | New models: `Surcharge`, `PricingRule`, `PromoCode`, `WeightDiscountTier`; add to `TenantSettings`: `serviceTierConfig`, `insuranceConfig`, `taxConfig`, `dimensionalDivisor`, `weightTierConflictPolicy`, `quoteValidityMinutes`, `showPriceBreakdownToCustomer`, `autoInvoiceOnDelivery` |
| 20 | QR scanning in driver app | `apps/driver/src/components/driver/QRScanner.tsx` | None — install `@zxing/browser` |
| 21 | Shipping label print page | `modules/documents/label.routes.ts`, `documents/templates/label.html` | None — QR code via `qrcode` package |
| 22 | In-app notification center | `components/shared/NotificationCenter.tsx`, notification routes in new `modules/notifications/notifications.routes.ts` | New `InAppNotification` model |
| 23 | Activity timeline | `pages/activity/ActivityTimelinePage.tsx`, add `GET /analytics/activity` to `analytics.routes.ts` | None |
| 24 | Analytics: lifecycle funnel + KPI trends + SLA + exceptions | Update `analytics.routes.ts` (new query blocks) | Add `slaDeliveryHours Int @default(72)` to `TenantSettings` |
| 25 | Animated KPI cards | `components/ui/AnimatedNumber.tsx` | None |
| 26 | Dedicated reports page | `pages/reports/ReportsPage.tsx`, add `GET /reports/*` routes to `analytics.routes.ts` | None |
| 27 | Live operational map | `pages/operations/LiveMapPage.tsx`, add `GET /driver/locations` + `PATCH /driver/location` + `GET /shipments/live-map` to existing route files | None — driver locations stored in Redis |
| 28 | Fleet & vehicle management | `modules/fleet/fleet.routes.ts`, `pages/fleet/FleetPage.tsx` | None — `Driver` and `Vehicle` models already exist in schema |
| 29 | POD viewer for staff | `components/shipments/PODViewer.tsx`, `POST /api/v1/documents/pod/:shipmentId` | None |
| 30 | Inline status update in shipment table | Update `ShipmentTable.tsx` only | None |
| 31 | Individual user suspension | Add `PATCH /users/:id/suspend` + `/activate` to `users.routes.ts`; update `authenticate.ts`; update `TeamPage.tsx` | None — `isActive` field already exists on `User` model |
| 32 | Performance patterns | Update `ShipmentDetailPage.tsx` (lazy tabs), `ShipmentFilterBar.tsx` (debounce), super-admin tables (virtual scroll) | None |

---

*Fauward — Root Implementation Guide*
*Document owner: Temitope Agbola, Treny Limited*
*Merged from: System Design v1 · Platform Spec v3 · Master Spec v1 · Frontend Design Spec*
*Implementation status audit: April 2026*
*TrenyConnect feature audit: April 2026*
