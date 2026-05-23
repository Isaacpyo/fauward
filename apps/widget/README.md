# Fauward Widget App

This standalone Next.js app serves the existing iframe shipment widget and the hosted shipment pages.

## Hosted and White-Label Deployment

Manual prerequisites after merge:

1. Create a Vercel project for `apps/widget`.
2. Create and link a Vercel Edge Config store to that widget project.
3. Set widget project environment variables:
   - `VERCEL_TOKEN`
   - `VERCEL_PROJECT_ID`
   - `EDGE_CONFIG_ID`
   - `EDGE_CONFIG`
   - `WIDGET_TOKEN_SECRET`
   - existing Supabase, Twilio, and Stripe values from `.env.local.example`
4. Add a marketing-project rewrite from `fauward.com/ship/:path*` to the deployed widget production URL.

White-label widget domains are tenant-owned hosts such as `ship.acme.com`. They attach only to the widget Vercel project and are stored canonically in `tenant_widget_domains`; Edge Config mirrors the host-to-current-slug map for middleware reads.

`app.fauward.com` and `*.fauward.com` are portal-owned and must not point at this app.
