# Fauward Console - End-of-Build Final Audit
**Date:** 2026-05-17  
**Audit commit:** 6541553  
**Reports layout detected:** CONSOLIDATED  
**Source reports:** `docs/PHASE_0_1_VERIFICATION_REPORT.md`, `docs/PHASE_2_6_VERIFICATION_REPORT.md`  
**Optional references:** `docs/SOC2_CONTROL_MAPPING.md` present, `apps/super-admin/INVENTORY.md` present, no `docs/PHASE_*_CODEX_AUDIT_REPORT.md` files found.

## FINAL VERDICT: NOT-SHIPPABLE

Operational use should not begin yet. The console has a broad scaffold and the super-admin E2E smoke suite passes, but the whole-system audit found blocking issues: Phase 0/1 remains RED, aggregate static/build/test checks fail, the audit chain could not be verified against a test database, expected routes and physical service folders are missing, Customer 360 does not have tab-level isolation, multiple async workflows are not implemented as jobs, and key SOC 2 controls lack current passing evidence.

## Phase Verdict Ladder

| Phase | Verdict | Date | Critical findings | Major | Minor |
|---|---|---:|---:|---:|---:|
| 0-1 | RED | 2026-05-10 | Multiple repo-level blockers carried forward | Not counted in report | Not counted in report |
| 2 | GREEN (inferred) | 2026-05-17 | 0 in consolidated gate | 0 in consolidated gate | Remaining gaps noted globally |
| 3 | GREEN (inferred) | 2026-05-17 | 0 in consolidated gate | 0 in consolidated gate | Remaining gaps noted globally |
| 4 | GREEN (inferred) | 2026-05-17 | 0 in consolidated gate | 0 in consolidated gate | Remaining gaps noted globally |
| 5 | GREEN (inferred) | 2026-05-17 | 0 in consolidated gate | 0 in consolidated gate | Remaining gaps noted globally |
| 6 | GREEN (inferred) | 2026-05-17 | 0 in consolidated gate | 0 in consolidated gate | Remaining gaps noted globally |

Inference basis: the consolidated Phase 2-6 report has all phase checklist items ticked and no per-phase verdict words. The final verdict above supersedes these phase-local inferences.

## Deferred Blockers

| Blocker | First seen in | Currently present? | Ship impact |
|---|---|---|---|
| `docs/FAUWARD_CONSOLE_TESTING_GUIDE.md` missing | Phase 0-1 | File now exists locally but is untracked | Documentation evidence is not safely versioned |
| Root typecheck script missing | Phase 0-1 | Yes, `npm run typecheck` fails with missing script | Blocks static verification |
| Frontend lint errors | Phase 0-1 | Yes, same `react/no-unescaped-entities` errors remain | Blocks lint gate |
| Backend lint errors | Final audit | Yes, 5 backend ESLint errors | Blocks lint gate |
| Aggregate build failure | Phase 0-1 | Yes | Blocks release confidence |
| Coverage tooling/scripts missing | Phase 0-1 | Yes, no project coverage evidence generated | Blocks audit evidence quality |
| Several workspaces lack test scripts | Phase 0-1 | Yes, including super-admin and internal packages | Leaves key controls untested |
| Playwright unavailable | Phase 0-1 | Resolved locally; 9 E2E pass | No current blocker |
| `TEST_DATABASE_URL` missing | Phase 0-1 | Yes | Blocks live migration/table and audit-chain verification |
| Phase 1 exact models missing | Phase 0-1 | Mostly remediated; `DemoEnvironment` and `PlatformImpersonationSession` differ from exact names | Schema drift is manageable but should be documented |
| `AuditLog` hash-chain columns mismatch | Phase 0-1 | Still true for tenant `AuditLog`; platform chain uses `PlatformAuditLog` fields | Needs explicit architectural sign-off |

## Cross-Cutting Audit Results

### Surface Completeness

- Pillar directories: 5/5.
- Manifest services: 41/41.
- Physical service folders under `apps/super-admin/src/pillars`: 9/41.
- Physical counts from direct `ls`: platform 4/9, revenue 2/8, customer 1/8, trust 2/8, gtm 0/8.
- Missing physical service folders: platform flags, incidents, jobs, integrations, database; revenue dunning, subscriptions, disputes, tax, recognition, commissions; customer support, success, feedback, kb, comms, qbr, onboarding; trust jit, compliance, safety, kyc, secrets, security; all 8 gtm services.
- Several routes use generic `InternalOpsPage` or `WorkflowOpsPage`, so the manifest says 41 services exist, but the architecture's concrete file tree is not delivered.
- Platform tenant pages still use local static seed data, not the platform tenant API.

### Route Map Verification

- Expected routes from architecture route map: 167.
- Registered routes in `apps/super-admin/src/router.tsx`: 148 total, including 24 extras/legacy/container routes.
- Expected routes registered: 124/167.
- Missing expected routes: 43.

Missing route list:

`/customer/comms/banners`, `/customer/comms/email`, `/customer/comms/history`, `/customer/comms/maintenance`, `/customer/feedback/nps`, `/customer/feedback/responses`, `/customer/feedback/surveys`, `/customer/feedback/themes`, `/customer/kb/analytics`, `/customer/kb/drafts`, `/customer/kb/external`, `/customer/kb/internal`, `/customer/onboarding`, `/customer/onboarding/:tenantId`, `/customer/onboarding/blockers`, `/platform/database/connections`, `/platform/database/migrations`, `/platform/database/schema`, `/platform/database/slow-queries`, `/platform/health/budget`, `/platform/health/regions`, `/platform/health/services`, `/platform/impersonation/sessions`, `/platform/impersonation/sessions/:id`, `/platform/jobs`, `/platform/jobs/:id`, `/platform/jobs/:id/triggers`, `/platform/queues/:name`, `/platform/queues/:name/consumers`, `/platform/queues/:name/dlq`, `/platform/tenants/:id/lifecycle`, `/platform/tenants/:id/quotas`, `/revenue/analytics/by-plan`, `/revenue/analytics/cohorts`, `/revenue/analytics/forecasts`, `/revenue/analytics/movement`, `/revenue/disputes`, `/revenue/disputes/:id`, `/revenue/disputes/analytics`, `/revenue/recognition`, `/revenue/recognition/journal`, `/revenue/recognition/reports`, `/revenue/recognition/schedules`.

Permission gating:

- Service routes mostly use `PermissionRoute` or `OpsRoute`.
- Overview, redirect, status, and legacy routes rely on the outer authenticated shell rather than service-level permission checks.
- Deprecated `/api/v1/admin/*` backend compatibility routes still require legacy `SUPER_ADMIN`, so `SUPER_ADMIN` is not fully retired.

### Permission Inventory

- Permissions declared: 84.
- Backend dotted permissions used: 52.
- Frontend dotted permissions used: 47.
- Used but not declared: none found.
- Roles defined: 22/22 expected.
- Least-privilege spot checks:
  - `SUPPORT_AGENT`: pass, no non-customer write permissions found.
  - `FINANCE_ANALYST`: pass, does not include `revenue.invoices.refund.large`.
  - `CFO`: pass with caveat, has override/payout permissions plus read context, not broad finance write.
  - `EXECUTIVE`: pass, uses read-only permissions.
  - `ROOT`: partial. JIT ROOT requests require a hardware assertion, but persistent ROOT role grants in IAM routes only check `trust.iam.root`; no hardware-key gate is enforced there.
- Misgated mutating route: `PATCH /api/internal/secrets/:id` uses `trust.secrets.read` via `writePre('trust.secrets.read')`.
- Internal mutating routes: 52. Shared guard helper usage makes raw grep counts unreliable; unauthenticated webhook routes are signature-gated, not session-gated.

### Audit Chain Integrity

- Verification script exists: `apps/backend/scripts/verify-audit-chain.ts`.
- Runtime verification: skipped because `TEST_DATABASE_URL` is not set.
- Total entries: unknown.
- First timestamp: unknown.
- Last timestamp: unknown.
- Chain valid: NOT VERIFIED.
- Ship impact: blocking for SOC 2 readiness and operational sign-off.

### Customer 360 Completeness

- Required tabs present: 9/9.
- Actual tabs present: 13 (`Overview`, `Usage`, `Billing`, `Tickets`, `Health`, `Audit`, `People`, `Config`, `Notes`, plus `Dunning`, `Incidents`, `Pipeline`, `Attribution`).
- Tabs with independent TanStack Query data fetch: 0/13. The page uses one parent `useQuery`.
- Tabs with isolated error boundary or try/catch: 0/13. `Suspense` handles lazy loading only.
- Tabs with tab-level permission gates: 0/13. The parent route has `customer.360.read`.
- Customer 360 header still displays `MRR placeholder` and `Last login placeholder`.

### Demo Tenant MRR Exclusion

- Backend platform metrics exclude `Tenant.status = DEMO`.
- Legacy super-admin metrics exclude `Tenant.status = DEMO`.
- Tenant-list MRR contribution is zeroed for DEMO tenants.
- Dashboard MRR and manifest MRR badge use `/metrics`, so they inherit the DEMO exclusion.
- Not fully verifiable: `/revenue/analytics` uses static `RevenueCharts` sample rows, and the architecture routes for movement/cohorts/by-plan/forecasts are not registered.
- Customer 360 MRR display is a placeholder, so it cannot inflate MRR but also does not meet the spec.
- Cohort retention and forecasting calculations are not implemented as real aggregation endpoints.

### Async Job Coverage

| Expected job | Status |
|---|---|
| Health scoring | Implemented in `scheduled.worker.ts`; manual route queues `customer.health-scoring` |
| DSAR data gathering | Not implemented as BullMQ work; route creates a queued export row only |
| Anomaly detection | Implemented as `trust.security-anomaly-scan` |
| Sanctions re-screening | Implemented, but scheduled monthly despite "quarterly" naming |
| QBR generation | Not queued; route creates a draft deck synchronously |
| Attribution computation | Not implemented as scheduled/BullMQ computation |
| HubSpot sync | Not implemented as nightly job |
| Commission monthly aggregation | Scheduled placeholder logs only; no aggregation logic |
| Demo teardown | Partial; `gtm.demo-expiry` expires demo environments and cancels tenants |
| Audit chain integrity nightly | Not implemented |

Implemented as real jobs: 4/10. Partial placeholders: 2/10. Missing: 4/10.

### Vendor Integration Hygiene

No hardcoded Stripe live/public keys were found in production source. Vendor secrets are referenced through env vars, not committed literal credentials.

| Vendor | Webhook sig | Fail-closed | Idempotency | Secrets mgr/env | Status |
|---|---|---|---|---|---|
| Zendesk | N/A | Mutations return 503 when unconfigured | N/A | Env | CAVEAT |
| PagerDuty | Shared-secret header, not vendor HMAC | PASS in production when secret absent | N/A | Env | CAVEAT |
| LaunchDarkly | N/A | Mutations return 503 when unconfigured | N/A | Env | CAVEAT |
| Doppler | N/A | Metadata view degrades | N/A | Env | CAVEAT |
| Persona | Shared-secret header, not vendor HMAC | PASS in production when secret absent | Not found | Env | CAVEAT |
| ComplyAdvantage | Shared-secret header, not vendor HMAC | PASS in production when secret absent | Not found | Env | CAVEAT |
| DocuSign | Shared-secret header, not vendor HMAC | PASS in production when secret absent | Not found | Env | CAVEAT |
| HubSpot | No webhook/sync found | Read view degrades | N/A | Env | INCOMPLETE |
| PostHog | No webhook; local attribution read only | Read view degrades | N/A | Env | INCOMPLETE |
| Anrok | No real integration surface found beyond tax boolean | Not applicable | N/A | Env | INCOMPLETE |
| Stripe core billing | Webhook uses Stripe constructEvent | Config error if absent | FAIL, refund/payment-intent calls lack idempotency keys | Env | MAJOR |

Vendor read pages generally show a visible "not configured" state through `InternalOpsPage` or `WorkflowOpsPage`, which is acceptable as a degraded mode. Static revenue charts and platform tenant seed data are not acceptable degraded modes because the UI does not clearly mark them as sample data.

### SOC 2 Readiness

| Control | Service(s) | Evidence file(s) | Current status |
|---|---|---|---|
| CC6.1 logical access | IAM, JIT, security monitoring | `rbac-matrix.test.ts`, `console-phases.test.ts`, E2E | PARTIAL; ROOT persistent grant lacks hardware gate |
| CC6.6 encryption/secret protection | Secret management | No dedicated passing test found | NOT READY |
| CC7.2 anomaly detection | Scheduled anomaly scan | No dedicated scheduled-worker test found | NOT READY |
| CC7.3 incident response | PagerDuty incidents and impact mapping | `console-phases.test.ts`, E2E | PARTIAL |
| CC8.1 change management | LaunchDarkly flags and audit | `console-phases.test.ts`, audit hash tests | PARTIAL; audit-chain DB verification skipped |
| P4.2 data retention | Legal hold | `console-phases.test.ts` | PARTIAL |
| P5.1 data subject rights | DSAR workflow | Partial DSAR legal-hold test only | NOT READY |

Controls with current passing evidence: 0/7 for audit purposes, because the aggregate test run failed. Auditor engagement recommendation: NOT-READY.

### Pillar Dashboard Live Badges

- Real badge endpoints: tenant count, DLQ depth, MRR.
- Real TodayStats endpoints: MRR, active tenants, shipments today.
- Stub badges: p95 latency, error rate, default status for most services, and "last activity" in pillar overview.
- Manifest badge coverage: 3 service badge keys are real; 38 services fall back to `fetchPlaceholderBadge`.

### Cross-Pillar Deep Linking

- `TenantChip` component exists in `packages/internal-ui`.
- `TenantChip` usages in `apps/super-admin/src/pillars`: 0.
- Tenant ID/name renders without `TenantChip`: platform tenant list/detail, revenue invoice list/detail, billing create/credit forms, Customer 360 header links, Customer 360 config JSON, workflow forms, and several generic operational views.
- Impact: Customer 360 is not consistently reachable from tenant-bearing rows.

### Legacy Redirects

- `apps/super-admin/e2e/legacy-redirects.spec.ts` exists.
- Result: PASS.
- 7/7 redirects passed via `npx playwright test apps/super-admin/e2e/legacy-redirects.spec.ts --reporter=list`.

## Phase 2-6 Report's Own Remaining Gaps

1. Native Prisma engine generation on Windows: classified as dev-only based on CI and Docker. CI runs `ubuntu-latest` with Node 20 and executes `npx prisma generate`; backend Docker uses `node:20-alpine` and runs Prisma generation in Linux containers.
2. Degraded vendor read pages: acceptable where the UI shows "Vendor integration is not configured in this environment." Not acceptable where static sample data is shown without a sample-data banner, notably revenue charts and platform tenant seed data.

## Test Summary

- Static typecheck: FAIL, root `npm run typecheck` script is missing.
- Lint: FAIL.
  - Backend: 5 ESLint errors and 20 warnings.
  - Frontend: 2 `react/no-unescaped-entities` errors.
  - Widget: lint attempts interactive Next.js ESLint setup.
- Build: FAIL.
  - Backend: passed.
  - Super-admin: passed.
  - Failing workspaces: agents (`@zxing/library` unresolved), frontend (`tenant-db` JS imports missing and `.next/trace` EPERM), widget (`undici` parse issue and `tenant-db` JS imports missing).
- Tests: FAIL.
  - Backend: 217/218 passed; 1 failed on `EPERM` reading `apps/frontend/.next/trace`.
  - fauward-Go: 17/17 passed.
  - pricing-core/tracking-core: failed Vitest startup on PostCSS config `EISDIR`.
- E2E: PASS, 9/9 super-admin Playwright tests passed.
- Coverage: not captured; no usable workspace coverage run.
- Claimed Phase 2-6 backend count: 218 passed. Current backend result: 217/218 passed.
- Claimed Phase 2-6 E2E count: 9 passed. Current E2E result: 9/9 passed.

## Findings Consolidated

### Critical

1. Phase 0/1 remains RED and its repo-level blockers are not fully resolved.
2. Aggregate verification is failing: typecheck missing, lint failing, workspace build failing, workspace tests failing.
3. Audit chain integrity was not verified because `TEST_DATABASE_URL` is absent.
4. Expected route surface is incomplete: 43 architecture routes are not registered.
5. Customer 360 does not provide per-tab independent fetches, tab-level error isolation, or tab-level permission gates.

### Major

1. Physical service folder coverage is 9/41 even though manifests list 41 services.
2. Several pages still display static or placeholder operational data without a clear degraded/sample-data state.
3. Async job coverage is incomplete for DSAR gathering, QBR generation, attribution, HubSpot sync, commission aggregation, and audit-chain nightly verification.
4. `TenantChip` is unused across pillar surfaces, so cross-pillar tenant deep links are inconsistent.
5. Persistent ROOT grants do not enforce a hardware-key gate.
6. `PATCH /api/internal/secrets/:id` is guarded by `trust.secrets.read`.
7. Vendor webhook validation uses shared-secret headers rather than provider-native HMAC/signature validation for PagerDuty, Persona, ComplyAdvantage, and DocuSign.
8. Stripe refund/payment-intent calls lack idempotency keys.
9. SOC 2 control evidence is incomplete and the current test run is not passing.
10. Deprecated `SUPER_ADMIN` backend compatibility routes still exist.

### Minor

1. `docs/FAUWARD_CONSOLE_TESTING_GUIDE.md` exists locally but is untracked.
2. Current npm is `10.8.2` while the repo declares `npm@10.9.2`.
3. Sanctions re-screen job is named quarterly but scheduled monthly.
4. P95 latency and error-rate badges are still stubs.
5. Customer 360 includes extra tabs beyond the architecture spec; useful, but not documented as an intentional extension.

## Manual Verification Checklist

[ ] Walk through pillar dashboard - every service link goes somewhere real  
[ ] As FINANCE_ADMIN, attempt large refund - 403 with clear message  
[ ] As SUPPORT_AGENT, attempt `/trust/iam` - 403  
[ ] As ROOT without hardware key, attempt ROOT JIT - rejected  
[ ] Create and walk a DSAR through all 8 states  
[ ] Open Customer 360 for an enterprise tenant - all 9 required tabs render  
[ ] Block one Customer 360 tab's API - other tabs still render  
[ ] Issue save offer over GBP 100 as FINANCE_ANALYST - blocked  
[ ] Approve 30 percent discount quote - CFO required  
[ ] Generate a QBR deck - all sections populated  
[ ] Register a demo tenant - excluded from MRR widget  
[ ] Verify nightly health-scoring job ran in last 24h  
[ ] Verify nightly audit-chain integrity job ran in last 24h  
[ ] Customer 360 deep-link from `/trust/audit` row works  
[ ] Cmd+K command palette returns real results  
[ ] No Stripe live keys present in dev env  
[ ] All vendor integrations show "Connected" or a clear "Not configured" state in `/platform/integrations`  
[ ] Webhook delivery success rate is above 99 percent over last 7 days  
[ ] No console errors on any pillar overview page  
[ ] All `/admin/*` legacy URLs redirect correctly  

## Operational Readiness Summary

- 41 services are listed in manifests across 5 pillars, but only 9 physical service folders exist.
- Granular RBAC is partially live; `SUPER_ADMIN` is not fully retired.
- Audit chain verified across entries: not verified.
- SOC 2 Type II: blocked.
- Multi-region tax: scaffolded; 7 regions are represented, but tax aggregation evidence is incomplete.
- Vendor integrations PASS: degraded read-state pattern for Zendesk/LaunchDarkly/Doppler/HubSpot/PostHog where visible; production fail-closed for several webhook secrets.
- Vendor integrations needing follow-up: PagerDuty, Persona, ComplyAdvantage, DocuSign native signatures; HubSpot sync; PostHog attribution computation; Anrok implementation; Stripe idempotency.
- Phases at GREEN by source reports: 5/6 inferred.
- Open critical findings: 5.

## Recommendation

Do not begin operational use. Fix the critical findings, then re-run this audit.

Minimum re-audit entry criteria:

1. `npm run typecheck`, lint, build, tests, and super-admin E2E all pass with npm workspace syntax.
2. A test database is available and `apps/backend/scripts/verify-audit-chain.ts` verifies the full platform audit chain.
3. The expected route surface is either implemented or the architecture route map is explicitly revised.
4. Customer 360 has tab-level fetch isolation, error isolation, and permission gates.
5. Missing async jobs are implemented or explicitly removed from the ship scope.
6. SOC 2 mapped controls have current passing evidence.
