# Phase 0 & Phase 1 Verification Report
**Date:** 2026-05-10
**Commit:** 7c4196f
**Overall verdict:** RED

## Summary
- Static checks: FAIL
- Unit tests: 213 passed, 1 failed, N/A coverage
- Integration tests: 0 passed, 0 failed (blocked by missing test DB)
- E2E tests: 0 passed, 0 failed (blocked by missing Playwright install/config)
- Database integrity: FAIL
- Permission guard coverage: PASS (27/27 routes, actual path `apps/backend/src/modules/internal`)
- Audit hash chain: FAIL
- Overall verdict: RED

## Phase 0 Gate Checklist
> BLOCKED: `docs/FAUWARD_CONSOLE_TESTING_GUIDE.md` is missing from the repository, so the source checklist could not be copied verbatim.

- [x] Architecture sections §3.1, §10.2, §10.3, §11, and Appendix D reviewed
- [x] `apps/super-admin/INVENTORY.md` reviewed
- [x] Existing test coverage inventoried
- [x] Legacy redirect E2E spec added for all 7 Appendix D redirects
- [ ] `pnpm typecheck` passes: FAIL, root `typecheck` command not found
- [ ] `pnpm lint` passes: FAIL, pre-existing frontend lint errors
- [ ] `pnpm -r build` passes: FAIL under pnpm workspace execution
- [ ] Super-admin E2E critical flow runs: FAIL, Playwright command not found
- [ ] Migration/table verification runs on local test DB: BLOCKED, `TEST_DATABASE_URL` not set

## Phase 1 Gate Checklist
> BLOCKED: `docs/FAUWARD_CONSOLE_TESTING_GUIDE.md` is missing from the repository, so the source checklist could not be copied verbatim.

- [x] Hash-chain deterministic hashing test added
- [x] Hash-chain tamper and reorder tests added
- [x] Audit middleware success/failure/redaction tests added
- [x] RBAC matrix test added across 5 roles x 10 routes
- [x] Refund permission gating test added
- [ ] Refund permission gating passes: FAIL, large refund returns 201 instead of 403
- [ ] Coverage commands pass: FAIL, `@vitest/coverage-v8` is missing
- [ ] Phase 1 database tables verified: FAIL/BLOCKED, no test DB and schema gaps remain
- [ ] AuditLog hash-chain columns verified: FAIL/BLOCKED, live DB unavailable and schema uses `PlatformAuditLog` camelCase fields instead

## Test coverage by area
| Area | Tests found | Tests passing | Coverage |
|---|---:|---:|---|
| @fauward/internal-rbac | 0 package files; 1 backend matrix file | 50/50 | N/A (`test` script missing) |
| @fauward/internal-audit | 3 | 11/11 | N/A (`@vitest/coverage-v8` missing) |
| @fauward/internal-ui | 0 | 0 | N/A (`test` script missing) |
| Shell components | 0 | 0 | N/A (`super-admin` has no `test` script) |
| Backend /api/internal/* | 2 files including RBAC matrix | 53/54 | N/A (`@vitest/coverage-v8` missing) |
| E2E critical | 1 | 0/0 not run | N/A (Playwright missing) |

## Failing tests
- `src/routes/internal/billing.test.ts > internal billing refund permissions > rejects a large refund without revenue.invoices.refund.large`
  - `AssertionError: expected 201 to be 403 // Object.is equality`
  - `- Expected 403`
  - `+ Received 201`

## Missing tests added in this run
- `packages/internal-audit/src/hash.test.ts`
- `packages/internal-audit/src/verify.test.ts`
- `packages/internal-audit/src/middleware.test.ts`
- `apps/backend/test/security/rbac-matrix.test.ts`
- `apps/backend/src/routes/internal/billing.test.ts`
- `apps/super-admin/e2e/legacy-redirects.spec.ts`
- Verification helper added: `apps/backend/scripts/verify-audit-chain.ts`

## Ungated routes (security finding)
None found in the actual internal route modules.

Notes:
- Requested path `apps/backend/src/routes/internal` contains no production routes.
- Actual route path is `apps/backend/src/modules/internal`.
- Direct grep count was `routes=27 guards=22`; manual inspection shows the difference is from shared `readPre` and `writePre` guard arrays in `billing.routes.ts`.

## Manual verification checklist
The following cannot be automated — a human must verify before declaring Phase 0/1 complete:

[ ] Open / — see 5 pillar cards rendered (screenshot attached)
[ ] Open /admin → confirm redirect to /
[ ] Open each of the 7 legacy /admin/* URLs → confirm redirect
[ ] Open each migrated page → confirm no layout regression vs pre-migration screenshots
[ ] Log in as a SUPPORT_AGENT → confirm only Customer pillar fully accessible
[ ] Log in as a FINANCE_ADMIN → confirm Revenue pillar accessible, Trust pillar restricted
[ ] Trigger an IAM mutation → confirm appears in /trust/audit within 5 seconds
[ ] Issue a small refund as FINANCE_ADMIN → confirm Stripe test-mode call succeeds
[ ] Attempt large refund without permission → confirm 403 + clear error message
[ ] Open Customer 360 for a real tenant → confirm all 9 tabs load
[ ] Block one tab's API in DevTools → confirm other tabs still render
[ ] Cmd+K → command palette opens, search returns results

## Blockers
- `docs/FAUWARD_CONSOLE_TESTING_GUIDE.md` is missing, so official Phase 0/1 gate checklist text and example test patterns could not be copied verbatim.
- Root package manager is `npm@10.9.2`; pnpm warns that the project is configured for npm and there is no `pnpm-workspace.yaml`.
- Current Node runtime is `v22.14.0`; repo expects Node `20.x`.
- `pnpm typecheck` fails with `Command "typecheck" not found`.
- `pnpm lint` fails in `apps/frontend/src/app/services/page.tsx:169:98` and `apps/frontend/src/components/marketing/Hero.tsx:43:91` for `react/no-unescaped-entities`.
- `pnpm -r build` fails to resolve workspace binaries such as `vite`, `tsc`, and `next`.
- `npm run build` also fails in `apps/widget` on `undici` private fields and missing `packages/tenant-db` built files.
- Package coverage commands fail because `@vitest/coverage-v8` is not installed.
- `@fauward/internal-rbac`, `@fauward/internal-audit`, `@fauward/internal-ui`, and `@fauward/super-admin` have no `test` script.
- Playwright is not installed/configured; `playwright` command is not found.
- `TEST_DATABASE_URL` is not set, so migration deploy, table queries, and live audit-chain verification were skipped to avoid touching non-test databases.
- Active database safety rules forbid `prisma migrate reset`; that destructive step was not run.
- Static schema inspection shows only `StaffUser`, `StaffRole`, `StaffRoleAssignment`, `StaffSession`, `AuditLog`, and `PlatformImpersonationSession` equivalents. Missing exact Phase 1 models: `JitAccessRequest`, `ImpersonationSession`, `DSARRequest`, `LegalHold`, `FraudSignal`, `TenantHealthScore`, `CSPlaybookRun`, `DemoTenant`.
- `AuditLog` does not contain the requested `hash`, `prev_hash`, `jit_session_id`, or `actor_role` columns. Current hash-chain fields are on `PlatformAuditLog` as `hash`, `previousHash`, `jitSessionId`, and `actorRole`.
- Large refund gating does not match the required behavior: without `revenue.invoices.refund.large`, the route returns 201 and creates a pending approval instead of returning 403.

## Recommendation
GREEN  → Phase 0 + 1 complete; ready for Phase 2

AMBER  → Soft-launch acceptable but track these findings: not applicable

RED    → Do not proceed; fix these first: restore the missing testing guide, align package manager/test scripts, install coverage/Playwright tooling, provide a local `TEST_DATABASE_URL`, add/verify missing Phase 1 tables, align AuditLog hash-chain columns with the spec, and change large refund behavior to return 403 without `revenue.invoices.refund.large`.
