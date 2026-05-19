# SOC 2 Evidence Index

**Date:** 2026-05-18
**Baseline commit:** 74d6d3c
**Purpose:** Map Fauward Console SOC 2 control claims to runnable CI evidence.

CI now runs the aggregate evidence gate in `.github/workflows/ci.yml`:

```bash
npm run typecheck
npm run lint
npm run build
npm test
npm run test:coverage --workspace=apps/backend
npm run audit:chain:verify --workspace=apps/backend
```

Coverage artifacts are uploaded from `apps/backend/coverage`, `apps/fauward-Go/coverage`, and `packages/*/coverage`.

## Control Evidence

| Control | Control claim | Primary evidence | CI command | Current local status |
|---|---|---|---|---|
| CC6.1 logical access | Internal routes enforce granular permissions; ROOT grants require hardware assertion. | `apps/backend/src/routes/internal/iam.test.ts`, `apps/backend/src/routes/internal/rbac-matrix.test.ts`, `apps/backend/src/routes/internal/console-phases.test.ts` | `npm run test --workspace=apps/backend -- src/routes/internal/iam.test.ts src/routes/internal/rbac-matrix.test.ts src/routes/internal/console-phases.test.ts` | PASS |
| CC6.6 encryption and secret protection | Secret inventory stores metadata only; secret metadata mutation requires `trust.secrets.write`; no submitted secret value is persisted by the metadata route. | `apps/backend/src/routes/internal/console-phases.test.ts` (`allows secret metadata mutations for trust.secrets.write users`) | `npm run test --workspace=apps/backend -- src/routes/internal/console-phases.test.ts` | PASS |
| CC7.2 anomaly detection | Scheduled security anomaly scan is registered hourly and creates anomaly/IP-block records for failed-login spikes. | `apps/backend/src/queues/scheduled.worker.test.ts` | `npm run test --workspace=apps/backend -- src/queues/scheduled.worker.test.ts` | PASS |
| CC7.3 incident response | PagerDuty webhooks fail closed, require native HMAC signatures, reject replayed signatures, and persist verified incident evidence. | `apps/backend/src/routes/internal/console-phases.test.ts` | `npm run test --workspace=apps/backend -- src/routes/internal/console-phases.test.ts` | PASS |
| CC8.1 change management | Feature flag overrides require write permission, call LaunchDarkly when configured, and write Fauward audit evidence; audit-chain verification runs in CI/nightly. | `apps/backend/src/routes/internal/console-phases.test.ts`, `apps/backend/scripts/verify-audit-chain.ts`, `.github/workflows/ci.yml` | `npm run test --workspace=apps/backend -- src/routes/internal/console-phases.test.ts`; `npm run audit:chain:verify --workspace=apps/backend` | PASS locally for route evidence; audit-chain requires CI DB |
| P4.2 data retention | Active legal holds block erasure DSAR delivery. | `apps/backend/src/routes/internal/console-phases.test.ts` (`blocks erasure DSAR delivery while a legal hold is active`) | `npm run test --workspace=apps/backend -- src/routes/internal/console-phases.test.ts` | PASS |
| P5.1 data subject rights | DSAR requests record state transitions, queue export evidence, and write audit entries. | `apps/backend/src/routes/internal/console-phases.test.ts` (`records DSAR state transitions and queues export evidence`) | `npm run test --workspace=apps/backend -- src/routes/internal/console-phases.test.ts` | PASS |

## Latest Local Evidence Runs

| Date | Command | Result |
|---|---|---|
| 2026-05-18 | `npm run test:coverage --workspace=apps/backend` | PASS, 318 passing / 2 skipped; lines 73.63%, functions 77.6% |
| 2026-05-18 | `npm test` | PASS across configured workspaces; backend 318 passing / 2 skipped |
| 2026-05-18 | `npm run test --workspace=apps/backend -- src/routes/internal/console-phases.test.ts src/queues/scheduled.worker.test.ts src/routes/internal/iam.test.ts src/routes/internal/rbac-matrix.test.ts src/routes/internal/billing.test.ts src/modules/payments/stripe.service.test.ts` | PASS, 36 tests |
| 2026-05-18 | `npm run test --workspace=apps/backend -- src/routes/internal/console-phases.test.ts` | PASS, 19 tests |
| 2026-05-18 | `npm run test --workspace=apps/backend -- src/queues/scheduled.worker.test.ts` | PASS, 1 test |
| 2026-05-18 | `npm run test -- --coverage` | Superseded by `npm test` plus backend `test:coverage` |

## Evidence Gaps Tracked Outside P1

The P5.1 DSAR evidence currently proves workflow state and export queueing. The full DSAR bundle worker remains tracked as P3-1 in `docs/CONSOLE_REMEDIATION_TRACKER.md`.

The CC8.1 audit-chain script is now wired into CI and nightly runs, but local execution still requires a real `TEST_DATABASE_URL`.
