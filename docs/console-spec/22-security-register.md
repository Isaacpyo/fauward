# 22 — Security Register

Re-audit §6 findings, plus spec additions. Close a row only with a merged fix and a passing test; put the PR link in "Closed by".

| # | Finding | Where | Sev | Fix | WP / Phase | Test | Closed by |
|---|---|---|---|---|---|---|---|
| S1 | MFA never required for a console session | `platform.routes.ts:101`, `authenticate-platform-session.ts` | High | MFA-pending sessions; mandatory enrolment; enrolment-aware fresh-MFA guard | WP-0.1 / P0 | ACC-AUTH-1, -4, -6 | |
| S2 | ROOT hardware assertion falls back to `'dev-hardware-key'` | `iam.routes.ts:15,28`; `console-phases.routes.ts:741-742` | High | Remove fallback; refuse ROOT grants when unset | WP-0.4 / P0 | ACC-IAM-1 | |
| S3 | Self-grant check compares `StaffUser.id` with `PlatformUser.id` | `iam.routes.ts:220` | High | Compare caller's `StaffUser.id`; same for JIT self-approval | WP-0.4 / P0 | ACC-IAM-2, ACC-JIT-2 | |
| S4 | Suspended staff keep access | `iam.routes.ts:184`, session auth | High | Propagate to `PlatformUser`, revoke sessions, auth checks staff status | WP-0.4 / P0 | ACC-IAM-3 | |
| S5 | Revoked legacy-mapped role re-granted per request | `staff-iam.service.ts:78-95` | Medium | Assign legacy role only on staff creation; one-time backfill; `seedStaffRoles` off the hot path | WP-0.4, WP-1.1 | ACC-IAM-4, -5 | |
| S6 | Impersonation `scopes` never enforced | `authenticate.ts:153-158` | High | Read-only by default; write needs `.mutate`, 20-char reason, ≤ 15 min | WP-0.5 / P0 | ACC-IMP-1, -2 | |
| S7 | Legacy `/api/v1/admin` impersonation token not revocable | `super-admin.routes.ts:234,243` | Medium | Route returns 410 in P0; prefix deleted in P1 | WP-0.5, WP-1.6 | ACC-IMP-5, ACC-LEG-2 | |
| S8 | Monitoring endpoints public without `MONITORING_API_KEY` | `monitoring.routes.ts:44-49` | High | Fail closed except in development | WP-0.7 / P0 | ACC-SEC-1 | |
| S9 | LaunchDarkly "tenant override" turns the flag on for everyone | `console-phases.routes.ts:1006-1015` | High | P0: stop calling LD; P1: native overrides; P4: per-tenant targeting mirror | WP-0.7, WP-1.4, WP-4.1 | ACC-SEC-2, ACC-FLG-2 | |
| S10 | TOTP secret plaintext in `mfaSecretEncrypted` | `iam.routes.ts:265` | Medium | Field encryption + backfill | WP-0.1 / P0 | ACC-AUTH-2, -5, ACC-ENC-1 | |
| S11 | Internal support notes visible to tenant staff | `support.routes.ts:184` | Medium | `MessageVisibility` + one visibility function | WP-2.3 / P2 | ACC-SUP-3 | |
| S12 | Tenant gateway secret keys in `localStorage` | `IntegrationsTab.tsx:193,212` | Medium | `TenantPaymentGateway` encrypted, API-backed | WP-2.12 / P2 | ACC-L11-1 | |
| S13 | Relay API decodes JWT without verification when secret unset; dev tenant-id bypass | `relay-api/src/index.ts:135`, `relay.routes.ts:90,98` | Medium | Refuse to start without secret outside development; bypass dev-only | WP-4.R / P4 | ACC-L2-2 | |
| S14 | Audit chain unverifiable (two hash schemes, race, duplicates) | `platform-audit.service.ts:28-65`, `internal-audit/src/hash.ts` | High (compliance) | Single scheme, advisory-locked writer, de-dup, nightly verify | WP-5.1 / P5 | ACC-AUD-5…8 | |
| S15 | Admin host guard would 404 vendor webhooks; unused phase flags | `app.ts:136-139`, `config/index.ts:64-68,181-186` | Low | Allowlist webhook/monitoring paths; delete unused flags | WP-5.5 / P5 | ACC-HOST-1 | |
| S16 | Configured-but-failing vendor → unhandled 500 | `internal-vendors.service.ts` `vendorJson` | Low | Vendor adapters with `VendorError` → 502 degraded | WP-4.0a / P4 | adapter tests | |
| S17 | *(spec)* Admin-initiated TOTP enrolment returns another person's secret to the admin | `iam.routes.ts:258-267` | Medium | Self-service enrolment only; admin can only reset | WP-0.1 / P0 | ACC-AUTH-2, ACC-IAM-9 | |
| S18 | *(spec)* Impersonation token travels in the URL query string | `ImpersonationStartPage.tsx:25-30`, `ImpersonateCallbackPage.tsx` | Medium | One-time exchange code in the URL fragment | WP-0.5 / P0 | ACC-IMP-3, -6 | |
| S19 | *(spec)* `TenantSettings.paymentGatewayKey` / `webhookSecret` plaintext at rest | `schema.prisma` TenantSettings | Medium | `paymentGatewayKey` moved to `TenantPaymentGateway` (encrypted) and dropped in 0062; `webhookSecret` encrypted in place | WP-2.12, 0062 | ACC-ENC-1 | |
| S20 | *(spec)* IP blocks recorded but never enforced | security worker, no middleware | Medium | `enforceIpBlocks` hook with scopes and bypass CIDRs | WP-5.4 / P5 | ACC-IP-1…3 | |
| S21 | *(spec)* Console queries bypass Prisma tenant scoping (system context) | `tenant.resolver.ts:190`, `plugins/prisma.ts:31-36` | Medium | Explicit `tenantId` in every per-tenant console query; review checklist item; tests for cross-tenant leakage on C360 and tenant detail | All phases | ACC-C360-5, ACC-DSAR-2 | |
