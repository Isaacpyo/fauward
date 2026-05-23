# Custom Domains

Tenant-owned widget domains let a host such as `ship.acme.com` serve the same hosted shipment form without using a Fauward path.

## Ownership Model

The canonical source of truth is the Supabase/Postgres table:

```text
tenant_widget_domains
```

Each host belongs to one tenant. `lib/widgetDomainsDb.ts` also checks `tenants.customDomain` so a host already used as a tenant portal domain cannot be claimed as a widget domain.

Edge Config is only a read cache for middleware. It stores one key:

```json
{
  "domains": {
    "ship.acme.com": "acme"
  }
}
```

This map is written by `app/api/admin/domains` through `lib/edgeConfigAdmin.ts`. It must not be hand-edited in the dashboard because it is derived from DB ownership and verification state.

## Endpoints

All endpoints are under `app/api/admin/domains` and require tenant API-key auth through `adminAuth`.

`POST /api/admin/domains`

- Scope: `domains:write`
- Body: `{ "domain": "ship.acme.com" }`
- Checks availability.
- Writes the DB row first.
- Adds the host to the Vercel project.
- Returns the CNAME instructions.

`GET /api/admin/domains?domain=ship.acme.com`

- Scope: `domains:read`
- Confirms the caller owns the domain row.
- Reads Vercel verification and configuration status.
- When verified and not misconfigured, marks the DB row verified and maps the host to the tenant slug in Edge Config.

`DELETE /api/admin/domains?domain=ship.acme.com`

- Scope: `domains:write`
- Confirms the caller owns the domain row.
- Removes the host from Vercel.
- Removes the host from Edge Config.
- Deletes the DB row.

## Vercel Behavior

`lib/vercelDomains.ts` targets one Vercel project: `fauward-widget`.

The helper tolerates expected idempotency cases:

- Add domain 409: the domain already exists on the project, so the helper fetches the existing project-domain record.
- Remove domain 404: the domain is already absent, so the helper treats removal as complete.

Only tenant-owned widget hosts should be attached here. `app.fauward.com` and `*.fauward.com` remain portal-owned and must not point at the widget project.

## Edge Config Writes

`lib/edgeConfigAdmin.ts` reads the current `domains` object, merges the requested host change, and writes the whole item back. This is a merge-not-clobber flow: adding one host preserves other host mappings, and removing one host deletes only that host key.

## Required Runtime Env

Custom-domain administration requires these production env vars on `fauward-widget`:

- `VERCEL_TOKEN`
- `VERCEL_PROJECT_ID`
- `EDGE_CONFIG_ID`

`VERCEL_TOKEN` is now set in the `fauward-widget` Production environment. It must be a personal user token for account `isaacpyo04`; automation tokens cannot mint user tokens and should not be used as a substitute.

See also [Routing and Middleware](routing-and-middleware.md), [Tokens and Auth](tokens-and-auth.md), and [Deployment](deployment.md).
