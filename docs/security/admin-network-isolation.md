# Admin Network Isolation

Phase 1 moves the super-admin surface to `admin.fauward.com` and hides admin backend routes when they are reached on any tenant/customer hostname.

## Runtime Flags

Set these only in the admin hardening staging environment until final production rollout:

```env
ADMIN_HOSTNAME=admin.fauward.com
ADMIN_HARDENING_PHASE_1=true
```

Leaving `ADMIN_HARDENING_PHASE_1=false` restores the legacy backend route visibility.

## Cloudflare Edge Rule

Create a proxied DNS record for `admin.fauward.com` pointing at the admin portal origin. The tenant portal DNS stays unchanged.

Create two Cloudflare IP lists:

- `fauward_admin_allowed_ips`: office and normal admin home IPs.
- `fauward_admin_break_glass_ips`: temporary travel/recovery IPs only.

Add a WAF custom rule before any permissive rule:

```text
http.host eq "admin.fauward.com"
and not (ip.src in $fauward_admin_allowed_ips)
and not (ip.src in $fauward_admin_break_glass_ips)
```

Action: `Block`

Expected edge behavior: a non-allowlisted request to `https://admin.fauward.com/login` receives a Cloudflare 403 and the origin access log has no matching request.

## Origin Host Guard

The backend guard is enabled by `ADMIN_HARDENING_PHASE_1=true`. It returns a generic 404 for these route namespaces unless the request `Host` header is `admin.fauward.com`:

- `/admin/*`
- `/api/internal/*`
- `/api/v1/platform/*`
- `/api/v1/admin/*`

This is a backstop for WAF/DNS mistakes. It is intentionally a 404, not a 403, so tenant hostnames do not reveal the admin route surface.

## Break Glass

Use the break-glass list only when an allowlisted admin must work from a new location and normal allowlist change control is too slow.

1. Record the request in the security change log with requester, approver, source IP, reason, and expiry time.
2. Add the IP to `fauward_admin_break_glass_ips` with a UTC expiry comment in the form `expires_at=2026-05-20T12:00:00Z`.
3. The `Admin break-glass expiry` GitHub Actions workflow runs hourly and removes expired list items through the Cloudflare Rules Lists API.
4. Verify the IP is removed by running the edge acceptance check from that network after expiry.

The break-glass list must be empty during normal operation.

Required workflow secrets:

- `CF_API_TOKEN` with Cloudflare Account Rules Lists edit permission.
- `CF_ACCOUNT_ID`.
- `CF_ADMIN_BREAK_GLASS_LIST_ID`.

Cloudflare API reference: https://developers.cloudflare.com/api/resources/rules/subresources/lists/subresources/items/

## Verification

```powershell
npm run test --workspace=apps/backend -- admin-host-guard
npm run build --workspace=apps/admin-portal
npm run build --workspace=apps/tenant-portal
rg -i "admin-portal|@fauward/admin-portal|/admin/auth|fw_admin" apps/tenant-portal/dist
```

The final `rg` command should produce no matches. Then verify edge behavior from a non-allowlisted network:

```powershell
curl -i https://admin.fauward.com/login
```

Expected: Cloudflare/WAF 403 before origin.
