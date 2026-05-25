# Docs Inventory

Generated from the current checkout for public `/docs` enrichment. Markdown count with requested exclusions: **124**.

## `/docs` Source

| Item | Finding |
|---|---|
| Route | `apps/frontend/src/app/docs/page.tsx` renders `https://www.fauward.com/docs`. |
| App | Marketing frontend, Next.js App Router. |
| Authoring shape | Hardcoded TSX component using `sections`, `DocsLayout`, `DocsSectionBlock`, tables, cards, lists, callouts, and inline code/pre blocks. |
| Edit target | Expand `apps/frontend/src/app/docs/page.tsx` in place; preserve the 11 section ids and existing layout. |

## Markdown Files

| Path | H1/title | Lines | Surface | Purpose |
|---|---:|---:|---|---|
| `.agents\skills\fauward-database\SKILL.md` | (no heading) | 18 | Agent/tooling | SKILL |
| `.agents\skills\fauward-pre-ship\SKILL.md` | (no heading) | 12 | Agent/tooling | SKILL |
| `.agents\skills\terse-output\SKILL.md` | (no heading) | 7 | Agent/tooling | SKILL |
| `.claude\agents\code-reviewer.md` | Code Reviewer Agent | 30 | Agent/tooling | Code Reviewer Agent |
| `.claude\agents\log-analyzer.md` | Log Analyzer Agent | 19 | Agent/tooling | Log Analyzer Agent |
| `.claude\agents\migration-reviewer.md` | Migration Reviewer Agent | 34 | Agent/tooling | Migration Reviewer Agent |
| `.claude\agents\relay-reviewer.md` | Relay Reviewer Agent | 42 | Agent/tooling | Relay Reviewer Agent |
| `.claude\agents\schema-reviewer.md` | Schema Reviewer Agent | 35 | Agent/tooling | Schema Reviewer Agent |
| `.claude\agents\shipment-fsm.md` | Shipment FSM Agent | 61 | Agent/tooling | Shipment FSM Agent |
| `.claude\agents\test-writer.md` | Test Writer Agent | 66 | Agent/tooling | Test Writer Agent |
| `.claude\commands\db.md` | /db — Prisma database commands | 31 | Agent/tooling | /db — Prisma database commands |
| `.claude\commands\ship.md` | /ship — Pre-ship pipeline | 12 | Agent/tooling | /ship — Pre-ship pipeline |
| `.claude\output-styles\terse.md` | Terse Output Style | 4 | Agent/tooling | Terse Output Style |
| `.claude\rules\backend.md` | Backend Rules | 57 | Agent/tooling | Backend Rules |
| `.claude\rules\frontend.md` | Frontend Rules | 29 | Agent/tooling | Frontend Rules |
| `.codex\README.md` | Fauward Codex Setup | 10 | Agent/tooling | Fauward Codex Setup |
| `.kimi\REALTIME-TRACKING-IMPLEMENTATION.md` | Real-Time Tracking Subsystem — Implementation Summary | 208 | Agent/tooling | Real-Time Tracking Subsystem — Implementation Summary |
| `.kimi\system.md` | Fauward Monorepo System Context | 15 | Agent/tooling | Fauward Monorepo System Context |
| `.kimi\task.md` | (no heading) | 0 | Agent/tooling | task |
| `.pytest_cache\README.md` | pytest cache directory # | 5 | Repo root | pytest cache directory # |
| `AGENTS.md` | Fauward Codex Guide | 402 | Repo root | Fauward Codex Guide |
| `apps\admin-portal\README.md` | Fauward Admin Portal | 15 | Repo root | Fauward Admin Portal |
| `apps\agents\README.md` | Fauward Agents PWA | 89 | Field apps | Fauward Agents PWA |
| `apps\backend\AGENTS.md` | Backend Codex Guide | 54 | Backend | Backend Codex Guide |
| `apps\backend\README.md` | Fauward Backend | 92 | Backend | Fauward Backend |
| `apps\backend\src\modules\agent\AGENT_FOUNDATION_NOTES.md` | Agent Foundation Build — Completion Notes | 131 | Backend | Agent Foundation Build — Completion Notes |
| `apps\backend\src\modules\agent\docs\architecture.md` | Fauward Agent — Architecture & Safety Model | 113 | Backend | Fauward Agent — Architecture & Safety Model |
| `apps\backend\src\modules\agent\docs\fixes-and-validation.md` | Fauward Agent — Fixes & Live Validation | 116 | Backend | Fauward Agent — Fixes & Live Validation |
| `apps\backend\src\modules\agent\docs\integration.md` | Fauward Agent — Integration Guide | 184 | Backend | Fauward Agent — Integration Guide |
| `apps\backend\src\modules\agent\docs\sales.md` | Fauward Agent — Product & Pricing | 102 | Backend | Fauward Agent — Product & Pricing |
| `apps\backend\src\modules\agent\docs\tools.md` | Fauward Agent — Tool Reference | 144 | Backend | Fauward Agent — Tool Reference |
| `apps\backend\src\modules\agent\README.md` | Fauward Agent | 33 | Backend | Fauward Agent |
| `apps\backend\src\modules\relay\README.md` | Relay Module | 29 | Backend | Relay Module |
| `apps\fauward-Go\docs\api-contracts.md` | API Contract Outline | 31 | Field apps | API Contract Outline |
| `apps\fauward-Go\docs\architecture.md` | Architecture Snapshot | 52 | Field apps | Architecture Snapshot |
| `apps\fauward-Go\docs\integration-and-data-sharing.md` | Integration And Data Sharing | 121 | Field apps | Integration And Data Sharing |
| `apps\fauward-Go\docs\offline-sync.md` | Offline Sync Notes | 25 | Field apps | Offline Sync Notes |
| `apps\fauward-Go\docs\rollout-plan.md` | Rollout Plan | 32 | Field apps | Rollout Plan |
| `apps\fauward-Go\README.md` | Fauward Go | 38 | Field apps | Fauward Go |
| `apps\frontend\AGENTS.md` | Frontend Codex Guide | 31 | Marketing frontend | Frontend Codex Guide |
| `apps\status-dashboard\README.md` | Status Dashboard | 100 | Repo root | Status Dashboard |
| `apps\super-admin\CONSOLE_REMEDIATION_SUMMARY.md` | Fauward Console Remediation Summary | 143 | Super admin / internal console | Fauward Console Remediation Summary |
| `apps\super-admin\INVENTORY.md` | super-admin Inventory — 2026-05-10 | 125 | Super admin / internal console | super-admin Inventory — 2026-05-10 |
| `apps\widget\README.md` | Fauward Widget App | 22 | Widget | Fauward Widget App |
| `CLAUDE.md` | Fauward | 84 | Repo root | Fauward |
| `codex-execution-plan.md` | Fauward — Codex Full Execution Plan | 755 | Repo root | Fauward — Codex Full Execution Plan |
| `CUSTOM_DOMAIN_AUDIT_REPORT.md` | Custom Domain Audit Report | 100 | Repo root | Custom Domain Audit Report |
| `DEVELOPER_README.md` | Fauward — Developer Reference | 1334 | Repo root | Fauward — Developer Reference |
| `docs\adr\0001-console-service-scope.md` | ADR 0001: Console Service Scope For Re-Audit | 82 | Docs | ADR 0001: Console Service Scope For Re-Audit |
| `docs\api.md` | API Design | 368 | Docs | API Design |
| `docs\auth-flows.md` | Sign-In & Sign-Out Flows | 383 | Docs | Sign-In & Sign-Out Flows |
| `docs\brand-usage.md` | Brand Usage | 25 | Docs | Brand Usage |
| `docs\CONSOLE_BUILD_FINAL_AUDIT.md` | Fauward Console - End-of-Build Final Audit | 229 | Super admin / internal console | Fauward Console - End-of-Build Final Audit |
| `docs\CONSOLE_REMEDIATION_TRACKER.md` | Fauward Console — Remediation Tracker | 249 | Super admin / internal console | Fauward Console — Remediation Tracker |
| `docs\data-model.md` | Data Model — Complete Schema | 652 | Docs | Data Model — Complete Schema |
| `docs\deployment.md` | Deployment Guide | 107 | Docs | Deployment Guide |
| `docs\FAUWARD_CONSOLE_TESTING_GUIDE.md` | Fauward Console Testing Guide | 43 | Super admin / internal console | Fauward Console Testing Guide |
| `docs\FAUWARD_INTERNAL_OPS_ARCHITECTURE.md` | Fauward Internal Operations Platform — Architecture Spec | 1572 | Docs | Fauward Internal Operations Platform — Architecture Spec |
| `docs\feature-additions.md` | Feature Additions — TrenyConnect Audit | 805 | Docs | Feature Additions — TrenyConnect Audit |
| `docs\frontend.md` | Frontend Design System & Surface Specifications | 245 | Docs | Frontend Design System & Surface Specifications |
| `docs\gating-implementation.md` | Application Gating — Implementation Guide | 670 | Docs | Application Gating — Implementation Guide |
| `docs\implementation-baseline-2026-04-14.md` | Implementation Baseline - April 14, 2026 | 70 | Docs | Implementation Baseline - April 14, 2026 |
| `docs\implementation-phases.md` | Implementation Phases & Tech Stack | 96 | Docs | Implementation Phases & Tech Stack |
| `docs\implementation-status.md` | Implementation Status - May 2026 | 113 | Docs | Implementation Status - May 2026 |
| `docs\infrastructure-security.md` | Infrastructure & Security | 97 | Security/compliance | Infrastructure & Security |
| `docs\logistics-core.md` | Logistics Core | 298 | Docs | Logistics Core |
| `docs\PHASE_0_1_VERIFICATION_REPORT.md` | Phase 0 & Phase 1 Verification Report | 106 | Docs | Phase 0 & Phase 1 Verification Report |
| `docs\PHASE_2_6_VERIFICATION_REPORT.md` | Fauward Console Phases 2-6 Verification Report | 64 | Docs | Fauward Console Phases 2-6 Verification Report |
| `docs\platform-superadmin.md` | Platform Superadmin Control Plane | 46 | Super admin / internal console | Platform Superadmin Control Plane |
| `docs\platform-superadmin-public.md` | Fauward Platform Superadmin | 75 | Super admin / internal console | Fauward Platform Superadmin |
| `docs\platform-superadmin-technical.md` | Platform Superadmin Technical Reference | 490 | Super admin / internal console | Platform Superadmin Technical Reference |
| `docs\pricing-billing.md` | Pricing, Billing & Unit Economics | 74 | Docs | Pricing, Billing & Unit Economics |
| `docs\product-experience.md` | Product Experience, Analytics & Go-To-Market | 148 | Docs | Product Experience, Analytics & Go-To-Market |
| `docs\product-overview.md` | Product Overview | 107 | Docs | Product Overview |
| `docs\REALTIME-TRACKING-IMPLEMENTATION.md` | Real-Time Tracking Subsystem — Implementation Summary | 208 | Docs | Real-Time Tracking Subsystem — Implementation Summary |
| `docs\relay.md` | Fauward Relay | 351 | Docs | Fauward Relay |
| `docs\roles-permissions.md` | User Roles & Permissions | 77 | Docs | User Roles & Permissions |
| `docs\security\admin-break-glass.md` | Admin Break Glass | 30 | Security/compliance | Admin Break Glass |
| `docs\security\admin-network-isolation.md` | Admin Network Isolation | 53 | Security/compliance | Admin Network Isolation |
| `docs\SOC2_CONTROL_MAPPING.md` | SOC 2 Control Mapping | 12 | Security/compliance | SOC 2 Control Mapping |
| `docs\SOC2_EVIDENCE_INDEX.md` | SOC 2 Evidence Index | 36 | Security/compliance | SOC 2 Evidence Index |
| `docs\system-architecture.md` | System Architecture | 696 | Docs | System Architecture |
| `docs\testing.md` | Testing Guide | 84 | Docs | Testing Guide |
| `docs\tp-sa-integration-spec.md` | Tenant Portal ↔ Super Admin: Full Integration Spec | 639 | Docs | Tenant Portal ↔ Super Admin: Full Integration Spec |
| `docs\tracking-core.md` | Fauward Unified Tracking Core | 411 | Docs | Fauward Unified Tracking Core |
| `docs\widget.md` | Widget Documentation | 10 | Widget | Widget Documentation |
| `docs\widget-architecture.md` | Widget Architecture | 22 | Widget | Widget Architecture |
| `docs\widget-branding.md` | Branding | 27 | Widget | Branding |
| `docs\widget-custom-domains.md` | Custom Domains | 52 | Widget | Custom Domains |
| `docs\widget-deployment.md` | Widget Deployment | 53 | Widget | Widget Deployment |
| `docs\widget-environment.md` | Widget Environment | 58 | Widget | Widget Environment |
| `docs\widget-known-gaps.md` | Known Gaps | 33 | Widget | Known Gaps |
| `docs\widget-routing-and-middleware.md` | Routing and Middleware | 29 | Widget | Routing and Middleware |
| `docs\widget-tokens-and-auth.md` | Tokens and Auth | 47 | Widget | Tokens and Auth |
| `FAUWARD_AGENT_AUDIT.md` | Fauward Agent — Reality Audit (claims vs. codebase) | 246 | Repo root | Fauward Agent — Reality Audit (claims vs. codebase) |
| `FAUWARD_CONSOLE_PHASES_2_6_PROMPTS.md` | Fauward Console — Phase 2-6 Execution Prompts | 909 | Repo root | Fauward Console — Phase 2-6 Execution Prompts |
| `FAUWARD_FORM_DESIGN_PASS.md` | Fauward Shipment Form Design Pass | 60 | Repo root | Fauward Shipment Form Design Pass |
| `FAUWARD_FORM_GLOBAL_REBUILD_CHANGELOG.md` | Fauward Form Global Rebuild Changelog | 157 | Repo root | Fauward Form Global Rebuild Changelog |
| `FAUWARD_PLATFORM_ARCHITECTURE.md` | Fauward Platform Architecture | 1489 | Repo root | Fauward Platform Architecture |
| `FAUWARD_SHIPMENT_FORM_SPEC.md` | Fauward Shipment Creation Form Spec | 263 | Repo root | Fauward Shipment Creation Form Spec |
| `FINANCE_AUDIT.md` | Finance Tab — Phase 1 Audit | 133 | Repo root | Finance Tab — Phase 1 Audit |
| `FINANCE_WIRE_UP_BRIEF.md` | Fauward — Finance Tab Wire-Up: Phase 2+ Brief | 212 | Repo root | Fauward — Finance Tab Wire-Up: Phase 2+ Brief |
| `FINANCE_WIRE_UP_CHANGELOG.md` | Finance Wire-Up — Changelog | 145 | Repo root | Finance Wire-Up — Changelog |
| `packages\brand\README.md` | Fauward Brand System | 22 | Shared package | Fauward Brand System |
| `packages\relay-ui\README.md` | @fauward/relay-ui | 52 | Shared package | @fauward/relay-ui |
| `README.md` | Fauward | 80 | Repo root | Fauward |
| `replit.md` | Fauward — Replit Project | 94 | Repo root | Fauward — Replit Project |
| `ROLLBACK.md` | Rollback | 13 | Repo root | Rollback |
| `SAAS_MULTITENANCY.md` | Multi-Tenant SaaS Logistics Platform — Implementation Plan | 548 | Repo root | Multi-Tenant SaaS Logistics Platform — Implementation Plan |
| `services\CODEX.md` | Codex Implementation Guide | 1421 | Python/services | Codex Implementation Guide |
| `services\python-services\.pytest_cache\README.md` | pytest cache directory # | 5 | Python/services | pytest cache directory # |
| `services\python-services\docs\api-reference.md` | API Reference | 271 | Python/services | API Reference |
| `services\python-services\docs\architecture.md` | Architecture | 102 | Python/services | Architecture |
| `services\python-services\docs\database-and-migrations.md` | Database and Migrations | 140 | Python/services | Database and Migrations |
| `services\python-services\docs\operations.md` | Operations | 111 | Python/services | Operations |
| `services\python-services\docs\security.md` | Security and Tenant Isolation | 88 | Python/services | Security and Tenant Isolation |
| `services\python-services\docs\workers-and-queues.md` | Workers and Queues | 96 | Python/services | Workers and Queues |
| `services\python-services\migrations\README.md` | (no heading) | 4 | Python/services | README |
| `services\python-services\RAILWAY_DEPLOYMENT.md` | Railway Deployment Guide | 149 | Python/services | Railway Deployment Guide |
| `services\python-services\README.md` | Fauward Python Services | 142 | Python/services | Fauward Python Services |
| `services\python-services\TECHNICAL.md` | Fauward Python Services Technical Guide | 187 | Python/services | Fauward Python Services Technical Guide |
| `services\README.md` | Services Implementation Guide | 1119 | Python/services | Services Implementation Guide |
| `services\route-optimizer\.pytest_cache\README.md` | pytest cache directory # | 5 | Python/services | pytest cache directory # |
| `services\route-optimizer\README.md` | Fauward Route Optimizer | 244 | Python/services | Fauward Route Optimizer |

## Enrichment Map

| Section | Currently on page | Deeper detail available in repo | Source file(s) |
|---|---|---|---|
| Getting Started | Signup, onboarding wizard, first-day checklist. | Workspace identity, onboarding steps, support article categories, plan gates. | `docs/product-experience.md`, `apps/tenant-portal/src/components/onboarding/*`, `apps/frontend/src/lib/marketing-data.ts` |
| Your Dashboard | Metrics, feed, quick actions, real-time note. | Dashboard widgets, live map, finance/team health, onboarding state. | `apps/tenant-portal/src/pages/dashboard/TenantDashboardPage.tsx`, `docs/product-experience.md` |
| Shipments | Lifecycle, fields, timeline, bulk ops, docs. | Actual status enum/transitions, tracking visibility, labels, customs, returns. | `apps/backend/prisma/schema.prisma`, `apps/backend/src/modules/shipments/shipments.routes.ts`, `docs/logistics-core.md`, `docs/tracking-core.md` |
| Dispatch & Field Ops | Dispatch queue, Fauward Go, POD, agents. | Field stop APIs, offline sync, scan/verify, route events. | `apps/fauward-Go/docs/*.md`, `apps/backend/src/modules/field/field.routes.ts`, `apps/agents/README.md` |
| Finance & Invoicing | Quotes, invoices, payments, reconciliation, simple lifecycle. | Actual invoice statuses, partial payment, voiding, credit notes, COD, payouts. | `apps/backend/src/modules/finance/finance.routes.ts`, `apps/tenant-portal/src/pages/finance/TenantFinancePage.tsx`, `docs/pricing-billing.md` |
| Your Team | Friendly role labels and basic invite/security. | Actual tenant role enum, create/reset/suspend/role-change routes. | `apps/backend/prisma/schema.prisma`, `apps/backend/src/modules/users/users.routes.ts`, `apps/tenant-portal/src/pages/team/TeamPage.tsx` |
| Customer Tracking Widget | Embed snippet and placement. | `/embed.js`, token exchange, hosted `/ship/<tenant>`, widget shipment API, payment/phone flows. | `apps/frontend/src/app/embed.js/route.ts`, `packages/widget-sdk/src/embed.ts`, `apps/widget/app/ship/[tenant]/page.tsx`, `docs/widget*.md` |
| Branding & White-Label | Brand fields, custom domain, email sender, documents. | Tenant branding variables, domain flow, public booking/tracking links. | `docs/widget-branding.md`, `docs/widget-custom-domains.md`, `apps/tenant-portal/src/pages/settings/BrandingTab.tsx` |
| Notifications | Channels, triggers, messaging tips. | Email templates, in-app notifications, Relay messaging, customer-safe tracking messages. | `apps/backend/src/modules/notifications/*`, `docs/relay.md`, `packages/relay-ui/README.md` |
| API & Webhooks | API keys, common uses, stale event example/list. | API key scopes, `fw_` auth, idempotency, actual webhook headers/retries/events. | `apps/backend/src/shared/middleware/authenticate.ts`, `apps/backend/src/modules/api-keys/*`, `apps/backend/src/queues/webhook.worker.ts`, `apps/tenant-portal/src/components/settings/types.ts` |
| Account & Billing | Plans, trial, billing admin, cancellation. | Public pricing, plan feature gates, usage limits, payment status. | `apps/frontend/src/lib/marketing-data.ts`, `apps/backend/src/modules/tenants/plan.service.ts`, `apps/tenant-portal/src/hooks/useBilling.ts` |

## Drift

| Claim | Source of claim | Actual in code | Action |
|---|---|---|---|
| Shipment path includes `COLLECTED` and omits `PROCESSING`/`PICKED_UP`. | `/docs` page | `ShipmentStatus` is `PENDING`, `PROCESSING`, `PICKED_UP`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERED`, `FAILED_DELIVERY`, `RETURNED`, `CANCELLED`, `EXCEPTION`. | Update public page. |
| Exception status includes `ON_HOLD`. | `/docs` page | No `ON_HOLD`; code uses `EXCEPTION`. | Replace with `EXCEPTION`. |
| Invoice lifecycle only `DRAFT -> SENT -> PAID` plus `OVERDUE`. | `/docs` page | `InvoiceStatus` also includes `PARTIALLY_PAID` and `VOID`. | Update public page. |
| Roles listed as Tenant Admin/Manager/Dispatcher/Agent/Customer User. | `/docs` page | `UserRole` tenant/customer values are `TENANT_ADMIN`, `TENANT_MANAGER`, `TENANT_FINANCE`, `TENANT_STAFF`, `TENANT_DRIVER`, `CUSTOMER_ADMIN`, `CUSTOMER_USER`. | Publish friendly labels with exact code values. |
| Webhook event `shipment.status_updated`. | `/docs` page | Code emits `shipment.status.changed` for configured shipment webhooks and outbox `shipment.status.updated`; UI catalog includes `shipment.status_changed`. | Document actual emitted/configured names and note drift as resolved in page wording. |
| Webhook events `invoice.paid`, `invoice.overdue`, `customer.message_received`. | `/docs` page | Tenant portal exposes invoice events, but backend finance route currently records notifications/audits, not outbound invoice webhook emission in searched code; no `customer.message_received` emission found. | Avoid claiming they are emitted unless sourced from UI catalog; mark as not verified. |
| Embed snippet uses `https://widget.fauward.com/embed.js`. | `/docs` page | Marketing app serves `GET /embed.js`; SDK example uses `https://fauward.com/embed.js`; widget base defaults to `https://widget.fauward.com`. | Update snippet to `https://fauward.com/embed.js`. |
| API key examples are generic bearer tokens. | `/docs` page | API key auth expects `Authorization: Bearer fw_<api-key>`. | Update example. |
