# Fauward Agent — Reality Audit (claims vs. codebase)

> **Goal:** Determine, with file-level evidence, how much of the public marketing page the codebase actually implements.
>
> **This is a READ-ONLY audit.** No code was edited, refactored, or scaffolded.
>
> **Date:** 2026-05-24

---

## Phase 0 — Discovery Gate (reconciliation & 7 findings)

### Reconciliation Table

| Concept (from page/spec) | Real name in repo | File:line | Exists? |
|---|---|---|---|
| `Tenant` | `Tenant` | `prisma/schema.prisma:315` | ✅ Yes |
| `User` | `User` | `prisma/schema.prisma:422` | ✅ Yes |
| `TenantMembership` | `TenantMembership` | `prisma/schema.prisma:540` | ✅ Yes |
| `Customer` | `Customer` | `prisma/schema.prisma:684` | ✅ Yes |
| `Shipment` | `Shipment` | `prisma/schema.prisma:751` | ✅ Yes |
| `ShipmentEvent` | `ShipmentEvent` | `prisma/schema.prisma:880` | ✅ Yes |
| `Payment` | `Payment` | `prisma/schema.prisma:1508` | ✅ Yes |
| `Invoice` | `Invoice` | `prisma/schema.prisma:1412` | ✅ Yes |
| `InvoiceLineItem` | Stored as JSON (`lineItems Json`) | `prisma/schema.prisma:1432` | 🟡 Partial — no dedicated model |
| `CreditNote` | `CreditNote` | `prisma/schema.prisma:1483` | ✅ Yes |
| `Refund` | `Refund` | `prisma/schema.prisma:1536` | ✅ Yes |
| `ReturnRequest` | `ReturnRequest` | `prisma/schema.prisma:2200` | ✅ Yes |
| Shipment state `PENDING → … → DELIVERED` | `ShipmentStatus` enum | `prisma/schema.prisma:135-149` | ✅ Yes |
| Branch states (`FAILED_DELIVERY`, etc.) | `FAILED_DELIVERY`, `RETURNED`, `CANCELLED`, `EXCEPTION` | `prisma/schema.prisma:145-149` | ✅ Yes |
| Roles (`SUPER_ADMIN`, `TENANT_*`, `CUSTOMER_*`) | `UserRole` enum | `prisma/schema.prisma:119-133` | ✅ Yes |
| Money as `Decimal(12,2)` | `Decimal @db.Decimal(12, 2)` | `prisma/schema.prisma:1419` | ✅ Yes |

---

### Finding 1 — Is there an agent module at all?

**Yes — but incomplete.**

| Item | Location | Detail |
|---|---|---|
| AI agent module | `apps/backend/src/modules/agent/` | 15 source files + 4 docs |
| AI agent routes | `agent.routes.ts:12` | `POST /v1/agent/handle-event` (service-token auth), `POST /v1/agent/query` (JWT + `requireTenantMatch`) |
| Route registration | `app.ts:26`, `app.ts:255` | `registerFauwardAgentRoutes(app)` is called — routes are live |
| Field agent module (human drivers) | `apps/backend/src/modules/agents/` | `GET/POST /api/v1/agents/shipments/*`, `GET /api/v1/agents/tasks` — unrelated to AI |
| Agent BullMQ queue | `agent.worker.ts:9` | `fauward:agent:events` |
| Agent BullMQ worker | `agent.worker.ts:11` | `startAgentWorker()` **exported but NEVER started** — not in `start-workers.ts`, not in `server.ts` |
| `openai` dependency | `apps/backend/package.json:50` | `^6.34.0` |

**Critical gaps:**
- The worker exists but is **not wired into production startup** (`apps/backend/src/queues/start-workers.ts:1-31` never imports it).
- The architecture docs (`agent/docs/architecture.md:44-56`) describe an outbox → BullMQ production flow, but this flow is **non-operational** because the worker is never started.

---

### Finding 2 — Policy / approval-gating mechanism

**Types exist; enforcement is aspirational.**

| Item | Location | Detail |
|---|---|---|
| `PolicyDecision` type | `agent.types.ts:8` | `'auto_approved' \| 'requires_approval' \| 'blocked'` |
| `AgentRunStatus` type | `agent.types.ts:10-15` | `'completed' \| 'requires_approval' \| 'blocked' \| 'already_processed' \| 'failed'` |
| `evaluatePolicy()` | `agent.policy.ts:12-46` | Hard-coded tool-to-decision map |
| **Runtime invocation** | — | **NOT FOUND** — `evaluatePolicy` is defined but never imported or called in executable code |
| Approval middleware/guard | — | **NOT FOUND** |
| `AgentAction` model | — | **NOT FOUND** |
| `Suggestion` model | — | **NOT FOUND** |
| `Approval` model (agent-specific) | — | **NOT FOUND** |
| `AutomationRule` model | — | **NOT FOUND** |
| `AgentTask` model | — | **NOT FOUND** |
| `AiAgentRun` model | `prisma/schema.prisma:1775` | ✅ Exists — stores run logs (`RUNNING` / `COMPLETED` / `FAILED`) |

**How the service actually behaves:**
- `agent.service.ts:63` uses a hard-coded confidence threshold (`result.confidence >= 0.85 ? 'requires_approval' : 'completed'`) to set run status.
- The service **never executes tools** (see Finding 1a below). It calls the LLM with `allowAutoAction: false` and returns JSON recommendations. The `_toolHandlers` parameter is underscore-prefixed and **unused** (`agent.service.ts:25`).
- `agent.handlers.impl.ts` contains real DB mutations (assign, reroute, notify, flag SLA risk), but **nothing invokes them** in the current service flow.
- The architecture doc (`agent/docs/architecture.md:74`) claims `evaluatePolicy()` is "called BEFORE every tool execution." This is **false** — the function is dead code.

---

### Finding 3 — LLM wiring

**Real and active.**

| Item | Location | Detail |
|---|---|---|
| SDK | `llm-gateway.service.ts:1` | `openai` npm package |
| Provider | `llm-gateway.service.ts:76` | DeepSeek (OpenAI-compatible API) |
| Env vars | `.env.example:111-114` | `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`, `DEEPSEEK_REASONING_EFFORT` |
| Actual call site | `llm-gateway.service.ts:182-191` | `client.chat.completions.create({ model, messages, temperature: 0.2, response_format: { type: 'json_object' } })` |
| Task routing table | `llm-gateway.service.ts:13-31` | 17 tasks mapped to `deepseek-v4-flash` or `deepseek-v4-pro` |
| Consumers | `agent.service.ts`, `relay.ai.service.ts`, `tracking.ai.service.ts`, `control-tower.service.ts` | All call `gateway.run(...)` |
| Secondary integration | `apps/status-dashboard/services/ai-diagnoser.js:107` | Raw `fetch()` to DeepSeek + Moonshot/Kimi for SRE diagnosis |
| Python services | — | **NOT FOUND** — no LLM imports in Python code |
| Anthropic / Gemini / LangChain | — | **NOT FOUND** |

**Note:** The LLM gateway does **not** implement tool-calling (no `tools` parameter is passed to the model despite `RunInput` accepting it). It sends the task as a JSON prompt and expects a structured JSON response matching `outputSchema`. There is **no iterative tool-execution loop**.

---

### Finding 4 — "Fauward Go operator"

**Exists as the `Driver` model.**

| Item | Location | Detail |
|---|---|---|
| Entity name | `Driver` | `prisma/schema.prisma:924` |
| Location fields | `currentLat`, `currentLng`, `lastLocationAt` | `schema.prisma:934-936` |
| Availability | `isAvailable` | `schema.prisma:933` |
| Capacity | Lives on `Vehicle` | `schema.prisma:947` — `capacityKg`, `capacityM3` |
| Assignment link | `Shipment.assignedDriverId` | `schema.prisma:776-777` |
| Route stop link | `RouteStop.driverId` | `schema.prisma:994-995` |
| Backend module | `modules/driver/driver.routes.ts` | Location updates, route, POD, history |
| Field sync | `modules/field/field.routes.ts` | `/api/v1/field/*` endpoints |
| Fauward-Go PWA | `apps/fauward-Go/` | Dexie/IndexedDB offline sync |

**Proximity / workload logic:**
- `agent.handlers.impl.ts:131-182` (`get_available_drivers`) returns `currentLat`/`currentLng`, `activeJobCount` (via `_count.shipments`), and `vehicle.capacityKg`/`capacityM3`.
- **No proximity scoring algorithm exists** — the handler returns drivers ordered by `createdAt: 'asc'`, not by distance to origin postcode.
- **No workload balancing** — `activeJobCount` is returned raw; no "optimal" selection logic exists.

---

### Finding 5 — Carrier data

**Absent as described.**

| Item | Location | Detail |
|---|---|---|
| `Carrier` model | — | **NOT FOUND** |
| `CarrierAccount` | `prisma/schema.prisma:1052` | `name`, `carrier` (string label), `credentials` (JSON), `isActive` |
| `CarrierServiceLevel` | `prisma/schema.prisma:1071` | `name`, `transitDays`, `regions[]`, `isActive` |
| Reliability score | — | **NOT FOUND** |
| Price field on carrier | — | **NOT FOUND** |
| Service-level availability field | — | **NOT FOUND** |
| Carrier selection logic | `modules/rating/rating.service.ts:46-60` | Sorts by preferred-carrier list, then price ascending, then transitDays ascending |
| Auto-selection | — | **NOT FOUND** — quotes are returned ranked; caller must explicitly select via `POST /api/v1/tenant/rates/quotes/:id/select` (`rating.routes.ts:51`) |

The marketing claim "auto-selected by price + reliability score + availability" is **not implemented**. Carrier selection is manual and the ranking algorithm ignores reliability/availability scores because those fields do not exist.

---

### Finding 6 — Entitlement (Pro/Enterprise gating)

**UI-gated only; backend is unprotected.**

| Item | Location | Detail |
|---|---|---|
| `Tenant.plan` | `prisma/schema.prisma:328` | `STARTER \| PRO \| ENTERPRISE \| TRIALING` |
| `requireFeature()` guard | `shared/middleware/featureGuard.ts:4` | Reads `req.tenant?.plan`, calls `planService.hasFeature(plan, feature)`, returns 403 if missing |
| `requirePlan()` guard | `shared/middleware/planGuard.ts:3` | Reads `req.tenant?.plan`, returns 403 if not in allowed list |
| `PLAN_FEATURES` map | `modules/tenants/plan.service.ts:1-80` | Lists `customDomain`, `whiteLabel`, `financeModule`, `apiAccess`, etc. |
| `agent` in `PLAN_FEATURES` | — | **NOT FOUND** |
| Tenant portal UI gate | `tenant-portal/src/lib/plan-features.ts:62` | `agent: "pro"` — nav item hidden for Starter |
| Backend agent route guard | `agent.routes.ts:48-50` | `[app.authenticate, requireTenantMatch]` **ONLY** — no `requireFeature('agent')` or `requirePlan` |

**Critical gap:** Any authenticated tenant user can call `POST /v1/agent/query` regardless of plan. The Pro/Enterprise restriction exists **only in the React UI**.

---

### Finding 7 — Dashboard toggle ("switch it on from your dashboard")

**Does not exist.**

| Item | Location | Detail |
|---|---|---|
| `agentEnabled` column on `Tenant` | — | **NOT FOUND** |
| `agentEnabled` column on `TenantSettings` | — | **NOT FOUND** |
| `aiEnabled` / `copilotEnabled` / similar | — | **NOT FOUND** |
| Settings update API (`/api/v1/tenant/settings`) | `tenant.routes.ts:15` | Schema accepts `timezone`, `currency`, `smsEnabled`, `paymentGateway`, etc. — **no agent toggle** |
| Backend reads an agent enablement flag | — | **NOT FOUND** |

The phrase "switch it on from your dashboard" refers to the plan-gated visibility of the "Agent" nav item in the tenant portal. There is **no per-tenant on/off setting** for the agent feature.

---

### Additional Critical Finding — W5 Finance Automation (POD → Invoice)

| Item | Location | Detail |
|---|---|---|
| Automatic invoice creation on delivery | — | **NOT FOUND** |
| Bulk invoice creation (manual API) | `finance.routes.ts:424-468` | `POST /api/v1/finance/invoices/bulk` creates `DRAFT` invoices for `status: 'DELIVERED'` shipments with `invoice: null` |
| Invoice status | `finance.routes.ts:460` | Always `DRAFT` |
| Shipment→Payment link | Prior audit finding | Confirmed still absent |

No outbox event, worker, or webhook automatically triggers invoice creation when a shipment is marked `DELIVERED`. Invoice creation requires an explicit API call to `/api/v1/finance/invoices/bulk` (or manual creation).

---

### Additional Critical Finding — Tool Execution Gap

The marketing page and architecture docs describe an agent that "executes" operational actions. The code tells a different story:

1. `agent.service.ts:25` receives `_toolHandlers` (underscore = intentionally unused).
2. `agent.service.ts:47-57` calls `LLMGatewayService.run()` with `allowAutoAction: false`.
3. `llm-gateway.service.ts:180-191` sends a single-shot JSON prompt to DeepSeek and parses the response. **No tool-calling loop. No `function_call` / `tool_calls`.**
4. The service returns `recommendedActions` as strings and sets a `status` based on confidence. **No handler is ever invoked.**
5. `agent.handlers.impl.ts` contains 14 real tool implementations that mutate the database, but **nothing calls them**.

The agent module is currently a **recommendation-only API** — it asks the LLM what to do and returns the answer. It does **not** execute operational actions.

---

## Sign-off Gate

Phase 0 is complete. **STOP here for human sign-off** before proceeding to Phase 1 (claim-by-claim verdicts).

---

## Phase 1 — Claim-by-Claim Verdicts

### Capability Claims

| # | Page claim | Path / evidence | Verdict |
|---|---|---|---|
| C1 | **Shipment Assignment** — new shipments auto-assigned to optimal Fauward Go operator by load/proximity/workload, "no dispatcher needed" | `agent.handlers.impl.ts:22-129` (`assign_shipment` handler exists); `agent.handlers.impl.ts:131-182` (`get_available_drivers` returns `activeJobCount`, `capacityKg`, `currentLat`/`currentLng` but sorts by `createdAt: 'asc'` — **no proximity or workload optimization algorithm**); `agent.service.ts:25` receives `_toolHandlers` (unused underscore — **handler is never invoked**). | 🟡 **Partial** — assignment handler exists but is never called; no proximity/workload optimization; "auto-assigned" is aspirational. |
| C2 | **Exception Management** — real-time detection of failed delivery / SLA breach / route anomaly; customer notified immediately; reroute *flagged for approval* | `agent.handlers.impl.ts:340-444` (`send_customer_notification`), `agent.handlers.impl.ts:246-338` (`reroute_shipment`), `agent.handlers.impl.ts:491-537` (`flag_sla_risk`) all exist. `tracking.ai.service.ts:81-91` auto-creates `ExceptionCase` on high-confidence tracking diagnosis — **but this is the tracking module, not the agent module**. No agent worker monitors shipments proactively. Agent handlers are **never invoked** by `agent.service.ts`. | 🟡 **Partial** — exception tools exist but agent never invokes them; "real-time detection" belongs to tracking module, not agent. |
| C3 | **Natural Language Ops** — plain-English questions over ops data answered in seconds | `agent.routes.ts:48-78` (`POST /v1/agent/query`) is live. `agent.config.ts:21-23`: `selectAgentTask('nl_query')` returns `'address_cleanup'` — **not a general NL ops query**. `agent.tools.ts:52-107`: 7 scoped analytics tools exist (`get_failed_shipments_count`, `get_sla_breach_rate`, etc.) but **are never callable** because `llm-gateway.service.ts:182-191` does not pass `tools` to the model (the `RunInput.tools` field is declared at line 38 but **never forwarded** to `client.chat.completions.create()`). The LLM returns JSON with `finalMessage` and `recommendedActions` as strings — no data query is executed. | 🟡 **Partial** — endpoint exists, but `nl_query` maps to `address_cleanup`, not general ops queries. Analytics tools are dead code. |
| C4 | **Operations Reporting** — NL reporting on success rates, SLA trends, delay reasons, operator performance | `agent.handlers.impl.ts:539-847` — 7 analytics handlers (failed shipments, delay reasons, SLA breach rate, driver performance, carrier performance, shipments by status, weekly ops summary). All are read-only and tenant-scoped. **None are ever called** — same root cause as C3 (`tools` never passed to LLM, no function-calling loop). | 🟡 **Partial** — analytics handlers are well-implemented but unreachable; NL reporting is LLM-generated text, not query-backed data. |
| C5 | **Proactive Alerts** — SLA breach *predicted 2h+ in advance*, every shipment monitored real-time | No scheduled job, worker, or cron monitors shipments for SLA breach prediction via the agent. `sla_check` event type exists (`agent.config.ts:4`) but **nothing fires it**. `agent.worker.ts` is **not registered** in `start-workers.ts`. The `stuck-shipment.detector.ts` (control tower) detects stuck shipments but does not predict SLA breaches 2h ahead. | 🔴 **Absent** — no proactive monitoring infrastructure for the agent module. |
| C6 | **Carrier Intelligence** — best carrier auto-selected by price + reliability score + availability | `agent.handlers.impl.ts:446-488` (`get_carrier_rates`) returns `RateCard` data — **not actual carrier data** (`RateCard` is internal pricing, not `CarrierAccount`). No `reliability score` field exists on any carrier model. No auto-selection algorithm exists; carrier selection requires explicit `POST` to `/api/v1/tenant/rates/quotes/:id/select` (`rating.routes.ts:51`). | 🔴 **Absent** — carrier model lacks reliability/availability fields; no auto-selection; rate cards are not carriers. |

### Workflow Claims

| # | Page claim | Path / evidence | Verdict |
|---|---|---|---|
| W1 | New booking ingested via portal **and API and bulk import** | Portal: `apps/tenant-portal/` has shipment creation UI. API: `shipments.routes.ts` exposes REST CRUD. Bulk import: **NOT FOUND** — no CSV/XLSX bulk shipment upload in `modules/shipments/`. Only `modules/pricing/rate-cards.routes.ts:211` has CSV parsing (rate cards). | 🟡 **Partial** — portal and API confirmed; bulk shipment import does not exist. |
| W2 | Agent evaluates load/route/Go-availability/carrier cost in real time | `agent.service.ts:47-57` calls LLM with event data and returns JSON recommendations. `allowAutoAction: false` (`agent.service.ts:56`). No tool execution = no actual evaluation of load, route, availability, or cost. The LLM generates text based on the event JSON, not on live database queries. | 🟡 **Partial** — LLM recommendation exists, but no tool-based real-time evaluation occurs. |
| W3 | Optimal Go-operator + carrier assignment made automatically | `assign_shipment` handler exists (`agent.handlers.impl.ts:22-129`) but is **never called**. Carrier assignment does not exist (no auto-selection). "Optimal" is false — no proximity or workload scoring. | 🟡 **Partial** — handlers exist but auto-assignment is non-operational. |
| W4 | Exceptions notify customer instantly; reroutes **escalated for approval** | `send_customer_notification` and `reroute_shipment` handlers exist but are **never called**. The `evaluatePolicy()` function (`agent.policy.ts:12-46`) defines `reroute_shipment` as `requires_approval`, but it's **dead code** — never invoked. Actual tracking module (`tracking.ai.service.ts`) auto-creates `ExceptionCase` at `confidence >= 0.85` without agent involvement. | 🟡 **Partial** — tools and policy types exist but are not wired into execution. |
| W5 | **On delivery (POD confirmed): invoice generated and sent, "no manual step"** | `finance.routes.ts:424-468` (`POST /api/v1/finance/invoices/bulk`) creates `DRAFT` invoices for `status: 'DELIVERED'` shipments with `invoice: null`. **No automatic trigger** on delivery — requires explicit API call. Invoice status is always `DRAFT` (`line 460`); **no auto-send**. No outbox event or worker links `ShipmentEvent` (delivery/POD) to invoice creation. | 🔴 **Absent** — manual bulk API only; DRAFT only; no auto-send. |

### Cross-Cutting Claims

| # | Page claim | Path / evidence | Verdict |
|---|---|---|---|
| X1 | **"Policy-controlled"** — risky actions are approval-gated; team is source of truth | `agent.policy.ts:12-46`: `evaluatePolicy()` maps tools to `auto_approved` / `requires_approval` / `blocked`. `agent.types.ts:8`: `PolicyDecision` type. **BUT** `evaluatePolicy` is **never imported or called** in executable code (confirmed by `grep -rn "evaluatePolicy" apps/backend/src/` — only definition, docs, and tests). `agent.handlers.impl.ts` mutates directly without policy check. | 🟡 **Partial** — policy framework exists on paper but is not enforced at runtime. |
| X2 | **"100% approval-gated for risky actions"** — is the gate enforced server-side? | No server-side enforcement. `evaluatePolicy()` is dead code. No middleware or guard intercepts mutations. `assign_shipment` handler (`agent.handlers.impl.ts:22-129`) updates `Shipment.assignedDriverId` directly in a Prisma transaction — **no approval check**. `reroute_shipment` handler (`agent.handlers.impl.ts:246-338`) also mutates directly. | 🔴 **Absent** — no server-side approval gate for any agent action. |
| X3 | **Tiering** — agent is actually restricted to Pro/Enterprise *server-side* | `POST /v1/agent/query` (`agent.routes.ts:48-50`) pre-handlers: `[app.authenticate, requireTenantMatch]` **only** — no `requireFeature('agent')`, no `requirePlan(['PRO', 'ENTERPRISE'])`. `plan.service.ts` `PLAN_FEATURES` does **not** include `agent`. `tenant-portal/src/lib/plan-features.ts:62` gates UI to Pro (`agent: "pro"`), but **backend is unprotected**. | 🔴 **Absent** — UI-only tiering; any authenticated tenant user can call the agent API. |
| X4 | **"No extra setup / enable from dashboard"** — toggle exists, persists, and is honoured by the backend | `TenantSettings` model (`prisma/schema.prisma:595-625`): no `agentEnabled` or similar field. Settings API schema (`tenant.schema.ts:38-59`): no agent toggle. Backend: no check for an enablement flag. | 🔴 **Absent** — no toggle, no DB column, no API field, no backend check. |
| X5 | **Multi-tenant isolation** — any agent read/query/action is tenant-scoped | **API layer:** `agent.routes.ts:53` derives `tenantId` from `request.tenant?.id` (JWT auth context), never from body. **Handler layer:** every Prisma query in `agent.handlers.impl.ts` includes `where: { tenantId: ctx.tenantId }`; `assertTenant()` validates input `tenantId` matches context. **LLM prompt layer:** `agent.prompts.ts:1-17` `buildSystemPrompt(tenantId)` includes tenant isolation rules, but is **never called** — `llm-gateway.service.ts:185` sends a generic system prompt ("Return only valid JSON...") with **no tenant awareness**. **Practical risk:** Since no tools are called, the LLM has no database access; it only generates text. If tools were enabled, tenant scoping in handlers would protect against leaks. However, the LLM prompt itself lacks tenant scoping, which would be a leak vector if the LLM were given direct query access. | 🟡 **Partial** — handlers are correctly tenant-scoped; LLM prompt lacks tenant awareness; current architecture (no tool execution) makes practical leaks impossible. |
| X6 | Headline stats (847 monitored avg, 2h+ lead time, 60% fewer manual actions, 100% gated) | No computation found. No analytics query, dashboard metric, or computed field produces these figures. `agent.handlers.impl.ts` has no aggregation for "monitored avg." No lead-time prediction model. No "manual actions" baseline or comparison metric. "100% gated" is contradicted by dead `evaluatePolicy()`. | 🔴 **Absent / static** — all figures are static marketing copy; no backing computation. |

---

## Headline Summary

| Verdict | Count |
|---|---|
| ✅ Real | 0 |
| 🟡 Partial | 11 |
| 🔴 Absent | 9 |

**Is "Generally Available" accurate?** **No.** The Fauward Agent module is a **well-structured skeleton with operational handlers and a live LLM gateway, but it does not execute operational actions.** The `agent.service.ts` calls DeepSeek via the LLM gateway and returns JSON recommendations (`confidence`, `finalMessage`, `recommendedActions`), but the `_toolHandlers` parameter is intentionally unused, the `tools` array is never passed to the model, the `evaluatePolicy()` function is dead code, and the BullMQ worker is exported but never started. Fourteen database-mutating handlers exist (assign, reroute, notify, flag SLA risk, 7 analytics queries) and are correctly tenant-scoped — but **nothing calls them.** The backend `/v1/agent/query` endpoint is unprotected by plan checks, meaning any authenticated tenant user can invoke it. The marketing claims of "auto-assignment," "no dispatcher needed," "proactive alerts," "carrier intelligence," and "invoice generated and sent with no manual step" are all aspirational. The truthful current state is: **a recommendation-only AI layer that generates text suggestions but does not act on them.**

---

## Remediation Roadmap (build-or-walk-back)

### P0 — Live Risk (fix today, separate session required)

| # | Item | Files | Rough Size | Type | Dependency |
|---|---|---|---|---|---|
| P0-1 | Add `requireFeature('agent')` or `requirePlan(['PRO', 'ENTERPRISE'])` to `POST /v1/agent/query` | `agent.routes.ts:50` | 1-line change | **build** | Before any public launch |
| P0-2 | Add `agent` to `PLAN_FEATURES` in `plan.service.ts` | `plan.service.ts:1-80` | ~5 lines | **build** | Must precede P0-1 |
| P0-3 | Add `requireFeature('agent')` to `POST /v1/agent/handle-event` | `agent.routes.ts:13` | 1-line change | **build** | Parallel to P0-1 |
| P0-4 | Verify NL query tenant scoping: the API layer correctly scopes by auth (`request.tenant?.id`), handlers scope by `ctx.tenantId`, but the LLM prompt (`llm-gateway.service.ts:185`) has **no tenant awareness** — `buildSystemPrompt` from `agent.prompts.ts` is dead code. Mark as **VERIFIED for current architecture** (no tool execution = no leak), but **UNVERIFIED for future tool-calling** because the prompt would need tenant scoping. | `agent.routes.ts:53`, `agent.handlers.impl.ts`, `llm-gateway.service.ts:185`, `agent.prompts.ts:1` | audit-only | **walk-back** (marketing must not claim "fully tenant-isolated LLM queries" until prompt is scoped) | — |

### P1 — Marketing Accuracy (walk back overstated claims)

| # | Current claim | Truthful replacement | Type |
|---|---|---|---|
| P1-1 | "Shipments auto-assigned to optimal operator" | "Agent recommends shipment assignment based on driver availability; operators confirm before dispatch" | **walk-back** |
| P1-2 | "No dispatcher needed" | "Assists dispatchers with AI-powered recommendations" | **walk-back** |
| P1-3 | "Natural Language Ops — plain-English questions answered in seconds" | "Natural language address cleanup and analytics recommendations" (or remove until NL query maps to actual ops tools) | **walk-back** |
| P1-4 | "Operations Reporting — success rates, SLA trends, delay reasons, operator performance" | "Pre-built operational analytics available via API" (or remove until tools are callable) | **walk-back** |
| P1-5 | "Carrier Intelligence — best carrier auto-selected" | "Rate card comparison available on request" | **walk-back** |
| P1-6 | "Invoice generated and sent on delivery, no manual step" | "Manual bulk invoice creation for delivered shipments" | **walk-back** |
| P1-7 | "100% approval-gated for risky actions" | "Approval policy framework defined but not yet enforced" | **walk-back** |
| P1-8 | "Proactive Alerts — SLA breach predicted 2h+ in advance" | Remove until monitoring worker exists | **walk-back** |
| P1-9 | "Policy-controlled" (implies enforcement) | "Policy-defined" (reflects that rules exist but are not runtime-enforced) | **walk-back** |
| P1-10 | "Switch it on from your dashboard" | "Available on Pro and Enterprise plans" | **walk-back** |
| P1-11 | Headline stats (847 avg, 2h+ lead, 60% fewer, 100% gated) | Remove all until computed from real data | **walk-back** |

### P2 — Unblockers (make the skeleton operational)

| # | Item | Files | Rough Size | Type | Dependency |
|---|---|---|---|---|---|
| P2-1 | Register `startAgentWorker()` in `start-workers.ts` | `start-workers.ts:1-31`, `server.ts` (if worker start is there) | ~5 lines import + call + stop hook | **build** | Must happen before P2-2 |
| P2-2 | Wire `evaluatePolicy()` before tool execution: refactor `agent.service.ts` to (a) receive event, (b) call LLM with `tools` array, (c) parse tool calls from model response, (d) evaluate policy per tool, (e) execute `auto_approved` handlers, (f) return `requires_approval` / `blocked` without mutation. | `agent.service.ts:23-89`, `agent.policy.ts`, `agent.handlers.ts`, `llm-gateway.service.ts:180-191` | ~80-120 lines | **build** | After P2-1 |
| P2-3 | Pass `tools` array to LLM gateway and implement function-calling loop | `llm-gateway.service.ts:180-191`, `agent.service.ts` | ~40-60 lines | **build** | Parallel to P2-2 |
| P2-4 | Replace in-memory `processedEventIds` Set with Redis `SETNX` or durable idempotency | `agent.service.ts:15`, `agent.audit.ts:54` (TODO comment) | ~30 lines | **build** | After P2-2 |
| P2-5 | Make `buildSystemPrompt()` live — pass it into `LLMGatewayService.run()` and send it as the system message | `agent.prompts.ts:1`, `agent.service.ts`, `llm-gateway.service.ts:184-186` | ~10 lines | **build** | Parallel to P2-3 |

### P3 — Feature Builds (net-new capability)

| # | Item | Files | Rough Size | Type | Dependency |
|---|---|---|---|---|---|
| P3-1 | Proximity-based driver selection: add geospatial distance sort to `get_available_drivers` using origin postcode + driver `currentLat`/`currentLng` | `agent.handlers.impl.ts:131-182` | ~40 lines | **build** | After P2-2 |
| P3-2 | Workload balancing: add scoring function combining `activeJobCount`, `capacityKg`, distance, and availability | `agent.handlers.impl.ts` or new `agent.scoring.ts` | ~60 lines | **build** | After P3-1 |
| P3-3 | Add `reliabilityScore`, `onTimeRate`, `availabilityStatus` fields to `CarrierAccount` or new `Carrier` model | `prisma/schema.prisma` | ~15 lines schema + migration | **build** | Independent |
| P3-4 | Implement carrier auto-selection algorithm using price + reliability + availability + transit time | `modules/rating/rating.service.ts` or `agent.handlers.impl.ts` | ~80 lines | **build** | After P3-3 |
| P3-5 | POD → invoice automation: outbox event on `shipment.status = DELIVERED` with POD asset, enqueue to new `invoice-generation` worker | `modules/shipments/shipments.routes.ts` (status transition), `queues/` (new worker), `modules/finance/finance.routes.ts` | ~100 lines | **build** | Independent |
| P3-6 | General NL ops query capability: map `nl_query` to a real ops query router instead of `address_cleanup` | `agent.config.ts:21-23`, `agent.tools.ts`, `agent.service.ts` | ~60 lines | **build** | After P2-3 |
| P3-7 | Proactive SLA monitoring worker: scheduled job that scans `Shipment` for `estimatedDelivery < now + 2h` and fires `sla_check` events | `queues/scheduled.worker.ts` or new `sla-monitor.worker.ts` | ~50 lines | **build** | After P2-1 |
| P3-8 | Approval workflow persistence: create `AgentAction` model (`id`, `type`, `payload`, `risk`, `status`, `approvedBy`, `appliedAt`) and approval UI | `prisma/schema.prisma`, `agent.service.ts`, `tenant-portal/` | ~200 lines | **build** | After P2-2 |
| P3-9 | Agent Activity tab in tenant portal + super admin, powered by `AiAgentRun` | `tenant-portal/`, `super-admin/` | ~150 lines UI | **build** | After P2-4 |

---

## What Could Not Be Verified and Why

| Item | Why Unverifiable |
|---|---|
| Whether the `address_cleanup` task is actually useful for `nl_query` | The task mapping (`agent.config.ts:21-23`) routes `nl_query` → `address_cleanup`. No documentation explains this mapping. The task key `address_cleanup` does not appear in `MODEL_ROUTING` (`llm-gateway.service.ts:13-31`) — it falls through to default handling. The LLM output schema (`AgentGatewayOutputSchema`) is generic. It is unclear whether this was a placeholder or an intended capability. |
| Whether `agent.handlers.impl.ts` tools were tested independently | The handlers contain real Prisma transactions and outbox writes. No test file exists for `agent.handlers.impl.ts`. They may work correctly or may have latent bugs — cannot verify without running them. |
| Whether the `processedEventIds` Set causes memory leaks under load | The Set grows unbounded in the Node process. No eviction policy. Without load testing or profiling, leak risk is theoretical but unverified. |
| Whether `DEEPSEEK_API_KEY` is validated at app startup | `apps/backend/src/config/index.ts` (Zod env validation) does **not** include `DEEPSEEK_API_KEY`. The gateway reads it directly from `process.env` at runtime (`llm-gateway.service.ts:76`). If missing, the app starts but agent calls fail at runtime. Exact startup validation behavior is unverified because `config/index.ts` was not fully read in Phase 0. |
| Whether `TenantAiLimit` and `TenantAiUsage` tables are actually created in production | The models exist in `schema.prisma` (`lines 1748-1784`), but no migration file was inspected. Production schema drift is possible. |
| Whether the tenant portal `AgentPage` component actually renders anything functional | `tenant-portal/src/router.tsx:168` references `<AgentPage />`, but the component source was not inspected in Phase 0. It may be a placeholder. |

---

*End of Phase 1. Awaiting sign-off before Phase 2 (report-only architecture decisions).*
