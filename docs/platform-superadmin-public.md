# Fauward Platform Superadmin

The Fauward Superadmin system is the internal platform control plane used to operate, secure, and support Fauward tenants. It is separate from tenant administration and is designed for high-trust platform operations only.

Superadmin is the platform control plane. It must never use default credentials, browser localStorage tokens, or synthetic unauditable identities in production.

## Purpose

Superadmin gives authorized Fauward platform staff controlled access to platform-level functions:

- Monitor platform health, queues, revenue, Relay support activity, and tenant operations.
- Read tenant state across the platform.
- Suspend or unsuspend tenants under documented policy.
- Apply temporary entitlement plan overrides without changing billing records.
- Review and approve region change requests.
- Start tightly scoped tenant impersonation sessions for support and investigation.
- View operational logs with privacy-preserving redaction by default.
- Review tamper-evident platform audit logs.

## Platform Identity Separation

Platform staff accounts are not tenant users. A platform user has a dedicated database identity, role, permissions, sessions, MFA state, and audit history.

Tenant administrators manage their own tenant workspace. Platform users manage Fauward’s platform operations. These identities are intentionally separate so tenant users cannot access platform routes and platform actions remain attributable to real platform actors.

## Roles

The control plane supports scoped platform roles:

- `SUPER_ADMIN`: full platform control-plane access.
- `PLATFORM_SUPPORT`: tenant support and Relay workflows.
- `PLATFORM_OPERATIONS`: operational health, queues, region decisions, suspension workflows.
- `PLATFORM_FINANCE`: billing, revenue, and plan override workflows.
- `PLATFORM_READONLY`: read-only platform visibility.

Every platform route is protected by permissions rather than broad role checks alone.

## Session Security

Platform sessions use secure HttpOnly cookies, not browser localStorage. Access sessions are short-lived and refresh sessions rotate. Platform requests include issuer, audience, session ID, user status, and session revocation checks.

All state-changing platform requests require CSRF protection with an `X-CSRF-Token` header.

## MFA And Step-Up Verification

Platform login may require MFA based on the user’s account configuration. Dangerous actions require fresh MFA verification within a 10-minute window.

Fresh MFA is required for:

- Suspending or unsuspending a tenant.
- Applying a plan override.
- Starting impersonation.
- Approving or rejecting region changes.
- Viewing sensitive logs.
- Managing platform users or revoking another platform session.

If MFA is stale or missing, the platform returns `MFA_REQUIRED`.

## Tenant Impersonation

Impersonation is explicit and auditable. Platform users do not silently become tenant admins. An impersonation session records:

- The platform actor.
- The target tenant.
- The target tenant user, if selected.
- Allowed scopes.
- Reason.
- Expiry.
- Revocation state.

Tenant-side systems can detect impersonated requests. The frontend must show a persistent amber banner during impersonation with tenant name, expiry, and an end action.

## Auditability

Every platform mutation writes a platform audit log. Audit records include actor identity, target tenant or user, reason, metadata, IP address, user agent, previous hash, and current hash.

The hash chain makes new audit records tamper-evident from the point the platform audit log is enabled.

## Tenant Suspension Policy

Suspension blocks tenant dashboard and tenant API mutations while preserving platform access for investigation and remediation. Public tracking remains read-only. Existing in-transit operational work should not be silently destroyed.

Suspension and unsuspension require permission, reason, fresh MFA, and audit logging.

## Plan Overrides

Plan overrides do not modify billing records. Billing plan and effective entitlement plan are separate:

- Billing plan remains the commercial subscription source.
- Active override plan may temporarily change entitlements.
- Overrides store reason, actor, expiry, and audit metadata.

Temporary promotions, trials, support remediation, or testing overrides should use expiry dates.

## Region Decisions

Region approval and rejection require scoped permission, reason, fresh MFA, reviewer metadata, and audit logging. Target regions must be supported before approval.

## Log Privacy

Logs are redacted by default. Emails, phone numbers, API keys, bearer tokens, refresh tokens, passwords, webhook secrets, payment identifiers, and similar sensitive values are masked where possible.

Viewing sensitive logs requires an elevated permission, fresh MFA, reason, and a `SENSITIVE_LOG_VIEW` audit log.

## Operational Checklist

Before production use:

- Run platform database migrations.
- Configure platform session and refresh secrets.
- Configure secure cookie domain.
- Bootstrap the first real platform user.
- Enable MFA for privileged platform accounts.
- Verify frontend calls only `/api/v1/platform/*`.
- Confirm no platform tokens are stored in localStorage.
- Confirm audit logs are written for platform mutations.
- Confirm dangerous actions reject stale MFA and missing reason.

