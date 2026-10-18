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
| C16 | WP-0.1/§2.5: `MfaStepUpModal` mounted in `ShellLayout` | `/admin/regions` (exit-criterion golden path) renders under the legacy `AdminLayout`, not `ShellLayout` | The modal is mounted once in `SuperAdminGuard`, the parent of both layouts |
| C17 | WP-0.2: pages render `ConsoleApiError` when a query fails | react-query's default 3 retries with back-off kept 4xx failures in "loading" for ~7 s | Console `queryClient` retries only network/5xx errors (twice); 4xx render immediately |
| C18 | WP-0.2: tests for the client | `apps/super-admin` had no unit-test runner | Added vitest + jsdom + Testing Library (`npm run test` in the workspace) |
| C19 | WP-0.3: sidebar/palette/overview read `status`; D1 router built from per-service `routes.tsx` | `CommandPalette` listed hardcoded fake tenants/invoices; router hand-listed 137 routes | Palette now lists manifest services only (entity search returns with `/api/internal/search`, WP-1.2). Routes moved into one table `src/console-routes.tsx` that the reconciliation test reads; per-service `routes.tsx` files arrive as each service is rebuilt |
| C20 | ADR snapshot: commissions/partners/pricing stay `preview` | They are not planned (`livePhase: null`) but keep their pages until WP-4.0b | Manifest: `status: preview`, `livePhase: null`; banner says "being removed" |
| C21 | S3: JIT self-approval compared different id spaces | `jit/requests/:id/approve` already compared PlatformUser ids correctly (`requesterPlatformUserId` vs caller) | Kept, and the request's `requesterStaffId` is now also compared with the approver's StaffUser id |
| C22 | Catalogue: `POST /iam/users/:id/suspend · /offboard · /reactivate` | Code changed status through `PATCH /iam/users/:id` (no session revoke on suspend) and `DELETE` | Added the three dangerous POST routes (one transaction each); `PATCH` can no longer change status or MFA (400 `USE_LIFECYCLE_ACTION`); `DELETE` = offboard, dangerous |
| C23 | S5: re-grant per request | Besides the per-request upsert, `staffPermissionContextForPlatformUser` fell back to the legacy role's permissions when a staff user had no roles | Fallback removed: a staff user with no roles has no permissions |
| C24 | S2: ROOT grants need the hardware assertion | The deprecated `SUPER_ADMIN` staff role carries ROOT's permissions and could be assigned without the ROOT check | Deprecated roles cannot be assigned (400 `ROLE_DEPRECATED`); `SUPER_ADMIN` is also treated as ROOT-equivalent in the check |
| C25 | WP-0.5: "find the shared audit writer(s) and pass `impersonationSessionId` through" | There is no shared tenant audit writer: ~30 direct `auditLog.create` call sites | One Prisma middleware stamps every `AuditLog` create/createMany from a per-request actor holder (`context/request-actor.context.ts`, filled by `authenticate`), so no call site can forget |
| C26 | WP-0.5: read-only impersonation rejects every non-GET | The tenant portal's "end staff session" is `POST /api/v1/tenant(s/me)/impersonation/exit` | The two exit endpoints stay allowed for read-only tokens |
| C27 | WP-0.5: `setImpersonationToken` "ensure it uses sessionStorage" | It overwrote the tenant user's own `localStorage` access token and deleted their refresh token | Impersonation token and slug live under separate `sessionStorage` keys; `getAccessToken`/`getTenantSlug` prefer them; the user's own session is untouched |
| C28 | WP-0.5 S7: legacy route returns 410 | — | The 410 handler has no auth guard (it exposes nothing), so stale clients get the pointer instead of 401 |
| C29 | WP-0.6: large refunds need `.large` "or the approval path" | Code returned 403 for refunds ≥ `LARGE_REFUND_PENCE` (50 000, compared with a major-unit amount) | Threshold is `config.billing.largeRefundThreshold` (`BILLING_LARGE_REFUND_THRESHOLD`, default 500.00, payment currency); without `.large` the refund goes to the approval path instead of 403; `config/billing.ts` removed |
| C30 | WP-0.6 over-refund check `amount > amount - refundedAmount` | Two refunds awaiting approval could each pass that check | Refunds in `PENDING_APPROVAL`/`PROCESSING` also count against the refundable balance (checked under the payment row lock) |
| C31 | D9 vendor-free: manual refunds without Stripe | A payment with a `gatewayRef` while `STRIPE_SECRET_KEY` is unset would 500 | Treated like a manual refund: approval path, `RECORDED_MANUAL` |
| C32 | WP-0.6 approval path | — | An approved refund on a card payment (large refund approved by a second person) is then sent to Stripe (`PROCESSING` → `SUCCEEDED`/`FAILED`); manual ones become `RECORDED_MANUAL`. `POST /billing/refunds/:id/reject` added alongside approve |
| C33 | WP-0.7 S8: fail closed "except in `NODE_ENV=development`" | `config.nodeEnv` defaults to `development` when `NODE_ENV` is unset | The guard reads `process.env.NODE_ENV` and only the literal `development` stays open, so a deploy without `NODE_ENV` fails closed; the bearer compare is constant-time |
| C34 | WP-0.7 S9: hide the override action | The action lived in `WorkflowOpsPage`'s generic `/flags` presets | Preset removed; flags list/detail pages show `DegradedBanner('not-wired', 'WP-1.4')` through a new `OpsRoute` `notice` prop |
| C35 | ACC-RBAC-1: a `FINANCE_ADMIN`-only user is denied Health/Queues | `ROLE_PERMISSIONS` grants `FINANCE_ANALYST`/`FINANCE_ADMIN` `platform.health.read` and `platform.queues.read` | Role grants unchanged; ACC-RBAC-1 is proven with a role that lacks them (`CSM`) |
| C36 | WP-1.2 MRR: plan price "from `planService`", ACTIVE `PricingOverride`, `CustomContract` amount | `planService` had features/limits but no prices; overrides are created with `status: 'APPROVED'`; `CustomContract.terms` is free JSON with no amount field | `planService.getPrice()` holds the list prices shown on the pricing page (ENTERPRISE has none); MRR counts overrides in `ACTIVE`/`APPROVED`; a contract amount is read from `terms.monthlyAmount` + `terms.currency` (contracts in `ACTIVE`/`SIGNED` within term). Built in WP-1.1 so the moved `/metrics/overview` has no literals |
| C37 | §3 path map lists every `/api/v1/platform` route | `GET /api/v1/platform/webhooks/failures` (tenant `SUPER_ADMIN` user role, no caller) was not in the map | Moved to `GET /api/internal/integrations/webhooks/failures` (`platform.integrations.read`) |
| C38 | WP-1.6 deletes `LogsPanel` in `router.tsx` | `ShellLayout` had a second `LogsPanel` calling the removed `/api/v1/platform/logs` | Removed in WP-1.1; the delivery log is `GET /api/internal/comms/delivery-log` (`customer.comms.read`, unredacted view needs fresh MFA + reason) |
| C39 | §4: `/announcements` etc. live in `modules/internal/**` | `announcements.routes.ts` and `onboarding.routes.ts` register both tenant and `/api/internal` routes | Left in place for now; the rbac-matrix test registers them too, so their console routes are held to the same guard rules and appear in `route-index.ts` |
| C40 | `/auth/me` permissions; e2e mocks used `role: SUPER_ADMIN` with `permissions: []` | The console derived ROOT permissions from the legacy role name | No derivation (D2): mocks send explicit permissions (`ROOT_PERMISSIONS` in `e2e/support`) |
| C41 | WP-1.4: portal `PlanGate` / `lib/plan-features.ts` consumers read `/tenants/me/entitlements` | The portal's `FeatureKey` set and minimum plans differ from `planService` (e.g. portal `crm`/`finance` are STARTER, backend `crmModule`/`financeModule` are PRO+) | Only portal features with the same backend key and minimum plan use the server's feature answer (`BACKEND_FEATURE_KEY`); every other gate uses the server's override-aware `effectivePlan` with the static table. Aligning the two catalogues changes STARTER behaviour and is left for the owner |
| C42 | ACC-TEN-8: tenant-side limit checks read the `Tenant.maxStaff/maxShipmentsPm/maxOrganisations` columns | No code ever set those columns from the plan (every tenant keeps the defaults 3/300/10, a PRO tenant included), `maxStaff` was not enforced at all, and `usage.service` compared PRO tenants with 300 | Migration 0044 adds `Tenant.limitsOverriddenAt`. Effective limits = the columns when staff set them (`PATCH /tenants/:id/limits`), else the effective plan's limits (`planService`). Entitlements carry them; the invite route returns 403 `LIMIT_REACHED`; `usage.service` uses them |
| C43 | Catalogue platform.tenants route list | The Users tab and the impersonation target picker need a tenant's users; region requests had no console page under the service | Added `GET /api/internal/tenants/:id/users` (`platform.tenants.read`); `/admin/regions` redirects to `/platform/tenants/region-requests`; close also records a PLATFORM/OTHER suspension cause with `sourceRef close:<tenantId>` and sends `tenant_closed` (not `tenant_suspended`) |
| C44 | Tenant staff-access visibility is WP-2.9; ACC-IMP-10 is a WP-1.10 criterion | ACC-IMP-10 cannot pass without the tenant side | WP-1.10 ships `GET /api/v1/tenants/me/staff-access[/active]` (TENANT_ADMIN, own tenant, audit-row counts) and the portal's Settings → Staff access tab. WP-2.9 still adds the active-session banner, the `staff_access_started` notification and `notifyOnStaffAccess` |
| C45 | D4 backfill: rows found through `invoice.create` / `invoice.refund` / `credit_note.create` audit entries become PLATFORM | Before WP-1.5 the console never recorded payments, and its refunds (WP-0.6) refunded tenants' customer payments | The backfill tags console invoices/credit notes PLATFORM, plus payments of those invoices; a refund follows its payment's ledger, so pre-WP-1.5 console refunds stay TENANT_CUSTOMER (reported as `auditedRefundsLeftOnTheirPaymentLedger`). The refund service now takes `kind` and the console refunds PLATFORM payments only |
| C46 | D4: Stripe `invoice.*` webhooks upsert PLATFORM invoices and payments | Fauward's own Stripe subscription billing is not wired (no `stripeInvoiceId` producer), and the tenant BillingTab "Invoice history" read the tenant's own customer invoices (`/v1/finance/invoices`) | `Invoice.stripeInvoiceId` exists (0045); the webhook upsert lands with the dunning runtime (WP-4.5). BillingTab now shows "Invoices from Fauward" from `GET /api/v1/tenants/me/billing/invoices`; manual PLATFORM invoices/payments/credit notes work without Stripe |
| C47 | Catalogue customer.360: summary has an open PLATFORM tickets count; header last login from `User.lastLoginAt`; contextual panels (dunning, incidents, pipeline, attribution) | `SupportTicket` has no audience until WP-2.3; the column is `User.lastLogin`; incidents/pipeline/attribution are Phase 4 services | Summary returns `openTickets` (all open tickets) and the Tickets tab says the audiences are not separated until WP-2.3; last login = max `User.lastLogin`; dunning and save offers sit in the Billing tab; incidents/pipeline/attribution panels return with their services in Phase 4. The Activity tab is shown with a pointer to WP-2.1 rather than hidden. The old aggregate `GET /customer/360/:tenantId`, `/api-usage` and `PATCH …/notes` are removed (notes go through `PATCH /tenants/:id/internal-notes`) |
| C48 | Catalogue trust.jit lists no history endpoint; `JitHistoryPage` needs one. The legacy `/trust/jit/audit` route read `/audit/entries?action=jit` under `trust.audit.read` | The audit read side is WP-1.9; JIT rows carry approvals and derived state the audit log does not | Added `GET /jit/requests` (R:`trust.jit.approve`, filters state/permission/requester, cursor). `/trust/jit/audit` stays as the History page path, now gated by `trust.jit.approve`; `/trust/jit` redirects to the request page instead of the approver queue |
| C49 | trust.jit revoke is `W:trust.jit.approve (or own)`; approve takes `notes`; ACC-JIT-4 "expiry revokes" | A route guard cannot express "or own"; `dangerous()` reads `reason`; nothing marked grants expired | Revoke is guarded by `trust.jit.request` and checks `trust.jit.approve` in the handler for another person's grant (reason ≥ 8 then). Approve is `D:` and takes `reason` (stored as the approval note). Expiry is enforced at read time: `consolePermissionContext` only loads unexpired grants, and responses carry a derived `state` (PENDING/ACTIVE/EXPIRED/DENIED/REVOKED); there is no sweeper job. `JITGate.onRequest` is now optional (every console caller passes an `AccessDenied` fallback with `JitRequestDialog`) |
| C50 | Catalogue trust.audit lists `GET /audit` and `GET /audit/:id`; export of "the filtered set" | The routes are `/audit/entries` and `/audit/entries/:id` (route-index, console client); export only took a date range and was not a dangerous route; rows carry `targetTenantId` but no tenant name | Kept the `/audit/entries` paths. List takes actor (email contains or id), action, targetType, targetId, tenantId, from/to (ISO), q (free text) — all ANDed — with cursor pagination (`nextCursor`, `total`) and a `targetTenant` {id,name,slug} per row for TenantChip. Export takes the same filters, is `dangerous('trust.audit.export')`, caps at 10 000 rows (`truncated` flag) and writes its `audit.export` row after the read |
| C51 | WP-1.6 deletes `RevenueCharts` and `QueueMessageViewer`; WP-3.2 / WP-3.6 "delete `sampleRows`" in them later | Both are mounted by routed pages, and the platform overview rendered `DashboardOverviewSections` (hardcoded MRR, tenants, alerts) | Deleted them (and `DashboardPage`); `RevenueAnalyticsPage` and `QueuesListPage` show a `DegradedBanner` naming WP-3.2 / WP-3.6, the platform overview renders only the service grid until WP-3.1. `QueueTable` and `SystemMetrics` stay (real data) for WP-3.6 / WP-3.5 |
| C52 | WP-1.6 deletes the 16 `/api/v1/admin/*` routes in `super-admin.routes.ts` | `tracking.realtime.routes.ts` also registered `GET /api/v1/admin/escalations` (tenant SUPER_ADMIN JWT, no `tenantId` scope, no caller); ACC-IMP-5 asserted 410 on the legacy impersonate route (C28) | Escalations route deleted too (WP-2.11 rebuilds it under `/api/internal/operations`); the legacy impersonate route is now 404 like the rest (gate `legacy-admin.test.ts`). SUPER_ADMIN review: tenant-JWT checks in `authenticate.ts`, `tenantMatch`, control-tower, tracking/ws stay until WP-2.11, relay checks until WP-4.R, `users.routes` refusals to assign SUPER_ADMIN stay; only the `/api/v1/admin/` MFA path rule was removed. Domain/users `requireRole([... 'SUPER_ADMIN'])` entries are left for WP-2.11 (no producer of tenant SUPER_ADMIN tokens remains once `apps/admin` is gone) |
| C53 | Legacy redirects: keep only those covered by `legacy-redirects.spec.ts` | `/admin/regions`, `/admin/relay`, `/admin/support-audit`, `/admin/logs` were routed but had no redirect test; relay pages are unrouted until WP-4.R | All ten `/admin/*` paths redirect (relay/support-audit → `/customer/support`, logs → `/trust/audit`) plus `/admin/*` → `/`, all in the spec. Relay code moved to `pillars/customer/support/relay/` (unrouted, ACC-LEG-3 gate). `apps/admin-portal` (not named by the spec) is untouched. The tenant-count badge read `meta.total`, which the WP-1.2 directory no longer returns; it reads `total` |
| C54 | §12 "live": dedicated folder with `routes.tsx`; every mutation one `PlatformAuditLog` row and one `PlatformActivity` row | Routes live in the single `console-routes.tsx` table (C19); `customer.360`'s folder is `customer360` (catalogue); `auditMiddleware` (`app.ts`) adds a second audit row to every `/api/internal` mutation (scheduled for Phase 5); `POST /audit/verify` changes no state | Phase-1 close-out: refund request/approve/reject now record activity, route-effect tests added for tenant limits, internal notes and plan-override revoke, audit export records activity; `/audit/verify` is treated as a read (no activity). The reconcile test maps `customer.360` → `customer360`. The duplicate middleware audit row stays a Phase-5 item (WP-5.1) and is not counted against Phase-1 services |
| C55 | WP-2.0: `BillingTab` fakes are "replaced by WP-2.7"; `useBilling.ts:7-33,103-117` fallbacks become loading/error states | Besides the fallback object, `useBilling` invented the price (`planAmount` literals), the renewal date (now + 30 d), a 14-day trial, one used seat, API-call limits and `pdfUrl: "#"`; nothing on the tenant API returned the real values | Added `GET /api/v1/tenants/me/billing/summary` (billed vs effective plan, list price from `planService.getPrice` for the subscription's cycle, `Subscription` period/trial, shipments and staff usage against effective limits; unknowns are `null`). The hardcoded Stripe "Manage billing" URL is gone until WP-2.7's portal session; the plan-change confirm stays (allowlisted in the gate) until WP-2.7 |
| C56 | WP-2.0: wire `ShipmentDetailPage` contact/upload/notes "to existing documents/notes routes or remove" | There is no tenant document-upload route and no shipment-notes write route; "Contact customer" had no handler | Documents and notes panels are read-only (notes are added through status updates); "Contact customer" is a `tel:`/`mailto:` link to the recipient and is hidden when the shipment has neither |
| C57 | WP-2.0: `AppPages.tsx` static CRM/finance detail, `/book`, `/crm/new`, `/team/invite` → real pages or removed | The backend has CRM customers/leads and invoice detail; nothing backs `/book` (public booking) or scheduled reports; the portal also faked a 1.4 s dashboard shimmer, a 1.2 s login delay, "Dispatch jobs"/"Build route" links to non-existent routes, a "General" settings tab with no form, a ZIP download, "Save as quote" and an insurance editor that showed built-in tiers as if saved | New `pages/crm/CrmPage` + `CrmDetailPage` on `/v1/crm/*`, `pages/finance/FinanceInvoiceDetailPage` on `/v1/finance/invoices/:id`; `/book`, `/team-legacy`, the General tab, scheduled reports, ZIP download and "Save as quote" removed; delays removed; `GET /api/v1/pricing/insurance` added so the editor loads saved tiers (suggested tiers are labelled as unsaved). Tenant MFA stays disabled with "Coming soon" (logged in `docs/implementation-status.md`) |
| C58 | WP-2.0: wizard posts "the wizard payload mapped to its schema" | The wizard priced from a hardcoded list (£12/£26/£42, £4.50 insurance) with tiers (`Same Day`) the pricing engine does not know; insurance tiers are tenant-configured keys | Service step shows the live `POST /v1/pricing/calculate` quote (same engine as create) in the server's currency; tiers are the engine's `STANDARD`/`EXPRESS`/`OVERNIGHT`; the insurance toggle is removed from the wizard. Create sends an `Idempotency-Key` per distinct booking and maps rejections to the step they belong to |
| C59 | WP-2.0: `router/index.tsx` dead legacy router | `@/router` resolves to `src/router.tsx`, so the `src/router/` directory (legacy router, `guards/PlanGate`) and `features/driver/*`, `features/admin/*` were unreachable except `features/admin/audit/AuditLogPage`, which the live router used | Deleted the directory and both feature trees; the audit page moved to `pages/audit/AuditLogPage.tsx` (typed, error state, impersonation actor label). The `no-fake-data` gate also removed the console's `"placeholder"` `BadgeKey`: services without a badge computation show no badge (WP-3.4 adds `/badges`) |
| C60 | WP-2.1: SSE filters events "via event `service` → manifest `requiredPermission`"; §4 lists only `/activity/stream` as session-only; D7 projects the existing `shipment.*`/`tenant.*` outbox events | The manifest lives in the console app, which the backend cannot import; `/activity` and `/activity/summary` serve every role too; projecting every shipment status hop would flood the feed (one row per scan) | The service → read-permission map is `SERVICE_READ_PERMISSIONS` in `@fauward/internal-rbac` (the manifest reconcile test asserts it equals the manifest). All three activity routes are session-only with per-row filtering (rbac-matrix allowlist); an explicit `service` filter the caller cannot read is 403. The projection (`outbox-activity-map.ts`) emits `shipment.created`, `shipment.attention` (EXCEPTION/FAILED_DELIVERY only), `shipment.rerouted_by_agent`, `tenant.created`, `tenant.slug_changed` under `customer.360` / `platform.tenants`; other outbox events are not projected. Producers now fill `OutboxEvent.tenantId`; the worker projects before marking published (idempotent by `outbox:<id>`) and runs in the system context with a guarded interval |
| C61 | C1 lists `auth.service.ts:502,582` as notification call sites to migrate | `POST /api/v1/auth/forgot-password` returned the raw reset token in the response and stored it in `NotificationLog.providerRef` (anyone knowing an email could reset that account); the field email-link flow stored a login token in `providerRef` and returns it in the response, and Fauward Go signs in with that returned token | Password reset now emails a link (`PUBLIC_SITE_URL/reset-password?token=…`, the marketing reset page) and answers `{ success: true }` only. The email-link log row is removed; its response contract is unchanged because Fauward Go depends on it (another session owns that app) — recorded for the owner as a security item |
| C62 | D6: the worker writes the NotificationLog; email templates in `email-templates.ts`; SKIPPED without a provider | `NotificationLog.tenantId` was a required FK (no row possible for staff email), each retry created a new row, SendGrid without a dashboard template failed, and the daily `tenant.usage-report` job wrote a QUEUED "daily_usage_report" row per tenant with no content | Migration `0046_notification_delivery` (tenantId optional, `jobId` unique, recipient/template/provider/attempts). The worker upserts one row per job, sends via SendGrid (dynamic template when mapped, else built-in content from `email-content.ts`), else SMTP (`SMTP_URL`), else SKIPPED; it increments `UsageRecord.emailsSent/smsSent` once per sent job (L19, ahead of WP-2.18). `tenant.usage-report` now sends 80 %/100 % shipment-limit notices once a month each; trial warnings go once per trial end. Tenant→customer emails (invoices, payments, quotes, failed delivery) go through `notifyCustomer`. Delivery-log rows are presented field by field (the old blanket redaction turned dates into `{}` and masked UUIDs as phone numbers) |
| C63 | WP-2.3 / D5 model 0045_support_audience; SLA breach "notifies once per ticket per breach"; console reply `POST /support/tickets/:id/messages`; macros "existing route" | The SLA sweep needs to remember that it already reported a ticket; the old console reply route was `/reply`, authored staff replies as the first tenant admin and only wrote a QUEUED log row; macros came from Zendesk; console audit rows on tickets had no tenant link; `ActionDialog` could not scroll and two `TenantPicker`s on one page shared an input id | Migration `0047_support_audience` (real number) adds `slaBreachedAt` besides the D5 columns; backfill `0047-ticket-messages.ts`. Ticket numbers are `<SLUG>-FWD-…` for PLATFORM and `<SLUG>-TKT-…` for END_CUSTOMER. Console routes moved to `modules/internal/customer/support.routes.ts` (`/reply` → `/messages`); macros are `config/support-macros.ts`; SLA targets `config/support-sla.ts`. Escalation links both tickets; a tenant reply to a RESOLVED/WAITING ticket reopens it; only tenant staff (not CUSTOMER roles) can open PLATFORM tickets; a staff-opened ticket is assigned to its creator and counts as the first response. `writeInternalAudit`/`writeAudit` accept a target tenant so ticket audit rows show under the tenant. ActionDialog scrolls; TenantPicker uses `useId` |
| C64 | WP-2.4 needs no migration (FraudSignal/TenantAppeal/TenantSuspension exist); routes `/safety/fraud`, `/safety/aup`; appeal outcomes APPROVE/REJECT; automatic rules "listed" | Fraud and AUP signals shared one table with no way to tell them apart; a decision left no note or timestamp; a REQUEST_INFO round-trip had nowhere to store the question or the tenant's answer; the Radar threshold, failed-login spike and dunning attempt numbers were literals in three files; the old `registerSafety` block in `console-phases.routes.ts` read the generic workflow store | Migration `0048_trust_safety_appeals` (real number, not in the plan): `FraudSignal.category` (FRAUD/AUP, default FRAUD), `decisionNote`, `decidedAt`; `TenantAppeal.infoRequest/infoRequestedAt/tenantReply/tenantRepliedAt/decidedAt`. Fraud and AUP are one queue `/safety/signals?category=` (old console paths redirect). Appeal decisions are APPROVE/REJECT/REQUEST_INFO; status INFO_REQUESTED until the tenant answers once from the suspension overlay (`POST /api/v1/tenants/me/suspension-appeal/:id/reply`, allowed while suspended). Rules live in `config/safety-rules.ts`, read by the enforcing code and served by `GET /safety/rules`. After a REJECT the tenant may appeal again (one open appeal at a time) |
| C65 | WP-2.5 model `0050_dsar_exports` (`storageProvider SUPABASE|POSTGRES`, `ExportBlob{id,bytes}`); tenant routes for TENANT_ADMIN; console `PATCH /compliance/dsar/:id`, `/compliance/legal-hold`; manifest routes `/legal-hold/:id` | `requesterEmail` already holds the subject's email; the generic PATCH let any state follow any other; no bucket storage is configured for this environment; the overdue requirement needs "once" semantics; a blob row without a tenant could not be read tenant-scoped; the tenant DSAR routes also admitted TENANT_MANAGER | Migration `0049_dsar_exports` (real number) adds the planned columns plus `DSARRequest.overdueAt` (claimed once by the daily `trust.dsar-overdue-sweep`) and `ExportBlob.tenantId`. Only the POSTGRES adapter exists (`services/export-storage.ts`, interface ready for a bucket provider). `requesterEmail` stays the subject email (no rename). States: RECEIVED → IDENTITY_VERIFIED → GATHERING → DATA_GATHERED → APPROVED → DELIVERED, or → ERASING → ERASED, then CLOSED; each step is its own route (verify-identity, gather, approve, deliver, erase, close) and PATCH is gone. Legal-hold API is `/compliance/legal-holds` (plural, per the catalogue table); no hold detail page. Gather/erase run on the scheduled-jobs queue; the registry is `config/personal-data-registry.ts` (User, Lead, Shipment, SupportTicket, TicketMessage, Invoice RETAIN, ReturnRequest, NotificationLog, InAppNotification). Erasure also purges that request's gathered bundles; the DSAR row keeps the subject email as evidence of the request. The download token travels only in the tenant's in-app link and email (`/settings?tab=privacy&dsar=…&token=…`); its hash is cleared on download. Tenant DSAR routes are TENANT_ADMIN only. RECTIFICATION has no automated executor: staff gather, review and correct through the normal tools |
| C66 | WP-2.6 model `0046_region_change_requests` with no tenant relation; approve "applies tenant.region (+ dependent settings via regionService if one exists)"; L5 activity `region.requested`, `region.decided`, `region.applied` | The real migration number is next free; no backend region service exists (the tenant portal derives payment providers from `Tenant.region` in `IntegrationsTab`); the in-memory store also served `getTenantDetail`'s pending request and the Phase 0 golden-path test; region keys were hard-coded in four places (tenant TopBar, console list filter, console decision route, region page) and the tenant TopBar offered keys that did not include the default `uk_europe` | Migration `0050_region_change_requests` (real number) with a Tenant relation (cascade). `config/regions.ts` is the one list (keys, labels, payment providers) served to both apps. APPROVED is applied in the same transaction and stored as APPLIED (`appliedAt`); one PENDING request per tenant (a new request replaces its target). Requests are TENANT_ADMIN only. The `/dev` endpoint and the TopBar dev-session branch are deleted (ACC-L5-2). The console region page lost its duplicated "audit" tab and success toast; it shows status filters, decision reasons and the per-region payment list from the API |

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
