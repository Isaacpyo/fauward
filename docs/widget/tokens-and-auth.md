# Tokens and Auth

Widget tokens are short-lived JWTs used by the shipment form to call widget APIs.

## Widget Token Contract

`apps/widget/lib/widgetToken.ts` provides:

- `signWidgetToken(payload)`
- `verifyWidgetToken(token)`

The token uses:

- Algorithm: HS256
- Issuer: `fauward-widget`
- Expiry: 15 minutes
- Secret: `WIDGET_TOKEN_SECRET`, minimum 32 characters
- Payload: `{ tenantId, tenantSlug, allowedOrigin }`

Mint and verify both live in `apps/widget`, so there is one app and one signing secret. Rotating `WIDGET_TOKEN_SECRET` invalidates existing cached tokens and must be treated as a breaking operational change.

## Embed Token Exchange

`GET /api/embed/token?tenant=<slug>` exchanges a tenant API key for a widget token.

Required header:

```http
Authorization: Bearer fw_<api-key>
```

The route runs in the Node runtime and performs these checks:

1. Extract the bearer key.
2. `validateApiKey(rawKey)` through `@fauward/tenant-db`.
3. Require the `tenant` query parameter.
4. Load the tenant by slug.
5. Require the tenant ID to match the API-key tenant.
6. Sign a widget token with `allowedOrigin` from the request `Origin` header, or `*` when no origin is present.

Missing or invalid API keys return 401. Tenant mismatch returns 403. Missing tenant param returns 400.

## Hosted and White-Label Minting

`/ship/<slug>` mints the widget token server-side after tenant resolution. Hosted and white-label pages set:

```ts
allowedOrigin: "*"
```

That allows the rendered form to call `/api/widget/*` from the serving host. For tenant-owned custom hosts, middleware has already resolved the host and rewritten the request before the server component mints the token.

## Widget API Verification

`/api/widget/shipments`, `/api/widget/phone/send`, and `/api/widget/phone/verify` expect:

```http
Authorization: Bearer <widget-jwt>
```

Routes call `verifyWidgetToken()`. If verification fails or the token is expired, the route returns 401. Shipment creation also checks the request `Origin` against `allowedOrigin` when the token is not wildcarded.

## Admin Domains Auth

`app/api/admin/domains` is tenant-admin functionality. `lib/adminAuth.ts` accepts a bearer tenant API key, validates it with `validateApiKey()`, checks scopes, loads the tenant, and returns `{ id, slug }`.

Required scopes:

- `domains:read` for `GET`
- `domains:write` for `POST` and `DELETE`
- `*` also satisfies both checks

The admin route also requires `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, and `EDGE_CONFIG_ID` in the widget production environment to manage Vercel project domains and update Edge Config.

See also [Custom Domains](custom-domains.md) and [Environment](environment.md).
