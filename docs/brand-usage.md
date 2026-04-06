# Brand Usage

Use these files to ensure UI matches Fauward brand guidelines.

## Shared tokens

- `packages/design-tokens/src/tokens.css` for semantic, surface, spacing, type, motion tokens.
- `packages/design-tokens/src/fauward.css` for Fauward native palette (Personas B/C/D).

## Frontend entry (Persona A)

Include in app shell CSS:

```css
@import '../../packages/design-tokens/src/tokens.css';
@import '../../packages/design-tokens/src/fauward.css';
```

Then inject tenant theme at runtime:

```ts
import { applyTenantTheme } from '../../packages/theme-engine/src/index.ts';

applyTenantTheme({
  primaryColor: '#0D1F3C',
  accentColor: '#D97706',
  brandName: 'Fauward',
  isRtl: false
});
```

## Admin (Persona D)

Use Fauward palette and the shared tokens. Do not override semantic colors.

## Logo

Use Speed Mark SVG from `packages/brand/src/speed-mark.ts` and set color on container.