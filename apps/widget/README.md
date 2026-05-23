# Fauward Widget App

`apps/widget` is the standalone Next.js app for Fauward shipment creation surfaces: the embeddable iframe widget, hosted pages at `fauward.com/ship/<slug>`, and tenant-owned white-label hosts such as `ship.acme.com`.

Production URL: https://fauward-widget.vercel.app

## Documentation

- [Widget docs index](../../docs/widget.md) - table of contents for the full widget docs set.
- [Architecture](../../docs/widget-architecture.md) - delivery tiers, shared form ownership, and runtime split.
- [Routing and middleware](../../docs/widget-routing-and-middleware.md) - host handling, Edge Config rewrites, slug redirects, and apex rewrites.
- [Tokens and auth](../../docs/widget-tokens-and-auth.md) - widget JWTs, embed token exchange, and admin domain auth.
- [Branding](../../docs/widget-branding.md) - tenant branding shape and CSS variables.
- [Custom domains](../../docs/widget-custom-domains.md) - DB ownership, Edge Config cache writes, and Vercel domain management.
- [Environment](../../docs/widget-environment.md) - env vars used by the widget.
- [Deployment](../../docs/widget-deployment.md) - live Vercel project facts and redeploy steps.
- [Known gaps](../../docs/widget-known-gaps.md) - remaining widget issues and verification gaps.

## Quick Start

Run from the repository root:

```powershell
npm install
npm run dev --workspace=apps/widget
npm run build --workspace=apps/widget
npm run test --workspace=apps/widget
```

Use `apps/widget/.env.local.example` as the local env template. Do not commit `.env.local` or secret values.
