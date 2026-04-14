# System Architecture

> Architecture style · Layer-by-layer breakdown · Multi-tenancy · Event-driven patterns · Idempotency

**Navigation →** [Data Model](./data-model.md) · [API Design](./api.md) · [Infrastructure & Security](./infrastructure-security.md) · [← README](../README.md)

---

## Contents

1. [Architecture Style](#1-architecture-style)
2. [Full System Overview](#2-full-system-overview)
3. [Layer 1 — Client Layer](#3-layer-1--client-layer)
4. [Layer 2 — API Gateway Layer](#4-layer-2--api-gateway-layer)
5. [Layer 3 — Backend Service Layer](#5-layer-3--backend-service-layer)
6. [Layer 4 — Data & Persistence Layer](#6-layer-4--data--persistence-layer)
7. [Layer 5 — Messaging & Queue Layer](#7-layer-5--messaging--queue-layer)
8. [Layer 6 — External Integration Layer](#8-layer-6--external-integration-layer)
9. [Cross-Cutting: Multi-Tenancy](#9-cross-cutting-multi-tenancy)
10. [Cross-Cutting: Event-Driven Flow](#10-cross-cutting-event-driven-flow)
11. [Cross-Cutting: Idempotency](#11-cross-cutting-idempotency)

---

## 1. Architecture Style

**Modular monolith** — designed for seamless extraction into microservices as scale demands.

> This deliberately balances **development velocity** in the early stages with **long-term scalability**. Each domain module is independently extractable without changing the others. See [Infrastructure → Scaling Strategy](./infrastructure-security.md#3-scaling-strategy) for the phase-by-phase plan.

---

## 2. Full System Overview

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                                                                              ║
║   ██████████████████████  LAYER 1: CLIENTS  ████████████████████████████    ║
║                                                                              ║
║   ┌──────────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────────┐     ║
║   │  Marketing   │  │    Tenant    │  │   Driver   │  │    Super     │     ║
║   │    Site      │  │    Portal    │  │    PWA     │  │    Admin     │     ║
║   │  fauward.com │  │{slug}.fw.com │  │  Mobile    │  │admin.fw.com  │     ║
║   └──────┬───────┘  └──────┬───────┘  └─────┬──────┘  └──────┬───────┘     ║
╚══════════╪══════════════════╪════════════════╪════════════════╪═════════════╝
           │  HTTPS           │  HTTPS / WSS   │  HTTPS         │  HTTPS
╔══════════╪══════════════════╪════════════════╪════════════════╪═════════════╗
║          ▼                  ▼                ▼                ▼             ║
║   ██████████████████████  LAYER 2: API GATEWAY  ███████████████████████     ║
║                                                                              ║
║   ┌──────────────────────────────────────────────────────────────────────┐  ║
║   │  TenantResolver · JWT Auth · RBAC · Rate Limiter · CORS · Logger    │  ║
║   └──────────────────────────────────────┬───────────────────────────────┘  ║
╚═════════════════════════════════════════╪════════════════════════════════════╝
                                          │
╔═════════════════════════════════════════╪════════════════════════════════════╗
║                                         ▼                                    ║
║   ██████████████████████  LAYER 3: BACKEND SERVICES  ███████████████████     ║
║                                                                              ║
║   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐ ║
║   │  Auth    │ │Shipments │ │ Tracking │ │ Payments │ │   Notifications  │ ║
║   │ Module   │ │ Module   │ │ Module   │ │  Module  │ │     Module       │ ║
║   └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────────────┘ ║
║   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐ ║
║   │  Users   │ │ Finance  │ │   CRM    │ │Documents │ │   Super Admin   │ ║
║   │  Module  │ │  Module  │ │  Module  │ │  Module  │ │     Module       │ ║
║   └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────────────┘ ║
║   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐ ║
║   │ Pricing  │ │  Fleet   │ │ Returns  │ │ Support  │ │    Analytics     │ ║
║   │  Module  │ │  Module  │ │  Module  │ │  Module  │ │     Module       │ ║
║   └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────────────┘ ║
╚══════════════════════════════════════════╪═══════════════════════════════════╝
                                           │
           ┌───────────────────────────────┼────────────────────────┐
           ▼                               ▼                        ▼
╔══════════════════════╗   ╔══════════════════════╗   ╔═════════════════════╗
║                      ║   ║                      ║   ║                     ║
║  LAYER 4: DATA &     ║   ║  LAYER 5: MESSAGING  ║   ║  LAYER 6: EXTERNAL  ║
║  PERSISTENCE         ║   ║  & QUEUES            ║   ║  INTEGRATIONS       ║
║                      ║   ║                      ║   ║                     ║
║  PostgreSQL          ║   ║  BullMQ              ║   ║  Stripe / Paystack  ║
║  Redis               ║   ║  Outbox Pattern      ║   ║  SendGrid / Twilio  ║
║  AWS S3              ║   ║  Dead Letter Queue   ║   ║  Google Maps        ║
║                      ║   ║                      ║   ║  M-Pesa / FW        ║
╚══════════════════════╝   ╚══════════════════════╝   ╚═════════════════════╝
```

---

## 3. Layer 1 — Client Layer

Five distinct surfaces — each with its own tech stack, design intent, and audience. They share no design system with each other — see [Frontend Design System](./frontend.md) for why.

```
╔══════════════════════════════════════════════════════════════════════════════════╗
║                            CLIENT LAYER                                         ║
╠═══════════════╦═══════════════╦══════════════╦═══════════════╦═════════════════╣
║               ║               ║              ║               ║                 ║
║  MARKETING    ║  TENANT        ║  DRIVER      ║  SUPER        ║  EMBEDDED       ║
║  SITE         ║  PORTAL        ║  PWA         ║  ADMIN        ║  WIDGET         ║
║               ║               ║              ║               ║                 ║
║  fauward.com  ║{slug}.fw.com   ║  Mobile app  ║admin.fw.com   ║  Any website    ║
║               ║               ║              ║               ║                 ║
║  Next.js 14   ║  React 18      ║  React 18    ║  React 18     ║  Vanilla JS     ║
║  App Router   ║  Vite          ║  Vite + PWA  ║  Vite         ║  Shadow DOM     ║
║  TypeScript   ║  TypeScript    ║  TypeScript  ║  TypeScript   ║  < 15 KB        ║
║  Tailwind     ║  Tailwind      ║  Tailwind    ║  Tailwind     ║  No deps        ║
║               ║  Zustand       ║              ║               ║                 ║
║               ║  React Query   ║              ║               ║                 ║
║               ║  Radix UI      ║              ║               ║                 ║
║               ║  Socket.io     ║              ║               ║                 ║
╠═══════════════╬═══════════════╬══════════════╬═══════════════╬═════════════════╣
║  Audience     ║  Audience     ║  Audience    ║  Audience     ║  Audience       ║
║  Prospects    ║  Logistics    ║  Delivery    ║  Fauward      ║  Anyone on      ║
║               ║  businesses   ║  drivers     ║  internal     ║  tenant site    ║
║               ║  + their      ║              ║  team         ║                 ║
║               ║  customers    ║              ║               ║                 ║
╠═══════════════╬═══════════════╬══════════════╬═══════════════╬═════════════════╣
║  Design       ║  Design       ║  Design      ║  Design       ║  Design         ║
║  Premium,     ║  Data-dense,  ║  Touch-first ║  Maximum      ║  Host-safe,     ║
║  spacious,    ║  operational, ║  High        ║  density,     ║  zero impact    ║
║  conversion   ║  white-label  ║  contrast,   ║  internal     ║  on host page   ║
║  focused      ║  themed       ║  offline     ║  tool         ║                 ║
╠═══════════════╬═══════════════╬══════════════╬═══════════════╬═════════════════╣
║  Key pages    ║  Key routes   ║  Key screens ║  Key pages    ║  Renders        ║
║               ║               ║              ║               ║                 ║
║  /            ║  /dashboard   ║  /route      ║  /tenants     ║  Tracking       ║
║  /pricing     ║  /shipments   ║  /stop/:id   ║  /revenue     ║  input          ║
║  /features    ║  /track       ║  /pod        ║  /queues      ║  +              ║
║  /signup      ║  /finance     ║  /history    ║  /health      ║  Event          ║
║  /login       ║  /crm         ║  /profile    ║  /impersonate ║  timeline       ║
║  /regions     ║  /analytics   ║              ║               ║                 ║
║  /legal       ║  /settings    ║              ║               ║                 ║
╚═══════════════╩═══════════════╩══════════════╩═══════════════╩═════════════════╝
```

### Communication protocols

| Surface | Protocol | Notes |
|---------|----------|-------|
| Marketing site | HTTPS only | SSR, crawlable |
| Tenant portal | HTTPS + WSS | WebSocket for real-time tracking |
| Driver PWA | HTTPS | Service worker for offline queuing |
| Super admin | HTTPS only | Internal; no public-facing routes |
| Widget | HTTPS | Embedded in host page via `<script>` |

---

## 4. Layer 2 — API Gateway Layer

A single Fastify server handles all inbound traffic. Middleware runs in this exact order on every request:

```
  ╔═══════════════════════════════════════════════════════════════════╗
  ║                      INCOMING REQUEST                            ║
  ╚═══════════════════════════════╦═══════════════════════════════════╝
                                  │
  ╔═══════════════════════════════▼═══════════════════════════════════╗
  ║  1  CORS                                                          ║
  ║     ┌─────────────────────────────────────────────────────────┐  ║
  ║     │  Allowed origins: fauward.com · *.fauward.com           │  ║
  ║     │  Allowed headers: Authorization · Content-Type          │  ║
  ║     │  Credentials: true                                      │  ║
  ║     └─────────────────────────────────────────────────────────┘  ║
  ╚═══════════════════════════════╦═══════════════════════════════════╝
                                  │
  ╔═══════════════════════════════▼═══════════════════════════════════╗
  ║  2  RATE LIMITER                                                  ║
  ║     ┌─────────────────────────────────────────────────────────┐  ║
  ║     │  Auth endpoints  →  10 req / min   (per IP)             │  ║
  ║     │  General API     →  100 req / min  (per userId)         │  ║
  ║     │  API key auth    →  500 req / hr   (per apiKeyId)       │  ║
  ║     │  429 response:   { code: "RATE_LIMITED", retryAfter }   │  ║
  ║     └─────────────────────────────────────────────────────────┘  ║
  ╚═══════════════════════════════╦═══════════════════════════════════╝
                                  │
  ╔═══════════════════════════════▼═══════════════════════════════════╗
  ║  3  TENANT RESOLVER                                               ║
  ║     ┌─────────────────────────────────────────────────────────┐  ║
  ║     │  Subdomain     → tenants WHERE slug = X                 │  ║
  ║     │  Custom domain → tenants WHERE custom_domain = X        │  ║
  ║     │  API key       → api_keys JOIN tenants WHERE hash = X   │  ║
  ║     │  SSO token     → tenants WHERE sso_provider_id = X      │  ║
  ║     │                                                         │  ║
  ║     │  Result attached to AsyncLocalStorage                   │  ║
  ║     │  All downstream Prisma queries auto-scoped to tenant    │  ║
  ║     └─────────────────────────────────────────────────────────┘  ║
  ╚═══════════════════════════════╦═══════════════════════════════════╝
                                  │
  ╔═══════════════════════════════▼═══════════════════════════════════╗
  ║  4  AUTHENTICATION                                                ║
  ║     ┌─────────────────────────────────────────────────────────┐  ║
  ║     │  Extract Bearer token from Authorization header         │  ║
  ║     │  Verify RS256 JWT signature                             │  ║
  ║     │  Check token expiry (15 min access tokens)             │  ║
  ║     │  Check user.isActive === true                           │  ║
  ║     │  Decorate req.user with { id, tenantId, role }          │  ║
  ║     └─────────────────────────────────────────────────────────┘  ║
  ╚═══════════════════════════════╦═══════════════════════════════════╝
                                  │
  ╔═══════════════════════════════▼═══════════════════════════════════╗
  ║  5  AUTHORISATION (RBAC)                                          ║
  ║     ┌─────────────────────────────────────────────────────────┐  ║
  ║     │  requireRole(['TENANT_ADMIN', ...])                     │  ║
  ║     │  requireFeature('webhooks')  →  plan-gates Pro features │  ║
  ║     │  tenantMatch()  →  JWT tenantId === resolved tenant      │  ║
  ║     └─────────────────────────────────────────────────────────┘  ║
  ╚═══════════════════════════════╦═══════════════════════════════════╝
                                  │
  ╔═══════════════════════════════▼═══════════════════════════════════╗
  ║  6  IDEMPOTENCY CHECK  (POST / PATCH mutations only)              ║
  ║     ┌─────────────────────────────────────────────────────────┐  ║
  ║     │  Read Idempotency-Key header                            │  ║
  ║     │  SHA-256 hash → check idempotency_keys table            │  ║
  ║     │  COMPLETED → return cached response (no re-execution)   │  ║
  ║     │  PROCESSING → 409 Conflict                              │  ║
  ║     │  not found  → insert PROCESSING, continue               │  ║
  ║     └─────────────────────────────────────────────────────────┘  ║
  ╚═══════════════════════════════╦═══════════════════════════════════╝
                                  │
  ╔═══════════════════════════════▼═══════════════════════════════════╗
  ║  7  STRUCTURED LOGGER                                             ║
  ║     ┌─────────────────────────────────────────────────────────┐  ║
  ║     │  Logs: method · path · tenantId · userId · duration     │  ║
  ║     │  Emits: requestId (UUID, echoed in all error responses) │  ║
  ║     │  Output: JSON → CloudWatch Logs                         │  ║
  ║     └─────────────────────────────────────────────────────────┘  ║
  ╚═══════════════════════════════╦═══════════════════════════════════╝
                                  │
                            ROUTE HANDLER
```

---

## 5. Layer 3 — Backend Service Layer

Fourteen domain modules — each a self-contained vertical slice with its own routes, service, and schema. All share common middleware and Prisma client.

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                       BACKEND SERVICE LAYER                                 ║
║               Node.js 20 · Fastify · TypeScript · Prisma ORM               ║
╠══════════════════╦═══════════════════════════════════════════════════════════╣
║                  ║                                                           ║
║  SHARED          ║  authenticate.ts   →  JWT verification                   ║
║  INFRASTRUCTURE  ║  tenant.resolver   →  AsyncLocalStorage context           ║
║                  ║  requireRole.ts    →  RBAC enforcement                    ║
║                  ║  featureGuard.ts   →  plan-based feature gating           ║
║                  ║  idempotency.ts    →  deduplication middleware             ║
║                  ║  pricing.ts        →  10-layer pricing engine             ║
║                  ║  trackingNum.ts    →  tracking number generator           ║
║                  ║  hash.ts / jwt.ts  →  crypto utilities                   ║
╠══════════════════╩═══════════════════════════════════════════════════════════╣
║                                                                              ║
║  DOMAIN MODULES                                                              ║
║                                                                              ║
║  ┌──────────────────────────────────────────────────────────────────────┐   ║
║  │  CORE DOMAIN                                                         │   ║
║  │                                                                      │   ║
║  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐ │   ║
║  │  │      AUTH      │  │   SHIPMENTS    │  │       TRACKING         │ │   ║
║  │  │                │  │                │  │                        │ │   ║
║  │  │ register       │  │ list/create    │  │ public GET :number      │ │   ║
║  │  │ login          │  │ get/update     │  │ WebSocket server        │ │   ║
║  │  │ refresh        │  │ state machine  │  │ Socket.io + Redis       │ │   ║
║  │  │ MFA TOTP       │  │ assign driver  │  │ room: tenantId:num      │ │   ║
║  │  │ forgot/reset   │  │ pricing engine │  │ event: status_update   │ │   ║
║  │  │ SSO (SAML/OIDC)│  │ tracking num   │  │                        │ │   ║
║  │  └────────────────┘  └────────────────┘  └────────────────────────┘ │   ║
║  └──────────────────────────────────────────────────────────────────────┘   ║
║                                                                              ║
║  ┌──────────────────────────────────────────────────────────────────────┐   ║
║  │  OPERATIONS DOMAIN                                                   │   ║
║  │                                                                      │   ║
║  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐ │   ║
║  │  │    DRIVER      │  │     FLEET      │  │       DOCUMENTS        │ │   ║
║  │  │                │  │                │  │                        │ │   ║
║  │  │ route + stops  │  │ vehicle CRUD   │  │ Puppeteer PDF gen      │ │   ║
║  │  │ POD upload     │  │ driver CRUD    │  │ delivery note          │ │   ║
║  │  │ failed deliv.  │  │ availability   │  │ invoice PDF            │ │   ║
║  │  │ location push  │  │                │  │ manifest PDF           │ │   ║
║  │  │ history        │  │                │  │ shipping label + QR    │ │   ║
║  │  └────────────────┘  └────────────────┘  └────────────────────────┘ │   ║
║  └──────────────────────────────────────────────────────────────────────┘   ║
║                                                                              ║
║  ┌──────────────────────────────────────────────────────────────────────┐   ║
║  │  COMMERCIAL DOMAIN                                                   │   ║
║  │                                                                      │   ║
║  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐ │   ║
║  │  │    PAYMENTS    │  │    FINANCE     │  │          CRM           │ │   ║
║  │  │                │  │                │  │                        │ │   ║
║  │  │ Stripe intent  │  │ invoice CRUD   │  │ leads pipeline         │ │   ║
║  │  │ webhook recv.  │  │ pay/void/send  │  │ quote lifecycle        │ │   ║
║  │  │ Paystack       │  │ bulk invoicing │  │ quote→shipment         │ │   ║
║  │  │ subscription   │  │ credit notes   │  │ customer CRUD          │ │   ║
║  │  │ dunning logic  │  │ overdue jobs   │  │                        │ │   ║
║  │  └────────────────┘  └────────────────┘  └────────────────────────┘ │   ║
║  └──────────────────────────────────────────────────────────────────────┘   ║
║                                                                              ║
║  ┌──────────────────────────────────────────────────────────────────────┐   ║
║  │  PLATFORM DOMAIN                                                     │   ║
║  │                                                                      │   ║
║  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐ │   ║
║  │  │    TENANTS     │  │     USERS      │  │       PRICING          │ │   ║
║  │  │                │  │                │  │                        │ │   ║
║  │  │ branding       │  │ profile        │  │ zones · rate cards     │ │   ║
║  │  │ domain verify  │  │ team invite    │  │ surcharges · rules     │ │   ║
║  │  │ usage tracking │  │ role changes   │  │ promo codes · tax      │ │   ║
║  │  │ plan features  │  │ suspend/activ. │  │ calculator endpoint    │ │   ║
║  │  │ email settings │  │                │  │ 10-layer engine        │ │   ║
║  │  └────────────────┘  └────────────────┘  └────────────────────────┘ │   ║
║  │                                                                      │   ║
║  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐ │   ║
║  │  │  API KEYS &    │  │    RETURNS     │  │       SUPPORT          │ │   ║
║  │  │   WEBHOOKS     │  │                │  │                        │ │   ║
║  │  │                │  │ return request │  │ ticket CRUD            │ │   ║
║  │  │ key gen/revoke │  │ approve/reject │  │ message thread         │ │   ║
║  │  │ HMAC signing   │  │ return label   │  │ internal notes         │ │   ║
║  │  │ delivery log   │  │ status machine │  │ assign/resolve/close   │ │   ║
║  │  └────────────────┘  └────────────────┘  └────────────────────────┘ │   ║
║  └──────────────────────────────────────────────────────────────────────┘   ║
║                                                                              ║
║  ┌──────────────────────────────────────────────────────────────────────┐   ║
║  │  OBSERVABILITY DOMAIN                                                │   ║
║  │                                                                      │   ║
║  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────────┐ │   ║
║  │  │   ANALYTICS    │  │  SUPER ADMIN   │  │     NOTIFICATIONS      │ │   ║
║  │  │                │  │                │  │                        │ │   ║
║  │  │ KPI overview   │  │ tenant list    │  │ email via SendGrid      │ │   ║
║  │  │ lifecycle funl │  │ plan override  │  │ SMS via Twilio         │ │   ║
║  │  │ SLA tracking   │  │ impersonate    │  │ in-app notifications   │ │   ║
║  │  │ reports CSV    │  │ queue stats    │  │ BullMQ worker          │ │   ║
║  │  │ activity feed  │  │ health check   │  │ template config        │ │   ║
║  │  └────────────────┘  └────────────────┘  └────────────────────────┘ │   ║
║  └──────────────────────────────────────────────────────────────────────┘   ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### Module anatomy

Every module follows the same internal structure:

```
modules/{domain}/
├── {domain}.routes.ts    ← Fastify route definitions, middleware hooks
├── {domain}.service.ts   ← Business logic, Prisma queries
├── {domain}.schema.ts    ← Zod input validation schemas
└── {domain}.controller.ts  ← (thin controller, optional — some modules inline)
```

---

## 6. Layer 4 — Data & Persistence Layer

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                        DATA & PERSISTENCE LAYER                             ║
╠═════════════════════╦════════════════════════╦══════════════════════════════╣
║                     ║                        ║                              ║
║  ┌───────────────┐  ║  ┌──────────────────┐  ║  ┌──────────────────────┐   ║
║  │  POSTGRESQL   │  ║  │      REDIS       │  ║  │       AWS S3         │   ║
║  │  (Supabase)   │  ║  │    (Upstash)     │  ║  │   (or local dev)     │   ║
║  └───────────────┘  ║  └──────────────────┘  ║  └──────────────────────┘   ║
║                     ║                        ║                              ║
╠═════════════════════╬════════════════════════╬══════════════════════════════╣
║                     ║                        ║                              ║
║  PRIMARY STORE      ║  SECONDARY STORE       ║  OBJECT STORE               ║
║  35+ tables         ║                        ║                              ║
║  ACID transactions  ║  User sessions         ║  PDF documents              ║
║  JSONB columns      ║  (TTL: 7 days)         ║  POD photos                 ║
║  Full-text search   ║                        ║  POD signatures             ║
║                     ║  Shipment status cache ║  Invoice PDFs               ║
║  tenant_id on       ║  (TTL: 30 s)           ║  Delivery notes             ║
║  every table        ║                        ║  Cargo manifests            ║
║                     ║  Pricing zone matrix   ║  Shipping labels            ║
║  Prisma middleware  ║  (TTL: 24 h)           ║                             ║
║  auto-scopes        ║                        ║  Signed URLs                ║
║  all queries        ║  Analytics aggregates  ║  (1 hr expiry)              ║
║                     ║  (TTL: 5 min)          ║                             ║
║  Read replica for   ║                        ║  ClamAV malware scan        ║
║  heavy analytics    ║  Rate limit counters   ║  on upload                  ║
║  queries            ║  (TTL: 1 min window)   ║                             ║
║                     ║                        ║  STORAGE_DRIVER=            ║
║  WAL streaming      ║  Driver locations      ║  local | s3                 ║
║  + daily snapshots  ║  (TTL: 5 min, GPS)     ║                             ║
║                     ║                        ║                             ║
║  PITR:              ║  WebSocket PubSub      ║                             ║
║  7d (Starter/Pro)   ║  (Socket.io adapter)   ║                             ║
║  35d (Enterprise)   ║                        ║                             ║
║                     ║  Idempotency cache     ║                             ║
╠═════════════════════╬════════════════════════╬══════════════════════════════╣
║                     ║                        ║                              ║
║  ENGINE: Postgres   ║  ENGINE: Redis         ║  HOSTING: AWS eu-west-2     ║
║  VERSION: 15        ║  VERSION: 7            ║  (or local ./uploads/)      ║
║                     ║                        ║                              ║
╚═════════════════════╩════════════════════════╩══════════════════════════════╝
```

### Database isolation model

```
  ┌─────────────────────────────────────────────────────────────────┐
  │                    SHARED DATABASE (Starter + Pro)              │
  │                                                                 │
  │   ┌─────────────────────────────────────────────────────────┐  │
  │   │  Single PostgreSQL cluster                              │  │
  │   │                                                         │  │
  │   │  tenant_A rows ─┐                                       │  │
  │   │  tenant_B rows ─┤─── all in same tables                 │  │
  │   │  tenant_C rows ─┘                                       │  │
  │   │                                                         │  │
  │   │  Prisma middleware:  WHERE tenant_id = {from context}   │  │
  │   │  No query executes without tenant scope — enforced      │  │
  │   └─────────────────────────────────────────────────────────┘  │
  └─────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────┐
  │              DEDICATED INFRASTRUCTURE (Enterprise)              │
  │                                                                 │
  │   Tenant A ──┐                                                  │
  │              ├─ Own PostgreSQL instance  (db.t3.medium, MAZ)   │
  │              ├─ Own Redis cluster                               │
  │              ├─ Own ECS task group                              │
  │              └─ Own S3 bucket                                   │
  │                                                                 │
  │   Tenant B ──┐ (same pattern, completely isolated)             │
  │              └─ ...                                             │
  └─────────────────────────────────────────────────────────────────┘
```

---

## 7. Layer 5 — Messaging & Queue Layer

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                       MESSAGING & QUEUE LAYER                               ║
║                              BullMQ + Redis                                 ║
╠════════════════════════════════════════════╦═════════════════════════════════╣
║                                            ║                                 ║
║              QUEUES                        ║         WORKERS                 ║
║                                            ║                                 ║
╠════════════════════════════════════════════╬═════════════════════════════════╣
║                                            ║                                 ║
║  ┌──────────────────────────────────────┐  ║  ┌───────────────────────────┐ ║
║  │         notificationQueue            │  ║  │   notificationWorker      │ ║
║  │                                      │  ║  │                           │ ║
║  │  { type: "email",                   │──╬──│  sendEmail()              │ ║
║  │    to, template, data, tenantId }   │  ║  │   via SendGrid API        │ ║
║  │                                      │  ║  │                           │ ║
║  │  { type: "sms",                     │──╬──│  sendSms()                │ ║
║  │    to, message, tenantId }          │  ║  │   via Twilio API          │ ║
║  │                                      │  ║  │                           │ ║
║  │  Retries: 3  ·  Backoff: exp        │  ║  │  Logs to                  │ ║
║  │  Concurrency: 10                    │  ║  │  notification_log table   │ ║
║  └──────────────────────────────────────┘  ║  └───────────────────────────┘ ║
║                                            ║                                 ║
║  ┌──────────────────────────────────────┐  ║  ┌───────────────────────────┐ ║
║  │          webhookQueue                │  ║  │    webhookWorker          │ ║
║  │                                      │  ║  │                           │ ║
║  │  { endpointId, eventType,           │──╬──│  HTTP POST to tenant URL  │ ║
║  │    payload, deliveryId }            │  ║  │  HMAC-SHA256 signature    │ ║
║  │                                      │  ║  │  X-Delivery-ID header     │ ║
║  │  Retries: 3  ·  Backoff: exp        │  ║  │  Logs delivery result     │ ║
║  │  Concurrency: 20                    │  ║  │  to webhook_deliveries    │ ║
║  └──────────────────────────────────────┘  ║  └───────────────────────────┘ ║
║                                            ║                                 ║
║  ┌──────────────────────────────────────┐  ║  ┌───────────────────────────┐ ║
║  │          outboxQueue                 │  ║  │    outboxWorker           │ ║
║  │                                      │  ║  │                           │ ║
║  │  Polls outbox_events table          │──╬──│  Reads unpublished rows   │ ║
║  │  WHERE published = false            │  ║  │  Routes to correct queue  │ ║
║  │  every 1 s                          │  ║  │  Marks published=true     │ ║
║  │                                      │  ║  │  (atomic with event write)│ ║
║  └──────────────────────────────────────┘  ║  └───────────────────────────┘ ║
║                                            ║                                 ║
║  ┌──────────────────────────────────────┐  ║  ┌───────────────────────────┐ ║
║  │       scheduledJobsQueue             │  ║  │   scheduledWorker         │ ║
║  │                                      │  ║  │                           │ ║
║  │  Repeatable jobs (cron):            │──╬──│  Daily 00:00 UTC          │ ║
║  │  - overdue invoice detection        │  ║  │    → mark SENT invoices   │ ║
║  │  - currency rate refresh            │  ║  │      where due_date past  │ ║
║  │  - trial expiry warnings            │  ║  │    → notify customer      │ ║
║  │  - usage report emails              │  ║  │      + TENANT_ADMIN       │ ║
║  │                                      │  ║  │                           │ ║
║  │                                      │  ║  │  Daily 06:00 UTC          │ ║
║  │                                      │  ║  │    → fetch exchange rates │ ║
║  └──────────────────────────────────────┘  ║  └───────────────────────────┘ ║
╠════════════════════════════════════════════╬═════════════════════════════════╣
║                                            ║                                 ║
║  DEAD LETTER QUEUE                         ║  MONITORING                     ║
║                                            ║                                 ║
║  dlq:notificationQueue                     ║  CloudWatch alarm fires         ║
║  dlq:webhookQueue                          ║  if DLQ depth > 10              ║
║  dlq:outboxQueue                           ║                                 ║
║                                            ║  Queue stats exposed at         ║
║  Jobs move here after 3 failed attempts    ║  GET /admin/queues              ║
║                                            ║                                 ║
╚════════════════════════════════════════════╩═════════════════════════════════╝
```

### Outbox pattern — guaranteed delivery

```
  ╔══════════════════════════════════════════════════════════════════╗
  ║  Business action: shipment status → DELIVERED                   ║
  ╚══════════════════════════════════╦═════════════════════════════════╝
                                     │
  ╔══════════════════════════════════▼═════════════════════════════════╗
  ║  Prisma transaction (atomic — both writes succeed or neither):    ║
  ║                                                                   ║
  ║  1. UPDATE shipments SET status='DELIVERED' WHERE id=X           ║
  ║  2. INSERT INTO outbox_events (event_type, payload, published=F) ║
  ╚══════════════════════════════════╦═════════════════════════════════╝
                                     │
  ╔══════════════════════════════════▼═════════════════════════════════╗
  ║  Outbox poller (every 1 s):                                       ║
  ║  SELECT * FROM outbox_events WHERE published = false              ║
  ╚════════╦════════════════════════════════════════╦══════════════════╝
           │                                        │
    ┌──────▼──────┐                        ┌────────▼────────┐
    │notifications│                        │    webhooks     │
    │   queue     │                        │     queue       │
    │             │                        │                 │
    │ email:      │                        │ POST to tenant  │
    │ delivered   │                        │ endpoint with   │
    │ template    │                        │ HMAC signature  │
    └─────────────┘                        └─────────────────┘

  If process crashes between steps 1 and 2: the transaction rolls back.
  If process crashes after step 2 but before queue publish: the poller
  picks up the unpublished event on its next poll cycle.
  Events are NEVER silently lost.
```

---

## 8. Layer 6 — External Integration Layer

```
╔══════════════════════════════════════════════════════════════════════════════╗
║                      EXTERNAL INTEGRATION LAYER                             ║
╠══════════════════════╦═══════════════════╦═══════════════════╦══════════════╣
║   PAYMENTS           ║   COMMUNICATIONS  ║   GEOLOCATION     ║   ACCOUNTING ║
╠══════════════════════╬═══════════════════╬═══════════════════╬══════════════╣
║                      ║                   ║                   ║              ║
║  ┌────────────────┐  ║  ┌─────────────┐  ║  ┌─────────────┐ ║  ┌─────────┐ ║
║  │     STRIPE     │  ║  │  SENDGRID   │  ║  │ GOOGLE MAPS │ ║  │  XERO   │ ║
║  │                │  ║  │             │  ║  │             │ ║  └─────────┘ ║
║  │ PaymentIntents │  ║  │ Transact.   │  ║  │ Address     │ ║  ┌─────────┐ ║
║  │ Subscriptions  │  ║  │ email       │  ║  │ autocomplete│ ║  │   QB    │ ║
║  │ Webhooks       │  ║  │ templates   │  ║  │             │ ║  └─────────┘ ║
║  │ Customer portal│  ║  │             │  ║  │ Route calc. │ ║  ┌─────────┐ ║
║  │ Dunning        │  ║  └─────────────┘  ║  │             │ ║  │  SAGE   │ ║
║  └────────────────┘  ║  ┌─────────────┐  ║  │ Distance    │ ║  └─────────┘ ║
║  ┌────────────────┐  ║  │   TWILIO    │  ║  │ matrix      │ ║  ┌─────────┐ ║
║  │   PAYSTACK     │  ║  │             │  ║  └─────────────┘ ║  │   SAP   │ ║
║  │                │  ║  │ SMS global  │  ║                   ║  └─────────┘ ║
║  │ West Africa    │  ║  │ OTP         │  ║                   ║              ║
║  │ NGN/GHS/XOF   │  ║  │ Delivery    │  ║                   ║  Bidirect.   ║
║  └────────────────┘  ║  │ status      │  ║                   ║  sync via    ║
║  ┌────────────────┐  ║  └─────────────┘  ║                   ║  Merge.dev   ║
║  │   FLUTTERWAVE  │  ║                   ║                   ║  or direct   ║
║  │                │  ║                   ║                   ║  API         ║
║  │ Pan-Africa     │  ║                   ║                   ║              ║
║  │ Multi-currency │  ║                   ║                   ║              ║
║  └────────────────┘  ║                   ║                   ║              ║
║  ┌────────────────┐  ║                   ║                   ║              ║
║  │    M-PESA      │  ║                   ║                   ║              ║
║  │                │  ║                   ║                   ║              ║
║  │ East Africa    │  ║                   ║                   ║              ║
║  │ STK Push       │  ║                   ║                   ║              ║
║  └────────────────┘  ║                   ║                   ║              ║
╠══════════════════════╩═══════════════════╩═══════════════════╩══════════════╣
║                                                                              ║
║   CARRIERS (Enterprise)           E-INVOICING (Enterprise)                  ║
║                                                                              ║
║   Air:    Traxon · Descartes · WebCargo · CCNhub · Cargonaut                ║
║   Ocean:  INTTRA · CargoFive · Chain.io                                     ║
║   Last-mile: GIG · Aramex · DHL · Royal Mail · UPS · Delhivery             ║
║   Visibility: Wakeo · project44 · FourKites                                 ║
║                                                                              ║
║   UK: HMRC MTD · PEPPOL                                                     ║
║   NG: FIRS e-invoice          KE: KRA eTIMS                                ║
║   SA: ZATCA Phase 2           EG: ETA                                       ║
║   ZA: SARS e-filing                                                         ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### Integration pattern

All external calls follow the same defensive pattern:

```
  ┌──────────────────────────────────────────────────────────────────┐
  │  Service call (e.g. sendEmail)                                  │
  │                                                                  │
  │  1. Enqueue job in BullMQ (never call API inline on request)    │
  │  2. Worker picks up job asynchronously                          │
  │  3. Call external API with timeout (10 s max)                   │
  │  4. On success: log to notification_log, mark job complete      │
  │  5. On failure: BullMQ retries 3× with exponential backoff      │
  │  6. After 3 failures: job moves to DLQ, alert fires             │
  └──────────────────────────────────────────────────────────────────┘
```

---

## 9. Cross-Cutting: Multi-Tenancy

The tenant context flows through every layer automatically:

```
  ┌─────────────────────────────────────────────────────────────────────┐
  │                    REQUEST LIFECYCLE                                │
  └───────────────────────────────────────────────────────┬─────────────┘
                                                          │
  ┌───────────────────────────────────────────────────────▼─────────────┐
  │  1. Request arrives at API gateway                                  │
  │     Host: acme.fauward.com  →  slug = "acme"                        │
  └───────────────────────────────────────────────────────┬─────────────┘
                                                          │
  ┌───────────────────────────────────────────────────────▼─────────────┐
  │  2. TenantResolver middleware                                        │
  │     SELECT id, plan, status, settings FROM tenants                  │
  │     WHERE slug = 'acme'                                             │
  │     → Tenant { id: "uuid-acme", plan: "PRO", ... }                 │
  └───────────────────────────────────────────────────────┬─────────────┘
                                                          │
  ┌───────────────────────────────────────────────────────▼─────────────┐
  │  3. AsyncLocalStorage.run({ tenant })                               │
  │     Tenant context now available anywhere in the call stack         │
  │     without passing it explicitly through every function            │
  └───────────────────────────────────────────────────────┬─────────────┘
                                                          │
  ┌───────────────────────────────────────────────────────▼─────────────┐
  │  4. Prisma middleware (global, cannot be bypassed)                  │
  │                                                                     │
  │  // Before every findMany / findFirst / create / update / delete:  │
  │  if (action !== 'findUnique') {                                     │
  │    params.args.where = {                                            │
  │      ...params.args.where,                                         │
  │      tenantId: getTenantFromContext().id                           │
  │    }                                                               │
  │  }                                                                  │
  │                                                                     │
  │  → Even if a developer forgets to add tenant_id, the middleware    │
  │    enforces it. There is no bypass path.                           │
  └───────────────────────────────────────────────────────┬─────────────┘
                                                          │
  ┌───────────────────────────────────────────────────────▼─────────────┐
  │  5. Response sent                                                   │
  │     Only data belonging to "acme" tenant ever reached the handler  │
  └─────────────────────────────────────────────────────────────────────┘
```

---

## 10. Cross-Cutting: Event-Driven Flow

A complete request lifecycle showing how events propagate across all layers:

```
  USER clicks "Mark as Delivered" in Tenant Portal
            │
            │  PATCH /shipments/uuid/status  { status: "DELIVERED" }
            ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  API GATEWAY                                                    │
  │  authenticate → tenantResolver → RBAC → idempotency check       │
  └──────────────────────────────────────┬──────────────────────────┘
                                         │
  ┌──────────────────────────────────────▼──────────────────────────┐
  │  SHIPMENTS MODULE                                               │
  │                                                                 │
  │  1. Validate transition: OUT_FOR_DELIVERY → DELIVERED  ✅       │
  │  2. Require POD asset exists on shipment                       │
  │  3. BEGIN TRANSACTION                                          │
  │     a. UPDATE shipments SET status='DELIVERED', actualDelivery │
  │     b. INSERT INTO shipment_events (DELIVERED event)           │
  │     c. INSERT INTO outbox_events (shipment.delivered payload)  │
  │  4. COMMIT TRANSACTION                                         │
  └──────────────────────────────────────┬──────────────────────────┘
                                         │
       ┌─────────────────────────────────┴──────────────────┐
       │  Real-time                                          │  Async
       ▼                                                     ▼
  ┌──────────────────┐               ┌────────────────────────────────────┐
  │  WEBSOCKET       │               │  OUTBOX POLLER (1 s later)         │
  │                  │               │                                    │
  │ Emit to room     │               │ Reads unpublished outbox event     │
  │ tenantId:trackNum│               │ Routes to queues:                  │
  │                  │               │                                    │
  │ { type:          │               │  notificationQueue:                │
  │   "status_update"│               │    email → customer (DELIVERED)    │
  │   status,        │               │    SMS   → customer (Pro+)         │
  │   timestamp }    │               │    in-app → TENANT_ADMIN           │
  │                  │               │                                    │
  │ All subscribers  │               │  webhookQueue:                     │
  │ (tracking page,  │               │    POST to tenant webhook URL      │
  │  widget, etc.)   │               │    event: shipment.delivered       │
  │ see update       │               │    HMAC signed payload             │
  │ immediately      │               │                                    │
  └──────────────────┘               │  analyticsQueue:                   │
                                     │    increment delivered count        │
                                     │    update avg delivery time         │
                                     └────────────────────────────────────┘
```

---

## 11. Cross-Cutting: Idempotency

Protects against duplicate requests caused by network retries, double-clicks, or client-side bugs:

```
  ┌─────────────────────────────────────────────────────────────────────┐
  │  Client sends:                                                      │
  │  POST /shipments                                                    │
  │  Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000             │
  └─────────────────────────────────────────────────────────┬───────────┘
                                                            │
  ┌─────────────────────────────────────────────────────────▼───────────┐
  │  Idempotency middleware                                             │
  │                                                                     │
  │  1. SHA-256 hash the key                                           │
  │  2. SELECT FROM idempotency_keys                                   │
  │     WHERE tenantId = X AND key = hash                              │
  └──────┬──────────────────────┬──────────────────────────────────────┘
         │                      │
   not found               found (status=COMPLETED)
         │                      │
  ┌──────▼───────┐       ┌──────▼───────────────────────────┐
  │ INSERT row   │       │ Return cached response            │
  │ status=      │       │ (original status code + body)    │
  │ PROCESSING   │       │                                  │
  └──────┬───────┘       │ Handler NOT re-executed          │
         │               │ DB NOT written to again          │
         │               └──────────────────────────────────┘
  ┌──────▼───────┐
  │ Execute      │
  │ route handler│
  └──────┬───────┘
         │
  ┌──────▼───────────────────────┐
  │ UPDATE idempotency_keys      │
  │ SET status=COMPLETED,        │
  │     response={...},          │
  │     statusCode=201           │
  └──────────────────────────────┘
         │
  Keys expire after 24 hours (scheduled cleanup job)
```

---

*Part of the [Fauward documentation](../README.md)*
