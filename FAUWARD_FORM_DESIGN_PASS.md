# Fauward Shipment Form Design Pass

Date: 2026-05-25

## Files Touched

- `apps/widget/components/shipments/CreateShipmentForm.tsx` - presentation-only refinement of shell layout, header, cards, stepper, success/payment/customs/review states, and form controls.
- `apps/widget/components/payments/BulkPaymentForm.tsx` - presentation-only refinement of Stripe bulk payment panel, loading/error states, and primary button styling.
- `apps/widget/app/globals.css` - shared UI tokens/classes for fields, buttons, cards, semantic notices, brand focus rings, selected panels, success mark, and reduced-motion behavior.

## Design Before -> After

| Area | Before | After |
|---|---|---|
| Form shell | Dense, stretched layout with minimal rhythm. | Centered `max-w-4xl` flow with 32/40px-style vertical rhythm and calmer header alignment. |
| Cards | Mixed rounded boxes, inconsistent padding, occasional shadow. | Consistent `form-card`: white background, 1px gray-200 border, xl/tenant radius, 24-32px padding, no heavy shadow. |
| Inputs | Hard-edged fields with basic focus ring and shadow. | 44px minimum height, gray-200 border, gray-900 text, muted placeholder, tenant-radius, brand color focus border plus low-alpha focus halo. |
| Buttons | Brand red applied bluntly, varied sizes. | Tokenized primary/secondary buttons with 44px min height, tenant radius, hover/disabled/focus states. |
| Stepper | Thin text row with weak state indication. | Numbered/check stepper on desktop with connecting track; compact progress summary on mobile. Completed/current/upcoming states are visually distinct and brand-token driven. |
| Success state | Generic summary row. | Centered confirmation with semantic success mark, mono tracking ref, copy action, and create-another action. |
| Payment states | Basic panels and mixed semantic colors. | Calm payment panels, brand-safe focus frames, semantic error/info/success notices, inline spinner. |
| Customs/tax/review | Complex sections read as flat rows. | Cross-border/customs and pricing blocks use subordinate gray-50 inset panels with stronger total hierarchy. |
| Motion | Default transitions only. | Subtle 150ms-style CSS transitions; `prefers-reduced-motion` globally reduces animation/transition duration. |

## Behavior Confirmation

No behavior, validation, route, payment, customs, tenant config, payload, or submission logic was intentionally changed in this pass. Existing corridor selection, i18n/RTL, currency formatting, OTP, Paystack/Stripe branching, shipment creation, customs persistence, and bulk parsing remain as implemented before this design pass.

## Verification

- `npm run typecheck --workspace=apps/widget` - PASS
- `npm run test --workspace=apps/widget` - PASS, 7 files / 27 tests
- `npm run build --workspace=apps/widget` - PASS
- Brand scan: component files no longer contain hardcoded fallback brand red; `#d80000` / `#b80000` only remain in `apps/widget/app/globals.css` as CSS variable fallback values.
- White-label safety: buttons, focus rings, selected insurance panel, and stepper fill use `--brand-primary`; radius uses `--brand-radius`.
- Semantic status colors: success/warning/error/info states use fixed semantic CSS variables, not tenant brand colors.
- RTL safety: layout changes use centered/symmetric spacing, `text-start`, logical `ps-*`, and flex/grid structures that mirror under `dir="rtl"`.
- Reduced motion: `prefers-reduced-motion: reduce` is handled in `apps/widget/app/globals.css`.

## Follow-ups Left Alone

- Per-field `aria-invalid` and inline helper text would require field-level validation state that the form does not currently expose; left untouched to avoid behavior changes.
- Some legacy payment copy inside `BulkPaymentForm` remains hardcoded English because changing it properly means threading the i18n translator through that component.
- Manual visual QA across UK domestic, Nigeria Paystack cross-border, and UAE Arabic/RTL should still be done in browser with tenant fixtures and real test gateway keys.

---

# Header + Controls Layout Follow-up

Date: 2026-05-25

## Files Touched

- `apps/widget/components/shipments/CreateShipmentForm.tsx` - added sticky tenant header bar, moved language selector into the header, and moved Single/Bulk CSV segmented control to its own row above the first card.
- `apps/widget/app/ship/[tenant]/page.tsx` - removed the old hosted-only tenant header so hosted and embed tiers use the same form-owned sticky header.
- `apps/widget/lib/shipmentTenantConfig.ts` - added `displayName` and `logoUrl` to the existing `TenantConfig` object so the form can use the branding data it already receives/fetches.

## Before -> After

| Area | Before | After |
|---|---|---|
| Tenant branding | Hosted page had a separate non-sticky logo/title header; embed had no reserved logo bar. | Form owns a sticky 64px header bar with reserved logo/wordmark space across hosted and embed tiers. |
| Logo fallback | Hosted only showed logo when configured. | Header shows tenant logo when present, tenant display name wordmark when no logo, or keeps the reserved bar empty when neither exists. |
| Language selector | Sat in the title/action cluster and competed with the page heading. | Moved to the far inline-end of the sticky header; mirrors automatically under RTL. |
| Single/Bulk toggle | Crowded the title area. | Moved to a centered, equal-width segmented control row directly above Origin and destination. |
| Hosted wrapper | Duplicated branding outside the form. | Hosted wrapper now delegates branding display to the same form header used by the embed tier. |

## Behavior Confirmation

No shipment behavior changed. Corridor selection, i18n switching, Single/Bulk mode state, validation, OTP, payment sessions, routes, payloads, customs persistence, and callbacks were not intentionally changed. The only data-shape addition is presentational branding metadata (`displayName`, `logoUrl`) on the existing tenant config object.

## Verification

- `npm run typecheck --workspace=apps/widget` - PASS
- `npm run test --workspace=apps/widget` - PASS, 7 files / 27 tests
- `npm run build --workspace=apps/widget` - PASS
- Sticky-in-iframe: header uses `position: sticky; top: 0` inside the form/widget root, not host-window scripting or fixed positioning.
- Reserved height: header is fixed at `h-16`, so logo/no-logo tenants keep the same vertical space.
- White-label: active segmented control and focus states remain driven by `--brand-primary`; no hardcoded brand red was added.
- RTL: header uses document direction and flex main-start/main-end behavior, so logo/wordmark and language selector mirror under `dir="rtl"`; segmented control is symmetric and remains centered.

## Follow-ups Left Alone

- Visual confirmation with real tenant logos should be done in browser because external logo aspect ratios vary by tenant dashboard uploads.

---

# Light / Dark Theme Toggle With System Autodetect

Date: 2026-05-25

## Files Touched

- `apps/widget/app/layout.tsx` - added the pre-paint theme resolver script for `light`, `dark`, and `system`.
- `apps/widget/app/globals.css` - added theme-aware neutral tokens, dark-mode semantic notice text colors, themed shared component classes, and the header theme control styles.
- `apps/widget/app/page.tsx` - removed fixed white page background so the embed root inherits the resolved theme surface.
- `apps/widget/app/ship/[tenant]/page.tsx` - removed fixed white hosted-page background so hosted rendering uses the same theme surface.
- `apps/widget/components/shipments/CreateShipmentForm.tsx` - added the header theme segmented control, persisted theme state, URL theme hint handling, and theme-aware neutral class usage.
- `apps/widget/components/payments/BulkPaymentForm.tsx` - replaced fixed neutral colors with theme-aware surface, border, and text variables.
- `apps/widget/lib/shipmentMessages.ts` - added localized theme-control labels through the existing message catalog.
- `apps/widget/__tests__/shipPage.test.tsx` - updated the hosted-page tenant mock with presentational branding fields required by the shared tenant type.

## Theme Before -> After

| Area | Before | After |
|---|---|---|
| Theme model | Single light neutral layer, with many fixed white/gray Tailwind classes. | `light`, `dark`, and `system` choices resolve to `data-theme="light|dark"` on the widget/root document. |
| Neutral tokens | White cards and gray text/borders were hardcoded in component classes. | Components read `--surface`, `--surface-2`, `--surface-inset`, `--border`, `--text`, `--text-muted`, and `--text-subtle`. |
| Brand accent | Tenant brand already drove buttons/focus/active states. | Unchanged: `--brand-primary`, `--brand-accent`, and `--brand-radius` stay tenant-owned in both themes. Brand-filled controls keep white text for dark-brand contrast. |
| Semantic states | Fixed semantic colors on light surfaces. | Success/warning/error/info keep their fixed meanings; dark mode only adjusts their supporting surfaces and text tones for legibility. |
| Toggle placement | No theme control. | Compact two-icon Light/Dark control in the sticky header beside Language, pushed to the full header inline-end, with localized accessible labels and natural RTL mirroring. |
| Persistence | No theme preference. | Explicit Light/Dark choice is stored in `localStorage` as `fauward.widget.theme`; with no explicit choice, the widget autodetects the OS scheme. |
| Embed hint | Embed contract only accepted tenant/token context. | Optional `?theme=light|dark|system` is accepted as a session hint without changing `?tenant=&token=`. |
| First paint | Theme resolved after React only. | `apps/widget/app/layout.tsx` applies `data-theme` before body paint to avoid a light flash in dark embeds. |

## Token Sets Added

Light/default:

```css
--surface: #ffffff;
--surface-2: #f9fafb;
--surface-inset: #f3f4f6;
--border: #e5e7eb;
--text: #111827;
--text-muted: #6b7280;
--text-subtle: #374151;
```

Dark:

```css
--surface: #0b0f19;
--surface-2: #111827;
--surface-inset: #1f2937;
--border: #374151;
--text: #f9fafb;
--text-muted: #9ca3af;
--text-subtle: #d1d5db;
```

## Behavior Confirmation

No shipment logic changed. Corridor selection, validation, OTP, payment routing, Stripe/Paystack session creation, customs payloads, shipment submission, bulk parsing, routes, and callbacks were not intentionally modified. The only runtime addition is presentational theme selection and persistence.

## Verification

- `npm run typecheck --workspace=apps/widget` - PASS
- `npm run test --workspace=apps/widget` - PASS, 7 files / 27 tests
- `npm run build --workspace=apps/widget` - PASS
- White-label in dark mode: brand variables are not redefined per theme; dark brand colors remain legible on brand-filled controls because the foreground stays white, and brand text accents use a dark-mode contrast mix.
- RTL: the toggle sits in the existing sticky header control cluster and uses symmetric segmented styling, so it mirrors with the header under `dir="rtl"`.
- No-flash embed path: `?theme=dark` is resolved in `app/layout.tsx` before body paint; absent `theme` falls back to stored choice, then OS autodetect.
- Reduced motion: existing `prefers-reduced-motion: reduce` rule applies to the new theme-control transitions.

## Follow-ups Left Alone

- Manual browser QA across real UK/Stripe, Nigeria/Paystack, and UAE Arabic tenants is still needed to verify visual polish with live tenant data and real logo assets.
