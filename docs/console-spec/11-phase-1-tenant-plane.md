# Phase 1 — Real Tenant Control Plane

**Outcome:** tenants are listed, inspected, suspended, overridden, closed and impersonated through the real API, under one namespace and one permission system. Every tenant reference links to Customer 360. Legacy admin code is gone.
**Branch:** `console/p1-tenant-plane` · **Prereq:** Phase 0 exit criteria green.
**Services going live:** tenants, impersonation, billing, customer360, jit, audit (UI; chain in P5).
**Order:** 1.0 → 1.1 → 1.3 → 1.4 → 1.2 → 1.10 → 1.5 → 1.8 → 1.7 → 1.9 → 1.6 (delete last, once nothing references legacy paths).

---

## WP-1.0 Activity and notifier foundations (D6, D7 write side)

Phase 1 actions must record activity and notify tenants, so the minimal foundations land first.
- Migrations 0043 (`PlatformActivity`, `OutboxEvent.tenantId`) and 0044 (`StaffNotification`).
- `recordActivity(tx, input)` with `dedupeKey` and post-commit Redis publish (`.catch`). Retrofit the iam mutations from WP-0.4.
- `PlatformNotifier` (`notifyTenantAdmins`, `notifyTenantUser`, `notifyStaff`) on the existing queue + `createInAppNotifications`. SMTP/`SKIPPED` worker behaviour, new templates and the call-site migration stay in WP-2.2.
- Console bell: `GET /api/internal/notifications/staff`, `POST …/:id/read`, `POST …/read-all` (session-only), `NotificationBell` in `ShellLayout`.

**Acceptance**
- ACC-FND-1 A tenant suspension writes exactly one activity row and one in-app notification per active TENANT_ADMIN.
- ACC-FND-2 The staff bell returns only the caller's notifications; read/read-all work.

---

## WP-1.1 One namespace, one permission system (D2, B5, C4)

- Move every `/api/v1/platform/*` handler into `modules/internal/**` per the path map in architecture §3, guarded by `requireConsolePermission` with the D2 mapping. Add `route-index.ts` and `register.ts`.
- Delete `platform-permission.service.ts` (role map), `require-platform-permission.ts`, the inline check at `platform.routes.ts:566-567`, and finally `platform.routes.ts`.
- One-time backfill `0039a-legacy-role-assignments.ts`: for each `PlatformUser`, ensure a `StaffUser` and the mapped `StaffRoleAssignment` (`grantedBy: 'legacy-backfill'`). After it runs, `ensureStaffUserForPlatformUser` only links/creates the `StaffUser` row and never assigns roles.
- `ROLE_PERMISSIONS`: add `trust.jit.request` to every role; add new permissions from architecture §4.
- `/api/internal/auth/me` returns `jit[]` with expiry. Frontend: delete `buildPermissionContext`, `legacyPermissionMap`, `roleMap`; `PermissionProvider` uses `/auth/me` permissions and re-renders on refetch.
- Console: delete `lib/api.ts`, `lib/internal-api.ts`, the `platformApi` instance; update `vercel.json` and `vite.config.ts` proxies (remove `/api/v1` from the console if unused; keep `/api/relay` until WP-4.R).
- Extend `rbac-matrix.test.ts` per architecture §4; add `dangerous-routes.ts` assertions.
- Reconciliation test check (d) enabled using `route-index.ts`.

**Acceptance**
- ACC-RBAC-1 A user with only `FINANCE_ADMIN` sees Health/Queues with the access-denied state and "Request access" (not an empty table), and their APIs return 403.
- ACC-RBAC-2 An approved JIT grant for `platform.tenants.suspend` lets the user suspend a tenant until `expiresAt`, and `/auth/me` lists it; after expiry → 403.
- ACC-RBAC-3 No route under `/api/v1/platform/*` remains registered (404), except `/api/v1/platform/tracking/*` and control-tower routes, which move in WP-2.11.
- ACC-RBAC-4 rbac-matrix: every console route has a permission guard or is in the public allowlist; every dangerous route has MFA + reason.

## WP-1.2 Tenant control plane on the real API (B2)

Full contract in `20-service-catalogue.md` → platform.tenants. Summary:
- Backend list: search (name/slug/custom domain), filters (plan, effective plan, status, region, created range), sort, cursor pagination.
- MRR contribution comes from `mrrForSubscription()` (`services/revenue/mrr.service.ts`), defined here and reused by WP-3.1: plan price from `planService` for the billing cycle (annual ÷ 12), minus ACTIVE `PricingOverride` discounts, replaced by an ACTIVE `CustomContract` amount when one exists, converted to the platform base currency with `CurrencyRate`; 0 for DEMO and CANCELLED tenants. No literals.
- Detail: identity, effective plan + override + feature overrides, status + active suspensions, region + pending region request, usage (current month + 6), staff (count, admins, last login), subscription, recent impersonation sessions, recent activity (after WP-2.1; until then hide the tab).
- Actions (all `ActionDialog`, dangerous): suspend (category, internal reason, public reason), unsuspend (choose which active suspension to lift), plan override (plan `STARTER|PRO|ENTERPRISE`, reason, optional expiry), revoke override, feature override (WP-1.4), close tenant (WP-1.2b), impersonate (opens WP-1.10 flow pre-filled).
- Close tenant (replaces "delete"): `POST /api/internal/tenants/:id/close` (`platform.tenants.close` + MFA + reason + typed slug). Effects: suspension with `source: PLATFORM, category: OTHER`, `status: CANCELLED`, `closedAt`, `purgeAfter = now + 90 d`, Stripe subscription cancelled at period end if configured, tenant admins notified. Blocked with 409 `LEGAL_HOLD_ACTIVE` if a hold applies. Hard purge is **not** in this spec (needs its own ADR + owner approval).
- Frontend: rewrite `TenantsListPage`, `TenantDetailPage`, `TenantDetailTabs`, `PlanOverrideModal`, `SuspendDialog` against the API; delete the 3 seeds and the 220 generated rows; `TenantChip` everywhere; every row links to detail and to Customer 360.
- `RegionsPage` moves to `pillars/platform/tenants/RegionRequestsPage.tsx` (`/platform/tenants/region-requests`); the backend store stays in memory until WP-2.6.

**Acceptance:** ACC-TEN-1…10 (catalogue).

## WP-1.3 One suspension path (D3, C2)

- Migration 0039 + backfill.
- `services/tenant-suspension.service.ts` with the D3 API; all five callers migrated (WP-1.6 deletes caller 5).
- `GET /api/v1/tenants/me/suspension` for the tenant; `SuspendedOverlay` uses it (reason category, public reason, appeal status). Appeal creation sets `suspensionId` server-side.
- Gate test `single-suspension-path.test.ts`.
- Console `/trust/safety/suspensions` lists all `SuspensionRecord`s (all sources) with filters.

**Acceptance**
- ACC-SUS-1 Platform suspend creates an ACTIVE record with `source PLATFORM`, sets tenant status/`suspendedAt`/`suspensionReason`, audit row, notifies tenant admins (in-app row exists; email enqueued).
- ACC-SUS-2 Stripe `invoice.payment_failed` attempt 2 creates a `DUNNING` record; `invoice.paid` for that invoice lifts it with `via PAYMENT`.
- ACC-SUS-3 Two active causes: lifting one leaves the tenant SUSPENDED; lifting both makes it ACTIVE.
- ACC-SUS-4 Fraud decision `SUSPEND` creates a `FRAUD` record with `sourceRef` = signal id.
- ACC-SUS-5 Grep gate passes; a test file that writes `status: 'SUSPENDED'` directly fails it (self-test).

## WP-1.4 Entitlements honour overrides (§5 #12, S9 follow-up)

- Migration 0041; `services/tenant-entitlements.service.ts` (architecture §9.5); `tenantResolver` context carries `effectivePlan` + features; `requireFeature` and `planGuard` use them; Redis `plan-changed` subscriber invalidates caches.
- Routes: `GET/POST /api/internal/tenants/:id/feature-overrides`, `DELETE …/:overrideId` (`platform.flags.write`, dangerous).
- Impersonation token `plan` claim uses `effectivePlan` (already does via override lookup; switch to the service).
- Tenant portal: `GET /api/v1/tenants/me/entitlements`; `PlanGate` and `lib/plan-features.ts` consumers read it.
- `POST /api/internal/flags/:key/overrides` (501 since WP-0.7) now writes a `TenantFeatureOverride` for that key; LaunchDarkly mirroring waits for WP-4 flags.

**Acceptance**
- ACC-ENT-1 Override STARTER → PRO: a PRO-only backend route (`requireFeature`) returns 200 for that tenant within 5 s on any instance, without restart.
- ACC-ENT-2 Expired override: the route returns 403 `FEATURE_NOT_AVAILABLE` again.
- ACC-ENT-3 Feature override `enabled: false` on a PRO tenant blocks that feature only.
- ACC-ENT-4 Tenant portal hides/shows the gated UI from `/tenants/me/entitlements`, not from the static table.

## WP-1.5 Billing ledger kind (D4) → billing live

- Migration 0040 + backfill (dry-run output attached to the PR; production run waits for owner approval).
- Console billing routes filter `kind: PLATFORM` (toggle to view `TENANT_CUSTOMER` read-only with a clear label, for support investigations). Tenant finance routes filter `TENANT_CUSTOMER`. New `GET /api/v1/tenants/me/billing/invoices` (`PLATFORM`, own tenant).
- Gate test `ledger-kind.test.ts`.
- Billing pages: labelled inputs, error display, `MoneyCell` (no hardcoded GBP), ActionDialog for create invoice / credit note / refund, invoice detail shows payments → refunds → approvals.

**Acceptance:** ACC-BIL-6…10 (catalogue).

## WP-1.6 Delete legacy admin (P4-1, §8)

Delete, after confirming no references remain (`grep` in all apps):
- backend: `modules/super-admin/super-admin.routes.ts` and its registration (16 `/api/v1/admin/*` routes); the `/api/v1/admin` and `/api/v1/platform` branches in `tenant.resolver.ts:190` if no route uses them; 38 `SUPER_ADMIN` references reviewed one by one (tenant-side `UserRole.SUPER_ADMIN` checks in `authenticate.ts` stay only if a real caller exists, otherwise removed).
- console: `src/router/index.tsx`, `components/admin/ImpersonationBanner.tsx`, `LogsPanel`/`LogsPage`/`ForbiddenRoute` in `router.tsx`, the `AdminLayout` section (keep only `/admin/*` → new-path `<Navigate>` redirects covered by `e2e/legacy-redirects.spec.ts`), `pages/admin/DashboardPage.tsx` shimmer + mock sections, `pillars/trust/iam/api.ts` `updateStaffUser`, `pillars/trust/audit/api.ts` `fetchAuditEntry`, BadgeKeys `active-tenants`/`shipments-today`, `INVENTORY.md`, mock-only components (`ActivityFeed`, `AlertCard`, `MRRChart`, `MetricCard`, `ShipmentsChart`, `TenantTable`, `QueueMessageViewer`, `RevenueCharts`, `useDebouncedValue`) unless rewritten by this phase.
- `apps/admin/`: remove the workspace from the repo. **Removing the Railway service is a deletion of a deployed resource: ask the owner first.**
- `RelayPage` and `SupportAuditPage`: move the code to `pillars/customer/support/relay/` but leave it unrouted until WP-4.R makes it work (a live service must not own routes that 401).

**Acceptance**
- ACC-LEG-1 Legacy redirect suite passes.
- ACC-LEG-2 `grep -rn "api/v1/admin" apps/` returns nothing outside tests that assert 404.
- ACC-LEG-3 Console build output contains none of the deleted modules (bundle check or import graph test).

## WP-1.7 Just-in-Time access live (§4 JIT)

Contract in catalogue → trust.jit. Summary: request page uses `/jit/sessions/my`; `onRequest` errors shown; deny UI with reason; approver cannot approve own request; ROOT requests need hardware assertion; approvals visible in `/auth/me` within 60 s; JITGate on every `PermissionRoute`.

**Acceptance:** ACC-JIT-1…6.

## WP-1.8 Customer 360 isolation + TenantChip (P2-4, P3-7)

Contract in catalogue → customer.360. Per-tab queries, per-tab error boundaries, per-tab permission gates, real header (MRR from subscription + catalogue, last login from `User.lastLoginAt` max), no fabricated health (no score → "Not yet scored"), Config tab structured, counts paginated not capped. `TenantChip` adopted across `pillars/**` (grep gate).

**Acceptance:** ACC-C360-1…7.

## WP-1.9 Audit log UI

Debounced search (300 ms), server cursor pagination beyond 50, filters (actor, action, tenant, date range, target), export via existing export route, diff viewer for before/after. Chain integrity page shows the current verifier result with an explicit "two hash schemes — fixed in Phase 5" `DegradedBanner` until WP-5.1.

**Acceptance:** ACC-AUD-1…4.

## WP-1.10 Impersonation Center live

Contract in catalogue → platform.impersonation: tenant picker (no free-text `?tenant=t_N`), target user picker (active users of that tenant), scope choice, reason, duration; active sessions list with End; history with filters; per-session audit trail (tenant `AuditLog` rows with the session id).

**Acceptance:** ACC-IMP-7…10.

---

## Exit criteria

- [ ] All ACC IDs above green in CI (including ACC-FND-1…2).
- [ ] Manifest: tenants, impersonation, billing, customer360, jit, audit set `live` (iam has been live since Phase 0); reconciliation test green with check (d).
- [ ] e2e golden path: search tenant → open detail → override plan to PRO with expiry → the tenant's PRO-only endpoint works → suspend with public reason → tenant sees overlay with that reason → unsuspend → close a test tenant → Customer 360 reachable from the list row.
- [ ] No `/api/v1/admin` routes and no `/api/v1/platform` routes except tracking/control-tower (moved in WP-2.11); no legacy role map; `apps/admin` removed from the repo (Railway removal noted under "Needs approval" if not yet approved).
- [ ] Backfill dry-run outputs (0039, 0039a, 0040) attached to the PR.
