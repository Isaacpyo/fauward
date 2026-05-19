# Custom Domain Audit Report

Date: 2026-05-18
Scope: current working tree for `apps/backend` and `apps/tenant-portal` custom-domain implementation.
Checklist: domain ownership/uniqueness, routing safety, plan gating, input validation, rate limiting, audit log integrity, Vercel client, secrets/PII, frontend, race/idempotency, and operational migration.

## Executive Summary

Result: PASS

| Severity | Count |
|---|---:|
| CRITICAL | 0 |
| HIGH | 2 |
| MEDIUM | 3 |
| LOW | 2 |

The prior CRITICAL cross-tenant mutation issue is fixed in the current route stack. Custom-domain routes now run authentication, tenant-match enforcement, role guard, plan gate, and route-specific rate limiting. The test suite also includes a regression test for mismatched authenticated-user tenant versus host-resolved tenant. Public auth routes now resolve active custom-domain hosts before falling back to system context, with test coverage.

No CRITICAL findings remain. PASS is acceptable under the audit rule, but several HIGH/MEDIUM issues still need remediation before production hardening is complete.

Verification run:
- `npm run test --workspace=apps/backend -- src/modules/tenants/domain.routes.test.ts src/shared/middleware/tenant.resolver.test.ts`
- Result: 2 files passed, 19 tests passed.
- `npm run test --workspace=apps/backend -- src/shared/middleware/authenticate.test.ts`
- Result: 1 file passed, 4 tests passed.

## Prior Critical Recheck

Status: RESOLVED

Evidence:
- `apps/backend/src/modules/tenants/domain.routes.ts:18` to `apps/backend/src/modules/tenants/domain.routes.ts:30` protect `PATCH /api/v1/tenant/domain` with `app.authenticate`, `requireTenantMatch`, `requireRole(['TENANT_ADMIN', 'SUPER_ADMIN'])`, `requirePlan(['PRO', 'ENTERPRISE'])`, and rate limiting.
- `apps/backend/src/modules/tenants/domain.routes.ts:32` to `apps/backend/src/modules/tenants/domain.routes.ts:44` apply the same tenant-match, role, and plan controls to status reads.
- `apps/backend/src/modules/tenants/domain.routes.ts:46` to `apps/backend/src/modules/tenants/domain.routes.ts:58` apply the same controls to deletion.
- `apps/backend/src/shared/middleware/tenantMatch.ts:15` to `apps/backend/src/shared/middleware/tenantMatch.ts:17` reject non-super-admin callers when `request.user.tenantId !== request.tenant.id`.
- `apps/backend/src/modules/tenants/domain.routes.test.ts:119` to `apps/backend/src/modules/tenants/domain.routes.test.ts:136` assert mismatched authenticated-user tenant and host-resolved tenant returns 403 and does not call `setCustomDomain`.

Notes:
- For JWT callers, this closes the original host-based tenant override path.
- For API-key callers, `authenticate` sets `request.tenant = apiKey.tenant` at `apps/backend/src/shared/middleware/authenticate.ts:96`, so a hostile Host header does not carry through to domain mutation after authentication.

## Findings

### CD-002 - HIGH - Replacing a domain can remove the existing live Vercel domain before the new domain is safely committed

Evidence:
- `apps/backend/src/modules/tenants/domain.service.ts:95` to `apps/backend/src/modules/tenants/domain.service.ts:97` remove the existing Vercel domain before adding and committing the replacement.
- `apps/backend/src/modules/tenants/domain.service.ts:116` to `apps/backend/src/modules/tenants/domain.service.ts:145` perform the database update later.
- `apps/backend/src/modules/tenants/domain.service.ts:152` to `apps/backend/src/modules/tenants/domain.service.ts:158` clean up only the newly added domain on failure.

Impact:
If Vercel add succeeds but the database transaction fails, or if add/config lookup fails after old-domain removal, the database can still point to the old custom domain while Vercel no longer serves it.

Recommended fix:
Use a two-phase replacement flow: add the new domain first, commit DB state, then remove the previous domain after successful commit. Track replacement state and retry external cleanup through reconciliation.

### CD-003 - HIGH - Backend CORS does not allow active custom domains

Evidence:
- `apps/backend/src/app.ts:68` to `apps/backend/src/app.ts:75` allow only localhost, `127.0.0.1`, and `*.fauward.com` origins.
- `apps/backend/src/app.ts:99` to `apps/backend/src/app.ts:108` reject any other browser origin.
- `apps/tenant-portal/src/api/domain.ts:28`, `apps/tenant-portal/src/api/domain.ts:42`, and `apps/tenant-portal/src/api/domain.ts:52` call `/api` endpoints from the tenant portal.

Impact:
A portal loaded from `https://track.customer.com` can produce `Origin: https://track.customer.com`; the backend CORS rule rejects it unless production guarantees same-origin proxying before requests reach the API.

Recommended fix:
Allow CORS origins whose host matches an `ACTIVE` `Tenant.customDomain`, with normalization and caching. If the deployment relies on same-origin proxying, document that invariant and add an integration/E2E test for it.

### CD-004 - MEDIUM - Apex-domain rejection is not public-suffix-aware

Evidence:
- `apps/backend/src/modules/tenants/domain.validator.ts:40` to `apps/backend/src/modules/tenants/domain.validator.ts:45` reject apex domains only when `normalized.split('.').length < 3`.

Impact:
This rejects `example.com`, but allows registrable apex domains under multi-part public suffixes, such as `example.co.uk`, because they have three labels.

Recommended fix:
Use a maintained public suffix parser and require at least one label beyond the registrable domain.

### CD-005 - MEDIUM - Migration marks existing domains ACTIVE without Vercel validation

Evidence:
- `apps/backend/prisma/migrations/0026_custom_domain_vercel/migration.sql:10` to `apps/backend/prisma/migrations/0026_custom_domain_vercel/migration.sql:25` map existing `domainVerified = true` rows directly to `customDomainStatus = 'ACTIVE'`.
- `apps/backend/src/shared/middleware/tenant.resolver.ts:52` to `apps/backend/src/shared/middleware/tenant.resolver.ts:56` route hosts matching `customDomainStatus = 'ACTIVE'`.

Impact:
Stale or manually set `domainVerified` rows become routable before the new Vercel project/domain configuration is confirmed.

Recommended fix:
Backfill existing domains into `VERIFYING` or `PENDING_DNS` unless Vercel confirms the domain exists on the configured portal project and is verified. Run a one-time reconciliation job before routing them as `ACTIVE`.

### CD-006 - MEDIUM - Verification polling performs upstream mutations on GET and can exceed provider limits

Evidence:
- `apps/tenant-portal/src/api/domain.ts:31` to `apps/tenant-portal/src/api/domain.ts:34` poll status every 10 seconds while pending/verifying.
- `apps/backend/src/modules/tenants/domain.routes.ts:32` to `apps/backend/src/modules/tenants/domain.routes.ts:42` allow 60 status checks per tenant per minute.
- `apps/backend/src/modules/tenants/domain.service.ts:173` to `apps/backend/src/modules/tenants/domain.service.ts:180` call Vercel `verifyDomain`, `getDomain`, and `getDomainConfig` on each status check.
- `apps/backend/src/modules/tenants/domain.service.ts:197` to `apps/backend/src/modules/tenants/domain.service.ts:224` update tenant state and write audit entries from the status GET path.

Impact:
Multiple settings tabs can create frequent Vercel verification calls and database writes. GET having external and database side effects also complicates retries and caching.

Recommended fix:
Throttle upstream checks server-side using `customDomainLastCheckAt`, move provider verification to a background job or explicit `POST /verify`, and let GET return stored status.

### CD-007 - LOW - Domain verification token is generated but unused

Evidence:
- `apps/backend/prisma/schema.prisma:315` adds `customDomainVerificationToken`.
- `apps/backend/src/modules/tenants/domain.service.ts:129` generates a random token.
- No inspected route or frontend component exposes or validates that token.

Impact:
The field can be mistaken for an ownership proof, but Vercel verification is the only effective check in the current implementation.

Recommended fix:
Remove the token or implement a TXT-record ownership challenge using it.

### CD-008 - LOW - Audit entries for API-key domain changes do not identify the API key

Evidence:
- `apps/backend/src/modules/tenants/domain.controller.ts:12` to `apps/backend/src/modules/tenants/domain.controller.ts:18` set API-key actors to `actorUserId = null` and `actorType = 'API_KEY'`.
- `apps/backend/src/modules/tenants/domain.service.ts:300` to `apps/backend/src/modules/tenants/domain.service.ts:312` write `actorId` from `actorUserId`, leaving API-key domain mutations without the key id.

Impact:
If API keys remain allowed to manage domains, the audit log cannot identify which key made the change.

Recommended fix:
Record the API key id or prefix in audit metadata or a dedicated actor reference. Prefer disallowing API-key domain mutation unless explicitly required.

## Resolved Checks

- Cross-tenant mutation: fixed by `requireTenantMatch` in all domain routes and covered by `apps/backend/src/modules/tenants/domain.routes.test.ts:119` to `apps/backend/src/modules/tenants/domain.routes.test.ts:136`.
- Tenant admin role guard: present via `requireRole(['TENANT_ADMIN', 'SUPER_ADMIN'])` in `apps/backend/src/modules/tenants/domain.routes.ts:16` and applied to set/status/delete.
- Plan gating: present via `requirePlan(['PRO', 'ENTERPRISE'])` in `apps/backend/src/modules/tenants/domain.routes.ts:15` and applied to set/status/delete.
- API-key scope enforcement: exact domain scopes are now enforced. `apps/backend/src/shared/middleware/authenticate.ts:32` maps `/tenant/domain` to `domains:read` or `domains:write`, and `apps/backend/src/shared/middleware/authenticate.ts:37` to `apps/backend/src/shared/middleware/authenticate.ts:42` reject unrelated write scopes for `domains:*` unless the key has the exact scope or `*`. Tests at `apps/backend/src/shared/middleware/authenticate.test.ts:13` to `apps/backend/src/shared/middleware/authenticate.test.ts:62` cover exact mapping and rejection of a `shipments:write` key on custom-domain writes.
- Public auth custom-domain resolution: fixed by custom-domain lookup on public paths at `apps/backend/src/shared/middleware/tenant.resolver.ts:107` to `apps/backend/src/shared/middleware/tenant.resolver.ts:118`, with test coverage at `apps/backend/src/shared/middleware/tenant.resolver.test.ts:137` to `apps/backend/src/shared/middleware/tenant.resolver.test.ts:152`.

## Final Verdict

PASS

No CRITICAL findings remain in the current working tree. The feature still has HIGH/MEDIUM hardening work, especially Vercel replacement ordering and custom-domain CORS/proxy validation.
