# Frontend Rules

Applies to: `apps/frontend/**`

## Next.js App Router

- All pages under `src/app/` — App Router only, no Pages Router ever
- Server components by default — add `'use client'` only when using hooks, browser APIs, or event handlers
- Route groups use `(group-name)` folders — they don't affect the URL
- Loading states: `loading.tsx` · Error boundaries: `error.tsx`
- Metadata: export `metadata` or `generateMetadata` from page files

## API Routes

```ts
// src/app/api/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  return NextResponse.json({ data });
}
```

## Styling

- Tailwind CSS only — no inline styles, no CSS modules unless unavoidable
- Design tokens from `@fauward/brand` package (`brand.css`)
- Tenant theme variables injected by `@fauward/theme-engine`

## Navigation & Images

```tsx
import Link from 'next/link';      // internal links — never <a href>
import Image from 'next/image';    // always use — never <img>
```

## Component Conventions

- Co-locate component files with their page when page-specific
- Shared UI components in `src/components/`
- Marketing components in `src/components/marketing/`
