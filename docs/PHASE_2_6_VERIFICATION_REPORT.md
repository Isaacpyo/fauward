# Fauward Console Phases 2-6 Verification Report

Date: 2026-05-17

## Scope

This report covers the Phase 2-6 console scaffold remediation pass. The vendor baseline remains Zendesk, PagerDuty, LaunchDarkly, Doppler, Persona, ComplyAdvantage, DocuSign, HubSpot, PostHog, and Anrok.

## Remediation Summary

- `/api/internal/*` remains the console API surface with dotted permissions from `@fauward/internal-rbac`.
- Internal billing and Customer 360 audit helpers now propagate `jit_session_id`.
- Production vendor webhooks fail closed when signature secrets are absent; PagerDuty, Persona, ComplyAdvantage, and DocuSign handlers persist event data after signature validation.
- Vendor mutations for LaunchDarkly, Persona, ComplyAdvantage, and DocuSign return `503` when unconfigured.
- Manual health scoring now returns `202` and queues `customer.health-scoring`; the worker computes the weighted 0-100 model and triggers CS playbooks on health thresholds.
- Legal-hold checks block erasure DSAR delivery and tenant-user deletion paths.
- Approval thresholds were tightened for KYC/PEP decisions, subscription overrides, trial extensions, quote approval, and commission payouts above GBP 5,000.
- `DEMO` tenants are excluded from platform/super-admin MRR metrics.
- Super-admin Phase 2-6 routes now use a workflow-capable page for high-risk services, with JIT request flow on denied permissions and an active-elevation banner.
- Customer 360 already contained Tickets, Health, Dunning, Incidents, Contracts, Pipeline, and Attribution tabs and remains wired.

## Evidence

| Command | Result |
|---|---|
| `npm run prisma:generate --workspace=apps/backend` | Failed: Windows `query_engine-windows.dll.node` rename is blocked by an existing file lock. |
| `npm run prisma:generate --workspace=apps/backend -- --no-engine` | Passed. |
| `npm run build --workspace=apps/backend` | Passed. |
| `npm run test --workspace=apps/backend -- console-phases.test.ts` | Passed: 11 tests. |
| `npm run test --workspace=apps/backend` | Passed: 218 tests. |
| `npm run build --workspace=apps/super-admin` | Passed. |
| `npx playwright test apps/super-admin/e2e/` | Passed: 9 tests after installing Chromium with `npx playwright install chromium`. |

## Gate Checklist

### Phase 2

- [x] Dunning retry ceiling suspends tenant and writes audit.
- [x] Save-offer issuance is permission-gated through `revenue.dunning.write`.
- [x] Incident impact mapping persists and appears in Customer 360 data.
- [x] Support tickets are present in Customer 360 Tickets tab.
- [x] Health scoring runs asynchronously through BullMQ.
- [x] At-risk queue sorts by ARR x churn probability; expansion queue uses high health score ordering.
- [x] CS playbook runs are created on health threshold crossings.
- [x] Phase 2 routes use RBAC matrix permissions.

### Phase 3

- [x] JIT self-approval is rejected; ROOT requests require hardware assertion and two approvals.
- [x] Active JIT grants are checked by `requireInternalPermission` and audit records include `jit_session_id`.
- [x] DSAR transitions write audit and erasure completion is blocked by active legal hold.
- [x] Legal holds block tenant-user deletion and DSAR erasure delivery.
- [x] Fraud suspension writes AuditLog and queues tenant notification.
- [x] LaunchDarkly override mutation fails closed when unconfigured and audits local override attempts when configured.

### Phase 4

- [x] Secret APIs remain metadata-only; no secret values are returned.
- [x] Security session revocation revokes the linked platform session.
- [x] Security anomaly job blocks failed-login IP spikes.
- [x] Persona and ComplyAdvantage webhook handlers persist reviews/screenings after signature validation.
- [x] PEP approval requires senior compliance role.
- [x] Integration health and webhook health routes remain read-only operational views.

### Phase 5

- [x] Subscription override approval thresholds enforce manager/CFO roles.
- [x] Quote approvals enforce discount thresholds.
- [x] DocuSign send fails closed when unconfigured.
- [x] DocuSign completion webhook updates quote state and creates a signed contract.
- [x] QBR generation route remains queued and workflow-visible.

### Phase 6

- [x] Trial extension thresholds enforce SALES_MANAGER and SALES_DIRECTOR paths.
- [x] Demo tenants are created with `status=DEMO`.
- [x] DEMO tenants are excluded from MRR metrics in platform and legacy super-admin dashboards.
- [x] Commission payout approval requires Finance plus CFO for amounts above GBP 5,000.
- [x] Playwright covers mocked workflow submission across Platform, Customer, Trust, GTM, and Revenue pillars.

## Remaining Gaps

- Native Prisma engine generation is blocked locally by a Windows DLL file lock. `--no-engine` generation succeeds and backend TypeScript build passes.
- Some Phase 4-6 vendor read pages still use degraded local views by design until live credentials are present.
