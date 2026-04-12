# Data Model — Complete Schema

> Authoritative reference for all database tables. The live Prisma schema lives at `apps/backend/prisma/schema.prisma` (893 lines, all 35 models present). This document is the human-readable companion.

**Navigation →** [System Architecture](./system-architecture.md) · [Logistics Core](./logistics-core.md) · [← README](../README.md)

---

## Contents

1. [Core Tables](#1-core-tables) — Tenants, Users, Organisations, Shipments
2. [Operations Tables](#2-operations-tables) — Drivers, Vehicles, Routes, POD, Rate Cards
3. [Finance Tables](#3-finance-tables) — Invoices, Payments, Refunds, Credit Notes
4. [CRM Tables](#4-crm-tables) — Leads, Quotes
5. [Platform & Integration Tables](#5-platform--integration-tables) — Subscriptions, API Keys, Webhooks, Audit Log, and more

---

## 1. Core Tables

### `tenants`

```sql
CREATE TABLE tenants (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 VARCHAR(255) NOT NULL,
  slug                 VARCHAR(100) UNIQUE NOT NULL,
  custom_domain        VARCHAR(255) UNIQUE,
  domain_verified      BOOLEAN     DEFAULT FALSE,
  plan                 VARCHAR(20)  DEFAULT 'TRIALING',
  status               VARCHAR(20)  DEFAULT 'TRIALING',
  infrastructure_type  VARCHAR(20)  DEFAULT 'SHARED',
  region               VARCHAR(50)  DEFAULT 'uk_europe',
  logo_url             TEXT,
  primary_color        VARCHAR(7)   DEFAULT '#0D1F3C',
  accent_color         VARCHAR(7)   DEFAULT '#D97706',
  brand_name           VARCHAR(255),
  is_rtl               BOOLEAN     DEFAULT FALSE,
  default_currency     CHAR(3)     DEFAULT 'GBP',
  default_language     VARCHAR(10)  DEFAULT 'en',
  timezone             VARCHAR(50)  DEFAULT 'Europe/London',
  show_powered_by      BOOLEAN     DEFAULT TRUE,
  sms_enabled          BOOLEAN     DEFAULT FALSE,
  max_staff            INT         DEFAULT 3,
  max_shipments_pm     INT         DEFAULT 300,
  max_organisations    INT         DEFAULT 10,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);
```

### `users`

```sql
CREATE TABLE users (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        REFERENCES tenants(id),
  organisation_id UUID        REFERENCES organisations(id),
  branch_id       UUID        REFERENCES branches(id),
  email           VARCHAR(255) NOT NULL,
  phone           VARCHAR(50),
  password_hash   TEXT,
  role            VARCHAR(30)  NOT NULL,
  first_name      VARCHAR(100),
  last_name       VARCHAR(100),
  avatar_url      TEXT,
  is_active       BOOLEAN     DEFAULT TRUE,
  mfa_enabled     BOOLEAN     DEFAULT FALSE,
  mfa_secret      TEXT,
  last_login      TIMESTAMPTZ,
  invited_by      UUID        REFERENCES users(id),
  sso_provider    VARCHAR(30),
  sso_subject     VARCHAR(255),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, email)
);
```

### `organisations` *(B2B client companies)*

```sql
CREATE TABLE organisations (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        REFERENCES tenants(id),
  name             VARCHAR(255) NOT NULL,
  company_number   VARCHAR(100),
  tax_number       VARCHAR(100),
  billing_email    VARCHAR(255),
  billing_address  JSONB,
  payment_terms    INT         DEFAULT 0,
  credit_limit     DECIMAL(12,2) DEFAULT 0,
  billing_owner_id UUID        REFERENCES users(id),
  notes            TEXT,
  is_active        BOOLEAN     DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
```

### `shipments`

```sql
CREATE TYPE shipment_status AS ENUM (
  'PENDING', 'PROCESSING', 'PICKED_UP', 'IN_TRANSIT',
  'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED_DELIVERY',
  'RETURNED', 'CANCELLED', 'EXCEPTION'
);

CREATE TABLE shipments (
  id                     UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID           REFERENCES tenants(id),
  branch_id              UUID           REFERENCES branches(id),
  tracking_number        VARCHAR(50)    UNIQUE NOT NULL,
  customer_id            UUID           REFERENCES users(id),
  organisation_id        UUID           REFERENCES organisations(id),
  assigned_staff_id      UUID           REFERENCES users(id),
  assigned_driver_id     UUID           REFERENCES drivers(id),
  vehicle_id             UUID           REFERENCES vehicles(id),
  route_id               UUID           REFERENCES routes(id),
  carrier_booking_id     UUID           REFERENCES carrier_bookings(id),
  status                 shipment_status NOT NULL DEFAULT 'PENDING',
  origin_address         JSONB          NOT NULL,
  destination_address    JSONB          NOT NULL,
  service_tier           VARCHAR(20)    DEFAULT 'STANDARD',
  service_zone_id        UUID           REFERENCES service_zones(id),
  estimated_delivery     TIMESTAMPTZ,
  actual_delivery        TIMESTAMPTZ,
  price                  DECIMAL(12,2),
  currency               CHAR(3)        DEFAULT 'GBP',
  weight_kg              DECIMAL(8,3),
  notes                  TEXT,
  special_instructions   TEXT,
  insurance_value        DECIMAL(12,2),
  customs_declaration_id UUID           REFERENCES customs_declarations(id),
  idempotency_key        VARCHAR(255)   UNIQUE,
  created_at             TIMESTAMPTZ    DEFAULT NOW(),
  updated_at             TIMESTAMPTZ    DEFAULT NOW()
);
```

### `shipment_items` *(packages within a shipment)*

```sql
CREATE TABLE shipment_items (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID         REFERENCES tenants(id),
  shipment_id    UUID         REFERENCES shipments(id) ON DELETE CASCADE,
  description    VARCHAR(255),
  quantity       INT          DEFAULT 1,
  weight_kg      DECIMAL(8,3),
  length_cm      DECIMAL(8,2),
  width_cm       DECIMAL(8,2),
  height_cm      DECIMAL(8,2),
  declared_value DECIMAL(12,2),
  hs_code        VARCHAR(20),
  is_dangerous   BOOLEAN      DEFAULT FALSE,
  created_at     TIMESTAMPTZ  DEFAULT NOW()
);
```

### `shipment_events` *(immutable timeline)*

```sql
CREATE TABLE shipment_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        REFERENCES tenants(id),
  shipment_id UUID        REFERENCES shipments(id) ON DELETE CASCADE,
  status      VARCHAR(30) NOT NULL,
  location    JSONB,
  notes       TEXT,
  actor_id    UUID        REFERENCES users(id),
  actor_type  VARCHAR(20),
  source      VARCHAR(20) DEFAULT 'MANUAL',
  timestamp   TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 2. Operations Tables

### `drivers`

```sql
CREATE TABLE drivers (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID         REFERENCES tenants(id),
  user_id          UUID         REFERENCES users(id) UNIQUE,
  licence_number   VARCHAR(100),
  licence_expiry   DATE,
  vehicle_id       UUID         REFERENCES vehicles(id),
  is_available     BOOLEAN      DEFAULT TRUE,
  current_lat      DECIMAL(10,8),
  current_lng      DECIMAL(11,8),
  last_location_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  DEFAULT NOW()
);
```

### `vehicles`

```sql
CREATE TABLE vehicles (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        REFERENCES tenants(id),
  registration VARCHAR(50),
  make         VARCHAR(100),
  model        VARCHAR(100),
  year         INT,
  type         VARCHAR(30),  -- VAN | TRUCK | MOTORCYCLE | BICYCLE
  capacity_kg  DECIMAL(8,2),
  capacity_m3  DECIMAL(8,2),
  is_active    BOOLEAN     DEFAULT TRUE,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

### `routes` and `route_stops`

```sql
CREATE TABLE routes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        REFERENCES tenants(id),
  driver_id    UUID        REFERENCES drivers(id),
  vehicle_id   UUID        REFERENCES vehicles(id),
  date         DATE        NOT NULL,
  status       VARCHAR(20) DEFAULT 'PLANNED',
  started_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE route_stops (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id     UUID        REFERENCES routes(id) ON DELETE CASCADE,
  shipment_id  UUID        REFERENCES shipments(id),
  stop_order   INT         NOT NULL,
  type         VARCHAR(20) NOT NULL,  -- PICKUP | DELIVERY
  estimated_at TIMESTAMPTZ,
  arrived_at   TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
```

### `pod_assets` *(Proof of Delivery)*

```sql
CREATE TABLE pod_assets (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        REFERENCES tenants(id),
  shipment_id UUID        REFERENCES shipments(id),
  type        VARCHAR(20) NOT NULL,  -- PHOTO | SIGNATURE | DOCUMENT
  file_url    TEXT        NOT NULL,
  file_size   INT,
  captured_by UUID        REFERENCES users(id),
  captured_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `service_zones` and `rate_cards`

```sql
CREATE TABLE service_zones (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        REFERENCES tenants(id),
  name        VARCHAR(100) NOT NULL,
  zone_type   VARCHAR(20)  DEFAULT 'NATIONAL',
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE rate_cards (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID          REFERENCES tenants(id),
  name           VARCHAR(100),
  origin_zone_id UUID          REFERENCES service_zones(id),
  dest_zone_id   UUID          REFERENCES service_zones(id),
  service_tier   VARCHAR(20),
  base_price     DECIMAL(12,2),
  price_per_kg   DECIMAL(10,4),
  currency       CHAR(3),
  is_active      BOOLEAN       DEFAULT TRUE,
  effective_from DATE,
  effective_to   DATE,
  created_at     TIMESTAMPTZ   DEFAULT NOW()
);
```

---

## 3. Finance Tables

### `invoices`

```sql
CREATE TABLE invoices (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        REFERENCES tenants(id),
  invoice_number   VARCHAR(50) UNIQUE NOT NULL,
  customer_id      UUID        REFERENCES users(id),
  organisation_id  UUID        REFERENCES organisations(id),
  shipment_id      UUID        REFERENCES shipments(id),
  line_items       JSONB       NOT NULL,
  subtotal         DECIMAL(12,2),
  tax_rate         DECIMAL(5,2)  DEFAULT 0,
  tax_amount       DECIMAL(12,2) DEFAULT 0,
  discount_amount  DECIMAL(12,2) DEFAULT 0,
  total            DECIMAL(12,2),
  currency         CHAR(3),
  status           VARCHAR(20) DEFAULT 'DRAFT',
  due_date         DATE,
  payment_terms    INT         DEFAULT 0,
  notes            TEXT,
  e_invoice_ref    VARCHAR(255),
  e_invoice_status VARCHAR(30),
  sent_at          TIMESTAMPTZ,
  paid_at          TIMESTAMPTZ,
  voided_at        TIMESTAMPTZ,
  created_by       UUID        REFERENCES users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
```

### `payments`

```sql
CREATE TABLE payments (
  id               UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID          REFERENCES tenants(id),
  invoice_id       UUID          REFERENCES invoices(id),
  shipment_id      UUID          REFERENCES shipments(id),
  customer_id      UUID          REFERENCES users(id),
  amount           DECIMAL(12,2) NOT NULL,
  currency         CHAR(3)       NOT NULL,
  method           VARCHAR(30),  -- STRIPE | PAYSTACK | BANK_TRANSFER | CASH | M_PESA
  status           VARCHAR(20)   DEFAULT 'PENDING',
  gateway_ref      VARCHAR(255),
  gateway_response JSONB,
  idempotency_key  VARCHAR(255)  UNIQUE,
  refunded_amount  DECIMAL(12,2) DEFAULT 0,
  created_at       TIMESTAMPTZ   DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   DEFAULT NOW()
);
```

### `refunds`

```sql
CREATE TABLE refunds (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID          REFERENCES tenants(id),
  payment_id   UUID          REFERENCES payments(id),
  amount       DECIMAL(12,2) NOT NULL,
  reason       TEXT,
  gateway_ref  VARCHAR(255),
  status       VARCHAR(20)   DEFAULT 'PENDING',
  initiated_by UUID          REFERENCES users(id),
  created_at   TIMESTAMPTZ   DEFAULT NOW()
);
```

### `credit_notes`

```sql
CREATE TABLE credit_notes (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID          REFERENCES tenants(id),
  invoice_id      UUID          REFERENCES invoices(id),
  customer_id     UUID          REFERENCES users(id),
  organisation_id UUID          REFERENCES organisations(id),
  credit_number   VARCHAR(50)   UNIQUE NOT NULL,
  amount          DECIMAL(12,2) NOT NULL,
  currency        CHAR(3),
  reason          TEXT,
  applied_to      UUID          REFERENCES invoices(id),
  created_at      TIMESTAMPTZ   DEFAULT NOW()
);
```

### `currency_rates`

```sql
CREATE TABLE currency_rates (
  id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency CHAR(3)       NOT NULL,
  to_currency   CHAR(3)       NOT NULL,
  rate          DECIMAL(18,8) NOT NULL,
  source        VARCHAR(30)   DEFAULT 'OPEN_EXCHANGE',
  fetched_at    TIMESTAMPTZ   DEFAULT NOW(),
  UNIQUE(from_currency, to_currency, fetched_at::DATE)
);
```

---

## 4. CRM Tables

### `leads`

```sql
CREATE TABLE leads (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        REFERENCES tenants(id),
  company      VARCHAR(255),
  contact_name VARCHAR(255),
  email        VARCHAR(255),
  phone        VARCHAR(50),
  stage        VARCHAR(30)  DEFAULT 'PROSPECT',
  -- PROSPECT | QUOTED | NEGOTIATING | WON | LOST
  assigned_to  UUID        REFERENCES users(id),
  source       VARCHAR(50),
  notes        TEXT,
  won_at       TIMESTAMPTZ,
  lost_at      TIMESTAMPTZ,
  lost_reason  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);
```

### `quotes`

```sql
CREATE TABLE quotes (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        REFERENCES tenants(id),
  quote_number    VARCHAR(50) UNIQUE NOT NULL,
  lead_id         UUID        REFERENCES leads(id),
  customer_id     UUID        REFERENCES users(id),
  organisation_id UUID        REFERENCES organisations(id),
  shipment_data   JSONB       NOT NULL,
  line_items      JSONB,
  subtotal        DECIMAL(12,2),
  total           DECIMAL(12,2),
  currency        CHAR(3),
  status          VARCHAR(20) DEFAULT 'DRAFT',
  -- DRAFT | SENT | ACCEPTED | REJECTED | EXPIRED
  valid_until     TIMESTAMPTZ,
  accepted_at     TIMESTAMPTZ,
  rejected_at     TIMESTAMPTZ,
  shipment_id     UUID        REFERENCES shipments(id),  -- linked on acceptance
  created_by      UUID        REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 5. Platform & Integration Tables

### `subscriptions`

```sql
CREATE TABLE subscriptions (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID        REFERENCES tenants(id),
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
  cancel_at_period_end   BOOLEAN     DEFAULT FALSE,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);
```

### `api_keys`

```sql
CREATE TABLE api_keys (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        REFERENCES tenants(id),
  name       VARCHAR(100),
  key_hash   TEXT        UNIQUE NOT NULL,
  key_prefix VARCHAR(16) NOT NULL,
  scopes     TEXT[]      DEFAULT ARRAY['read:shipments','write:shipments'],
  rate_limit INT         DEFAULT 500,
  last_used  TIMESTAMPTZ,
  is_active  BOOLEAN     DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `webhook_endpoints` and `webhook_deliveries`

```sql
CREATE TABLE webhook_endpoints (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        REFERENCES tenants(id),
  url        TEXT        NOT NULL,
  secret     TEXT        NOT NULL,
  events     TEXT[]      NOT NULL,
  is_active  BOOLEAN     DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE webhook_deliveries (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint_id     UUID        REFERENCES webhook_endpoints(id),
  event_type      VARCHAR(100) NOT NULL,
  payload         JSONB       NOT NULL,
  response_status INT,
  response_body   TEXT,
  duration_ms     INT,
  attempt         INT         DEFAULT 1,
  status          VARCHAR(20) DEFAULT 'PENDING',
  next_retry_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### `shipment_documents`

```sql
CREATE TABLE shipment_documents (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        REFERENCES tenants(id),
  shipment_id  UUID        REFERENCES shipments(id),
  type         VARCHAR(50) NOT NULL,
  -- DELIVERY_NOTE | MANIFEST | AWB | BOL | POD | INVOICE
  template_id  VARCHAR(50),
  file_url     TEXT        NOT NULL,
  file_size    INT,
  expires_at   TIMESTAMPTZ,
  generated_by UUID        REFERENCES users(id),
  generated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### `usage_records`

```sql
CREATE TABLE usage_records (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        REFERENCES tenants(id),
  month       CHAR(7)     NOT NULL,
  shipments   INT         DEFAULT 0,
  api_calls   INT         DEFAULT 0,
  sms_sent    INT         DEFAULT 0,
  emails_sent INT         DEFAULT 0,
  storage_mb  INT         DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, month)
);
```

### `notification_log`

```sql
CREATE TABLE notification_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        REFERENCES tenants(id),
  user_id      UUID        REFERENCES users(id),
  shipment_id  UUID        REFERENCES shipments(id),
  channel      VARCHAR(10) NOT NULL,   -- EMAIL | SMS | PUSH
  event        VARCHAR(50) NOT NULL,
  status       VARCHAR(20) DEFAULT 'QUEUED',
  provider_ref VARCHAR(255),
  error        TEXT,
  sent_at      TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
```

### `outbox_events`

```sql
CREATE TABLE outbox_events (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type VARCHAR(50)  NOT NULL,
  aggregate_id   UUID         NOT NULL,
  event_type     VARCHAR(100) NOT NULL,
  payload        JSONB        NOT NULL,
  published      BOOLEAN      DEFAULT FALSE,
  published_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  DEFAULT NOW()
);
```

### `audit_log`

```sql
CREATE TABLE audit_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        REFERENCES tenants(id),
  actor_id      UUID        REFERENCES users(id),
  actor_type    VARCHAR(20) DEFAULT 'USER',
  actor_ip      INET,
  session_id    UUID,
  action        VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id   UUID,
  before_state  JSONB,
  after_state   JSONB,
  metadata      JSONB,
  timestamp     TIMESTAMPTZ  DEFAULT NOW()
);
```

### Enterprise-only tables

```sql
-- Multi-branch support
CREATE TABLE branches (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        REFERENCES tenants(id),
  name       VARCHAR(255),
  region     VARCHAR(50),
  address    JSONB,
  manager_id UUID        REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SSO providers (SAML / OIDC)
CREATE TABLE sso_providers (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        REFERENCES tenants(id),
  provider_type VARCHAR(20) NOT NULL,  -- SAML | OIDC
  entity_id     TEXT,
  sso_url       TEXT,
  certificate   TEXT,
  attribute_map JSONB,
  is_active     BOOLEAN     DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Accounting integrations
CREATE TABLE accounting_connections (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        REFERENCES tenants(id),
  provider      VARCHAR(30) NOT NULL,
  -- XERO | QUICKBOOKS | SAGE | SAP | ZOHO
  access_token  TEXT,
  refresh_token TEXT,
  token_expiry  TIMESTAMPTZ,
  tenant_ref    VARCHAR(255),
  is_active     BOOLEAN     DEFAULT TRUE,
  last_sync     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Carrier connections
CREATE TABLE carrier_connections (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID        REFERENCES tenants(id),
  carrier    VARCHAR(50) NOT NULL,
  credentials JSONB,
  is_active  BOOLEAN     DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Carrier bookings
CREATE TABLE carrier_bookings (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID        REFERENCES tenants(id),
  shipment_id      UUID        REFERENCES shipments(id),
  carrier          VARCHAR(50) NOT NULL,
  booking_ref      VARCHAR(255),
  carrier_tracking VARCHAR(255),
  status           VARCHAR(30),
  booking_data     JSONB,
  booked_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Customs declarations
CREATE TABLE customs_declarations (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID         REFERENCES tenants(id),
  shipment_id      UUID         REFERENCES shipments(id),
  declaration_type VARCHAR(30),
  declaration_ref  VARCHAR(255),
  hs_codes         JSONB,
  total_value      DECIMAL(12,2),
  currency         CHAR(3),
  status           VARCHAR(30)  DEFAULT 'DRAFT',
  submitted_at     TIMESTAMPTZ,
  cleared_at       TIMESTAMPTZ,
  documents        JSONB
);
```

### `idempotency_keys`

```sql
CREATE TABLE idempotency_keys (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        REFERENCES tenants(id),
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

*Part of the [Fauward documentation](../README.md)*
