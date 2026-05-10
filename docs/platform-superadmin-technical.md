# Platform Superadmin Technical Reference

This document describes the implementation and operating contract for the Fauward Superadmin platform control plane.

Superadmin is the platform control plane. It must never use default credentials, localStorage tokens, synthetic unauditable identities, tenant-user authorization, or development auth bypasses in production.

## Stack

- Backend: Fastify in `apps/backend`.
- Database/ORM: Prisma with PostgreSQL schema in `apps/backend/prisma/schema.prisma`.
- Frontend: React/Vite Superadmin app in `apps/super-admin`.
- Tenant auth: existing tenant JWT auth remains separate.
- Platform auth: dedicated platform cookie/session middleware and platform routes.

## Route Namespace

Canonical platform API namespace:

```txt
/api/v1/platform/*
```

Deprecated compatibility namespace:

```txt
/api/v1/admin/*
```

Compatibility routes should remain temporary only. New frontend and backend platform code must use `/api/v1/platform/*`.

Required platform routes:

```txt
POST   /api/v1/platform/auth/login
POST   /api/v1/platform/auth/mfa/verify
POST   /api/v1/platform/auth/logout
POST   /api/v1/platform/auth/refresh
GET    /api/v1/platform/auth/me
GET    /api/v1/platform/tenants
GET    /api/v1/platform/tenants/:id
PATCH  /api/v1/platform/tenants/:id/plan-override
POST   /api/v1/platform/tenants/:id/suspend
POST   /api/v1/platform/tenants/:id/unsuspend
POST   /api/v1/platform/tenants/:id/impersonation-sessions
DELETE /api/v1/platform/impersonation-sessions/:id
GET    /api/v1/platform/impersonation-sessions/active
GET    /api/v1/platform/metrics
GET    /api/v1/platform/queues
GET    /api/v1/platform/health
GET    /api/v1/platform/region-change-requests
PATCH  /api/v1/platform/region-change-requests/:id
GET    /api/v1/platform/logs
GET    /api/v1/platform/audit
GET    /api/v1/platform/relay
```

## Database Models

### PlatformUser

Real platform staff identity, separate from tenant `User`.

Fields:

- `id`
- `email`
- `name`
- `passwordHash`
- `role`
- `status`
- `mfaEnabled`
- `mfaSecretEncrypted`
- `lastLoginAt`
- `createdAt`
- `updatedAt`
- `disabledAt`

### PlatformSession

Server-side platform session record.

Fields:

- `id`
- `platformUserId`
- `refreshTokenHash`
- `mfaVerifiedAt`
- `ipAddress`
- `userAgent`
- `expiresAt`
- `revokedAt`
- `createdAt`
- `updatedAt`

### PlatformImpersonationSession

Explicit platform-to-tenant support session.

Fields:

- `id`
- `platformUserId`
- `targetTenantId`
- `targetUserId`
- `scopes`
- `reason`
- `expiresAt`
- `revokedAt`
- `createdAt`

### TenantPlanOverride

Entitlement override that does not mutate billing plan.

Fields:

- `id`
- `tenantId`
- `plan`
- `reason`
- `expiresAt`
- `createdByPlatformUserId`
- `revokedAt`
- `createdAt`
- `updatedAt`

### PlatformAuditLog

Tamper-evident platform audit trail.

Fields:

- `id`
- `actorType`
- `actorId`
- `actorEmail`
- `action`
- `targetTenantId`
- `targetUserId`
- `impersonationSessionId`
- `reason`
- `metadata`
- `ipAddress`
- `userAgent`
- `previousHash`
- `hash`
- `createdAt`

## Migrations

Relevant Prisma migrations:

```txt
apps/backend/prisma/migrations/0005_platform_control_plane/migration.sql
apps/backend/prisma/migrations/0006_route_stop_tracking_link/migration.sql
```

Run migrations before using platform auth:

```bash
npm run prisma:migrate --workspace=apps/backend
```

Generate Prisma client after schema changes:

```bash
npm run prisma:generate --workspace=apps/backend
```

On Windows, if Prisma cannot replace `query_engine-windows.dll.node`, stop running Node processes that are holding the Prisma client and rerun generation.

## Bootstrap

Runtime login never uses environment fallback credentials.

Create the first platform user with:

```bash
npm run platform:admin:create -- --email admin@example.com --password "<unique-password>"
```

The command also supports:

```txt
the platform bootstrap email variable
the platform bootstrap password variable
PLATFORM_ADMIN_BOOTSTRAP_NAME
PLATFORM_ADMIN_BOOTSTRAP_ROLE
```

Rules:

- Password must be explicit.
- Password must be at least 12 characters.
- Password is hashed with the strongest existing project password hashing helper.
- Duplicate platform user email is refused.
- Password is never printed.

## Required Environment Variables

Production requires:

```txt
PLATFORM_SESSION_SECRET
PLATFORM_REFRESH_SECRET
PLATFORM_COOKIE_DOMAIN
```

Bootstrap only:

```txt
the platform bootstrap email variable
the platform bootstrap password variable
```

Do not use or reintroduce:

```txt
legacy platform admin email/password environment fallbacks
```

## Platform JWT Claims

Platform access tokens include:

```json
{
  "sub": "platformUser.id",
  "actorType": "PLATFORM_USER",
  "tenantId": "system",
  "role": "SUPER_ADMIN",
  "permissions": ["tenant:read"],
  "sessionId": "platformSession.id",
  "mfaVerifiedAt": "2026-05-02T12:00:00.000Z",
  "iss": "fauward-platform",
  "aud": "fauward-platform-admin"
}
```

Validation must check:

- JWT signature.
- Issuer.
- Audience.
- `actorType`.
- `tenantId`.
- Session ID exists.
- Session is not revoked.
- Session is not expired.
- Platform user exists.
- Platform user status is `ACTIVE`.

## Cookies

Platform auth cookies:

```txt
fw_platform_access
fw_platform_refresh
fw_platform_csrf
```

Cookie requirements:

- Access and refresh cookies are HttpOnly.
- Secure is enabled in production.
- SameSite is strict.
- Refresh token rotates.
- CSRF token is sent back as `X-CSRF-Token`.

Frontend API client requirements:

```ts
withCredentials: true
```

or for `fetch`:

```ts
credentials: "include"
```

## Middleware

Dedicated platform middleware:

- `authenticatePlatformSession`
- `requirePlatformPermission`
- `requireFreshPlatformMfa`
- `requirePlatformReason`
- `requirePlatformCsrf`

Tenant suspension middleware:

- `enforceTenantStatus`

Tenant auth middleware must not be used to authorize platform routes.

## Roles And Permissions

Roles:

- `SUPER_ADMIN`
- `PLATFORM_SUPPORT`
- `PLATFORM_OPERATIONS`
- `PLATFORM_FINANCE`
- `PLATFORM_READONLY`

Permissions:

- `tenant:read`
- `tenant:suspend`
- `tenant:unsuspend`
- `tenant:plan_override`
- `tenant:impersonate`
- `region:read`
- `region:approve`
- `region:reject`
- `billing:view`
- `revenue:view`
- `system:health`
- `queue:view`
- `relay:view`
- `relay:respond`
- `logs:view`
- `logs:view_sensitive`
- `audit:view`
- `platform_users:manage`

Permission examples:

```txt
GET tenants                -> tenant:read
POST suspend tenant        -> tenant:suspend + fresh MFA + reason
POST unsuspend tenant      -> tenant:unsuspend + fresh MFA + reason
PATCH plan override        -> tenant:plan_override + fresh MFA + reason
POST impersonation session -> tenant:impersonate + fresh MFA + reason
GET sensitive logs         -> logs:view_sensitive + fresh MFA + reason
PATCH region request       -> region:approve or region:reject + fresh MFA + reason
```

## Fresh MFA

Fresh MFA window:

```txt
10 minutes
```

Error response:

```json
{
  "error": "MFA_REQUIRED",
  "message": "Fresh MFA verification is required for this action."
}
```

Dangerous actions:

- Tenant suspend.
- Tenant unsuspend.
- Plan override.
- Start impersonation.
- Approve region change.
- Reject region change.
- View sensitive logs.
- Manage platform users.
- Revoke another platform user or session.

## Impersonation

Impersonation session expiry:

```txt
30 minutes default
```

Impersonation token/session claims:

```json
{
  "actorType": "PLATFORM_USER",
  "actorId": "platform-user-id",
  "targetTenantId": "tenant-id",
  "targetUserId": "tenant-user-id",
  "impersonationSessionId": "session-id",
  "scopes": ["read"],
  "mode": "IMPERSONATION"
}
```

Rules:

- Requires `tenant:impersonate`.
- Requires fresh MFA.
- Requires reason.
- Must not hide impersonation.
- Must audit start and end.
- Tenant backend must be able to detect impersonation.
- Tenant UI must show an amber impersonation banner.
- Do not expose tenant API secrets.
- Do not expose payment card data.
- Do not allow destructive tenant actions unless scope explicitly allows them.

Redis/database revocation:

- Database stores `revokedAt`.
- Redis stores active session marker where available.
- Ending impersonation deletes the Redis marker and marks the DB session revoked.

## Audit Chain

New platform audit logs are chained with:

```txt
hash = sha256(stableSerialize(auditFields + previousHash))
```

Each log stores:

- `previousHash`
- `hash`

Verification utility recomputes the chain in chronological order.

Actions to audit:

- `PLATFORM_LOGIN_SUCCESS`
- `PLATFORM_LOGIN_FAILURE`
- `PLATFORM_MFA_SUCCESS`
- `PLATFORM_MFA_FAILURE`
- `PLATFORM_SESSION_REVOKED`
- `TENANT_PLAN_OVERRIDE`
- `TENANT_SUSPENSION`
- `TENANT_UNSUSPEND`
- `TENANT_IMPERSONATION_START`
- `TENANT_IMPERSONATION_END`
- `TENANT_IMPERSONATED_ACTION`
- `REGION_CHANGE_APPROVED`
- `REGION_CHANGE_REJECTED`
- `SENSITIVE_LOG_VIEW`
- `PLATFORM_USER_CREATED`
- `PLATFORM_USER_DISABLED`

Never audit raw passwords, MFA secrets, refresh tokens, API keys, webhook secrets, or full sensitive payloads.

## Tenant Suspension Enforcement

Blocked response:

```json
{
  "error": "TENANT_SUSPENDED",
  "message": "This tenant is currently suspended. Contact support."
}
```

Suspended tenant behavior:

- Tenant dashboard access is blocked.
- Tenant API mutations are blocked.
- New shipment creation is blocked.
- New user invites are blocked.
- Tenant configuration changes are blocked.
- Public tracking remains read-only.
- Existing in-transit jobs are not destroyed.
- Platform routes can still read and manage the tenant.

## Plan Override Policy

Billing plan and effective entitlement plan are separate.

Resolver behavior:

```txt
if active override exists:
  effectivePlan = override.plan
else:
  effectivePlan = tenant.plan
```

Override requirements:

- `tenant:plan_override`
- Fresh MFA.
- Reason.
- Optional expiry.
- Audit log.

Audit metadata includes:

- Previous effective plan.
- New effective plan.
- Billing plan.
- Reason.
- Expiry.
- Actor ID.

## Region Request Policy

Approval/rejection requirements:

- `region:approve` or `region:reject`.
- Fresh MFA.
- Reason/comment.
- Supported target region.
- Reviewer metadata.
- Audit log.

Reviewer fields:

- `reviewedByPlatformUserId`
- `reviewedAt`
- `decisionReason`

## Log Redaction

Default log views are redacted. Sensitive views are exceptional.

Redact:

- Emails.
- Phone numbers.
- Addresses where possible.
- API keys.
- Bearer tokens.
- Refresh tokens.
- Passwords.
- Webhook secrets.
- Payment identifiers.
- Sensitive document URLs.

Examples:

```txt
apiKey: fw_live_****abcd
email: t***@domain.com
phone: +44******1234
```

Sensitive log access requires:

- `logs:view_sensitive`
- Fresh MFA.
- Reason.
- `SENSITIVE_LOG_VIEW` audit log.

## Frontend Contract

Superadmin app requirements:

- No platform token storage in localStorage/sessionStorage.
- API base path is `/api/v1/platform`.
- Axios `withCredentials: true`.
- Mutations include `X-CSRF-Token`.
- Guard calls `/api/v1/platform/auth/me`.
- Login calls `/api/v1/platform/auth/login`.
- Logout calls `/api/v1/platform/auth/logout`.
- Step-up MFA modal should verify via `/api/v1/platform/auth/mfa/verify` then retry the action.
- Dangerous actions must collect reason.
- Impersonation must show persistent amber banner.
- Tenant detail must show suspension and active plan override states.
- Permission-aware UI must hide or disable unavailable actions.
- Raw secrets must not be rendered.

## Testing Checklist

Backend tests should cover:

- Platform login rejects invalid credentials.
- Platform login succeeds for active platform user.
- Disabled platform user cannot log in.
- Missing platform auth env fails startup in production.
- No default platform credentials exist anywhere.
- Platform routes reject tenant user tokens.
- Platform routes require platform session.
- Mutating platform routes reject missing CSRF token.
- Permission checks block users without required permission.
- Dangerous actions reject stale or missing MFA.
- Step-up MFA refreshes `mfaVerifiedAt`.
- Tenant suspension blocks tenant dashboard/API access.
- Tenant suspension does not block platform access.
- Plan override stores reason, actor, expiry, and audit log.
- Effective plan resolver respects active override.
- Expired override no longer affects effective plan.
- Impersonation token/session contains actor and target context.
- Ending impersonation revokes the session.
- Impersonated actions write audit entries with `impersonationSessionId`.
- Sensitive logs are redacted by default.
- Sensitive logs require permission, reason, and fresh MFA.
- Region approval/rejection stores reviewer metadata and audit log.
- Audit logs include hash and previous hash.
- Audit chain verification works.

Frontend tests should cover:

- Guard uses `/api/v1/platform/auth/me`.
- API client uses credentials.
- Dangerous actions require reason and MFA modal.
- Impersonation banner renders when session is active.
- Superadmin token localStorage usage is absent.

## Verification Commands

This repo uses npm/turbo.

```bash
npm run lint
npm run test
npm run build
npm run build --workspace=apps/backend
npm run build --workspace=apps/super-admin
npm run test --workspace=apps/backend
```

There is currently no root `typecheck` script. Backend type checking is performed by:

```bash
npm run build --workspace=apps/backend
```

## Production Deployment Checklist

- Apply Prisma migrations.
- Generate Prisma client.
- Configure required platform auth env vars.
- Remove any bootstrap password after first user creation.
- Create first platform user with bootstrap command.
- Enable MFA for privileged platform users.
- Confirm platform cookie domain and HTTPS settings.
- Confirm frontend uses `/api/v1/platform/*`.
- Confirm CORS allows `X-CSRF-Token`.
- Confirm platform routes reject tenant JWTs.
- Confirm platform mutations reject missing CSRF.
- Confirm dangerous actions reject stale MFA and missing reason.
- Confirm audit logs are created and hash chained.
- Confirm sensitive logs are redacted by default.
- Confirm tenant suspension blocks tenant API mutations but not platform management.
