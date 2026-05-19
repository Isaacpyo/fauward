# Admin Break Glass

Use this procedure when super-admin access is blocked by edge allowlisting, future zero-trust policy, or future WebAuthn enrollment/recovery issues.

## Controls

- Two-person approval is required for any break-glass action.
- Record every action in the security change log.
- Temporary network bypasses expire within 24 hours.
- Recovery material is stored offline by the owner; do not place recovery codes, secrets, API tokens, or private keys in this repository.

## Network Bypass

1. Confirm the admin's source IP using a trusted channel.
2. Add the IP to the Cloudflare `fauward_admin_break_glass_ips` list with a UTC expiry comment in the form `expires_at=2026-05-20T12:00:00Z`.
3. Confirm `https://admin.fauward.com/login` is reachable from that IP and still blocked from a non-allowlisted IP.
4. Confirm the `Admin break-glass expiry` workflow removes the IP within 24 hours and record the removal.

## All Super-Admins Locked Out

1. Pause destructive admin operations.
2. Use direct database access from the approved recovery workstation.
3. Identify the affected platform/admin user records by email only. The allowlisted emails are `fauward@gmail.com` and `admin@fauward.com`.
4. Re-enable one founder account using the phase-specific recovery runbook:
   - Phase 2: clear revoked admin session state and issue a new password reset through the admin auth realm.
   - Phase 3 onward: mark the user for WebAuthn re-enrollment and remove only the lost credential rows for that user. Do not remove the last credential from another active super-admin.
   - Phase 5 onward: confirm the email is still allowed in Cloudflare Access before changing application state.
5. Sign in, register replacement authenticators, and verify audit logging.
6. Review `admin_audit_log`, Cloudflare Access logs, and Slack admin-action alerts for the lockout window.

## Offline Recovery Material

Maintain an offline sealed record containing:

- Current recovery approvers and phone numbers.
- Database console access procedure.
- Cloudflare account recovery procedure.
- Location of hardware security keys assigned to each founder.
- Last test date for this runbook.

Test this runbook on staging after Phase 3 and after every later auth-policy change.
