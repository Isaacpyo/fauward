# Fauward Form Global Rebuild Changelog

## 1. Changed / Created Files

### Phase 0 - Region & Locale Foundation

- `packages/tenant-db/src/queries/tenants.ts` - extends tenant lookup to include live `Tenant.region`, `defaultCurrency`, `defaultLanguage`, `isRtl`, `smsEnabled`, and `TenantSettings` payment/tax/pricing JSON.
- `packages/tenant-db/src/queries/tenants.test.ts` - updates tenant-db mocks for `tenant_settings`.
- `apps/widget/lib/shipmentTenantConfig.ts` - adds typed `TenantConfig`, live tenant/settings normalization, region fallback profiles, corridors, tax, language/RTL, payment, categories, and pricing defaults.
- `apps/widget/lib/shipmentAddress.ts` - adds country-specific address field schemas and required field rules.
- `apps/widget/lib/shipmentMessages.ts` - adds message catalogs and translator helper for English, French, and Arabic/RTL.
- `apps/widget/lib/shipmentPricing.ts` - adds shared currency-aware quote math and minor-unit conversion.
- `apps/widget/lib/shipmentValidation.ts` - adds shared region-aware validation, `libphonenumber-js` validation, structured address payloads, and widget payload builder.
- `apps/widget/app/api/widget/config/route.ts` - adds widget-JWT-authed config endpoint for embed tier.
- `apps/widget/app/ship/[tenant]/page.tsx` - resolves tenant config server-side and passes it into the shared form.
- `apps/widget/components/shipments/CreateShipmentForm.tsx` - rebuilds the form around tenant config, corridor selection, i18n/RTL, address schemas, customs, tax, phone, shared submit helper, and success state.

### Phase A - Contract Fixes

- `apps/widget/app/api/create-payment-intent/route.ts` - adds widget-JWT-authed Stripe payment intent route with tenant-currency and server-side amount validation.
- `apps/widget/app/payment/success/page.tsx` - adds single-payment return status page.
- `apps/widget/app/payment/bulk-success/page.tsx` - adds bulk-payment return status page.
- `apps/widget/app/api/shipments/generate-qr/route.ts` - adds widget-JWT-authed QR payload endpoint.
- `apps/widget/app/api/widget/shipments/route.ts` - adds region validation, server-side pricing check, currency enforcement, structured address preservation, phone normalization, and idempotency cache.

### Phase B - Robustness & Correctness

- `apps/widget/app/globals.css` - moves form controls/buttons to `--brand-*` CSS vars with red only as fallback.
- `apps/widget/components/payments/BulkPaymentForm.tsx` - removes hardcoded GBP display, accepts `currency`/`locale`, removes dev console logging, and uses brand vars.
- `packages/tenant-db/src/queries/shipments.ts` - widens tenant-schema `direction` typing from the old two-value corridor to string.
- `apps/widget/app/page.tsx` - removes widget console logging while preserving the `?tenant=&token=` embed contract.
- `apps/widget/package.json` and `package-lock.json` - add explicit widget dependencies: `libphonenumber-js`, `zod`, and `stripe`.
- `apps/widget/__tests__/shipPage.test.tsx` - asserts hosted page now passes `tenantConfig`.

## 2. Region-Driven Behaviors Added

| Area | Before | After |
|---|---|---|
| Config injection | Form owned hardcoded UK/Africa assumptions. | Hosted/white-label pages build `TenantConfig` server-side; embed tier fetches `/api/widget/config` with the existing widget token. |
| Corridors | Fixed `SHIP_TO_AFRICA` / `SHIP_TO_UK` primary choice. | User selects origin -> destination from config-derived corridors; legacy `direction` and `route` are derived from the corridor. |
| i18n / RTL | English strings inline, LTR only. | Message catalog drives UI strings; language switcher appears for multi-language regions; Arabic config sets `dir="rtl"`. |
| Currency | GBP symbol and pence assumptions. | All display uses `Intl.NumberFormat(locale, { currency })`; payment-intent route validates tenant currency. |
| Address forms | UK-style address fields for every country. | Country schemas drive shown/required address fields; `state`, `address2`, and `contentDescription` persist in JSON address payloads. |
| Phone / OTP | Naive digit count and `/api/business/*`. | `libphonenumber-js` validates/normalizes per country; OTP uses `/api/widget/phone/*` with widget bearer token. |
| Customs | No customs capture. | Cross-border corridors show a customs step mapped to the real `CustomsDeclaration` shape: `type`, `items`, `totalValue`, `currency`, documents placeholder. Domestic corridors hide it. |
| Tax / VAT | No explicit tax line. | Region/tenant `taxRule` shows label, rate, amount, and total; omitted when disabled. |
| Restricted goods | Category list was static. | Category rules come from config; blocked categories cannot proceed and restricted categories show review messages. |

## 3. Phase A Contract Fixes

| Fix | Before | After |
|---|---|---|
| OTP | Form called missing `/api/business/phone/send` and `/api/business/phone/verify`. | Form calls `/api/widget/phone/send` and `/api/widget/phone/verify` with `Authorization: Bearer <widgetToken>` and `{ phone }` / `{ phone, code }`; accepts `verified === true`. |
| Payment intent | `/api/create-payment-intent` did not exist; client sent GBP amount. | Route exists, verifies widget JWT, rebuilds server quote from shipment drafts, rejects mismatched amounts/currency, and creates Stripe intents for Stripe tenants. |
| Return pages | `/payment/success` and `/payment/bulk-success` were missing. | Both pages render confirmed / processing / failed states from redirect params. |
| Tracking ref | Client generated a local ref and ignored DB output. | Submit helper uses API `trackingRef` / `shipmentId` for success UI, callbacks, QR, and `SHIPMENT_CREATED`. |
| QR endpoint | Fetch always failed silently. | `/api/shipments/generate-qr` exists and is widget-JWT authed. |
| Success view | No in-form success state. | Localized success screen shows DB tracking ref, copy action, and create-another flow; suppressible via `suppressSuccessView`. |

## 4. Verification Matrix

Commands run:

- `npm run typecheck --workspace=apps/widget`
- `npm run test --workspace=apps/widget`
- `npm run build --workspace=apps/widget`
- `npm run typecheck --workspace=packages/tenant-db`
- `npm run test --workspace=packages/tenant-db`
- `tsx` smoke matrix over UK domestic, Nigeria cross-border, UAE Arabic/RTL configs.

| Tier / Region | Currency + tax | Address + phone | Customs | OTP | Payment intent | Success / tracking | Branding + RTL |
|---|---|---|---|---|---|---|---|
| Embed iframe | Config endpoint keeps `?tenant=&token=` contract; smoke verifies GBP/NGN/AED totals. | Shared validation passes country-specific addresses and E.164 phones. | Domestic false, cross-border true from corridor. | Widget routes used with bearer token. | Route returns tenant-currency `clientSecret` for Stripe; non-Stripe is flagged. | Uses DB `trackingRef` in callbacks/postMessage. | Fetches config then applies `dir`; brand vars fall back safely. |
| Hosted `/ship/[tenant]` | Server injects `TenantConfig` from tenant/settings. | Same shared form and schema. | Same corridor behavior. | Same widget token minted server-side. | Same route. | Same success UI. | Hosted page sets `--brand-*`; form consumes them. |
| White-label rewrite | Reuses hosted page after middleware rewrite. | Same shared form and schema. | Same corridor behavior. | Same minted widget token. | Same route. | Same success UI. | Same hosted brand and RTL behavior. |
| UK domestic | `GBP`, VAT 20%, total minor `4200`. | GB postcode required; GB phones valid. | Hidden (`customsRequired:false`). | SMS widget route. | Stripe supported. | DB ref path used. | LTR. |
| Nigeria cross-border | `NGN`, VAT 7.5%, total minor `1343750`. | NG state required; NG phone valid. | Shown (`customsRequired:true`). | SMS-first. | PAYSTACK flagged as Phase C unsupported. | DB ref path used after create. | LTR. |
| UAE Arabic / RTL | `AED`, VAT 5%, total minor `13125`. | AE emirate required; UAE phone valid. | Shown (`customsRequired:true`). | SMS-first. | Stripe supported when configured. | DB ref path used after create. | `dir:"rtl"` verified by config smoke. |

## 5. Phase C Report Only

### C1 Multi-gateway payments

- Option A: one `PaymentProvider` interface with `createIntent`, `confirmInstructions`, `returnStatus`, and UI metadata for Stripe, Paystack, Flutterwave, M-Pesa STK, Peach, Razorpay, Checkout.com.
- Option B: provider-specific routes and provider-specific React payment steps.
- Recommendation: Option A. Keep `/api/create-payment-intent` as an orchestrator but rename internally to a gateway-neutral payment session once non-Stripe providers are implemented.

### C2 Region-aware pricing

- Option A: keep config fallback rates in the widget.
- Option B: call a widget-safe quote API backed by `RateCard`, `RateQuote`, and `ServiceZone`.
- Recommendation: Option B. This rebuild centralizes fallback math only so Phase A can server-validate amounts; production pricing should come from canonical quote/rate tables.

### C3 Auth split

- Option A: keep Firebase for widget submit identity and widget JWT for API access.
- Option B: use widget JWT for widget API access, and create an optional customer identity/session model behind it.
- Recommendation: Option B. The widget submit path now only falls back to Firestore when `widgetToken` is absent; Firebase should not gate production widget creation.

### C4 Canonical vs tenant-schema divergence

- Option A: tenant-schema `shipments` remains widget source of truth and canonical Prisma syncs asynchronously.
- Option B: widget writes canonical Prisma `Shipment`, `ShipmentItem`, and `CustomsDeclaration`, then projects to tenant schema.
- Recommendation: Option B for long-term correctness. Package/customs data belongs in `ShipmentItem`/`CustomsDeclaration`; tenant-schema rows should become a projection or legacy read model.

### C5 E-invoicing, tax engine, and data residency

- Option A: form captures only minimal tax/customs metadata.
- Option B: form captures jurisdiction-specific invoice/customs fields selected by a compliance engine.
- Recommendation: Option B in a later compliance phase. The form now captures data needed downstream, but FIRS, ZATCA, eTIMS, PEPPOL, and residency rules need dedicated services and retention policies.

## 6. Assumed / Stubbed Items

- `RegionalProfile` is not present in the live Prisma schema. Live fields used instead: `Tenant.region/defaultCurrency/defaultLanguage/isRtl` at `apps/backend/prisma/schema.prisma:331-338` and `TenantSettings` at `apps/backend/prisma/schema.prisma:587`. Code fallback profiles start at `apps/widget/lib/shipmentTenantConfig.ts:140`.
- Payment gateways other than Stripe are detected and surfaced, but not implemented. The Phase A guard is at `apps/widget/app/api/create-payment-intent/route.ts:60`.
- Customs capture maps to the real `CustomsDeclaration` fields (`apps/backend/prisma/schema.prisma:1607`) but persists through tenant-schema `notes` because the widget write path does not create canonical Prisma rows. Mapping and note persistence are at `apps/widget/lib/shipmentValidation.ts:284` and `apps/widget/lib/shipmentValidation.ts:303-337`.
- `/api/shipments/generate-qr` returns an authenticated QR payload and SVG placeholder, not a production QR symbol library output. Placeholder generation is at `apps/widget/app/api/shipments/generate-qr/route.ts:35-46`.
- Region fallback rate cards are config defaults, not canonical `RateCard`/`RateQuote` pricing. Shared fallback quote math is in `apps/widget/lib/shipmentPricing.ts`.

---

# Paystack + Structured Customs Follow-up

## 1. Files Changed / Created

### Part 1 - Payment Provider Abstraction

- `apps/widget/lib/payments/providers.ts` - adds gateway-neutral `PaymentProvider`, normalized Stripe/Paystack session shapes, Stripe wrapper, Paystack initialize/verify calls, and provider factory.
- `apps/widget/app/api/payment/session/route.ts` - adds widget-JWT-authed gateway-neutral payment session route with server-side quote validation.
- `apps/widget/app/api/create-payment-intent/route.ts` - keeps the legacy route as a thin alias to `/api/payment/session`.
- `apps/widget/app/api/payment/confirm/route.ts` - verifies Paystack references, rejects amount/currency mismatches, and creates pending shipments after confirmed payment.
- `apps/widget/app/api/payment/paystack/webhook/route.ts` - verifies `x-paystack-signature` against the raw body and processes `charge.success`.
- `apps/widget/lib/payments/pendingPayments.ts` - stores pending Paystack shipment payloads durably in `public.widget_payment_sessions` and atomically claims references for webhook/redirect idempotency.
- `apps/widget/components/shipments/CreateShipmentForm.tsx` - uses normalized payment sessions, branches Stripe Elements vs Paystack Inline, and confirms Paystack before showing DB tracking refs.
- `apps/widget/components/payments/PaymentReturnConfirmation.tsx` - confirms Paystack redirect fallbacks from the success pages.
- `apps/widget/components/payments/BulkPaymentForm.tsx` - removes the unused Stripe-only `clientSecret` prop.
- `apps/widget/types/paystack-inline-js.d.ts` - provides local types for `@paystack/inline-js`.
- `apps/widget/package.json` / `package-lock.json` - adds `@paystack/inline-js`.
- `apps/widget/__tests__/paymentProviders.test.ts` - covers Paystack initialize/verify fields, amount mismatch rejection, webhook signature tamper rejection, and valid webhook replay idempotency.
- `supabase/migrations/20260525090000_add_widget_payment_sessions.sql` - adds durable public widget payment-session table for webhook/redirect state.

### Part 2 - Structured Customs Persistence

- `apps/widget/lib/shipmentValidation.ts` - stops appending customs JSON into `notes`; emits structured `customs_declaration` shaped for future `CustomsDeclaration` projection.
- `apps/widget/app/api/widget/shipments/route.ts` - validates customs only for cross-border shipments and writes `customs_declaration` to tenant schema.
- `packages/tenant-db/src/queries/shipments.ts` - adds typed `customs_declaration` to tenant shipment rows and create input.
- `supabase/migrations/20260524090000_add_tenant_shipment_customs_declaration.sql` - additive tenant-schema migration adding nullable `customs_declaration jsonb` plus a GIN index.
- `supabase/migrations/0002_tenant_schema_template.sql` - mirrors the column for newly provisioned tenants.

## 2. Payment Abstraction Before -> After

| Area | Before | After |
|---|---|---|
| Route shape | `/api/create-payment-intent` returned Stripe-shaped `{ clientSecret }` and rejected Paystack. | `/api/payment/session` returns `{ provider:"stripe", clientSecret, publishableKey, currency, amountMinor }` or `{ provider:"paystack", accessCode, reference, publicKey, authorizationUrl, currency, amountMinor }`; old route aliases it. |
| Provider selection | Form hard-blocked non-Stripe gateways. | Server selects from `tenantConfig.paymentGateway.provider`; Stripe path is unchanged, Paystack is real. |
| Paystack init | Unsupported stub. | `POST https://api.paystack.co/transaction/initialize` with bearer secret key, amount in minor units, currency, metadata, and callback URL. |
| Paystack verify | Missing. | `GET https://api.paystack.co/transaction/verify/:reference`; normalized status plus amount/currency are checked against the server quote before shipment creation. |
| Webhook | Missing. | `/api/payment/paystack/webhook` verifies HMAC-SHA512 raw-body signature and processes `charge.success` idempotently by reference using `public.widget_payment_sessions`. |
| UI | Stripe Elements only. | Stripe uses Elements; Paystack uses `@paystack/inline-js` `resumeTransaction(accessCode)` with hosted authorization URL fallback. |

Paystack API details were checked against the official Paystack transaction and InlineJS docs before coding: initialize returns `authorization_url`, `access_code`, `reference`; verify returns `status`, `amount`, `currency`; webhook signature uses `x-paystack-signature` over the raw body.

## 3. Customs Before -> After

| Area | Before | After |
|---|---|---|
| Storage | Customs JSON was appended into free-text `notes`. | Customs lives in tenant-schema `shipments.customs_declaration jsonb`; `notes` remains user notes only. |
| Migration | No structured tenant-schema customs column. | Additive nullable JSONB column with GIN index for existing tenant schemas; template updated for new tenants. |
| Shape | Captured values were unqueryable text. | JSON includes `type`, `items`, `totalValue`, `currency`, `documents`, `status`, and `holdReason`, aligned to the real Prisma `CustomsDeclaration` fields. |
| Validation | Client captured customs but persistence did not enforce structure. | Widget shipment route requires valid customs for cross-border shipments and rejects customs on domestic shipments. |

Chosen storage: `customs_declaration jsonb` on tenant `shipments`. This is the smallest backward-compatible change and keeps future canonical projection to `CustomsDeclaration` straightforward without starting C4 canonical writes.

## 4. Verification Matrix

Commands run:

- `npm run typecheck --workspace=apps/widget`
- `npm run test --workspace=apps/widget` - 7 files, 27 tests
- `npm run build --workspace=apps/widget`
- `npm run typecheck --workspace=packages/tenant-db`
- `npm run test --workspace=packages/tenant-db`

| Scenario | Result |
|---|---|
| Stripe tenant, UK domestic | Stripe provider still returns a Stripe session with `clientSecret`; Elements path and create-after-confirm flow remain unchanged. |
| Paystack tenant, Nigeria cross-border | Session route initializes Paystack with tenant currency/minor amount; UI can open inline checkout or `authorizationUrl`; confirm route verifies reference before creating shipments and returning DB tracking refs. |
| Paystack webhook full path | `charge.success` webhook signature is verified with raw body, transaction is verified with Paystack, and durable pending payloads create shipments idempotently by reference. Replay test verifies one shipment create call. |
| Customs persistence | Cross-border payloads persist `customs_declaration` structurally; domestic payloads omit it and the route rejects domestic customs data. |
| Embed tier | Payment and shipment routes still require `Authorization: Bearer <widgetToken>` from the existing `?tenant=&token=` contract. |
| Hosted tier | `/ship/[tenant]` continues to pass tenant-derived config; provider selection follows `tenantConfig.paymentGateway`. |
| Amount/currency mismatch | Covered by test: Paystack verify returning a different amount is rejected before shipment creation. |
| Webhook tamper | Covered by test: invalid `x-paystack-signature` returns 401. |

Manual human check still needed: load one Nigeria/Paystack tenant and one UK/Stripe tenant in the running dev server and confirm each reaches a real confirmation page.

## 5. New Environment Variables

- `PAYSTACK_SECRET_KEY` - read only server-side in `apps/widget/lib/payments/providers.ts:144` and webhook route `apps/widget/app/api/payment/paystack/webhook/route.ts:26`.
- `PAYSTACK_PUBLIC_KEY` - read server-side in `apps/widget/lib/payments/providers.ts:145`, returned in normalized Paystack sessions, and used as config fallback in `apps/widget/lib/shipmentTenantConfig.ts:477`.

## 6. Assumed / Stubbed

- Paystack pending shipment payloads are durable in `public.widget_payment_sessions` (`apps/widget/lib/payments/pendingPayments.ts:68`, `supabase/migrations/20260525090000_add_widget_payment_sessions.sql:5`); this is still widget-level orchestration, not canonical Prisma payment writes.
- Paystack supported-currency guard currently includes the launch currencies plus common Paystack-supported currencies at `apps/widget/lib/payments/providers.ts:139`; tenant config still chooses the tenant currency.
- Redirect fallback confirmation relies on the Paystack reference and `amountMinor`/`currency` query params (`apps/widget/components/payments/PaymentReturnConfirmation.tsx:31`) and resolves durable state from `public.widget_payment_sessions`.
- Other gateways remain report-only. The factory throws for non-Stripe/non-Paystack providers at `apps/widget/lib/payments/providers.ts:211`.
