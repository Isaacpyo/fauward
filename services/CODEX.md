# Codex Implementation Guide

> Actionable tasks, exact file targets, and code patterns for an AI coding agent to implement missing services and harden existing ones.

This guide is written for **OpenAI Codex** (or any AI code-generation agent). Every task is:
- Scoped to a specific file or set of files
- Grounded in the **actual** code already in `apps/backend/src/`
- Accompanied by the exact function signatures, imports, and patterns the codebase already uses
- Ordered by priority (highest impact first)

---

## How to use this guide

1. Read a task section top to bottom before generating any code.
2. Check the **"Read first"** file list — the files listed there are the canonical reference.
3. Follow the **exact import paths** shown (the project uses ESM `.js` extensions on all local imports).
4. Run `npm run lint` and `npm run test` in `apps/backend/` after every task.
5. Never introduce raw SQL — use `app.prisma.*` (Prisma ORM only).
6. Never bypass the tenant middleware — every DB write/read on a tenant-scoped model must flow through the existing `prisma.$use` middleware in `apps/backend/src/plugins/prisma.ts`.

---

## Table of Contents

1. [Replace InMemoryQueue with real BullMQ](#1-replace-inmemoryqueue-with-real-bullmq)
2. [Wire SendGrid into the notification worker](#2-wire-sendgrid-into-the-notification-worker)
3. [Wire Twilio SMS into the notification worker](#3-wire-twilio-sms-into-the-notification-worker)
4. [Replace stub Stripe service with real Stripe SDK](#4-replace-stub-stripe-service-with-real-stripe-sdk)
5. [Replace stub PDF generation with real Puppeteer](#5-replace-stub-pdf-generation-with-real-puppeteer)
6. [Add HMAC signing to outgoing webhooks](#6-add-hmac-signing-to-outgoing-webhooks)
7. [Add retry + DLQ to the webhook delivery worker](#7-add-retry--dlq-to-the-webhook-delivery-worker)
8. [Add Paystack payment adapter](#8-add-paystack-payment-adapter)
9. [Add fraud scoring to the payment path](#9-add-fraud-scoring-to-the-payment-path)
10. [Add driver location tracking endpoint](#10-add-driver-location-tracking-endpoint)
11. [Replace polling outbox worker with BullMQ repeatable job](#11-replace-polling-outbox-worker-with-bullmq-repeatable-job)
12. [Add ClamAV scan to document uploads](#12-add-clamav-scan-to-document-uploads)
13. [Add WhatsApp webhook handler](#13-add-whatsapp-webhook-handler)
14. [Add analytics aggregate refresh worker](#14-add-analytics-aggregate-refresh-worker)
15. [Harden tenant resolver: add API-key auth path](#15-harden-tenant-resolver-add-api-key-auth-path)
16. [Add MFA enforcement gate to shipment mutations](#16-add-mfa-enforcement-gate-to-shipment-mutations)
17. [Implement refresh token rotation](#17-implement-refresh-token-rotation)
18. [Add idempotency cleanup cron job](#18-add-idempotency-cleanup-cron-job)
19. [Add S3 upload for generated documents](#19-add-s3-upload-for-generated-documents)
20. [Add route optimisation endpoint](#20-add-route-optimisation-endpoint)

---

## 1. Replace InMemoryQueue with real BullMQ

**Priority: P0 — nothing persists across restarts without this.**

### Read first
- `apps/backend/src/queues/queues.ts` — current in-memory implementation
- `apps/backend/src/queues/start-workers.ts` — registers workers on startup
- `apps/backend/src/queues/outbox.worker.ts` — uses `notificationQueue.drain()`
- `apps/backend/src/modules/notifications/notifications.worker.ts` — uses `notificationQueue.drain()`
- `apps/backend/src/config/index.ts` — `config.redisUrl` is already wired

### What to change

**File: `apps/backend/src/queues/queues.ts`**

Replace the entire `InMemoryQueue` class and exports with real BullMQ `Queue` instances:

```typescript
import { Queue } from 'bullmq';
import { config } from '../config/index.js';

const connection = { url: config.redisUrl };

export const notificationQueue = new Queue<Record<string, unknown>>('notification', { connection });
export const webhookQueue      = new Queue<Record<string, unknown>>('webhook',      { connection });
export const outboxQueue       = new Queue<Record<string, unknown>>('outbox',       { connection });
export const pdfQueue          = new Queue<Record<string, unknown>>('pdf',          { connection });
export const analyticsQueue    = new Queue<Record<string, unknown>>('analytics',    { connection });
```

**File: `apps/backend/src/queues/outbox.worker.ts`**

Change `notificationQueue.add(...)` calls — the API is the same (`queue.add(name, data)`). Remove the `.drain()` call pattern; the outbox worker only **enqueues** into BullMQ — processing is handled by dedicated `Worker` instances (see tasks 2 and 7).

**File: `apps/backend/src/modules/notifications/notifications.worker.ts`**

Replace `setInterval` + `notificationQueue.drain()` with a BullMQ `Worker`:

```typescript
import { Worker } from 'bullmq';
import { config } from '../../config/index.js';

export function startNotificationWorker(app: FastifyInstance) {
  return new Worker<Record<string, unknown>>(
    'notification',
    async (job) => {
      // existing processing logic here — move code from the old setInterval body
    },
    { connection: { url: config.redisUrl }, concurrency: 10 }
  );
}
```

### Install
```bash
npm install bullmq --workspace=apps/backend
```

### Validation
- `notificationQueue.add(...)` must not throw
- After server restart, jobs added before restart are still present (Redis persistence)
- `npm run test` passes

---

## 2. Wire SendGrid into the notification worker

**Priority: P0 — emails are silently dropped in the current implementation.**

### Read first
- `apps/backend/src/modules/notifications/notifications.worker.ts` — target file
- `apps/backend/src/modules/notifications/notifications.service.ts` — understand job payload shape
- `apps/backend/src/modules/notifications/email-templates.ts` — available template keys
- `apps/backend/src/modules/shipments/shipments.routes.ts` lines 156–168 — the exact `notificationQueue.add` payload shape:
  ```
  { tenantId, userId, channel, event, to, template, data: { trackingNumber, status } }
  ```

### What to add

**File: `apps/backend/src/modules/notifications/notifications.worker.ts`**

Inside the BullMQ worker callback (after task 1), add the SendGrid call for `channel === 'EMAIL'` jobs:

```typescript
import sgMail from '@sendgrid/mail';

// call once at module init
sgMail.setApiKey(process.env.SENDGRID_API_KEY ?? '');

// inside worker callback:
if (job.data.channel === 'EMAIL' && job.data.to) {
  const tenant = await app.prisma.tenantSettings.findUnique({
    where: { tenantId: String(job.data.tenantId) }
  });

  await sgMail.send({
    to: String(job.data.to),
    from: {
      email: tenant?.fromEmail ?? 'noreply@fauward.com',
      name:  tenant?.fromName  ?? 'Fauward'
    },
    templateId: String(job.data.template),
    dynamicTemplateData: (job.data.data as Record<string, unknown>) ?? {}
  });
}
```

Wrap the `sgMail.send` call in try/catch. On failure throw the error — BullMQ will retry automatically (3 times, exponential backoff — set in the queue options):

```typescript
export const notificationQueue = new Queue('notification', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 }
  }
});
```

After sending, update the `NotificationLog` row: `status: 'SENT'`, `sentAt: new Date()`, `providerRef: messageId`.

### New env var

```
SENDGRID_API_KEY=SG.xxxx
```

Add to `apps/backend/src/config/index.ts`:
```typescript
SENDGRID_API_KEY: z.string().optional()
```

### Install
```bash
npm install @sendgrid/mail --workspace=apps/backend
```

### Validation
- Unit test: mock `sgMail.send`, add a job to `notificationQueue`, start the worker, assert mock was called with correct `to` and `templateId`
- Integration test: set `SENDGRID_API_KEY` to sandbox value, verify `NotificationLog.status === 'SENT'`

---

## 3. Wire Twilio SMS into the notification worker

**Priority: P1 — SMS notifications are silently dropped for Pro/Enterprise tenants.**

### Read first
- `apps/backend/src/modules/notifications/notifications.worker.ts` — same file as task 2
- `apps/backend/src/modules/shipments/shipments.routes.ts` lines 186–195 — SMS job payload:
  ```
  { tenantId, userId, channel: 'SMS', event, to, message }
  ```

### What to add

Inside the same BullMQ worker callback, add the SMS branch:

```typescript
import twilio from 'twilio';

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// inside worker callback, after email branch:
if (job.data.channel === 'SMS' && job.data.to) {
  const msg = await twilioClient.messages.create({
    to:   String(job.data.to),
    from: process.env.TWILIO_FROM ?? '',
    body: String(job.data.message ?? '')
  });
  // update NotificationLog: status 'SENT', providerRef: msg.sid
}
```

Before sending, check the tenant's daily SMS quota using Redis:

```typescript
const quotaKey = `sms:count:${job.data.tenantId}:${new Date().toISOString().slice(0, 10)}`;
const current  = await app.redis.incr(quotaKey);
await app.redis.expire(quotaKey, 48 * 60 * 60); // 48-hour TTL

const plan = await app.prisma.tenant.findUnique({
  where: { id: String(job.data.tenantId) },
  select: { plan: true }
});
const limit = plan?.plan === 'ENTERPRISE' ? Infinity : plan?.plan === 'PRO' ? 500 : 0;
if (current > limit) {
  // do not throw — mark log as QUOTA_EXCEEDED and return
  return;
}
```

### New env vars

```
TWILIO_ACCOUNT_SID=ACxxxx
TWILIO_AUTH_TOKEN=
TWILIO_FROM=+15005550006
```

Add to `apps/backend/src/config/index.ts`.

### Install
```bash
npm install twilio --workspace=apps/backend
```

---

## 4. Replace stub Stripe service with real Stripe SDK

**Priority: P0 — all payments currently return fake IDs.**

### Read first
- `apps/backend/src/modules/payments/stripe.service.ts` — current stub (returns fake UUIDs)
- `apps/backend/src/modules/payments/payments.routes.ts` — calls `stripeService.*`
- `apps/backend/src/modules/payments/billing.service.ts` — dunning logic

### What to change

**File: `apps/backend/src/modules/payments/stripe.service.ts`**

Replace the entire file. Keep the same exported object shape (`stripeService`) and the same method signatures so `payments.routes.ts` requires zero changes:

```typescript
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2024-04-10'
});

export const stripeService = {
  async createPaymentIntent(input: PaymentIntentInput) {
    const intent = await stripe.paymentIntents.create({
      amount:   input.amountMinor,
      currency: input.currency.toLowerCase(),
      customer: input.customerId,
      metadata: input.metadata ?? {}
    });
    return { id: intent.id, clientSecret: intent.client_secret!, amountMinor: intent.amount, currency: intent.currency };
  },

  async createCustomer(email: string) {
    const customer = await stripe.customers.create({ email });
    return { id: customer.id, email };
  },

  async createSubscription(customerId: string, priceId: string) {
    const sub = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent']
    });
    return { id: sub.id, customerId, priceId, status: sub.status };
  },

  async cancelSubscription(subscriptionId: string) {
    const sub = await stripe.subscriptions.cancel(subscriptionId);
    return { id: sub.id, status: sub.status };
  },

  async handleWebhook(payload: Buffer, signature: string) {
    return stripe.webhooks.constructEvent(
      payload,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET ?? ''
    );
  }
};
```

**Important:** `payments.routes.ts` currently calls `stripeService.handleWebhook(payload)` with one argument. Update the call site to pass both `rawBody` (Buffer) and the `stripe-signature` header.

### New env vars

```
STRIPE_SECRET_KEY=sk_live_xxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxx
```

### Install
```bash
npm install stripe --workspace=apps/backend
```

### Validation
- Use Stripe test-mode keys
- `POST /api/v1/payments/intent` returns a real `client_secret`
- Stripe CLI: `stripe listen --forward-to localhost:3001/api/v1/payments/webhook/stripe`

---

## 5. Replace stub PDF generation with real Puppeteer

**Priority: P1 — delivery notes and invoices are stored as raw HTML files locally.**

### Read first
- `apps/backend/src/modules/documents/documents.service.ts` — current implementation (`storeLocalDocument` writes HTML to `.storage/`)
- `apps/backend/src/modules/documents/templates/delivery-note.html` — template used by `renderTemplate()`
- `apps/backend/src/modules/documents/templates/invoice.html` — same pattern

### What to change

**File: `apps/backend/src/modules/documents/documents.service.ts`**

1. Add a `renderPdf(html: string): Promise<Buffer>` helper using Puppeteer:

```typescript
import puppeteer from 'puppeteer';

async function renderPdf(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
```

2. Replace `storeLocalDocument(...)` call with:

```typescript
const pdfBuffer = await renderPdf(html);
const fileName  = `delivery-note-${shipment.trackingNumber}.pdf`;

// In development (STORAGE_DRIVER=local): write to .storage/documents/
// In production (STORAGE_DRIVER=s3): upload to S3 (see task 19)
const fileUrl = await storageDriver.put(fileName, pdfBuffer, 'application/pdf');
```

3. Keep `DocumentType.DELIVERY_NOTE` and `app.prisma.shipmentDocument.create(...)` unchanged — only swap the `fileUrl` source.

### New env var

```
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium    # set in Docker image
STORAGE_DRIVER=local                           # or s3
```

### Install
```bash
npm install puppeteer --workspace=apps/backend
```

> **Docker note:** add `RUN apk add --no-cache chromium` to `apps/backend/Dockerfile` and set `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`.

### Validation
- `POST /api/v1/documents/delivery-note` returns a URL ending in `.pdf`
- File is a valid PDF (check magic bytes: `%PDF`)
- `npm run test` passes (mock Puppeteer in unit tests)

---

## 6. Add HMAC signing to outgoing webhooks

**Priority: P1 — webhook payloads are currently sent unsigned.**

### Read first
- `apps/backend/src/modules/shipments/shipments.routes.ts` — `fireShipmentWebhook()` function (lines 56–121)
- `apps/backend/src/modules/webhooks/webhooks.service.ts`
- `apps/backend/prisma/schema.prisma` — `WebhookEndpoint` model has a `secret` field

### What to change

**File: `apps/backend/src/modules/shipments/shipments.routes.ts`**

Inside `fireShipmentWebhook()`, before the `fetch` call, generate the HMAC signature:

```typescript
import { createHmac } from 'crypto';

function signWebhookPayload(secret: string, payload: string): string {
  return 'sha256=' + createHmac('sha256', secret).update(payload).digest('hex');
}

// inside fireShipmentWebhook, replace the headers block:
const body      = JSON.stringify(payload);
const signature = endpoint.secret
  ? signWebhookPayload(endpoint.secret, body)
  : undefined;

const response = await fetch(endpoint.url, {
  method: 'POST',
  headers: {
    'Content-Type':          'application/json',
    'X-Event-Type':          eventType,
    'X-Delivery-Id':         crypto.randomUUID(),
    ...(signature ? { 'X-Webhook-Signature': signature } : {})
  },
  body
});
```

`endpoint.secret` is the per-endpoint signing secret generated when the webhook is created. If the `WebhookEndpoint` model does not yet have a `secret` column, add it:

```prisma
// apps/backend/prisma/schema.prisma
model WebhookEndpoint {
  // existing fields …
  secret   String?   // HMAC signing secret (shown once at creation)
}
```

Run `npx prisma migrate dev --name add_webhook_secret` after the schema change.

### Validation
- Add a test endpoint with a known secret
- Assert the `X-Webhook-Signature` header matches `sha256=<expected>`
- Reference implementation: Stripe's webhook signature format

---

## 7. Add retry + DLQ to the webhook delivery worker

**Priority: P1 — failed webhook deliveries are never retried.**

### Read first
- `apps/backend/src/modules/shipments/shipments.routes.ts` — `fireShipmentWebhook()` currently fires inline on every status update
- `apps/backend/src/queues/queues.ts` — `webhookQueue` is defined here
- `apps/backend/src/queues/outbox.worker.ts` — already adds to `webhookQueue`

### What to build

Create a new file `apps/backend/src/queues/webhook.worker.ts`:

```typescript
import { Worker, Queue } from 'bullmq';
import type { FastifyInstance } from 'fastify';
import { config } from '../config/index.js';

const connection = { url: config.redisUrl };

export const dlqWebhook = new Queue('dlq:webhook', { connection });

export function startWebhookWorker(app: FastifyInstance) {
  return new Worker<{
    endpointId: string;
    eventType:  string;
    payload:    Record<string, unknown>;
    tenantId:   string;
    shipmentId: string;
  }>(
    'webhook',
    async (job) => {
      const endpoint = await app.prisma.webhookEndpoint.findUnique({
        where: { id: job.data.endpointId }
      });
      if (!endpoint?.isActive) return;

      const body      = JSON.stringify(job.data.payload);
      const signature = endpoint.secret
        ? 'sha256=' + require('crypto').createHmac('sha256', endpoint.secret).update(body).digest('hex')
        : undefined;

      const started = Date.now();
      const res = await fetch(endpoint.url, {
        method:  'POST',
        headers: {
          'Content-Type':    'application/json',
          'X-Event-Type':    job.data.eventType,
          'X-Delivery-Id':   job.id ?? crypto.randomUUID(),
          ...(signature ? { 'X-Webhook-Signature': signature } : {})
        },
        signal: AbortSignal.timeout(10_000),
        body
      });

      await app.prisma.webhookDelivery.create({
        data: {
          tenantId:       job.data.tenantId,
          endpointId:     endpoint.id,
          eventType:      job.data.eventType,
          payload:        job.data.payload as any,
          responseStatus: res.status,
          responseBody:   await res.text(),
          durationMs:     Date.now() - started,
          status:         res.ok ? 'DELIVERED' : 'FAILED'
        }
      });

      if (!res.ok) throw new Error(`Webhook responded with ${res.status}`);
    },
    {
      connection,
      concurrency: 20,
      limiter: { max: 50, duration: 1000 }
    }
  );
}
```

Register in `apps/backend/src/queues/start-workers.ts`:

```typescript
import { startWebhookWorker } from './webhook.worker.js';

export function startWorkers(app: FastifyInstance) {
  startOutboxWorker(app);
  startNotificationWorker(app);
  startWebhookWorker(app);    // add this
}
```

Add default job options to `webhookQueue` in `queues.ts`:

```typescript
export const webhookQueue = new Queue('webhook', {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
    removeOnComplete: 100,
    removeOnFail: 500
  }
});
```

Remove `fireShipmentWebhook()` inline execution from `shipments.routes.ts` — instead just `webhookQueue.add(...)` and let the worker handle delivery.

---

## 8. Add Paystack payment adapter

**Priority: P1 — West Africa tenants cannot accept payments.**

### Read first
- `apps/backend/src/modules/payments/stripe.service.ts` — follow this exact shape
- `apps/backend/src/modules/payments/payments.routes.ts` — see how `stripeService` is called
- `apps/backend/src/shared/middleware/tenant.resolver.ts` — `TenantContext.region` is available

### What to build

Create `apps/backend/src/modules/payments/paystack.service.ts`:

```typescript
import type { PaymentIntentInput } from './stripe.service.js';

const PAYSTACK_BASE = 'https://api.paystack.co';

async function paystackPost(path: string, body: unknown) {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`Paystack ${path} → ${res.status}`);
  return res.json() as Promise<{ data: Record<string, unknown> }>;
}

export const paystackService = {
  async createPaymentIntent(input: PaymentIntentInput) {
    const { data } = await paystackPost('/transaction/initialize', {
      amount:   input.amountMinor,           // Paystack uses kobo / pesewas (minor units)
      currency: input.currency.toUpperCase(),
      email:    input.metadata?.customerEmail ?? 'unknown@fauward.com',
      metadata: input.metadata ?? {}
    });
    return {
      id:           String(data.reference),
      clientSecret: String(data.authorization_url), // redirect URL for Paystack hosted checkout
      amountMinor:  input.amountMinor,
      currency:     input.currency
    };
  },

  async handleWebhook(rawBody: Buffer, signature: string) {
    const { createHmac } = await import('crypto');
    const expected = createHmac('sha512', process.env.PAYSTACK_SECRET_KEY ?? '')
      .update(rawBody)
      .digest('hex');
    if (expected !== signature) throw new Error('Invalid Paystack webhook signature');
    return JSON.parse(rawBody.toString()) as Record<string, unknown>;
  }
};
```

Then add a gateway selector in `payments.routes.ts`:

```typescript
import { paystackService } from './paystack.service.js';

function getGateway(region?: string) {
  if (region === 'west-africa' || region === 'nigeria' || region === 'ghana') {
    return paystackService;
  }
  return stripeService;
}

// in the POST /payments/intent handler:
const gateway = getGateway(request.tenant?.region);
const intent  = await gateway.createPaymentIntent({ ... });
```

Add a webhook route: `POST /api/v1/payments/webhook/paystack` with `X-Paystack-Signature` header verification.

### New env var
```
PAYSTACK_SECRET_KEY=sk_live_xxxx
```

---

## 9. Add fraud scoring to the payment path

**Priority: P1 — no fraud protection on payment intents.**

### Read first
- `apps/backend/src/modules/payments/payments.routes.ts` — `POST /api/v1/payments/intent` handler
- `apps/backend/src/plugins/redis.ts` — `app.redis` is available for velocity counters

### What to build

Create `apps/backend/src/modules/payments/fraud.scorer.ts`:

```typescript
import type { FastifyInstance } from 'fastify';

export type FraudContext = {
  tenantId: string;
  ip:       string;
  userId?:  string;
  amountMinor: number;
};

export type FraudDecision = {
  action: 'ALLOW' | 'REVIEW' | 'BLOCK';
  score:  number;
  reasons: string[];
};

export async function scoreFraud(app: FastifyInstance, ctx: FraudContext): Promise<FraudDecision> {
  let score = 0;
  const reasons: string[] = [];

  // Velocity: > 5 attempts from same IP in 10 min
  const velocityKey = `fraud:velocity:${ctx.ip}`;
  const attempts    = await app.redis.incr(velocityKey);
  await app.redis.expire(velocityKey, 10 * 60);
  if (attempts > 5) {
    score += 40;
    reasons.push(`IP velocity: ${attempts} attempts in 10 min`);
  }

  // High-value attempt from new account (account < 24 h)
  if (ctx.userId) {
    const user = await app.prisma.user.findUnique({
      where:  { id: ctx.userId },
      select: { createdAt: true }
    });
    const ageHours = user
      ? (Date.now() - user.createdAt.getTime()) / 3_600_000
      : 0;
    if (ageHours < 24 && ctx.amountMinor > 50_000) {   // > £500 / ₦50,000
      score += 20;
      reasons.push('New account + high-value payment');
    }
  }

  const action: FraudDecision['action'] =
    score >= 80 ? 'BLOCK' :
    score >= 50 ? 'REVIEW' :
    'ALLOW';

  return { action, score, reasons };
}
```

Call it in the `POST /api/v1/payments/intent` handler, before the gateway call:

```typescript
import { scoreFraud } from './fraud.scorer.js';

const decision = await scoreFraud(app, {
  tenantId:    tenantId,
  ip:          request.ip,
  userId:      request.user?.sub,
  amountMinor: body.amountMinor
});

if (decision.action === 'BLOCK') {
  return reply.status(402).send({ error: 'Payment declined', code: 'FRAUD_DETECTED' });
}
// REVIEW: allow payment but flag for manual review (write to audit log)
```

---

## 10. Add driver location tracking endpoint

**Priority: P1 — driver GPS is stored nowhere; live-map cannot show driver positions.**

### Read first
- `apps/backend/src/modules/tracking/tracking.routes.ts` — add new route here
- `apps/backend/src/modules/tracking/tracking.websocket.ts` — `emitTrackingStatusUpdate()` pattern
- `apps/backend/src/plugins/redis.ts` — `app.redis` is the Redis client

### What to add

In `apps/backend/src/modules/tracking/tracking.routes.ts`, add:

```typescript
app.post(
  '/api/v1/tracking/location',
  { preHandler: [app.authenticate, requireTenantMatch] },
  async (request: FastifyRequest, reply: FastifyReply) => {
    const { driverId, lat, lng, accuracy, shipmentId } = request.body as {
      driverId:   string;
      lat:        number;
      lng:        number;
      accuracy?:  number;
      shipmentId?: string;
    };

    if (!driverId || typeof lat !== 'number' || typeof lng !== 'number') {
      return reply.status(400).send({ error: 'driverId, lat, and lng are required' });
    }

    const tenantId = request.tenant?.id!;

    // Verify driver belongs to tenant
    const driver = await app.prisma.driver.findFirst({
      where: { id: driverId, tenantId }
    });
    if (!driver) return reply.status(404).send({ error: 'Driver not found' });

    // Cache in Redis (TTL 5 min)
    await app.redis.setex(
      `driver:${driverId}:location`,
      300,
      JSON.stringify({ lat, lng, accuracy, updatedAt: new Date().toISOString() })
    );

    // If shipmentId provided, emit real-time WS update
    if (shipmentId) {
      const shipment = await app.prisma.shipment.findFirst({
        where: { id: shipmentId, tenantId },
        select: { trackingNumber: true }
      });
      if (shipment) {
        emitTrackingStatusUpdate({
          tenantId,
          trackingNumber: shipment.trackingNumber,
          status:        'IN_TRANSIT',
          location:      { lat, lng },
          timestamp:     new Date().toISOString()
        });
      }
    }

    reply.send({ ok: true });
  }
);
```

Also add a `GET /api/v1/tracking/driver/:driverId/location` endpoint that reads from `app.redis.get(...)`.

---

## 11. Replace polling outbox worker with BullMQ repeatable job

**Priority: P2 — current `setInterval` polling cannot scale across multiple server instances.**

### Read first
- `apps/backend/src/queues/outbox.worker.ts` — current `setInterval` implementation

### What to change

After task 1 (BullMQ) is done, replace `setInterval` with a BullMQ repeatable job:

```typescript
import { Worker, Queue } from 'bullmq';
import { config } from '../config/index.js';

const connection = { url: config.redisUrl };
const outboxScheduler = new Queue('outbox-scheduler', { connection });

export async function startOutboxWorker(app: FastifyInstance) {
  // Ensure only one repeatable job is registered
  await outboxScheduler.add(
    'poll',
    {},
    { repeat: { every: 1000 }, jobId: 'outbox-poll-singleton' }
  );

  return new Worker(
    'outbox-scheduler',
    async () => {
      const events = await app.prisma.outboxEvent.findMany({
        where:   { published: false },
        orderBy: { createdAt: 'asc' },
        take:    100
      });

      for (const event of events) {
        if (event.eventType.startsWith('shipment.') || event.eventType.includes('invoice')) {
          await notificationQueue.add(event.eventType, event.payload as Record<string, unknown>);
        }
        if (event.eventType.includes('status.changed') || event.eventType.startsWith('webhook.')) {
          await webhookQueue.add(event.eventType, event.payload as Record<string, unknown>);
        }
        await app.prisma.outboxEvent.update({
          where: { id: event.id },
          data:  { published: true, publishedAt: new Date() }
        });
      }
    },
    { connection }
  );
}
```

The `jobId: 'outbox-poll-singleton'` ensures only one poll runs at a time even with multiple server instances.

---

## 12. Add ClamAV scan to document uploads

**Priority: P2 — uploaded files are stored without malware scanning.**

### Read first
- `apps/backend/src/modules/documents/documents.routes.ts` — file upload handler
- `apps/backend/src/modules/documents/documents.service.ts` — `documentsService`

### What to add

Create `apps/backend/src/shared/utils/clamav.ts`:

```typescript
import { createConnection } from 'net';

export async function scanBuffer(buffer: Buffer): Promise<{ clean: boolean; virus?: string }> {
  const host = process.env.CLAMAV_HOST ?? 'clamav';
  const port = Number(process.env.CLAMAV_PORT ?? 3310);

  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port }, () => {
      socket.write('zINSTREAM\0');

      const size = Buffer.alloc(4);
      size.writeUInt32BE(buffer.length, 0);
      socket.write(size);
      socket.write(buffer);

      const terminator = Buffer.alloc(4);
      terminator.writeUInt32BE(0, 0);
      socket.write(terminator);
    });

    let response = '';
    socket.on('data', (data: Buffer) => { response += data.toString(); });
    socket.on('end', () => {
      socket.destroy();
      if (response.includes('OK')) resolve({ clean: true });
      else {
        const virus = response.split(':').pop()?.trim() ?? 'UNKNOWN';
        resolve({ clean: false, virus });
      }
    });
    socket.on('error', reject);
  });
}
```

Call in the upload handler before saving the file:

```typescript
import { scanBuffer } from '../../shared/utils/clamav.js';

const scan = await scanBuffer(fileBuffer);
if (!scan.clean) {
  return reply.status(422).send({ error: 'File rejected: malware detected', virus: scan.virus });
}
```

Fall back gracefully if ClamAV is unavailable (catch the connection error, log a warning, continue).

---

## 13. Add WhatsApp webhook handler

**Priority: P2 — WhatsApp notifications are not implemented.**

### Read first
- `apps/backend/src/modules/notifications/notifications.routes.ts` — follow this pattern for a new route file
- `apps/backend/src/modules/tracking/tracking.routes.ts` — `GET /api/v1/tracking/:number` public endpoint pattern
- `apps/backend/src/shared/middleware/tenant.resolver.ts` — public path bypass list

### What to build

Create `apps/backend/src/modules/notifications/whatsapp.routes.ts`:

```typescript
import { createHmac } from 'crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

function verifyWhatsAppSignature(rawBody: Buffer, signature: string, appSecret: string): boolean {
  const expected = 'sha256=' + createHmac('sha256', appSecret).update(rawBody).digest('hex');
  return expected === signature;
}

export async function registerWhatsAppRoutes(app: FastifyInstance) {
  // Webhook verification (GET) — Meta sends this on setup
  app.get('/api/v1/webhooks/whatsapp', async (request: FastifyRequest, reply: FastifyReply) => {
    const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } =
      request.query as Record<string, string>;
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
      return reply.send(challenge);
    }
    return reply.status(403).send({ error: 'Forbidden' });
  });

  // Incoming messages (POST)
  app.post('/api/v1/webhooks/whatsapp', async (request: FastifyRequest, reply: FastifyReply) => {
    const signature = request.headers['x-hub-signature-256'] as string ?? '';
    const rawBody   = (request as any).rawBody as Buffer;

    if (!verifyWhatsAppSignature(rawBody, signature, process.env.WHATSAPP_APP_SECRET ?? '')) {
      return reply.status(401).send({ error: 'Invalid signature' });
    }

    const body = request.body as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            messages?: Array<{ from: string; type: string; text?: { body: string } }>;
          };
        }>;
      }>;
    };

    const messages = body.entry?.[0]?.changes?.[0]?.value?.messages ?? [];

    for (const msg of messages) {
      if (msg.type !== 'text') continue;
      const text = msg.text?.body?.trim().toUpperCase() ?? '';

      // Simple intent: if message looks like a tracking number, reply with status
      if (/^[A-Z0-9]+-\d{6}-[A-Z0-9]{6}$/.test(text)) {
        const shipment = await app.prisma.shipment.findUnique({
          where:  { trackingNumber: text },
          select: { status: true, trackingNumber: true }
        });

        const replyText = shipment
          ? `Shipment ${shipment.trackingNumber}: ${shipment.status.replace(/_/g, ' ')}`
          : `No shipment found for ${text}`;

        // Send reply via WhatsApp Cloud API
        await fetch(`https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
          method:  'POST',
          headers: {
            Authorization:  `Bearer ${process.env.WHATSAPP_API_TOKEN}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to:   msg.from,
            type: 'text',
            text: { body: replyText }
          })
        });
      }
    }

    reply.send({ ok: true });
  });
}
```

Register in `apps/backend/src/app.ts`:

```typescript
import { registerWhatsAppRoutes } from './modules/notifications/whatsapp.routes.js';
// add to buildApp():
await registerWhatsAppRoutes(app);
```

Add `/api/v1/webhooks/whatsapp` to the `PUBLIC_PATHS` set in `tenant.resolver.ts`.

### New env vars
```
WHATSAPP_API_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_APP_SECRET=
WHATSAPP_VERIFY_TOKEN=
```

---

## 14. Add analytics aggregate refresh worker

**Priority: P2 — analytics dashboard reads cold data from PostgreSQL on every request.**

### Read first
- `apps/backend/src/modules/analytics/analytics.routes.ts`
- `apps/backend/src/plugins/redis.ts`

### What to add

In `analytics.routes.ts`, wrap the expensive KPI queries with Redis cache-aside:

```typescript
const CACHE_TTL = 5 * 60; // 5 minutes

async function getCachedOrCompute<T>(
  redis: typeof app.redis,
  key:   string,
  ttl:   number,
  fn:    () => Promise<T>
): Promise<T> {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached) as T;
  const value = await fn();
  await redis.setex(key, ttl, JSON.stringify(value));
  return value;
}

// In the GET /analytics/overview handler:
const data = await getCachedOrCompute(
  app.redis,
  `analytics:${tenantId}:overview`,
  CACHE_TTL,
  async () => {
    // existing Prisma aggregate queries
  }
);
```

Create a cache-warming job that fires when a `shipment.status.updated` outbox event is processed:

In `apps/backend/src/queues/outbox.worker.ts`, inside the event loop, add:

```typescript
if (event.eventType === 'shipment.status.updated') {
  // Invalidate analytics cache for this tenant so next request re-computes
  const tenantId = String((event.payload as any).tenantId ?? '');
  if (tenantId) {
    await app.redis.del(
      `analytics:${tenantId}:overview`,
      `analytics:${tenantId}:kpi`
    );
  }
}
```

---

## 15. Harden tenant resolver: add API-key auth path

**Priority: P1 — API keys are created but never used for tenant resolution.**

### Read first
- `apps/backend/src/shared/middleware/tenant.resolver.ts` — the full resolver (target file)
- `apps/backend/src/modules/api-keys/api-keys.service.ts` — `ApiKey` model and hashing
- `apps/backend/prisma/schema.prisma` — `ApiKey` model: `keyHash`, `tenantId`, `scopes`, `isActive`

### What to add

In `tenantResolver()`, after the `headerSlug` check and before the `if (!tenant)` 404:

```typescript
import { createHash } from 'crypto';

// API key resolution
const authHeader  = req.headers.authorization ?? '';
const apiKeyMatch = authHeader.match(/^ApiKey\s+(.+)$/i);
if (!tenant && apiKeyMatch) {
  const rawKey  = apiKeyMatch[1].trim();
  const keyHash = createHash('sha256').update(rawKey).digest('hex');
  const apiKey  = await req.server.prisma.apiKey.findFirst({
    where:   { keyHash, isActive: true },
    include: { tenant: true }
  });
  if (apiKey) {
    tenant  = apiKey.tenant;
    req.apiKey = apiKey; // decorate for scope checks downstream
  }
}
```

Add `req.apiKey` to the Fastify type declaration in `apps/backend/src/types/fastify.d.ts`:

```typescript
declare module 'fastify' {
  interface FastifyRequest {
    tenant?: import('@prisma/client').Tenant;
    apiKey?: import('@prisma/client').ApiKey;
    user?: import('../shared/utils/jwt.js').JwtPayload;
  }
}
```

---

## 16. Add MFA enforcement gate to shipment mutations

**Priority: P2 — tenants with MFA enabled can perform mutations without completing MFA.**

### Read first
- `apps/backend/src/shared/middleware/authenticate.ts` — sets `request.user` from JWT
- `apps/backend/src/shared/utils/jwt.ts` — `JwtPayload` includes `mfaVerified: boolean`
- `apps/backend/src/modules/shipments/shipments.routes.ts` — mutation handlers

### What to add

Create `apps/backend/src/shared/middleware/requireMfa.ts`:

```typescript
import type { FastifyReply, FastifyRequest } from 'fastify';

export async function requireMfa(request: FastifyRequest, reply: FastifyReply) {
  const user = request.user as { mfaVerified?: boolean; sub?: string } | undefined;
  if (!user) return; // authenticate() already rejects unauthenticated

  // Check if tenant has MFA required
  const tenantId = request.tenant?.id;
  if (!tenantId) return;

  const settings = await request.server.prisma.tenantSettings.findUnique({
    where:  { tenantId },
    select: { mfaRequired: true }
  });

  if (settings?.mfaRequired && !user.mfaVerified) {
    return reply.status(403).send({ error: 'MFA verification required', code: 'MFA_REQUIRED' });
  }
}
```

Add to high-risk mutation preHandlers in `shipments.routes.ts`:

```typescript
{ preHandler: [app.authenticate, requireTenantMatch, requireMfa] }
```

---

## 17. Implement refresh token rotation

**Priority: P1 — refresh tokens are currently stored in plaintext and not rotated on use.**

### Read first
- `apps/backend/src/modules/auth/auth.service.ts` — `authService.refresh()` (lines 275–333)
- `apps/backend/prisma/schema.prisma` — `RefreshToken` model: `token` (String), `userId`, `expiresAt`

### What to change

The `refresh()` method in `auth.service.ts` already rotates the token (deletes old, creates new) — but the token is stored as **plaintext**. Change it to store a SHA-256 hash:

```typescript
import { createHash } from 'crypto';

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

// When creating:
await prisma.refreshToken.create({
  data: {
    token:     hashToken(nextRefreshToken),   // store hash, not raw token
    userId:    user.id,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  }
});

// When looking up:
const refreshToken = await prisma.refreshToken.findUnique({
  where: { token: hashToken(payload.refreshToken) }
});
```

This requires a Prisma migration if the column type changes. If `token` is already a unique string, no migration is needed — just change the value stored.

Also ensure the old token is deleted **atomically** with the new token creation (already done in the `$transaction` at line 314).

---

## 18. Add idempotency cleanup cron job

**Priority: P2 — `IdempotencyKey` rows accumulate indefinitely.**

### Read first
- `apps/backend/src/server.ts` — `setInterval` pattern already used for overdue invoice sweep
- `apps/backend/src/shared/middleware/idempotency.ts` — `IdempotencyKey` has `expiresAt` column

### What to add

In `apps/backend/src/server.ts`, alongside the existing overdue invoice interval:

```typescript
// Cleanup expired idempotency keys — runs every hour
setInterval(async () => {
  try {
    const result = await app.prisma.idempotencyKey.deleteMany({
      where: { expiresAt: { lt: new Date() } }
    });
    if (result.count > 0) {
      app.log.info({ count: result.count }, 'Cleaned up expired idempotency keys');
    }
  } catch (error) {
    app.log.error({ error }, 'Idempotency key cleanup failed');
  }
}, 60 * 60 * 1000);
```

---

## 19. Add S3 upload for generated documents

**Priority: P1 — PDFs are written to local disk and lost on container restart.**

### Read first
- `apps/backend/src/modules/documents/documents.service.ts` — `storeLocalDocument()` function
- `apps/backend/src/config/index.ts` — add `STORAGE_DRIVER`, `S3_BUCKET`, `S3_REGION`

### What to build

Create `apps/backend/src/shared/utils/storage.ts`:

```typescript
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const driver = process.env.STORAGE_DRIVER ?? 'local';
const bucket = process.env.S3_BUCKET ?? 'fauward-documents';
const region = process.env.S3_REGION ?? 'eu-west-2';

const s3 = driver === 's3'
  ? new S3Client({ region })
  : null;

export const storage = {
  async put(key: string, body: Buffer, contentType: string): Promise<string> {
    if (driver === 's3' && s3) {
      await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
      // Return a 1-hour signed URL
      return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 3600 });
    }

    // Local fallback
    const dir  = join(process.cwd(), '.storage', 'documents');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, key.replace(/\//g, '-'));
    writeFileSync(path, body);
    return `file://${path}`;
  }
};
```

Replace all `storeLocalDocument(...)` calls in `documents.service.ts` with:

```typescript
import { storage } from '../../shared/utils/storage.js';

const fileUrl = await storage.put(
  `docs/${tenantId}/delivery-note-${shipment.trackingNumber}.pdf`,
  pdfBuffer,
  'application/pdf'
);
```

### Install
```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner --workspace=apps/backend
```

### New env vars
```
STORAGE_DRIVER=s3
S3_BUCKET=fauward-documents
S3_REGION=eu-west-2
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

---

## 20. Add route optimisation endpoint

**Priority: P2 — fleet module exists but has no stop ordering logic.**

### Read first
- `apps/backend/src/modules/fleet/fleet.routes.ts`
- `apps/backend/src/plugins/redis.ts` — route cache pattern

### What to add

In `apps/backend/src/modules/fleet/fleet.routes.ts`:

```typescript
app.post(
  '/api/v1/fleet/routes/optimize',
  { preHandler: [app.authenticate, requireTenantMatch, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER'])] },
  async (request: FastifyRequest, reply: FastifyReply) => {
    const { driverId, date, stops } = request.body as {
      driverId: string;
      date:     string;
      stops:    Array<{ shipmentId: string; address: string; lat?: number; lng?: number }>;
    };

    const tenantId = request.tenant?.id!;
    const cacheKey = `route:${driverId}:${date}`;

    const cached = await app.redis.get(cacheKey);
    if (cached) return reply.send(JSON.parse(cached));

    // Nearest-neighbour heuristic (no external API dependency)
    function nearestNeighbour(pts: Array<{ lat: number; lng: number; idx: number }>) {
      const visited = new Set<number>();
      const order:  number[] = [0];
      visited.add(0);

      while (order.length < pts.length) {
        const last    = pts[order[order.length - 1]];
        let bestDist  = Infinity;
        let bestIdx   = -1;

        for (const pt of pts) {
          if (visited.has(pt.idx)) continue;
          const dist = Math.hypot(pt.lat - last.lat, pt.lng - last.lng);
          if (dist < bestDist) { bestDist = dist; bestIdx = pt.idx; }
        }
        order.push(bestIdx);
        visited.add(bestIdx);
      }
      return order;
    }

    const pts = stops
      .map((stop, idx) => ({ ...stop, idx, lat: stop.lat ?? 0, lng: stop.lng ?? 0 }))
      .filter((stop) => stop.lat !== 0 && stop.lng !== 0);

    const order   = nearestNeighbour(pts);
    const ordered = order.map((i) => stops[i]);

    const result = { driverId, date, orderedStops: ordered };
    await app.redis.setex(cacheKey, 3600, JSON.stringify(result));

    reply.send(result);
  }
);
```

For production, replace `nearestNeighbour` with a call to Google Maps Distance Matrix API + 2-opt improvement (see `docs/system-architecture.md` section on route-optimizer).

---

## Appendix: Patterns to follow

### Adding a new route to an existing module

1. Open the `{module}.routes.ts` file.
2. Add the handler inside the existing `register*Routes(app)` function.
3. Use the exact `preHandler` array pattern already present in the file:
   ```typescript
   { preHandler: [app.authenticate, requireTenantMatch, requireRole(['TENANT_ADMIN'])] }
   ```
4. Fetch data with `app.prisma.{model}.findFirst({ where: { id, tenantId } })` — always include `tenantId` in the where clause even though the middleware also adds it (defence in depth).
5. Return 404 if the record is not found: `reply.status(404).send({ error: '...' })`.

### Writing to the outbox (guaranteed event delivery)

Always use a `$transaction` when writing an outbox event alongside a business record:

```typescript
await app.prisma.$transaction(async (tx) => {
  await tx.{model}.update({ where: { id }, data: { ... } });
  await tx.outboxEvent.create({
    data: {
      aggregateType: '{model}',
      aggregateId:   id,
      eventType:     '{model}.{event}',
      payload:       { tenantId, ... } as Prisma.InputJsonValue
    }
  });
});
```

### Adding a new queue worker

1. Create `apps/backend/src/queues/{name}.worker.ts` exporting `start{Name}Worker(app)`.
2. Import and call it in `apps/backend/src/queues/start-workers.ts`.
3. The worker constructor signature:
   ```typescript
   new Worker<JobData>('queue-name', async (job) => { ... }, { connection, concurrency })
   ```
4. Always handle errors by throwing — BullMQ retries on throw.

### Env var additions

1. Add the key to `apps/backend/src/config/index.ts` under `envSchema`:
   ```typescript
   NEW_KEY: z.string().optional()   // or .min(1) if required
   ```
2. Export it from `config`: `newKey: parsed.data.NEW_KEY`.
3. Add it to `apps/backend/.env.example` with a placeholder comment.
4. Document it in `services/README.md` under the relevant service section.

---

*Part of the [Fauward services guide](./README.md)*
