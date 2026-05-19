# Rollback

## Admin Hardening Phase 1: Network Isolation

Disable:

```env
ADMIN_HARDENING_PHASE_1=false
```

Then redeploy the backend. This disables the origin host guard and restores legacy visibility for existing `/api/internal/*`, `/api/v1/platform/*`, and `/api/v1/admin/*` routes.

Edge rollback:

1. Disable the Cloudflare WAF custom rule for `admin.fauward.com`.
2. Remove any entries from `fauward_admin_break_glass_ips`.
3. If the new admin portal deployment is causing issues, remove the `admin.fauward.com` DNS record or point it at a maintenance page.

Data cleanup: none. Phase 1 adds no tables and writes no records.

User-visible effect: super-admins may need to use the legacy admin surface while the isolated hostname is repaired. Tenant/customer auth and tenant portal traffic are unaffected.
