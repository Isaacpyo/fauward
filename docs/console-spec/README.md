# Super Admin Console — Design Spec

**Status:** Draft v1 · 2026-10-17 · Owner: Temitope Agbola
**Source:** `docs/CONSOLE_REAUDIT_2026-10-17.md` (re-audit at commit `0a6c601`, branch `chore/vm-docker-setup`)
**Supersedes for planning:** `docs/CONSOLE_REMEDIATION_TRACKER.md` (still the item-level backlog for P0–P4 IDs), `FAUWARD_CONSOLE_PHASES_2_6_PROMPTS.md` (vendor-first phasing — replaced by the vendor-free phasing here).
**Decision record:** `docs/adr/0002-console-target-state.md` supersedes ADR 0001.

## Goal

1. Every placeholder works or is removed with an honest "Coming soon" page.
2. Every tenant-portal activity that needs a Fauward human reaches the console, and the answer reaches the tenant.
3. Every console action has a real, tested downstream effect.

## Read in this order

| # | File | What it is | Read when |
|---|---|---|---|
| 0 | `00-decisions.md` | The 10 decisions from re-audit §9.1, resolved. Plus code-vs-audit corrections. | Always first |
| 1 | `01-architecture.md` | Cross-cutting design: auth/MFA, one permission system, one API namespace and client, service page kit, suspension/notifier/activity services, vendor adapters, conventions, definition of done | Before any phase |
| 2 | `02-data-model.md` | Every Prisma change, grouped by migration and phase | Before writing a migration |
| 10–15 | `10-phase-0-unblock.md` … `15-phase-5-compliance.md` | Execution plans: ordered work packages (WP-x.y), exit criteria | The phase you are on |
| 20 | `20-service-catalogue.md` | All 41 services: target status, phase, model, routes + guards, page, tenant touchpoint, job, vendor-free default, acceptance tests | When a WP touches a service |
| 21 | `21-tenant-loop-map.md` | The 20 tenant→console interactions with their target round-trip | Phase 2, and any tenant-portal work |
| 22 | `22-security-register.md` | S1–S16 mapped to fix, phase, test | Phase 0 and 5 |
| 30 | `30-claude-code-kickoff-prompt.md` | The starting prompt for Claude Code, plus the per-phase continuation prompt | To start or resume implementation |

## Phase board

Update this table as phases close. A phase is closed only when every exit criterion in its file passes in CI.

| Phase | Outcome | Status | Branch | PR |
|---|---|---|---|---|
| 0 — Unblock | A staff user logs in, enrols/verifies MFA and completes a dangerous action end to end; no silent empty pages; no dead links; P0 security holes closed | Implemented, in review (open: Postgres-backed golden path; pre-existing fauward-go lint/test) | `console/p0-unblock` | see `console-run/PROGRESS.md` |
| 1 — Real tenant plane | One namespace, one permission system; tenants list/detail/actions on the real API; one suspension path; entitlements honour overrides; Customer 360 isolated and reachable from every tenant; legacy admin removed | Not started | `console/p1-tenant-plane` | — |
| 2 — Close the tenant loop | 18 of 20 interactions round-trip (Relay L2/L20 in Phase 4); tenant portal stops faking writes; notifications actually send; activity recorded | Not started | `console/p2-tenant-loop` | — |
| 3 — Truthful dashboards | No hardcoded number anywhere; revenue analytics, health, queues, jobs, badges real | Not started | `console/p3-dashboards` | — |
| 4 — Live or gone | Every remaining service has a dedicated page and producer, or is deferred with its dead models dropped; generic OpsRoute pages deleted | Not started | `console/p4-services` | — |
| 5 — Compliance evidence | Audit chain verifies; IP blocks enforced; SOC 2 controls have passing, dated tests | Not started | `console/p5-compliance` | — |

## Target service disposition (end of Phase 4)

36 live, 5 deferred. Full table in ADR 0002 and `20-service-catalogue.md`.

| Pillar | Live (phase it goes live) | Deferred (Coming soon, no backend) |
|---|---|---|
| Platform (9) | tenants P1 · impersonation P1 · queues P3 · health P3 · jobs P3 · flags P4 · incidents P4 · integrations P4 · database P4 | — |
| Revenue (8) | billing P1 · subscriptions P2 · analytics P3 · dunning P4 · disputes P4 · tax P4 | recognition · commissions |
| Customer (8) | 360 P1 · support P2 · feedback P2 · comms P2 · onboarding P2 · success P4 · qbr P4 | kb |
| Trust (8) | iam P0 · jit P1 · audit P1 · compliance P2 · safety P2 · kyc P4 · secrets P4 · security P4 | — |
| GTM (8) | trials P4 · demos P4 · handoff P4 · attribution P4 · pipeline P4 · contracts P4 | partners · pricing |

## Rules for changing this spec

- The code wins. If an implementation step finds the spec wrong, fix the code to the intent, update the spec section in the same PR, and add a line to `00-decisions.md` § Corrections log.
- A decision in `00-decisions.md` changes only with an ADR or an explicit owner note in the PR description.
- Do not mark a service `live` in the manifest unless it meets the definition of done in `01-architecture.md` §12.
