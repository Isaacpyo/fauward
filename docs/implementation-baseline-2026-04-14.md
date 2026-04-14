# Implementation Baseline - April 14, 2026

This is the current ground truth after auditing code against:
- `README.md`
- `docs/implementation-status.md`
- `docs/feature-additions.md`
- `docs/implementation-phases.md`
- `DEVELOPER_README.md`

Legend:
- DONE: implemented and wired
- PARTIAL: implemented but missing production depth or some required behavior
- MISSING: not implemented

## Executive Summary

- Priorities 1-32 from docs are mostly implemented.
- The critical remaining work is not UI scaffolding; it is production hardening, integrations, infra reliability, and schema readiness for Phase 6c/9.
- `docs/implementation-status.md` is materially stale versus the actual codebase.

## Priority Status Matrix

### Base Priorities (1-15)

| Priority | Status | Notes |
|---|---|---|
| 1 Shipment Core | DONE | Full shipment CRUD/status/assign/cancel + tracking route + websocket present. |
| 2 User/Team Mgmt | DONE | `users.routes.ts` + forgot/reset password flows exist. |
| 3 Notifications/Outbox | PARTIAL | Module/worker/queues exist, but queue layer is in-memory (not BullMQ/Redis). |
| 4 Document Generation | PARTIAL | Routes/services exist, but local file/HTML approach; no Puppeteer PDF pipeline or real S3 signed URL flow. |
| 5 Finance | PARTIAL | Main invoice/payment/credit routes exist; overdue repeatable job + deeper lifecycle hardening still needed. |
| 6 Payments/Stripe | PARTIAL | Routes exist, but Stripe service is mocked and Paystack path is absent. |
| 7 CRM | DONE | Leads/quotes/customers CRUD + send/accept/reject present. |
| 8 Analytics | PARTIAL | Endpoints exist (`/full`, `/shipments`, `/revenue`, `/staff`, CSV), but analytics correctness/completeness still needs hard verification. |
| 9 Driver Backend | PARTIAL | stop status, POD, failed, history, location endpoints exist; offline `/sync` endpoint is still missing. |
| 10 Super Admin Backend | DONE | `/api/v1/admin/*` surface is implemented. |
| 11 Frontend Missing Pages | DONE | Marketing auth pages + team/profile/domain/realtime tracking/dispatch pages exist. |
| 12 Rate Limiting | PARTIAL | `@fastify/rate-limit` wired; policy-level parity (general/api-key dynamic behavior) needs verification hardening. |
| 13 Idempotency | PARTIAL | Middleware exists and is used on key routes; behavior does not fully match doc spec (key hashing/coverage/expiry cleanup strategy). |
| 14 CI/CD + Docker | DONE | Dockerfiles and CI workflow exist and build key apps. |
| 15 Tests | PARTIAL | Core tests exist and now pass, but coverage is still narrow for finance/webhooks/idempotency/security-critical paths. |

### Feature Additions (16-32)

| Priority | Status | Notes |
|---|---|---|
| 16 Returns | DONE | Backend routes + tenant pages present. |
| 17 Support Tickets | DONE | Backend routes + tenant pages present. |
| 18 Email Template Admin | DONE | Tenant routes + settings UI present. |
| 19 Tenant Pricing System | PARTIAL | Large pricing module + UI present; requires production validation of all rule interactions and edge constraints. |
| 20 QR Scanning Driver App | DONE | `QRScanner.tsx` exists and is integrated. |
| 21 Shipping Label Print | DONE | `label.routes.ts` exists with document route surface. |
| 22 In-App Notification Center | DONE | Notification routes + `NotificationCenter` UI present. |
| 23 Activity Timeline | DONE | `/api/v1/activity` + timeline page present. |
| 24 Analytics Enhancements | PARTIAL | Significant analytics exists; full KPI/funnel/SLA spec parity still requires verification and backfill. |
| 25 Animated KPI Cards | DONE | `AnimatedNumber` used in analytics UI. |
| 26 Dedicated Reports Page | DONE | Reports page exists; report endpoints generated in analytics routes. |
| 27 Live Operational Map | DONE | Backend location endpoints + live map page present. |
| 28 Fleet & Vehicle Mgmt | DONE | Fleet routes + page present. |
| 29 POD Viewer for Staff | DONE | `PODViewer.tsx` and backend POD endpoints present. |
| 30 Inline Status Updates | DONE | Shipment table inline status/assign actions implemented. |
| 31 Individual User Suspension | DONE | suspend/activate routes + auth guard enforcement present. |
| 32 Performance Patterns | PARTIAL | Multiple patterns are present (virtualization, polling, lazy tabs); full parity across every listed surface still incomplete. |

## Verified High-Value Remaining Backlog

1. Replace in-memory queues with BullMQ + Redis durability.
2. Replace mocked Stripe service with real SDK integration; add Paystack flow.
3. Upgrade documents from local HTML output to robust PDF generation/storage strategy.
4. Add offline agent sync endpoint contract (`/sync`) and reconnect replay semantics.
5. Expand tests for finance, webhook security/retries, idempotency, and plan enforcement.
6. Resolve Phase 6c/9 schema gaps documented in `DEVELOPER_README.md`:
   - `CarrierConnection`, `CarrierBooking`, `CustomsDeclaration`, `RegionalProfile`, `Invitation`, `DriverLocationHistory`
   - missing indexes and structural constraints
7. Reconcile plan source-of-truth (`Tenant.plan` vs `Subscription.plan`) and invoice 1:1 shipment modeling risk.

## Immediate Work Order

1. Queue infrastructure migration to BullMQ and worker wiring.
2. Stripe/Paystack integration hardening.
3. Offline sync endpoint for agents.
4. Schema hard-gaps migration pack.
