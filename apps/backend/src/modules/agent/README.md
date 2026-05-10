# Fauward Agent

A policy-controlled AI operations layer for logistics. Fauward Agent recommends operational actions, executes only policy-approved low-risk tools, and defers risky mutations to human approval.

All model calls go through `apps/backend/src/shared/services/llm-gateway.service.ts`. The agent module must not instantiate provider clients or call model APIs directly.

---

## What It Does

| Capability | Trigger | Behaviour |
|---|---|---|
| Shipment assignment | `shipment_created` | Assigns best available driver when policy allows; surfaces risky reassignment for approval |
| Exception handling | `failed_delivery` | Flags SLA risk and recommends next action; risky changes require approval |
| SLA monitoring | `sla_check` | Flags HIGH or MEDIUM breach risk using tenant-scoped shipment data |
| Customer notifications | Deterministic status events | Uses approved templates only; no free-form AI messages are sent |
| Carrier selection | `shipment_created` | Surfaces rate options by cost, tier, and estimated delivery time |
| Natural language analytics | `nl_query` | Answers operations questions through scoped read-only tools |

## What It Does Not Do

- Direct database access outside tenant-scoped Prisma services
- Direct AI provider calls outside `LLMGatewayService`
- Free-form customer messages without human approval
- Cross-tenant data access
- Refunds, cancellations, rerouting, or carrier overrides without human approval

---

## Routes

| Method | Endpoint | Auth | Purpose |
|---|---|---|---|
| `POST` | `/v1/agent/handle-event` | Service token | Internal shipment lifecycle event |
| `POST` | `/v1/agent/query` | Tenant JWT | Tenant-facing natural language operations query |

Both endpoints return an `AgentRunResult` with `status`, `actions`, `finalMessage`, and `usage`.

---

## Documentation

- [Architecture & Safety Model](docs/architecture.md)
- [Tool Reference](docs/tools.md)
- [Integration Guide](docs/integration.md)
- [Fixes & Live Validation](docs/fixes-and-validation.md)
- [Product & Pricing](docs/sales.md)
