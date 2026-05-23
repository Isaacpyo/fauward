# Widget Documentation

The widget docs describe the deployed `apps/widget` Next.js app, its shared shipment form, hosted routes, white-label domain flow, and known gaps.

- [Architecture](widget-architecture.md) - delivery tiers, shared form ownership, and Edge versus Node responsibilities.
- [Routing and Middleware](widget-routing-and-middleware.md) - platform host handling, custom-host rewrites, slug redirects, and apex rewrites.
- [Tokens and Auth](widget-tokens-and-auth.md) - widget JWT mint/verify behavior, API-key exchange, and admin domain auth.
- [Branding](widget-branding.md) - tenant branding normalization and CSS variable injection.
- [Custom Domains](widget-custom-domains.md) - canonical DB records, Edge Config cache writes, and Vercel project domain management.
- [Environment](widget-environment.md) - production and local environment variables used by the widget.
- [Deployment](widget-deployment.md) - live Vercel project facts, Edge Config facts, and redeploy steps.
- [Known Gaps](widget-known-gaps.md) - remaining widget issues and verification gaps.
