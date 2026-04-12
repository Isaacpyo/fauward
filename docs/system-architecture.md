# Fauward — System Architecture

---

## 7.1 Architecture Style

**Modular monolith** initially, designed for seamless extraction into microservices as scale demands. This balances development velocity with long-term scalability.

---

## 7.2 High-Level Architecture

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

---

## 7.3 Multi-Tenancy Architecture

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

---

## 7.4 Event-Driven Architecture

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

---

## 7.5 Idempotency

Every state-changing API endpoint accepts an `Idempotency-Key` header. Duplicate requests return the cached response without re-executing. Webhook deliveries include `X-Delivery-ID` for consumer-side deduplication.
