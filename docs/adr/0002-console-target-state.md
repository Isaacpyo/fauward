# ADR 0002: Console Target State and Service Disposition

**Date:** 2026-10-17
**Status:** Proposed. Becomes Accepted when the owner merges the Phase 0 PR.
**Supersedes:** ADR 0001 (Console Service Scope For Re-Audit)
**Inputs:** `docs/CONSOLE_REAUDIT_2026-10-17.md`, `docs/console-spec/00-decisions.md`

## Context

ADR 0001 declared 9 services live. The 2026-10-17 re-audit found 5 usable, every dangerous action blocked by MFA, and ADR 0001 never applied to the manifest or router. The goal is now explicit: every placeholder works or is honestly deferred, every tenant activity that needs Fauward reaches the console, and every console action has an effect.

## Decision

1. **Definition of live** (replaces ADR 0001's): a service is `live` only when all of these hold:
   - it has a dedicated folder `apps/super-admin/src/pillars/<pillar>/<service>/` exporting its routes, and none of its routes use `OpsRoute`, `InternalOpsPage` or `WorkflowOpsPage`;
   - every read is backed by a real API, and every empty or degraded state names its cause;
   - every action has a backend effect beyond a status flip, proven by an acceptance test;
   - every action is permission-gated in the UI and on the backend, writes one `PlatformAuditLog` row and one `PlatformActivity` row;
   - its tenant touchpoint (if any) works both ways;
   - it works with no vendor keys set (vendor-free default) and degrades cleanly when a vendor fails.
2. **Manifest statuses** `live | preview | deferred` are rendered in the UI and enforced by a CI reconciliation test (`00-decisions.md` D1).
3. **Target disposition at the end of Phase 4:**

| Pillar | Service | Target | Live in phase |
|---|---|---|---|
| platform | tenants | live | 1 |
| platform | impersonation | live | 1 |
| platform | flags | live | 4 |
| platform | queues | live | 3 |
| platform | incidents | live | 4 |
| platform | health | live | 3 |
| platform | jobs | live | 3 |
| platform | integrations | live | 4 |
| platform | database | live (read-only) | 4 |
| revenue | billing | live | 1 |
| revenue | dunning | live | 4 |
| revenue | subscriptions | live | 2 |
| revenue | disputes | live | 4 |
| revenue | tax | live | 4 |
| revenue | recognition | deferred | — |
| revenue | commissions | deferred | — |
| revenue | analytics | live | 3 |
| customer | support | live | 2 |
| customer | 360 | live | 1 |
| customer | success | live | 4 |
| customer | feedback | live | 2 |
| customer | kb | deferred | — |
| customer | comms | live | 2 |
| customer | qbr | live | 4 |
| customer | onboarding | live | 2 |
| trust | iam | live | 0 |
| trust | jit | live | 1 |
| trust | audit | live | 1 (chain verified in 5) |
| trust | compliance | live | 2 |
| trust | safety | live | 2 |
| trust | kyc | live | 4 |
| trust | secrets | live | 4 |
| trust | security | live | 4 (IP enforcement in 5) |
| gtm | pipeline | live | 4 |
| gtm | trials | live | 4 |
| gtm | demos | live | 4 |
| gtm | contracts | live | 4 |
| gtm | partners | deferred | — |
| gtm | attribution | live | 4 |
| gtm | pricing | deferred | — |
| gtm | handoff | live | 4 |

**Totals:** 36 live, 5 deferred.

4. **Phase-0 snapshot** (manifest statuses when Phase 0 merges): `live` = iam only. `deferred` = recognition, kb (not planned; no route today). Every other service is `preview`: those with a page today keep it behind a `PreviewBanner`; planned services with no page today (jobs, database, disputes, feedback) render `ComingSoonPage` showing their target phase. commissions, partners and pricing stay `preview` until WP-4.0b removes their backend and sets them `deferred`.
5. **Deferred services** (not planned) keep a manifest entry (architecture target is still 41) but have no backend routes, no models, no jobs and no sidebar link.
6. **Data deletion** (dropping the 11 tables in `00-decisions.md` D10) runs in production only after a row-count check and explicit owner approval.

## Consequences

- Release notes, SOC 2 evidence and operator training may cite a service as live only if the manifest says `live` and CI's reconciliation test passes.
- Customer 360 canonical tabs: Overview, Activity, Usage, Billing, Tickets, Health, AI, Audit, People, Config, Notes. Dunning, Incidents, Pipeline and Attribution are contextual panels inside Billing/Overview, not top-level tabs. This replaces ADR 0001 § Customer 360 Tab Scope.
- Re-introducing a deferred service needs a new ADR naming its producer.
