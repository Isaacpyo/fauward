# Widget Deployment

The widget app is deployed as a standalone Vercel project from the existing `apps/widget` workspace app.

## Live Project Facts

- Account: personal Hobby account `isaacpyo04`
- Team: none
- `VERCEL_TEAM_ID`: unset
- Project name: `fauward-widget`
- `VERCEL_PROJECT_ID`: `prj_8qd6w9Xq2rYdlxzEmLfiWRvxPWQQ`
- Production URL: `https://fauward-widget.vercel.app`
- Root Directory: `apps/widget`
- Framework: Next.js
- Node.js: 20.x
- Source outside root directory: enabled for workspace packages such as `@fauward/tenant-db`

## Edge Config

- `EDGE_CONFIG_ID`: `ecfg_jplkxxptuk37wukitnzapyzyfwdr`
- `EDGE_CONFIG`: set in Production with a read token
- Initial item: `domains = {}`

The `domains` item is the edge-read host-to-tenant map used by middleware. It is updated by `app/api/admin/domains` after Vercel verifies a tenant custom domain.

## Apex Routing

Step 5 Option A is live through PR #13. The marketing project in `apps/frontend` rewrites these paths to `https://fauward-widget.vercel.app`:

- `/ship/:path*`
- `/api/embed/token`
- `/api/widget/:path*`

This keeps already-deployed embeds working because the embed SDK defaults to the Fauward apex token route.

`fauward.com` currently redirects to `www.fauward.com` with 307, then the rewrites apply. `app.fauward.com` and `*.fauward.com` remain portal-owned and must not be pointed at the widget project.

## Redeploy

From a clean checkout with the Vercel project linked:

```powershell
npx vercel@latest whoami
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

## Production Smoke Checks

Use unauthenticated checks first so no secrets are printed:

```powershell
Invoke-WebRequest https://fauward-widget.vercel.app/ -UseBasicParsing
Invoke-WebRequest https://fauward-widget.vercel.app/ship/__missing_slug_smoke__ -UseBasicParsing
Invoke-WebRequest https://www.fauward.com/api/embed/token?tenant=__missing_slug_smoke__ -UseBasicParsing
Invoke-WebRequest https://www.fauward.com/api/widget/shipments -Method POST -Body '{}' -ContentType 'application/json' -UseBasicParsing
```

Expected:

- `/` returns 200.
- Missing slug returns 404.
- Token route reaches the widget and returns 401 without an API key.
- Shipment route reaches the widget and returns 401 without a widget token.

See also [Environment](environment.md), [Routing and Middleware](routing-and-middleware.md), and [Known Gaps](known-gaps.md).
