# Known Gaps

These are the current widget gaps after Phase 2 and the Option A apex rewrites.

## Payment Intent Route Missing

`CreateShipmentForm` calls:

```text
/api/create-payment-intent
```

`apps/widget` does not currently define that route. `STRIPE_SECRET_KEY` is intentionally absent until a server-side payment-intent route exists.

## Bulk Payment Success Page Missing

Bulk payment paths route to:

```text
/payment/bulk-success
```

`apps/widget` does not currently define that page. Bulk checkout success navigation will not complete cleanly until the page exists or the form is updated to use an existing route.

## OTP Path Mismatch

The form currently posts phone OTP requests to:

```text
/api/business/phone/send
/api/business/phone/verify
```

The widget app exposes:

```text
/api/widget/phone/send
/api/widget/phone/verify
```

Phone-gated checkout breaks until the form paths or route aliases are fixed.

## Slug-History 308 Not Production-Verified

The server component implements permanent redirects for unexpired old slugs through `tenant_slug_history`, and tests cover the behavior. During Phase 2 deployment, Supabase had no seeded tenant slug/history rows, so a real `/ship/<old-slug>` -> `/ship/<current-slug>` 308 could not be verified end-to-end.

Re-test after production has a real tenant and an old slug history row.

## Hook Dependency Lint Warning

The production widget build currently completes with a non-blocking React hook lint warning in `CreateShipmentForm`: a `useMemo` depends on `calcEstimate` but does not list it in the dependency array.

This did not block the Phase 2 production deploy, but it should be cleaned up before the form receives more payment or checkout changes.

See also [Environment](environment.md), [Deployment](deployment.md), and [Routing and Middleware](routing-and-middleware.md).
