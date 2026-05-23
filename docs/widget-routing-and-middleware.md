# Routing and Middleware

Widget routing is split between the marketing apex project and the widget project.

## Widget Project Middleware

`apps/widget/middleware.ts` handles non-API page requests in the widget project.

1. Platform hosts return `NextResponse.next()`.
   - This includes the widget Vercel host and local development hosts.
   - Platform hosts are allowed to serve `/`, `/ship/<slug>`, and other app routes normally.
2. Portal-owned Fauward hosts return `404`.
   - `app.fauward.com` and `*.fauward.com` are tenant portal surfaces.
   - They must never be served by the widget project.
3. Custom hosts are resolved through Edge Config.
   - `resolveTenantByHost()` normalizes the host and reads `domains` from Edge Config.
   - A mapped host rewrites to `/ship/<tenantSlug>`.
   - An unknown host returns `404`.

The middleware matcher excludes `api`, `_next`, and static asset paths. API routes are handled directly by Next route handlers.

## Hosted Slugs

`app/ship/[tenant]/page.tsx` is the canonical hosted shipment page. It calls `getTenantBySlugOrHistory()` from `@fauward/tenant-db`.

- Current slug found: render the hosted shipment form.
- Missing slug: `notFound()`, returning 404.
- Old unexpired slug found in `tenant_slug_history`: `permanentRedirect()` to `/ship/<currentSlug>`, which produces a permanent 308 redirect.

The 308 behavior is covered in tests, but it has not yet been verified end-to-end against production data because no seeded tenant slug/history rows were available during Phase 2 smoke testing.

## Apex Option A Rewrites

`apps/frontend/next.config.mjs` implements Option A by rewriting three path groups from the marketing apex to the widget production URL, `https://fauward-widget.vercel.app`:

- `/ship/:path*` -> hosted and white-label shipment pages served through the apex.
- `/api/embed/token` -> widget token minting for the embed SDK.
- `/api/widget/:path*` -> widget token verification, phone OTP endpoints, and shipment creation.

All three rewrites are required. The embed SDK defaults to `https://fauward.com/api/embed/token`, so existing deployed embeds need the apex token route to keep working. The form posts widget API calls relative to the serving origin, so `/api/widget/:path*` must also reach the widget project. Omitting `/ship/:path*` would break hosted shipment pages from the apex.

`fauward.com` currently redirects to `www.fauward.com` with 307, then the rewrites apply on the canonical host.

See also [Architecture](widget-architecture.md), [Tokens and Auth](widget-tokens-and-auth.md), and [Deployment](widget-deployment.md).
