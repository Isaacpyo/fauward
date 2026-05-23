# Widget Environment

This page mirrors `apps/widget/.env.local.example` and lists only variables the widget app actually uses.

## Supabase

`SUPABASE_URL`

- Used by `@fauward/tenant-db` Supabase client factories.
- Required for tenant lookup, API-key validation, tenant-domain DB reads/writes, and shipment writes.

`SUPABASE_ANON_KEY`

- Used by the public Supabase client factory in `@fauward/tenant-db`.

`SUPABASE_SERVICE_ROLE_KEY`

- Used by server-only admin clients in `@fauward/tenant-db`.
- Required for tenant lookup, custom-domain admin, and tenant-schema shipment writes.
- Never expose to browser code.

## Widget Tokens

`WIDGET_TOKEN_SECRET`

- Used by `lib/widgetToken.ts` to sign and verify widget JWTs.
- Must be at least 32 characters.
- Reuse the canonical production value. Do not regenerate casually because mint and verify both live in `apps/widget` and existing cached tokens would break.

## Vercel and Edge Config

`VERCEL_TOKEN`

- Used by `lib/vercelDomains.ts` and `lib/edgeConfigAdmin.ts`.
- Required only for `app/api/admin/domains`.
- Now set in the `fauward-widget` Production environment.

`VERCEL_PROJECT_ID`

- Live value: `prj_8qd6w9Xq2rYdlxzEmLfiWRvxPWQQ`.
- Used by `lib/vercelDomains.ts`.

`EDGE_CONFIG_ID`

- Live value: `ecfg_jplkxxptuk37wukitnzapyzyfwdr`.
- Used by `lib/edgeConfigAdmin.ts`.

`EDGE_CONFIG`

- Edge Config read connection string.
- Used implicitly by `@vercel/edge-config` in `resolveTenantByHost()`.
- Set in Production with a read token.

## Twilio

`TWILIO_ACCOUNT_SID`

- Used by `/api/widget/phone/send`.

`TWILIO_AUTH_TOKEN`

- Used by `/api/widget/phone/send`.

`TWILIO_FROM_NUMBER`

- Used as the sender number by `/api/widget/phone/send`.

`TWILIO_FROM` is removed/dead config. The code reads `TWILIO_FROM_NUMBER`.

## Stripe

`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

- Used by `CreateShipmentForm` to initialize Stripe.js on the client.

`STRIPE_SECRET_KEY` is intentionally absent. Add it only when a server-side payment-intent route exists.

## Firebase Public Client Config

These are public browser config values imported by `lib/firebaseConfig.ts` and `lib/firebaseClient.ts`:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`

The first six have local demo fallbacks through `lib/firebaseEnv.ts`; production should still set the real values. `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` is optional from the Firebase client perspective but is present in the production env set.

## Explicitly Unset

`VERCEL_TEAM_ID`

- Unset. The deployment uses the personal Hobby account `isaacpyo04`, not a team.

See also [Deployment](deployment.md) and [Known Gaps](known-gaps.md).
