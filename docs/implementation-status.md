# Implementation Status - May 2026

> Ground truth for the May 2026 implementation run. The older April baseline is preserved in `docs/implementation-baseline-2026-04-14.md`.

**Last verified:** 2026-05-18

---

## Summary

| Area | Status |
|------|:------:|
| Phase 1 - Operational core | 30 of 30 complete |
| Phase 2 - Commercial core | 34 of 34 complete |
| Phase 3 - AI layer | 42 of 42 complete |
| Tenant portal additions | 6 of 6 complete |
| Global checks | 7 of 7 complete |
| Infrastructure | 1 of 1 complete |
| Overall | 120 of 120 complete |

Backend Vitest reached 149 passing tests. Backend, tenant portal, and Fauward-Go TypeScript checks passed in the final verification run.

Prisma client generation is clean. Local `prisma migrate status` may be deferred when the developer network cannot reach the Supabase direct database host on port 5432. In that case, migrations should be applied from CI/CD or a network with a reachable `DIRECT_URL`.

---

## Completed Backend Work

| Module | Completed work |
|--------|----------------|
| `rating` | Quote endpoint, carrier/service-level routes, tenant carrier accounts, volumetric weight, surcharge stacking, preferred carrier ordering, quote expiry, tenant isolation tests. |
| `documents` | Label generation, retrieve, reprint, manifests, packing slips, tenant branding through `packages/theme-engine`, PDF/ZPL worker payloads, label tests. |
| `webhooks` | HMAC-SHA256 delivery signatures, `X-Fauward-Event-Id`, retry schedule, dead-lettering after five failures, manual replay, platform failure queue, tests. |
| `api-keys` | Scoped API keys, sandbox isolation, `UsageRecord` writes, per-key endpoint/day usage breakdown, scope rejection tests. |
| `shipping-rules` | Tenant-scoped IF/THEN engine, dry-run endpoint, active/priority evaluation, booking integration, `AuditLog` triggers, tests. |
| `customs` | Node orchestrator for Python customs worker, declaration routes, HS lookup proxy, restricted items, customs tracking events, validation, tests. |
| `returns` | Create, approve, reject, reverse label, receive-at-hub, public status route, reason/carrier/time analytics, tests. |
| `relay` | LLM gateway classification/escalation, draft-only AI replies, approve-and-send route, approval fields, no direct provider calls. |
| `tracking` | Tracking AI summaries, exception diagnosis, customer-safe messages, high-confidence exception creation. |
| `control-tower` | Exceptions, SLA policies, stuck-shipment detector, startup wiring, platform and tenant health routes. |
| `agent` | Agent module uses the shared AI gateway and policy-controlled tools. |

---

## Completed Prisma Additions

New tenant-scoped models:

- `CarrierAccount`
- `RateQuote`
- `ShippingRule`
- `GeneratedLabel`
- `CustomsDeclaration`
- `ExceptionCase`
- `SlaPolicy`
- `TenantAiUsage`
- `AiAgentRun`

Additional platform models:

- `CarrierServiceLevel`
- `TenantAiLimit`

Important field additions:

- `Shipment.rateQuoteId`, `Shipment.carrierAccountId`, `Shipment.customsDeclarationId`, `Shipment.isSandbox`
- `RateQuote.isSandbox`
- `WebhookDelivery.attemptCount`, `nextRetryAt`, `deadLetteredAt`, `hmacSignature`, `responseCode`, `responseLatencyMs`
- `ApiKey.scopes`, `isSandbox`, `lastUsedAt`, `monthlyRequestCount`
- `ReturnRequest.reason String?`, `items`, `photos`, `labelId`, `refundStatus`, `reversedAt`, `pickupScheduledAt`
- Relay message approval fields: `isDraft`, `approvedBy`, `approvedAt`

---

## Infrastructure Changes

| Change | Status | Detail |
|--------|:------:|--------|
| Railway Redis for BullMQ | Complete | `REDIS_QUEUE_URL` routes all BullMQ traffic to Railway Redis (no per-command billing). `REDIS_URL` (Upstash) retained for cache, tracking streams, rate limiting, and SMS quotas only. Upstash command volume reduced from ~700K+/day to ~153K/day. |

### Worker poll interval tuning (2026-05-18)

| Worker | Before | After |
|--------|--------|-------|
| `ws-publisher` — `redis.keys` + XREADGROUP | 200 ms | 1 000 ms |
| `history-writer` — `redis.keys` + XREADGROUP | 500 ms | 2 000 ms |
| `outbox` — setInterval | 1 000 ms | 5 000 ms |
| BullMQ stall checks (`stalledInterval`) | 30 s (default) | 60 s |

---

## Completed Tenant Portal Pages

| Route | Status |
|-------|:------:|
| `/rates` | Complete |
| `/shipping-rules` | Complete |
| `/labels` | Complete |
| `/customs/:shipmentId` | Complete |
| `/returns` | Complete |
| `/developer` | Complete |

---

## Completed Agents PWA

`apps/agents` is the current field-operations PWA; it replaces the older driver-only surface. It uses React 18, Vite, React Router, and a context-backed session model rather than Zustand.

| Area | Status |
|------|:------:|
| Pages: welcome, login, dashboard, scan, shipment, confirm, shipments | Complete |
| Agent shell, navigation, auth gate, access-pending state, sync listener, QR scanner | Complete |
| Session persistence via `fauward_agent_session` in `apps/agents/src/lib/session.ts` | Complete |
| Offline scan and advance queues in `agentOfflineQueue.ts` | Complete |
| Backend routes under `/api/v1/agents/shipments/*` | Complete |

Known gap: `AgentSyncListener` stops queue replay on the first server error; a 401 still requires the user to log in again before replay continues.

---

## Verification Commands

Run from the relevant workspace:

```bash
cd apps/backend
npx prisma generate --schema prisma/schema.prisma
npx tsc --noEmit
npx vitest run

cd ../tenant-portal
npx tsc --noEmit

cd ../agents
npx tsc --noEmit

cd ../fauward-Go
npx tsc --noEmit
```

Direct provider call check:

```bash
rg "deepseek|DeepSeek|openai" apps/backend/src --type ts | rg -v "llm-gateway"
```

Expected result: zero matches outside `llm-gateway.service.ts`.

Prisma migration status:

```bash
cd apps/backend
npx prisma migrate status --schema prisma/schema.prisma
```

Expected result when `DIRECT_URL` is reachable: `Database schema is up to date!`

If port 5432 is blocked locally, apply migrations from CI/CD or from a network that can reach the Supabase direct connection host.
