# Widget Architecture

`apps/widget` is a standalone Next.js app that serves the Fauward shipment widget in three delivery tiers. All tiers share one implementation of the shipment wizard: `apps/widget/components/shipments/CreateShipmentForm.tsx`.

## Delivery Tiers

1. Embedded widget: `/` renders the form for iframe or SDK-driven use. It reads `tenant` and `token` from query params and passes them into `CreateShipmentForm` with `embedded={true}`.
2. Hosted Fauward page: `/ship/<slug>` resolves the tenant by current slug or slug history, signs a short-lived widget token server-side, applies tenant branding, and renders the same form with `embedded={false}`.
3. White-label host: `ship.acme.com` or another tenant-owned host is resolved by Edge middleware through Edge Config and rewritten to `/ship/<slug>`, where the hosted page path above takes over.

The user experience is intentionally one form surface. Embedded, hosted, and white-label flows differ only in how tenant context, token context, host routing, and branding are established before the form renders.

## Runtime Split

The middleware path is Edge-only. `apps/widget/middleware.ts` runs before non-API page requests and must stay compatible with the Edge runtime. It imports only host helpers and `resolveTenantByHost`, which reads `@vercel/edge-config`. It must not import Prisma, Supabase clients, `@fauward/tenant-db`, or any Node-only library.

Node runtime logic lives behind route handlers and server components:

- `app/ship/[tenant]/page.tsx` resolves tenants through `@fauward/tenant-db`, signs widget tokens, and renders hosted shipment pages.
- `app/api/embed/token/route.ts` exchanges tenant API keys for widget tokens.
- `app/api/widget/*` verifies widget tokens and handles widget API behavior.
- `app/api/admin/domains/route.ts` owns custom-domain administration.
- `lib/vercelDomains.ts` calls the Vercel project-domain API.
- `lib/edgeConfigAdmin.ts` updates the Edge Config `domains` item.
- `lib/widgetDomainsDb.ts` reads and writes the canonical `tenant_widget_domains` table.
- `lib/adminAuth.ts` validates tenant API keys and scopes for domain administration.

## Data Stores

Supabase is accessed through `@fauward/tenant-db` from Node paths only. Tenant lookup uses the canonical `tenants` table plus `tenant_slug_history` for old slug redirects. Custom widget domains are stored canonically in `tenant_widget_domains`.

Edge Config stores a read-optimized host-to-slug map under the single key `domains`. Middleware reads this map at the edge. The map is derived data and is updated only by `app/api/admin/domains`; it should not be hand-edited.

See also [Routing and Middleware](widget-routing-and-middleware.md), [Custom Domains](widget-custom-domains.md), and [Tokens and Auth](widget-tokens-and-auth.md).
