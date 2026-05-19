# Fauward Console Testing Guide

Last updated: 2026-05-17

This guide covers verification for the internal console services in Phases 2-6. It assumes the console API surface is `/api/internal/*`, platform sessions are protected by CSRF on mutations, and authorization uses dotted permissions from `@fauward/internal-rbac`.

## Required Local Checks

Run from the repository root:

```bash
npm run prisma:generate --workspace=apps/backend
npm run build --workspace=apps/backend
npm run test --workspace=apps/backend
npm run build --workspace=apps/super-admin
npx playwright test apps/super-admin/e2e/
```

For focused remediation work, this backend subset is the first gate:

```bash
npm run test --workspace=apps/backend -- console-phases.test.ts
```

## Backend Coverage Expectations

Every Phase 2-6 mutation should have focused coverage for:

- platform authentication and CSRF middleware
- dotted permission enforcement
- audit writes, including `jit_session_id` when a JIT grant authorized the request
- tenant isolation for tenant-scoped records
- fail-closed vendor mutations when credentials are absent
- fail-closed production vendor webhooks when signature secrets are absent or invalid

High-risk scenario tests should cover:

- Dunning retry ceiling suspends the tenant and writes audit
- manual health scoring returns `202` and queues a BullMQ job
- legal holds block tenant data deletion and erasure DSAR completion
- PagerDuty, Persona, ComplyAdvantage, and DocuSign webhooks persist events after signature validation
- LaunchDarkly and DocuSign writes are mocked and return `503` when unconfigured
- KYC and sanctions decisions enforce PEP senior approval
- quote, subscription override, trial extension, and commission approval thresholds
- demo tenants are excluded from revenue and MRR metrics

## Frontend Coverage Expectations

Super-admin e2e tests should mock platform auth and internal APIs. They should verify:

- critical Phase 2-6 route navigation
- workflow pages render an action surface, not only read-only records
- one representative workflow per pillar can submit with mocked API calls
- legacy `/admin/*` redirects still resolve to the console route set
- permission-denied routes expose the JIT request path

The current Playwright config starts the super-admin Vite dev server on `127.0.0.1:4174`.

## Vendor Credentials

Local tests do not require live vendor credentials. Read endpoints may show degraded local data when a vendor is unconfigured. Vendor mutations must return `503` when their configured credential env vars are absent. Production webhook handlers must reject unsigned or unconfigured webhook traffic.
