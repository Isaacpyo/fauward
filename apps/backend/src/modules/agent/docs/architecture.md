# Fauward Agent — Architecture & Safety Model

← [Back to README](../README.md)

---

## Architecture

```
Shipment Event (eventId required)
        │
        ▼
agent.routes.ts       Validates auth + eventId. Derives tenantId from
                      auth context — never from request body.
        │
        ▼
agent.service.ts      Validates event (AgentEventSchema). Checks
                      processedEventIds Set for duplicate eventId.
                      Builds tenant-scoped system prompt. Starts loop.
        │
        ├── LLMGatewayService
        │   Routes each task to the configured model and validates output.
        │
        ├── agent.policy.ts          evaluatePolicy() — called BEFORE every
        │   ├── blocked              tool execution. Handler is never invoked
        │   ├── requires_approval    for blocked or requires_approval.
        │   └── auto_approved
        │
        └── agent.handlers.impl.ts   Executes Prisma queries in transactions.
                 ├── assign / reroute / flag SLA risk
                 ├── get drivers / carrier rates / shipment details
                 ├── send notification (via BullMQ notification queue)
                 └── 7 scoped analytics queries (read-only)
```

The loop runs until the gateway-backed model stops calling tools (`finish_reason: stop`) or `AGENT_MAX_ITERATIONS` is reached. Tool calls within a batch run in parallel via `Promise.all`. Results are fed back into context for the next iteration.

---

## Event flow

### MVP — direct HTTP

The shipment service posts directly to the agent endpoint after a state change. Simple, but the caller blocks and there is no retry logic.

```
shipments.service.ts
  └── POST /v1/agent/handle-event
        └── runAgent() executes inline
```

**Suitable for:** development, staging.

### Production — outbox queue + BullMQ

Events flow through the outbox pattern so the calling service is never blocked. The `agent.worker.ts` processes jobs with concurrency 5.

```
shipments.service.ts
  └── writes outboxEvent (agent.event.queued)
        └── outbox relay enqueues job → fauward:agent:events
              └── agent.worker.ts
                    └── AgentEventSchema.safeParse() → runAgent()
```

**Suitable for:** production. Provides automatic retry, dead-letter handling, and backpressure.

---

## Safety and control model

### Action authority model

Every tool call is evaluated by `evaluatePolicy()` in `agent.policy.ts` before the handler runs.

| Decision | Examples | What happens |
|---|---|---|
| `auto_approved` | Assign unassigned shipment, flag SLA risk, read drivers/rates, send approved notification, all 7 analytics queries | Handler executes immediately |
| `requires_approval` | Reroute assigned shipment, driver reassignment | `executed: false` logged — LLM reports the constraint; no mutation occurs |
| `blocked` | Cross-tenant access, unknown tool, any tool absent from the policy switch | `executed: false` logged — run continues; LLM acknowledges the block |

Policy is evaluated **before** `withIdempotency()` is called. If the decision is anything other than `auto_approved`, the handler is never invoked.

### Tenant isolation

Five independent layers enforce tenant boundaries:

1. **Route layer** — `/v1/agent/query` takes `tenantId` exclusively from the JWT auth context. Any `tenantId` in the request body is silently ignored.
2. **Schema layer** — `AgentEventSchema` requires `tenantId` (min length 1). Invalid events are rejected before reaching the service.
3. **Policy layer** — `evaluatePolicy()` checks `requestingTenantId === tenantId`. Cross-tenant calls are blocked regardless of tool name.
4. **Handler layer** — Every Prisma query includes `where: { tenantId: ctx.tenantId }`. Tools that accept a `tenantId` parameter call `assertTenant()` to validate it matches the run context.
5. **Audit layer** — Every `AgentAuditRecord` is tagged with `tenantId` from the run context, never from tool arguments.

### Idempotency

`processedEventIds` is a module-level `Set<string>` in `agent.service.ts`. Before the model is called, the service checks whether `event.eventId` is already in the set. If so, it returns immediately with `status: 'already_processed'` — no model call, no handler calls, no side effects.

After a successful run (any terminal status), the `eventId` is added to the set.

**What this prevents:** double-assignment and double-notification when a caller retries a failed HTTP request or BullMQ redelivers a job.

**MVP limitation:** the Set is in-memory and process-scoped — it does not survive restarts or work across multiple instances. Phase 2 replaces this with a Redis `SETNX` check or a durable idempotency record.

### Audit logging

Every agent run produces an `AgentAuditRecord` written via pino at level `info`.

**Fields logged:**
- `runId` (generated per audit record), `eventId`, `tenantId`, `shipmentId`, `eventType`
- Per-action: tool name, policy decision, `executed` flag, argument key summary, result summary, duration (ms), error message
- Run status, final message, token usage (`promptTokens / completionTokens / totalTokens`), total duration (ms)

**Fields never logged:**
- Raw tool argument values — only the key names are logged (e.g. `assign_shipment: [shipmentId, driverId, reason]`), never the values
- Customer PII: email, phone number, address, customer name
- API keys or bearer tokens
- Full model response content beyond `finalMessage`

These records are designed to power an **Agent Activity** tab in the tenant portal and super admin console using `AiAgentRun` and the gateway usage tables.

### Notification safety

- The Zod schema for `send_customer_notification` restricts `templateKey` to exactly 5 approved values: `out_for_delivery`, `delayed`, `failed_delivery`, `reattempt_scheduled`, `sla_risk_update`. Any other value is rejected before the handler runs.
- The system prompt explicitly prohibits free-form customer messages.
- `dedupNotification()` (in `agent.handlers.ts`) prevents the same `shipmentId + templateKey + channel` combination from being queued more than once within a single agent run.

### Natural language analytics safety

- There is no general-purpose analytics tool. The LLM can only call one of 7 pre-written, tenant-scoped queries.
- No tool accepts a `question`, `query`, or `sql` parameter.
- All 7 analytics schemas use Zod `.strict()` — unexpected fields are rejected at parse time.
- All 7 analytics tools are `auto_approved` — they are read-only and cannot mutate any state.
- Every analytics handler calls `assertTenant()` to validate the `tenantId` argument matches the run context.

---

## Implementation phases

### Phase 1 — Current MVP

- Direct HTTP event firing
- In-memory `processedEventIds` Set (process-scoped)
- Policy layer: `auto_approved / requires_approval / blocked`
- 14 tools: 7 operational + 7 scoped analytics
- Pino structured audit logging (stderr / log aggregator)

### Phase 2 — Production hardening

- Outbox queue + BullMQ worker
- Redis `SETNX` or durable idempotency storage
- `AiAgentRun` Prisma table for persistent audit records
- Per-carrier shipment volume tracking (requires carrier-shipment linkage in schema)

### Phase 3 — Approval workflow + observability

- Approval workflow UI in tenant portal for `requires_approval` decisions
- Agent Activity tab (tenant portal + super admin) powered by `AiAgentRun`
- SSE streaming for real-time run visibility
- Per-tenant agent config (max iterations, enabled tools, notification budgets)
