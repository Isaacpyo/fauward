# SOC 2 Evidence Index

**Updated:** 2026-10-21 (Console Phase 5, WP-5.6)
**Purpose:** map each SOC 2 control in scope to the CI tests that prove it, and say where the dated evidence is kept.

## How evidence is produced

The `soc2-evidence` job in `.github/workflows/ci.yml` runs on every pull request (and on demand, `workflow_dispatch`):

1. Real Postgres 15 and Redis 7 services; schema from `prisma db push`.
2. The backend test files listed in `scripts/soc2/controls.json` (`backendFiles`) with Vitest's JUnit reporter →
   `backend-junit.xml`. Postgres- and Redis-backed tests run (no skips: a skipped control test fails the job).
3. The console Playwright specs in `scripts/soc2/controls.json` (`e2eSpecs`) with the JUnit reporter → `e2e-junit.xml`.
4. `npm run audit:chain:verify --workspace=apps/backend` → `audit-chain-verify.txt`.
5. `scripts/soc2/evidence-report.mjs` checks that every test named for every control has at least one passing case
   and none failed or skipped, and writes `summary.md` / `summary.json` (also shown on the run's summary page).
6. Everything is uploaded as the artifact **`soc2-evidence-<YYYY-MM-DD>`** (kept 90 days, the maximum for a public
   repository: download the artifact for any audit period you need to keep longer).

`apps/backend/src/compliance/soc2-controls.test.ts` (normal CI) fails if the registry names a file or test that no
longer exists, so this index and the job cannot drift apart silently.

## Control evidence

| Control | Tests (titles carry these IDs) | Files |
|---|---|---|
| CC6.1 logical access | RBAC matrix (every console route guarded, route index matches registered routes), ACC-RBAC-1…4, ACC-IAM-1…5, ACC-JIT-1…6 | `src/routes/internal/rbac-matrix.test.ts`, `src/middleware/require-console-permission.test.ts`, `src/routes/internal/iam.test.ts`, `src/modules/internal/auth/console-auth.test.ts`, `src/services/staff-iam.service.test.ts`, `src/modules/internal/trust/jit.test.ts`; e2e `console-rbac`, `trust-jit` |
| CC6.6 encryption / secret protection | ACC-ENC-1 (field ciphertext; DB scan finds no unencrypted secret column), ACC-ENC-2 (key rotation; old key removable), ACC-SEC-1 (monitoring fails closed) | `src/services/crypto/field-encryption.test.ts`, `src/services/crypto/encrypted-columns.test.ts`, `src/modules/internal/monitoring.test.ts` |
| CC7.2 anomaly detection | scheduled security anomaly scan (anomaly per account, 24 h scope-ALL auto-block, bypass range never blocked), ACC-IP-1…3 | `src/queues/scheduled.worker.test.ts`, `src/middleware/enforce-ip-blocks.test.ts`; e2e `trust-security` |
| CC7.3 incident response | ACC-INC-1…5 (native incidents, PagerDuty HMAC), ACC-L15-1…2 (escalation round trip, console-only routes) | `src/modules/internal/platform/incidents.test.ts`, `src/modules/exceptions/escalation-loop.test.ts`, `src/modules/internal/platform/escalations.auth.test.ts` |
| CC8.1 change management / audit trail | ACC-AUD-5 (100 concurrent writes, no fork), ACC-AUD-6 (tamper found at its seq), ACC-AUD-7 (one row per console mutation), ACC-AUD-8 (nightly job records its result; a break raises CRITICAL); plus `audit-chain-verify.txt` | `src/modules/internal/audit-chain.test.ts`; e2e `trust-audit` |
| P4.2 data retention / legal hold | ACC-LH-1 (tenant hold blocks only that tenant's deletes, erasure, close), ACC-LH-2 (global hold needs JIT ROOT), ACC-LH-3 (release unblocks), tenant close `purgeAfter` | `src/modules/internal/trust/legal-hold.test.ts`, `src/services/tenant-close.service.test.ts`; e2e `trust-compliance` |
| P5.1 data subject access | ACC-L4-1 (access request → authenticated download of only that subject's data), ACC-L4-2 (erasure anonymises; blocked under legal hold) | `src/modules/internal/trust/compliance.test.ts`; e2e `trust-compliance` |

## Operational evidence (deployed environment)

- **Nightly audit chain verification:** each `trust.audit-chain-verify` run is a `ScheduledJobRun` (console: Trust →
  Audit → Integrity, or Platform → Jobs). Link a run from production for the audit period.
- **Encryption at rest:** `npx tsx src/scripts/encryption-at-rest-scan.ts` against production prints ids only (exit 1
  on a finding). Key rotation: `npx tsx src/scripts/rotate-field-encryption-key.ts --dry-run` first.

## Latest local evidence run

| Date | Command | Result |
|---|---|---|
| 2026-10-21 | backend `backendFiles` with JUnit against the VM slot Postgres/Redis, Playwright `e2eSpecs` with JUnit, `node scripts/soc2/evidence-report.mjs` | PASS: 129 cases (102 backend, 27 e2e), 0 failed, 0 skipped; all 7 controls PASS |
