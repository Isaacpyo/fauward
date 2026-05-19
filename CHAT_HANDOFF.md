# Chat Handoff

Date: 2026-05-17
Repo: `c:\Users\temit\fauward`
Branch: `master`

## Request Context

The original request was to implement Fauward Console Phases 2-6 using prompts from:

`C:\Users\temit\Downloads\FAUWARD_CONSOLE_PHASES_2_6_PROMPTS.md`

The pasted implementation plan covered internal console work for:

- Phase 2: dunning, incident impact, Zendesk support links, customer health and playbooks.
- Phase 3: JIT grants, DSAR/legal hold, fraud/safety, LaunchDarkly flags.
- Phase 4: Doppler secrets metadata, security anomaly monitoring, KYC/sanctions, tax, SOC 2 mapping.
- Phase 5: custom subscriptions, contracts, CPQ, DocuSign, QBRs.
- Phase 6: HubSpot pipeline, trials, demos, handoff, attribution, pricing experiments, partners, commissions.

No Phase 2-6 backend modules, Prisma migrations, internal routes, vendor clients, RBAC changes, Customer 360 updates, or tests have been implemented in this chat.

## Implemented So Far

The actual implementation work currently visible in the workspace is around the local `status-dashboard`, not the Phase 2-6 console scope.

Tracked modified files:

- `status-dashboard/checks.js`
- `status-dashboard/config.json`
- `status-dashboard/server.js`
- `status-dashboard/public/app.js`
- `status-dashboard/public/index.html`
- `status-dashboard/public/style.css`
- `apps/super-admin/vite.config.ts`
- `turbo.json`

Untracked files:

- `status-dashboard/README.md`
- `apps/backend/src/scripts/add-platform-user.ts`

## Status Dashboard Changes

The dashboard has been expanded from a simple status page into a richer local/prod health monitor.

Implemented behavior includes:

- Local and production status checks per service.
- HTTP and TCP check support.
- Better connection error messages for refused connections, DNS failures, resets, and timeouts.
- Response time tracking.
- Recent check logs retained in memory and returned from `/api/status`.
- Local/prod status blocks in the UI.
- Sidebar filters for all services, down services, HTTP services, and TCP services.
- Clickable service cards with a detail panel.
- Uptime history bars and response-time visual bars.
- Production URLs configured for:
  - Fauward backend: `https://fauwardbackend-production.up.railway.app/health`
  - Marketing frontend: `https://fauward.com`
  - Tenant portal: `https://app.fauward.com`
  - Super Admin: `https://admin.fauward.com`
- Fix commands added to `status-dashboard/config.json` for common local services.
- `apps/super-admin/vite.config.ts` now proxies `/status` to `http://localhost:4000`, rewriting `/status` to the dashboard root.
- `status-dashboard/public/app.js` now supports running either at `/` or behind the `/status` proxy.
- `turbo.json` includes a dev task for `@fauward/status-dashboard#dev`.

## Important Risk

`apps/backend/src/scripts/add-platform-user.ts` is untracked and contains a hardcoded platform admin credential.

Do not commit that file as-is.

Recommended fix:

- Replace the password with an environment variable or CLI argument.
- Avoid storing plaintext credentials in the repo.
- Delete the script after use if it was only needed once.

## Verification Status

No final verification has been run in this chat.

Recommended checks before committing:

```bash
npm start --workspace=status-dashboard
```

Then open:

```text
http://localhost:4000
http://localhost:4000/api/status
```

Also verify the Super Admin proxy path:

```text
http://localhost:<super-admin-port>/status
```

## Remaining Work For Phase 2-6

The Phase 2-6 plan is still unimplemented.

Next engineering step should be to start with Phase 2 dunning and keep the work scoped:

1. Read `apps/backend/AGENTS.md`.
2. Read the phase prompt markdown from `C:\Users\temit\Downloads\FAUWARD_CONSOLE_PHASES_2_6_PROMPTS.md`.
3. Implement one service at a time.
4. Add Prisma schema and migrations only for the active service.
5. Add backend routes under the existing internal console architecture.
6. Protect routes with platform session auth, CSRF on mutations, dotted RBAC, and platform audit writes.
7. Add focused Vitest coverage before moving to the next service.

Suggested first slice:

- Dunning models.
- Dunning service.
- `/api/internal/dunning` routes.
- RBAC permissions.
- Audit behavior.
- Super Admin route wiring.
- Focused tests for retry limits, save-offer threshold behavior, suspension boundaries, missing vendor credentials, and audit writes.

