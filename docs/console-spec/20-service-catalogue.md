# 20 — Service Catalogue

One entry per manifest service (41). Each entry is the contract a work package implements.

**Guard notation:** `R:perm` = session + permission (read). `W:perm` = + CSRF. `D:perm` = dangerous: + CSRF + fresh MFA + reason (architecture §9.2). All paths are under `/api/internal` unless they start with `/api/v1` (tenant API).
**Every mutation** also writes one `PlatformAuditLog` row and one `PlatformActivity` row (from WP-1.0). This is not repeated per route.
**Today** summarises re-audit §4. **Effect** says what changes in the system, not just in the row.

---

# Platform

## platform.tenants — Tenant Control Plane
**Target:** live · **Phase:** 1 (WP-1.2) · **Read:** `platform.tenants.read`
**Today:** 220 generated rows from 3 seeds; static detail; suspend/override/delete dialogs close and do nothing; "Impersonate" opens `?tenant=t_N`. Backend list/detail/suspend/override is real but never called.
**Model:** 0039, 0041, 0042. Reads `Tenant`, `Subscription`, `TenantPlanOverride`, `TenantFeatureOverride`, `SuspensionRecord`, `User`, `UsageRecord`, `PlatformImpersonationSession`, `RegionChangeRequest`.

| Method | Path | Guard | Effect |
|---|---|---|---|
| GET | `/tenants` | R:`platform.tenants.read` | Search (name, slug, custom domain), filters (plan, effectivePlan, status, region, createdFrom/To), sort, cursor. Row: id, name, slug, customDomain, plan, effectivePlan, status, region, createdAt, mrrContribution `{amount,currency}` from `mrrForSubscription()`, shipmentsThisMonth, staffCount, healthScore \| null. DEMO tenants excluded unless `status=DEMO` |
| GET | `/tenants/:id` | R:`platform.tenants.read` | Detail: identity, branding, billing vs effective plan, active override, feature overrides, active suspensions, region + pending region request, limits (`maxStaff`, `maxShipmentsPm`, `maxOrganisations`), usage (current + 6 months), staff summary, subscription, last 10 impersonation sessions |
| POST | `/tenants/:id/suspend` | D:`platform.tenants.suspend` | `suspendTenant` (D3) with `category`, `reason`, `publicReason` |
| POST | `/tenants/:id/unsuspend` | D:`platform.tenants.suspend` | `liftSuspension` for `suspensionId` (or all active if omitted and caller confirms) |
| POST | `/tenants/:id/plan-overrides` | D:`revenue.subscriptions.override` | Revokes current override, creates new (`plan ∈ STARTER\|PRO\|ENTERPRISE`, reason, `expiresAt?`); ENTERPRISE requires `kycStatus=APPROVED` from Phase 4; publishes `plan-changed`; tenant entitlements change |
| DELETE | `/tenants/:id/plan-overrides/:overrideId` | D:`revenue.subscriptions.override` | Sets `revokedAt`; entitlements revert |
| GET/POST/DELETE | `/tenants/:id/feature-overrides[/:overrideId]` | R:`platform.flags.read` / D:`platform.flags.write` | `TenantFeatureOverride`; entitlements change (WP-1.4) |
| PATCH | `/tenants/:id/limits` | D:`platform.tenants.write` | Updates limit columns; tenant-side limit checks read them (verify each check uses the column, fix any hardcoded limit) |
| PATCH | `/tenants/:id/internal-notes` | W: `platform.tenants.write` or `customer.success.write` (`requireAnyConsolePermission`) | `Tenant.internalNotes` (existing column) |
| PUT | `/tenants/:id/ai-limit` | D:`platform.tenants.write` | P2 (WP-2.10): upserts `TenantAiLimit` (budget, request limits, features); gateway enforces; tenant notified |
| POST | `/tenants/:id/api-keys/:keyId/revoke` | D:`platform.tenants.write` | P2 (WP-2.13): revokes the key immediately; tenant admins notified with the reason |
| POST | `/tenants/:id/users/:userId/lock` · `/unlock` | D:`platform.tenants.write` | P2 (WP-2.15): sets/clears `User.lockedAt/lockedReason`; locked user gets 401 `USER_LOCKED`; tenant admins notified |
| POST | `/tenants/:id/close` | D:`platform.tenants.close` + typed slug | D3 suspension, `status CANCELLED`, `closedAt`, `purgeAfter`; Stripe cancel at period end if configured; admins notified; 409 `LEGAL_HOLD_ACTIVE` if held. A closed tenant is never reactivated by lifting suspensions or by appeals (D3) |
| GET | `/tenants/region-requests` | R:`platform.tenants.read` | Pending/decided requests (in-memory until WP-2.6) |
| POST | `/tenants/region-requests/:id/decision` | D:`platform.tenants.write` | WP-2.6 applies `tenant.region` and notifies |

**Page:** `pillars/platform/tenants/` — `TenantsListPage`, `TenantDetailPage` with tabs `Overview`, `Plan & entitlements`, `Users`, `Usage`, `Suspensions`, `Impersonation`, `Activity` (P2); `RegionRequestsPage`; dialogs `SuspendDialog`, `UnsuspendDialog`, `PlanOverrideDialog`, `FeatureOverrideDialog`, `LimitsDialog`, `CloseTenantDialog`.
**Tenant touchpoint:** suspension overlay with public reason and appeal (D3); entitlements change live (WP-1.4); close → email + login blocked with `TENANT_CLOSED`; limits visible in tenant Settings → Usage.
**Job:** none. **Vendor-free:** close works without Stripe and says "No Stripe subscription to cancel".
**Acceptance**
- ACC-TEN-1 List returns DB tenants with cursor pagination; search matches slug and custom domain.
- ACC-TEN-2 Invalid plan/status filter → 400; plan values are enum casing.
- ACC-TEN-3 Detail shows the override as effective; an expired override is ignored.
- ACC-TEN-4 (e2e) Suspend from the list → row shows SUSPENDED without reload; record, audit, activity, tenant in-app notification exist.
- ACC-TEN-5 Unsuspend with two active causes lifts only the chosen one.
- ACC-TEN-6 Plan override: reason required; previous override revoked; tenant's PRO-only route allowed (ACC-ENT-1).
- ACC-TEN-7 Close requires the typed slug and is blocked by an active legal hold.
- ACC-TEN-8 Lowering `maxStaff` below current makes the tenant's next invite return 403 `LIMIT_REACHED`.
- ACC-TEN-9 Every tenant row/name renders `TenantChip` linking to Customer 360.
- ACC-TEN-10 No `t_1`-style ids or seed arrays remain (gate test).

## platform.impersonation — Impersonation Center
**Target:** live · **Phase:** 1 (hardening P0 WP-0.5, tenant visibility P2 WP-2.9) · **Read:** `platform.impersonation.start`
**Today:** real backend, blocked by B1; scopes not enforced; token in URL query; no tenant visibility.
**Model:** 0037. `PlatformImpersonationSession`, tenant `AuditLog` (`actorType IMPERSONATOR`).

| Method | Path | Guard | Effect |
|---|---|---|---|
| POST | `/impersonation/sessions` | D:`platform.impersonation.start` (+`.mutate` for `write`, reason ≥ 20) | Session + Redis key; returns `{ exchangeCode, portalUrl, session }`; tenant admins notified (P2) |
| GET | `/impersonation/sessions` | R:`platform.impersonation.start` | Filters status (active/ended), tenantId, staffId, date; cursor |
| GET | `/impersonation/sessions/:id` | R:`platform.impersonation.start` | Session + tenant `AuditLog` rows written in-session |
| DELETE | `/impersonation/sessions/:id` | W:`platform.impersonation.start` (own) / `platform.impersonation.mutate` (others) | Revokes, deletes Redis key, `endedAt/endedReason REVOKED` |
| POST | `/api/v1/auth/impersonation/exchange` | public, rate limit 10/min/IP | Redeems code once → token |
| GET | `/api/v1/tenants/me/staff-access[/active]` | tenant TENANT_ADMIN | D8 |

**Page:** `pillars/platform/impersonation/` — `ImpersonationCenterPage` (start dialog: `TenantPicker` → active-user picker → scope → duration → reason), `ActiveSessionsTable`, `SessionDetailPage`.
**Tenant touchpoint:** staff-access tab, active banner for admins, `staff_access_started` notification (D8).
**Job:** `platform.impersonation-expiry-sweep`. **Vendor-free:** n/a.
**Acceptance:** ACC-IMP-1…6 (Phase 0) plus
- ACC-IMP-7 The start dialog cannot submit without a picked tenant, an active target user and a reason.
- ACC-IMP-8 Ending a session makes the tenant token's next request 401 `IMPERSONATION_EXPIRED`.
- ACC-IMP-9 Session detail lists tenant audit rows with `actorType IMPERSONATOR`.
- ACC-IMP-10 The tenant admin sees the session (reason, scopes, times) in the staff-access log.

## platform.flags — Feature Flags & Releases
**Target:** live · **Phase:** 4 (WP-4.1; native overrides backend in WP-1.4) · **Read:** `platform.flags.read`
**Today:** LaunchDarkly only; `[]` without key; override called `turnFlagOn` (global) — disabled in WP-0.7; `/releases` always `[]`.
**Model:** `TenantFeatureOverride` (0041). `FeatureFlagOverrideAudit` kept as the LaunchDarkly mirror log.

| Method | Path | Guard | Effect |
|---|---|---|---|
| GET | `/flags` | R | Catalogue = `planService` feature keys + `config/flags.ts` runtime flags; per flag: plans that include it, active override count, LD mirror status |
| GET | `/flags/:key` | R | Overrides for the flag (tenant, enabled, reason, expiry, by, mirror status) |
| POST | `/flags/:key/overrides` | D:`platform.flags.write` | Creates `TenantFeatureOverride`; when LD configured, adds the tenant to a per-tenant targeting rule (`context kind: tenant`) — never `turnFlagOn` |
| DELETE | `/flags/:key/overrides/:id` | D:`platform.flags.write` | Revokes; removes LD target |
| GET | `/flags/:key/audit` | R | `PlatformAuditLog` for the flag |
| GET | `/releases` | R | GitHub releases when `GITHUB_TOKEN` + repo configured; else backend `/version` + console build info (`VITE_GIT_COMMIT`, `VITE_BUILD_TIME`) |

**Page:** `pillars/platform/flags/` — `FlagsListPage`, `FlagDetailPage`, `ReleasesPage`.
**Tenant touchpoint:** entitlements change immediately. **Job:** none. **Vendor-free:** native overrides are the source of truth.
**Acceptance**
- ACC-FLG-1 Enabling a feature for tenant A passes A's `requireFeature`; tenant B unaffected.
- ACC-FLG-2 LD configured → adapter called with targeting instructions for context kind `tenant`; `turnFlagOn` never sent (spy).
- ACC-FLG-3 LD failure → override saved, mirror status `FAILED` shown with a `DegradedBanner`.
- ACC-FLG-4 Releases without GitHub shows backend and console versions.

## platform.queues — Queue Operations
**Target:** live · **Phase:** 3 (WP-3.6) · **Read:** `platform.queues.read`
**Today:** counts real; DLQ column reads `failed`; `active` shown as "/s"; no replay/purge; viewer shows 220 fake messages; `lastProcessedAt` null.

| Method | Path | Guard | Effect |
|---|---|---|---|
| GET | `/queues` | R | Per queue: waiting, active, delayed, completed1h, failed1h, dlqDepth, throughputPerMin, lastProcessedAt, paused |
| GET | `/queues/:name/jobs` | R | Real jobs by state, redacted data, cursor |
| POST | `/queues/:name/dlq/replay` | D:`platform.queues.replay` | Moves selected/all DLQ jobs to the source queue; result count |
| POST | `/queues/:name/clean` | D:`platform.queues.purge` | Cleans completed/failed older than N h |
| POST | `/queues/:name/pause` · `/resume` | D:`platform.queues.replay` | Pauses/resumes processing |

**Page:** `pillars/platform/queues/` — `QueuesListPage`, `QueueDetailPage`, `JobDrawer`. **Vendor-free:** n/a.
**Acceptance:** ACC-Q-1 DLQ column equals DLQ queue counts; ACC-Q-2 jobs endpoint returns real jobs with secrets redacted; ACC-Q-3 replay moves N jobs and records N in the audit row; ACC-Q-4 clean removes only matching state/age; ACC-Q-5 pause/resume reflected in `paused`.

## platform.incidents — Incident Management
**Target:** live · **Phase:** 4 (WP-4.2; escalations WP-2.11) · **Read:** `platform.incidents.read`
**Today:** PagerDuty inbound only; no create/resolve; runbooks have no writer.
**Model:** 0056 (`IncidentRecord` native fields, `IncidentUpdate`), `IncidentTenantImpact`, `IncidentRunbook`, `ExceptionCase` escalation columns (0053).

| Method | Path | Guard | Effect |
|---|---|---|---|
| GET | `/incidents` | R | Filter status/severity; active first |
| POST | `/incidents` | W:`platform.incidents.write` | Native incident (`vendor native`, severity SEV1–4, services, commander); SEV1/2 → CRITICAL activity + staff notification |
| GET | `/incidents/:id` | R | Timeline (updates), impacts, runbooks |
| PATCH | `/incidents/:id` | W | Status INVESTIGATING→IDENTIFIED→MONITORING→RESOLVED, severity, commander |
| POST | `/incidents/:id/updates` | W | `isPublic` → creates/updates `PlatformAnnouncement` (type INCIDENT) for impacted tenants (or all), SEV1/2 also `incident_update` email |
| POST | `/incidents/:id/impacts` | W | Adds tenant impact (exists) |
| POST | `/incidents/:id/resolve` | W | `resolvedAt`, postmortem URL, announcement expires |
| GET/POST/PATCH/DELETE | `/incidents/runbooks[/:id]` | R / W | Runbook CRUD (slug unique) |
| GET/PATCH | `/operations/escalations[/:id]` | R / W | Tenant escalations (WP-2.11): assign, reply to tenant, resolve |
| POST | `/incidents/webhooks/pagerduty` | HMAC (exists) | Upsert by `vendorId` |

**Page:** `pillars/platform/incidents/` — `IncidentsListPage`, `IncidentDetailPage`, `RunbooksPage`, `RunbookEditorPage`, `EscalationsPage`. TopBar shows an active-incident pill.
**Tenant touchpoint:** public updates appear in `AnnouncementBanner`; escalations get replies in the tenant exceptions page. **Vendor-free:** native.
**Acceptance:** ACC-INC-1 create → public update → impacted tenant's banner shows it; ACC-INC-2 resolve expires the announcement; ACC-INC-3 signed PagerDuty webhook upserts; ACC-INC-4 runbook CRUD and linking; ACC-INC-5 SEV1 notifies `platform.incidents.read` holders.

## platform.health — System Health
**Target:** live · **Phase:** 3 (WP-3.7) · **Read:** `platform.health.read`
**Today:** DB/Redis latency real; 3 of 4 cards placeholder; p95/error-rate badges "-".
**Routes:** `GET /health` (R) per WP-3.7. **Page:** `pillars/platform/health/SystemHealthPage` + `RouteLatencyTable`, `WorkersPanel`.
**Acceptance:** ACC-HLTH-1 p95 matches recorded fixture durations; ACC-HLTH-2 a worker with no heartbeat for 60 s shows `alive: false`; ACC-HLTH-3 no "-" placeholders — unavailable metrics show `not-wired` with the reason.

## platform.jobs — Background Jobs
**Target:** live · **Phase:** 3 (WP-3.8) · **Read:** `platform.jobs.read`
**Today:** no route; jobs exist in `queues/scheduled.worker.ts`.
**Model:** `ScheduledJobRun` (0054).

| Method | Path | Guard | Effect |
|---|---|---|---|
| GET | `/jobs` | R | Registered repeatables: name, cron, next run, last run status/duration |
| GET | `/jobs/:name/runs` | R | `ScheduledJobRun` history, cursor |
| POST | `/jobs/:name/trigger` | D:`platform.jobs.trigger` | Immediate run; run row records actor + reason |

**Page:** `pillars/platform/jobs/` — `JobsListPage`, `JobRunsPage`.
**Acceptance:** ACC-JOB-1 list equals registered jobs; ACC-JOB-2 every run writes a row with duration; ACC-JOB-3 a failing job shows its error; ACC-JOB-4 manual trigger runs and records actor/reason.

## platform.integrations — Integration Health
**Target:** live · **Phase:** 4 (WP-4.3; tenant gateways WP-2.12; webhooks WP-2.13) · **Read:** `platform.integrations.read`
**Today:** status written only by verified inbound webhooks; no poller; credentials always empty; webhook failures on legacy auth.
**Model:** `IntegrationProviderStatus`, `TenantPaymentGateway` (0051), `SecretCredential` (0059), `WebhookDelivery`.

| Method | Path | Guard | Effect |
|---|---|---|---|
| GET | `/integrations` | R | Each known provider: `NOT_CONFIGURED \| OK \| DEGRADED \| DOWN`, lastSuccessfulAt, errorRate24h, checkedAt |
| GET | `/integrations/:provider` | R | Single object: history + recent errors |
| POST | `/integrations/:provider/check` | W:`platform.integrations.write` | Runs the poll now |
| GET | `/integrations/tenant-gateways` | R | Tenant, provider, mode, status, lastError (never secrets) |
| GET | `/integrations/webhooks/failures` | R | Tenant webhook deliveries failed (cross-tenant, cursor) |
| POST | `/integrations/webhooks/deliveries/:id/replay` | D:`platform.integrations.write` | Re-enqueues the delivery on `webhookQueue` |
| GET | `/integrations/credentials` | R | Secret inventory view (no values) |

**Page:** `pillars/platform/integrations/` — `IntegrationsListPage`, `ProviderDetailPage`, `TenantGatewaysPage`, `WebhookFailuresPage`, `CredentialsPage`.
**Tenant touchpoint:** gateway verification failure → tenant in-app notification with a link to Settings → Integrations. **Job:** `platform.integration-health-poll` (5 min). **Vendor-free:** unconfigured providers show `NOT_CONFIGURED`, not `UNKNOWN`.
**Acceptance:** ACC-INT-1 poll writes status for configured providers only; ACC-INT-2 provider detail is a single object (no "No records"); ACC-INT-3 replay re-enqueues and the tenant endpoint receives it (worker test); ACC-INT-4 tenant gateway list never includes secret fields (schema test); ACC-INT-5 webhook failures reachable on console auth.

## platform.database — Database Operations
**Target:** live (read-only) · **Phase:** 4 (WP-4.4) · **Read:** `platform.database.read`
**Today:** no route (ADR 0001 deferred).

| Method | Path | Guard | Effect |
|---|---|---|---|
| GET | `/database/migrations` | R | `_prisma_migrations` vs `prisma/migrations` folders: applied / failed / pending |
| GET | `/database/tables` | R | Size, row estimate, last vacuum/analyze |
| GET | `/database/slow-queries` | R | `pg_stat_statements` top 20 by mean time; degraded if extension missing |
| GET | `/database/connections` | R | Count by state |

**Page:** `pillars/platform/database/DatabasePage` (tabs).
**Acceptance:** ACC-DB-1 migrations list includes every repo migration with status; ACC-DB-2 slow queries show `DegradedBanner` naming the extension when missing; ACC-DB-3 every query runs inside `SET TRANSACTION READ ONLY` (test).

---

# Revenue

## revenue.billing — Billing Console
**Target:** live · **Phase:** 1 (WP-1.5; money fixes WP-0.6) · **Read:** `revenue.invoices.read`
**Today:** real, with refund unit mismatch, no over-refund guard, `refundedAmount` never updated, DB-only "APPROVED" refunds, `RefundApproval` unused, platform and tenant-customer ledgers mixed.
**Model:** 0038, 0040.

| Method | Path | Guard | Effect |
|---|---|---|---|
| GET | `/billing/invoices` | R | `kind=PLATFORM` default (TENANT_CUSTOMER read-only toggle), filters tenant/status/date, cursor |
| GET | `/billing/invoices/:id` | R | Invoice → payments → refunds → approvals; credit notes |
| POST | `/billing/invoices` | W:`revenue.invoices.write` | `PLATFORM` invoice; tax 0 when `Tenant.taxExempt` (P4) else configured rate; `send: true` → Stripe invoice when configured, else email + in-app to tenant admins |
| POST | `/billing/invoices/:id/void` | D:`revenue.invoices.write` | Void; 409 if payments exist |
| GET | `/billing/payments` | R | `PLATFORM` payments |
| POST | `/billing/payments` | D:`revenue.invoices.write` | Records a manual payment (bank transfer) against a `PLATFORM` invoice; marks PAID when settled; lifts DUNNING suspension via D3 |
| GET/POST | `/billing/credit-notes` | R / D:`revenue.invoices.write` | Reduces invoice balance; cannot exceed it |
| GET | `/billing/refunds` | R | Includes approval queue |
| POST | `/billing/refunds` | D:`revenue.invoices.refund` (≥ `largeRefundThreshold` also needs `revenue.invoices.refund.large`, otherwise it goes to the approval path) | WP-0.6 rules |
| POST | `/billing/refunds/:id/approve` · `/reject` | D:`revenue.invoices.refund` (≠ requester) | Completes manual refund / rejects |
| GET | `/api/v1/tenants/me/billing/invoices` | tenant TENANT_ADMIN/TENANT_FINANCE | Tenant's own `PLATFORM` invoices, credit notes, refunds |

**Page:** existing `pillars/revenue/billing/*` rebuilt on the service kit.
**Tenant touchpoint:** "Invoices from Fauward" in `BillingTab`. **Job:** `finance.overdue-invoice-sweep` must filter `TENANT_CUSTOMER`; overdue `PLATFORM` invoices enter dunning (P4). **Vendor-free:** manual invoices/payments/refunds.
**Acceptance:** ACC-BIL-1…5 (Phase 0) plus ACC-BIL-6 console lists only `PLATFORM` by default and tenant finance never returns `PLATFORM` rows; ACC-BIL-7 a manual `PLATFORM` invoice appears in the tenant's BillingTab with a notification; ACC-BIL-8 credit note cannot exceed the balance; ACC-BIL-9 void blocked when payments exist; ACC-BIL-10 currency always from the row.

## revenue.dunning — Dunning Manager
**Target:** live · **Phase:** 4 (WP-4.5; Stripe webhook producers WP-2.7) · **Read:** `revenue.dunning.read`
**Today:** retry only inserts `DunningEvent`; 4th retry suspends without a record; sequences/steps no producer; Stripe failure writes no `DunningEvent`; `SaveOffer` unredeemable.
**Model:** 0058; `DunningEvent`, `DunningSequence`, `DunningStep`, `SaveOffer` (0047 fields).

| Method | Path | Guard | Effect |
|---|---|---|---|
| GET | `/dunning/overview` | R | Failed payments, overdue `PLATFORM` invoices, active enrolments (all arrays rendered) |
| GET | `/dunning/tenants/:tenantId/timeline` | R | `DunningEvent` + enrolment steps |
| POST | `/dunning/enrollments/:id/retry` | D:`revenue.dunning.write` | Stripe `invoices.pay` (idempotency key) when configured; else `payment_failed` email with portal/contact link |
| POST | `/dunning/enrollments/:id/pause` · `/cancel` | D:`revenue.dunning.write` | Stops steps |
| GET/POST/PATCH/DELETE | `/dunning/sequences[/:id][/steps/:stepId]` | R / W:`revenue.dunning.write` | Sequence editor; exactly one `isDefault` |
| GET/POST | `/dunning/save-offers` | R / W:`revenue.dunning.write` | Create offer (discount, expiry) → `PENDING` |
| POST | `/dunning/save-offers/:id/approve` | D:`revenue.dunning.write` | Ships in WP-2.7 (Phase 2). Generates `code`; tenant sees it in BillingTab |

**Page:** `pillars/revenue/dunning/` — `DunningOverviewPage`, `TenantDunningPage`, `SequencesPage`, `SequenceEditorPage`, `SaveOffersPage`.
**Tenant touchpoint:** dunning emails/in-app with "update payment method" (portal session, WP-2.7); suspension overlay (D3); save offer redeem (`POST /api/v1/tenants/me/save-offers/:code/redeem` → Stripe coupon or `PLATFORM` credit note).
**Job:** `revenue.dunning-advance` (hourly). **Vendor-free:** email-based retry; staff record manual payment.
**Acceptance:** ACC-DUN-1 `invoice.payment_failed` creates an enrolment on the default sequence; ACC-DUN-2 the job runs each due step exactly once (re-run safe); ACC-DUN-3 the suspend step suspends via D3 (`DUNNING`), `invoice.paid` recovers and lifts; ACC-DUN-4 retry calls `invoices.pay` with an idempotency key; ACC-DUN-5 an approved save offer is redeemable once.

## revenue.subscriptions — Subscription Manager
**Target:** live · **Phase:** 2 (WP-2.7) · **Read:** `revenue.subscriptions.read`
**Today:** `Subscription` written only at signup; contracts/overrides never applied; detail route ignores `:id`.
**Model:** 0047 (`PlanChangeRequest`, `SubscriptionEvent`), `CustomContract`, `PricingOverride`.

| Method | Path | Guard | Effect |
|---|---|---|---|
| GET | `/subscriptions` | R | Filters plan/status/cycle; MRR per row |
| GET | `/subscriptions/:tenantId` | R | That tenant only: subscription, events, overrides, contracts, plan-change requests |
| GET | `/subscriptions/plan-change-requests` | R | Queue |
| POST | `/subscriptions/plan-change-requests/:id/decision` | D:`revenue.subscriptions.write` | APPROVE → `Tenant.plan`, `Subscription.plan`, `SubscriptionEvent`, entitlements cache, Stripe update if configured; REJECT → reason; tenant notified |
| POST | `/subscriptions/:tenantId/cancel` | D:`revenue.subscriptions.write` | Cancel at period end (Stripe if configured) |
| GET/POST | `/subscriptions/contracts` | R / W:`revenue.subscriptions.write` | `CustomContract` |
| GET/POST | `/subscriptions/overrides` | R / D:`revenue.subscriptions.override` | `PricingOverride` → ACTIVE; consumed by `mrrForSubscription()` and Stripe coupon |
| POST | `/api/v1/tenants/me/plan-change` | tenant TENANT_ADMIN | Stripe: Checkout session (no subscription yet) or subscription update with proration → `{ redirectUrl }`; no Stripe: `PlanChangeRequest` (`MANUAL_APPROVAL`) |
| GET | `/api/v1/tenants/me/plan-change-requests` | tenant | Own requests and status |
| POST | `/api/v1/tenants/me/billing/portal-session` | tenant TENANT_ADMIN/FINANCE | Stripe billing portal URL; no Stripe → 409 `BILLING_PORTAL_UNAVAILABLE` and the UI offers "Contact billing" (creates a PLATFORM ticket, category `BILLING_QUERY`) |
| POST | `/api/v1/payments/webhook/stripe` | Stripe signature (exists) | `customer.subscription.*`, `checkout.session.completed`, `invoice.*` → `Subscription`, `SubscriptionEvent`, `PLATFORM` invoices/payments, `DunningEvent`, D3 lift on paid |

**Page:** `pillars/revenue/subscriptions/` — `SubscriptionsListPage`, `SubscriptionDetailPage`, `PlanChangeRequestsPage`, `ContractsPage`, `OverridesPage`.
**Tenant touchpoint:** `BillingTab` plan change and "Manage billing" (both real). **Vendor-free:** staff-approved plan changes.
**Acceptance:** ACC-SUB-1 no Stripe: request → approve → plan/entitlements/event change, tenant notified; ACC-SUB-2 signed `customer.subscription.updated` fixture updates plan and writes an event; ACC-SUB-3 detail returns only the requested tenant; ACC-SUB-4 an ACTIVE `PricingOverride` changes that tenant's `mrrContribution` in `/tenants` and the MRR on the subscription detail; ACC-SUB-5 portal-unavailable path creates a BILLING_QUERY ticket.

## revenue.disputes — Disputes & Chargebacks
**Target:** live · **Phase:** 4 (WP-4.6) · **Read:** `revenue.disputes.read`
**Today:** no route, no model. **Model:** `PaymentDispute` (0057).

| Method | Path | Guard | Effect |
|---|---|---|---|
| GET | `/disputes` | R | Queue by status and evidence due |
| GET | `/disputes/:id` | R | Detail, payment, tenant, evidence |
| POST | `/disputes/:id/evidence` | D:`revenue.disputes.write` | Stripe `disputes.update` with evidence + `submit: true` (idempotency key) |
| POST | `/disputes/:id/notes` | W:`revenue.disputes.write` | Internal note (activity) |
| Stripe webhook | `charge.dispute.created/updated/closed` | signature | Upsert `PaymentDispute` |

**Page:** `pillars/revenue/disputes/` — `DisputesListPage`, `DisputeDetailPage`.
**Vendor-free:** `DegradedBanner('vendor-unconfigured', 'STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET')`; disputes only originate at Stripe.
**Acceptance:** ACC-DSP-1 webhook upsert is idempotent; ACC-DSP-2 evidence submit calls Stripe with an idempotency key; ACC-DSP-3 evidence due < 72 h → ATTENTION activity and badge.

## revenue.tax — Tax & Compliance
**Target:** live · **Phase:** 4 (WP-4.7) · **Read:** `revenue.tax.read`
**Today:** three models without producers; vendors are env booleans; approve sets `Tenant.taxExempt` which nothing reads.
**Model:** `TaxRegistration`, `TaxExemption`; `TaxReturn` dropped (D10).

| Method | Path | Guard | Effect |
|---|---|---|---|
| GET | `/tax/overview` | R | Registrations, pending exemptions, vendor status (all arrays rendered) |
| GET/POST/PATCH/DELETE | `/tax/registrations[/:id]` | R / W:`revenue.tax.write` | CRUD |
| GET | `/tax/exemptions` | R | Queue |
| POST | `/tax/exemptions/:id/decision` | D:`revenue.tax.write` | APPROVE → `Tenant.taxExempt = true`, certificate URL; REJECT reason; REVOKE → false; tenant notified |
| POST | `/api/v1/tenants/me/tax-exemption` | tenant TENANT_ADMIN/FINANCE | Upload certificate (storage adapter) → `TaxExemption PENDING` |
| GET | `/api/v1/tenants/me/tax-exemption` | tenant | Status |

**Page:** `pillars/revenue/tax/` — `TaxOverviewPage`, `RegistrationsPage`, `ExemptionsPage`.
**Tenant touchpoint:** BillingTab "Tax exemption" section. **Consumer:** `PLATFORM` invoice creation and Stripe customer `tax_exempt` (when configured).
**Acceptance:** ACC-TAX-1 upload → approve → next `PLATFORM` invoice has 0 tax and an exemption note; ACC-TAX-2 revoke restores tax; ACC-TAX-3 registration CRUD audited; ACC-TAX-4 `/tax/returns` returns 404.

## revenue.recognition — Revenue Recognition
**Target:** deferred. `ComingSoonPage`: "Needs an accounting-system integration; not planned until an ADR names the source of truth." No routes, no models.

## revenue.commissions — Reseller Commissions
**Target:** deferred. Models dropped (D10), `/commissions*` routes and `revenue.commission-aggregation` job deleted (WP-4.0b). `ComingSoonPage`: "No reseller programme."

## revenue.analytics — Revenue Analytics
**Target:** live · **Phase:** 3 (WP-3.2) · **Read:** `revenue.analytics.read`
**Today:** static charts with `sampleRows`; MRR from literals.
**Routes:** `/revenue/analytics/{mrr-movement,cohorts,by-plan,forecast}` (R) per WP-3.2, plus `/metrics/overview`.
**Page:** `pillars/revenue/analytics/RevenueAnalyticsPage` with `MrrMovementChart`, `CohortTable`, `ByPlanChart`, `ForecastChart`.
**Acceptance:** ACC-REV-1 MRR movement for fixture events equals the hand-computed table; ACC-REV-2 cohort matrix for fixtures; ACC-REV-3 forecast is labelled "projection" with its method; ACC-REV-4 reconstructed periods are visually flagged.

---

# Customer

## customer.support — Support Desk
**Target:** live · **Phase:** 2 (WP-2.3) · **Read:** `customer.support.read`
**Today:** tickets real and tenant-produced, but no audience split; staff replies authored as a tenant user; internal notes visible to tenant staff (S11); new message doesn't bump `updatedAt`; reply email never sent; only "Create Linked Ticket" has UI.
**Model:** 0045 (D5).

| Method | Path | Guard | Effect |
|---|---|---|---|
| GET | `/support/tickets` | R | `audience=PLATFORM` only; filters status, priority, assignee, tenant, SLA breached; sort by `lastMessageAt`; cursor |
| GET | `/support/tickets/:id` | R | Ticket + all messages (incl. `STAFF_INTERNAL`) + linked ticket |
| POST | `/support/tickets` | W:`customer.support.write` | Staff opens a PLATFORM ticket for a tenant (proactive outreach); tenant notified |
| PATCH | `/support/tickets/:id` | W:`customer.support.write` | status, priority, category, `assignedPlatformUserId`; RESOLVED/CLOSED notify the tenant |
| POST | `/support/tickets/:id/messages` | W:`customer.support.write` | `authorType STAFF`, `visibility PUBLIC\|STAFF_INTERNAL`; PUBLIC → requester + admins notified (`support_reply_from_fauward`), `firstResponseAt` set once; bumps `updatedAt/lastMessageAt` in the same transaction |
| GET | `/support/sla` | R | Targets per priority (`config/support-sla.ts`) and current breaches |
| GET | `/support/macros` | R | Saved replies from `config/support-macros.ts` (read-only; editing is out of scope) |
| GET | `/customer360/:tenantId/tickets?audience=END_CUSTOMER` | R:`customer.support.read` | Read-only context, `PUBLIC`+`TENANT_INTERNAL` |
| GET/POST | `/api/v1/tenants/me/fauward-tickets` | tenant (any staff role) | List own PLATFORM tickets / create (subject, category, priority, body, shipmentId?) |
| GET/POST | `/api/v1/tenants/me/fauward-tickets/:id[/messages]` | tenant | Read thread (no `STAFF_INTERNAL`) / reply (`TENANT_USER`, `PUBLIC`) |
| POST | `/api/v1/support/tickets/:id/escalate-to-fauward` | tenant TENANT_ADMIN/MANAGER | Creates a linked PLATFORM ticket with a summary of the end-customer ticket |

**Page:** `pillars/customer/support/` — `TicketQueuePage` (views: mine, unassigned, breached, all), `TicketDetailPage` (thread, internal notes, assign, status, macros), `SlaPage`.
**Tenant touchpoint:** Help → "Contact Fauward support" (`HelpTicketsPage`, `HelpTicketDetailPage`); end-customer ticket "Escalate to Fauward" button; in-app + email on replies.
**Job:** `customer.support-sla-sweep` (15 min): newly breached tickets → ATTENTION activity + notification to the assignee (or `customer.support.write` holders if unassigned), once per ticket per breach.
**Vendor-free:** native.
**Acceptance:** ACC-SUP-1 tenant creates a PLATFORM ticket → console queue + staff notification + activity; ACC-SUP-2 staff PUBLIC reply appears to the tenant as "Fauward Support", email enqueued, `firstResponseAt` set; ACC-SUP-3 no tenant route ever returns `STAFF_INTERNAL`, and end customers never get `TENANT_INTERNAL` (S11); ACC-SUP-4 every message bumps `updatedAt` and `lastMessageAt`; ACC-SUP-5 escalation creates a linked ticket visible on both sides; ACC-SUP-6 console queue excludes END_CUSTOMER tickets; ACC-SUP-7 SLA breach notifies once.

## customer.360 — Customer 360
**Target:** live · **Phase:** 1 (WP-1.8; Activity/AI tabs P2) · **Read:** `customer.360.read`
**Today:** aggregate real; no tenant picker; one parent query; no tab boundaries/gates; header placeholders; health falls back to 78 with 3 fake factors; counts capped by `take`; Config dumps the whole tenant object.
**Routes (split per tab, each its own query):**

| Method | Path | Guard | Returns |
|---|---|---|---|
| GET | `/customer360/:tenantId/summary` | R:`customer.360.read` | identity, plan/effective plan, status, active suspensions, MRR, last login (max `User.lastLoginAt`), health score or `null`, `kycStatus`, open PLATFORM tickets count |
| GET | `/customer360/:tenantId/usage` | R:`customer.360.read` | `UsageRecord` 12 months, API usage, limits vs usage |
| GET | `/customer360/:tenantId/billing` | R:`revenue.invoices.read` | subscription, PLATFORM invoices, payments, dunning panel, save offers |
| GET | `/customer360/:tenantId/tickets` | R:`customer.support.read` | PLATFORM tickets + END_CUSTOMER counts |
| GET | `/customer360/:tenantId/health` | R:`customer.success.read` | latest score + inputs + 90-day history |
| GET | `/customer360/:tenantId/ai` | R:`customer.360.read` | `TenantAiUsage` by month/feature, `AiAgentRun` recent, `TenantAiLimit` (P2) |
| GET | `/customer360/:tenantId/audit` | R:`trust.audit.read` | tenant `AuditLog` + platform audit rows targeting the tenant, cursor |
| GET | `/customer360/:tenantId/people` | R:`customer.360.read` | users: role, status, invited/accepted, last login, MFA, locked (P2) |
| GET | `/customer360/:tenantId/config` | R:`platform.tenants.read` | structured settings, branding, domains, gateway status (P2), API keys (prefix, created, last used), webhooks (url, active, failure count) — secrets redacted |
| GET | `/customer360/:tenantId/activity` | R:`customer.360.read` | `PlatformActivity` for the tenant (P2) |
| GET | `/customer360/:tenantId/notes` | R:`customer.360.read` | `Tenant.internalNotes` (existing column); edits go through `PATCH /tenants/:id/internal-notes`; P2 adds `staff.note` activity entries as a running log |

**Page:** `pillars/customer/customer360/` — `Customer360IndexPage` (picker), `Customer360Page` with tabs Overview, Activity, Usage, Billing, Tickets, Health, AI, Audit, People, Config, Notes. Each tab: own query, own `ErrorBoundary`, own permission gate (access-denied state + "Request access" when denied; never hidden). Contextual panels (dunning, incidents, pipeline, attribution) inside Overview/Billing.
**Acceptance:** ACC-C360-1 (e2e) blocking one tab's API leaves the others working; ACC-C360-2 a tab without permission shows the access state; ACC-C360-3 header has real MRR and last login and no "placeholder" string; ACC-C360-4 no score → "Not yet scored"; ACC-C360-5 counts are real totals (count queries), not `take` lengths; ACC-C360-6 Config is structured and redacted; ACC-C360-7 every tenant-bearing row in `pillars/**` links here (TenantChip gate).

## customer.success — CS Console
**Target:** live · **Phase:** 4 (WP-4.8; scoring inputs WP-3.3) · **Read:** `customer.success.read`
**Today:** nightly score real but weights static, NPS hardcoded 10, `SupportVendorTicket` never written so the ticket factor is always full; playbook runs never executed.
**Model:** `TenantHealthScore` (0055), `CSPlaybook`, `CSPlaybookRun`.

| Method | Path | Guard | Effect |
|---|---|---|---|
| GET | `/success/overview` | R | Score distribution, movers, at-risk count |
| GET | `/success/at-risk` | R | score < 50 or down 2 consecutive weeks |
| GET | `/success/expansion` | R | usage > 80% of plan limits or feature-request signals |
| GET | `/success/health-scoring` | R | Weights, version, input definitions (single object) |
| POST | `/success/health-scoring/run` | W:`customer.success.write` | Enqueues the scoring job now |
| GET/POST/PATCH/DELETE | `/success/playbooks[/:id]` | R / W | Steps: `EMAIL_TENANT_ADMINS(template)`, `CREATE_PLATFORM_TICKET(subject, body)`, `NOTIFY_STAFF(permission, text)`, `WAIT(days)`; triggers `MANUAL`, `HEALTH_BELOW(n)`, `TRIAL_ENDING(days)`, `PAYMENT_FAILED` |
| POST | `/success/playbooks/:id/run` | W:`customer.success.write` | `CSPlaybookRun` for a tenant |
| GET | `/success/playbooks/:id/runs` | R | Run history with per-step results |

**Page:** `pillars/customer/success/` — `CsOverviewPage`, `AtRiskPage`, `ExpansionPage`, `PlaybooksPage`, `PlaybookEditorPage`, `PlaybookRunsPage`, `ScoringModelPage`.
**Tenant touchpoint:** playbook emails/tickets reach the tenant. **Jobs:** `customer.health-scoring` (fixed), `customer.playbook-executor` (10 min + trigger evaluation).
**Acceptance:** ACC-CS-1 fixture inputs produce the expected score; missing NPS renormalises weights; ACC-CS-2 ticket factor uses PLATFORM tickets (no `SupportVendorTicket` reference); ACC-CS-3 no fallback score anywhere; ACC-CS-4 a run executes steps in order, records each result, and is safe to re-run; ACC-CS-5 `HEALTH_BELOW` auto-starts at most once per tenant per 30 days.

## customer.feedback — NPS & Feedback
**Target:** live · **Phase:** 2 (WP-2.8) · **Read:** `customer.feedback.read`
**Today:** no route, no model, no tenant-side producer; no feature-request channel anywhere.
**Model:** 0048.

| Method | Path | Guard | Effect |
|---|---|---|---|
| GET | `/feedback` | R | Filters type, status, tenant, featureKey; NPS summary (score, promoters/passives/detractors by month) |
| GET | `/feedback/:id` | R | Item + comments |
| PATCH | `/feedback/:id` | W:`customer.feedback.write` | status, assignee; status change notifies the requester (`feedback_status_changed`) |
| POST | `/feedback/:id/comments` | W:`customer.feedback.write` | `visibleToTenant` toggle |
| POST | `/api/v1/tenants/me/feedback` | tenant | Create NPS / FEATURE_REQUEST / BUG / GENERAL |
| GET | `/api/v1/tenants/me/feedback` | tenant | Own items + tenant-visible comments |
| GET | `/api/v1/tenants/me/nps-eligibility` | tenant | `{ eligible }` for the current user |

**Page:** `pillars/customer/feedback/` — `FeedbackBoardPage` (by status), `FeedbackDetailPage`, `NpsPage`.
**Tenant touchpoint:** Help menu "Send feedback" / "Request a feature"; `PlanGate` "Request this feature" (prefills `featureKey`); `NpsPrompt` (in-app, dismissible); "My requests" list.
**Job:** `customer.nps-survey-dispatch` (daily): sets `NpsPromptState.eligibleAt` for users active ≥ 30 d with no NPS response or dismissal in 90 d. Prompt shown/dismissed/answered updates `lastPromptedAt`/`dismissedAt`/`lastRespondedAt`.
**Acceptance:** ACC-FB-1 a PlanGate request creates a FEATURE_REQUEST with `featureKey`, visible in the console; ACC-FB-2 status change notifies the requester; ACC-FB-3 an NPS response appears in the summary and in the next health score; ACC-FB-4 the prompt does not reappear within 90 days.

## customer.kb — Knowledge Base
**Target:** deferred. `ComingSoonPage`: "Customer docs live on the marketing site; internal runbooks live in Incident runbooks (platform.incidents)."

## customer.comms — Communications Hub
**Target:** live · **Phase:** 2 (WP-2.14) · **Read:** `customer.comms.read`
**Today:** `PlatformAnnouncement` real and read by the tenant banner; no edit/expire/delete UI (routes exist); no receipts; primary action is a `<span>`.
**Model:** 0049.

| Method | Path | Guard | Effect |
|---|---|---|---|
| GET | `/comms/announcements` | R | With receipts summary (targeted users, viewed, dismissed, CTA clicks) |
| POST | `/comms/announcements` | W:`customer.comms.send` | Type, title, body, targeting (all / tenantIds / planTiers), CTA, dismissible, `publishedAt` (schedule), `expiresAt`, `alsoEmail` (one email per targeted tenant admin via the queue) |
| GET | `/comms/announcements/:id/audience-preview` | R | Tenant and user counts for the targeting |
| PATCH | `/comms/announcements/:id` | W:`customer.comms.send` | Edit; tenant cache refreshes within 60 s |
| POST | `/comms/announcements/:id/archive` | W:`customer.comms.send` | `archivedAt`; disappears from tenants |
| DELETE | `/comms/announcements/:id` | D:`customer.comms.send` | Only when no receipts exist; else 409 → archive |
| GET | `/comms/delivery-log` | R | `NotificationLog` (redacted); `?sensitive=true` is D with reason |
| POST | `/api/v1/tenants/me/announcements/:id/receipt` | tenant | `{ action: VIEWED \| DISMISSED \| CTA_CLICKED }` upsert |

**Page:** `pillars/customer/comms/` — `AnnouncementsPage`, `AnnouncementEditorPage` (with live preview of the tenant banner), `AnnouncementDetailPage` (receipts), `DeliveryLogPage`.
**Tenant touchpoint:** `AnnouncementBanner` reports receipts. **Vendor-free:** banners always; emails `SKIPPED` without SendGrid.
**Note for implementation/testing:** use seeded test tenants and Mailpit on the VM. Never send announcement emails to real tenants from a dev or staging run.
**Acceptance:** ACC-COM-1 targeted announcement shows only for targeted tenants; ACC-COM-2 one receipt per user per action; ACC-COM-3 edit/archive visible to the tenant within 60 s; ACC-COM-4 `alsoEmail` enqueues one email per targeted admin; ACC-COM-5 "New announcement" opens a working dialog.

## customer.qbr — QBR Center
**Target:** live · **Phase:** 4 (WP-4.9) · **Read:** `customer.qbr.read`
**Today:** generate writes `'<h1>QBR</h1>'`; templates have no writer.
**Model:** 0061 (`QBRDeck.sections/jobId/generatedAt/error`); `QBRTemplate` dropped.

| Method | Path | Guard | Effect |
|---|---|---|---|
| GET | `/qbr` | R | Decks + tenants due for a QBR |
| GET | `/qbr/tenants/:tenantId` | R | Decks for one tenant |
| POST | `/qbr/tenants/:tenantId/generate` | W:`customer.qbr.write` | Enqueues `customer.qbr-generate` (`jobId` = tenant+period) |
| GET | `/qbr/decks/:id` | R | Sections, HTML, status |
| PATCH | `/qbr/decks/:id` | W:`customer.qbr.write` | Notes, status DRAFT→READY |
| POST | `/qbr/decks/:id/share` | W:`customer.qbr.write` | Tenant admins notified with a link to `GET /api/v1/tenants/me/qbr/:id` |
| GET | `/qbr/decks/:id/download` | R | HTML (PDF if repo PDF tooling exists) |

**Page:** `pillars/customer/qbr/` — `QbrListPage`, `QbrTenantPage`, `QbrDeckPage`.
**Job:** `customer.qbr-generate`: sections = usage, shipments & SLA, exceptions, support, billing & MRR, health, AI usage, risks & opportunities; empty section → "No data for this period".
**Acceptance:** ACC-QBR-1 fixture tenant deck has real numbers in every section; ACC-QBR-2 empty sections are labelled; ACC-QBR-3 re-generating the same period dedupes; ACC-QBR-4 share lets tenant admins view the deck.

## customer.onboarding — Onboarding Tracker
**Target:** live · **Phase:** 2 (WP-2.17) · **Read:** `customer.onboarding.read`
**Today:** funnel reads `Tenant.onboardingSteps`, which the tenant portal marks done on every "Next"; the steps themselves are simulated; the real checklist (`usage.service.ts:81`) is never shown.

| Method | Path | Guard | Effect |
|---|---|---|---|
| GET | `/onboarding/funnel` | R | Steps: account created → branding set → payment gateway verified → first real shipment → teammate joined → domain verified → first paid invoice; counts and step conversion; cohort filter by signup month |
| GET | `/onboarding/tenants` | R | `?stuckAt=<step>&stuckDays=7` |
| POST | `/onboarding/tenants/:id/nudge` | W:`customer.success.write` | `onboarding_nudge` email + in-app, max once per 7 days per tenant |
| GET | `/api/v1/onboarding/checklist` | tenant | Server-computed checklist (single source) |

**Producer:** events set `Tenant.onboardingSteps[step] = timestamp` (shipment created, gateway verified, invite accepted, branding saved, domain verified, invoice paid). The tenant wizard never writes steps directly.
**Page:** `pillars/customer/onboarding/` — `OnboardingFunnelPage`, `StuckTenantsPage`.
**Tenant touchpoint:** onboarding steps call real endpoints (WP-2.0/2.17).
**Acceptance:** ACC-ONB-1 clicking "Next" without doing the step does not complete it; ACC-ONB-2 creating the first real shipment completes the step and emits activity; ACC-ONB-3 funnel counts match a fixture; ACC-ONB-4 nudge delivers once per 7 days.

---

# Trust

## trust.iam — Employee IAM
**Target:** live · **Phase:** 0 (fixes WP-0.4), UI polish P1 · **Read:** `trust.iam.read`
**Today:** real, but self-grant check compares different ID spaces (S3); suspended staff keep access (S4); revoked legacy roles return (S5); TOTP plaintext (S10); "Google SSO callback" is an authenticated upsert, not OAuth; `seedStaffRoles` runs per permission check; assigns on select-change with hardcoded reasons; create form shown without write permission.

| Method | Path | Guard | Effect |
|---|---|---|---|
| GET | `/iam/users[/:id]` | R | Staff with roles, status, MFA, last login, sessions |
| POST | `/iam/users` | W:`trust.iam.write` | Create staff + `PlatformUser`; they enrol MFA at first login |
| POST | `/iam/users/:id/suspend` · `/offboard` · `/reactivate` | D:`trust.iam.write` | S4 propagation + session revoke |
| POST | `/iam/users/:id/mfa/reset` | D:`trust.iam.write` (not self) | Clears MFA, revokes sessions |
| POST | `/iam/role-assignments` | D:`trust.iam.write` (+`trust.iam.root` + hardware assertion for ROOT) | Not to self (StaffUser id); optional `expiresAt` |
| DELETE | `/iam/role-assignments/:id` | D:`trust.iam.write` | Revocation sticks (S5) |
| GET | `/iam/roles[/:id]`, `/iam/permissions`, `/iam/role-catalog`, `/iam/groups` | R | Read-only catalogue (role-catalog now used by the assign dialog) |
| — | `/iam/sso/google/callback` | — | **Deleted.** TOTP is the only staff factor until an ADR introduces real OIDC |

**Page:** existing `pillars/trust/iam/*` with `ActionDialog` for every mutation (confirm + free-text reason), create form gated by `trust.iam.write`.
**Acceptance:** ACC-IAM-1…5 (Phase 0) plus ACC-IAM-6 role assignment needs confirm + reason (no assign-on-select); ACC-IAM-7 the SSO callback route returns 404; ACC-IAM-8 `/auth/me` and permission checks never call `staffRole.upsert`; ACC-IAM-9 `POST /iam/users/:id/totp-enrollment` returns 404 and no API response ever contains another user's TOTP secret.

## trust.jit — Just-in-Time Access
**Target:** live · **Phase:** 1 (WP-1.7) · **Read:** `trust.jit.request`
**Today:** enforced on `/api/internal` only; `trust.jit.request` held by 4 roles so `JITGate` 403s for most; approvals not reflected in `/auth/me`; request page calls `/jit/sessions/active`; `onRequest` errors uncaught; manifest gate wrong.

| Method | Path | Guard | Effect |
|---|---|---|---|
| POST | `/jit/requests` | W:`trust.jit.request` | permission, reason ≥ 20, `durationMinutes ≤ 240` (ROOT ≤ 60 + hardware assertion); approvers notified |
| GET | `/jit/requests/pending` | R:`trust.jit.approve` | Queue |
| POST | `/jit/requests/:id/approve` | D:`trust.jit.approve` (≠ requester) | Grant active until `expiresAt`; requester notified |
| POST | `/jit/requests/:id/deny` | W:`trust.jit.approve` | Reason shown to requester |
| GET | `/jit/sessions/active` | R:`trust.jit.approve` | All active grants |
| GET | `/jit/sessions/my` | R:`trust.jit.request` | Own requests + grants |
| POST | `/jit/sessions/:id/revoke` | W:`trust.jit.approve` (or own) | Ends grant |

**Page:** `pillars/trust/jit/` — `JitRequestPage`, `JitPendingPage`, `JitActivePage`, `JitHistoryPage`; `JITGate` dialog everywhere a permission is missing.
**Acceptance:** ACC-JIT-1 every role can request; ACC-JIT-2 requester cannot approve own; ACC-JIT-3 approval shows in `/auth/me` ≤ 60 s and unlocks the matching `/api/internal` route; ACC-JIT-4 expiry revokes; ACC-JIT-5 deny reason reaches the requester; ACC-JIT-6 request errors are displayed.

## trust.audit — Audit Log
**Target:** live · **Phase:** 1 (UI, WP-1.9), chain verified Phase 5 (WP-5.1) · **Read:** `trust.audit.read`
**Today:** real read side; two hash schemes; find-then-create race; duplicate rows from middleware + explicit writes; UI queries per keystroke, stuck at 50.

| Method | Path | Guard | Effect |
|---|---|---|---|
| GET | `/audit` | R | Filters actor, action, target, tenant, date; cursor |
| GET | `/audit/:id` | R | Entry with before/after |
| GET | `/audit/tenant-events` | R:`trust.audit.read` | Tenant `AuditLog` search; `tenantId` required unless caller has `trust.audit.export` (WP-2.16) |
| POST | `/audit/export` | D:`trust.audit.export` | CSV/JSON of the filtered set; the export itself is audited |
| POST | `/audit/verify` | W:`trust.audit.export` | Runs the verifier (P5 batch version) |
| GET | `/audit/verify/runs` | R | Last verification results (P5) |

**Page:** existing `pillars/trust/audit/*` (`AuditLogPage`, `AuditTimelinePage`, `AuditExportPage`, `AuditIntegrityPage`) + `TenantEventsPage`.
**Acceptance:** ACC-AUD-1 search sends ≤ 1 request per 300 ms of typing; ACC-AUD-2 pagination beyond 50; ACC-AUD-3 filters combine correctly; ACC-AUD-4 export output + its own audit row; ACC-AUD-5…8 Phase 5.

## trust.compliance — Compliance Operations
**Target:** live · **Phase:** 2 (WP-2.5) · **Read:** `trust.compliance.dsar.read`
**Today:** tenant produces DSARs (ACCESS only); `gather` inserts a QUEUED export nothing processes; `deliver` writes `https://signed.example.fauward.internal/...`, which is shown to tenants; legal hold enforced on DELETE but never released; `/dpa` and `/subpoenas` show the DSAR queue.
**Model:** 0050; `DSARRequest`, `DSARTransition`, `ComplianceExport`, `ExportBlob`, `LegalHold`.

| Method | Path | Guard | Effect |
|---|---|---|---|
| GET | `/compliance/dsar` | R | Status, type, due, overdue |
| GET | `/compliance/dsar/:id` | R | Transitions, exports, subject |
| POST | `/compliance/dsar` | W:`trust.compliance.dsar.write` | Staff-logged request (received by email) |
| POST | `/compliance/dsar/:id/verify-identity` | W | `identityVerifiedAt`, transition |
| POST | `/compliance/dsar/:id/gather` | W | Enqueues `trust.dsar-gather` |
| POST | `/compliance/dsar/:id/approve` | W | After staff review of the export |
| POST | `/compliance/dsar/:id/deliver` | D:`trust.compliance.dsar.deliver` | Download token (hash stored), `DELIVERED`, tenant notified (`dsar_ready`) |
| POST | `/compliance/dsar/:id/erase` | D:`trust.compliance.dsar.deliver` | ERASURE only; 409 under legal hold; enqueues `trust.dsar-erase` |
| POST | `/compliance/dsar/:id/close` | W | `closedAt` |
| GET/POST | `/compliance/legal-holds` | R:`…legal-hold.read` / D:`…legal-hold.write` | Create (tenant-specific in P2; global semantics P5) |
| POST | `/compliance/legal-holds/:id/release` | D:`…legal-hold.write` | `releasedBy/At/releaseReason`, status RELEASED |
| GET | `/compliance/exports` | R | Export records |
| POST/GET | `/api/v1/tenants/me/dsar` | tenant TENANT_ADMIN | Create (ACCESS, ERASURE, PORTABILITY, RECTIFICATION; subject email) / list with status |
| GET | `/api/v1/tenants/me/dsar/:id/download?token=` | tenant TENANT_ADMIN + token | Streams the export once per token issue; records `downloadedAt` |

**Jobs:** `trust.dsar-gather` walks `config/personal-data-registry.ts` (per model: subject match fields, export fields, erase strategy) and writes a JSON bundle via the storage adapter; `trust.dsar-erase` anonymises per registry (keeps legally required financial records with PII replaced), sets `erasureCompletedAt`.
**Page:** `pillars/trust/compliance/` — `DsarQueuePage`, `DsarDetailPage` (state machine actions), `LegalHoldsPage`, `ExportsPage`. Manifest drops `/dpa` and `/subpoenas`.
**Tenant touchpoint:** `PrivacyTab` request types + status + download.
**Acceptance:** ACC-DSAR-1 tenant can request ERASURE; ACC-DSAR-2 gather exports exactly the subject's rows across registry models and nothing from other subjects or tenants; ACC-DSAR-3 download works only with auth + token; `grep "example.fauward.internal"` finds nothing; ACC-DSAR-4 erasure anonymises registry fields and is blocked by an active hold; ACC-DSAR-5 overdue requests raise ATTENTION activity; ACC-DSAR-6 release records who/when/why and unblocks.

## trust.safety — Trust & Safety
**Target:** live · **Phase:** 2 (WP-2.4; suspension unification WP-1.3) · **Read:** `trust.safety.read`
**Today:** Radar webhook produces fraud signals; decision suspends without reason/timestamp; suspensions list sees only fraud records; appeal approve lifts only if the UI sends `suspensionId` (it never does); AUP and rules return `[]`; tenant never told.

| Method | Path | Guard | Effect |
|---|---|---|---|
| GET | `/safety/signals` | R | Fraud + AUP signals (`category`), filters |
| POST | `/safety/signals` | W:`trust.safety.suspend` | Manual signal / AUP report |
| POST | `/safety/signals/:id/decision` | D:`trust.safety.suspend` | DISMISS / WARN (tenant notified) / SUSPEND (D3, `FRAUD` or `AUP`, `sourceRef`) |
| GET | `/safety/suspensions` | R | All `SuspensionRecord` sources |
| POST | `/safety/suspensions/:id/lift` | D:`trust.safety.suspend` | `liftSuspension` |
| GET | `/safety/appeals[/:id]` | R | Appeal + its suspension + tenant context |
| POST | `/safety/appeals/:id/decision` | D:`trust.safety.suspend` | APPROVE → lift via APPEAL; REJECT → resolution visible to tenant; REQUEST_INFO → question visible, tenant can reply |
| GET | `/safety/rules` | R | Code-defined auto-rules (Radar thresholds, anomaly thresholds, dunning suspend day) read-only |
| POST | `/api/v1/tenants/me/suspension-appeal` | tenant (exists) | `suspensionId` set server-side; staff notified |
| POST | `/api/v1/tenants/me/suspension-appeal/:id/reply` | tenant | Reply to REQUEST_INFO |

**Page:** `pillars/trust/safety/` — `SignalsPage`, `SuspensionsPage`, `AppealsPage`, `AppealDetailPage`, `RulesPage`.
**Tenant touchpoint:** `SuspendedOverlay` shows reason, appeal status, resolution/question.
**Acceptance:** ACC-SAF-1 appeal → staff notification + activity; ACC-SAF-2 approve lifts the linked suspension and notifies; tenant becomes ACTIVE if no other cause; ACC-SAF-3 reject shows the resolution in the overlay; ACC-SAF-4 SUSPEND decision creates a record with `suspendedAt` and reason; ACC-SAF-5 suspensions list includes PLATFORM, DUNNING, FRAUD sources; ACC-SAF-6 AUP and rules pages render real data.

## trust.kyc — KYC & Sanctions
**Target:** live · **Phase:** 4 (WP-4.10) · **Read:** `trust.kyc.read`
**Today:** Persona/ComplyAdvantage gated; monthly rescreen rows never sent; `Tenant.kycStatus` written, never read.
**Model:** 0060.

| Method | Path | Guard | Effect |
|---|---|---|---|
| GET | `/kyc/reviews` | R | Queue by status |
| POST | `/kyc/reviews` | W:`trust.kyc.approve` | Open review (provider `manual`, or `persona` → inquiry); tenant asked for documents |
| POST | `/kyc/reviews/:id/evidence` | W:`trust.kyc.approve` | Attach staff-collected evidence |
| POST | `/kyc/reviews/:id/decision` | D:`trust.kyc.approve` | APPROVED / REJECTED + reason → `Tenant.kycStatus` |
| GET | `/kyc/screenings` | R | Sanctions + PEP (`matchType`) |
| POST | `/kyc/screenings/:id/decision` | D:`trust.kyc.approve` | CLEAR / MATCH; MATCH → safety signal (category LEGAL) for a suspension decision |
| POST | `/api/v1/tenants/me/verification/documents` | tenant TENANT_ADMIN | Upload documents to the open review |
| Webhooks | Persona, ComplyAdvantage | HMAC (exist) | Update review/screening |

**Consumer:** ENTERPRISE plan (override, plan change, contract) requires `kycStatus = APPROVED` → 409 `KYC_REQUIRED`. C360 shows KYC status.
**Page:** `pillars/trust/kyc/` — `KycQueuePage`, `KycReviewPage`, `ScreeningsPage`.
**Job:** `trust.kyc-rescreen-monthly` (renamed; P4-4). **Vendor-free:** manual queue.
**Acceptance:** ACC-KYC-1 manual approve sets `kycStatus` and audits; ACC-KYC-2 ENTERPRISE override blocked without approval; ACC-KYC-3 monthly rescreen creates PENDING screenings that staff decide; ACC-KYC-4 tenant upload attaches to the review; ACC-KYC-5 Persona configured → inquiry created (spy) and webhook updates.

## trust.secrets — Secret Management
**Target:** live · **Phase:** 4 (WP-4.12) · **Read:** `trust.secrets.read`
**Today:** `SecretCredential`/`SecretAccessLog` have no producer; Doppler never called.
**Model:** 0059; `SecretAccessLog` dropped (audit log instead).

| Method | Path | Guard | Effect |
|---|---|---|---|
| GET | `/secrets` | R | Inventory: name, envName, configured, owner, fingerprint, lastRotatedAt, policy, status |
| GET | `/secrets/expiring` | R | Due within 14 days or overdue |
| PATCH | `/secrets/:id` | W:`trust.secrets.write` | Owner, `rotateEveryDays`, notes |
| POST | `/secrets/:id/mark-rotated` | D:`trust.secrets.write` | Records manual rotation (when the fingerprint can't be observed) |
| GET | `/secrets/:id/audit` | R | `PlatformAuditLog` for the credential |

**Job:** `trust.secret-inventory` (boot + daily) over `config/secret-registry.ts`; fingerprint change → `lastRotatedAt` + activity; overdue → ATTENTION activity + owner notification.
**Page:** `pillars/trust/secrets/` — `SecretsInventoryPage`, `ExpiringPage`, `SecretDetailPage`.
**Vendor-free:** env inventory; Doppler adapter optional.
**Acceptance:** ACC-SECR-1 inventory matches env presence; ACC-SECR-2 no API response or log line contains a secret value (test seeds known values and greps); ACC-SECR-3 fingerprint change sets `lastRotatedAt` + activity; ACC-SECR-4 expiring list is correct; ACC-SECR-5 PATCH requires write (P0-1 regression).

## trust.security — Security Monitoring
**Target:** live · **Phase:** 4 (WP-4.11; enforcement WP-5.4) · **Read:** `trust.security.read`
**Today:** anomalies and auto IP blocks from the worker; staff logins real; session revoke works; IP blocks never enforced.

| Method | Path | Guard | Effect |
|---|---|---|---|
| GET | `/security/anomalies` | R | Filters type/severity/status |
| POST | `/security/anomalies/:id/resolve` | W:`trust.security.write` | Resolution note |
| GET | `/security/logins` | R | Staff login attempts (+ tenant failed logins if recorded) |
| GET/POST/DELETE | `/security/ip-blocks[/:id]` | R / D:`trust.security.write` | Scope, expiry (enforced P5) |
| GET | `/security/sessions` | R | Active staff sessions |
| POST | `/security/sessions/:id/revoke` | D:`trust.security.write` | Revoke |

**Page:** `pillars/trust/security/` — `AnomaliesPage`, `LoginsPage`, `IpBlocksPage`, `SessionsPage`.
**Acceptance:** ACC-SECM-1 resolve recorded; ACC-SECM-2 IP block create with scope/expiry (ACC-IP in P5); ACC-SECM-3 revoking a session makes that staff member's next request 401; ACC-SECM-4 lists paginate.

---

# GTM

All GTM metrics exclude tenants with `status DEMO`.

## gtm.pipeline — Sales Pipeline
**Target:** live · **Phase:** 4 (WP-4.18) · **Read:** `gtm.pipeline.read`
**Today:** `SalesDeal` no producer; HubSpot flag only; `/pipeline/:dealId` renders "No records".

| Method | Path | Guard | Effect |
|---|---|---|---|
| GET | `/pipeline` | R | Deals by stage, filters owner/close month |
| POST | `/pipeline` | W:`gtm.pipeline.write` | Create deal |
| GET | `/pipeline/:dealId` | R | Single deal |
| PATCH | `/pipeline/:dealId` | W:`gtm.pipeline.write` | Stage, amount, probability, close date, owner, tenant link |
| GET | `/pipeline/forecasting` | R | Σ amount × probability by close month |
| POST | `/pipeline/import/hubspot` | W:`gtm.pipeline.write` | Only when configured; nightly job does the same |

**Page:** `pillars/gtm/pipeline/` — `PipelineBoardPage`, `DealDetailPage`, `ForecastPage`.
**Acceptance:** ACC-PIPE-1 CRUD audited; ACC-PIPE-2 forecast matches fixture; ACC-PIPE-3 HubSpot unconfigured hides import with a banner; ACC-PIPE-4 a won deal linked to a tenant shows in the C360 Overview panel.

## gtm.trials — Trial Management
**Target:** live · **Phase:** 4 (WP-4.14) · **Read:** `gtm.trials.read`
**Today:** `TrialActivation` real (worker); extension approve never touches `Subscription.trialEnd`; extension requests have no producer.

| Method | Path | Guard | Effect |
|---|---|---|---|
| GET | `/trials` | R | Trialing tenants with activation score, days left |
| GET | `/trials/expiring` | R | ≤ 7 days |
| GET | `/trials/:tenantId` | R | Single tenant (fixes "No records") |
| GET | `/trials/extensions` | R | Requests |
| POST | `/trials/extensions/:id/decision` | D:`gtm.trials.extend` | APPROVE → `trialEnd += days`, Stripe `trial_end` if configured, `SubscriptionEvent TRIAL_EXTENDED`; tenant notified |
| POST | `/trials/:tenantId/extend` | D:`gtm.trials.extend` | Proactive extension |
| POST | `/api/v1/tenants/me/trial-extension-request` | tenant TENANT_ADMIN | `days ≤ 14`, reason; one pending per tenant |

**Page:** `pillars/gtm/trials/` — `TrialsPage`, `ExpiringPage`, `ExtensionsPage`, `TrialDetailPage`.
**Tenant touchpoint:** trial banner "Request more time" + status.
**Acceptance:** ACC-TRL-1 request → approve → `trialEnd` moves and the tenant banner updates; ACC-TRL-2 one pending request per tenant; ACC-TRL-3 Stripe configured → `trial_end` updated (spy).

## gtm.demos — Demo Environments
**Target:** live · **Phase:** 4 (WP-4.15) · **Read:** `gtm.demos.read`
**Today:** creates a `Tenant` with no users (unusable); `shareTokenHash` consumed nowhere; templates hardcoded.

| Method | Path | Guard | Effect |
|---|---|---|---|
| GET | `/demos` | R | Active/expired demos |
| POST | `/demos` | W:`gtm.demos.write` | Template, prospect name, `expiresInDays ≤ 30` → `Tenant{status DEMO}`, admin user (one-time password returned once), seeded demo data, share token |
| GET | `/demos/:id` | R | Single |
| POST | `/demos/:id/extend` · `/share-link` | W:`gtm.demos.write` | Extend expiry / rotate token |
| DELETE | `/demos/:id` | D:`gtm.demos.write` | Teardown now — only for `status DEMO` tenants |
| GET | `/demos/templates` | R | Code-defined templates |
| POST | `/api/v1/auth/demo/exchange` | public, rate limited | Share token → session as the demo admin (demo tenant only) |

**Tenant touchpoint:** tenant portal `/demo/:token` route + "Demo environment — expires …" banner.
**Job:** `gtm.demo-expiry` (exists) tears down expired demos (DEMO tenants only).
**Acceptance:** ACC-DEMO-1 a created demo is usable with the returned credentials; ACC-DEMO-2 share link works until rotated/expired; ACC-DEMO-3 teardown refuses non-DEMO tenants; ACC-DEMO-4 demo data excluded from MRR, health, funnel and attribution.

## gtm.contracts — CPQ & Contracts
**Target:** live · **Phase:** 4 (WP-4.19) · **Read:** `gtm.contracts.read`
**Today:** DocuSign envelope sent with no document or recipients; `/discounts` filters on a status nothing sets; `MsaAgreement`/`ContractApproval` no writer.

| Method | Path | Guard | Effect |
|---|---|---|---|
| GET/POST | `/contracts/quotes` | R / W:`gtm.contracts.write` | Quotes |
| GET/PATCH | `/contracts/quotes/:id` | R / W | Single (fixes "No records"); edit only in DRAFT |
| POST | `/contracts/quotes/:id/submit` | W | Needs approval if discount > threshold or term > 24 months → `CustomContract(DRAFT)` + `ContractApproval(PENDING)` |
| POST | `/contracts/approvals/:id/decision` | D:`gtm.contracts.discount.large` | APPROVED/REJECTED with conditions |
| POST | `/contracts/quotes/:id/send` | W | DocuSign with generated quote PDF + signer(s) when configured; else `SENT` + PDF download |
| POST | `/contracts/quotes/:id/accept` | D:`gtm.contracts.write` | Manual signed-PDF upload (storage adapter) → `MsaAgreement`, `CustomContract ACTIVE`, `PricingOverride ACTIVE` |
| GET | `/contracts/msas` | R | Agreements with renewal dates |
| GET | `/contracts/discounts` | R | Quotes with discount by real status |
| POST | `/contracts/webhooks/docusign` | HMAC (exists) | Completed → accept flow |

**Page:** `pillars/gtm/contracts/` — `QuotesPage`, `QuoteEditorPage`, `ApprovalsPage`, `MsasPage`, `DiscountsPage`.
**Acceptance:** ACC-CPQ-1 a 25% discount needs a `discount.large` approver; ACC-CPQ-2 accept creates MSA + contract + pricing override and the tenant's MRR reflects it; ACC-CPQ-3 DocuSign envelope includes a document and ≥ 1 signer (spy); ACC-CPQ-4 discounts view groups by real status.

## gtm.partners — Partner Portal
**Target:** deferred. Models dropped (D10); routes deleted. `ComingSoonPage`: "No partner programme."

## gtm.attribution — Marketing Attribution
**Target:** live · **Phase:** 4 (WP-4.16) · **Read:** `gtm.attribution.read`
**Today:** `MarketingAttribution` no producer; `/funnel` returns `[]`.
**Model:** 0061.
**Producer:** `apps/frontend` middleware sets `fw_attr` (first touch: utm_*, referrer, landing page, first seen; 90-day cookie, first-party). The signup form sends it with `POST /api/v1/auth/register`; the backend writes one `MarketingAttribution` row (`touchType FIRST_TOUCH`) for the new tenant; no cookie → `source: 'direct'`.

| Method | Path | Guard | Returns |
|---|---|---|---|
| GET | `/attribution/summary` | R | Signups, activated, paid by source/medium, date range |
| GET | `/attribution/campaigns` | R | By `utmCampaign` |
| GET | `/attribution/landing-pages` | R | By landing page |
| GET | `/attribution/funnel` | R | signup → activated (TrialActivation score ≥ threshold) → paid (Subscription ACTIVE) |

**Page:** `pillars/gtm/attribution/` — `AttributionPage` (tabs).
**Acceptance:** ACC-ATT-1 register with the cookie stores UTM fields; without → `direct`; ACC-ATT-2 funnel matches fixture; ACC-ATT-3 campaign grouping correct; ACC-ATT-4 DEMO tenants excluded.

## gtm.pricing — Pricing Experiments
**Target:** deferred. Model dropped; `/pricing/*` routes deleted. `ComingSoonPage`: "No experimentation platform; plan catalogue lives in `planService`."

## gtm.handoff — Sales Handoff
**Target:** live · **Phase:** 4 (WP-4.17) · **Read:** `gtm.handoff.read`
**Today:** `SalesHandoff` no producer; templates hardcoded.
**Producer:** `SubscriptionEvent` with `fromStatus TRIALING → toStatus ACTIVE` (or first paid plan) creates one `SalesHandoff` with the code-defined checklist; linked to a won `SalesDeal` if one exists.

| Method | Path | Guard | Effect |
|---|---|---|---|
| GET | `/handoff/queue` | R | PENDING_SALES / PENDING_CS |
| GET | `/handoff/won` | R | Recent conversions |
| GET/PATCH | `/handoff/:id` | R / W:`gtm.handoff.write` | Assign CSM (notified), status PENDING_SALES → PENDING_CS → ACCEPTED → COMPLETED, checklist items |
| GET | `/handoff/templates` | R | Code-defined checklist |

**Page:** `pillars/gtm/handoff/` — `HandoffQueuePage`, `HandoffDetailPage`, `WonPage`.
**Acceptance:** ACC-HO-1 a conversion creates exactly one handoff; ACC-HO-2 assign/accept/complete are audited and show in C360; ACC-HO-3 the assigned CSM gets a staff notification.

