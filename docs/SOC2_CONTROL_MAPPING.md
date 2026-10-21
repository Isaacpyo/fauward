# SOC 2 Control Mapping

Status: Console Phase 5 (WP-5.6). Each control below has CI tests that produce dated evidence; see
`docs/SOC2_EVIDENCE_INDEX.md` for the tests and the `soc2-evidence-<date>` CI artifact.

| Trust Service Criteria | Fauward control | Where it is enforced |
|---|---|---|
| CC6.1 Logical access | One permission system: every console route is guarded by a named permission (role ∪ approved JIT grant); staff MFA; JIT requests need another approver, ROOT needs two plus a hardware-key assertion; suspended staff lose access at once. | `requireConsolePermission`, `trust/jit.routes.ts`, `iam.routes.ts`, `route-index.ts` |
| CC6.6 Encryption and secret protection | Secrets at rest (staff TOTP, tenant gateway keys, tenant webhook secrets) are AES-256-GCM field ciphertext (`v1:<keyId>:…`); a key rotation re-encrypts every value under the active key; secret inventory stores fingerprints, never values; monitoring endpoints fail closed without `MONITORING_API_KEY`. | `services/crypto/*`, `scripts/rotate-field-encryption-key.ts`, `scripts/encryption-at-rest-scan.ts`, `monitoring.routes.ts` |
| CC7.2 Anomaly detection | Hourly failed-login scan opens anomalies and blocks noisy IPs for 24 h (never `IP_BLOCK_BYPASS_CIDRS`); IP blocks are enforced on their scope for every request. | `trust.security-anomaly-scan` job, `middleware/enforce-ip-blocks.ts` |
| CC7.3 Incident response | Native incidents (declare, update, tenant impact, resolve with postmortem), optional HMAC-verified PagerDuty producer; tenant escalations reach the console and the answer reaches the tenant. | `platform/incidents.routes.ts`, escalation loop (L15) |
| CC8.1 Change management and audit trail | Every console mutation writes exactly one hash-chained audit row (single scheme, advisory-locked writer); the chain is verified nightly (`trust.audit-chain-verify`) and on demand, a break raises a CRITICAL alert. | `services/platform-audit.service.ts`, `services/audit-chain.service.ts` |
| P1.1 Privacy notice | Tenant-facing privacy surfaces; DSAR requests linked to tenant records. | tenant portal Privacy tab, `trust/compliance.routes.ts` |
| P4.2 Data retention | Legal holds block deletion, erasure and tenant close for the held tenant; a hold on every tenant needs a JIT ROOT session; closed tenants keep data until `purgeAfter`. | `services/legal-hold.service.ts`, `middleware/legal-hold-guard.ts`, `services/tenant-close.service.ts` |
| P5.1 Data subject rights | DSAR state machine: identity check → gather → approve → deliver (one-time download) → erasure (blocked under legal hold). | `services/dsar.service.ts`, `trust/compliance.routes.ts` |
