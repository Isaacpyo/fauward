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
