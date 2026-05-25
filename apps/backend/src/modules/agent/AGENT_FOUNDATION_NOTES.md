# Agent Foundation Build — Completion Notes

> Branch: `feat/agent-foundation`  
> Date: 2026-05-25

## What is now wired

1. **`AgentAction` primitive** — New Prisma model (`agent_actions`) with tenant scoping, run linkage, payload, risk classification, and status tracking. Migration `0030_agent_action` created.

2. **LLM tool-calling loop** — `llm-gateway.service.ts` forwards the `tools` array to DeepSeek (OpenAI-compatible function-calling), always sends `buildSystemPrompt(tenantId)` as the system message, and parses `tool_calls` from the model response.

3. **Policy gate + safe execution** — `evaluatePolicy()` is wired into `runAgent()`. Every proposed tool is classified before execution:
   - `auto_approved` → handler runs immediately, `AgentAction` written with `AUTO_APPLIED`
   - `requires_approval` → handler **never runs**, `AgentAction` written with `PENDING_APPROVAL`
   - `blocked` / unclassified → handler **never runs**, `AgentAction` written with `REJECTED`

4. **Tenant isolation** — `tenantId` in every tool payload is overwritten with the event's auth-context tenantId before the handler sees it. Cross-tenant policy checks are in place.

5. **Durable idempotency** — The in-memory `processedEventIds` Set is replaced with Redis `SET key NX EX <ttl>`. Duplicate event IDs return `already_processed` without re-invoking handlers or the LLM.

6. **Worker registration** — `startAgentWorker()` is registered in `start-workers.ts` with a matching `stopAgentWorker()` shutdown hook. The worker runs on production startup.

## Current safe-vs-ask classification (human-reviewed)

| Classification | Tools |
|---|---|
| **`auto_approved`** | `get_available_drivers`, `get_shipment_details`, `get_carrier_rates`, `flag_sla_risk`, `get_failed_shipments_count`, `get_delay_reasons`, `get_sla_breach_rate`, `get_driver_performance`, `get_carrier_performance`, `get_shipments_by_status`, `get_weekly_operations_summary` |
| **`requires_approval`** | `send_customer_notification`, `assign_shipment` (if already assigned), `reroute_shipment` |
| **`blocked`** | Any unlisted tool name, plus cross-tenant calls |

## What is intentionally still manual

- **Approving `PENDING_APPROVAL` actions.** There is no UI button yet. Actions can be approved by updating the `AgentAction` row (`status: 'APPLIED'`) and running the handler manually (or via a future API endpoint). This is by design — this build makes the agent safe; the approval UX is the next chunk.

## Tests that prove safety

All tests in `agent.service.test.ts` pass (8 tests):

1. Structured tool proposals + tenant-scoped system prompt
2. Safe action runs and writes `AUTO_APPLIED`
3. Risky action does **not** run and writes `PENDING_APPROVAL`
4. Unclassified tool defaults to `REJECTED`
5. Tenant isolation — handler receives auth tenantId, never the LLM payload tenantId
6. Handler failure writes `FAILED` action record
7. Redis idempotency — duplicate event is a no-op
8. End-to-end: safe applied + risky pending + tenant isolated + replay idempotent

## Follow-ups

1. **Approval API + UI** — Build the endpoint and tenant-portal screen to list, approve, or reject `PENDING_APPROVAL` actions.
2. **Agent action retry** — For `FAILED` actions, expose a retry mechanism (idempotency-aware).
3. **Metrics / alerting** — Add counters for `AUTO_APPLIED`, `PENDING_APPROVAL`, `REJECTED`, and `FAILED` action rates.
4. **Expand auto-approved list** — Revisit `send_customer_notification` and `assign_shipment` policy once operational confidence is high.
5. **Multi-tool execution order** — Currently tools are evaluated sequentially; consider parallelizing read-only auto-approved tools.
