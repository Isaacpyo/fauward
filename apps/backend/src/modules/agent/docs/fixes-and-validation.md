# Fauward Agent — Fixes & Live Validation

← [Back to README](../README.md)

This document covers the fixes applied during live testing and the validated end-to-end test results.

> Current note: this file is historical. The agent now routes AI work through `LLMGatewayService`; direct provider-specific calls are not allowed in the agent module. Provider-specific notes below describe older validation bugs and are retained only as context.

---

## Fixes applied

### 1. Provider `reasoning_content` passback (`agent.service.ts`)

**Problem:** With `reasoning_effort` enabled, the provider returned a `reasoning_content` field alongside the assistant message. On the next iteration, the API requires that field to be passed back in the message history. The service was reconstructing the message manually and dropping it, causing a `400` error after the first tool call batch.

**Fix:** Spread the full message object instead of reconstructing it, so any provider-specific fields are preserved automatically.

```typescript
// Before
messages.push({
  role: 'assistant',
  content: assistantMessage.content ?? null,
  tool_calls: assistantMessage.tool_calls
});

// After
messages.push({ ...assistantMessage } as OpenAI.Chat.Completions.ChatCompletionMessageParam);
```

---

### 2. Reasoning effort per event type (`agent.config.ts` + `agent.service.ts`)

**Problem:** All event types were using `legacy reasoning effort setting=high`, including simple read-only analytics queries. This drove up token usage unnecessarily.

**Fix:** Added `selectReasoningEffort()` to route lower-complexity events to `low` reasoning effort.

```typescript
export function selectReasoningEffort(eventType: AgentEventType): 'low' | 'high' | 'max' {
  switch (eventType) {
    case 'nl_query':
    case 'status_changed':
      return 'low';
    default:
      return agentConfig.reasoningEffort; // from legacy reasoning effort setting env var
  }
}
```

| Event type | Reasoning effort |
|---|---|
| `nl_query`, `status_changed` | `low` |
| `shipment_created`, `failed_delivery`, `sla_check` | env var (`high` by default) |

---

### 3. Duplicate tool call prevention (`agent.prompts.ts`)

**Problem:** The model called the same tool with identical arguments multiple times in a single run (e.g. `get_shipments_by_status` called 5 times). The idempotency cache in `agent.handlers.ts` prevented duplicate DB writes but couldn't stop the model from re-requesting.

**Fix:** Added an explicit rule to the system prompt:

```
Never call the same tool with the same arguments more than once.
If a tool already returned data, use that result.
```

**Impact:** Tool calls per `nl_query` run dropped from 10 → 4, token usage dropped 58% (40k → 16k).

---

### 4. Tenant resolver bypass (`tenant.resolver.ts`)

**Problem:** A global `tenantResolver` hook runs on every request and resolves the tenant from the `Host` header (e.g. `quickship.fauward.com`). Calling the agent from `localhost` has no tenant slug in the hostname, so the hook rejected the request with `404 Business not found` before it reached the agent route handler.

**Root cause:** `/v1/agent/handle-event` is a service-to-service endpoint authenticated by its own service token — it doesn't need tenant-from-hostname resolution. Tenant context comes from the validated request body.

**Fix:** Added a bypass in `tenant.resolver.ts` alongside the existing `/api/v1/admin` bypass:

```typescript
if (path === '/v1/agent/handle-event') {
  return {
    tenantId: 'system',
    tenantSlug: 'system',
    plan: 'SYSTEM',
    region: 'global',
    isSuperAdmin: true
  };
}
```

---

### 5. Shipment status change wiring (`shipments.routes.ts`)

The agent is wired into the shipment status update flow. After every status change, a fire-and-forget call is made to the agent endpoint:

```typescript
void fireAgentEvent(app, {
  eventId: `status-${shipment.id}-${updated.event.id}`,
  type: status === 'FAILED_DELIVERY' ? 'failed_delivery' : 'status_changed',
  tenantId,
  shipmentId: shipment.id,
  payload: {
    newStatus: status,
    previousStatus: shipment.status,
    ...(failedReason ? { reason: failedReason } : {})
  }
});
```

The `eventId` is stable per event (`status-<shipmentId>-<eventId>`) so retries are safely deduplicated. Failures are logged as warnings and do not affect the main shipment update response.

---

## Live test results

All tests run against tenant `07fa9a89-37a7-4177-99ba-8f52bb42d883` (Quick Ship) on a local dev instance.

### Test matrix

| # | Event type | Outcome | Tool calls | Tokens | Notes |
|---|---|---|---|---|---|
| test-001 | `nl_query` | `failed` | 0 | 0 | provider account balance zero |
| test-002 | `nl_query` | `failed` | 1 | 2,637 | `reasoning_content` passback bug |
| test-003 | `nl_query` | `completed` | 4 | 16,690 | After fix — correct answer, some duplicate calls |
| test-004 | `shipment_created` | `completed` | 3 | 6,146 | Placeholder shipment ID — correctly reported not found |
| test-005 | `shipment_created` | `completed` | 4 | 11,159 | **Full assignment — real Prisma write** |

---

### test-005 — full end-to-end assignment (passing)

**Input:** real shipment `777ae5a4` (status `PENDING`), real driver `8c22fe46` (`isAvailable: true`).

**Tool execution sequence:**

| Step | Tool | Decision | Executed | Duration |
|---|---|---|---|---|
| 1 (parallel) | `get_carrier_rates` | `auto_approved` | ✓ | 320ms |
| 1 (parallel) | `get_available_drivers` | `auto_approved` | ✓ | 780ms |
| 2 | `get_shipment_details` | `auto_approved` | ✓ | 1,028ms |
| 3 | `assign_shipment` | `auto_approved` | ✓ | 766ms |

**Database writes confirmed:**
- `Shipment.status` updated `PENDING` → `PROCESSING`
- `Shipment.assignedDriverId` set to `8c22fe46`
- `ShipmentEvent` created (source: `FAUWARD_AGENT`)
- `AuditLog` created (action: `AGENT_ASSIGN_SHIPMENT`)
- `OutboxEvent` created (type: `shipment.driver.assigned`)

**Carrier gap — correct escalation:** No rate cards were configured for the tenant. The agent correctly reported it could not select a carrier and escalated for human review — it did not fabricate options or proceed without one.

---

## Known gaps to address before production

| Gap | Impact | Resolution |
|---|---|---|
| No rate cards configured for test tenant | Agent cannot complete carrier selection | Add at least one rate card per tenant via admin UI |
| In-memory `processedEventIds` Set | Idempotency lost on restart or across instances | Phase 2: Redis SETNX or durable idempotency storage |
| `reasoning_content` is provider-specific | Will break if provider is swapped | The `{ ...assistantMessage }` spread is safe for all providers |
| `get_carrier_performance` returns catalogue only | No real per-carrier volume or on-time data | Phase 2: carrier-shipment linkage in Prisma schema |
