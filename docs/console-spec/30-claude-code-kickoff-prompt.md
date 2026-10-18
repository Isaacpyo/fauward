# 30 — Claude Code Prompts

Three ways to run it:
- **Prompt A**: an attended Phase 0 session. Paste it into Claude Code at the repo root (`C:\Users\temit\fauward`).
- **Prompt B**: each later phase, also attended.
- **Prompt C (unattended)**: all phases, no prompts, no stops. Run `bash console-run/run-unattended.sh`; see `console-run/RUN.md`. The runner feeds `console-run/PHASE_PROMPT.md` to one `claude -p` session per phase and enforces the safety rules with a guard hook.

**Database warning (all three):** the main checkout's `apps/backend/.env` points at the Supabase cloud database. Implementation work runs in a separate worktree whose env files are rewritten to the VM slot (`node console-run/safe-env.mjs`), never against Supabase.

---

## Prompt A — Kickoff (Phase 0)

````markdown
You are the implementation engineer for the Fauward Super Admin console rebuild. Work autonomously through
Phase 0 of the design spec, one work package at a time, until the phase exit criteria pass. Do not wait
for me between work packages. Keep me posted with one line before each work package.

## What you are building
The console (apps/super-admin + apps/backend/src/modules/internal) is a 41-service scaffold where ~5
services work and every dangerous action returns 403. The spec in docs/console-spec/ turns it into a
console where every placeholder works or is honestly deferred, every tenant activity that needs Fauward
reaches the console, and every console action has a real, tested effect.

## Read first, in this order (do not skip)
1. CLAUDE.md (repo rules; Docker runs only on the Oracle VM via scripts/vm-slot.sh)
2. docs/console-spec/README.md
3. docs/console-spec/00-decisions.md   (binding decisions D1–D10 + code-vs-audit corrections)
4. docs/console-spec/01-architecture.md (auth/MFA, permissions, API client, page kit, conventions, DoD)
5. docs/console-spec/10-phase-0-unblock.md  (your work packages WP-0.1 … WP-0.7 and exit criteria)
6. docs/console-spec/02-data-model.md  (Phase 0 migrations 0036–0038 only)
7. docs/console-spec/22-security-register.md (S1–S4, S6, S8, S10, S17, S18 close in this phase;
   S5, S7, S9 get their Phase 0 part)
Use docs/console-spec/20-service-catalogue.md and docs/CONSOLE_REAUDIT_2026-10-17.md as reference when a
WP touches a service. Do not read every file up front beyond the list above.

## Setup (once)
- Work in a worktree, not the main checkout: from the repo root run
  `git worktree add -b console/p0-unblock ../fauward-console chore/vm-docker-setup` (use master as the base
  if chore/vm-docker-setup has been merged), copy docs/console-spec/ and docs/adr/0002-console-target-state.md
  into it, and work only inside ../fauward-console.
- First commit: the spec itself (docs/console-spec/**, docs/adr/0002-console-target-state.md) with message
  `docs(console): design spec v1 and ADR 0002`.
- Inside the worktree claim a VM slot: `n=$(bash scripts/vm-slot.sh claim)`, `bash scripts/vm-slot.sh up $n`,
  `bash scripts/vm-slot.sh env $n` (copies env files and rewrites localhost ports), `bash scripts/vm-slot.sh tunnel $n`.
  Then run `node <main checkout>/console-run/safe-env.mjs <main checkout> . $((57000+100*n+32)) $((57000+100*n+26))`: it
  points DATABASE_URL/DIRECT_URL (which in the main checkout point at **Supabase cloud**) at the slot Postgres
  and blanks SendGrid/Twilio/Supabase service keys. Never run a migration or DB test until apps/backend/.env
  points at localhost. Release the slot when the phase is done. Never run Docker locally; never touch slot 0
  or the TipSignal / vitalos-platform containers.
- Baseline: before changing code, run `npm run typecheck`, `npm run lint`, `npm run test` at the root and
  record the result. If anything is already red, fix failures in files your WPs touch, and list the rest
  as baseline failures under Blockers (don't let them hide new failures: compare against the baseline).

## Loop for every work package
1. Verify. Open every file:line the WP cites. If the code differs from the spec, the code wins: adapt
   the implementation to the spec's intent and add a row to "Code-vs-audit corrections" in
   00-decisions.md in the same commit.
2. Plan. Write a short checklist for the WP in your task list (files to touch, migration, tests by ACC ID).
3. Build. Backend first (migration → service → routes → guards), then frontend, then tenant-portal
   touchpoint if any.
4. Prove. Write the tests named after the WP's ACC IDs (test titles start with the ID, e.g.
   `it('ACC-AUTH-4 stale MFA returns MFA_REQUIRED', …)`). Run `npm run typecheck`, `npm run lint`,
   `npm run test` at the repo root, plus `npx playwright test` for console e2e specs you touched.
   All green before committing.
5. Commit: `console(WP-0.x): <summary>`. One commit per WP (more if it helps review; never mix WPs).
6. Move on to the next WP without waiting for me.

## Non-negotiable rules
- Every DB query is tenant-scoped. Console routes run in system context (super-admin), so the Prisma
  tenant middleware does NOT scope them: put `tenantId` in every per-tenant `where` explicitly (spec
  01-architecture §7, security register S21).
- No `any`, no `as unknown as` on Prisma, no `console.log` (use req.log/app.log), no `throw new Error()` in
  handlers, no bypassing authenticate/permission guards, never `prisma migrate reset`.
- Migrations: `prisma migrate dev --create-only`, review the SQL, then apply on your VM slot. Numbering
  continues at 0036. Backfills are idempotent scripts with `--dry-run`.
- Money stays Decimal(12,2) major units as strings across the API; convert to Stripe minor units only in
  stripe.service.ts.
- BullMQ worker bodies run inside tenantStorage.run(...). Every fire-and-forget promise has `.catch`.
- No hardcoded numbers, sample rows, fake delays, or success toasts before the API confirms.
- Secrets (FIELD_ENCRYPTION_KEYS, FIELD_ENCRYPTION_ACTIVE_KEY_ID, MONITORING_API_KEY, …): generate
  them yourself, store them only in gitignored env files (apps/backend/.env) and, for deployed
  environments, in Railway/Vercel secret stores via their CLIs if you are logged in. Add the variable
  names (no values) to .env.example. Never commit or print values. List every secret you created in
  your report.
- Tests must not send real email or SMS: use Mailpit on your VM slot, Stripe test mode or mocks.

## Ask me first (stop and report; continue other WPs meanwhile)
- Running any migration or backfill against production data, and any data deletion.
- Changing DNS, billing, or account-security settings; spending money.
- Removing a deployed service or resource (e.g. the apps/admin Railway service).
- Sending email/messages to anyone outside Vitalos.
- If a login, 2FA or CAPTCHA blocks you, tell me exactly what to do and wait for that step only.

## Phase 0 exit (from 10-phase-0-unblock.md)
All ACC-AUTH, ACC-CLIENT, ACC-MAN, ACC-IAM, ACC-IMP (1–6), ACC-BIL (1–5), ACC-SEC IDs green in CI;
the golden-path e2e (login → MFA enrol → read-only impersonation via exchange code → end session →
audit rows; region approve after step-up MFA) passes; manifest statuses match ADR 0002's Phase-0
snapshot; README phase board updated to "Done" for Phase 0.

When the exit criteria pass: push the branch, open a PR to master titled
`Console Phase 0 — Unblock` with the exit checklist filled in and the ACC table, release your VM slot,
and send the report.

## Report format (end of phase, and whenever you stop)
- **Done:** WPs completed with commit hashes; ACC IDs passing (table: ID → test file).
- **Needs approval:** each item from the ask-first list, with the exact command or change waiting.
- **Blockers:** anything that stopped a WP, what you tried, what you need.
- **Secrets created:** name → where stored (never the value).
- **Spec corrections:** rows you added to 00-decisions.md.

Start now: read the files in order, set up the branch and VM slot, commit the spec, then begin WP-0.1.
````

---

## Prompt B — Continue with the next phase

Replace `<N>` and `<file>`; everything else stays. Run it inside the same worktree.

````markdown
Continue the Fauward console rebuild with Phase <N>.

Read, in order: CLAUDE.md; docs/console-spec/README.md (phase board); docs/console-spec/00-decisions.md;
docs/console-spec/01-architecture.md; docs/console-spec/<file> (this phase's work packages and exit
criteria); the Phase <N> migrations in docs/console-spec/02-data-model.md; the catalogue entries in
docs/console-spec/20-service-catalogue.md for every service this phase sets live;
docs/console-spec/21-tenant-loop-map.md (Phases 2 and 4); and docs/console-spec/22-security-register.md
(the rows this phase closes; all rows in Phase 5).

Confirm the previous phase's PR is merged (check `git log master`). If it isn't, branch from the
previous phase branch and say so in your report.

Branch `console/p<N>-<slug>`; claim a VM slot; follow the same work-package loop, rules, ask-first list
and report format as Phase 0 (Prompt A in docs/console-spec/30-claude-code-kickoff-prompt.md; conventions
in 01-architecture.md §11–13). Work through the work packages in the order the phase file
gives, without waiting for me between them. When the exit criteria pass: update the README phase board,
set the manifest status of every service this phase makes live (only if it meets 01-architecture.md §12),
push, open the PR `Console Phase <N> — <title>`, release the VM slot, and report
Done / Needs approval / Blockers / Secrets created / Spec corrections.
````

| Phase | `<file>` | `<slug>` | PR title |
|---|---|---|---|
| 1 | `11-phase-1-tenant-plane.md` | `tenant-plane` | Real tenant control plane |
| 2 | `12-phase-2-tenant-loop.md` | `tenant-loop` | Close the tenant loop |
| 3 | `13-phase-3-truthful-dashboards.md` | `dashboards` | Truthful dashboards |
| 4 | `14-phase-4-preview-services.md` | `services` | Preview services live or gone |
| 5 | `15-phase-5-compliance.md` | `compliance` | Compliance evidence |

### Tips for running it
- Phase 2 and Phase 4 are large. If a session's context gets long, end at a WP boundary with a report and start a new session with Prompt B plus "resume at WP-<x.y>".
- Parallelism: run Phase 4 sequentially unless you need speed. If you split it into worktrees (each with its own VM slot), do WP-4.0, WP-4.12 (secrets, used by integrations) and WP-4.10 (KYC, gates ENTERPRISE in tenants and contracts) first, reserve migration numbers per worktree up front, and merge platform/revenue → customer/trust → GTM.
