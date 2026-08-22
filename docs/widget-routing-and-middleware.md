# Routing and Middleware

Widget routing is split between the canonical `ship.` subdomain, the marketing apex, and the widget project itself.

## Canonical hosted URL

`https://ship.fauward.com/<slug>` is the **only** advertised hosted shipment URL. The host is a CNAME on the `fauward-widget` Vercel project. The tenant slug lives in the path — `ship.fauward.com` is treated as a platform host, not a tenant host. It does not go through `resolveTenantByHost`.

The legacy `https://fauward.com/ship/<slug>` URL is permanently retired and now returns **301** to `https://ship.fauward.com/<slug>` (see Apex Redirects below).

## Widget Project Middleware

`apps/widget/middleware.ts` handles non-API page requests in the widget project.

1. **`ship.fauward.com` (PATH-based slug)** runs first.
   - Root `/` returns 404.
   - `/<slug>` (and any deeper path) is rewritten internally to `/ship/<slug>`, which is served by `app/ship/[tenant]/page.tsx`.
   - Edge Config is not consulted — slug comes from the path.
2. **Platform hosts** return `NextResponse.next()`.
   - `fauward.com`, `www.fauward.com`, localhost, and `*.vercel.app` (including widget preview deployments).
3. **Portal-owned Fauward hosts** return `404`.
   - `app.fauward.com` and any other `*.fauward.com` (e.g. `acme.fauward.com`).
   - These belong to the tenant portal and must never be served by the widget project.
   - `ship.fauward.com` is handled by step 1 before this rule, so it is not 404'd.
4. **Tenant-owned custom domains (dormant)** resolve through Edge Config.
   - `resolveTenantByHost()` normalizes the host and reads `domains` from Edge Config.
   - A mapped host rewrites to `/ship/<tenantSlug><path>`.
   - An unknown host returns `404`.
   - Code is parked, not advertised — kept functional for future white-label use.

The matcher excludes `api`, `_next`, and static asset paths. API routes are handled directly by Next route handlers.

## Hosted Slugs

`app/ship/[tenant]/page.tsx` is the canonical hosted shipment page. It calls `getTenantBySlugOrHistory()` from `@fauward/tenant-db`.

- Current slug found: render the hosted shipment form.
- Missing slug: `notFound()`, returning 404.
- Old unexpired slug found in `tenant_slug_history`: `permanentRedirect()` to the current slug, returning a 308.
  - Under `ship.fauward.com` the target is bare `/<currentSlug>` (so the browser hits `ship.fauward.com/<currentSlug>` and the middleware rewrites it back to `/ship/<currentSlug>`). Redirecting to `/ship/<currentSlug>` here would double-prefix to `/ship/ship/<currentSlug>` and 404.
  - On other hosts (preview deployments and dormant custom-domain rewrites) the target stays `/ship/<currentSlug>`.

## Apex Redirects

`apps/frontend/next.config.mjs` permanently redirects the legacy `/ship` paths off the apex:

- `/ship` → `https://ship.fauward.com/` (301)
- `/ship/:path*` → `https://ship.fauward.com/:path*` (301)

The widget API rewrites are unchanged:

- `/api/embed/token` → `https://fauward-widget.vercel.app/api/embed/token` (dormant embed token minting)
- `/api/widget/:path*` → `https://fauward-widget.vercel.app/api/widget/:path*` (live — used by the hosted form)

The embed SDK still defaults to `https://fauward.com/api/embed/token`, so the apex token rewrite must stay to keep already-deployed embeds working.

`fauward.com` currently redirects to `www.fauward.com` with 307; the `/ship*` 301s apply on the canonical host.

## Parked / dormant tiers

These code paths are kept functional but are no longer advertised:

- **Iframe embed**: `app/page.tsx`, `packages/widget-sdk`, `app/api/embed/token`.
- **White-label custom domains**: `resolveTenantByHost`, `lib/vercelDomains`, `lib/edgeConfigAdmin`, `app/api/admin/domains`, the `tenant_widget_domains` table, and the Edge Config `domains` item.

Do not delete them. Re-advertising would require restoring marketing copy + signup-flow plumbing, not adding code.

See also [Architecture](widget-architecture.md), [Tokens and Auth](widget-tokens-and-auth.md), and [Deployment](widget-deployment.md).
