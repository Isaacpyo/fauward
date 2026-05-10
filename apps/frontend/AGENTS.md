# Frontend Codex Guide

These instructions apply to `apps/frontend/**`.

## Next.js App Router

- All pages live under `src/app/`; do not add a Pages Router.
- Server components are the default.
- Use `'use client'` only for hooks, browser APIs, or event handlers.
- Route groups use `(group-name)` folders and do not affect the URL.
- Use `loading.tsx` for loading states and `error.tsx` for error boundaries.
- Export `metadata` or `generateMetadata` from page files when metadata is needed.

## API Routes

```ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  return NextResponse.json({ data });
}
```

## Styling

- Use Tailwind CSS.
- Prefer design tokens from `@fauward/brand`.
- Tenant theme variables come from `@fauward/theme-engine`.
- Avoid inline styles unless the existing pattern leaves no practical alternative.

## Navigation And Images

```tsx
import Link from 'next/link';
import Image from 'next/image';
```

Use `Link` for internal links and `Image` for images.

## Components

- Co-locate page-specific components with the page.
- Shared UI components live in `src/components/`.
- Marketing components live in `src/components/marketing/`.

