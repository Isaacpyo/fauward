# Fauward Backend

Fastify API powering the Fauward multi-tenant logistics platform.

---

## What this service does (non-technical)

The backend is the engine behind everything in Fauward. It handles:

- **Tenant accounts** — sign-up, login, billing, and plan management for logistics businesses
- **Shipment tracking** — real-time GPS updates pushed to browsers and mobile apps
- **Notifications** — emails and SMS sent to tenants and their customers on shipment events
- **Webhooks** — outbound HTTP events delivered to tenant-configured endpoints when things happen
- **Scheduled jobs** — nightly health scoring, trial expiry warnings, invoice sweeps, and more
- **Super-admin console** — internal tooling for the Fauward team to manage all tenants

---

## Tech stack

| Concern | Technology |
|---|---|
| Runtime | Node 20, TypeScript |
| Framework | Fastify |
| Database | PostgreSQL 15 (Supabase) via Prisma ORM |
| Cache / Streams | Redis (Upstash) — rate limiting, tracking streams, SMS quotas |
| Job queues | BullMQ on Railway Redis |
| Email | SendGrid |
| SMS | Twilio |
| Payments | Stripe |
| Custom domains | Vercel API |
| Deploy | Railway |

---

## Redis architecture (two connections)

The backend intentionally uses **two separate Redis instances**:

| Variable | Instance | Used for |
|---|---|---|
| `REDIS_URL` | Upstash | App cache, tracking streams (`track:stream:*`), rate limiting, SMS quotas, session data |
| `REDIS_QUEUE_URL` | Railway Redis | BullMQ queues and workers exclusively |

### Why the split?

BullMQ polls Redis continuously by design. Upstash charges per command — running queues there burned through the 500K free-tier command limit in a single month. Railway Redis has no per-command billing, so all queue traffic moved there. Upstash now only receives application-level cache reads/writes, keeping command counts predictable and low.

---

## Background workers

Eight workers run alongside the API process:

| Worker | Description | Poll interval |
|---|---|---|
| `outbox.worker` | Fans out domain events to notification / webhook / analytics queues | 5 s |
| `notification.worker` | Delivers emails (SendGrid) and SMS (Twilio) | BullMQ push |
| `webhook.worker` | POSTs signed payloads to tenant webhook endpoints, retries up to 5× | BullMQ push |
| `analytics.worker` | Writes delivery-latency metrics to Redis | BullMQ push |
| `scheduled.worker` | Runs cron jobs (invoice sweep, health scoring, trial warnings, etc.) | BullMQ repeatable |
| `history-writer.worker` | Reads GPS breadcrumbs from Redis Streams and writes to Postgres | 2 s |
| `ws-publisher.worker` | Reads tracking events from Redis Streams and pushes to WebSocket clients | 1 s |
| `escalation-sweeper.worker` | Scans in-transit shipments for stale GPS and raises escalation flags | 60 s |

All BullMQ workers have `stalledInterval: 60_000` — stalled-job detection runs every 60 seconds instead of the default 30, halving periodic Redis overhead.

---

## Environment variables

```
# Database
SUPABASE_DB_URL          PostgreSQL connection string (Supabase pooler)

# Redis
REDIS_URL                Upstash Redis — cache, tracking streams, session
REDIS_QUEUE_URL          Railway Redis — BullMQ queues (falls back to REDIS_URL if unset)

# Auth
JWT_ACCESS_SECRET        Minimum 32 chars
JWT_REFRESH_SECRET       Minimum 32 chars
JWT_ACCESS_EXPIRES_IN    Default: 15m
JWT_REFRESH_EXPIRES_IN   Default: 7d

# Platform admin
PLATFORM_SESSION_SECRET  Required in production
PLATFORM_REFRESH_SECRET  Required in production
PLATFORM_COOKIE_DOMAIN   Required in production

# Integrations
SENDGRID_API_KEY
TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM
STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET
VERCEL_API_TOKEN / VERCEL_PORTAL_PROJECT_ID
ROUTE_OPTIMIZER_URL      Default: http://localhost:8001
```

---

## Running locally

```bash
# Start all services (Postgres, Redis, MailHog)
docker-compose up -d

# Backend only
npm run dev:backend

# Run tests
npm run test

# Lint
npm run lint

# Prisma
npm run prisma:migrate --workspace=apps/backend
npm run prisma:generate --workspace=apps/backend
```

---

## Multi-tenancy rules

Every database query **must** be scoped to `tenantId`. There are no exceptions. Tenant context is resolved per-request via the `tenantResolver` middleware (subdomain or `X-Tenant-Slug` header) and is available via `getTenantContext()` throughout the request lifecycle.
