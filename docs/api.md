# Fauward — API Design

---

## REST API Conventions

- Base URL: `https://api.fauward.com/v1`
- Auth: `Authorization: Bearer <access_token>` or API key
- Format: JSON
- Errors follow RFC 7807

---

## Core Endpoints

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

---

## WebSocket Events

```
Connection: wss://api.fauward.com/tracking
Client → Server: { type: "subscribe", trackingNumber: "FWD-202506-A3F9K2" }
Server → Client: { type: "status_update", data: { status, location, timestamp } }
```

Room naming: `{tenantId}:{trackingNumber}` for tenant isolation.

---

## Standardised Error Response

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

## Rate Limiting

| Route group | Limit |
|-------------|-------|
| Auth endpoints (`/auth/login`, `/auth/register`, etc.) | 10 req/min |
| General API | 100 req/min |
| API key authenticated | 500 req/hr (per key; overridable via `ApiKey.rateLimit`) |

On 429:
```json
{ "error": "Rate limit exceeded", "code": "RATE_LIMITED", "retryAfter": 60, "upgradeUrl": "https://fauward.com/upgrade" }
```

---

## Idempotency

All POST/PATCH mutation endpoints accept an `Idempotency-Key` header. Duplicate requests within 24 hours return the cached response without re-executing.

Apply to: `POST /shipments`, `POST /invoices`, `POST /payments/intent`, `POST /quotes`.

---

## API Key Scopes

| Scope | Description |
|-------|-------------|
| `read:shipments` | Read shipments and tracking events |
| `write:shipments` | Create and update shipments |
| `read:invoices` | Read invoices and payments |
| `write:invoices` | Create and update invoices |
| `read:analytics` | Read analytics data |

Keys are prefixed with `fwd_`, hashed with bcrypt for storage, and shown only once at creation time.

---

## Webhook Events

Webhooks fire on: `shipment.*`, `payment.*`, `invoice.*`, `quote.*`

Each delivery is signed with HMAC-SHA256 in the `X-Webhook-Signature` header.
Each delivery includes `X-Delivery-ID` for consumer-side deduplication.

Retry policy: 3 attempts with exponential backoff. After 3 failures → moved to DLQ.
