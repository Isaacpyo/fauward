# Phase 0 — Unblock

**Outcome:** a staff user can log in, enrol or verify MFA, and complete a dangerous action end to end. No page silently goes empty, no sidebar link bounces to `/login`, and the P0 security holes are closed.
**Branch:** `console/p0-unblock` · **Closes:** B1, B3, B4, S1–S4, S6, S8, S10, S17, S18, refund integrity, ADR 0002 Phase-0 snapshot. S5, S7 and S9 get their Phase 0 part here and close in Phases 1 and 4.
**Order:** WP-0.1 → 0.2 → 0.3 → 0.4 → 0.5 → 0.6 → 0.7. WP-0.4 to 0.7 are independent of each other once 0.1 and 0.2 land.

---

## WP-0.1 Console MFA (B1, S1, S10, C3)

**Backend**
- `services/crypto/field-encryption.ts` (architecture §9.1) + unit tests (round-trip, tamper → throws, unknown key id → throws, production boot without keys → fails).
- Migration 0036 + backfill `0036-encrypt-totp-secrets.ts`.
- `platform.routes.ts` login: remove `mfaVerifiedAt = user.mfaEnabled ? null : null`; always create the session with `mfaVerifiedAt: null`; respond `{ mfa: user.mfaEnabled ? 'VERIFY' : 'ENROLL', user }`.
- Add `mfa/enroll/start`, `mfa/enroll/confirm`; fix `mfa/verify` to decrypt and to re-issue the token **with** `permissions` (architecture §2.2). Mount under both `/api/v1/platform/auth/*` and `/api/internal/auth/*` (same handlers) for this phase.
- `authenticatePlatformSession`: MFA-pending sessions are restricted to the allowlist in architecture §2.1.
- `requireFreshPlatformMfa` → enrolment-aware (§2.4). Keep the old export name as an alias until WP-1.1.
- `iam.routes.ts`: replace admin `totp-enrollment` with `POST /api/internal/iam/users/:id/mfa/reset` (dangerous). Encrypt on every write path.
- `platform:admin:create` script: create the user with no MFA (they enrol at first login) and print that instruction.

**Frontend (`apps/super-admin`)**
- `LoginPage`: password → MFA verify or enrol step (QR from `qrCode` data URL, 6-digit input, paste support). Redirect authenticated users away from `/login`. Remove `SUCCESSFUL_LOGIN_DELAY_MS`.
- `MfaStepUpModal` in `ShellLayout`, driven by the console API client (WP-0.2).
- IAM `UserDetailPage`: replace the "enrol TOTP" button with "Reset MFA" (dangerous action dialog).

**Acceptance**
- ACC-AUTH-1 Login with correct password returns `mfa: 'ENROLL'` for a user without MFA; any `/api/internal/*` call except the allowlist returns 401 `MFA_PENDING`.
- ACC-AUTH-2 Enrol start → confirm with a valid code sets `mfaEnabled`, stores `v1:` ciphertext, sets `mfaVerifiedAt`, and the new access token carries `permissions`.
- ACC-AUTH-3 Verify with a wrong code 5 times hits the rate limit; 10 failures in 15 min revoke the session.
- ACC-AUTH-4 A dangerous route with `mfaVerifiedAt` 11 min old returns 403 `MFA_REQUIRED` + `stepUp: true`; for an unenrolled user it returns `MFA_ENROLLMENT_REQUIRED`.
- ACC-AUTH-5 Backfill encrypts plaintext secrets; running it twice changes nothing.
- ACC-AUTH-6 (e2e) Login → enrol → land on dashboard; later a dangerous action opens the step-up modal and succeeds after a code.

## WP-0.2 One console API client (B3)

- New `apps/super-admin/src/lib/console-api.ts` per architecture §5. Export `consoleApi` (`/api/internal`) and, for this phase only, `platformApi` (`/api/v1/platform`) sharing interceptors.
- Replace every import of `@/lib/api` and `@/lib/internal-api` (keep those files as one-line re-exports until WP-1.1 deletes them).
- `SuperAdminGuard`: 401 → login; `MFA_PENDING` → MFA step; anything else → `ConsoleErrorScreen` with Retry. Read `/auth/me` through `useMe()` (react-query, refetch on focus and every 60 s).
- `InternalOpsPage` / `WorkflowOpsPage`: render `ConsoleApiError` (status, code, permission) instead of an empty table when a query fails.

**Acceptance**
- ACC-CLIENT-1 An `/api/internal` call returning 401 triggers exactly one `/auth/refresh` (even with 5 concurrent requests) and retries each request once.
- ACC-CLIENT-2 Refresh failure redirects to `/login?next=<path>`.
- ACC-CLIENT-3 403 `MFA_REQUIRED` opens the step-up modal; after verify, the original request is replayed once with the same `Idempotency-Key`.
- ACC-CLIENT-4 `/auth/me` returning 500 shows the error screen, not the login page.
- ACC-CLIENT-5 (e2e) With the access cookie expired, navigating to `/revenue/dunning` shows data, not an empty state.

## WP-0.3 Manifest truth (D1, B4)

- `PillarServiceManifest`: add `status`, `livePhase`, `routes[]`; set statuses to the ADR 0002 Phase-0 snapshot.
- `ComingSoonPage`, `PreviewBanner`; sidebar, `CommandPalette` and pillar overview read `status` (deferred hidden, preview pill).
- Router: register the 7 unrouted paths. `/customer/360` → `Customer360IndexPage` (a `TenantPicker` over `GET /api/v1/platform/tenants?search=`; selecting navigates to `/customer/360/:tenantId`). `/platform/jobs`, `/platform/database`, `/revenue/disputes`, `/revenue/recognition`, `/customer/feedback`, `/customer/kb` → `ComingSoonPage`.
- Every `OpsRoute` page for a `preview` service shows `PreviewBanner` naming what is not wired (text from the service row in `20-service-catalogue.md`).
- `apps/super-admin/src/pillars/manifest.reconcile.test.ts` (D1 checks a–c now; check d once `route-index.ts` exists in WP-1.1).
- Fix the manifest's JIT permission: `trust.jit.request` (was `trust.iam.read`).

**Acceptance**
- ACC-MAN-1 Every manifest route resolves to a non-catch-all route (reconciliation test).
- ACC-MAN-2 (e2e) Clicking each of the 41 sidebar/overview entries never lands on `/login` for a logged-in user.
- ACC-MAN-3 `/customer/360` shows the tenant picker; choosing a tenant opens its 360 page.
- ACC-MAN-4 Deferred (not planned) services show `ComingSoonPage` and are absent from the sidebar and palette; planned services without a page show `ComingSoonPage` with their target phase and keep a Preview sidebar entry.

## WP-0.4 Staff IAM controls (S2, S3, S4, S5)

- S2: delete `ROOT_HARDWARE_ASSERTION_FALLBACK` (`iam.routes.ts:15,28`) and the same fallback in `console-phases.routes.ts:741-742`. If `DEV_HARDWARE_KEY_ASSERTION` is unset: in production every ROOT grant/JIT ROOT returns 503 `ROOT_GRANT_UNAVAILABLE`; in development it also refuses (no literal default). Document the variable in `apps/backend/.env.example`.
- S3: resolve the caller's `StaffUser` (`staffUser.findUnique({ where: { platformUserId } })`) and compare `body.staffId` to that id. Apply the same check to revoke and to JIT approve (cannot approve own request).
- S4: IAM staff suspend/offboard sets `StaffUser.status`, sets `PlatformUser.status = DISABLED`, revokes all `PlatformSession` rows, in one transaction. `authenticatePlatformSession` also rejects when the linked `StaffUser.status !== 'ACTIVE'` (architecture §2.3).
- S5: `ensureStaffUserForPlatformUser` adds the legacy-mapped role only when it creates the `StaffUser`. It never re-adds roles to an existing staff user. Move `seedStaffRoles` out of the per-request path (boot + script).
- IAM UI: role assignment through an `ActionDialog` with confirm + free-text reason (no assign-on-select, no hardcoded reasons); the create form is gated by `trust.iam.write`.
- Delete `POST /api/internal/iam/sso/google/callback` (an authenticated upsert, not OAuth).

**Acceptance**
- ACC-IAM-1 With `DEV_HARDWARE_KEY_ASSERTION` unset, granting ROOT returns 503 and sending `'dev-hardware-key'` does not work.
- ACC-IAM-2 A staff user granting a role to their own `StaffUser.id` gets 403; approving their own JIT request gets 403.
- ACC-IAM-3 Suspending a staff user revokes their sessions; their next request returns 401; refresh returns 401.
- ACC-IAM-4 Revoking a legacy-mapped role persists across `/auth/me` calls.
- ACC-IAM-5 `/auth/me` does not call `staffRole.upsert` (spy).
- ACC-IAM-6…9 as defined in the catalogue (trust.iam): confirm + reason on assignment, SSO callback 404, no per-request upsert, admin TOTP enrolment route gone.

## WP-0.5 Impersonation hardening (S6, S7, token transport — D8 part 1)

- Migration 0037.
- `authenticate.ts` (`shared/middleware/authenticate.ts:153-158`): for `mode === 'IMPERSONATION'`, reject non-GET/HEAD/OPTIONS unless `scopes` includes `write` → 403 `IMPERSONATION_READ_ONLY`. Also check the session row is not revoked (Redis key absence already handles expiry).
- Impersonation start: `scopes` defaults to `['read']`; `write` requires `platform.impersonation.mutate`, reason ≥ 20 chars, `expiresInMinutes ≤ 15`. Response returns `{ exchangeCode, portalUrl, session }`, never `token`. `exchangeCode` = 32 random bytes base64url, stored in Redis `platform:impersonation:exchange:<code>` → session id, TTL 60 s, single use (`GETDEL`).
- New tenant-side route `POST /api/v1/auth/impersonation/exchange` (public, rate limited): redeems the code, sets `exchangedAt`, returns the token (signed as today).
- `ImpersonationStartPage`: opens `portalUrl` = `https://<slug>.fauward.com/auth/impersonate#code=<code>` (localhost variant for dev).
- Tenant portal `ImpersonateCallbackPage`: read `code` from `location.hash`, POST to exchange, store the token via the existing `setImpersonationToken` (ensure it uses `sessionStorage`), then `history.replaceState` to drop the hash.
- Tenant `AuditLog` writes during impersonation: `actorType: 'IMPERSONATOR'` + session metadata. Find the shared audit writer(s) (`grep -rn "auditLog.create" apps/backend/src`) and pass `request.user.impersonationSessionId` through.
- S7: the legacy `/api/v1/admin/*` impersonation route returns 410 `GONE` with a pointer to the console (the whole prefix is deleted in WP-1.6).
- `platform.impersonation-expiry-sweep` job sets `endedAt/endedReason = EXPIRED`.

**Acceptance**
- ACC-IMP-1 A read-scoped impersonation token gets 403 `IMPERSONATION_READ_ONLY` on `POST /api/v1/shipments` and 200 on `GET /api/v1/shipments`.
- ACC-IMP-2 `write` scope without `platform.impersonation.mutate` → 403; with it and a 20-char reason → 200; `expiresInMinutes: 30` with write → capped at 15.
- ACC-IMP-3 The start response has no `token` field; an exchange code works once and fails the second time and after 60 s.
- ACC-IMP-4 A tenant `AuditLog` row written during impersonation has `actorType IMPERSONATOR` and the session id.
- ACC-IMP-5 Legacy admin impersonation route returns 410.
- ACC-IMP-6 (e2e, console) Start impersonation with reason → MFA step-up → new tab URL contains `#code=` and no `token=`.

## WP-0.6 Refund integrity (billing money bugs)

- `stripe.service.ts`: `createRefund(paymentIntentOrCharge, amountMajor: string, currency, reason, idempotencyKey)` converts with `toMinorUnits` (2-decimal default; zero-decimal list: JPY, KRW, VND, XOF, XAF, UGX, RWF…; three-decimal: BHD, KWD, OMR, JOD, TND).
- `billing.routes.ts` refund (`:123-160`), in one transaction with a row lock on the payment (`SELECT … FOR UPDATE` via `$queryRaw`, or Prisma interactive transaction + conditional update `refundedAmount <= amount - :x`):
  - reject when `amount > payment.amount - payment.refundedAmount` → 409 `OVER_REFUND`;
  - no `gatewayRef` → create `Refund{status: PENDING_APPROVAL}` + `RefundApproval{status: PENDING}`; a second staff member with `revenue.invoices.refund` approves (`POST /api/internal/billing/refunds/:id/approve`, dangerous) → `RECORDED_MANUAL`, then increment `refundedAmount`;
  - amount ≥ `config.billing.largeRefundThreshold` (default 500.00 in payment currency) → needs `revenue.invoices.refund.large` or the approval path;
  - Stripe path: on success set `gatewayRef`, `status SUCCEEDED`, increment `refundedAmount`; on Stripe error set `FAILED` + `failureReason` and return 502 `VENDOR_ERROR` (no unhandled 500).
- `RefundsPage`: show approval queue, approve/reject actions, real currency, error display, no double submit (ActionDialog).

**Acceptance**
- ACC-BIL-1 Refunding 12.34 GBP sends `amount: 1234` to Stripe and stores `12.34`.
- ACC-BIL-2 Two refunds totalling more than the payment → the second returns 409 and nothing is sent to Stripe.
- ACC-BIL-3 A refund on a payment without `gatewayRef` creates a `RefundApproval`; the requester cannot approve it; another approver can; `refundedAmount` changes only after approval.
- ACC-BIL-4 Same idempotency key twice → one Stripe call, one `Refund` row.
- ACC-BIL-5 Stripe failure → `FAILED` row, 502 response, error shown in the UI.

## WP-0.7 Exposure fixes (S8, S9)

- S8: `monitoring.routes.ts:44-49` `checkMonitoringKey` fails closed: no `MONITORING_API_KEY` → 503 `MONITORING_NOT_CONFIGURED` in every environment except `NODE_ENV=development`, where a warning is logged. Generate a key, set it in Railway and in whatever calls these endpoints (check Uptime Kuma/status page config on the VM), add it to `.env.example` without a value.
- S9: `POST /api/internal/flags/:key/overrides` stops calling LaunchDarkly `turnFlagOn`. Until WP-1.4 introduces native overrides, the route returns 501 `FLAG_OVERRIDE_UNAVAILABLE` and the UI hides the action with a `DegradedBanner('not-wired', 'WP-1.4')`.

**Acceptance**
- ACC-SEC-1 With `MONITORING_API_KEY` unset and `NODE_ENV=production`, monitoring endpoints return 503; with the key and the wrong bearer → 401.
- ACC-SEC-2 The flag override route makes no outbound LaunchDarkly call (adapter spy) and returns 501.

---

## Exit criteria (all must pass in CI)

- [ ] ACC-AUTH-1…6, ACC-CLIENT-1…5, ACC-MAN-1…4, ACC-IAM-1…9, ACC-IMP-1…6, ACC-BIL-1…5, ACC-SEC-1…2 green.
- [ ] e2e "golden path": login → MFA enrol → impersonate a tenant read-only (exchange code) → end session → audit log shows START and END rows with reason. Also: approve a region change request from `/admin/regions` after step-up MFA.
- [ ] `npm run typecheck`, `npm run lint`, `npm run test` green at the root.
- [ ] ADR 0002 committed; manifest statuses match its Phase-0 snapshot; README phase board updated.
- [ ] Report lists every secret created (`FIELD_ENCRYPTION_KEYS`, `FIELD_ENCRYPTION_ACTIVE_KEY_ID`, `MONITORING_API_KEY`, `DEV_HARDWARE_KEY_ASSERTION` if set) and where each is stored.
