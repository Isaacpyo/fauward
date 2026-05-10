# Platform Superadmin Control Plane

Superadmin is the Fauward platform control plane. It must never use default credentials, localStorage tokens, or synthetic unauditable identities in production.

## Identity

Platform users live in `platform_users`, separate from tenant `users`. Platform sessions live in `platform_sessions` and are validated independently from tenant JWTs. Tenant users cannot authenticate to `/api/v1/platform/*`.

Roles:

- `SUPER_ADMIN`
- `PLATFORM_SUPPORT`
- `PLATFORM_OPERATIONS`
- `PLATFORM_FINANCE`
- `PLATFORM_READONLY`

Permissions are scoped, for example `tenant:read`, `tenant:suspend`, `tenant:plan_override`, `tenant:impersonate`, `region:approve`, `logs:view_sensitive`, and `platform_users:manage`. `SUPER_ADMIN` receives all platform permissions.

## Auth, Cookies, And CSRF

Platform login is `POST /api/v1/platform/auth/login`. Runtime login only checks real `PlatformUser` rows. Access and refresh credentials are HttpOnly cookies:

- `fw_platform_access`: short-lived platform JWT, issuer `fauward-platform`, audience `fauward-platform-admin`.
- `fw_platform_refresh`: rotating refresh JWT tied to `platform_sessions.refreshTokenHash`.
- `fw_platform_csrf`: readable double-submit CSRF cookie used by the frontend as `X-CSRF-Token`.

All platform mutations require `X-CSRF-Token`. Production requires `PLATFORM_SESSION_SECRET`, `PLATFORM_REFRESH_SECRET`, and `PLATFORM_COOKIE_DOMAIN`.

## MFA And Step-Up

Dangerous actions require MFA verified in the last 10 minutes. If the session is stale, the API returns:

```json
{ "error": "MFA_REQUIRED", "message": "Fresh MFA verification is required for this action." }
```

Dangerous actions include tenant suspension, unsuspension, plan overrides, impersonation, region approvals/rejections, sensitive log views, platform user management, and session revocation.

## Impersonation

Impersonation uses `platform_impersonation_sessions`; it is not modelled as silently becoming a tenant admin. Tokens include platform actor data, target tenant/user context, scopes, `impersonationSessionId`, and `mode: "IMPERSONATION"`. The tenant UI must show a persistent amber banner with tenant name, expiry, and an end action.

## Audit

Platform mutations write `platform_audit_logs`. New logs include actor, target, reason, metadata, IP, user agent, `previousHash`, and `hash`. Hashes are chained with stable serialization so tampering is detectable. Use the audit API with `?verify=true` to verify the chain.

## Tenant Suspension

Suspended tenants are blocked from tenant dashboard/API mutations with `TENANT_SUSPENDED`. Public tracking remains read-only. Platform routes can still read and manage suspended tenants.

## Plan Overrides

Plan overrides are stored in `tenant_plan_overrides`; billing plan remains separate. Entitlement resolution uses an active override if present and otherwise falls back to the tenant billing plan. Overrides require permission, reason, fresh MFA, and audit logging.

## Region Requests And Logs

Region decisions require approve/reject permission, fresh MFA, reason, reviewer metadata, and audit logging. Logs are redacted by default; sensitive log access requires `logs:view_sensitive`, fresh MFA, reason, and a `SENSITIVE_LOG_VIEW` audit entry.

## Bootstrap

Create the first platform user after migrations:

```bash
npm run platform:admin:create -- --email admin@example.com --password "<unique-password>"
```

The command also accepts `PLATFORM_ADMIN_BOOTSTRAP_EMAIL` and `PLATFORM_ADMIN_BOOTSTRAP_PASSWORD`. It refuses duplicates and never prints the password.

## Required Env

- `PLATFORM_SESSION_SECRET`
- `PLATFORM_REFRESH_SECRET`
- `PLATFORM_COOKIE_DOMAIN`
- `PLATFORM_ADMIN_BOOTSTRAP_EMAIL` only for bootstrap
- `PLATFORM_ADMIN_BOOTSTRAP_PASSWORD` only for bootstrap

Production checklist: run Prisma migrations, create platform users, configure secrets, enable MFA for privileged users, verify CSRF/cookie domain settings, and confirm frontend calls `/api/v1/platform/*`.
