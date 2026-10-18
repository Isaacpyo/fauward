# 00 — Decisions

Resolves the ten decisions in re-audit §9.1. Each one is binding for every phase. Where a decision adds a model, route or service, the detail is in `01-architecture.md`, `02-data-model.md` or `20-service-catalogue.md`.

---

## Code-vs-audit corrections (verified 2026-10-17 at `0a6c601`)

The re-audit's line references were spot-checked and hold. These findings differ from, or add to, the re-audit. The code wins.

| # | Re-audit said | Code says | Effect on spec |
|---|---|---|---|
| C1 | §5 #14: `notifications.worker.ts:184-245` "only logs"; nothing sends | The worker sends: it creates the `NotificationLog`, calls `sendEmail`/`sendSms` and marks SENT/FAILED. The defect is the ~20 call sites that write `NotificationLog { status: 'QUEUED' }` directly and never enqueue (`appeals.routes.ts:51`, `console-phases.routes.ts:637,912`, `payments/billing.service.ts:11,27,39,57`, `super-admin.routes.ts:160`, `auth.service.ts:502,582`, `crm.routes.ts:263`, `driver.routes.ts:322`, `finance.routes.ts:67,282,360`, `payments.routes.ts:372,398`) | D6 reuses the existing queue and worker instead of building a new dispatcher |
| C2 | D3 lists four suspension paths | There is a fifth: Stripe `invoice.payment_failed` → `handleDunningEvent` (`payments/billing.service.ts:22-25`) sets `SUSPENDED` on attempt 2 with no reason, no `suspendedAt`, no `SuspensionRecord`, and moves to `CANCELLED` after 30 days | D3 covers five callers |
| C3 | — | `POST /api/v1/platform/auth/mfa/verify` re-signs the access token without the `permissions` claim (`platform.routes.ts:183`) | Fixed in WP-0.1 |
| C4 | B5 lists the two middlewares | Region approve/reject also re-checks the legacy role map inline (`platform.routes.ts:566-567`) | Removed in WP-1.1 |
| C5 | D7 option (a) "projection fed by `OutboxEvent`" | `OutboxEvent` has no `tenantId` and only 8 producers, all shipment/tenant lifecycle | D7 writes `PlatformActivity` directly; outbox only projects the existing shipment/tenant events |
| C6 | — | `/api/internal/*` and `/api/v1/platform/*` resolve to `systemContext()` with `isSuperAdmin: true` (`tenant.resolver.ts:190`), so the Prisma tenant middleware (`plugins/prisma.ts:31-36`) is bypassed for every console query | Architecture §7: console routes must scope by `tenantId` explicitly |
| C7 | — | `TenantSettings.paymentGatewayKey` and `webhookSecret` are plaintext columns, and there is no field-encryption helper in the backend | One `field-encryption` service (architecture §9) for TOTP secrets, gateway keys and webhook secrets |
| C8 | — | `IncidentRecord.vendorId` is required and `@unique`; native incidents cannot be created without it | Migration makes it optional (`02-data-model.md` 0056) |
| C9 | — | The tenant portal already has `ImpersonateCallbackPage` reading `?token=` and its own `ImpersonationBanner` | WP-0.5 changes the transport to a one-time code in the URL fragment; it does not build a new page |
| C10 | — | The main checkout's `apps/backend/.env` `DATABASE_URL`/`DIRECT_URL` point at the Supabase cloud pooler (`aws-1-eu-central-2.pooler.supabase.com`), and `vm-slot.sh env` only rewrites `localhost` ports, so a worktree with copied env files would still migrate the cloud database | All implementation runs in a worktree whose env files are sanitised by `console-run/safe-env.mjs` (DB → VM slot, SendGrid/Twilio/Supabase service keys blanked) |
| C11 | Migration labels 0036–0038 for Phase 0 | `0036_return_fees` already exists on `master` | Real numbers shift by one: `0037_console_mfa`, `0038_impersonation_hardening`, `0039_refund_integrity`; later labels shift at creation (index in `02-data-model.md` updated) |
| C12 | WP-0.1: IAM create "encrypt on every write path" | `POST /iam/users` set `mfaEnabled: true` for ROOT grantees without any secret (an account that could never pass MFA); `PATCH /iam/users/:id` let admins flip `mfaEnabled` directly | Both write `mfaEnabled: false`; enrolment only via self-service `/auth/mfa/enroll/*`, reset only via `/iam/users/:id/mfa/reset` |
| C13 | Architecture §9.1: env vars documented in `apps/backend/.env.example` | The repo has one `.env.example` at the root | New variables are documented in the root `.env.example` |
| C14 | §2.6 backfill is the only plaintext path | Verify also accepts a legacy plaintext secret once and re-encrypts it on success, so a deploy before the backfill does not lock staff out | Backfill still required; verify path is belt-and-braces |
| C15 | WP-0.1 rate limit 5/min per session on verify | `@fastify/rate-limit` keys before the session is authenticated | Key = session id from the (verified) access cookie, falling back to client IP |

Add a row here whenever implementation finds the spec or audit wrong.

---

## D1 — Manifest truth

**Decision.** The manifest is the single source of truth for what the console offers. It drives the sidebar, command palette, pillar overview, router registration and badges.

- `PillarServiceManifest` gains `status: 'live' | 'preview' | 'deferred'`, `livePhase: 0..5 | null`, `routes: string[]` (every path the service owns) and `badgeKey` limited to keys with a real backend (`architecture §6.4`).
- `live`: normal sidebar entry. Must meet the definition of done (`01-architecture.md` §12).
- `preview`: sidebar entry with a "Preview" pill. Every page renders `<PreviewBanner>` stating what is not wired yet. No static data presented as real.
- `deferred`: not planned (`livePhase: null`). No sidebar link, no palette entry, not counted on the pillar overview. Its root route renders `<ComingSoonPage service=…>` (owner, reason, "not planned"). Its backend routes, models and jobs are removed.
- A planned service with no page yet stays `preview`; its routes render `<ComingSoonPage>` with the target phase (`livePhase`).
- `router.tsx` stops hand-listing service routes. Each service exports `routes` from `pillars/<pillar>/<service>/routes.tsx`. Preview services that still use generic pages register through `pillars/_preview-routes.tsx` until Phase 4 deletes it.
- CI reconciliation test `apps/super-admin/src/pillars/manifest.reconcile.test.ts`:
  - every manifest `route` and `routes[]` entry resolves to a registered route (no catch-all);
  - every registered `/platform|/revenue|/customer|/trust|/gtm` route belongs to exactly one manifest service;
  - every `live` service has a folder `pillars/<pillar>/<service>/` and no `OpsRoute`/`InternalOpsPage`/`WorkflowOpsPage` usage;
  - every `deferred` service has no backend route under `/api/internal/<service>`, checked against a route list exported by the backend (`apps/backend/src/modules/internal/route-index.ts`).
- Initial statuses at the end of Phase 0 are in ADR 0002 § Phase-0 snapshot. Status changes ship in the same PR as the work that earns them.

**Closes:** B4, P2-1, P2-2, P2-3 (partly).

---

## D2 — One permission system, one namespace

**Decision.** Staff RBAC + JIT (`@fauward/internal-rbac` + `requireInternalPermission`) is the only permission system. The legacy `PlatformRole` map is deleted. All console endpoints live under `/api/internal/*`.

- Rename `requireInternalPermission` → `requireConsolePermission` (keep a re-export alias for one phase). It computes the permission context once per request and caches it on `request.console`.
- `/api/v1/platform/*` routes move to `/api/internal/*` in Phase 1 (`01-architecture.md` §3 has the full path map). During Phase 0 both stay mounted; Phase 1 deletes the `/api/v1/platform` prefix, except `/api/v1/platform/tracking/*` and the control-tower routes, which move to console auth in WP-2.11 (Phase 2).
- Legacy permission → staff permission mapping used for the move:

| Legacy | Staff permission |
|---|---|
| `tenant:read` | `platform.tenants.read` |
| `tenant:suspend`, `tenant:unsuspend` | `platform.tenants.suspend` |
| `tenant:plan_override` | `revenue.subscriptions.override` |
| `tenant:impersonate` | `platform.impersonation.start` |
| `region:read` | `platform.tenants.read` |
| `region:approve`, `region:reject` | `platform.tenants.write` |
| `billing:view` | `revenue.invoices.read` |
| `revenue:view` | `revenue.analytics.read` |
| `system:health` | `platform.health.read` |
| `queue:view` | `platform.queues.read` |
| `relay:view` / `relay:respond` | `customer.support.read` / `customer.support.write` |
| `logs:view` | `customer.comms.read` (logs are notification delivery logs) |
| `logs:view_sensitive` | `customer.comms.read` + fresh MFA + reason |
| `audit:view` | `trust.audit.read` |
| `platform_users:manage` | `trust.iam.write` |

- `PlatformUser.role` stays as a column for one release, used only by a one-time backfill that creates `StaffRoleAssignment` rows (`grantedBy: 'legacy-backfill'`). After the backfill, `ensureStaffUserForPlatformUser` never adds roles (fixes S5). `seedStaffRoles` runs at boot and in `staff:roles:seed`, never per request.
- Every staff role gets `trust.jit.request` so JIT is usable by everyone who might need elevation.
- `/api/internal/auth/me` returns effective permissions = role permissions ∪ active JIT grants (with `expiresAt` per JIT permission). The frontend refreshes it on window focus, every 60 s, and after any IAM/JIT mutation.

**Closes:** B5, S5, P4-1 (with WP-1.6), JIT dead-end UX.

---

## D3 — One suspension path

**Decision.** All suspensions and lifts go through `TenantSuspensionService` (`apps/backend/src/services/tenant-suspension.service.ts`). Nothing else may write `Tenant.status = 'SUSPENDED'` or lift it. A grep-gate test enforces this.

```ts
suspendTenant(db, { tenantId, source, category, reason, actor, sourceRef? }): Promise<SuspensionRecord>
liftSuspension(db, { tenantId, suspensionId?, via, reason, actor }): Promise<SuspensionRecord>
getActiveSuspension(db, tenantId): Promise<SuspensionRecord | null>
```

- `source`: `PLATFORM | DUNNING | FRAUD | AUP | LEGAL | SYSTEM`. `via` (lift): `MANUAL | APPEAL | PAYMENT | EXPIRY`.
- One transaction: create `SuspensionRecord`, set `Tenant.status/suspendedAt/suspensionReason` (public-safe text), write `PlatformAuditLog`, write `PlatformActivity`. After commit: notify tenant admins (D6), invalidate the tenant cache in Redis.
- Idempotent: suspending an already-suspended tenant adds a second active record (multiple causes). Lifting one cause leaves the tenant suspended while another is active. The tenant becomes `ACTIVE` only when no active record remains.
- Callers to migrate (five):
  1. platform suspend/unsuspend (`platform.routes.ts:371-408`)
  2. console dunning retry auto-suspend (`console-phases.routes.ts:374-399`)
  3. Stripe `invoice.payment_failed` → `handleDunningEvent` (`payments/billing.service.ts`) — attempt 2 suspends with `source: DUNNING`; a later `invoice.paid` lifts with `via: PAYMENT`. WP-4.5 removes this attempt-2 suspend; from then on the default dunning sequence's suspend step is the only billing suspension trigger
  4. fraud decision (`console-phases.routes.ts:900-923`)
  5. legacy `/api/v1/admin` suspend (`super-admin.routes.ts`), deleted in WP-1.6
- Closed tenants (`closedAt` set) are never reactivated: `liftSuspension` records the lift but leaves `status CANCELLED`, and new appeals are rejected with 409 `TENANT_CLOSED`.
- Appeals: `TenantAppeal.suspensionId` is set by the server when the appeal is created (latest active suspension), never by the client. Approving an appeal calls `liftSuspension({ suspensionId, via: 'APPEAL' })`.
- Tenant side: `GET /api/v1/tenants/me/suspension` returns `{ suspended, category, publicReason, since, appealable, appeal: { status, decidedAt, resolution } | null }`. `SuspendedOverlay` uses it.

**Closes:** §4 Trust & Safety suspension defects, §5 #3 gaps, C2.

---

## D4 — Billing data model

**Decision.** One discriminator column, not separate tables. `Invoice`, `Payment`, `Refund` and `CreditNote` gain `kind LedgerKind @default(TENANT_CUSTOMER)` where `enum LedgerKind { PLATFORM TENANT_CUSTOMER }`.

- `PLATFORM` = Fauward billing a tenant. `TENANT_CUSTOMER` = a tenant billing its own customers (finance module).
- Every query on these four models must name `kind`. Console billing defaults to `PLATFORM`. Tenant finance routes filter `TENANT_CUSTOMER`. The tenant's "Invoices from Fauward" view (`BillingTab`) reads `PLATFORM` rows for its own tenant through `GET /api/v1/tenants/me/billing/invoices`.
- `Invoice.stripeInvoiceId String? @unique`. Stripe `invoice.created/finalized/paid/payment_failed/voided` webhooks upsert `PLATFORM` invoices and payments. Without Stripe, staff create `PLATFORM` invoices manually in the Billing Console (existing route, now `kind: PLATFORM`).
- Backfill: rows created through `/api/internal/billing/*` are identified by `PlatformAuditLog` entries with action `invoice.create` / `invoice.refund` / `credit_note.create` and their `targetId`; set those to `PLATFORM`. Everything else stays `TENANT_CUSTOMER`. The migration script prints counts per kind and needs owner approval before running in production.
- Money: amounts stay `Decimal(12,2)` major units, as strings across the API. Conversion to Stripe minor units happens only inside `stripe.service.ts` via `toMinorUnits(amount, currency)` (zero-decimal currencies handled).

**Closes:** §4 Billing mix, revenue analytics prerequisites.

---

## D5 — Ticket data model

**Decision.**

- `SupportTicket.audience TicketAudience @default(END_CUSTOMER)` where `enum TicketAudience { END_CUSTOMER PLATFORM }`. `END_CUSTOMER` = a tenant's customer writing to the tenant. `PLATFORM` = a tenant writing to Fauward.
- `SupportTicket` also gains `lastMessageAt`, `lastMessageAuthorType`, `firstResponseAt`, `linkedTicketId` (escalating an end-customer ticket to Fauward creates a linked `PLATFORM` ticket).
- `TicketMessage.authorType MessageAuthorType` (`TENANT_USER | END_CUSTOMER | STAFF | SYSTEM`), `authorId` becomes optional (tenant/end-customer `User`), `platformAuthorId` (exists) required when `authorType = STAFF`, and `visibility MessageVisibility` (`PUBLIC | TENANT_INTERNAL | STAFF_INTERNAL`) replaces `isInternal` (backfill `isInternal=true` → `TENANT_INTERNAL`; drop `isInternal` in Phase 4). `fromSA` is dropped after backfill (`fromSA=true` → `STAFF`).
- Visibility rules (one function, `ticket-visibility.ts`, used by both tenant and console routes):
  - end customer: `PUBLIC`
  - tenant staff: `PUBLIC`, `TENANT_INTERNAL`
  - Fauward staff: everything on `PLATFORM` tickets; on `END_CUSTOMER` tickets read-only `PUBLIC`+`TENANT_INTERNAL`, and only from Customer 360 with `customer.support.read`
- The console Support Desk lists `PLATFORM` tickets only. Staff replies are `authorType: STAFF`, never a tenant user. Every new message updates `updatedAt` and `lastMessageAt` in the same transaction.

**Closes:** §4 Support Desk, S11.

---

## D6 — Notification dispatch

**Decision.** Reuse the existing `notificationQueue` + worker. Add one platform entrypoint, `PlatformNotifier` (`apps/backend/src/services/platform-notifier.service.ts`). It ships in WP-1.0 (Phase 1) so Phase 1 actions notify tenants; WP-2.2 migrates every remaining call site:

```ts
notifyTenantAdmins(app, { tenantId, event, title, body, link?, email?: { template, data } })
notifyTenantUser(app, { tenantId, userId, … })
notifyStaff(app, { permission | staffIds, event, title, body, link, severity })
```

- Tenant side: writes `InAppNotification` rows (existing `createInAppNotifications`) and enqueues email via `sendEmail` (existing). The worker writes the `NotificationLog`.
- Staff side: new `StaffNotification` model, a console bell (`ShellLayout`), and optional email to staff via the same queue with `tenantId: 'system'`. Check how the worker handles `'system'` and adjust its context builder if needed.
- No `notificationLog.create` outside `notifications.worker.ts`. A grep-gate test enforces it. All call sites in C1 are migrated in WP-2.2.
- Vendor-free default: the worker gains an SMTP transport (`SMTP_URL`, e.g. Mailpit on the VM slot) used when `SENDGRID_API_KEY` is unset. With neither configured it marks the log `SKIPPED` with `error: 'EMAIL_PROVIDER_NOT_CONFIGURED'` instead of throwing. In-app notifications are always delivered. Built in WP-2.2; tests that assert email delivery read Mailpit.
- New email templates (in `email-templates.ts`): `tenant_suspended`, `tenant_unsuspended`, `appeal_decided`, `support_reply_from_fauward`, `dsar_ready`, `dsar_completed_erasure`, `region_change_decided`, `plan_changed`, `plan_change_request_decided`, `staff_access_started`, `api_key_revoked_by_fauward`, `ai_limit_changed`, `feedback_status_changed`, `trial_extension_decided`, `incident_update`.

**Closes:** §5 #14, appeal/support/dunning email gaps.

---

## D7 — Activity feed

**Decision.** A `PlatformActivity` table, written transactionally by producers through `recordActivity(tx, input)` (`apps/backend/src/services/platform-activity.service.ts`). This is the re-audit's option (a), but direct-write rather than outbox-projected (C5). The table and `recordActivity` ship in WP-1.0 so Phase 1 mutations record activity.

- Fields: `occurredAt, tenantId?, service` (manifest id, for example `customer.support`), `type` (for example `ticket.created`), `actorType` (`TENANT_USER | END_CUSTOMER | STAFF | SYSTEM | API_KEY | IMPERSONATOR`), `actorId?`, `actorLabel`, `subjectType`, `subjectId`, `summary` (no PII beyond names/emails already visible to staff), `severity` (`INFO | ATTENTION | CRITICAL`), `consoleLink?`, `metadata Json`, `dedupeKey @unique`.
- Existing `OutboxEvent` producers (`shipment.*`, `tenant.*`) are projected by the outbox worker into `PlatformActivity` through a mapping table in `outbox-activity-map.ts`. `OutboxEvent` gains `tenantId String?`.
- After commit, `recordActivity` publishes the row id to Redis `console:activity` (fire-and-forget with `.catch`).
- Read endpoints ship in WP-2.1 (Phase 2): `GET /api/internal/activity` (filter by tenant/service/severity, cursor), `GET /api/internal/activity/summary` (last `occurredAt` per service → "Last activity"), `GET /api/internal/activity/stream` (SSE on the console cookie session, filtered by the caller's permissions). The Customer 360 Activity tab ships with them. The pillar dashboard feed, per-service "Last activity" and badges consume them in Phase 3.
- Retention: 180 days, pruned by the scheduled job `platform.activity-prune`.
- The list of activity types each phase must emit is in `21-tenant-loop-map.md`.

**Closes:** "no platform-subscribable activity", `_PillarOverviewBase` "Last activity", escalation realtime.

---

## D8 — Tenant-side impersonation visibility and scopes

**Decision.**

- Scopes are `read` (default) and `write`. `write` needs `platform.impersonation.mutate`, a reason of at least 20 characters, fresh MFA, and is capped at 15 minutes. `authenticate.ts` rejects any non-safe method (not GET/HEAD/OPTIONS) from an impersonation token without `write` scope: 403 `IMPERSONATION_READ_ONLY`.
- Token transport: the console receives a single-use `exchangeCode` (Redis, 60 s TTL), never the token. It opens `https://<slug>.fauward.com/auth/impersonate#code=<code>`. The fragment is never sent to servers. `ImpersonateCallbackPage` POSTs the code to `POST /api/v1/auth/impersonation/exchange` and stores the returned token in `sessionStorage` only.
- Tenant `AuditLog` rows written during impersonation use `actorType: 'IMPERSONATOR'` and `metadata.impersonationSessionId`, `metadata.platformUserId`.
- Tenant visibility:
  - `GET /api/v1/tenants/me/staff-access` (TENANT_ADMIN): sessions with staff display name, reason, scopes, start/end/revoked, and count of audit rows written in-session.
  - `GET /api/v1/tenants/me/staff-access/active`: drives a banner shown to tenant admins while a session is active.
  - On session start: `notifyTenantAdmins` (in-app + `staff_access_started` email). Enterprise tenants can turn the email off with `TenantSettings.notifyOnStaffAccess` (default `true`); the in-app entry cannot be turned off.
- Tenant page: `apps/tenant-portal/src/pages/settings/StaffAccessTab.tsx` under Settings → Security.

**Closes:** S6, S7 (with legacy route removal), §5 #18, token-in-URL.

---

## D9 — Vendor-free defaults

**Decision.** No vendor key means a working Fauward-native feature, not an empty page or a 503. A configured vendor that fails returns a handled degraded response (S16).

| Vendor | Used by | Fauward-native default when unset |
|---|---|---|
| LaunchDarkly | flags | `TenantFeatureOverride` table is the source of truth, read by `resolveTenantEntitlements`. LD becomes an optional mirror, using per-tenant targeting rules only. |
| GitHub | releases | Backend `/version` (`APP_VERSION`, `GIT_COMMIT`, `BUILD_TIME`) + console build info (`VITE_GIT_COMMIT`, `VITE_BUILD_TIME`) |
| PagerDuty | incidents | Native create/update/resolve on `IncidentRecord` (`vendor: 'native'`); PagerDuty inbound stays as an optional producer |
| Zendesk / Plain | support | Native Support Desk (D5) |
| Stripe | billing, dunning, disputes, subscriptions | Manual `PLATFORM` invoices/payments; dunning "retry" emails the tenant to update the card; plan change becomes a `PlanChangeRequest` for staff approval; disputes page shows "Stripe not configured" (no other source exists) |
| Stripe Tax / Anrok | tax | `TaxRegistration` CRUD + `TaxExemption` workflow; VAT rate from `config.tax.defaultRates` |
| Persona / ComplyAdvantage | KYC, sanctions | Manual review queue: staff record evidence and decide; monthly rescreen creates `PENDING` rows for manual review |
| Doppler | secrets | Inventory job over the code-defined secret registry: presence, fingerprint, rotation detection |
| HubSpot | pipeline | Native `SalesDeal` CRUD; HubSpot import is optional |
| DocuSign | contracts | Upload a signed PDF or mark signed manually → `MsaAgreement` |
| SendGrid / Twilio | notifications | In-app only; logs marked `SKIPPED` |
| Statsig | pricing experiments | Service deferred |

All vendor calls go through `apps/backend/src/services/vendors/<vendor>.adapter.ts` with `isConfigured()`, typed methods, and `VendorError` mapped to `{ error: 'VENDOR_ERROR', vendor, degraded: true }` with status 502. `internal-vendors.service.ts` `vendorJson` is replaced in Phase 4.

---

## D10 — Producer-less models: live or die

24 models. 13 get a producer, 11 are dropped with their routes and manifest entries.

| Model | Verdict | Producer (or reason to drop) | Phase |
|---|---|---|---|
| RefundApproval | Keep | Refunds above threshold or without `gatewayRef` need a second approver | P0 |
| DunningSequence | Keep | Seeded default sequence + console editor | P4 |
| DunningStep | Keep | Console sequence editor; executed by `revenue.dunning-advance` job | P4 |
| IncidentRunbook | Keep | Console CRUD; linked from incidents | P4 |
| SecretCredential | Keep | `trust.secret-inventory` job over the code secret registry + console owner/rotation policy | P4 |
| TaxRegistration | Keep | Console CRUD (Fauward's own registrations) | P4 |
| TaxExemption | Keep | Tenant uploads certificate in `BillingTab` → console approves → `Tenant.taxExempt` read by platform invoicing | P4 |
| MsaAgreement | Keep | Created when a `SalesQuote` reaches `ACCEPTED` (manual or DocuSign completed) | P4 |
| ContractApproval | Keep | Created when quote discount > `config.cpq.discountApprovalPercent` or term > 24 months | P4 |
| SalesDeal | Keep | Console CRUD; optional HubSpot import | P4 |
| TrialExtensionRequest | Keep | Tenant trial banner "Request more time" | P4 |
| SalesHandoff | Keep | Auto-created on trial → paid conversion (`SubscriptionEvent`) | P4 |
| MarketingAttribution | Keep | First-touch UTM/referrer/landing page captured on the marketing site and sent with `POST /api/v1/auth/register` | P4 |
| SupportVendorTicket | **Drop** | Support is native (D5); health factor uses `SupportTicket{audience: PLATFORM}` | P4 |
| SecretAccessLog | **Drop** | Replaced by `PlatformAuditLog` (`targetType: 'secret_credential'`) | P4 |
| TaxReturn | **Drop** | Filings live in the accounting system | P4 |
| QBRTemplate | **Drop** | QBR sections are code-defined | P4 |
| PricingExperiment | **Drop** | Service deferred; no experimentation platform | P4 |
| Partner | **Drop** | No partner programme; Partners deferred | P4 |
| PartnerApplication | **Drop** | as above | P4 |
| PartnerDealRegistration | **Drop** | as above | P4 |
| CommissionLedger | **Drop** | Commissions deferred; `revenue.commission-aggregation` job deleted | P4 |
| CommissionPayout | **Drop** | as above | P4 |
| CommissionDispute | **Drop** | as above | P4 |

**Drop procedure (each table):** 1) delete routes, manifest entry → `deferred`, jobs, UI; 2) migration with a pre-check script that prints row counts; 3) if any count > 0 in production, stop and ask the owner; 4) the drop migration runs in production only after owner approval (it is a data deletion).
