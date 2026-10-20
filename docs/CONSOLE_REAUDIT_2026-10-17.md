# Super Admin Console — Re-audit Findings (2026-10-17)

**Scope:** `apps/super-admin`, `apps/backend/src/modules/{internal,platform,super-admin,support,relay,regions,appeals,dsar,announcements,onboarding}`, and every tenant-portal interaction that should surface in the console.
**Supersedes:** `docs/CONSOLE_BUILD_FINAL_AUDIT.md` (2026-05-17) and re-grades `docs/CONSOLE_REMEDIATION_TRACKER.md`.
**Purpose:** input to a design spec whose goal is: every placeholder works, every tenant-portal activity reaches the console, every console action has a real effect.
**Method:** code reading only; nothing was executed against a database. Line references are to the working tree on `chore/vm-docker-setup` at commit `0a6c601`.

---

## 1. Executive summary

The console is a wide, well-structured scaffold with almost no working write path and a large amount of invented data.

- **41 services are listed; 9 were declared "live" by ADR 0001; in practice 5 are usable today** (billing, IAM, audit, Customer 360, impersonation-list). The tenant control plane — the one service everything else hangs off — is 220 generated rows and no-op dialogs.
- **Every dangerous platform action returns 403 today.** Login never sets `mfaVerifiedAt`, the fresh-MFA guard doesn't check whether MFA is enrolled, and no UI calls `/auth/mfa/verify`. Impersonation start, suspend, unsuspend, plan override and region approve/reject are all blocked for every staff user.
- **98 of 122 service routes are generic JSON dumps** (`OpsRoute` → `InternalOpsPage` / `WorkflowOpsPage`). Of the 126 backend routes behind them, roughly 24 Prisma models have no producer anywhere, so a third of the pages are permanently empty, and most "approve"/"retry"/"decision" actions only flip a status column.
- **Tenant-portal → console connectivity:** of 20 interaction types, 4 are connected (announcements, appeals, impersonation-operator-side, API-key/webhook read), 10 are half-wired, 6 are missing entirely (plan change, AI usage, exceptions/escalations, tenant gateway config, feature requests, tenant-side impersonation visibility).
- **The tenant portal itself fakes several core writes** (shipment creation, plan change, API keys, webhooks, onboarding steps), so even the connected console views are fed partly by fiction.
- **Security:** the ROOT hardware-key gate defaults to a literal string; IAM self-grant check compares two different ID spaces; suspended staff keep access; monitoring endpoints are public without an env var; impersonation `scopes` are never enforced; the LaunchDarkly "per-tenant override" turns the flag on globally.

Nothing in `apps/super-admin` has changed since 2026-05-19. The May tracker is still the correct backlog; this document adds what it missed.

---

## 2. What moved since the May audit

| Tracker item | Status now | Evidence |
|---|---|---|
| P0-1 secrets PATCH gated by read | **Closed** | `console-phases.routes.ts:1043` uses `trust.secrets.write` |
| P0-2 ROOT hardware gate | **Closed in form, open in substance** | `iam.routes.ts:15,28` — falls back to literal `'dev-hardware-key'` when `DEV_HARDWARE_KEY_ASSERTION` unset |
| P0-3 Stripe idempotency | **Closed** | `stripe.service.ts:37,83` |
| P0-4 vendor HMAC | **Closed** | `console-phases.routes.ts:2,131-135,1380` |
| P1-1 root typecheck | **Closed** | `package.json:20` |
| P1-6 TEST_DATABASE_URL in CI | **Closed** | `.github/workflows/ci.yml:56` |
| P2-1 / P2-2 ADR + reconciliation | **ADR written, never applied** | `_manifests.ts` has no live/preview/deferred field; no reconciliation script; 7 manifest routes still unrouted |
| P2-3 sample-data banners | **Partial** | Vendor-unconfigured banner exists (`InternalOpsPage.tsx:92`); tenant seed, dashboard KPIs, revenue charts, queue messages still unbannered |
| P2-4 Customer 360 isolation | **Open** | one parent `useQuery`, 0 tab error boundaries, 0 tab permission gates |
| P3-1 DSAR job · P3-2 QBR job · P3-6 audit-chain job | **Open** | no `dsar-data-gather`, `qbr-generate`, `audit-chain` job names in `queues/` |
| P3-7 TenantChip | **Open** | 0 usages under `pillars/` |
| P4-1 legacy `SUPER_ADMIN` routes | **Open** | 38 refs, 16 `/api/v1/admin/*` routes still registered (`app.ts:277`) |

---

## 3. Blocking defects (console is non-functional until these are fixed)

Ordered by blast radius.

| # | Defect | Where | Effect |
|---|---|---|---|
| B1 | **No MFA step; fresh-MFA guard blocks everyone.** `mfaVerifiedAt = user.mfaEnabled ? null : null`; guard checks only `mfaVerifiedAt`, not enrolment; no UI calls `/auth/mfa/verify` | `platform.routes.ts:101`, `middleware/require-fresh-platform-mfa.ts:6-12`, `router.tsx:141-153` | Impersonation start, suspend/unsuspend, plan override, region approve/reject → 403 `MFA_REQUIRED` for all staff |
| B2 | **Tenant control plane is mock.** 220 rows from 3 seeds; `TenantDetailPage`/`TenantDetailTabs` static; suspend/override/delete handlers close the dialog and nothing else; "Impersonate" opens `?tenant=t_N` | `pillars/platform/tenants/TenantsListPage.tsx:9-27,103,110`, `TenantDetailPage.tsx:19-41`, `components/admin/TenantDetailTabs.tsx:32-39` | `GET/PATCH /api/v1/platform/tenants*` never called. Every downstream service that starts from "pick a tenant" has no entry point |
| B3 | **`internalApi` has no 401→refresh interceptor.** Access cookie is 15 min | `lib/internal-api.ts`, `platform.routes.ts:50` | After 15 minutes every `/api/internal` page silently renders its empty state |
| B4 | **7 manifest/sidebar links hit the `*` catch-all → `/login`** | `/platform/jobs`, `/platform/database`, `/revenue/disputes`, `/revenue/recognition`, `/customer/360`, `/customer/feedback`, `/customer/kb`; `router.tsx:795` | Logged-in user bounced to the login page; Customer 360 has no tenant picker so is unreachable except by typed URL |
| B5 | **Two permission systems.** `/api/v1/platform/*` checks legacy `PlatformRole`; `/api/internal/*` checks staff RBAC + JIT | `middleware/require-platform-permission.ts`, `services/platform-permission.service.ts:26-44` vs `middleware/require-internal-permission.ts` | Roles granted in IAM unlock UI routes whose platform calls still 403 (e.g. FINANCE_ADMIN sees Health/Queues, gets empty tables). JIT approvals never reach `/auth/me` or the platform namespace |
| B6 | **Relay is unreachable from the console.** `relay-ui` sends `localStorage.fw_access_token`; console has only a cookie; `vercel.json` has no `/api/relay` rewrite; backend `/api/v1/platform/relay` is a `{status:'ok'}` stub | `packages/relay-ui/src/client.ts:18-29`, `apps/super-admin/vercel.json`, `platform.routes.ts:613` | `/admin/relay`, `/admin/support-audit`, `RelayNotificationCenter` all 401 |
| B7 | **Region change requests live in an in-memory array** | `regions/region-change-requests.store.ts:28` | Lost on restart, per-instance; approve never updates `tenant.region` (`platform.routes.ts:568`) |

---

## 4. Service inventory — the 41 services

Legend — **UI:** D = dedicated page, G = generic OpsRoute, R = redirect only, X = no route. **Data:** a = real tenant data with tenant-side producer, b = written only by console/worker/webhook, c = in-memory, d = hardcoded/empty, e = vendor-proxied. **To go live needs:** UI / wire (frontend→existing backend) / producer (something must write the model) / vendor (external key + real call) / job (worker) / model (schema change).

### Platform

| Service | UI | Backend | Data | Verdict | To go live needs |
|---|---|---|---|---|---|
| Tenant Control Plane | D (mock) | `platform.routes.ts` list/detail/suspend/unsuspend/plan-override — real | a | **Mock UI over real API** | wire + B1 + reason/expiry fields in `PlanOverrideModal`/`SuspendDialog`; plan values must be `STARTER/PRO/ENTERPRISE` not `Starter/Pro/Enterprise`; delete has no handler |
| Impersonation Center | D | real; Redis-revocable | a | **Blocked by B1** | B1; enforce `scopes` (`authenticate.ts:153-158` never checks them → token has full TENANT_ADMIN write); tenant-side visibility (see §5 #18); token in URL query (`ImpersonationStartPage.tsx:25-30`) |
| Feature Flags & Releases | G | LaunchDarkly; `[]` without key; override returns 503 before audit row | e + b | **Dangerous + empty** | fix `turnFlagOn` → per-tenant targeting (`console-phases.routes.ts:1006-1015`); `/releases` always `[]` — never calls GitHub even when configured |
| Queue Operations | D | `GET /queues` real | a | **Partial** | DLQ column reads `failed` not `response.dlq` (`QueuesListPage.tsx:39`); `active` shown as "/s"; no replay/purge; `QueueMessageViewer` generates 220 fake messages; `lastProcessedAt` always null (`platform.routes.ts:519-523`) |
| Incident Management | G | PagerDuty webhook inbound only; no create/resolve route; `IncidentRunbook` has no writer | b | **Inbound-only** | producer for runbooks; create/resolve routes; outbound PagerDuty read |
| System Health | D | `GET /health` real | a | **Partial** | 3 of 4 `SystemMetrics` cards placeholder (`:10,11,17`); p95/error-rate badges always "-" (`badges.ts:58-66`) |
| Background Jobs | X | none | — | **Missing** | route + BullMQ introspection endpoint (job list exists in `queues/scheduled.worker.ts`) |
| Integration Health | G | status written only when an inbound webhook verifies; no poller; credentials view always empty | b | **Passive** | job (health poller); producer for `SecretCredential` |
| Database Operations | X | none | — | **Deferred by ADR** | route + endpoints (migrations table, pg_stat) |

### Revenue

| Service | UI | Backend | Data | Verdict | To go live needs |
|---|---|---|---|---|---|
| Billing Console | D | `internal/billing.routes.ts` real | a | **Live, with defects** | refund unit mismatch — same number sent to Stripe as pence and stored as pounds (`billing.routes.ts:146,156`, `stripe.service.ts:77-81`); no over-refund guard; `refundedAmount` never updated; refund without `gatewayRef` is DB-only "APPROVED"; `RefundApproval` never written; `Invoice`/`Payment` mix platform billing with tenants' own customer invoicing — no discriminator column |
| Dunning Manager | G | retry only inserts `DunningEvent`, no Stripe retry; 4th retry suspends tenant with no `SuspensionRecord`; sequences/steps have no producer; Stripe `invoice.payment_failed` writes no `DunningEvent` | a + b + d | **Status-flip only** | model/producer for sequences; Stripe retry call; webhook → `DunningEvent`; `SaveOffer` code redeemable nowhere |
| Subscription Manager | G | `Subscription` real (written only at signup); contracts/overrides never applied by billing or pricing | a + b | **Read-only, no effect** | wire overrides into pricing; detail route ignores `:id` and lists all |
| Disputes & Chargebacks | X | none | — | **Missing** | model + Stripe dispute webhook + route |
| Tax & Compliance | G | all three models have no producer; Anrok/Stripe Tax are env-presence booleans | b (empty) | **Permanently empty** | producer or vendor; approve sets `Tenant.taxExempt` which nothing reads |
| Revenue Recognition | X | none | — | **Deferred by ADR** | — |
| Reseller Commissions | G | all three models no producer; aggregation job only logs (`scheduled.worker.ts:363-366`) | b (empty) | **Permanently empty** | job + producer |
| Revenue Analytics | D (static) | `/metrics` real for MRR; MRR uses hardcoded prices 500/79/29 (`platform.routes.ts:296,502`) | d | **Static charts** | `RevenueCharts.tsx` `sampleRows` + "chart placeholder" boxes; cohorts/movement/forecast/by-plan endpoints don't exist |

### Customer

| Service | UI | Backend | Data | Verdict | To go live needs |
|---|---|---|---|---|---|
| Support Desk | G | `SupportTicket`/`TicketMessage` real; tenant produces | a | **Half-wired** | no field separating "end-customer→tenant" from "tenant→Fauward" tickets; console replies authored as a tenant user (`console-phases.routes.ts:551-562,621-631`), `fromSA` never shown; internal notes visible to tenant staff (`support.routes.ts:184`); new message doesn't bump `updatedAt`; reply email is a QUEUED `NotificationLog` never sent; UI has only "Create Linked Ticket" — PATCH/reply have no UI |
| Customer 360 | D | aggregate real | a + d | **Live, isolated badly** | no tenant picker (B4); one parent query, no tab boundaries/gates (P2-4); header "MRR placeholder / Last login placeholder" (`Customer360Page.tsx:56`); health falls back to fabricated 78 + 3 static factors (`customer360.routes.ts:75,86`); counts capped by `take` limits; Config tab dumps whole tenant object incl. users/shipments/invoices into a one-line `MonoCell` |
| CS Console | G | `TenantHealthScore` nightly real; weights static; NPS hardcoded 10; `SupportVendorTicket` never written so ticket factor always full marks; playbook runs never executed | a + d | **Scores on bad inputs** | real NPS source; fix factor inputs (`scheduled.worker.ts:44-69`); playbook executor |
| NPS & Feedback | X | none | — | **Missing** | model + tenant-portal producer (no NPS exists anywhere) |
| Knowledge Base | X | none | — | **Deferred by ADR** | — |
| Communications Hub | G | `PlatformAnnouncement` real; tenant reads via `AnnouncementBanner` | a | **Connected** | no edit/expire/delete UI (PATCH/DELETE exist); views/dismissals not reported back; `primaryAction` "New announcement" is a non-interactive `<span>` |
| QBR Center | G | generate writes `html:'<h1>QBR</h1>'` (`:1445`); templates no writer | b + d | **Placeholder** | job (P3-2) |
| Onboarding Tracker | G | funnel reads `Tenant.onboardingSteps` | a (poisoned) | **Connected to fake data** | tenant portal marks steps done on every "Next" click; steps themselves simulated (§7); a second real checklist (`usage.service.ts:81`) is never shown to the console |

### Trust

| Service | UI | Backend | Data | Verdict | To go live needs |
|---|---|---|---|---|---|
| Employee IAM | D | real | a/b | **Live, controls don't hold** | self-grant check compares `StaffUser.id` to `PlatformUser.id` — different ID spaces, never matches (`iam.routes.ts:220`, schema `:477-478`); SUSPENDED staff not propagated to `PlatformUser`, auth never checks staff status; legacy-mapped role re-added on every `/auth/me` so revoke doesn't stick (`staff-iam.service.ts:78-95`); TOTP secret stored plaintext in `mfaSecretEncrypted`; Google SSO "callback" is an authenticated upsert, not OAuth; `seedStaffRoles` upserts 23 roles on every permission check |
| Just-in-Time Access | G | functional + enforced on `/api/internal` | b | **Dead-end UX** | `POST /jit/requests` needs `trust.jit.request` which only 4 roles have → `JITGate` 403s for everyone else; approvals not reflected in `/auth/me` or `PermissionProvider` (built once) or `/api/v1/platform`; `/trust/jit/request` calls `/jit/sessions/active` (needs approve perm) instead of `/jit/sessions/my`; `onRequest` error uncaught; manifest gates JIT by `trust.iam.read` but routes need `trust.jit.*` |
| Audit Log | D | real | a | **Live; chain can't verify** | two hash implementations write the same table (`services/platform-audit.service.ts:28-65` vs `packages/internal-audit/src/hash.ts`); `/verify` recomputes with one scheme only; find-then-create race can fork the chain; global `auditMiddleware` + explicit `writeInternalAudit` = duplicate rows per mutation; UI queries on every keystroke, stuck at 50 rows |
| Compliance Ops (DSAR) | G | tenant produces; `gather` inserts QUEUED `ComplianceExport` nothing processes; `deliver` writes fake URL `https://signed.example.fauward.internal/...` (`:871`) **shown to tenants** as `downloadUrl` (`dsar.routes.ts:95`) | a | **Fake delivery** | job (P3-1); request type hardcoded ACCESS so tenants can't request erasure (`dsar.routes.ts:59`); gather/deliver have no UI; `/dpa` and `/subpoenas` routes show the DSAR queue |
| Legal Hold | G | enforced on every tenant DELETE (`app.ts:154-165`) | b | **No release path** | `releasedAt`/`releasedBy` never written; a hold with `tenantId=null` blocks all tenant deletes forever |
| Trust & Safety | G | fraud: Stripe Radar webhook produces; decision suspends with no `suspensionReason`/`suspendedAt`; suspensions list only sees fraud-created records (platform/dunning/super-admin suspend don't create one); appeals real but approve lifts only via `body.suspensionId`, UI never sends it; AUP and rules return `[]` | a + d | **Half-wired** | unify all suspend paths onto `SuspensionRecord`; wire appeal → suspension; tenant never told decision |
| KYC & Sanctions | G | Persona/ComplyAdvantage gated; monthly rescreen inserts PENDING rows never sent to vendor; `Tenant.kycStatus` written, never read | b + e | **Vendor-gated, no effect** | vendor; consume `kycStatus` somewhere |
| Secret Management | G | `SecretCredential`/`SecretAccessLog` no producer; Doppler never called | b (empty) | **Permanently empty** | producer or vendor |
| Security Monitoring | G | anomalies + auto IP blocks from worker; staff logins real; sessions revoke works | b | **IP blocks never enforced** | middleware that reads `IpBlock`; covers staff only, not tenant users |

### GTM — all 8 generic, all empty

| Service | Backend | To go live needs |
|---|---|---|
| Sales Pipeline | `SalesDeal` no producer; HubSpot flag only | job (P3-4) |
| Trial Management | `TrialActivation` real (worker); extension approve never touches `Subscription.trialEnd` | wire approve; producer for extension requests |
| Demo Environments | creates `Tenant` with no users → unusable; `shareTokenHash` consumed nowhere; templates hardcoded | seed users; share-link consumer |
| CPQ & Contracts | DocuSign envelope sent with no documents/recipients (`:1368-1371`); `/discounts` filters on status nothing sets; `MsaAgreement`/`ContractApproval` no writer | vendor + producer |
| Partner Portal | three models, no writers | producer |
| Marketing Attribution | `MarketingAttribution` no producer; `/funnel` returns `[]` | job (P3-3) |
| Pricing Experiments | `/plans` hardcoded array; Statsig not referenced anywhere in repo | vendor or model |
| Sales Handoff | `SalesHandoff` no producer; templates hardcoded | producer |

**Models with no producer anywhere (24):** DunningSequence, DunningStep, IncidentRunbook, SupportVendorTicket, SecretCredential, SecretAccessLog, TaxRegistration, TaxReturn, TaxExemption, MsaAgreement, ContractApproval, QBRTemplate, SalesDeal, TrialExtensionRequest, SalesHandoff, MarketingAttribution, PricingExperiment, Partner, PartnerApplication, PartnerDealRegistration, CommissionLedger, CommissionPayout, CommissionDispute, RefundApproval.

**RBAC permissions with no backend route:** `platform.tenants.*`, `platform.impersonation.*`, `platform.queues.*`, `platform.health.read`, `platform.jobs.*`, `platform.integrations.write`, `platform.database.read`, `revenue.disputes.*`, `revenue.recognition.*`, `revenue.analytics.read`, `customer.feedback.*`, `customer.kb.*`, `gtm.pipeline.write`, `gtm.partners.write`, `gtm.pricing.write`, `gtm.handoff.write`.

---

## 5. Tenant-portal → console connection map

| # | Interaction | Tenant side | Backend | Console side | Status | Gap |
|---|---|---|---|---|---|---|
| 1 | Support tickets | `pages/support/TicketsListPage.tsx`, `TicketDetailPage.tsx` | `support/support.routes.ts` | `/customer/support` (G), C360 Tickets | Half | see §4 Support Desk |
| 2 | Tenant→Fauward messaging / feedback (Relay) | `pages/messaging/MessagingPage.tsx` (Pro-gated); Starter has only `mailto:` | `relay/relay.routes.ts` → Supabase | `RelayPage`, `SupportAuditPage` | Half | B6; relay-api trusts unverified JWT when `JWT_ACCESS_SECRET` unset (`packages/relay-api/src/index.ts:135`); AI-draft approve endpoint has no caller anywhere |
| 3 | Suspension appeal | `components/billing/SuspendedOverlay.tsx:28` | `appeals/appeals.routes.ts` | `/trust/safety/appeals` | Connected | platform suspend creates no `SuspensionRecord` → `suspensionId` null → never lifted; tenant never told decision, can't read status; staff alert is a QUEUED log never sent |
| 4 | DSAR / export / deletion | `pages/settings/PrivacyTab.tsx` | `dsar/dsar.routes.ts` | `/trust/compliance/dsar` | Half | type hardcoded ACCESS; fake download URL shown to tenant; no gather worker |
| 5 | Region change | `layouts/TopBar.tsx:137-160` | in-memory store | `/admin/regions` (legacy) | Half | B7; `/dev` endpoint unauthenticated outside prod |
| 6 | Plan change / billing | `pages/settings/BillingTab.tsx:19-25` | **no plan-change endpoint exists** | `/revenue/subscriptions`, dunning | **Missing** | plan change is `setTimeout(700)` + toast; "Manage billing" opens hardcoded `https://billing.stripe.com/session`; `Subscription` written only at signup; Stripe failures don't reach dunning timeline; `SaveOffer` shown to tenant but unredeemable |
| 7 | Onboarding | `pages/onboarding/OnboardingPage.tsx:49-56` | `onboarding.routes.ts` | `/customer/onboarding` | Connected (fake) | steps marked done on click; real checklist in `usage.service.ts:81` never surfaced |
| 8 | Announcements | `components/layout/AnnouncementBanner.tsx` | `announcements.routes.ts` | `/customer/comms` | **Connected** | no edit/expire UI; no read receipts |
| 9 | API keys | `pages/developer/DeveloperPage.tsx` (real); `settings/ApiKeysTab.tsx` calls non-existent route, shows `MOCK_KEYS` | `api-keys.routes.ts` | C360 Usage | Connected, read-only | no console revoke |
| 10 | Webhooks | `DeveloperPage.tsx` (real); `settings/WebhooksTab.tsx` is `MOCK_ENDPOINTS` with random test results | `webhooks.routes.ts` | `/platform/integrations/webhooks` | Connected, read-only | `/api/v1/platform/webhooks/failures` uses legacy auth → unreachable; no replay |
| 11 | Tenant's own payment gateway config | `settings/IntegrationsTab.tsx:280-300` | `tenant.routes.ts:19` | **none** | **Missing** | also saved to `localStorage` incl. secret keys |
| 12 | Plan gates / overrides / flags | `lib/plan-features.ts`, `router/guards/PlanGate.tsx` | `featureGuard.ts:6` reads `req.tenant.plan` from `tenant.resolver.ts:90` — **override not applied** | flags (G), override modal (no-op) | Half | override changes what tenant UI shows but backend `requireFeature` still 403s; Redis `plan-changed` publish has no subscriber; no feature-request channel |
| 13 | Tenant staff mgmt (invite/role/suspend) | `pages/team/TeamPage.tsx` | `users.routes.ts` | C360 People (name/role only) | Half | no console view of invites/suspensions/role changes; no tenant-user lockout model |
| 14 | Notifications | `NotificationCenter.tsx`, `NotificationsInboxPage.tsx` | `notifications.routes.ts` | `/api/v1/platform/logs` → `LogsPage` returns `null` | Half | every platform-originated notification is a QUEUED `NotificationLog` row nothing dispatches (`notifications.worker.ts:184-245` only logs); no platform action creates an `InAppNotification` |
| 15 | Exceptions / escalations | no tenant UI for `/tenant/exceptions`; "escalate" only sets status | `exceptions.routes.ts`, `control-tower/`, `tracking.platform.routes.ts`, WS room `escalations:all` | **none** | **Missing** | control tower + `/platform/tracking/*` + WS room all require legacy `SUPER_ADMIN` tenant JWT; console has no socket client |
| 16 | AI agent usage / limits | `pages/agent/AgentUsagePage.tsx`, `AgentTasksPage.tsx` | `agent.routes.ts`, `llm-gateway.service.ts` metering | **none** | **Missing** | `TenantAiUsage`, `TenantAiLimit`, `AiAgentRun`, `AgentAction` never read by any internal route; no way to set a limit |
| 17 | Tenant audit log | `features/admin/audit/AuditLogPage.tsx:12` calls `/api/audit-log` (missing `/v1`) → 404 | `audit.routes.ts` | C360 Audit (20 rows) | Half | tenant page broken; no cross-tenant search |
| 18 | Impersonation (tenant visibility) | banner only in impersonator's own session | `platform.routes.ts:410-494` | `ImpersonationStartPage` | Operator-only | no tenant-visible access log/notice; tenant `AuditLog` rows during impersonation attributed to target user (`actorType USER`); `scopes:['read']` never enforced |
| 19 | Usage / health inputs | dashboard `/tenants/me/health`, `/tenant/usage` | `usage.service.ts`, `health.routes.ts`, nightly worker | CS Console, C360 Health/Usage | Half | `UsageRecord.smsSent/emailsSent/storageMb` never incremented; returns/customs/documents/AI not in score |
| 20 | Relay AI drafts | — | `relay.routes.ts:213` approve-and-send | — | Half | no caller anywhere |

**Activity streams:** there is no platform-subscribable activity table. Tenant activity is spread across `AuditLog`, `ShipmentEvent`, `TrackingEvent`, `InAppNotification`, `NotificationLog` and `OutboxEvent` (routed only to notification/webhook/analytics queues — `queues/outbox.worker.ts:23-33`). The tenant-facing `GET /api/v1/activity` (`analytics.routes.ts:584`) merges five sources on the fly for one tenant; there is no platform equivalent. `PlatformAuditLog` never mirrors tenant actions. The only platform-wide realtime channel (`escalations:all`) is gated by legacy auth the console can't present.

---

## 6. Security findings

| # | Finding | Where | Severity |
|---|---|---|---|
| S1 | MFA never required for any console session (`mfaVerifiedAt` always null; `authenticate-platform-session.ts` has no MFA check) | `platform.routes.ts:101` | High |
| S2 | ROOT hardware-key assertion defaults to literal `'dev-hardware-key'` when env unset | `iam.routes.ts:15,28`; also `console-phases.routes.ts:741-742` | High |
| S3 | IAM self-grant guard compares `StaffUser.id` with `PlatformUser.id` — never matches | `iam.routes.ts:220` | High |
| S4 | Staff SUSPENDED status not propagated; auth never checks it | `iam.routes.ts:184` | High |
| S5 | Revoked legacy-mapped role re-granted on next request | `staff-iam.service.ts:78-95` | Medium |
| S6 | Impersonation `scopes` never enforced → impersonation token = full TENANT_ADMIN write | `shared/middleware/authenticate.ts:153-158` | High |
| S7 | Legacy `/api/v1/admin/*` impersonation token has no `mode=IMPERSONATION` → Redis revoke never checked → DELETE is a no-op | `super-admin.routes.ts:234,243` | Medium |
| S8 | Monitoring endpoints public when `MONITORING_API_KEY` unset (expose tenant names, custom domains, domain errors); local `.env` doesn't set it | `monitoring.routes.ts:44-49` | High |
| S9 | LaunchDarkly "tenant override" sends `turnFlagOn` → flag on for everyone in production | `console-phases.routes.ts:1006-1015` | High |
| S10 | TOTP secret stored plaintext in a column named `mfaSecretEncrypted` | `iam.routes.ts:265` | Medium |
| S11 | Internal support notes visible to tenant staff | `support.routes.ts:184` | Medium |
| S12 | Tenant-portal `IntegrationsTab` writes payment-gateway secret keys to `localStorage` | `settings/IntegrationsTab.tsx:280-300` | Medium |
| S13 | Relay API reads JWT without verification when `JWT_ACCESS_SECRET` unset; dev tenant ids starting `tenant_` bypass auth | `packages/relay-api/src/index.ts:135`, `relay.routes.ts:90,98` | Medium (dev) |
| S14 | Audit chain unverifiable (two hash schemes, race, duplicate rows) — SOC 2 CC8.1 evidence cannot pass | §4 Audit Log | High for compliance |
| S15 | `ADMIN_HARDENING_PHASE_1` host guard would also 404 inbound vendor webhooks and status-dashboard calls; `_PHASE_2..6` parsed but never read | `app.ts:136-139`, `config/index.ts:64-68,181-186` | Low |
| S16 | Vendor-configured-but-failing calls throw → unhandled 500 instead of degraded response | `services/internal-vendors.service.ts` `vendorJson` | Low |

---

## 7. Tenant-portal fake writes and fallbacks (they poison console data)

**Fake writes — user believes it happened, nothing reaches the API:**
- `components/shipments/CreateShipmentWizard.tsx:78-93` — the `/shipments/create` route waits 900 ms and invents `FWD-YYYY-#####`. No tenant-portal code calls `POST /api/v1/shipments` (which exists at `shipments.routes.ts:266`). Every shipment-derived console metric (health score, usage, onboarding funnel, MRR contribution) is therefore fed only by API/agent-created shipments.
- `pages/settings/BillingTab.tsx:22-25` — plan change.
- `pages/settings/ApiKeysTab.tsx:17-80` — generates fake `fw_live_` keys in the browser.
- `pages/settings/WebhooksTab.tsx:20-40,99-176,239` — mock endpoints, random 80/20 test results, `server: "mock"`.
- `pages/shipments/ShipmentsListPage.tsx:250-269,389-397` — bulk assign/status/export/print are toasts or no handler.
- `pages/shipments/ShipmentDetailPage.tsx:94,276,310` — contact, upload, notes are `(x) => void x`.
- `components/onboarding/StepFirstShipment.tsx`, `StepPayments.tsx`, `StepInviteTeam.tsx` — all simulated; `OnboardingPage.tsx:49-56` still marks backend steps complete.
- `pages/support/TicketsListPage.tsx:52-90` — on failure saves a fake `SUP-#####` draft to `localStorage`.

**Fabricated fallbacks shown on API failure:** `TenantDashboardPage.tsx:141-293`, `TenantFinancePage.tsx:286-400`, `AnalyticsPage.tsx:541-579`, `LiveMapPage.tsx:30-60`, `TrackingResultPage.tsx:20,151` (public tracking invents a result), `hooks/useBilling.ts:7-33,103-117` (fake Visa 4242, 16 fake invoices), `hooks/useTenant.ts:12-30,170-184`, `components/shared/CommandPalette.tsx:18-33` (calls non-existent `/api/search`).

**Static / broken:** `pages/AppPages.tsx` (CRM, CRM detail, finance detail £2,450.50, `/book` submit no handler, links to `/crm/new` and `/team/invite` go nowhere); `OperationsOverviewPage.tsx:35-50` four "Coming soon" cards; `features/admin/audit/AuditLogPage.tsx:12` wrong path; `router/index.tsx` dead legacy router stranding `features/driver/*` and `features/admin/*`; no-handler buttons in `PageShell.tsx:97`, `ListPageTemplate.tsx:119,122`, `LabelsPage.tsx:80`, `PricingCalculatorPage.tsx:97`, `ReportsPage.tsx:132`; `ProfileTab.tsx:266` MFA button permanently disabled.

---

## 8. Super-admin dead code and no-op interactions

**Delete outright:**
- `src/router/index.tsx` (`SuperAdminRouter`, never imported — `@/router` resolves to `router.tsx`)
- `src/components/admin/ImpersonationBanner.tsx`
- `router.tsx:352-434` `LogsPanel` (duplicate of `ShellLayout`'s), `:436-438` `LogsPage` (routed, renders `null`), `:440-447` `ForbiddenRoute`
- `pages/admin/DashboardPage.tsx` — `DashboardPage`, `DashboardShimmer`, `DashboardOverviewShimmer`, `ShimmerBlock` (fake 1.4 s shimmer); only `DashboardOverviewSections` is used and it is mock
- `pillars/trust/iam/api.ts:64` `updateStaffUser`, `pillars/trust/audit/api.ts:37` `fetchAuditEntry`
- `BadgeKey`s `active-tenants`, `shipments-today`
- `apps/admin/` — separate "Administration panel is being set up" shell, still deployed via `apps/admin/railway.json`
- `apps/super-admin/INVENTORY.md` — describes routing that no longer exists

**Legacy `AdminLayout` section (`router.tsx:264-340,780-792`):** 11 nav items, 6 redirect into the new shell; `RegionsPage`, `RelayPage`, `SupportAuditPage`, `LogsPage` are reachable only by typed URL — nothing in `ShellLayout`/`PillarSidebar`/`CommandPalette` links to them; hardcoded "● All systems operational" pill; none of the three pages has a `PermissionRoute`.

**Used only to feed mock pages:** `ActivityFeed`, `AlertCard`, `MRRChart`, `MetricCard`, `ShipmentsChart`, `PlanOverrideModal`, `SuspendDialog`, `TenantTable`, `TenantDetailTabs`, `QueueMessageViewer`, `RevenueCharts`, `useDebouncedValue`.

**Package exports never used:** internal-ui `ActorChip`, `FilterBar`, `ImpersonationBanner`, `StatCard`, `TenantChip`; internal-rbac `PermissionGate`, `RoleGate`, `hasPermissionForRoles`.

**Hardcoded UI data:** `DashboardPage.tsx:8-34,84-109` (£114,300 MRR, 286 tenants, 4,921 shipments, 31 signups, DLQ 43, 5xx 2.8%, 17 failed payments, activity dated 2026-04-06); `CommandPalette.tsx:11-17` (5 entries, fake ids `t_1`/`t_2`); `TopBar.tsx:39-42` red "On-call" pill; `PillarCard.tsx:16` `alertCount` fake 1; `_PillarOverviewBase.tsx:83-88` "Last activity" always "-"; `badges.ts:46-67` 38 of 41 services fall back to placeholder badge.

**Generic OpsRoute page defects (apply to all 98 routes):**
- `primaryAction` renders a `<button>` with no `onClick` (`InternalOpsPage.tsx:86`) or a non-interactive `<span>` (`WorkflowOpsPage.tsx:707`)
- rows not clickable, `id` hidden, yet every action needs a pasted ID; actions shown regardless of write permission
- detail routes ignore `:param` and show the whole list (`/revenue/subscriptions/:id`, `/revenue/commissions/:partnerId`, `/trust/compliance/dsar/:id`, `/trust/compliance/legal-hold/:id`, `/trust/kyc/:id`, `/gtm/demos/:id`, `/gtm/pricing/experiments/:id`, `/gtm/partners/:id`)
- single-object responses render "No records" (`/pipeline/:dealId`, `/contracts/quotes/:id`, `/integrations/:provider`, `/trials/:tenantId`, `/success/health-scoring`)
- multi-array responses lose data (`/dunning/failed-payments` hides `overdueInvoices`; `/tax` hides `returns`)
- `ActionPanel` state carries across routes (no `key`)
- action results shown as raw JSON "Queued or saved: {…}"
- backend write endpoints with no UI: `PATCH /dunning/sequences/:id`, `PATCH /support/tickets/:id`, `POST /support/tickets/:id/reply`, `POST /jit/requests/:id/deny`, `POST /compliance/dsar` + `/gather` + `/deliver`, `PATCH/DELETE /announcements/:id`, `PATCH /secrets/:id`, `POST /tax/exemptions/:id/approve`, `POST /subscriptions/contracts`, `POST /subscriptions/overrides`; unused reads `/metrics/*`, `/customer/360/:id/api-usage`, `/iam/role-catalog`

**Dedicated-page defects:** billing pages have unlabelled inputs, no error display, double-submit possible, GBP hardcoded, errors swallowed on refunds; IAM assigns on select-change with no confirm, hardcoded reasons, create form shown without `trust.iam.write`; audit log queries per keystroke, stuck at 50; `SuperAdminGuard` treats any `/auth/me` error (incl. 500/network) as denied; permissions never refreshed after JIT/role change; `LoginPage` doesn't redirect already-authed users and has a fake 1200 ms delay; `StatusPage` in dev is a 302 to `:4000`, not a proxy.

---

## 9. Inputs for the design spec

### 9.1 Decisions the spec must make first

1. **Manifest truth.** Add `status: "live" | "preview" | "deferred"` to `PillarServiceManifest` and render it (badge, "Coming soon" page for deferred, no sidebar link to unrouted paths). Add the CI reconciliation check (P2-2). This is a day of work and removes B4.
2. **One permission system.** Either move `/api/v1/platform/*` onto `requireInternalPermission` (preferred: it already honours JIT) or delete the legacy `PlatformRole` map. Until then IAM is cosmetic for the 4 "live" platform services.
3. **One suspension path.** Platform suspend, dunning auto-suspend, fraud decision and legacy super-admin suspend must all create `SuspensionRecord` and set `suspendedAt`/`suspensionReason`; appeals lift via `appeal.suspensionId`.
4. **Billing data model.** `Invoice`/`Payment` need a `kind: PLATFORM | TENANT_CUSTOMER` discriminator (or separate tables) before any revenue page can be trusted.
5. **Ticket data model.** `SupportTicket` needs `audience: END_CUSTOMER | PLATFORM` and `TicketMessage` needs `authorType: TENANT_USER | STAFF | SYSTEM` + visibility flag.
6. **Notification dispatch.** Decide whether platform-originated notifications go through the existing BullMQ notification queue (then wire `NotificationLog QUEUED` → job) or get their own worker. Today nothing sends them.
7. **Activity feed.** Decide whether the console gets (a) a `PlatformActivity` projection fed by `OutboxEvent`, or (b) an on-demand cross-tenant version of `GET /api/v1/activity`. (a) is the only option that supports "Last activity" per service and realtime.
8. **Tenant-side impersonation visibility.** Spec a tenant-visible "staff access log" (reads `PlatformImpersonationSession`), and decide whether impersonation writes are allowed at all (`scopes`).
9. **Vendor-free defaults.** For every vendor-gated service, spec the Fauward-native behaviour when no key is present (e.g. flags → `FeatureFlagOverrideAudit` as source of truth; incidents → internal create/resolve; KYC → manual review queue). Today "no key" means "empty page or 503".
10. **Which of the 24 producer-less models get a producer, and which get deleted** with their routes and manifest entries. GTM in particular has no tenant-side origin for any of its data.

### 9.2 Suggested phasing

| Phase | Outcome | Items |
|---|---|---|
| 0 — Unblock | A staff user can log in, do MFA, and perform one dangerous action end to end | B1 (MFA step in UI + enrolment-aware guard), B3 (`internalApi` refresh), B4 (manifest status + reconciliation), S2, S3, S4, S8, S9 |
| 1 — Tenant control plane for real | Tenants list/detail/suspend/override/impersonate against the real API; Customer 360 reachable from every tenant row | B2, `TenantChip` adoption (P3-7), `requireFeature` honours override, decision 2 & 3, C360 tab isolation (P2-4), delete legacy `AdminLayout` + `/api/v1/admin` + `apps/admin` |
| 2 — Close the tenant loop | Everything a tenant does that needs a human on the Fauward side shows up, and the answer goes back | tickets (decision 5), appeals round-trip + tenant status, DSAR real gather/deliver job (P3-1) + erasure type, region requests persisted + `tenant.region` applied, notification dispatch (decision 6), plan-change endpoint + Stripe portal session, feature-request channel, tenant impersonation log (decision 8), AI usage + limits routes, exceptions/control-tower on console auth |
| 3 — Truthful dashboards | No hardcoded numbers anywhere | dashboard KPIs from `/metrics` + new counters, revenue analytics endpoints (cohorts/movement/forecast/by-plan), health-score inputs fixed, badges wired or "not wired", activity feed (decision 7), queue DLQ/replay/purge, p95/error-rate from observability |
| 4 — Preview services → live or gone | Each remaining service either has a producer + dedicated page or is removed | decision 10, per-service dedicated pages replacing OpsRoute, jobs P3-2/3/4/5/6, vendor-free defaults (decision 9), Relay on console auth (B6) |
| 5 — Compliance evidence | Audit chain verifies; SOC 2 controls have passing tests | single hash scheme + transactional chain write + de-dup middleware, legal-hold release, IP-block enforcement, TOTP encryption, S14 |

### 9.3 Things the spec should explicitly *not* re-invent

Already real and worth building on: `platform.routes.ts` tenant CRUD/suspend/override/impersonation (minus B1); `internal/billing.routes.ts`; `internal/iam.routes.ts` (minus S3–S5); `internal/audit.routes.ts` read side; `customer360.routes.ts` aggregate; `announcements`; `appeals`; `dsar` request side; `support` ticket CRUD; JIT request/approve/revoke; nightly `scheduled.worker.ts` jobs (health scoring, anomaly scan, trial activation, demo expiry); `packages/internal-ui` (`DenseTable`, `EmptyState`, `JITGate`, `TenantChip`, `HealthPill`); `packages/internal-rbac` permission catalogue; the Playwright legacy-redirect suite.
