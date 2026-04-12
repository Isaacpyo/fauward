# System Architecture

> Architecture style · High-level diagram · Multi-tenancy · Event-driven patterns · Idempotency

**Navigation →** [Data Model](./data-model.md) · [API Design](./api.md) · [Infrastructure & Security](./infrastructure-security.md) · [← README](../README.md)

---

## Contents

1. [Architecture Style](#1-architecture-style)
2. [High-Level Diagram](#2-high-level-diagram)
3. [Multi-Tenancy Architecture](#3-multi-tenancy-architecture)
4. [Event-Driven Architecture](#4-event-driven-architecture)
5. [Idempotency](#5-idempotency)

---

## 1. Architecture Style

**Modular monolith** — designed for seamless extraction into microservices as scale demands.

> This deliberately balances **development velocity** in the early stages with **long-term scalability**. Each domain module is independently extractable. See [Infrastructure → Scaling Strategy](./infrastructure-security.md#scaling-strategy) for phase-by-phase plan.

---

## 2. High-Level Diagram

```
┌───────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                          │
│                                                               │
│  ┌─────────────┐  ┌─────────────┐  ┌────────┐  ┌──────────┐  │
│  │  Marketing  │  │   Tenant    │  │ Driver │  │  Super   │  │
│  │    Site     │  │   Portal    │  │  PWA   │  │  Admin   │  │
│  │ (Next.js)   │  │ (React 18)  │  │(React) │  │ (React)  │  │
│  └──────┬──────┘  └──────┬──────┘  └───┬────┘  └────┬─────┘  │
└─────────┼────────────────┼─────────────┼────────────┼─────────┘
          │ HTTPS          │ HTTPS / WS  │            │
┌─────────▼────────────────▼─────────────▼────────────▼─────────┐
│                      API GATEWAY LAYER                         │
│          Rate Limiting · CORS · Auth Middleware · Logging      │
└──────────────────────────────┬─────────────────────────────────┘
                               │
┌──────────────────────────────▼─────────────────────────────────┐
│                    BACKEND SERVICE LAYER                        │
│              Node.js · Fastify · TypeScript · Prisma            │
│                                                                 │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────────┐  │
│  │   Auth   │ │Shipment  │ │ Tracking │ │     Payment       │  │
│  │ Service  │ │ Service  │ │ Service  │ │     Service       │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────────┐  │
│  │   User   │ │  Notif.  │ │ Finance  │ │   CRM / Docs      │  │
│  │ Service  │ │ Service  │ │ Service  │ │   Service         │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────────┘  │
└──────────────────────────────┬─────────────────────────────────┘
                               │
┌──────────────────────────────▼─────────────────────────────────┐
│                    DATA & MESSAGING LAYER                       │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────────────┐    │
│  │PostgreSQL│  │  Redis   │  │       BullMQ Queues        │    │
│  │(Supabase)│  │(Upstash) │  │ notifications · webhooks   │    │
│  │          │  │          │  │ analytics · outbox         │    │
│  └──────────┘  └──────────┘  └────────────────────────────┘    │
│                                                                 │
│  ┌──────────┐  ┌────────────────────────────────────────────┐  │
│  │  AWS S3  │  │           External Integrations            │  │
│  │ (Files)  │  │  Stripe · Paystack · SendGrid · Twilio     │  │
│  │          │  │  Google Maps · M-Pesa · Flutterwave        │  │
│  └──────────┘  └────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Multi-Tenancy Architecture

### Shared Infrastructure *(Starter + Pro)*

- One PostgreSQL database; every table scoped with `tenant_id`
- **Prisma middleware** enforces isolation on every query — no bypass path
- `AsyncLocalStorage` carries tenant context through the full request lifecycle

### Dedicated Infrastructure *(Enterprise)*

- Each Enterprise tenant gets their own PostgreSQL instance, Redis cluster, and container group
- Same application code — completely isolated data
- Data residency configured per tenant

### Tenant Context Flow

```
Incoming request
       │
  TenantResolver middleware
       │
       ├─ Subdomain?      → SELECT * FROM tenants WHERE slug = X
       ├─ Custom domain?  → SELECT * FROM tenants WHERE custom_domain = X
       ├─ API key?        → SELECT * FROM api_keys JOIN tenants WHERE key_hash = X
       └─ SSO token?      → SELECT * FROM tenants WHERE sso_provider_id = X
       │
  Tenant attached to AsyncLocalStorage
       │
  All Prisma queries auto-scoped via middleware
```

---

## 4. Event-Driven Architecture

### Outbox Pattern

```
Business action  (e.g. shipment status update)
       │
  Service writes to DB  ─── transactional
       │
       └── Write to outbox_events table  (same transaction)
                   │
          Outbox publisher  (polls every 1 s)
                   │
       ┌───────────┼───────────────┐
       ▼           ▼               ▼
  notifications   webhooks      analytics
     :queue         :queue        :queue
  (SendGrid /   (tenant endpoint  (aggregate
   Twilio)       HMAC signed)      counts)
```

> The **outbox pattern** guarantees events are published even if the process crashes between the DB write and the queue publish. Events are never silently lost.

### Dead Letter Queue

Failed jobs (3 attempts) → moved to `dlq:{queue_name}`.
CloudWatch alarm fires if DLQ depth > 10.

---

## 5. Idempotency

Every state-changing API endpoint accepts an `Idempotency-Key` header.

- **Duplicate requests** return the cached response without re-executing the handler
- **Webhook deliveries** include `X-Delivery-ID` for consumer-side deduplication
- Keys expire after **24 hours**
- Applied to: `POST /shipments`, `POST /invoices`, `POST /payments/intent`, `POST /quotes`

See [API Design → Idempotency](./api.md#idempotency) for implementation details.

---

*Part of the [Fauward documentation](../README.md)*
