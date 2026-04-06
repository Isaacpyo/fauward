# Fauward Brand System

This package set is the source of truth for Fauward brand tokens, logo usage, and tenant theming.

## Packages

- `packages/design-tokens/src/tokens.css`
  - Global tokens (semantic, surface, spacing, typography, motion)
  - Focus-visible rules and prefers-reduced-motion handling

- `packages/design-tokens/src/fauward.css`
  - Native Fauward palette for Persona B/C/D

- `packages/theme-engine/src/index.ts`
  - `applyTenantTheme()` for Persona A (white-label)

- `packages/brand/src/speed-mark.ts`
  - Inline SVG string and helper to create DOM element
  - Always `fill="currentColor"`

## Font loading

Load Inter and JetBrains Mono in the app shell:

```html
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
```

## Usage notes

- Persona A must use `var(--color-primary-base)` for interactive elements.
- Semantic status colors are immutable across all personas.
- Do not set `fill` on the SVG directly. Set color on the container.