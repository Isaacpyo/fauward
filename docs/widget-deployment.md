# Widget Deployment

The widget app is deployed as a standalone Vercel project from the existing `apps/widget` workspace app.

## Live Project Facts

- Account: personal Hobby account `isaacpyo04`
- Team: none
- `VERCEL_TEAM_ID`: unset (must stay unset — personal account, no team)
- Project name: `fauward-widget`
- `VERCEL_PROJECT_ID`: `prj_8qd6w9Xq2rYdlxzEmLfiWRvxPWQQ`
- Production URL: `https://fauward-widget.vercel.app`
- Canonical user-facing host: **`https://ship.fauward.com`** (CNAME attached to this project)
- Root Directory: `apps/widget`
- Framework: Next.js
- Node.js: 20.x
- Source outside root directory: enabled for workspace packages such as `@fauward/tenant-db`

## Domains on this project

- `fauward-widget.vercel.app` — origin used by apex `/api/widget/*` and `/api/embed/token` rewrites.
- `ship.fauward.com` — canonical hosted-shipment host. Path-based slug (`ship.fauward.com/<company>`); handled as a platform host in middleware, not via Edge Config.

DNS prerequisite for `ship.fauward.com` (apex nameservers are on Cloudflare; Vercel preferred an A record). Add **one** of the following to the `fauward.com` zone in Cloudflare:

```
A      ship   76.76.21.21        ; Vercel-recommended (DNS-only / proxy off)
```

or, equivalently:

```
CNAME  ship   cname.vercel-dns.com   ; works with Cloudflare proxy off ("DNS only")
```

After the record propagates, Vercel runs verification and emails when the domain is valid. Re-check status with `npx vercel@latest domains inspect ship.fauward.com`.

## Edge Config

- `EDGE_CONFIG_ID`: `ecfg_jplkxxptuk37wukitnzapyzyfwdr`
- `EDGE_CONFIG`: set in Production with a read token
- Initial item: `domains = {}`

The `domains` item is the edge-read host-to-tenant map used by the **dormant** white-label code path (`resolveTenantByHost`). It is updated by `app/api/admin/domains` after Vercel verifies a tenant-owned custom domain. `ship.fauward.com` does **not** appear in this map — it's a platform host whose slug is derived from the URL path.

## Apex Routing

`apps/frontend/next.config.mjs` does the following on `fauward.com` / `www.fauward.com`:

**Redirects (301, permanent):**

- `/ship` → `https://ship.fauward.com/`
- `/ship/:path*` → `https://ship.fauward.com/:path*`

**Rewrites (pass-through to widget origin):**

- `/api/embed/token` → `https://fauward-widget.vercel.app/api/embed/token` (dormant embed token minting — kept so any already-deployed embeds keep working)
- `/api/widget/:path*` → `https://fauward-widget.vercel.app/api/widget/:path*` (live — the hosted form depends on this)

`fauward.com` redirects to `www.fauward.com` with 307; the `/ship*` 301s then fire on the canonical host. `app.fauward.com` and other `*.fauward.com` hosts remain portal-owned and must not be pointed at the widget project.

## Adding ship.fauward.com to the project

From a clean checkout with the widget project linked:

```powershell
npx vercel@latest whoami                              # expect: isaacpyo04
npx vercel@latest domains add ship.fauward.com fauward-widget
```

Vercel will print the exact CNAME target to create at the DNS registrar. Add that record, then verify in the Vercel dashboard or with:

```powershell
npx vercel@latest domains inspect ship.fauward.com
```

## Redeploy

```powershell
npx vercel@latest --prod --yes
```

The linked project should be `fauward-widget`. Confirm project settings before deploying:

```powershell
npx vercel@latest project inspect fauward-widget
```

Expected settings:

- Root Directory: `apps/widget`
- Framework Preset: Next.js
- Node.js Version: 20.x

## Cutover order

1. Land the middleware + apex-redirect code changes.
2. Deploy `fauward-widget` (gets the new middleware live).
3. Add `ship.fauward.com` as a domain on the project and create the CNAME.
4. Wait for DNS to propagate and Vercel to mark the domain `Valid Configuration`.
5. Only then deploy `apps/frontend` so the `/ship → ship.fauward.com` 301 goes live (don't 301 traffic to a host that isn't serving yet).

## Production Smoke Checks

Use unauthenticated checks first so no secrets are printed:

```powershell
# Canonical hosted form
Invoke-WebRequest https://ship.fauward.com/<seeded-slug> -UseBasicParsing
Invoke-WebRequest https://ship.fauward.com/__missing__ -UseBasicParsing -SkipHttpErrorCheck
Invoke-WebRequest https://ship.fauward.com/ -UseBasicParsing -SkipHttpErrorCheck

# Apex 301 to ship.
Invoke-WebRequest https://www.fauward.com/ship/<seeded-slug> -UseBasicParsing -MaximumRedirection 0 -SkipHttpErrorCheck

# Dormant embed token + live widget API still reachable
Invoke-WebRequest https://www.fauward.com/api/embed/token?tenant=__missing_slug_smoke__ -UseBasicParsing -SkipHttpErrorCheck
Invoke-WebRequest https://www.fauward.com/api/widget/shipments -Method POST -Body '{}' -ContentType 'application/json' -UseBasicParsing -SkipHttpErrorCheck
```

Expected:

- `ship.fauward.com/<seeded-slug>` returns 200 with the tenant form + branding.
- `ship.fauward.com/<old-renamed-slug>` returns 308 to `ship.fauward.com/<currentSlug>`.
- `ship.fauward.com/__missing__` and `ship.fauward.com/` return 404.
- `www.fauward.com/ship/<slug>` returns 301 to `https://ship.fauward.com/<slug>`.
- Token route returns 401 without an API key (route alive, auth still gates).
- Shipment route returns 401 without a widget token (route alive, auth still gates).

See also [Environment](widget-environment.md), [Routing and Middleware](widget-routing-and-middleware.md), and [Known Gaps](widget-known-gaps.md).
