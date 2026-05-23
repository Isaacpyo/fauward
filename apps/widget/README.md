# Fauward Widget App

This standalone Next.js app serves the existing iframe shipment widget and the hosted shipment pages.

## Hosted and White-Label Deployment

Manual prerequisites after merge:

1. DONE: Create and link the Vercel project `fauward-widget` for `apps/widget`.
2. DONE: Create and link the Vercel Edge Config store to that widget project.
3. DONE: Set widget project production environment variables:
   - `VERCEL_TOKEN`
   - `VERCEL_PROJECT_ID`
   - `EDGE_CONFIG_ID`
   - `EDGE_CONFIG`
   - `WIDGET_TOKEN_SECRET`
   - Supabase, Twilio, Stripe public key, and Firebase public values from `.env.local.example`
   - Do not set `VERCEL_TEAM_ID` for the personal Hobby deployment.
4. DONE: Implement Step 5 Option A in the marketing project. `fauward.com` rewrites these paths to `https://fauward-widget.vercel.app`:
   - `/ship/:path*`
   - `/api/embed/token`
   - `/api/widget/:path*`
5. PENDING: Add tenant-owned custom domains through the admin/domains route.

`TWILIO_FROM` is legacy local config and should be removed; code reads `TWILIO_FROM_NUMBER`.
`STRIPE_SECRET_KEY` is intentionally absent from widget env until a server-side `/api/create-payment-intent` route exists.

White-label widget domains are tenant-owned hosts such as `ship.acme.com`. They attach only to the widget Vercel project and are stored canonically in `tenant_widget_domains`; Edge Config mirrors the host-to-current-slug map for middleware reads.

`app.fauward.com` and `*.fauward.com` are portal-owned and must not point at this app.
