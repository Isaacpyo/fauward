# 01 — Cross-cutting Architecture

Everything here applies to every phase and every service. Service-specific detail is in `20-service-catalogue.md`.

---

## 1. Shape of the system after Phase 1

```
apps/super-admin (Vite SPA, console.fauward.com)
  └─ lib/console-api.ts ── one axios client: CSRF, 401→refresh, MFA step-up, error normalisation
        │  cookie session (fw_platform_access 15 min, fw_platform_refresh 7 d, fw_platform_csrf)
        ▼
apps/backend  /api/internal/*   (the only console namespace)
  authenticateConsoleSession → requireConsolePermission(p) [+ requireFreshMfa + requireReason for dangerous]
  modules/internal/<pillar>/<service>.routes.ts → services/*.service.ts → Prisma (system context, explicit tenantId)
        │                                   │
        │  writes                           ├─ TenantSuspensionService  (D3)
        ▼                                   ├─ PlatformNotifier         (D6) → notificationQueue → worker → SendGrid/in-app
  PlatformAuditLog (one row per mutation)   ├─ recordActivity           (D7) → PlatformActivity → Redis console:activity → SSE
                                            ├─ resolveTenantEntitlements (§9.5)
                                            └─ vendors/<vendor>.adapter (D9)

apps/tenant-portal ── /api/v1/* (tenant JWT) ── producers of tickets, appeals, DSAR, region/plan requests, feedback…
```

## 2. Console authentication and MFA (WP-0.1)

### 2.1 Policy
- MFA (TOTP) is mandatory for every staff account. There is no production bypass. `CONSOLE_MFA_REQUIRED` defaults to `true`. It may be set `false` only when `NODE_ENV=development` and the backend logs a warning at boot.
- A session is created at password login with `mfaVerifiedAt = null`. Until MFA is verified, the session is **MFA-pending**: `authenticateConsoleSession` allows only `auth/me`, `auth/mfa/enroll/*`, `auth/mfa/verify` and `auth/logout`, and every other route gets 401 `{ error: 'MFA_PENDING' }`.
- Dangerous actions additionally need **fresh MFA** (verified ≤ 10 min ago) and a **reason** of at least 8 characters (20 for impersonation `write` scope).

### 2.2 Endpoints (final paths; Phase 0 also keeps `/api/v1/platform/auth/*` mounted)

| Method | Path | Guard | Behaviour |
|---|---|---|---|
| POST | `/api/internal/auth/login` | rate limit 10/min | Verifies password. Creates session (`mfaVerifiedAt: null`). Response `{ mfa: 'VERIFY' \| 'ENROLL', user }`. Never sets `mfaVerifiedAt`. |
| POST | `/api/internal/auth/mfa/enroll/start` | MFA-pending or full session, CSRF | Only when `mfaEnabled = false`. Generates a TOTP secret, stores it **encrypted** in `PlatformUser.mfaPendingSecretEncrypted`, returns `{ otpauth, qrCode }`. |
| POST | `/api/internal/auth/mfa/enroll/confirm` | MFA-pending, CSRF | Body `{ code }`. Verifies against the pending secret, moves it to `mfaSecretEncrypted`, sets `mfaEnabled`, `mfaEnrolledAt`, `StaffUser.mfaEnabled`, sets session `mfaVerifiedAt = now`, re-issues the access token **with permissions**. Audit `PLATFORM_MFA_ENROLLED`. |
| POST | `/api/internal/auth/mfa/verify` | session, CSRF | Body `{ code }`. Decrypts the secret, verifies, sets `mfaVerifiedAt`, re-issues the access token **with permissions** (fixes C3). Rate limit 5/min per session; 10 failures in 15 min revoke the session. |
| POST | `/api/internal/auth/refresh` | CSRF | Unchanged semantics; also rejects suspended staff (§2.3). |
| POST | `/api/internal/auth/logout` | session, CSRF | Unchanged. |
| GET | `/api/internal/auth/me` | session (MFA-pending allowed) | `{ user, mfa: { enabled, verifiedAt, pending }, roles, permissions, jit: [{ permission, expiresAt }] }` |
| POST | `/api/internal/iam/users/:id/mfa/reset` | `trust.iam.write` + fresh MFA + reason | Clears MFA for another staff member (lost device). Revokes their sessions. Cannot target self. |

Remove the admin-driven `POST /api/internal/iam/users/:id/totp-enrollment` that returns another person's secret to the admin. Enrolment is self-service only; admins can only reset.

### 2.3 Session validity
`authenticateConsoleSession` (renamed from `authenticatePlatformSession`) loads the `PlatformUser`, the `PlatformSession` **and** the linked `StaffUser`. It rejects when the staff status is `SUSPENDED` or `OFFBOARDED` (S4). Suspending or offboarding staff in IAM revokes all their `PlatformSession`s in the same transaction.

### 2.4 Fresh-MFA guard
`requireFreshMfa` (replaces `requireFreshPlatformMfa`):
- `user.mfaEnabled === false` → 403 `{ error: 'MFA_ENROLLMENT_REQUIRED' }`
- `mfaVerifiedAt` missing or older than 10 min → 403 `{ error: 'MFA_REQUIRED', stepUp: true }`

### 2.5 Frontend
- `LoginPage` → on `mfa: 'VERIFY'` show a code step; on `'ENROLL'` show QR + confirm. Redirect already-authenticated users away from `/login`. Remove the fake 1200 ms delay.
- `MfaStepUpModal` mounted once in `ShellLayout`. The console API client (§5) opens it on `MFA_REQUIRED`, waits for verify, then retries the original request once.
- `SuperAdminGuard`: 401 → `/login`; `MFA_PENDING` → MFA step; 5xx/network → full-page error with Retry. It must never treat a 500 as "denied".

### 2.6 TOTP secret storage
`mfaSecretEncrypted` holds AES-256-GCM ciphertext from the field-encryption service (§9.1). WP-0.1 includes a one-time migration script that encrypts existing plaintext secrets in place (detects plaintext by the absence of the `v1:` prefix).

---

## 3. One namespace (WP-1.1)

All console endpoints live under `/api/internal/*`. Path moves:

| Today (`/api/v1/platform`) | Target (`/api/internal`) | Permission |
|---|---|---|
| `auth/*` | `auth/*` | — |
| `GET tenants`, `GET tenants/:id` | `GET tenants`, `GET tenants/:id` | `platform.tenants.read` |
| `PATCH tenants/:id/plan-override` | `POST tenants/:id/plan-overrides` (+ `DELETE …/plan-overrides/:overrideId`) | `revenue.subscriptions.override` + fresh MFA + reason |
| `POST tenants/:id/suspend` / `unsuspend` | same paths | `platform.tenants.suspend` + fresh MFA + reason |
| `POST tenants/:id/impersonation-sessions` | `POST impersonation/sessions` (`tenantId` in body) | `platform.impersonation.start` (+ `.mutate` for write) + fresh MFA + reason |
| `DELETE impersonation-sessions/:id` | `DELETE impersonation/sessions/:id` | `platform.impersonation.start` |
| `GET impersonation-sessions/active` | `GET impersonation/sessions?status=active` | `platform.impersonation.start` |
| `GET metrics` | `GET metrics/overview` | session only; money fields need `revenue.analytics.read` (WP-3.1) |
| `GET queues` | `GET queues` | `platform.queues.read` |
| `GET health` | `GET health` | `platform.health.read` |
| `GET/PATCH region-change-requests` | `GET/POST tenants/region-requests[/:id/decision]` | read: `platform.tenants.read`; decide: `platform.tenants.write` + fresh MFA + reason |
| `GET logs` | `GET comms/delivery-log` | `customer.comms.read` (sensitive: + fresh MFA + reason) |
| `GET audit` | merged into `GET audit` (existing internal) | `trust.audit.read` |
| `GET relay` (stub) | deleted; Relay moves in WP-4.x | — |

Delete: `services/platform-permission.service.ts` role map, `middleware/require-platform-permission.ts`, `requireAnyPlatformPermission`, the inline legacy check (C4), `lib/api.ts` and `lib/internal-api.ts` in the console (replaced by `console-api.ts`), the `/api/v1` rewrite in `apps/super-admin/vercel.json` if nothing else uses it, and the `/api/v1/platform` and `/api/v1/admin` prefixes in `tenant.resolver.ts:190` once they have no routes.

Out of scope for the move: `/api/v1/platform/tracking/*` and control-tower routes. They move to console auth in WP-2.11.

---

## 4. Permissions (WP-1.1, WP-1.7)

- Backend: `requireConsolePermission(permission)` = current `requireInternalPermission` + per-request cache (`request.console.permissions`) + JIT. Also `requireAnyConsolePermission([...])` for read routes shared by two services.
- Permission catalogue: `packages/internal-rbac/src/permissions.ts` stays the source. Additions (all in this spec): `platform.tenants.close` (replaces `platform.tenants.delete` semantics, see the tenants service), `trust.compliance.dsar.deliver`, `platform.queues.purge`. Every addition goes into `ROLE_PERMISSIONS` in the same PR. Every other permission the spec uses already exists in `permissions.ts`, including `revenue.invoices.refund.large`, `platform.queues.replay`, `platform.jobs.trigger`, `trust.iam.root`, `gtm.trials.extend`, `gtm.contracts.discount.large`, `customer.comms.send` and `customer.feedback.write`.
- `trust.jit.request` is added to every role.
- Permissions of deferred services (`revenue.recognition.*`, `revenue.commissions.*`, `customer.kb.*`, `gtm.partners.*`, `gtm.pricing.*`) stay in the catalogue because the manifest references them, and are listed in `DEFERRED_PERMISSIONS` in `@fauward/internal-rbac`. No route uses them; the rbac-matrix test asserts that.
- The frontend never derives permissions from roles. `buildPermissionContext` and its `legacyPermissionMap`/`roleMap` are deleted. `PermissionProvider` takes `permissions` from `/auth/me`. The `useMe()` query refetches every 60 s, on window focus and after any IAM/JIT mutation.
- UI rule: an action the user cannot perform is rendered disabled with the tooltip "Requires `<permission>`" and a "Request access" link that opens the JIT request dialog pre-filled. It is never hidden silently and never shown enabled. The same applies to pages and tabs: without the read permission they render an access-denied state with "Request access", never an empty table and never a silently missing tab. Sidebar entries stay visible with a lock icon.
- Test: `rbac-matrix.test.ts` is extended to (a) every route file under `modules/internal/**`, (b) assert every route has `requireConsolePermission` or is in one of two explicit allowlists: public (auth, HMAC vendor webhooks) and session-only (`/auth/me`, `/notifications/staff*`, and `/activity/stream`, `/badges`, `/search`, `/metrics/overview`, which filter their output by the caller's permissions), (c) assert dangerous routes (listed in `dangerous-routes.ts`) include `requireFreshMfa` and `requireReason`.

---

## 5. Console API client (WP-0.2)

`apps/super-admin/src/lib/console-api.ts`:

- One axios instance, `baseURL: '/api/internal'` (Phase 0: a second instance with `baseURL: '/api/v1/platform'` shares the same interceptors until WP-1.1 deletes it).
- Request: CSRF header on mutating methods; `Idempotency-Key` header when the caller passes `{ idempotent: true }` (UUID per user action, reused on retry).
- Response 401 (`Unauthorized`): one shared refresh (queue concurrent requests), retry once, else redirect to `/login?next=`.
- Response 401 `MFA_PENDING`: route to the login MFA step.
- Response 403 `MFA_REQUIRED`: open `MfaStepUpModal` via an event bus, then retry once.
- Response 403 `MFA_ENROLLMENT_REQUIRED`: route to the enrolment step.
- Errors normalised to `ConsoleApiError { status, code, message, permission?, vendor?, degraded? }`. Pages render these. Nothing is swallowed.
- Typed helpers per service live in `pillars/<pillar>/<service>/api.ts` using react-query. Query keys are `[service, resource, params]`.

---

## 6. Service page kit (WP-0.3 for shell pieces, WP-1.2 onward for pages)

### 6.1 Folder contract
```
apps/super-admin/src/pillars/<pillar>/<service>/
  routes.tsx         export const routes: ServiceRoute[]  (path, element, permission)
  api.ts             typed react-query hooks; no axios calls in components
  <Name>Page.tsx     one file per route
  components/        dialogs, tables specific to the service
  <service>.test.tsx component tests (vitest + testing-library) when logic exists
```

### 6.2 Kit components (`apps/super-admin/src/components/service-kit/`, built on `@fauward/internal-ui`)

| Component | Contract |
|---|---|
| `ServiceHeader` | Title, manifest status pill, "Last activity" from `/activity/summary`, primary action (must open a real dialog or navigate; a `primaryAction` with no handler fails type-check) |
| `ServiceTable` | `DenseTable` + server pagination (cursor), filters in the URL query string, clickable rows → detail route, `TenantChip` for any tenant column, empty state with cause |
| `DetailLayout` | Header + tabs + side panel; 404 state for unknown id |
| `ActionDialog` | zod-validated form; `reason` field when `dangerous`; permission check; disables on submit (no double submit); sends `Idempotency-Key`; shows a human-readable result plus a link to the created/affected record; invalidates the right queries |
| `ConfirmByTyping` | Destructive confirm (type the tenant slug) |
| `DegradedBanner` | `variant: 'vendor-unconfigured' \| 'vendor-error' \| 'not-wired' \| 'preview'`, names the env var or WP that fixes it |
| `ComingSoonPage` | For deferred services: owner, reason, ADR link |
| `MoneyCell` | Formats the API's decimal string with currency; never assumes GBP |
| `TenantPicker` | Search-as-you-type over `GET /api/internal/tenants?search=` (debounced 250 ms) |

Rendering rules: no `JSON.stringify` in the UI except inside `DiffViewer`/`MonoCell` for audit payloads; no hardcoded numbers, sample rows, "placeholder" strings or fake delays; no toast claiming success before the API confirms.

### 6.3 Router
`router.tsx` builds service routes from `PILLARS` + each service's `routes` export, wrapped in `PermissionRoute`. Deferred services map to `ComingSoonPage`. The legacy `AdminLayout` block and `/admin/*` pages are removed in WP-1.6 (keep the `/admin/*` → new-path redirects that the Playwright legacy-redirect suite covers).

### 6.4 Badges (WP-3.4)
One endpoint `GET /api/internal/badges` returns `{ [badgeKey]: { value, tone, asOf } \| { notWired: true } }` for the keys the caller can see. `badges.ts` reads it. A `BadgeKey` that has no backend computation is removed from the type. Placeholder badges are not allowed.

---

## 7. Data access conventions

- **System context (C6).** Console requests run with `isSuperAdmin: true`, so the Prisma tenant middleware does not scope them. Therefore:
  - a route about one tenant takes `tenantId` from the path or body, verifies the tenant exists, and puts `tenantId` in **every** `where`;
  - a cross-tenant list route is permission-gated, paginated (`take ≤ 100`, cursor), and returns `tenantId` + tenant name for every row;
  - writes to tenant-scoped models from console routes set `tenantId` explicitly.
- **Workers** wrap bodies in `tenantStorage.run(systemContext(), …)` (or the tenant's context when acting for one tenant). Every `void fn()` gets `.catch((err) => app.log.error({ err }, '…'))`.
- **Validation:** zod schemas per route (the backend already uses zod in 27 files). Shared request/response types for console services go in `packages/shared-types/src/console/<service>.ts` and are imported by both apps.
- **No untyped delegates.** The `delegate(app, name)` / `optionalDelegate` pattern in `console-phases.routes.ts` is removed as each service moves to its own module. No `as unknown as` casts on Prisma.
- **Money:** `Decimal(12,2)` major units, serialised as strings; `currency` always returned alongside.
- **Time:** ISO 8601 UTC strings in APIs; rendered in the viewer's locale with the timezone shown.
- **Errors:** `reply.status(x).send({ error: CODE, message })` is the existing convention in these modules and is acceptable. `app.httpErrors.*` is preferred in new modules. Never `throw new Error()` in handlers.

---

## 8. Backend module layout

```
apps/backend/src/modules/internal/
  auth/console-auth.routes.ts           (moved from platform.routes.ts)
  platform/tenants.routes.ts, impersonation.routes.ts, flags.routes.ts, queues.routes.ts, health.routes.ts,
           jobs.routes.ts, incidents.routes.ts, integrations.routes.ts, database.routes.ts
  revenue/billing.routes.ts (exists, moved), dunning.routes.ts, subscriptions.routes.ts, disputes.routes.ts,
          tax.routes.ts, analytics.routes.ts
  customer/support.routes.ts, customer360.routes.ts (exists, moved), success.routes.ts, feedback.routes.ts,
           comms.routes.ts, qbr.routes.ts, onboarding.routes.ts
  trust/iam.routes.ts (exists, moved), jit.routes.ts, audit.routes.ts (exists, moved), compliance.routes.ts,
        safety.routes.ts, kyc.routes.ts, secrets.routes.ts, security.routes.ts
  gtm/pipeline.routes.ts, trials.routes.ts, demos.routes.ts, contracts.routes.ts, attribution.routes.ts, handoff.routes.ts
  shell/activity.routes.ts, badges.routes.ts, metrics.routes.ts, notifications.routes.ts, search.routes.ts
  route-index.ts      exports the list of registered console routes (used by the reconciliation test)
  register.ts         registerConsoleRoutes(app) – the only console registration call in app.ts
```

`console-phases.routes.ts` shrinks service by service and is deleted at the end of Phase 4. Business logic lives in `apps/backend/src/services/<domain>.service.ts`, not in route files.

---

## 9. Shared backend services

### 9.1 Field encryption — `services/crypto/field-encryption.ts` (WP-0.1)
AES-256-GCM. Ciphertext format `v1:<keyId>:<iv b64>:<tag b64>:<ct b64>`. Keys from `FIELD_ENCRYPTION_KEYS` (JSON map `keyId → 32-byte base64`) and `FIELD_ENCRYPTION_ACTIVE_KEY_ID`. Boot fails in production if missing. Used for TOTP secrets, `TenantSettings.paymentGatewayKey`, tenant gateway secrets (WP-2.12), `TenantSettings.webhookSecret`. Generate the key locally, put it in `apps/backend/.env` (gitignored) and in Railway's secret store; never commit it; list it in the PR report.

### 9.2 Dangerous-action pre-handler
```ts
dangerous(permission: Permission, opts?: { minReason?: number }) =>
  [authenticateConsoleSession, requireCsrf, requireConsolePermission(permission), requireFreshMfa, requireReason(opts?.minReason ?? 8)]
```
Every route marked `D:` in `20-service-catalogue.md` is dangerous; the catalogue is authoritative. `modules/internal/dangerous-routes.ts` lists them (method + path), each WP adds its `D:` rows to that file in the same commit, and the rbac-matrix test asserts every listed route uses `dangerous()`.

### 9.3 TenantSuspensionService — D3.
### 9.4 PlatformNotifier — D6.
### 9.5 Entitlements — `services/tenant-entitlements.service.ts` (WP-1.4)
```ts
resolveTenantEntitlements(db, tenant): Promise<{ billingPlan, effectivePlan, planOverride?, features: Record<FeatureKey, { enabled, source: 'plan' | 'override' }>, limits }>
```
- `effectivePlan` = active, unexpired `TenantPlanOverride` ?? `tenant.plan`.
- `features` = `planService` features for `effectivePlan`, then `TenantFeatureOverride` rows applied.
- `tenantResolver` puts `effectivePlan` and the feature map in the tenant context (cached in Redis `tenant:<id>:entitlements`, 5 min TTL). `requireFeature` and `planGuard` read the context, not `tenant.plan`.
- The Redis `tenant:<id>:plan-changed` publish gets a subscriber (`services/tenant-cache.subscriber.ts`) that deletes the entitlements cache on every instance.
- Tenant portal: `GET /api/v1/tenants/me/entitlements` replaces the static checks in `lib/plan-features.ts` / `PlanGate` (keep the static table only as a type source).

### 9.6 Activity — D7. ### 9.7 Vendor adapters — D9.

### 9.8 Storage adapter — `services/storage/export-storage.ts` (WP-2.5)
`put(key, bytes, contentType) → { provider, key, byteSize, sha256 }`, `get(key)`, `delete(key)`. Implementations: Supabase Storage (bucket `compliance-exports`, private) when `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set; otherwise Postgres `ExportBlob` (bytea, max 25 MB, larger exports fail with a clear status). Downloads always go through an authenticated backend endpoint that streams the bytes and records `downloadedAt`. No raw storage URL is ever returned to a tenant.

### 9.9 Console search — `GET /api/internal/search?q=` (WP-1.2)
Returns tenants (name/slug/domain), staff, tickets (number), invoices (number) the caller can read. Feeds `CommandPalette` (its hardcoded entries are removed).

---

## 10. Jobs

- All scheduled jobs register in `queues/scheduled.worker.ts` through `registerScheduledJob({ name, pattern, handler, timeoutMs })`. The wrapper writes a `ScheduledJobRun` row (start, finish, status, duration, error, triggeredBy) — WP-3.8.
- On-demand jobs for one entity (DSAR gather, QBR generate) use a dedicated queue `console-jobs` with job names `<pillar>.<verb>` and `jobId` = entity id (dedupe).
- Every job is idempotent and safe to retry. Every job body runs inside `tenantStorage.run(...)`.
- New scheduled jobs in this spec: `platform.activity-prune` (daily), `platform.integration-health-poll` (5 min), `revenue.dunning-advance` (hourly), `trust.secret-inventory` (daily + boot), `trust.audit-chain-verify` (nightly, P5), `customer.nps-survey-dispatch` (daily), `trust.kyc-rescreen-monthly` (rename of `trust.sanctions-quarterly-rescreen`, P4-4), `platform.impersonation-expiry-sweep` (5 min, closes expired sessions and records end time).
- Also new: `customer.support-sla-sweep` (15 min), `customer.playbook-executor` (10 min), `gtm.hubspot-import` (nightly, only when configured). On-demand on `console-jobs`: `trust.dsar-gather`, `trust.dsar-erase`, `customer.qbr-generate`.
- Deleted: `revenue.commission-aggregation`.

---

## 11. Testing conventions

- **Acceptance test IDs:** `ACC-<SERVICE>-<n>` (for example `ACC-TEN-3`). Each acceptance criterion in `20-service-catalogue.md` maps to at least one test whose name starts with its ID, so `grep -r "ACC-TEN-3"` finds the proof.
- **Backend route tests:** vitest + `app.inject`, following `routes/internal/console-phases.test.ts` (mocked session/permissions). Every dangerous route has tests for: 403 without permission, 403 `MFA_REQUIRED` with stale MFA, 400 `REASON_REQUIRED`, 200 with the effect asserted, audit row written.
- **Backend workflow tests:** against the real Postgres (`TEST_DATABASE_URL`, CI service already exists) for anything with a transaction or a cross-model effect (suspension, appeals, DSAR, plan change, refunds). Use `describe.runIf(process.env.TEST_DATABASE_URL)` so local runs without a DB skip cleanly; CI must run them.
- **Console e2e:** Playwright in `apps/super-admin/e2e/`, with `page.route` mocks following `console-workflows.spec.ts`. One spec file per service: `e2e/<pillar>-<service>.spec.ts`. Each covers: page renders real fixture data, primary action round-trip (request body asserted), permission-denied state, empty state, error state.
- **Tenant-portal e2e/component tests** for each tenant touchpoint in `21-tenant-loop-map.md`.
- **Golden paths** (each phase's exit criteria) must exercise the real backend: Playwright against the backend + Postgres + Redis on the VM slot (preferred), or a backend integration test that chains the same API calls. Mocked-API e2e alone does not satisfy an exit criterion.
- **Gate tests** (fail CI on regression):
  - `manifest.reconcile.test.ts` (D1)
  - `rbac-matrix.test.ts` extended (§4)
  - `no-fake-data.test.ts`: forbids `sampleRows`, `placeholder` (case-insensitive) in rendered strings, `Math.random()` and `setTimeout(` used to simulate work, and literal currency amounts in `apps/super-admin/src/pillars/**` and `apps/tenant-portal/src/{pages,components}/**` (allowlist file for legitimate uses)
  - `no-direct-notification-log.test.ts` (D6)
  - `single-suspension-path.test.ts` (D3): no `status: 'SUSPENDED'` writes outside the service
  - `ledger-kind.test.ts` (D4): every Prisma call on Invoice/Payment/Refund/CreditNote names `kind`
- **Commands:** `npm run typecheck`, `npm run lint`, `npm run test`, `npx playwright test` from the repo root. Backend DB-backed tests need the VM Postgres: `n=$(bash scripts/vm-slot.sh claim)`, `up $n`, `tunnel $n`, then `TEST_DATABASE_URL` from `env $n`. Never run Docker locally.

---

## 12. Definition of done — service `live`

A service may be set `status: 'live'` only when all of these are true and listed in the PR:

1. Dedicated folder with `routes.tsx`, `api.ts`, pages; no generic Ops pages.
2. Every read endpoint returns real data; empty and degraded states name their cause.
3. Every action produces its documented effect; the effect is asserted by a test.
4. Every mutation: permission-gated on both sides, one `PlatformAuditLog` row, one `PlatformActivity` row (from WP-1.0 onward; iam is retrofitted in WP-1.0), dangerous ones behind MFA + reason.
5. Tenant touchpoint (if any) works both ways, tested on the tenant side.
6. Works with zero vendor env vars (vendor-free default); a failing vendor yields `DegradedBanner`, not a crash.
7. All `ACC-<SERVICE>-*` tests pass in CI; the e2e spec exists.
8. `TenantChip` for every tenant reference; rows link to detail pages and to Customer 360.
9. No item from re-audit §4/§8 for this service remains open (cross-check the service row in `20-service-catalogue.md`).

---

## 13. Ways of working

- Branch per phase from `master` (`console/p<N>-<slug>`). Phase 0 branches from `chore/vm-docker-setup` if that branch (VM Docker tooling, 3 commits ahead of `master` on 2026-10-17) is not merged yet; one commit per work package (`console(WP-1.2): tenants list on real API`); PR at phase end with the exit-criteria checklist filled in. Small PRs per WP are fine if the owner prefers.
- Migrations: continue numbering after `0035_agent_conversations`. Create with `prisma migrate dev --create-only`, review the SQL, then apply. Never `migrate reset`. Destructive migrations (drops, type narrowing) go in their own migration with a pre-check script and need owner approval before production.
- Backfills are scripts in `apps/backend/src/scripts/backfills/<nnnn>-<name>.ts`, idempotent, with `--dry-run` printing counts.
- Docker only on the Oracle VM via `scripts/vm-slot.sh` (see `CLAUDE.md`).
- Databases: the main checkout's backend `.env` points at the Supabase cloud database (C10). Implementation work happens in a git worktree on its own VM slot with env files sanitised by `console-run/safe-env.mjs`. No migration, backfill or DB-backed test ever runs against a non-localhost database.
- Secrets: generated as needed, stored in gitignored `.env` files and Railway/Vercel secret stores, never committed, listed in the phase report.
- Ask the owner first for: production data deletion, DNS/billing/account-security changes, sending email to people outside Vitalos, spending money, removing a deployed service (for example `apps/admin` on Railway).

---

## 14. Reuse, don't rebuild (re-audit §9.3)

These are real and are moved or extended, never rewritten from scratch:

| Asset | How this spec uses it |
|---|---|
| `platform.routes.ts` tenant list/detail/suspend/override/impersonation handlers | Moved to `modules/internal/platform/*` (WP-1.1); logic kept, guards and suspension path changed |
| `internal/billing.routes.ts` | Moved to `revenue/billing.routes.ts`; money fixes (WP-0.6) and `kind` filter (WP-1.5) |
| `internal/iam.routes.ts` | Kept; S2–S5/S10/S17 fixes |
| `internal/audit.routes.ts` read side | Kept; pagination/filters (WP-1.9); verifier replaced in P5 |
| `customer360.routes.ts` aggregate | Split into per-tab endpoints reusing its queries |
| `announcements`, `appeals`, `dsar` request side, `support` ticket CRUD | Extended (receipts, suspension link, request types, audience) |
| JIT request/approve/revoke (`console-phases.routes.ts:733-815`) | Moved to `trust/jit.routes.ts`; fixes in WP-1.7 |
| `scheduled.worker.ts` jobs (health scoring, anomaly scan, trial activation, demo expiry) | Wrapped by `registerScheduledJob`; inputs fixed where the spec says |
| `notificationQueue` + `notifications.worker.ts` + `sendEmail` + `createInAppNotifications` | The delivery path for `PlatformNotifier` (D6) |
| `packages/internal-ui` (`DenseTable`, `EmptyState`, `JITGate`, `TenantChip`, `HealthPill`, `ReasonModal`, `DiffViewer`, `MonoCell`) | Base of the service kit (§6.2) |
| `packages/internal-rbac` permission catalogue + `ROLE_PERMISSIONS` | Single permission source (D2) |
| `packages/internal-audit` `computeEntryHash` | The single hash scheme (WP-5.1) |
| Vendor webhook HMAC verification (`console-phases.routes.ts:131-135`) | Kept as-is inside the vendor adapters |
| Playwright `e2e/legacy-redirects.spec.ts`, `console-workflows.spec.ts` | Kept green; new specs follow their mocking pattern |
