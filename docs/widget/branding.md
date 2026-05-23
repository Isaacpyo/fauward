# Branding

Hosted and white-label shipment pages apply tenant branding before rendering the shared `CreateShipmentForm`.

## Normalized Branding Shape

Tenant lookup returns a normalized `branding` object:

```ts
{
  primary: string;
  accent: string;
  radius: string;
  logoUrl: string | null;
}
```

The tenant object also exposes `displayName`, which is currently normalized from the tenant name.

## CSS Variables

`app/ship/[tenant]/page.tsx` maps normalized branding to CSS variables on the page wrapper:

- `--brand-primary`
- `--brand-accent`
- `--brand-radius`

Fallbacks are null-safe:

- Primary: `#0D1F3C`
- Accent: `#D97706`
- Radius: `8px`

The radius default is `"8px"` and should stay aligned with `packages/tenant-db/src/queries/tenants.ts`.

## Logo Rendering

If `branding.logoUrl` is present, the hosted page renders the tenant logo in the page header. External logo domains are not known at build time, so the page uses a plain `img` element rather than Next `Image`.

If `logoUrl` is null, the logo area is omitted and the page still renders safely with the tenant `displayName`.

See also [Architecture](architecture.md) and [Routing and Middleware](routing-and-middleware.md).
