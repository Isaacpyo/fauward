# API Design

> REST conventions · Core endpoints · WebSocket events · Rate limiting · Idempotency · Error format

**Navigation →** [System Architecture](./system-architecture.md) · [Infrastructure & Security](./infrastructure-security.md) · [← README](../README.md)

---

## Contents

1. [REST Conventions](#1-rest-conventions)
2. [Core Endpoints](#2-core-endpoints)
3. [WebSocket Events](#3-websocket-events)
4. [Rate Limiting](#4-rate-limiting)
5. [Idempotency](#5-idempotency)
6. [API Key Scopes](#6-api-key-scopes)
7. [Webhook Events](#7-webhook-events)
8. [Standardised Error Response](#8-standardised-error-response)

---

## 1. REST Conventions

| Convention | Value |
|------------|-------|
| Base URL | `https://api.fauward.com/v1` |
| Auth (user session) | `Authorization: Bearer <access_token>` |
| Auth (API key) | `Authorization: Bearer fwd_<key>` |
| Format | JSON — `Content-Type: application/json` |
| Error format | RFC 7807 (see [Section 8](#8-standardised-error-response)) |
| Pagination | `?page=1&limit=50` |
| Date filtering | `?dateFrom=2026-01-01&dateTo=2026-01-31` |

---

## 2. Core Endpoints

### Authentication

```
POST   /auth/register
POST   /auth/login
POST   /auth/logout
POST   /auth/refresh
POST   /auth/forgot-password
POST   /auth/reset-password
GET    /auth/me
POST   /auth/mfa/setup
POST   /auth/mfa/verify
POST   /auth/mfa/validate
```

### Shipments

```
GET    /shipments                         list with tenant filter, pagination, filters
POST   /shipments                         create — runs pricing engine, generates tracking number
GET    /shipments/:id                     detail with items, events, podAssets, driver, invoice
PATCH  /shipments/:id/status              enforce ALLOWED_TRANSITIONS
PATCH  /shipments/:id/assign              assign driver
DELETE /shipments/:id                     soft-delete (PENDING or PROCESSING only)
GET    /shipments/live-map                active shipments with last known location (Pro+)
```

### Tracking *(public — no auth required)*

```
GET    /tracking/:trackingNumber          returns status, events, estimatedDelivery, addresses
```

### Payments

```
POST   /payments/intent                   create Stripe PaymentIntent → returns clientSecret
GET    /payments/:shipmentId              get payment record
POST   /payments/webhook/stripe           Stripe event receiver (signature verified)
```

### Invoices

```
GET    /finance/invoices                  list
POST   /finance/invoices                  create (status = DRAFT)
GET    /finance/invoices/:id              detail with line_items, payments, credit_notes
PATCH  /finance/invoices/:id              update (DRAFT only)
POST   /finance/invoices/:id/send         mark SENT → email PDF to customer
POST   /finance/invoices/:id/pay          record payment → mark PAID if total satisfied
POST   /finance/invoices/:id/void         mark VOID (cannot void PAID)
POST   /finance/invoices/bulk             bulk create for a date range
GET    /finance/payments                  list payments
POST   /finance/credit-notes              create credit note
GET    /finance/credit-notes              list credit notes
GET    /finance/report/csv                stream CSV for date range
```

### CRM

```
GET/POST/PATCH/DELETE  /crm/leads
GET    /crm/leads/:id
GET/POST/PATCH         /crm/quotes
POST   /crm/quotes/:id/send
POST   /crm/quotes/:id/accept             creates Shipment; marks lead WON
POST   /crm/quotes/:id/reject             marks lead LOST
GET/POST/PATCH         /crm/customers
GET    /crm/customers/:id
```

### Users & Team

```
GET    /users/me
PATCH  /users/me
GET    /users                             list staff (TENANT_ADMIN, TENANT_MANAGER)
POST   /users/invite                      TENANT_ADMIN only
PATCH  /users/:id/role                    TENANT_ADMIN only
PATCH  /users/:id/suspend                 TENANT_ADMIN only
PATCH  /users/:id/activate                TENANT_ADMIN only
DELETE /users/:id                         deactivate (set isActive=false)
```

### Analytics

```
GET    /analytics/full                    KPI overview with trend indicators
GET    /analytics/shipments               status breakdown, lifecycle funnel, SLA, exceptions
GET    /analytics/revenue                 by service tier, by customer, collection rate
GET    /analytics/staff                   per-staff performance
GET    /analytics/export/csv              stream CSV for date range
GET    /activity                          unified activity timeline
```

### Reports *(Pro+)*

```
GET    /reports/shipments                 format=csv|json|pdf
GET    /reports/revenue
GET    /reports/returns
GET    /reports/tickets
GET    /reports/staff
GET    /reports/customers
```

### Tenant Settings

```
GET    /tenant/me
PATCH  /tenant/branding
PATCH  /tenant/settings
PATCH  /tenant/domain                     Pro+
GET    /tenant/domain/status
GET    /tenant/usage
GET    /tenant/onboarding
GET    /tenant/plan-features
GET    /tenant/email-templates
PATCH  /tenant/email-templates/:key
PATCH  /tenant/email-settings
POST   /tenant/email-templates/:key/test
```

### API Keys & Webhooks *(Pro+)*

```
GET    /tenant/api-keys
POST   /tenant/api-keys
DELETE /tenant/api-keys/:id

GET    /tenant/webhooks
POST   /tenant/webhooks
PATCH  /tenant/webhooks/:id
DELETE /tenant/webhooks/:id
POST   /tenant/webhooks/:id/test
GET    /tenant/webhooks/deliveries
```

### Driver *(TENANT_DRIVER role)*

```
GET    /driver/route                      today's route with stops
PATCH  /driver/stops/:stopId/status       mark IN_PROGRESS or COMPLETED
POST   /driver/pod                        upload photo + signature; triggers DELIVERED
PATCH  /driver/shipments/:id/failed       log failed delivery
GET    /driver/history                    last 30 days
GET    /driver/locations                  all driver locations (TENANT_ADMIN/MANAGER)
PATCH  /driver/location                   report current location (driver, every 60 s)
```

### Documents

```
POST   /documents/delivery-note/:shipmentId
POST   /documents/invoice/:invoiceId
POST   /documents/pod/:shipmentId
GET    /documents/:id                     get/refresh signed download URL
GET    /label/:trackingNumber             thermal-printer optimised HTML/PDF
```

### Notifications

```
GET    /notifications
PATCH  /notifications/:id/read
POST   /notifications/read-all
GET    /notifications/unread-count
```

### Super Admin *(SUPER_ADMIN role only)*

```
GET    /admin/tenants
GET    /admin/tenants/:id
PATCH  /admin/tenants/:id/plan
POST   /admin/tenants/:id/suspend
POST   /admin/tenants/:id/unsuspend
POST   /admin/tenants/:id/impersonate     30-min JWT; audit logged
DELETE /admin/impersonate
GET    /admin/metrics
GET    /admin/queues
GET    /admin/health
```

### Pricing *(TENANT_ADMIN, TENANT_MANAGER)*

```
GET/POST/PATCH/DELETE  /pricing/zones
GET/POST/PATCH/DELETE  /pricing/rate-cards
PATCH                  /pricing/rate-cards/:id/activate
POST                   /pricing/rate-cards/:id/duplicate
GET                    /pricing/rate-cards/matrix
POST                   /pricing/rate-cards/matrix/import
PATCH                  /pricing/service-tiers
GET/POST/PATCH/DELETE  /pricing/surcharges
PATCH                  /pricing/surcharges/:id/toggle
GET/POST/PATCH/DELETE  /pricing/rules
PATCH                  /pricing/rules/reorder
GET/POST/PATCH/DELETE  /pricing/weight-tiers
GET/POST/PATCH/DELETE  /pricing/promo-codes
POST                   /pricing/promo-codes/validate    (any authenticated user)
PATCH                  /pricing/insurance
PATCH                  /pricing/tax
GET                    /pricing/currency-rates
POST                   /pricing/currency-rates
POST                   /pricing/currency-rates/refresh
GET                    /pricing/settings
PATCH                  /pricing/settings
POST                   /pricing/calculate               (any authenticated user)
```

---

## 3. WebSocket Events

**Connection:** `wss://api.fauward.com/tracking`

```json
// Client → Server (subscribe)
{ "type": "subscribe", "trackingNumber": "FWD-202506-A3F9K2" }

// Server → Client (status update)
{ "type": "status_update", "data": { "status": "OUT_FOR_DELIVERY", "location": {...}, "timestamp": "..." } }
```

Rooms are scoped as `{tenantId}:{trackingNumber}` to prevent cross-tenant leakage.

---

## 4. Rate Limiting

| Route group | Limit | Key |
|-------------|-------|-----|
| Auth endpoints (`/auth/login`, `/auth/register`, etc.) | 10 req / min | IP |
| General API (JWT auth) | 100 req / min | `userId` |
| API key authenticated | 500 req / hr *(per key, or `ApiKey.rateLimit` from DB)* | `apiKeyId` |

**429 response:**

```json
{
  "error": "Rate limit exceeded",
  "code": "RATE_LIMITED",
  "retryAfter": 60,
  "upgradeUrl": "https://fauward.com/upgrade"
}
```

---

## 5. Idempotency

Send `Idempotency-Key: <uuid>` on any POST/PATCH mutation.

| Scenario | Behaviour |
|----------|-----------|
| Key seen, status `COMPLETED` | Return cached response — handler not re-executed |
| Key seen, status `PROCESSING` | Return `409 Conflict` (request in flight) |
| Key not seen | Insert `PROCESSING`, execute, store response as `COMPLETED` |

Keys expire after **24 hours**. Applied to: `POST /shipments`, `POST /invoices`, `POST /payments/intent`, `POST /quotes`.

---

## 6. API Key Scopes

| Scope | Description |
|-------|-------------|
| `read:shipments` | Read shipments and tracking events |
| `write:shipments` | Create and update shipments |
| `read:invoices` | Read invoices and payment records |
| `write:invoices` | Create and update invoices |
| `read:analytics` | Read analytics aggregates |

Keys are:
- Prefixed with `fwd_`
- **bcrypt-hashed** in the database
- **Shown only once** at creation — never retrievable again

---

## 7. Webhook Events

Webhooks fire for: `shipment.*` · `payment.*` · `invoice.*` · `quote.*`

Each delivery:
- Signed with **HMAC-SHA256** in `X-Webhook-Signature` header
- Includes `X-Delivery-ID` for consumer-side deduplication
- **Retry policy:** 3 attempts with exponential backoff → DLQ after final failure

---

## 8. Standardised Error Response

All errors follow [RFC 7807](https://www.rfc-editor.org/rfc/rfc7807):

```json
{
  "error":      "Human-readable message",
  "code":       "MACHINE_READABLE_CODE",
  "statusCode": 422,
  "details": [
    { "field": "weight_kg", "message": "Must be greater than 0" }
  ],
  "requestId": "550e8400-e29b-41d4-a716-446655440000"
}
```

**Common error codes:**

| Code | Status | Meaning |
|------|--------|---------|
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `INVALID_TRANSITION` | 400 | Shipment state transition not allowed |
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `USER_SUSPENDED` | 401 | User account is suspended |
| `FORBIDDEN` | 403 | Valid token, insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found (also used for cross-tenant isolation) |
| `DUPLICATE_KEY` | 409 | Idempotency key in flight |
| `BUSINESS_RULE` | 422 | Valid request violates a business rule |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `PLAN_LIMIT` | 429 | Shipment or feature limit reached |

---

*Part of the [Fauward documentation](../README.md)*
