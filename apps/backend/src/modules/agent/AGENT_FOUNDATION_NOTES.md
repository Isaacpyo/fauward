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

## Tests that prove safety (foundation)

All tests in `agent.service.test.ts` pass (8 tests):

1. Structured tool proposals + tenant-scoped system prompt
2. Safe action runs and writes `AUTO_APPLIED`
3. Risky action does **not** run and writes `PENDING_APPROVAL`
4. Unclassified tool defaults to `REJECTED`
5. Tenant isolation — handler receives auth tenantId, never the LLM payload tenantId
6. Handler failure writes `FAILED` action record
7. Redis idempotency — duplicate event is a no-op
8. End-to-end: safe applied + risky pending + tenant isolated + replay idempotent

---

# Agent Approval UI Build — Completion Notes

> Date: 2026-05-25

## What is now wired

### Backend endpoints

| Method | Path | Auth | Plan gate | Behavior |
|---|---|---|---|---|
| `GET` | `/v1/agent/actions?status=` | JWT + tenant match | `agent` | Lists tenant-scoped actions, paginated |
| `POST` | `/v1/agent/actions/:id/approve` | JWT + tenant match | `agent` | Re-checks policy, runs handler, updates to `APPLIED` |
| `POST` | `/v1/agent/actions/:id/reject` | JWT + tenant match | `agent` | Sets `REJECTED`, never runs handler |

### Frontend

- **Nav item:** "Pending Actions" child under "Fauward Agent" in sidebar (`/agent/actions`)
- **Page:** `AgentActionsPage` — lists pending actions with human-readable summaries, Approve/Reject buttons per row
- **Confirm dialog:** Approve requires explicit confirmation
- **States:** loading skeleton, empty state, error banner
- **Plan gate:** Client-side via `PlanFeatureRoute`; server-side via `requireFeature('agent')`
- **API hooks:** `useAgentActions`, `useApproveAgentAction`, `useRejectAgentAction` in `src/api/agent-actions.ts`

### Safety proofs (backend route tests — 10 tests)

1. List returns only the caller tenant's pending actions
2. Plan without `agent` feature returns 403
3. Approving a pending action runs the handler once and flips to `APPLIED`
4. Double-approve is a guarded no-op (409, handler runs once)
5. Cross-tenant approve returns 404, no leak, handler not called
6. Handler error on approve flips to `FAILED` with error message
7. Reject never runs the handler; status becomes `REJECTED`
8. Cross-tenant reject returns 404
9. Rejecting already-rejected action is a no-op error
10. Frontend API tests verify correct endpoints are called

## Architecture decisions upheld

1. **Approval reuses the existing handler + policy path.** `approveAgentAction()` calls `evaluatePolicy()` again, then invokes the handler from `buildToolHandlers(app)` with the approver's auth-context `tenantId`.
2. **Tenant-scoped everywhere.** Every query filters by `tenantId`. Cross-tenant access returns 404.
3. **Plan-gated server-side.** `requireFeature('agent')` on all three endpoints.
4. **Status transitions are one-way and guarded.** Only `PENDING_APPROVAL` → `APPLIED`/`REJECTED`. Already-processed actions return 409.
5. **Every decision is attributed.** `approvedBy` = acting user's id; `appliedAt` is set.

## Files changed

### Backend
- `apps/backend/src/modules/tenants/plan.service.ts` — added `agent: true` to PRO and ENTERPRISE
- `apps/backend/src/modules/agent/agent.schemas.ts` — added `AgentActionListQuerySchema`
- `apps/backend/src/modules/agent/agent.service.ts` — added exported `approveAgentAction()`
- `apps/backend/src/modules/agent/agent.routes.ts` — added list, approve, reject endpoints
- `apps/backend/src/modules/agent/agent.routes.test.ts` — route tests (10 tests)
- `apps/backend/src/modules/agent/agent.service.test.ts` — existing service tests still pass
- `apps/backend/prisma/migrations/0030_agent_action/migration.sql` — migration (from foundation)

### Frontend
- `apps/tenant-portal/src/layouts/navigation.ts` — added "Pending Actions" child nav
- `apps/tenant-portal/src/router.tsx` — added `/agent/actions` route with plan gate
- `apps/tenant-portal/src/api/agent-actions.ts` — TanStack Query hooks + standalone API functions
- `apps/tenant-portal/src/api/agent-actions.test.ts` — API function tests (3 tests)
- `apps/tenant-portal/src/pages/agent/AgentActionsPage.tsx` — approval screen

## Remaining follow-ups

1. **Super-admin oversight view** — A console page to see pending actions across all tenants.
2. **Bulk approve / reject** — Select multiple actions and approve/reject in batch.
3. **Notifications when actions are waiting** — Email or in-app notification when new pending actions arrive.
4. **Agent action retry** — For `FAILED` actions, expose a retry mechanism.
5. **Metrics / alerting** — Add counters for action rates.
