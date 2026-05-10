# Fauward Agent — Integration Guide

← [Back to README](../README.md)

---

## File structure

```
agent/
├── README.md                   Public-facing overview
├── docs/
│   ├── architecture.md         Event flow, policy layer, safety model, phases
│   ├── tools.md                Tool catalogue, event types, env vars
│   └── integration.md          This file
│
├── agent.types.ts              Shared TypeScript interfaces — no logic
├── agent.schemas.ts            Zod validation schemas for all agent inputs
├── agent.config.ts             Agent config and gateway task routing
├── agent.provider.ts           Compatibility wrapper; direct provider calls are not allowed
├── agent.prompts.ts            System prompt construction (tenant-scoped)
├── agent.policy.ts             Policy evaluation: auto_approved / requires_approval / blocked
├── agent.service.ts            Tool-calling loop, idempotency, policy integration
├── agent.tools.ts              14 tool definitions (Zod schemas)
├── agent.handlers.ts           Idempotency cache, notification dedup, HandlerContext  ⟵ DO NOT EDIT
├── agent.handlers.impl.ts      All 14 tool handlers wired to Prisma
├── agent.audit.ts              Structured pino audit logging
├── agent.routes.ts             Two Fastify endpoints
└── agent.worker.ts             BullMQ worker for production event processing
```

---

## Wiring into the backend

### 1. Register routes

Routes are already registered in `app.ts`:

```typescript
import { registerAgentRoutes } from './modules/agent/agent.routes.js';
await fastify.register(registerAgentRoutes);
```

This exposes:
- `POST /v1/agent/handle-event` — internal, service-token auth
- `POST /v1/agent/query` — tenant-facing, JWT auth

### 2. Start the BullMQ worker (production)

In `server.ts` or `app.ts`, after app initialisation:

```typescript
import { startAgentWorker } from './modules/agent/agent.worker.js';
startAgentWorker(app);
```

The worker connects to Redis at `REDIS_HOST:6379`, processes `fauward:agent:events` jobs with concurrency 5, and calls `runAgent()` for each.

### 3. Fire events from the shipment service

#### MVP — direct HTTP

```typescript
// After a status change in shipments.service.ts
await fetch('http://localhost:3001/v1/agent/handle-event', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.AGENT_SERVICE_TOKEN}`
  },
  body: JSON.stringify({
    eventId: crypto.randomUUID(), // stable per logical event — not per retry
    type: 'status_changed',
    tenantId: shipment.tenantId,
    shipmentId: shipment.id,
    payload: { newStatus, previousStatus: shipment.status }
  })
});
```

#### Production — BullMQ queue

```typescript
import { Queue } from 'bullmq';
import { AGENT_QUEUE_NAME } from './modules/agent/agent.worker.js';

const agentQueue = new Queue(AGENT_QUEUE_NAME, {
  connection: { host: process.env.REDIS_HOST ?? 'localhost', port: 6379 }
});

// shipment_created
await agentQueue.add('shipment_created', {
  eventId: crypto.randomUUID(),
  type: 'shipment_created',
  tenantId: shipment.tenantId,
  shipmentId: shipment.id,
  payload: { originPostcode, destPostcode, weightKg }
});

// sla_check (e.g. from a scheduled cron)
await agentQueue.add('sla_check', {
  eventId: `sla-${shipment.id}-${Date.now()}`,
  type: 'sla_check',
  tenantId: shipment.tenantId,
  shipmentId: shipment.id,
  payload: { slaDeadline: shipment.estimatedDelivery?.toISOString() }
});
```

### 4. Natural language query (tenant-facing)

The `/v1/agent/query` endpoint is called by the tenant portal. It uses the authenticated user's `tenantId` — no `tenantId` in the body.

```typescript
// From tenant portal or API client
const res = await fetch('/v1/agent/query', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${jwtToken}`
  },
  body: JSON.stringify({
    question: 'How many deliveries failed this week and why?',
    dateFrom: '2026-04-28',
    dateTo: '2026-05-02'
  })
});

const result = await res.json(); // AgentRunResult
console.log(result.finalMessage);
```

---

## Prisma model - `AiAgentRun`

Agent runs are persisted through the shared AI gateway:

```prisma
model AiAgentRun {
  id         String   @id @default(cuid())
  tenantId   String?
  agentType  String
  input      Json
  output     Json?
  status     String
  durationMs Int?
  createdAt  DateTime @default(now())
}
```

The gateway also updates `TenantAiUsage` and enforces `TenantAiLimit`.
---

## API response shape

Both endpoints return `AgentRunResult`:

```typescript
interface AgentRunResult {
  status: 'completed' | 'requires_approval' | 'blocked' | 'already_processed' | 'failed';
  eventId?: string;
  tenantId: string;
  shipmentId?: string;
  actions: Array<{
    tool: string;
    decision: 'auto_approved' | 'requires_approval' | 'blocked';
    executed: boolean;
    summary: string;        // argument key names only — no PII values
    durationMs?: number;
    error?: string;
  }>;
  finalMessage?: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  durationMs?: number;
}
```

**Status meanings:**

| Status | Meaning |
|---|---|
| `completed` | All auto-approved tools executed; LLM reached a final answer |
| `requires_approval` | At least one tool was gated — action not taken; LLM reported constraint |
| `blocked` | A cross-tenant or unknown tool call was blocked |
| `already_processed` | Duplicate `eventId` — no work done |
| `failed` | Unrecoverable error (timeout, model error, max iterations exceeded) |

---

## Manual test checklist

Verify these scenarios before deploying to staging or production. No automated test suite is currently configured.

**Input validation**
- [ ] `POST /v1/agent/handle-event` without `eventId` returns `400 { "error": "eventId is required" }`
- [ ] Event with unknown `type` returns `400` (Zod enum validation)
- [ ] `send_customer_notification` with `templateKey: "custom_text"` returns `400` (enum rejected)
- [ ] Analytics tool with extra field (e.g. `{ tenantId, sql: "DROP TABLE" }`) returns `400` (`.strict()` rejection)

**Auth and tenant isolation**
- [ ] `POST /v1/agent/handle-event` with wrong service token returns `401`
- [ ] `POST /v1/agent/query` with another tenant's `tenantId` in body — response `tenantId` matches JWT, not body value
- [ ] Policy check for cross-tenant: modify `requestingTenantId` in a test to differ from `tenantId` — tool action has `decision: "blocked"` in response

**Policy layer**
- [ ] `reroute_shipment` action: response contains `{ decision: "requires_approval", executed: false }` in `actions`
- [ ] `assign_shipment` for an unassigned shipment: `{ decision: "auto_approved", executed: true }`
- [ ] `send_customer_notification` with approved template: `{ decision: "auto_approved", executed: true }`

**Idempotency**
- [ ] Send same `eventId` twice in the same process: second call returns `{ status: "already_processed", actions: [] }`

**Audit logging**
- [ ] pino `info` log emitted for every run including blocked and requires_approval tools
- [ ] Log does not contain customer email, phone, or address values — only key names

**Resilience**
- [ ] When the gateway times out: response is `{ status: "failed", finalMessage: "..." }` — not a 500 error
- [ ] When the model exceeds `AGENT_MAX_ITERATIONS`: response is `{ status: "failed" }` — not a throw

---

## Future roadmap

- **Approval workflow UI** — tenant portal table showing `requires_approval` decisions with approve/reject and reason capture
- **`AiAgentRun` Prisma table** - persistent AI run audit trail
- **Agent Activity tab** — tenant portal and super admin view of all agent runs, filterable by status, event type, and date
- **Streaming responses** — SSE stream of tool calls and reasoning for real-time visibility in the portal
- **Multi-tenant config** — per-plan limits on max iterations, enabled tool sets, and notification budgets
- **Carrier performance data** — carrier-shipment linkage in Prisma enables `get_carrier_performance` to return real volume and on-time rate metrics
