# Phase 5 — Compliance Evidence

**Outcome:** the audit chain verifies end to end, controls that exist in code are enforced, and each SOC 2 control in scope has a passing CI test that produces dated evidence.
**Branch:** `console/p5-compliance` · **Prereq:** Phase 4 exit criteria green (WP-5.1 may start earlier; it has no dependency on Phase 4).
**Closes:** S14, S15, P1-7, P3-6, IP-block enforcement, legal-hold global semantics.

---

## WP-5.1 Audit chain: one scheme, no forks, no duplicates (S14)

- Single hash scheme: `packages/internal-audit` `computeEntryHash` (canonical JSON + previous hash), `hashVersion 2`. `services/platform-audit.service.ts` delegates to it; its own `computePlatformAuditHash` is deleted.
- Migration 0063: `seq` (autoincrement, unique) and `hashVersion`. Record the cut-over `seq` in a `audit_chain_meta` row (or config) so verification accepts v1 rows only before it.
- Writer: interactive transaction → `pg_advisory_xact_lock(<constant>)` → read latest by `seq` → compute → insert. No find-then-create outside the lock.
- Remove duplicates: the global `auditMiddleware` (`app.ts`) stays only as a safety net that writes when the handler did **not** write (`request.auditWritten` flag set by `writeInternalAudit`/`writePlatformAuditLog`). Result: exactly one row per mutation.
- Verifier: `verifyPlatformAuditChain` walks by `seq` in batches of 1,000 (no full-table load), returns `{ ok, checked, firstBrokenSeq?, reason? }`.
- Job `trust.audit-chain-verify` (nightly, P3-6): runs the verifier, writes a `ScheduledJobRun` with the result, on failure creates a `CRITICAL` activity + staff notification to `trust.audit.read` holders.
- `AuditIntegrityPage` shows the last verification run and lets `trust.audit.export` holders trigger one.

**Acceptance**
- ACC-AUD-5 100 concurrent audit writes produce 100 rows with a contiguous valid chain.
- ACC-AUD-6 Tampering with one row's `metadata` makes verification fail at that `seq`.
- ACC-AUD-7 One console mutation → exactly one audit row (tested on 5 representative routes).
- ACC-AUD-8 Nightly job records its result; a forced failure creates the CRITICAL activity.

## WP-5.2 Legal hold semantics

- Migration 0064. `tenantId = null` holds apply to all tenants only when `appliesToAllTenants = true`; otherwise they are invalid (creation rejects them).
- Global hold creation: `trust.compliance.legal-hold.write` + fresh MFA + reason + an approved JIT `ROOT` session.
- Release (built in WP-2.5) records `releasedBy`, `releasedAt`, `releaseReason`; released holds no longer block (`app.ts:154-165` filters `status: 'ACTIVE'` already — verify).
- The DELETE guard also covers console routes that delete tenant data (tenant close, DSAR erasure).

**Acceptance:** ACC-LH-1 a tenant-specific hold blocks that tenant's DELETEs and erasure only; ACC-LH-2 a global hold requires ROOT JIT; ACC-LH-3 release unblocks.

## WP-5.3 TOTP and secrets at rest — verify

TOTP encryption shipped in WP-0.1 and gateway secrets in WP-2.12. This WP adds the CC6.6 evidence test: scans the DB in CI (seeded) for any `PlatformUser.mfaSecretEncrypted`, `TenantPaymentGateway.secretKeyEncrypted`/`webhookSecretEncrypted` or `TenantSettings.webhookSecret` value without the `v1:` prefix and fails if found. Also a key-rotation script (`rotate-field-encryption-key.ts`) re-encrypts with the active key id.

**Acceptance:** ACC-ENC-1 scan passes on seeded data; ACC-ENC-2 after rotation every encrypted value carries the new key id and decrypts, and removing the old key breaks nothing.

## WP-5.4 IP-block enforcement

- Migration 0065. `onRequest` hook `enforceIpBlocks` (cached set in Redis, refreshed on change via pub/sub, 60 s TTL fallback): `scope STAFF` → `/api/internal/*`; `scope TENANT` → tenant API; `ALL` → both. Exempt: `/live`, `/ready`, `/health`, vendor webhooks (signature-verified), and an emergency allowlist env `IP_BLOCK_BYPASS_CIDRS` for the office/VPN.
- Blocked → 403 `IP_BLOCKED`; increments `hitCount`/`lastHitAt` asynchronously (with `.catch`).
- Auto-blocks from the anomaly scan have `expiresAt` (default 24 h) and `scope ALL`; they never block an IP in `IP_BLOCK_BYPASS_CIDRS`.

**Acceptance:** ACC-IP-1 a blocked IP gets 403 on the right scope only; ACC-IP-2 expired blocks stop applying without restart; ACC-IP-3 bypass CIDR never blocked.

## WP-5.5 Host guard (S15)

`createAdminHostGuard` (`app.ts:136-139`): allowlist vendor webhook paths (`/api/internal/*/webhooks/*`, `/api/v1/payments/webhook/stripe`), status-dashboard and monitoring paths when `ADMIN_HARDENING_PHASE_1` is on. Delete the unused `ADMIN_HARDENING_PHASE_2..6` parsing (`config/index.ts:64-68,181-186`).

**Acceptance:** ACC-HOST-1 with phase 1 on, a signed PagerDuty webhook on the API host is accepted; a console route on the API host is 404.

## WP-5.6 SOC 2 control tests and evidence index (P1-7)

| Control | Test(s) that produce evidence |
|---|---|
| CC6.1 logical access | rbac-matrix (every route guarded), ACC-RBAC-1..4, ACC-IAM-1..5, ACC-JIT-1..6 |
| CC6.6 encryption / secret protection | ACC-ENC-1..2, ACC-SEC-1 |
| CC7.2 anomaly detection | `scheduled.worker.test.ts` anomaly scan + ACC-IP-1..3 |
| CC7.3 incident response | ACC-INC-* (incidents), ACC-L15-* (escalations) |
| CC8.1 change management / audit trail | ACC-AUD-5..8, nightly chain job record |
| P4.2 data retention / legal hold | ACC-LH-1..3, tenant close `purgeAfter` test |
| P5.1 data subject access | ACC-L4-* DSAR round-trip (gather → deliver → download → erasure) |

- CI job `soc2-evidence` runs these tests with JUnit output, uploads the report as an artifact named `soc2-evidence-<date>`.
- `docs/SOC2_EVIDENCE_INDEX.md` and `docs/SOC2_CONTROL_MAPPING.md` updated to point at the test names and the CI artifact.

**Acceptance:** ACC-SOC2-1 the CI job is green and the artifact contains a passing result per control.

---

## Exit criteria

- [ ] ACC-AUD-5…8, ACC-LH-1…3, ACC-ENC-1…2, ACC-IP-1…3, ACC-HOST-1, ACC-SOC2-1 green.
- [ ] Nightly chain verification has run successfully in the deployed environment at least once (job run record linked in the PR).
- [ ] Security register (`22-security-register.md`): every row closed with a test link.
