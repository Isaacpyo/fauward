# Fauward Console — Remediation Tracker

**Source audit:** `docs/CONSOLE_BUILD_FINAL_AUDIT.md` (commit `6541553`, 2026-05-17)
**Re-audit entry criteria:** all P0 + P1 items closed; agreement (ADR) on P2-1 / P2-2 scope decisions.

This tracker re-grades a few of the audit's "Major" findings to P0 where they involve direct security or financial integrity. The audit's verdict (NOT-SHIPPABLE) stands.

---

## Priority legend

| Level | Meaning |
|---|---|
| **P0** | Ship-stoppers and safety. Security holes and integrity bugs. Fix this week. |
| **P1** | Aggregate gate and SOC 2 evidence. Until these are green every other finding is unverifiable. |
| **P2** | Definition-of-done decisions. Architecture vs. reality gaps that need a product call before engineering. |
| **P3** | Functional gaps. Real work but does not block shipping the rest. |
| **P4** | Cleanup, naming, docs. |

Estimates use t-shirt sizes: XS (< 1h), S (½ day), M (1–2d), L (3–5d), XL (1–2w), XXL (2w+). Rough — refine on grooming.

---

## P0 — Security and financial integrity

### P0-1 · Secret-modify endpoint gated by read permission
- **Audit ref:** Major #6 (re-graded). `PATCH /api/internal/secrets/:id` uses `writePre('trust.secrets.read')`.
- **Why P0:** Privilege escalation. A user with read-only secrets access can modify secrets. CC6.1 failure on its own.
- **Owner:** Backend / security
- **Estimate:** XS
- **Fix:** Replace the guard with the corresponding write permission (likely `trust.secrets.write`). Grep the codebase for any `writePre('<resource>.read')` patterns and audit each one — this is rarely an isolated mistake.
- **Acceptance test:**
  - User with only `trust.secrets.read` receives 403 on `PATCH /api/internal/secrets/:id`.
  - User with `trust.secrets.write` receives 200 on the same request.
  - `rbac-matrix.test.ts` extended to enumerate every mutating internal route by HTTP verb and assert the required permission is a write permission.

### P0-2 · Persistent ROOT grants bypass hardware-key gate
- **Audit ref:** Major #5 (re-graded). JIT ROOT requires hardware assertion; persistent ROOT grant via IAM routes only checks `trust.iam.root`.
- **Why P0:** Defeats the JIT design. The hardware-key requirement is a fiction if persistent role assignment is a back door.
- **Owner:** Security / IAM
- **Estimate:** S
- **Fix:** Add a hardware-assertion check to every code path that produces a ROOT role assignment, persistent or JIT. Strongly consider deleting the persistent ROOT path entirely — if all ROOT access must be JIT, the persistent path is dead weight and an attack surface.
- **Acceptance test:**
  - Admin without a valid hardware assertion attempting to grant ROOT receives 403.
  - Every code path that produces a ROOT assignment routes through the hardware-assertion middleware.
  - Audit log records the hardware-key fingerprint on every ROOT grant.

### P0-3 · Stripe refund and payment-intent calls lack idempotency keys
- **Audit ref:** Major #8 (re-graded). Vendor table flags Stripe core billing as MAJOR.
- **Why P0:** Retried HTTP requests can issue duplicate refunds. Money-moves-twice bug under load or network instability.
- **Owner:** Revenue / billing
- **Estimate:** S
- **Fix:** Generate a UUID per logical operation (per refund, per payment-intent) and pass it as `idempotencyKey` in the Stripe SDK call. Persist the key with the operation record so a retry of the same logical operation produces the same key.
- **Acceptance test:**
  - Integration test: same logical refund triggered twice yields exactly one Stripe refund.
  - Audit log captures the idempotency key for every Stripe call.
  - Code review or grep gate: no `refunds.create`, `paymentIntents.create`, or `paymentIntents.confirm` call ships without an `idempotencyKey` argument.

### P0-4 · Vendor webhooks use shared-secret headers, not native HMAC
- **Audit ref:** Major #7 (re-graded). PagerDuty, Persona, ComplyAdvantage, DocuSign.
- **Why P0:** A shared header value, once leaked, allows arbitrary webhook spoofing. Native HMAC ties the signature to the request body and a timestamp.
- **Owner:** Platform / integrations
- **Estimate:** M (roughly one vendor per day)
- **Fix per vendor:**
  - PagerDuty — validate `X-PagerDuty-Signature` (HMAC-SHA256 over raw body with integration secret).
  - Persona — validate `Persona-Signature` (HMAC-SHA256 with timestamp).
  - ComplyAdvantage — confirm vendor's current signature scheme and implement it.
  - DocuSign — HMAC-SHA256 with the Connect secret over the raw request body.
- **Common requirements for all four:** reject on missing or invalid signature; reject on timestamp skew > 5 minutes; store the verified signature with the webhook record for audit.
- **Acceptance test:**
  - Per vendor: integration test posting a forged body fails signature check; correctly signed body passes.
  - Replay test: re-sending a valid request older than 5 minutes is rejected.
  - No webhook route accepts requests without signature verification (grep gate in CI).

---

## P1 — Aggregate gate and SOC 2 evidence

### P1-1 · Root `typecheck` script missing
- **Audit ref:** Critical #2.
- **Owner:** Devex
- **Estimate:** XS
- **Fix:** Add `"typecheck": "tsc -b"` (or workspace equivalent) to root `package.json`. Ensure each workspace exposes its own `typecheck` script so the root command fans out.
- **Acceptance test:** `npm run typecheck` exits 0 on a clean `main`; CI runs it on every PR.

### P1-2 · Lint errors (5 backend, 2 frontend)
- **Audit ref:** Critical #2.
- **Owner:** Workspace owners.
- **Estimate:** XS
- **Fix:** Fix the 5 backend ESLint errors and 2 `react/no-unescaped-entities` errors. Address trivial warnings; document any deferred warnings with rule and reason.
- **Acceptance test:** `npm run lint` exits 0 across all workspaces.

### P1-3 · Build failures (agents, frontend, widget)
- **Audit ref:** Critical #2, Test Summary.
- **Owner:** Workspace owners.
- **Estimate:** M
- **Fix:**
  - `agents` — install or remove `@zxing/library`.
  - `frontend` — fix missing `tenant-db` JS imports; resolve the `.next/trace` EPERM (Windows-specific; CI is fine, but a platform-neutral fix removes a class of dev pain).
  - `widget` — fix `tenant-db` imports; pin or update `undici` to bypass the parser issue.
- **Acceptance test:** `npm run build` exits 0 in every workspace; CI builds on Linux containers as today.

### P1-4 · Test failures (backend EPERM, pricing-core / tracking-core EISDIR)
- **Audit ref:** Test Summary.
- **Owner:** Devex / backend / each failing workspace.
- **Estimate:** S
- **Fix:**
  - Backend EPERM on `apps/frontend/.next/trace` — the backend test should not be touching the frontend's build artifacts. Find the offending test and isolate it.
  - pricing-core / tracking-core PostCSS `EISDIR` — usually a `postcss.config` resolving to a directory not a file.
- **Acceptance test:** Backend 218/218; pricing-core and tracking-core Vitest suites complete; CI `test` job exits 0 across all workspaces.

### P1-5 · Coverage tooling missing
- **Audit ref:** Deferred Blockers; Critical #2.
- **Owner:** Devex
- **Estimate:** S
- **Fix:** Add coverage flags to every test script. Set permissive minimum thresholds initially (e.g. 60% lines) and raise quarterly. Upload coverage as a CI artifact and post a summary on PRs.
- **Acceptance test:** `npm run test -- --coverage` produces reports in every workspace; CI publishes a summary.

### P1-6 · `TEST_DATABASE_URL` missing; audit chain unverified
- **Audit ref:** Critical #3.
- **Owner:** Devex / security
- **Estimate:** S
- **Fix:** Provision a dedicated CI Postgres (containerised in CI; optionally a docker-compose target for devs). Run `apps/backend/scripts/verify-audit-chain.ts` on every PR against a seeded DB and nightly on `main`.
- **Acceptance test:** CI job `audit-chain-integrity` runs against a real DB and exits 0. Nightly job posts its run to the SOC 2 evidence store.

### P1-7 · SOC 2 control evidence for 7 controls
- **Audit ref:** Major #9; SOC 2 Readiness table.
- **Owner:** Security plus each control owner.
- **Estimate:** L (after P1-1 through P1-6, this is largely wiring tests to controls)
- **Fix:** For each of CC6.1, CC6.6, CC7.2, CC7.3, CC8.1, P4.2, P5.1 — identify the existing or required test, ensure it runs in CI, attach its output to the SOC 2 evidence binder. CC6.6 (encryption / secret protection) and CC7.2 (anomaly detection scheduled worker) need new dedicated tests. P5.1 (DSAR) needs the full workflow test once P3-1 ships.
- **Acceptance test:** Every one of the 7 controls has at least one passing CI test producing dated evidence; the SOC 2 evidence index lists each control and its most recent passing run.

---

## P2 — Definition-of-done (decide before building)

### P2-1 · 41 services in manifest vs 9 physical folders
- **Audit ref:** Critical #4 (partial); Major #1.
- **Why P2:** Architecture/product decision before engineering. Trim the manifest or build the 32 missing services. Routing to generic placeholder pages is the worst of both worlds — the manifest lies about what exists and the UI lies about what works.
- **Owner:** Console product owner + console tech lead.
- **Estimate:** XS for the decision; XXL if the decision is "build them all".
- **Fix:** A short ADR (`docs/adr/0001-console-service-scope.md`) deciding for each of the 32 missing services: (a) ship in v1 — build; (b) placeholder in v1 — keep route, label "Coming soon" in UI, mark manifest entry accordingly; (c) defer — remove from manifest and route map.
- **Acceptance test:** Manifest count equals physical folder count for services marked "live". UI never silently shows seed/placeholder data without a banner (see P2-3).

### P2-2 · 43 missing architecture routes
- **Audit ref:** Critical #4.
- **Owner:** Console tech lead.
- **Estimate:** Couples with P2-1.
- **Fix:** Same ADR. Routes for "live" services must be registered; routes for "deferred" services removed from the architecture route map so manifest and reality match.
- **Acceptance test:** A reconciliation script (write one) comparing the architecture route map against `apps/super-admin/src/router.tsx` runs in CI and passes.

### P2-3 · Static or placeholder data without "sample data" banners
- **Audit ref:** Phase 2-6 Report's Own Remaining Gaps #2; Major #2. Notably `RevenueCharts` and platform tenant seed data.
- **Owner:** Each pillar owner.
- **Estimate:** S per page.
- **Fix:** Every page rendering static or seed data must display a visible banner: "Sample data — replace before launch", with a target date. Pages in degraded "not configured" mode say so explicitly. No silent placeholders.
- **Acceptance test:** Visual regression or grep-based check: every page rendering non-API data displays a recognised banner component.

### P2-4 · Customer 360 tab isolation
- **Audit ref:** Critical #5.
- **Owner:** Customer pillar.
- **Estimate:** L
- **Fix:**
  - Replace the single parent `useQuery` with per-tab `useQuery` hooks; the parent fetches only tenant identity.
  - Wrap each tab in an error boundary so one tab's API failure does not crash the others.
  - Add a `permission` prop to each tab definition; tabs the user cannot access are hidden or show a permission-denied state.
  - Replace `MRR placeholder` and `Last login placeholder` in the header with real values from the platform metrics API.
  - Decide on the 4 extra tabs (Dunning, Incidents, Pipeline, Attribution) — spec or remove (cross-reference P4-6).
- **Acceptance test:**
  - Per-tab Playwright test: block one tab's API in the network mock, assert the other tabs still render.
  - Per-tab permission test: user without the tab's permission does not see it.
  - No `placeholder` strings remain in the Customer 360 header.

---

## P3 — Functional gaps

### P3-1 · DSAR data gathering as a real job
- **Audit ref:** Async Job Coverage. Currently creates a queued export row only.
- **Owner:** Trust / privacy
- **Estimate:** L
- **Fix:** BullMQ worker `trust.dsar-data-gather` walks every table containing personal data, produces an export, uploads to a customer-accessible storage location, emits the audit event. State machine: requested → gathering → ready → delivered → expired.
- **Acceptance test:** End-to-end test walking all 8 DSAR states; SOC 2 P5.1 has a passing test from this work.

### P3-2 · QBR generation as a real job
- **Audit ref:** Async Job Coverage.
- **Owner:** Customer
- **Estimate:** L
- **Fix:** Queue `customer.qbr-generate` on request; worker populates every deck section from real data (usage, support, MRR, health, risks). Synchronous draft can remain as a fallback for empty decks.
- **Acceptance test:** Generated deck has data in every section for a tenant with real activity; empty sections explicitly labelled "no data".

### P3-3 · Attribution computation as a scheduled job
- **Audit ref:** Async Job Coverage.
- **Owner:** GTM
- **Estimate:** L
- **Fix:** Scheduled BullMQ job pulling event data (PostHog or current source), applying attribution rules, writing daily snapshots. `/revenue/analytics/cohorts`, `/movement`, `/forecasts`, `/by-plan` read from the snapshot table.
- **Acceptance test:** Nightly job log present; cohort / attribution endpoints return real data, not static.

### P3-4 · HubSpot sync as nightly job
- **Audit ref:** Async Job Coverage.
- **Owner:** GTM
- **Estimate:** M
- **Fix:** Scheduled job syncing tenants ↔ HubSpot companies, contacts, deals, with rate-limit backoff. Conflict resolution: last-write-wins or platform-as-source-of-truth — decide one.
- **Acceptance test:** Nightly job log shows successful sync; HubSpot reflects platform state within 24h.

### P3-5 · Commission monthly aggregation
- **Audit ref:** Async Job Coverage. Currently a placeholder that logs only.
- **Owner:** Revenue
- **Estimate:** M
- **Fix:** Real aggregation over the previous month's bookings applying commission rules per role and deal type. Output to the commissions table.
- **Acceptance test:** Monthly job produces commission rows matching hand-calculated fixtures.

### P3-6 · Audit chain integrity nightly job
- **Audit ref:** Async Job Coverage.
- **Owner:** Security
- **Estimate:** S (verification script already exists from P1-6)
- **Fix:** Wrap `verify-audit-chain.ts` as a BullMQ scheduled job; on failure, page the security on-call.
- **Acceptance test:** Nightly job log present in the last 24h on the manual verification checklist row.

### P3-7 · `TenantChip` adoption across pillar surfaces
- **Audit ref:** Major #4. Currently zero usages in `apps/super-admin/src/pillars`.
- **Owner:** Frontend platform
- **Estimate:** M
- **Fix:** Replace every tenant-name or tenant-ID render in pillar pages with `<TenantChip />`. Specifically the surfaces called out in the audit: platform tenant list/detail, revenue invoice list/detail, billing forms, Customer 360 header links, workflow forms.
- **Acceptance test:** Grep check finds no plain tenant name/ID renders in `apps/super-admin/src/pillars`. Manual: Customer 360 reachable from every tenant-bearing row.

### P3-8 · Anrok integration (if tax is in scope)
- **Audit ref:** Vendor Integration Hygiene — INCOMPLETE.
- **Owner:** Revenue
- **Estimate:** L (or remove from scope)
- **Fix:** Build the integration surface beyond the current tax boolean, or formally remove Anrok from the multi-region tax claim in the ops readiness summary.
- **Acceptance test:** Tax calculation for at least one supported region uses real Anrok data; vendor table row shows PASS.

---

## P4 — Cleanup

### P4-1 · Retire deprecated `SUPER_ADMIN` backend compat routes
- **Audit ref:** Major #10. `/api/v1/admin/*` still requires legacy `SUPER_ADMIN`.
- **Owner:** Backend
- **Estimate:** S
- **Fix:** Map each `/api/v1/admin/*` route to its granular permission; if no callers remain, delete. If callers remain, 30-day deprecation notice plus migration guide.
- **Acceptance test:** Grep for `SUPER_ADMIN` returns no production references; legacy redirect tests still pass.

### P4-2 · Track `FAUWARD_CONSOLE_TESTING_GUIDE.md`
- **Audit ref:** Deferred Blockers; Minor #1.
- **Owner:** Devex
- **Estimate:** XS
- **Fix:** `git add` and commit.
- **Acceptance test:** File present on `origin/main`.

### P4-3 · npm version alignment (10.8.2 vs 10.9.2)
- **Audit ref:** Minor #2.
- **Owner:** Devex
- **Estimate:** XS
- **Fix:** Bump dev environments to 10.9.2 or relax the engines constraint.
- **Acceptance test:** `npm install` produces no engines warning.

### P4-4 · Sanctions re-screen naming vs schedule
- **Audit ref:** Minor #3. Job named "quarterly" but scheduled monthly.
- **Owner:** Trust
- **Estimate:** XS
- **Fix:** Pick one. Compliance typically wants monthly — rename and document.
- **Acceptance test:** Job name matches schedule; compliance owner has signed off on cadence.

### P4-5 · Stub badges (p95 latency, error rate, default service status)
- **Audit ref:** Minor #4; Pillar Dashboard Live Badges.
- **Owner:** Platform
- **Estimate:** M (badges are trivial; the metrics pipeline behind them is the real work)
- **Fix:** Wire badges to real observability metrics. Where real metrics aren't available, render `—` with a tooltip "metrics not yet wired" — never a fake number.
- **Acceptance test:** Every badge shows real data or is explicitly marked "not yet wired".

### P4-6 · Document Customer 360's extra tabs
- **Audit ref:** Minor #5. Page has 13 tabs; architecture specifies 9.
- **Owner:** Customer product owner
- **Estimate:** XS
- **Fix:** Add the 4 extra tabs (Dunning, Incidents, Pipeline, Attribution) to the architecture spec or remove them. Document in the P2-1 ADR.
- **Acceptance test:** Tab count matches the spec; cross-references P2-4.

---

## At-a-glance summary

| Priority | Items | Rough total | Blocks ship? |
|---|---|---|---|
| P0 | 4 | ~1 week | Yes |
| P1 | 7 | ~2 weeks (mostly parallel) | Yes |
| P2 | 4 | XS decision + execution sized by decision | Yes (P2-4 specifically) |
| P3 | 8 | ~6 weeks | No (some block SOC 2 evidence) |
| P4 | 6 | ~1 week | No |

The audit's "Minimum re-audit entry criteria" map cleanly to closing every P0 and P1 item plus an ADR for P2-1 / P2-2 / P2-4. P3 and P4 can roll into the phase after re-audit.

---

## Working notes

- Re-graded from Major to P0: secret-PATCH gate, persistent-ROOT hardware gate, Stripe idempotency, vendor HMAC. These four involve direct security or financial integrity and have no upstream dependency.
- The 41-vs-9 services question is the single biggest unknown in this tracker. Until P2-1 is decided, every estimate involving "the rest of the services" is speculative.
- Several P3 items unblock SOC 2 evidence indirectly: P3-1 → P5.1, P3-6 → CC8.1 nightly evidence. Schedule them earlier in P3 if SOC 2 timing matters.
- This tracker should be the single source of truth for re-audit. When an item closes, link the PR / commit and the passing CI run in its row.
