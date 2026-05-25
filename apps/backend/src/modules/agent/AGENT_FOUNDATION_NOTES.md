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


---

# Agent Trigger Build — Failed Delivery

> Date: 2026-05-25

## What is now wired

The agent now wakes up on a **real** `FAILED_DELIVERY` transition. Three code paths emit a BullMQ event onto `fauward-agent-events`:

| Path | File | Endpoint | Emit location |
|---|---|---|---|
| Tenant portal | `shipments.routes.ts:831` | `PATCH /api/v1/shipments/:id/status` | After transaction, when `status === 'FAILED_DELIVERY'` |
| Driver app | `driver.routes.ts:298` | `PATCH /api/v1/driver/shipments/:id/failed` | After transaction (captured `shipmentEvent.id`) |
| Field app (Fauward Go) | `field.routes.ts:571` | `POST /api/v1/field/mutations` (`exception_submit`) | After `createShipmentEvent`, when `nextShipmentStatus === 'FAILED_DELIVERY'` |

### Shared enqueue helper

`apps/backend/src/modules/agent/agent.queue.ts` — `enqueueAgentEvent(app, event)`:
- Enqueues to `agentQueue` (BullMQ) with `jobId: event.eventId`
- Catches errors, logs a warning, and **swallows** — the calling route's delivery flow is never broken
- Event shape matches what `AgentEventSchema` already expects

### Stable event id

Format: `failed-delivery-{shipmentId}-{shipmentEventId}`
- `shipmentEventId` is the UUID of the `ShipmentEvent` row created in the same transaction
- Unique per transition attempt
- `jobId` on the BullMQ job is set to this value, so queue-level deduplication is possible if the same eventId is reused

### What happens end to end

1. A driver marks a delivery as failed (or tenant portal does, or field app does)
2. Shipment status becomes `FAILED_DELIVERY`
3. A `ShipmentEvent` is created
4. `enqueueAgentEvent` fires a BullMQ job with `type: 'failed_delivery'`
5. The registered worker (`startAgentWorker`) picks it up
6. `runAgent()` runs the LLM with `tracking_exception_analysis` task
7. Proposed tools go through `evaluatePolicy()`:
   - Safe tools → `AUTO_APPLIED`
   - Risky tools → `PENDING_APPROVAL` (visible in the tenant portal)
8. Redis idempotency (`agent:event:{eventId}`) prevents double-processing

## Tests

- `agent.queue.test.ts` (3 tests): enqueue with correct data/jobId, error swallowed, dedup via jobId
- Existing agent service + route tests still pass

## What is intentionally NOT wired yet

- **Stuck / SLA events** — no automatic trigger on SLA breach
- **Delivered events** — no trigger on `DELIVERED` status
- **Shipment created** — the existing `shipment_created` event type exists but no queue emission is wired
- **Natural language queries** — still only via the `POST /v1/agent/query` endpoint

These are next chunks.

## Files changed

- `apps/backend/src/queues/queues.ts` — added `agentQueue`
- `apps/backend/src/modules/agent/agent.queue.ts` — new shared enqueue helper
- `apps/backend/src/modules/agent/agent.queue.test.ts` — enqueue tests
- `apps/backend/src/modules/shipments/shipments.routes.ts` — replaced HTTP `fireAgentEvent` with BullMQ `enqueueAgentEvent` (only for `FAILED_DELIVERY`)
- `apps/backend/src/modules/driver/driver.routes.ts` — added `enqueueAgentEvent` after failed-delivery transaction
- `apps/backend/src/modules/field/field.routes.ts` — added `enqueueAgentEvent` after `createShipmentEvent` when status is `FAILED_DELIVERY`

---

## UI polish — 2026-05-25 (branch `feat/agent-ui-polish`)

- **Agent Actions screen** (`apps/tenant-portal/src/pages/agent/AgentActionsPage.tsx`) — now uses the portal's shared `EmptyState`, `Skeleton`, and `Badge` components instead of bespoke divs. The local `StatusBadge` used dynamic Tailwind colour classes (`bg-${color}-50`) that the JIT compiler couldn't see, so badges were rendering unstyled — replaced with the existing `Badge` variant map. Data now renders as readable cards (icon + plain-English summary derived from `type` + `payload` + timestamp + Approve/Reject) instead of a table. Error state has a `Try again` button wired to TanStack `refetch()`. Hooks, endpoints, and the approve-confirm `Dialog` are unchanged.
- **`/agent` landing copy** (`apps/tenant-portal/src/pages/agent/AgentPage.tsx`) — rewritten to match what's actually built. Hero now describes failed-delivery handling + approval gating only. Capability cards split into **Available today** (Failed-delivery response, Human-approved actions, Instant read-only lookups) and **Coming soon** (Auto-assignment, SLA breach prediction, Carrier selection — visually muted with dashed border + `Coming soon` badge). The "Ask a question" section keeps the existing `/v1/agent/query` endpoint but is now flagged `Experimental` with honest scoping copy.

---

## Tasks + Usage + Run Agent Sweep — 2026-05-25 (branch `feat/agent-run-and-tabs`)

### New IA

- Nav children for Fauward Agent are now `Tasks` (`/agent/tasks`) and `Usage` (`/agent/usage`). The brochure `AgentPage.tsx` is deleted. `/agent` redirects to `/agent/tasks`. Plan gating via `PlanFeatureRoute feature="agent"` unchanged.

### Schema

- Migration `0033_ai_agent_run_progress` adds five columns to `AiAgentRun`: `stage TEXT`, `scannedCount INT DEFAULT 0`, `flaggedCount INT DEFAULT 0`, `proposedCount INT DEFAULT 0`, `finishedAt TIMESTAMP(3)`. The frontend polls these for the sweep popup animation.

### Run Agent sweep

- **Two phases.** Phase 1 = deterministic detectors (free, fast, tenant-scoped, no LLM). Phase 2 = LLM-proposed fixes via the existing `runAgent()` chain, batched by finding kind so risky tools still flow through `evaluatePolicy()` and land as `PENDING_APPROVAL` `AgentAction` rows.
- **Detectors built** (`apps/backend/src/modules/agent/sweep.detectors.ts`):
  | Detector | Source |
  |---|---|
  | `unassigned` | `Shipment.assignedDriverId IS NULL` on non-terminal statuses that need a driver |
  | `overloaded_driver` | Reuses the `_count.shipments` query shape from `get_available_drivers`, threshold = 8 |
  | `past_deadline` | `Shipment.estimatedDelivery < now` on non-terminal statuses |
  | `failed_unhandled` | `status = FAILED_DELIVERY` with last `ShipmentEvent.timestamp` for context |
  | `stuck` | Reads existing OPEN/IN_PROGRESS `ExceptionCase` rows of type `STUCK` (written by `apps/backend/src/modules/control-tower/stuck-shipment.detector.ts`) |
- **Detectors skipped honestly:** SLA breach prediction — no breach-window field on `Shipment`; fabricating one would be dishonest. Stays "Coming soon" on the landing page. Anomaly / "unusual" LLM detection is deferred to a follow-up (per the spec rule it must be presented as "flagged for review", not a guaranteed detector).
- **Every finding** is written as a `flag_finding` `AgentAction` (auto-applied, no handler) linked to the sweep's `runId` for visibility. For actionable kinds (`unassigned`, `past_deadline`, `failed_unhandled`) the sweep also calls `runAgent()` once per kind so the LLM can propose specific tool calls — these flow through the existing policy gate and land in `Tasks` with the right risk classification.
- **Execution.** BullMQ background job. `POST /v1/agent/run` creates the `AiAgentRun`, enqueues a `sweep` event onto the existing `agentQueue`, returns 202 + `runId`. The worker (`apps/backend/src/modules/agent/agent.worker.ts`) wraps `runSweep` in `runWithTenantContext` per memory `bullmq_tenant_context` (workers run outside Fastify scope; the Prisma tenant plugin would otherwise block all writes).
- **Frontend polls** `GET /v1/agent/run/:id` every 1s while `status === 'RUNNING'`. The `RunAgentSheet` (normal-flow component, no `position: fixed`) animates real polled stages: `scanning → flagged → proposing → complete`. Counts come from the polled columns. `Continue` invalidates `agent-actions` queries so the new findings appear in the Tasks list.
- **Cooldown.** `@fastify/rate-limit` enforces 1 sweep per 5 minutes per tenant. Guarded with `typeof app.rateLimit === 'function'` so test harnesses without the plugin can still mount the routes.
- **Usage gating.** `enforceSweepLimits` pre-flights `TenantAiLimit` before queueing — 402 if monthly budget exhausted, 403 if `agent_sweep` not in `featuresEnabled`. Each LLM call inside the sweep is then independently checked + recorded by `LLMGatewayService.enforceLimits()` and `recordUsage()`. Manual-trigger only in this build; scheduled runs would multiply LLM cost — flagged as follow-up.

### Usage tab

- `GET /v1/agent/usage` returns `TenantAiUsage` aggregates (requests, tokens, costUsd), `TenantAiLimit`, and `AgentAction` counts (total, autoApplied, approved, by type) for the current month.
- `AgentUsagePage` renders 3 `StatCard`s + a `UsageMeter` for the active quota (budget / flash / pro — whichever is set) + a type breakdown. If no limit is set, shows "No limit on your plan" rather than a fake denominator.

### Tests

- `apps/backend/src/modules/agent/sweep.service.test.ts` — 6 vitest specs (empty sweep, tenant isolation, flag_finding linkage, runAgent routing, LLM batch failure isolation, fatal error → run marked FAILED). All green. Backend agent module: 27/27 passing.
- Tenant-portal: 9/9 passing.

### Follow-ups

- Scheduled / cron runs — explicitly NOT in this build because they'd multiply LLM cost on tenants who don't notice. Add a daily-summary opt-in before enabling.
- More detectors: SLA breach prediction needs a deadline-window field on `Shipment`. Address backfill needs a similar field.
- Super-admin oversight — a console view of sweeps across all tenants.
- Smarter LLM batching: current implementation caps each kind at 10 findings per LLM call. Investigate parallel batches and per-kind prompts.
- "Anomaly" / unusual detection via LLM over the gathered findings — best-effort, must be labelled "flagged for review", not a guaranteed detector.

---

## Run popup → modal + finding-status mapping — 2026-05-25

### Bug fixed

Sweep findings were not appearing on the Tasks list. Root cause: the sweep writes `flag_finding` rows with `status: 'AUTO_APPLIED'`, but the only place the frontend surfaced AUTO_APPLIED was under "Done" (which also included APPLIED). Pending LLM proposals appeared under "Needs you" as intended, but informational flags (the bulk of a sweep) were effectively buried.

### Resolution

A new **Flagged** tab was added to the Tasks page so findings have their own clear home. The full mapping:

| AgentAction.status | Tab | Approve/Reject visible? | Use |
|---|---|---|---|
| `PENDING_APPROVAL` | **Needs you** | yes | Risky proposals waiting for a human (reroute, reassign, send notification). |
| `AUTO_APPLIED` | **Flagged** | no | Sweep `flag_finding` rows + auto-approved read-only tool calls. |
| `APPLIED` | **Done** | no | Human-approved actions that executed successfully. |
| `REJECTED` | **Rejected** | no | Actions the human rejected, plus anything policy-blocked. |
| `FAILED` | (visible under **All**) | no | Surfaced in the summary strip's Failed count and reachable via All. |

Future detectors and tool handlers MUST use these status values. Anything written outside this set will be invisible to the Tasks UI (only "All" shows it).

The `/api/v1/agent/actions/summary` endpoint now returns `{ needsYou, flagged, doneToday, failed }`. `doneToday` is APPLIED-only so the strip number matches the Done tab. Tab labels show counts when non-zero (e.g. `Needs you (3)`, `Flagged (7)`).

### Run popup as Dialog

`RunAgentSheet` now renders inside the shared `Dialog` primitive (the same Radix-based modal as the Approve confirmation). Page no longer reflows behind the run. Centered, dimmed backdrop, Escape-closes. The stage list switches every row to a green check when `run.status === 'COMPLETED'` — previously the final `Complete` row stayed on the spinner because `stageReached('complete', 'complete')` returned `'active'`. Clicking **Continue** closes the modal, invalidates `agent-actions` queries, and auto-switches to whichever tab has the new items (Needs you if the LLM produced any PENDING proposals, otherwise Flagged).

---

## Readable flags + deterministic proposals — 2026-05-25

### Bugs fixed

1. **Flags read as "Flag finding / Flag finding".** The Tasks card's title used `toolTitle(action.type)` and `formatPayloadSummary` had no `flag_finding` case, so both lines fell back to the humanised type — `"Flag finding"` — for every flag, even though the payload carried the relevant identifiers (tracking number, driver name, job count, etc.). Both now go through a shared formatter at [apps/tenant-portal/src/pages/agent/agent-tasks.format.ts](apps/tenant-portal/src/pages/agent/agent-tasks.format.ts) that branches on `payload.kind` and reads the kind-specific fields. The Flagged card now reads like a sentence: "Shipment #TR-12345 has no driver assigned", "Ade Onifade has 12 active jobs (threshold 8)", "Delivery #TR-12345 failed and hasn't been re-actioned", etc. Each kind gets a distinct lucide icon (UserX / Users / Clock / AlertTriangle / PauseCircle).

2. **"Needs you" was always empty.** Phase 2 of the sweep delegated to `runAgent()` → the LLM. Two latent issues compounded: (a) the system prompt at [agent.prompts.ts](apps/backend/src/modules/agent/agent.prompts.ts) is generic and never instructs the model that a sweep event carries findings to act on; (b) the gateway's confidence parse at [llm-gateway.service.ts:128-130](apps/backend/src/shared/services/llm-gateway.service.ts#L128-L130) does `outputSchema.parse(response.result)` (which strips unknown keys — `AgentToolOutputSchema` doesn't include `confidence`) and then `z.object({ confidence: z.number() }).passthrough().parse(parsed)` — so even a perfectly-shaped LLM response throws `ZodError: confidence is required`. The sweep's try/catch swallowed the throw and produced zero PENDING proposals every time. **Pre-existing gateway parse bug noted for a separate fix; the sweep no longer depends on it.**

### Resolution

Phase 2 no longer calls the LLM. [sweep.service.ts](apps/backend/src/modules/agent/sweep.service.ts) now writes proposals deterministically. Detector → proposal mapping:

| Finding kind | Proposed action | Status | Notes |
|---|---|---|---|
| `unassigned` | `assign_shipment` to best available driver | `PENDING_APPROVAL` | Driver picked via `pickBestAvailableDriver` — `isAvailable: true`, ordered ASC by `_count.shipments` in ACTIVE_STATUSES (mirrors `get_available_drivers`). If no available driver exists, leaves the finding as flag-only. |
| `failed_unhandled` | `send_customer_notification` (`templateKey: 'failed_delivery'`, channel: email) | `PENDING_APPROVAL` | The universally-safe action — admin can reject if they're handling it differently. |
| `past_deadline` | `send_customer_notification` (`templateKey: 'delayed'`, channel: email) | `PENDING_APPROVAL` | Same pattern — notify the customer of the delay. |
| `overloaded_driver` | None | flag-only | "Reassign some jobs" needs business logic we don't have. **Deliberate informational decision.** |
| `stuck` | None | flag-only | The existing 15-min `stuck-shipment.detector` already creates `ExceptionCase` rows for human triage. **Deliberate informational decision.** |

Approval still flows through the existing `approveAgentAction` endpoint, which re-runs `evaluatePolicy` and invokes the real handler. The safety gate and audit trail are unchanged — the sweep is now just a faster, more reliable proposer.

A per-finding try/catch isolates write failures so one bad proposal doesn't abort the sweep. Tests in [sweep.service.test.ts](apps/backend/src/modules/agent/sweep.service.test.ts) cover: unassigned-with-driver writes PENDING, unassigned-without-driver stays flag-only, failed_unhandled writes PENDING notify, overloaded_driver stays flag-only, throw isolation, fatal-error → FAILED.

### Follow-ups

- **Fix the gateway confidence parse** at [llm-gateway.service.ts:128-130](apps/backend/src/shared/services/llm-gateway.service.ts#L128-L130) — pre-existing bug; affects every LLM-driven path (failed-delivery agent, `/v1/agent/query`), not just the sweep. The schema should either include `confidence` or the gateway should treat it as optional and fall back to a default.
- **Reintroduce the LLM** for cases that need genuine judgment — e.g. proposing reroute targets when the failed delivery doesn't have an obvious "notify and wait" path. Behind a feature flag and only after the gateway bug above is fixed.
- **Past-deadline detector** could also propose `flag_sla_risk` AUTO_APPLIED (records the risk without bothering the human). Skipped for v1 to keep the spec's "informational vs PENDING" decision crisp; revisit when the SLA risk dashboard exists.
