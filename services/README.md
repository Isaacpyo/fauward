# Services Implementation Guide

> A complete implementation reference for all microservices in the Fauward logistics platform.

This guide describes how each logical service in the system is built, wired together, and deployed — covering the current **modular-monolith** architecture and the incremental path toward a fully distributed service mesh as the platform scales.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Services Index](#2-services-index)
3. [analytics-engine](#3-analytics-engine)
4. [customs-gateway](#4-customs-gateway)
5. [fraud-detection](#5-fraud-detection)
6. [notification-service](#6-notification-service)
7. [ocr-processor](#7-ocr-processor)
8. [payment-processor](#8-payment-processor)
9. [pdf-generator](#9-pdf-generator)
10. [route-optimizer](#10-route-optimizer)
11. [search-engine](#11-search-engine)
12. [sms-gateway](#12-sms-gateway)
13. [tracking-service](#13-tracking-service)
14. [whatsapp-bot](#14-whatsapp-bot)
15. [Shared Infrastructure](#15-shared-infrastructure)
16. [Inter-Service Communication](#16-inter-service-communication)
17. [Deployment Guide](#17-deployment-guide)
18. [Scaling Strategy](#18-scaling-strategy)
19. [Security Across Services](#19-security-across-services)
20. [Environment Variables Reference](#20-environment-variables-reference)

---

## 1. System Overview

The Fauward platform is a multi-tenant logistics SaaS. The backend is currently implemented as a **modular monolith** — one Node.js/Fastify process containing all domain modules. Each domain module is a self-contained vertical slice designed for extraction into an independent service as load demands.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                                  │
│  Marketing Site · Tenant Portal · Driver PWA · Super Admin · Widget     │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │ HTTPS / WSS
┌─────────────────────────────────▼───────────────────────────────────────┐
│                        API GATEWAY (Fastify)                            │
│  CORS · Rate Limit · Tenant Resolver · JWT Auth · RBAC · Idempotency   │
└──────────┬──────────┬──────────┬──────────┬──────────┬──────────────────┘
           │          │          │          │          │
     ┌─────▼─┐  ┌─────▼─┐  ┌────▼──┐  ┌───▼───┐  ┌───▼──────────────┐
     │Track  │  │Notify │  │Payment│  │ PDF   │  │  Analytics …     │
     │Service│  │Service│  │Proc.  │  │ Gen.  │  │  + 8 more        │
     └───────┘  └───────┘  └───────┘  └───────┘  └──────────────────┘
           │          │          │          │
┌──────────▼──────────▼──────────▼──────────▼───────────────────────────┐
│            DATA LAYER: PostgreSQL · Redis · AWS S3                     │
└────────────────────────────────────────────────────────────────────────┘
           │
┌──────────▼──────────────────────────────────────────────────────────────┐
│         MESSAGE QUEUE: BullMQ (Redis-backed)                            │
│  notificationQueue · webhookQueue · outboxQueue · scheduledJobsQueue   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Monorepo layout

```
/workspace
├── apps/
│   ├── backend/          ← Fastify monolith (all domain modules live here)
│   ├── frontend/         ← Next.js 14 marketing site
│   ├── tenant-portal/    ← React/Vite tenant dashboard
│   ├── driver/           ← React/Vite PWA for drivers
│   └── super-admin/      ← React/Vite internal admin
├── packages/             ← Shared npm libraries (types, brand, formatting…)
├── services/             ← This guide + future standalone service packages
└── widget/               ← Embeddable vanilla-JS tracking widget
```

---

## 2. Services Index

| # | Service | Current location | Tier | Priority for extraction |
|---|---------|-----------------|------|------------------------|
| 1 | [analytics-engine](#3-analytics-engine) | `apps/backend/modules/analytics` | Pro / Enterprise | Phase 2 |
| 2 | [customs-gateway](#4-customs-gateway) | `apps/backend/modules/shipments` | Enterprise | Phase 3 |
| 3 | [fraud-detection](#5-fraud-detection) | `apps/backend/modules/payments` | All | Phase 2 |
| 4 | [notification-service](#6-notification-service) | `apps/backend/modules/notifications` | All | Phase 1 (first to extract) |
| 5 | [ocr-processor](#7-ocr-processor) | `apps/backend/modules/documents` | Pro / Enterprise | Phase 2 |
| 6 | [payment-processor](#8-payment-processor) | `apps/backend/modules/payments` | All | Phase 2 |
| 7 | [pdf-generator](#9-pdf-generator) | `apps/backend/modules/documents` | All | Phase 1 |
| 8 | [route-optimizer](#10-route-optimizer) | `apps/backend/modules/fleet` | Pro / Enterprise | Phase 2 |
| 9 | [search-engine](#11-search-engine) | `apps/backend/modules/shipments` | All | Phase 3 |
| 10 | [sms-gateway](#12-sms-gateway) | `apps/backend/modules/notifications` | Pro / Enterprise | Phase 1 |
| 11 | [tracking-service](#13-tracking-service) | `apps/backend/modules/tracking` | All | Phase 1 (first to extract) |
| 12 | [whatsapp-bot](#14-whatsapp-bot) | `apps/backend/modules/notifications` | Pro / Enterprise | Phase 2 |

---

## 3. analytics-engine

### Purpose
Aggregates shipment, revenue, and operational KPIs across all tenants. Powers the analytics dashboards in the tenant portal and super-admin. Supports CSV exports and — at Enterprise tier — data-warehouse streaming.

### What it does
- Computes KPI snapshots: shipment volumes by status, on-time rate, SLA breach counts, revenue by period, top customers, staff performance.
- Maintains pre-aggregated Redis caches (TTL 5 min) for dashboard latency targets.
- Triggers scheduled aggregate refresh jobs via `scheduledJobsQueue`.
- Streams incremental events to a data warehouse endpoint at Enterprise tier.

### Module anatomy (current monolith path)

```
apps/backend/src/modules/analytics/
├── analytics.routes.ts      ← GET /analytics/overview, /kpi, /reports
├── analytics.service.ts     ← Aggregation logic, Redis cache management
├── analytics.schema.ts      ← Zod: date ranges, metric filters, pagination
└── analytics.worker.ts      ← BullMQ worker: scheduled refresh jobs
```

### Key API endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/analytics/overview` | `TENANT_ADMIN` | Volume + status summary for current period |
| `GET` | `/analytics/kpi` | `TENANT_ADMIN` | On-time rate, avg delivery time, SLA breaches |
| `GET` | `/analytics/revenue` | `TENANT_ADMIN` | Revenue by day/week/month (Pro+) |
| `GET` | `/analytics/reports/csv` | `TENANT_ADMIN` | Full CSV export of shipment data |
| `GET` | `/admin/analytics` | `SUPER_ADMIN` | Cross-tenant system KPIs |

### Data flow

```
Shipment status change
        │
        ▼
outbox_events table (published = false)
        │
        ▼ (outboxWorker, every 1 s)
analyticsQueue (BullMQ)
        │
        ▼
analyticsWorker
  ├── Increment Redis counter  analytics:{tenantId}:delivered
  ├── Invalidate cache         analytics:{tenantId}:overview
  └── (Enterprise) POST event to data warehouse webhook
```

### Dependencies
- **PostgreSQL** — source of truth for all aggregate queries
- **Redis** — short-lived aggregate cache (TTL 5 min)
- **BullMQ** — `analyticsQueue` + `scheduledJobsQueue`

### Extraction checklist (Phase 2)
- [ ] Move `analytics.service.ts` into `services/analytics-engine/src/`
- [ ] Expose a gRPC or HTTP/2 internal endpoint consumed by the monolith
- [ ] Replace direct Prisma queries with read-replica connection string
- [ ] Add dedicated Redis namespace `analytics:*`
- [ ] Deploy as a separate ECS task (read-only DB credentials)

---

## 4. customs-gateway

### Purpose
Handles cross-border compliance: customs declarations, duty calculation, submission to national customs authorities, and e-invoicing for Enterprise tenants operating internationally.

### What it does
- Generates customs declaration documents (commercial invoice, HS code classification, declared value).
- Submits electronic declarations to regional customs platforms (UK CDS, EU AES/ICS2, NICIS II, FASAH, Dubai Mirsal 2, ACE, ACID).
- Validates HS codes against TARIC / national tariff databases.
- Manages duty and tax calculation per shipment origin/destination.
- Handles e-invoicing mandates: PEPPOL (UK/EU), FIRS BIS Billing 3.0 (Nigeria), KRA eTIMS (Kenya), ZATCA Phase 2 (Saudi Arabia), ETA (Egypt), SARS (South Africa).

### Module anatomy (current monolith path)

```
apps/backend/src/modules/customs/
├── customs.routes.ts       ← POST /customs/declare, GET /customs/:shipmentId
├── customs.service.ts      ← Declaration logic, authority submission
├── customs.schema.ts       ← Zod: HS codes, declared value, party details
├── customs.providers/
│   ├── uk-cds.ts           ← HMRC CDS REST API adapter
│   ├── nigeria-firs.ts     ← FIRS e-invoice BIS Billing 3.0 adapter
│   ├── kenya-etims.ts      ← KRA eTIMS adapter
│   ├── saudi-zatca.ts      ← ZATCA Phase 2 adapter
│   └── peppol.ts           ← PEPPOL access point adapter
└── customs.worker.ts       ← BullMQ worker: async declaration submission
```

### Regional compliance matrix

| Region | Authority | Standard | Trigger |
|--------|-----------|----------|---------|
| UK | HMRC | CDS / MTD | Export shipment created |
| EU | National customs | AES / ICS2 / PEPPOL | Cross-border shipment |
| Nigeria | FIRS | BIS Billing 3.0 | Invoice generated |
| Kenya | KRA | eTIMS | Invoice generated |
| Saudi Arabia | ZATCA | Phase 2 e-invoice | Invoice generated |
| Egypt | ETA | e-invoice | Invoice generated |
| South Africa | SARS | VAT e-filing | Monthly |
| USA | CBP | ACE | Import/export |

### Dependencies
- **PostgreSQL** — shipment + invoice records
- **AWS S3** — signed document storage for submitted declarations
- **BullMQ** — `customsQueue` for async authority submissions
- **External APIs** — HMRC, FIRS, KRA, ZATCA, PEPPOL access point

### Environment variables

```env
HMRC_CLIENT_ID=
HMRC_CLIENT_SECRET=
HMRC_SANDBOX=true           # false in production
FIRS_API_KEY=
ZATCA_CERT_PEM=             # ZATCA cryptographic stamp certificate
KRA_ETIMS_API_KEY=
PEPPOL_ACCESS_POINT_URL=
```

### Extraction checklist (Phase 3)
- [ ] Isolate into `services/customs-gateway/`
- [ ] Store authority credentials per tenant in AWS Secrets Manager (not env vars)
- [ ] Implement retry + DLQ for each authority provider independently
- [ ] Add webhook callback handler for async authority responses
- [ ] Rate-limit per authority to respect API quotas

---

## 5. fraud-detection

### Purpose
Analyses payment and booking behaviour in real time to block fraudulent transactions before they reach payment gateways or create phantom shipments.

### What it does
- Scores each payment attempt using a rule engine (velocity checks, card BIN analysis, IP reputation, device fingerprint).
- Blocks transactions that exceed a configurable risk threshold.
- Flags suspicious accounts for manual review.
- Logs all score decisions to `fraud_events` table for audit and model tuning.
- Integrates with Stripe Radar for card-not-present risk signals.

### Rule engine (current implementation)

```
Payment attempt received
        │
        ▼
FraudScorer.score(context: FraudContext): FraudDecision
  │
  ├── VelocityCheck       — > 5 attempts from same IP in 10 min → +40 pts
  ├── NewAccountCheck     — account < 24 h old + high-value → +20 pts
  ├── GeoAnomalyCheck     — card country ≠ IP country → +30 pts
  ├── DeviceFingerprintCheck — new device + new card → +15 pts
  └── StripeRadarCheck    — Stripe risk_level='high' → +50 pts
        │
        ▼
  score >= 80 → BLOCK (HTTP 402 + FRAUD_DETECTED code)
  score 50–79 → REVIEW (payment held, alert sent to TENANT_ADMIN)
  score < 50  → ALLOW (proceed to gateway)
```

### Module anatomy (current monolith path)

```
apps/backend/src/modules/payments/fraud/
├── fraud.scorer.ts         ← Rule engine, score aggregation
├── fraud.rules/
│   ├── velocity.rule.ts
│   ├── geo-anomaly.rule.ts
│   ├── device.rule.ts
│   └── stripe-radar.rule.ts
└── fraud.logger.ts         ← Writes fraud_events rows
```

### Dependencies
- **Redis** — velocity counters (TTL 10 min sliding window), `rl:fraud:{ip}`
- **PostgreSQL** — `fraud_events` table (audit log)
- **Stripe** — `radar.risk_level` from PaymentIntent response

### Extraction checklist (Phase 2)
- [ ] Expose as an internal HTTP service: `POST /score` → `{ decision, score, reasons }`
- [ ] Consume via payment-processor service (internal call before gateway charge)
- [ ] Store ML model artefacts in S3 for future model-based scoring
- [ ] Add feedback loop: chargebacks update rule weights

---

## 6. notification-service

### Purpose
Delivers all outbound communications: transactional emails, in-app notifications, and (at Pro+) SMS. This is the **first service recommended for extraction** because its BullMQ worker is already decoupled from the HTTP request path.

### What it does
- Processes jobs from `notificationQueue` (BullMQ).
- Sends transactional emails via **SendGrid** using per-tenant branded templates.
- Sends SMS via **Twilio** (Pro + Enterprise).
- Persists every delivery attempt to `notification_log` (success, failure, provider response).
- Supports 8 notification event types with configurable per-tenant opt-in/out.

### Notification event matrix

| Event | Email | SMS (Pro+) | In-App |
|-------|:-----:|:----------:|:------:|
| `booking.confirmed` | ✅ | ✅ | ✅ |
| `payment.received` | ✅ | ✅ | ✅ |
| `shipment.picked_up` | ✅ | ✅ | ✅ |
| `shipment.in_transit` | ✅ | — | ✅ |
| `shipment.out_for_delivery` | ✅ | ✅ | ✅ |
| `shipment.delivered` | ✅ | ✅ | ✅ |
| `invoice.sent` | ✅ | — | ✅ |
| `invoice.overdue` | ✅ | ✅ | ✅ |

### Module anatomy (current monolith path)

```
apps/backend/src/modules/notifications/
├── notifications.routes.ts   ← GET /notifications (in-app list), PATCH /:id/read
├── notifications.service.ts  ← Enqueue jobs, manage in-app records
├── notifications.schema.ts   ← Zod: event types, recipient, template data
├── notifications.worker.ts   ← BullMQ worker: sendEmail(), sendSms()
└── templates/
    ├── booking-confirmed.html
    ├── shipment-delivered.html
    └── invoice-overdue.html   ← (one per event type)
```

### Worker internals

```typescript
// notifications.worker.ts
notificationWorker.process(async (job) => {
  const { type, to, template, data, tenantId } = job.data;

  if (type === 'email') {
    await sendGrid.send({
      to,
      from: tenant.emailFromAddress,     // white-labelled sender
      templateId: template,
      dynamicTemplateData: data,
    });
  }

  if (type === 'sms') {
    await twilio.messages.create({ to, body: data.message, from: TWILIO_FROM });
  }

  await db.notificationLog.create({ data: { ...job.data, status: 'SENT' } });
});
```

### Queue configuration

```
Queue:       notificationQueue
Retries:     3
Backoff:     exponential (2 s, 4 s, 8 s)
Concurrency: 10
DLQ:         dlq:notificationQueue
```

### Dependencies
- **Redis** — BullMQ queue backing store
- **PostgreSQL** — `notification_log`, `notifications` (in-app records)
- **SendGrid** — transactional email delivery
- **Twilio** — SMS (Pro+)

### Environment variables

```env
SENDGRID_API_KEY=SG.xxxx
TWILIO_ACCOUNT_SID=ACxxxx
TWILIO_AUTH_TOKEN=
TWILIO_FROM=+15005550006
```

### Extraction checklist (Phase 1)
- [ ] Move worker into `services/notification-service/`
- [ ] Expose a thin HTTP POST `/notify` endpoint (the monolith enqueues, this service processes)
- [ ] Share `notificationQueue` Redis connection string across monolith + service
- [ ] Add per-tenant template overrides stored in S3
- [ ] Deploy as separate ECS task with auto-scaling on queue depth

---

## 7. ocr-processor

### Purpose
Extracts structured data from physical documents uploaded by drivers or customers: proof-of-delivery photos, customs documents, bills of lading, invoices.

### What it does
- Accepts image or PDF uploads (JPEG, PNG, PDF).
- Runs ClamAV malware scan before processing.
- Classifies document type (POD, invoice, waybill, ID).
- Extracts key fields: tracking number, recipient name, signature presence, timestamps, declared values.
- Returns structured JSON attached to the parent shipment record.
- Stores original file in S3 with a signed 1-hour URL.

### Processing pipeline

```
Upload: POST /documents/upload  (multipart/form-data)
        │
        ▼
  1. ClamAV malware scan  →  reject if infected
  2. Store raw file in S3: uploads/{tenantId}/{shipmentId}/{uuid}.{ext}
  3. Enqueue ocrQueue job  { s3Key, shipmentId, docType }
        │
        ▼  (ocrWorker)
  4. Download from S3 into memory buffer
  5. Pre-process: grayscale, deskew, contrast (sharp)
  6. OCR: Tesseract.js (self-hosted) OR Google Vision API
  7. Post-process: regex field extraction
  8. UPDATE shipment_documents SET extracted_data = { … }
  9. Emit outbox event: document.processed
```

### Module anatomy (current monolith path)

```
apps/backend/src/modules/documents/ocr/
├── ocr.routes.ts           ← POST /documents/upload, GET /documents/:id
├── ocr.service.ts          ← Upload handling, S3, ClamAV, enqueue
├── ocr.worker.ts           ← BullMQ worker: OCR pipeline
├── ocr.extractors/
│   ├── pod.extractor.ts    ← Signature presence, recipient, timestamp
│   ├── invoice.extractor.ts← Amount, invoice number, date, parties
│   └── waybill.extractor.ts← Tracking number, HS codes, weight
└── ocr.schema.ts           ← Zod: upload metadata validation
```

### Dependencies
- **AWS S3** — raw document storage
- **Redis** — BullMQ queue backing store
- **PostgreSQL** — `shipment_documents` table
- **ClamAV** — malware scanning (sidecar container in production)
- **Tesseract.js** OR **Google Vision API** — OCR engine

### Environment variables

```env
CLAMAV_HOST=clamav
CLAMAV_PORT=3310
GOOGLE_VISION_API_KEY=        # leave blank to use Tesseract fallback
S3_BUCKET=fauward-documents
S3_REGION=eu-west-2
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

### Extraction checklist (Phase 2)
- [ ] Move into `services/ocr-processor/`
- [ ] ClamAV as a sidecar in the same ECS task definition
- [ ] Expose `POST /ocr` endpoint returning `jobId` (async result via webhook)
- [ ] Store extracted JSON in S3 alongside source document
- [ ] Add confidence scoring; route low-confidence results to manual review queue

---

## 8. payment-processor

### Purpose
Processes all monetary transactions: one-off shipment payments, monthly SaaS subscriptions, and recurring invoices. Abstracts over multiple regional gateways behind a single interface.

### What it does
- Creates payment intents / charges via Stripe (global), Paystack (West Africa), Flutterwave (pan-Africa), or M-Pesa (East Africa) depending on tenant region.
- Receives and verifies gateway webhooks (HMAC / signature validation per provider).
- Manages SaaS subscription lifecycle: trial → active → past_due → cancelled.
- Runs dunning logic: automatic retry schedule on failed subscription payments.
- Exposes customer billing portal (Stripe hosted portal or custom flow for non-Stripe).
- Writes a canonical `payments` record regardless of gateway — normalised schema.

### Gateway adapter pattern

```typescript
interface PaymentAdapter {
  createIntent(amount: Money, customer: Customer): Promise<PaymentIntent>;
  confirmPayment(intentId: string): Promise<PaymentResult>;
  createSubscription(plan: Plan, customer: Customer): Promise<Subscription>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  handleWebhook(rawBody: Buffer, signature: string): Promise<WebhookEvent>;
}

// Implementations:
class StripeAdapter implements PaymentAdapter { … }
class PaystackAdapter implements PaymentAdapter { … }
class FlutterwaveAdapter implements PaymentAdapter { … }
class MpesaAdapter implements PaymentAdapter { … }
```

### Module anatomy (current monolith path)

```
apps/backend/src/modules/payments/
├── payments.routes.ts          ← POST /payments/intent, POST /payments/webhook/:provider
├── payments.service.ts         ← Gateway selection, intent creation, dunning scheduler
├── payments.schema.ts          ← Zod: amount, currency, provider, plan
├── payments.adapters/
│   ├── stripe.adapter.ts
│   ├── paystack.adapter.ts
│   ├── flutterwave.adapter.ts
│   └── mpesa.adapter.ts
├── subscriptions.service.ts    ← Trial management, plan enforcement
└── dunning.service.ts          ← Retry schedule, past_due → cancelled logic
```

### Subscription state machine

```
TRIALING (14 days)
    │  Trial expires or manual upgrade
    ▼
ACTIVE
    │  Payment fails
    ▼
PAST_DUE  (retry: +3 d, +7 d, +14 d)
    │  All retries fail
    ▼
CANCELLED  ← data retained, access suspended
    │  User resubscribes
    ▼
ACTIVE
```

### Webhook endpoint security

Every provider webhook endpoint validates the provider signature before processing:

```
POST /payments/webhook/stripe    ← Stripe-Signature header (HMAC-SHA256)
POST /payments/webhook/paystack  ← X-Paystack-Signature (HMAC-SHA256)
POST /payments/webhook/mpesa     ← IP allowlist + Basic auth
```

### Dependencies
- **PostgreSQL** — `payments`, `subscriptions`, `invoices` tables
- **Redis** — idempotency cache for webhook deduplication
- **BullMQ** — `dunningQueue` for retry scheduling
- **Stripe, Paystack, Flutterwave, M-Pesa** — external gateways

### Environment variables

```env
STRIPE_SECRET_KEY=sk_live_xxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxx
PAYSTACK_SECRET_KEY=sk_live_xxxx
FLUTTERWAVE_SECRET_KEY=FLWSECK-xxxx
MPESA_CONSUMER_KEY=
MPESA_CONSUMER_SECRET=
MPESA_SHORTCODE=
MPESA_PASSKEY=
```

### Extraction checklist (Phase 2)
- [ ] Move into `services/payment-processor/`
- [ ] Store gateway secrets per tenant in AWS Secrets Manager (not shared env vars)
- [ ] Expose `POST /charge`, `POST /subscribe`, `POST /webhook/:provider`
- [ ] Emit normalised payment events to internal event bus (outbox pattern)
- [ ] PCI-DSS scoping: ensure this service is the only one touching raw card data

---

## 9. pdf-generator

### Purpose
Generates all tenant-branded PDF documents: delivery notes, invoices, cargo manifests, shipping labels with QR codes, and (at Enterprise) air waybills and bills of lading.

### What it does
- Renders Handlebars HTML templates with shipment/invoice data injected.
- Runs Puppeteer (headless Chrome) to produce pixel-perfect PDFs.
- Applies per-tenant branding: logo, colour palette, custom header/footer.
- Embeds QR codes pointing to the public tracking URL.
- Stores generated PDFs in S3 and returns a signed 1-hour URL.
- Supports async generation (enqueue + webhook callback) for bulk manifests.

### Document types

| Document | Tier | Template file |
|----------|------|--------------|
| Booking confirmation | All | `booking-confirmation.hbs` |
| Delivery note | All | `delivery-note.hbs` |
| Proof of delivery | All | `pod.hbs` |
| Cargo manifest | All | `cargo-manifest.hbs` |
| Packing list | All | `packing-list.hbs` |
| Invoice (standard) | All | `invoice.hbs` |
| Invoice (branded) | Pro+ | `invoice-branded.hbs` |
| Shipping label (A6 + QR) | All | `shipping-label.hbs` |
| Air waybill (IATA) | Enterprise | `air-waybill.hbs` |
| Bill of lading (IMO) | Enterprise | `bill-of-lading.hbs` |
| Commercial invoice (customs) | Enterprise | `commercial-invoice.hbs` |

### Generation pipeline

```
POST /documents/generate  { type, shipmentId, tenantId }
        │
        ▼
  1. Fetch shipment + invoice + tenant branding from DB
  2. Merge into Handlebars template
  3. Launch Puppeteer: renderHTML → PDF buffer
  4. Embed QR code (qrcode library → base64 PNG → <img> in template)
  5. Upload PDF to S3: docs/{tenantId}/{type}/{uuid}.pdf
  6. INSERT shipment_documents { s3Key, signedUrl, expiresAt }
  7. Return { url: signedUrl, expiresIn: 3600 }
```

### Module anatomy (current monolith path)

```
apps/backend/src/modules/documents/
├── documents.routes.ts         ← POST /documents/generate, GET /documents/:id/url
├── documents.service.ts        ← Template selection, Puppeteer orchestration, S3 upload
├── documents.schema.ts         ← Zod: document type, entity IDs
├── templates/
│   ├── delivery-note.hbs
│   ├── invoice.hbs
│   ├── shipping-label.hbs
│   └── … (one per document type)
└── documents.worker.ts         ← BullMQ worker for bulk/async generation
```

### Dependencies
- **Puppeteer** — headless Chrome PDF rendering
- **Handlebars** — HTML template engine
- **qrcode** — QR code generation
- **AWS S3** — PDF storage
- **PostgreSQL** — source data for templates
- **Redis** — BullMQ `pdfQueue`

### Environment variables

```env
S3_BUCKET=fauward-documents
S3_REGION=eu-west-2
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium  # set in Docker image
```

### Extraction checklist (Phase 1)
- [ ] Move into `services/pdf-generator/`
- [ ] Package Chromium into the Docker image (avoid downloading at runtime)
- [ ] Expose `POST /generate` → `{ jobId }` and `GET /jobs/:jobId` → `{ status, url }`
- [ ] Pre-warm Puppeteer browser instance (do not spawn per request)
- [ ] Set memory limit to 1 GB — Puppeteer is memory-intensive
- [ ] Deploy on Fargate with `cpu: 512, memory: 1024`

---

## 10. route-optimizer

### Purpose
Calculates optimal delivery routes for drivers assigned multiple stops on a single day, minimising total distance and respecting time windows.

### What it does
- Takes a list of delivery stops (addresses + optional time windows) for one driver.
- Calls Google Maps Distance Matrix API to build a pairwise distance/duration matrix.
- Runs a nearest-neighbour heuristic + 2-opt improvement to produce an ordered stop list.
- Returns turn-by-turn directions URL per stop (Google Maps deep link).
- Caches the resulting route per driver per day (Redis TTL 1 h — refreshed if stops change).
- Provides capacity planning view: warns when a driver's stop count exceeds working-hours limit.

### Optimisation algorithm

```
Input: [ stop_0=depot, stop_1, stop_2, … stop_n ]
        + distance_matrix[i][j] (Google Maps)

Phase 1 — Nearest Neighbour:
  Start at depot → greedily pick closest unvisited stop → repeat

Phase 2 — 2-opt improvement:
  For each pair (i, j):
    If reversing sub-route [i..j] reduces total distance → apply swap
  Repeat until no improvement found

Output: ordered stop list, total_distance_km, estimated_duration_min
```

### Module anatomy (current monolith path)

```
apps/backend/src/modules/fleet/route/
├── route.routes.ts             ← POST /fleet/routes/optimize, GET /fleet/routes/:driverId
├── route.service.ts            ← Algorithm, Google Maps calls, Redis cache
├── route.schema.ts             ← Zod: driver ID, stop list, date
└── route.optimizer.ts          ← Nearest neighbour + 2-opt implementation
```

### Dependencies
- **Google Maps Platform** — Distance Matrix API
- **Redis** — route cache, `route:{driverId}:{date}` (TTL 1 h)
- **PostgreSQL** — `shipments`, `drivers`, `routes` tables

### Environment variables

```env
GOOGLE_MAPS_API_KEY=
```

### Extraction checklist (Phase 2)
- [ ] Move into `services/route-optimizer/`
- [ ] Replace heuristic with OR-Tools / OSRM for larger stop counts (> 30)
- [ ] Add real-time re-optimisation when a stop is added/removed mid-day
- [ ] Expose `POST /optimize` (sync for ≤ 20 stops) and `POST /optimize/async` (BullMQ for > 20)
- [ ] Support time-window constraints (customer requested delivery slots)

---

## 11. search-engine

### Purpose
Provides fast, multi-field search across shipments, customers, invoices, and drivers for the tenant portal and super-admin.

### What it does
- Full-text search powered by **PostgreSQL `tsvector`** — no external search service required at current scale.
- Tenant-scoped: every query is automatically filtered to the requesting tenant via Prisma middleware.
- Supports fuzzy matching on tracking numbers, recipient names, addresses, and reference codes.
- Returns paginated, relevance-ranked results with hit highlighting.
- Super-admin cross-tenant search (additional `tenantId` filter parameter).

### Search implementation

```sql
-- Shipment search index (maintained by trigger)
ALTER TABLE shipments ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(tracking_number, '') || ' ' ||
      coalesce(recipient_name, '') || ' ' ||
      coalesce(recipient_address, '') || ' ' ||
      coalesce(reference, '')
    )
  ) STORED;

CREATE INDEX shipments_search_idx ON shipments USING GIN(search_vector);
```

### Module anatomy (current monolith path)

```
apps/backend/src/modules/search/
├── search.routes.ts            ← GET /search?q=&type=shipment|customer|invoice
├── search.service.ts           ← PostgreSQL full-text query builder
└── search.schema.ts            ← Zod: query string, entity type, pagination
```

### Extraction checklist (Phase 3)
When shipments table exceeds 10 M rows, migrate to **Elasticsearch** or **Typesense**:
- [ ] Move into `services/search-engine/`
- [ ] Set up Typesense (self-hosted, cheaper) or OpenSearch
- [ ] Sync pipeline: Prisma → outbox → `searchIndexQueue` → Typesense
- [ ] Maintain per-tenant index namespacing for data isolation
- [ ] Expose `GET /search?q=&index=&tenantId=` with JWT auth

---

## 12. sms-gateway

### Purpose
Delivers SMS notifications to shipment recipients and tenant staff. Decoupled from email so each channel can be independently scaled, rate-limited, and monitored.

### What it does
- Processes SMS jobs from `notificationQueue` (shared with email, filtered by `type === 'sms'`).
- Sends via **Twilio** globally; falls back to regional providers where Twilio coverage is limited.
- Handles delivery status callbacks from Twilio (delivered / failed / undelivered).
- Enforces tenant-level SMS quota (daily limit per plan tier).
- Supports OTP SMS for MFA flows.

### Regional SMS provider matrix

| Region | Primary | Fallback |
|--------|---------|---------|
| Global | Twilio | — |
| Nigeria | Twilio | Termii |
| Kenya | Twilio | Africa's Talking |
| South Africa | Twilio | BulkSMS |
| UAE / Saudi | Twilio | Unifonic |

### Module anatomy (current monolith path)

```
apps/backend/src/modules/notifications/sms/
├── sms.service.ts              ← Provider selection, quota check, send
├── sms.providers/
│   ├── twilio.provider.ts
│   ├── termii.provider.ts      ← Nigeria fallback
│   └── africastalking.provider.ts
├── sms.quota.ts                ← Daily SMS limit enforcement per plan
└── sms.webhook.ts              ← Twilio status callback handler
```

### Quota by plan

| Plan | Daily SMS limit |
|------|----------------|
| Starter | 0 (email only) |
| Pro | 500 |
| Enterprise | Unlimited |

### Dependencies
- **Redis** — daily SMS counter, `sms:count:{tenantId}:{YYYY-MM-DD}` (TTL 48 h)
- **PostgreSQL** — `notification_log` for delivery tracking
- **Twilio** — primary SMS API
- **Termii / Africa's Talking** — regional fallbacks

### Environment variables

```env
TWILIO_ACCOUNT_SID=ACxxxx
TWILIO_AUTH_TOKEN=
TWILIO_FROM=+15005550006
TERMII_API_KEY=               # Nigeria fallback
AT_API_KEY=                   # Africa's Talking (Kenya)
AT_USERNAME=
```

### Extraction checklist (Phase 1)
- [ ] Split SMS worker from email worker in `services/sms-gateway/`
- [ ] Separate `smsQueue` from `notificationQueue` for independent scaling
- [ ] Add smart routing: try primary provider, auto-failover on 5xx within 3 s
- [ ] Expose `POST /sms/send` internal endpoint
- [ ] Monitor delivery rate per provider; alert if rate drops below 95 %

---

## 13. tracking-service

### Purpose
Provides real-time shipment location and status updates to customers, the tenant portal, and the embeddable widget. This is the **highest-traffic service** and the **first domain recommended for extraction**.

### What it does
- Exposes a **public** (unauthenticated) `GET /track/:trackingNumber` endpoint.
- Maintains a **WebSocket server** (Socket.io) with per-shipment rooms scoped to tenant.
- Pushes `status_update` events to all subscribers when shipment status changes.
- Accepts driver location pings (`POST /tracking/location`) and stores in Redis (TTL 5 min).
- Reads shipment status from Redis cache (TTL 30 s) to avoid DB hits on the hot tracking path.
- Exposes the embeddable widget data endpoint at `GET /widget/:trackingNumber`.

### WebSocket room model

```
Room naming:  {tenantId}:{trackingNumber}

Subscribers:
  - Tenant portal (authenticated, any shipment in tenant)
  - Public tracking page (unauthenticated, specific shipment)
  - Embeddable widget (any host page with tenant script tag)

Event emitted on status change:
  {
    type: "status_update",
    trackingNumber: "FWD-202506-A3F9K2",
    status: "DELIVERED",
    timestamp: "2025-06-15T14:23:00Z",
    location: { lat, lng }   // if available
  }
```

### Data flow

```
Driver marks status "DELIVERED"
        │
        │  PATCH /shipments/{id}/status
        ▼
  Shipments Module (monolith)
    ├── UPDATE shipments SET status='DELIVERED'
    ├── INSERT outbox_events (published=false)
    └── io.to(`{tenantId}:{trackingNum}`).emit('status_update', …)  ← real-time
                │
                │ (1 s later, outboxWorker)
                ▼
        notificationQueue → email/SMS to customer
        webhookQueue      → POST to tenant webhook URL
```

### Module anatomy (current monolith path)

```
apps/backend/src/modules/tracking/
├── tracking.routes.ts          ← GET /track/:number, POST /tracking/location
├── tracking.service.ts         ← Redis cache reads, location storage
├── tracking.gateway.ts         ← Socket.io setup, room management
└── tracking.schema.ts          ← Zod: tracking number format, location payload
```

### Redis keys used

| Key | TTL | Purpose |
|-----|-----|---------|
| `shipment:{id}:status` | 30 s | Cached status for hot tracking path |
| `driver:{driverId}:location` | 5 min | Last known GPS coordinate |
| Socket.io adapter | — | Cross-instance pub/sub (Redis adapter) |

### Dependencies
- **Redis** — status cache, driver location, Socket.io adapter
- **PostgreSQL** — source of truth for shipment data
- **Socket.io** — WebSocket server with Redis adapter for horizontal scaling

### Extraction checklist (Phase 1 — highest priority)
- [ ] Move into `services/tracking-service/`
- [ ] Deploy 2–4 instances behind an Application Load Balancer with sticky sessions disabled (Redis pub/sub handles cross-instance sync)
- [ ] Use Redis Cluster (Upstash) for Socket.io adapter at scale
- [ ] Add separate rate limit: 200 req/min per IP on public tracking endpoint
- [ ] Expose `GET /internal/shipment-status/:id` for other services to call
- [ ] Instrument with CloudWatch: active WebSocket connections, events/s, cache hit rate

---

## 14. whatsapp-bot

### Purpose
Enables customers and drivers to interact with the platform via WhatsApp: check shipment status, receive delivery notifications, and (at Enterprise) create bookings via conversational flow.

### What it does
- Integrates with **WhatsApp Business API** (Meta Cloud API or a BSP like Twilio Conversations / Bird).
- Handles inbound messages: tracking queries, delivery confirmation, booking requests.
- Sends outbound notifications for the same 8 event types as email/SMS, formatted as WhatsApp templates.
- Uses a finite-state conversation engine to guide multi-turn interactions.
- Falls back to human handoff (live chat in tenant portal) when bot confidence is low.

### Conversation state machine

```
States:  IDLE → GREETING → TRACKING_QUERY → BOOKING_FLOW → HANDOFF → END

IDLE
  │  Inbound message received
  ▼
GREETING
  "Hi! I'm the Fauward assistant for {tenant}. How can I help?"
  [1] Track a shipment   [2] Report an issue   [3] Talk to a human
        │                        │                        │
        ▼                        ▼                        ▼
TRACKING_QUERY           ISSUE_REPORT              HANDOFF (live agent)
  "Enter tracking #"     "Describe the issue"
        │
        ▼
  Fetch from /track/:number
  Reply with status card (WhatsApp interactive message)
```

### Module anatomy (current monolith path)

```
apps/backend/src/modules/notifications/whatsapp/
├── whatsapp.routes.ts          ← POST /webhooks/whatsapp (Meta webhook verification + messages)
├── whatsapp.service.ts         ← Inbound message routing, conversation state
├── whatsapp.bot.ts             ← State machine, intent detection
├── whatsapp.templates/
│   ├── shipment-delivered.json ← WhatsApp-approved template payloads
│   ├── out-for-delivery.json
│   └── booking-confirmed.json
└── whatsapp.schema.ts          ← Zod: webhook payload validation
```

### Webhook verification

```
GET /webhooks/whatsapp
  ?hub.mode=subscribe
  &hub.verify_token={WHATSAPP_VERIFY_TOKEN}
  &hub.challenge=xxxx
→ Return hub.challenge (Meta verifies endpoint)

POST /webhooks/whatsapp
  X-Hub-Signature-256: sha256={HMAC of raw body with app secret}
→ Verify signature before processing
```

### Dependencies
- **WhatsApp Business API** (Meta Cloud API)
- **Redis** — conversation session state, `wa:session:{phoneNumber}` (TTL 30 min)
- **PostgreSQL** — `whatsapp_sessions`, `notification_log`
- **notificationQueue** — outbound template messages share the same queue

### Environment variables

```env
WHATSAPP_API_TOKEN=          # Meta permanent system user token
WHATSAPP_PHONE_NUMBER_ID=    # Meta phone number ID
WHATSAPP_APP_SECRET=         # For webhook HMAC verification
WHATSAPP_VERIFY_TOKEN=       # Custom string for webhook setup
```

### Extraction checklist (Phase 2)
- [ ] Move into `services/whatsapp-bot/`
- [ ] Store conversation state in Redis with a 30-min session TTL
- [ ] Add NLP layer (Dialogflow CX or AWS Lex) for intent detection in Phase 3
- [ ] Multi-language: English, French, Arabic, Swahili supported via template locale
- [ ] Rate limit: Meta enforces 1,000 conversations/day on free tier — implement quota guard

---

## 15. Shared Infrastructure

All services share the following infrastructure components.

### PostgreSQL (Supabase / AWS RDS)

```
Connection strings:
  SUPABASE_DB_URL         ← Pooled connection (PgBouncer) — for normal queries
  SUPABASE_DIRECT_URL     ← Direct connection — for Prisma migrations only

Tenant isolation:
  Prisma middleware auto-appends WHERE tenant_id = {ctx.tenant.id} on every query
  No query executes without tenant scope — enforced at middleware level, not convention

Read replica:
  DATABASE_READ_URL       ← Route heavy analytics queries here (set in analytics-engine)
```

### Redis (Upstash)

```
REDIS_URL=rediss://xxxx.upstash.io:6379

Key namespace conventions:
  session:{userId}                 ← User sessions (TTL 7 d)
  shipment:{id}:status             ← Status cache (TTL 30 s)
  zones:{tenantId}                 ← Pricing zone matrix (TTL 24 h)
  analytics:{tenantId}:{metric}    ← Aggregates (TTL 5 min)
  rl:{identifier}:{route}          ← Rate limit counters (TTL 1 min)
  driver:{driverId}:location       ← GPS (TTL 5 min)
  wa:session:{phone}               ← WhatsApp conversation state (TTL 30 min)
  sms:count:{tenantId}:{date}      ← SMS quota counter (TTL 48 h)
```

### AWS S3

```
Bucket:  fauward-documents (or fauward-documents-dev for local dev)
Region:  eu-west-2  (primary)
         eu-central-1 (cross-region replication)

Key structure:
  uploads/{tenantId}/{shipmentId}/{uuid}.{ext}    ← raw uploads (POD photos, docs)
  docs/{tenantId}/{docType}/{uuid}.pdf            ← generated PDFs
  exports/{tenantId}/reports/{uuid}.csv           ← analytics CSV exports

URL policy:
  All URLs are signed, expire in 1 hour
  Direct S3 URLs are never exposed — always proxied through the backend

Upload security:
  ClamAV scan before any file is stored or processed
  Max file size: 10 MB
  Allowed MIME types: image/jpeg, image/png, application/pdf
```

### BullMQ Queues

| Queue | Producer | Consumer | Concurrency | Retries |
|-------|----------|----------|-------------|---------|
| `notificationQueue` | Any module | notification-service | 10 | 3 (exp backoff) |
| `webhookQueue` | shipments, payments | webhookWorker | 20 | 3 (exp backoff) |
| `outboxQueue` | outboxPoller | outboxWorker | 5 | 3 |
| `pdfQueue` | documents module | pdf-generator | 3 | 2 |
| `ocrQueue` | documents module | ocr-processor | 2 | 2 |
| `analyticsQueue` | outboxWorker | analytics-engine | 5 | 3 |
| `scheduledJobsQueue` | cron scheduler | scheduledWorker | 1 | 1 |
| `dunningQueue` | subscriptions | payment-processor | 5 | 3 |

All queues have a corresponding DLQ (`dlq:{queueName}`). A CloudWatch alarm fires when DLQ depth exceeds 10.

---

## 16. Inter-Service Communication

### Current (monolith) — direct function calls

All domain modules call each other via TypeScript imports. No network hop.

```typescript
// shipments.service.ts
import { enqueueNotification } from '../notifications/notifications.service';
import { generateDeliveryNote } from '../documents/documents.service';
```

### Phase 2 — HTTP/JSON over private network

Extracted services communicate over the ECS internal VPC network. Service discovery via AWS Cloud Map.

```
tracking-service   →  GET http://shipments.internal:3000/internal/shipments/:id
pdf-generator      →  GET http://shipments.internal:3000/internal/shipments/:id
notification-svc   →  GET http://tenants.internal:3000/internal/tenants/:id/settings
```

All internal endpoints:
- Use mTLS (mutual TLS) for authentication between services
- Are not exposed to the public internet
- Include a `X-Service-Token` header (shared secret, rotated quarterly)

### Phase 3 — Event-driven (Kafka / SNS + SQS)

```
Producer → Kafka topic: shipment.status_changed
              │
    ┌─────────┼─────────┐
    ▼         ▼         ▼
tracking  notification  analytics
consumer   consumer    consumer
```

---

## 17. Deployment Guide

### Local development

```bash
# Prerequisites: Node 20, Docker Desktop

# 1. Start local infrastructure
docker compose up -d        # PostgreSQL 15, Redis 7, MailHog

# 2. Install dependencies
npm install                 # installs all workspace packages

# 3. Set up database
cp apps/backend/.env.example apps/backend/.env
# Fill in SUPABASE_DB_URL (or use local: postgresql://postgres:postgres@localhost:5432/fauward_dev)
npx prisma generate --schema=apps/backend/prisma/schema.prisma
npx prisma db push   --schema=apps/backend/prisma/schema.prisma

# 4. Start the backend
npm run dev                 # starts Fastify on :3001

# 5. Start a frontend (optional)
npm run dev --workspace=apps/tenant-portal   # starts on :5173
```

### Docker (single service)

```dockerfile
# apps/backend/Dockerfile — multi-stage build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx prisma generate
RUN npm run build --workspace=apps/backend

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/apps/backend/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3001
CMD ["node", "dist/server.js"]
```

```bash
docker build -f apps/backend/Dockerfile -t fauward-backend .
docker run -p 3001:3001 --env-file apps/backend/.env fauward-backend
```

### Production (AWS ECS / Fargate)

```
ECS Cluster: fauward-production
  │
  ├── Task: fauward-backend      (cpu: 512, memory: 1024)  ← 2–4 instances
  ├── Task: pdf-generator        (cpu: 512, memory: 1024)  ← 1–2 instances
  ├── Task: tracking-service     (cpu: 256, memory: 512)   ← 2–4 instances
  └── Task: notification-worker  (cpu: 256, memory: 512)   ← 1–2 instances

Load balancing:
  ALB → /api/*         → fauward-backend target group
  ALB → /track/*       → tracking-service target group  (Phase 2+)
  ALB → /ws            → tracking-service target group  (WebSocket, sticky sessions)

Auto-scaling:
  Backend:   scale up if CPU > 70% (min 2, max 8)
  Tracking:  scale up if WebSocket connections > 500 per instance
  PDF gen:   scale up if pdfQueue depth > 20
```

### CI/CD pipeline (GitHub Actions)

```yaml
# .github/workflows/ci.yml
on: [push, pull_request]
jobs:
  test:
    services:
      postgres: { image: postgres:15 }
      redis:    { image: redis:7 }
    steps:
      - npm ci
      - prisma generate + db push (test DB)
      - npm run lint
      - npm run test            # vitest
  build:
    needs: test
    steps:
      - docker build + push to ECR
  deploy:
    needs: build
    if: branch == 'main'
    steps:
      - ecs update-service (rolling deploy, zero downtime)
```

---

## 18. Scaling Strategy

| Phase | Active tenants | Architecture | Notes |
|-------|---------------|-------------|-------|
| **Phase 1** | 0 – 150 | Modular monolith, 2–4 ECS tasks, single Postgres + read replica | All 12 services run in one process |
| **Phase 2** | 150 – 500 | Extract `tracking-service`, `notification-service`, `pdf-generator` as standalone tasks | Share same DB + Redis |
| **Phase 3** | 500+ | Event-driven: Kafka / SNS+SQS · Per-service databases · API gateway + service mesh | Full microservice split |

### Extraction priority order

```
1. tracking-service       ← highest traffic, WebSocket isolation
2. notification-service   ← already async (BullMQ); easiest to extract
3. pdf-generator          ← memory/CPU intensive; benefits from separate Fargate task
4. payment-processor      ← PCI-DSS scoping benefit
5. analytics-engine       ← read-heavy; needs separate read-replica connection
6. route-optimizer        ← spiky CPU usage (optimisation algorithm)
7. ocr-processor          ← ClamAV sidecar, memory-intensive
8. sms-gateway            ← split from notification-service
9. fraud-detection        ← inline in payment path, extract carefully
10. whatsapp-bot          ← new channel, independent lifecycle
11. customs-gateway       ← Enterprise only, low volume
12. search-engine         ← extract only when Postgres FTS becomes a bottleneck
```

---

## 19. Security Across Services

### Authentication between services (internal)

- All internal service-to-service calls use a shared `X-Service-Token` header
- Token is stored in AWS Secrets Manager and rotated quarterly
- mTLS enforced on ECS service mesh (AWS App Mesh) in Phase 3

### Secrets management

```
Never store secrets in:  code, .env files committed to git, Docker images

Store secrets in:
  Development:  .env files (gitignored)
  Production:   AWS Secrets Manager → injected as ECS task environment variables
```

### Data isolation

Every DB query is automatically scoped to `tenant_id` by Prisma middleware. This cannot be bypassed — there is no code path that executes a multi-tenant query.

### Rate limiting

```
Auth endpoints:     10 req/min  (per IP)
General API:       100 req/min  (per userId)
API key clients:   500 req/hr   (per apiKeyId)
Public tracking:   200 req/min  (per IP)
WhatsApp webhook:  Meta-enforced (no additional limit needed)
```

### Document security

```
All S3 URLs are signed (1-hour expiry)
ClamAV malware scan on every upload
Allowed upload types: image/jpeg, image/png, application/pdf
Max upload size: 10 MB
```

### Webhook security

```
Outgoing webhooks (to tenant endpoints):
  - HMAC-SHA256 signature in X-Webhook-Signature header
  - Delivery ID in X-Delivery-ID header
  - 3 retries with exponential backoff
  - Logged to webhook_deliveries table

Incoming webhooks (from payment gateways):
  - Stripe: Stripe-Signature header (HMAC-SHA256 with webhook secret)
  - Paystack: X-Paystack-Signature header
  - M-Pesa: IP allowlist + Basic Auth
  - WhatsApp: X-Hub-Signature-256 (HMAC with app secret)
```

---

## 20. Environment Variables Reference

Below is the full set of environment variables across all services. In production, every value is stored in AWS Secrets Manager and never hard-coded.

### Core (all services)

```env
NODE_ENV=production
PORT=3001

# Database
SUPABASE_DB_URL=postgresql://...
SUPABASE_DIRECT_URL=postgresql://...   # migrations only
DATABASE_READ_URL=postgresql://...      # analytics read replica

# Redis
REDIS_URL=rediss://xxxx.upstash.io:6379

# JWT
JWT_ACCESS_SECRET=                      # RS256 private key (PEM)
JWT_REFRESH_SECRET=
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
```

### Notification service + SMS gateway

```env
SENDGRID_API_KEY=SG.xxxx
TWILIO_ACCOUNT_SID=ACxxxx
TWILIO_AUTH_TOKEN=
TWILIO_FROM=+15005550006
TERMII_API_KEY=
AT_API_KEY=
AT_USERNAME=
```

### Payment processor

```env
STRIPE_SECRET_KEY=sk_live_xxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxx
PAYSTACK_SECRET_KEY=sk_live_xxxx
FLUTTERWAVE_SECRET_KEY=FLWSECK-xxxx
MPESA_CONSUMER_KEY=
MPESA_CONSUMER_SECRET=
MPESA_SHORTCODE=
MPESA_PASSKEY=
```

### PDF generator + OCR processor

```env
S3_BUCKET=fauward-documents
S3_REGION=eu-west-2
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
CLAMAV_HOST=clamav
CLAMAV_PORT=3310
GOOGLE_VISION_API_KEY=
```

### Route optimizer

```env
GOOGLE_MAPS_API_KEY=
```

### WhatsApp bot

```env
WHATSAPP_API_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_APP_SECRET=
WHATSAPP_VERIFY_TOKEN=
```

### Customs gateway

```env
HMRC_CLIENT_ID=
HMRC_CLIENT_SECRET=
HMRC_SANDBOX=true
FIRS_API_KEY=
ZATCA_CERT_PEM=
KRA_ETIMS_API_KEY=
PEPPOL_ACCESS_POINT_URL=
```

### Storage driver (local dev vs production)

```env
STORAGE_DRIVER=s3        # or "local" for development (stores in ./uploads/)
```

---

*Part of the [Fauward documentation](../README.md)*
