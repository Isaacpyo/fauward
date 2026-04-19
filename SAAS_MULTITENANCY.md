# Multi-Tenant SaaS Logistics Platform — Implementation Plan

## What We're Building

A white-label multi-tenant SaaS layer built on Fauward where:

1. **Tenants** (logistics businesses) sign up, get their own isolated workspace at `tenant.fauward.com`, manage shipments, configure branding, and invite their team.
2. **Tenant customers** can use an embeddable shipment wizard on the tenant's own website — it pops up, collects shipment details, and submits directly to that tenant's dashboard.
3. **Full isolation** — each tenant has their own Supabase schema/database, subdomain, and branded UI.

---

## Recommended Widget Embed Method: iframe + postMessage

**Recommendation: iframe with a hosted widget URL.**

This is the same approach used by Stripe, Intercom, and HubSpot forms, and it's the right choice here because:

| Concern | Why iframe wins |
|---|---|
| Style isolation | Tenant's CSS cannot bleed into the wizard; our theming is fully controlled |
| Framework agnostic | Works on Shopify, Wix, WordPress, raw HTML — anything |
| Security | No foreign JS runs inside our widget; XSS blast radius is contained |
| Theming | Branding params passed via URL query string |
| Communication | `window.postMessage` handles close, success, and error events |

**How a tenant embeds it on their site:**

```html
<!-- Paste this anywhere on your site -->
<script src="https://fauward.com/embed.js" data-tenant="acme" async></script>
```

The `embed.js` script injects a floating button + renders the iframe into the page.  
The tenant never handles raw shipment data — it flows directly to their dashboard via our API.

---

## Monorepo Changes — New Apps & Packages

```
fauward/
├── apps/
│   ├── web/                    # Existing — unchanged
│   ├── admin/                  # Existing — unchanged
│   ├── tenant-portal/          # NEW (to build) — white-label tenant dashboard
│   └── widget/                 # CREATED ✓ — embeddable shipment wizard (iframe target)
│       ├── app/
│       │   ├── layout.tsx      # iframe-safe, noindex, no nav
│       │   ├── page.tsx        # reads ?tenant= param, renders wizard
│       │   └── globals.css     # Tailwind + .field/.btn-brand/.btn-outline
│       ├── components/
│       │   ├── shipments/
│       │   │   └── CreateShipmentForm.tsx   # adapted wizard + postMessage events
│       │   └── payments/
│       │       └── BulkPaymentForm.tsx
│       ├── hooks/
│       │   └── useGlobalLoading.ts
│       ├── lib/
│       │   ├── firebaseConfig.ts
│       │   └── firebaseClient.ts
│       ├── next.config.ts      # allows iframe embedding from any origin
│       ├── tailwind.config.ts
│       ├── tsconfig.json
│       └── package.json        # dev on port 3002
├── packages/
│   ├── types/                  # Extend with tenant types
│   ├── ui/                     # Extend with themeable variants
│   ├── tenant-db/              # NEW (to build) — Supabase client + schema helpers
│   └── widget-sdk/             # NEW (to build) — embed.js + postMessage protocol
└── ...
```

---

## Architecture Overview

```
Tenant's website
  │
  │  <script src="fauward.com/embed.js" data-tenant="acme">
  ▼
embed.js (widget-sdk package)
  │  Injects iframe pointing to:
  ▼
https://widget.fauward.com/?tenant=acme&theme=...
  (apps/widget — Next.js app, iframe-safe, no nav chrome)
  │  On submit: POST /api/widget/shipments
  ▼
Fauward API (apps/widget/app/api/widget/*)
  │  Validates tenant API key embedded in widget token
  │  Writes shipment to tenant's Supabase schema
  ▼
Tenant Dashboard (apps/tenant-portal)
  https://acme.fauward.com
  │  Real-time shipment list, status updates, team management
  ▼
Supabase (per-tenant schema isolation)
```

---

## Supabase Schema Design

Each tenant gets a dedicated **Postgres schema** inside the same Supabase project (schema-per-tenant isolation). This gives full data isolation without the overhead of separate database instances.

### Public schema (platform-level)

```sql
-- Tenant registry
create table public.tenants (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,          -- "acme" → acme.fauward.com
  name          text not null,
  plan          text default 'starter',
  status        text default 'active',         -- active | suspended
  created_at    timestamptz default now()
);

-- Tenant branding
create table public.tenant_branding (
  tenant_id     uuid primary key references public.tenants(id),
  logo_url      text,
  primary_color text default '#2563eb',
  accent_color  text default '#1e40af',
  font_family   text default 'Inter',
  custom_domain text,                          -- e.g. ship.acme.com
  updated_at    timestamptz default now()
);

-- Tenant API keys (for widget authentication)
create table public.tenant_api_keys (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid references public.tenants(id),
  key_hash      text unique not null,          -- SHA-256 of raw key
  label         text,
  scopes        text[] default array['widget:write'],
  status        text default 'active',
  created_at    timestamptz default now()
);

-- Widget embed tokens (short-lived, signed)
create table public.widget_tokens (
  token_hash    text primary key,
  tenant_id     uuid references public.tenants(id),
  expires_at    timestamptz not null,
  created_at    timestamptz default now()
);
```

### Per-tenant schema (one per tenant)

When a tenant signs up, a migration runs that creates `schema_{tenant_id}` with:

```sql
-- Run once per tenant during onboarding
create schema tenant_{slug};

create table tenant_{slug}.users (
  id            uuid primary key default gen_random_uuid(),
  email         text unique not null,
  full_name     text,
  role          text default 'member',         -- owner | admin | member
  status        text default 'active',
  invited_by    uuid,
  created_at    timestamptz default now()
);

create table tenant_{slug}.shipments (
  id              uuid primary key default gen_random_uuid(),
  tracking_ref    text unique not null,        -- TC-YYYYMMDD-xxxxx
  source          text default 'dashboard',    -- dashboard | widget | api | csv
  status          text default 'PENDING',
  direction       text not null,               -- SHIP_TO_AFRICA | SHIP_TO_UK
  route           text not null,

  -- Sender
  sender_name     text not null,
  sender_email    text,
  sender_phone    text not null,
  sender_address  jsonb not null,              -- { address1, city, postcode, country }

  -- Recipient
  recipient_name  text not null,
  recipient_email text,
  recipient_phone text not null,
  recipient_address jsonb not null,

  -- Goods
  category        text not null,
  declared_value  numeric not null,
  insurance       text default 'NONE',
  notes           text,

  -- Package
  length_cm       numeric,
  width_cm        numeric,
  height_cm       numeric,
  weight_kg       numeric not null,
  chargeable_weight numeric,

  -- Pricing
  price_estimate  numeric,

  -- Metadata
  created_by_user_id uuid references tenant_{slug}.users(id),
  widget_session_id  text,                    -- set when source = 'widget'
  phone_verified  boolean default false,
  assigned_agent  text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

create table tenant_{slug}.shipment_events (
  id          uuid primary key default gen_random_uuid(),
  shipment_id uuid references tenant_{slug}.shipments(id),
  status      text not null,
  note        text,
  actor_id    uuid,
  created_at  timestamptz default now()
);

create table tenant_{slug}.team_invites (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  role        text default 'member',
  token_hash  text unique not null,
  expires_at  timestamptz not null,
  accepted    boolean default false,
  created_at  timestamptz default now()
);
```

---

## Implementation Phases

### Phase 1 — Foundation (Week 1–2)

**Goal:** Supabase schema, tenant resolution middleware, basic routing.

#### 1.1 Supabase setup

- [ ] Create Supabase project, run public schema migrations above
- [ ] Write a `createTenantSchema(slug)` helper in `packages/tenant-db/` that runs the per-tenant DDL via `supabase.rpc`
- [ ] Add Supabase env vars to all relevant apps

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=     # server-side only, never exposed to client
```

#### 1.2 Subdomain routing (tenant-portal app)

In `apps/tenant-portal/middleware.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const host = req.headers.get('host') ?? '';
  const slug = host.split('.')[0];  // "acme" from "acme.fauward.com"
  
  // Pass tenant slug to every route via header
  const res = NextResponse.next();
  res.headers.set('x-tenant-slug', slug);
  return res;
}
```

Then in `apps/tenant-portal/lib/tenant.ts`:

```typescript
import { headers } from 'next/headers';
import { supabaseAdmin } from './supabase';

export async function getTenant() {
  const slug = headers().get('x-tenant-slug');
  if (!slug) throw new Error('No tenant');
  
  const { data } = await supabaseAdmin
    .from('tenants')
    .select('*, tenant_branding(*)')
    .eq('slug', slug)
    .single();
  
  if (!data) throw new Error('Tenant not found');
  return data;
}
```

#### 1.3 Vercel/DNS setup

- Add wildcard domain `*.fauward.com` in Vercel pointing to `apps/tenant-portal`
- Add `widget.fauward.com` pointing to `apps/widget`
- Add `fauward.com/embed.js` route in `apps/web`

---

### Phase 2 — Tenant Portal App (Week 2–4)

**Goal:** Full tenant dashboard — shipments, team, branding, API keys.

Create `apps/tenant-portal/` as a new Next.js 14 app.

#### Directory structure

```
apps/tenant-portal/
├── app/
│   ├── layout.tsx              # Loads tenant branding, injects CSS vars
│   ├── (auth)/
│   │   ├── sign-in/page.tsx
│   │   └── sign-up/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx          # Sidebar + nav
│   │   ├── page.tsx            # Overview / KPIs
│   │   ├── shipments/
│   │   │   ├── page.tsx        # Shipment list
│   │   │   ├── [id]/page.tsx   # Shipment detail
│   │   │   └── create/page.tsx # Embedded wizard (from apps/widget)
│   │   ├── team/page.tsx       # Member management
│   │   ├── branding/page.tsx   # Logo, colors, fonts
│   │   ├── widget/page.tsx     # Embed code generator
│   │   └── settings/page.tsx   # API keys, account
│   └── api/
│       ├── auth/[...]/route.ts
│       ├── shipments/route.ts
│       └── team/route.ts
├── middleware.ts
└── package.json
```

#### Branding / theming

The `layout.tsx` root layout reads tenant branding from Supabase and injects CSS custom properties:

```tsx
// apps/tenant-portal/app/layout.tsx
export default async function RootLayout({ children }) {
  const tenant = await getTenant();
  const b = tenant.tenant_branding;

  const cssVars = `
    :root {
      --color-primary: ${b?.primary_color ?? '#2563eb'};
      --color-accent:  ${b?.accent_color  ?? '#1e40af'};
      --font-family:   ${b?.font_family   ?? 'Inter'};
    }
  `;

  return (
    <html>
      <head><style dangerouslySetInnerHTML={{ __html: cssVars }} /></head>
      <body>{children}</body>
    </html>
  );
}
```

All UI components in the portal use `var(--color-primary)` / Tailwind arbitrary values so they automatically pick up the tenant's brand.

---

### Phase 3 — Widget App ✓ SCAFFOLDED (Week 3–4)

**Goal:** Standalone Next.js app serving the embeddable shipment wizard.

The `apps/widget/` folder has been created and scaffolded. It is a standalone Next.js app containing the full shipment wizard (6-step flow: direction → details → quote → phone → review → payment) plus all its dependencies.

#### What was changed from the `apps/web` version

| Feature | Current state | Phase 3 target |
|---|---|---|
| Shipment submission | Firebase Firestore (temporary) | `POST /api/widget/shipments` → tenant Supabase schema |
| Tenant context | `tenantSlug` read from `?tenant=` URL param | Validated JWT token carries tenant identity |
| Close behaviour | Close button fires `postMessage({ type: 'WIDGET_CLOSE' })` | No change |
| Parent page events | `notifyParent()` fires `SHIPMENT_CREATED` / `BULK_CREATED` | No change |
| Auth | Firebase session (temporary) | Widget JWT token — no Firebase dependency |
| iframe permissions | `X-Frame-Options: ALLOWALL` (open) | Tightened to verified tenant domains only |

#### Current widget app file structure

```
apps/widget/                         ← CREATED ✓
├── app/
│   ├── layout.tsx                   # iframe-safe — noindex, no nav, no header
│   ├── page.tsx                     # reads ?tenant= param → passes to CreateShipmentForm
│   └── globals.css                  # Tailwind base + .field / .btn-brand / .btn-outline
├── components/
│   ├── shipments/
│   │   └── CreateShipmentForm.tsx   # full wizard — adapted from apps/web
│   └── payments/
│       └── BulkPaymentForm.tsx      # copied from apps/web
├── hooks/
│   └── useGlobalLoading.ts          # copied from apps/web
├── lib/
│   ├── firebaseConfig.ts            # copied from apps/web
│   └── firebaseClient.ts            # copied from apps/web
├── next.config.ts                   # allows iframe from any origin
├── tailwind.config.ts
├── tsconfig.json
└── package.json                     # runs on port 3002
```

#### Remaining work in Phase 3

- [ ] Create `apps/widget/app/api/widget/shipments/route.ts` — validates widget JWT, writes to tenant Supabase schema, replaces the `TODO Phase 3` Firebase calls
- [ ] Create `apps/widget/app/api/widget/phone/send/route.ts` and `verify/route.ts` — proxy to Twilio with tenant context
- [ ] Create `apps/widget/app/api/embed/token/route.ts` — issues short-lived JWT for `embed.js`
- [ ] Swap the two `// TODO Phase 3` `addDoc` calls in `CreateShipmentForm.tsx` to use `POST /api/widget/shipments`
- [ ] Tighten `Content-Security-Policy` in `next.config.ts` to known tenant domains only

#### Widget URL format

```
https://widget.fauward.com/?tenant=acme&token=<signed-jwt>&theme=%23e11d48
```

- `tenant` — tenant slug
- `token` — short-lived JWT signed with tenant's API key, generated by `embed.js`
- `theme` — URL-encoded primary color (optional, overrides Supabase branding)

#### Widget token flow

```
1. Tenant installs embed.js on their site
2. embed.js calls GET /api/embed/token?tenant=acme (with tenant API key in header)
3. Server returns a short-lived JWT (15 min TTL) containing { tenantId, allowedOrigin }
4. embed.js appends token to iframe src
5. Widget validates token on every API call inside the iframe
6. Submitted shipment is written to tenant_{slug}.shipments in Supabase
7. postMessage({ type: 'SHIPMENT_CREATED', trackingRef }) fires to parent
```

#### postMessage protocol

```typescript
// Events the iframe sends to the parent page:
type WidgetEvent =
  | { type: 'WIDGET_READY' }
  | { type: 'WIDGET_CLOSE' }
  | { type: 'SHIPMENT_CREATED'; trackingRef: string; shipmentId: string }
  | { type: 'WIDGET_ERROR'; message: string };
```

Tenant developers listen with:
```javascript
window.addEventListener('message', (e) => {
  if (e.origin !== 'https://widget.fauward.com') return;
  if (e.data.type === 'SHIPMENT_CREATED') {
    console.log('New shipment:', e.data.trackingRef);
  }
});
```

---

### Phase 4 — embed.js (Widget SDK Package) (Week 4)

**Goal:** The one-liner script tenants paste on their site.

Create `packages/widget-sdk/embed.ts` (compiled to `embed.js`):

```typescript
(function () {
  const script = document.currentScript as HTMLScriptElement;
  const tenant = script.dataset.tenant;
  if (!tenant) return console.error('[Fauward] Missing data-tenant attribute');

  // Create floating trigger button
  const btn = document.createElement('button');
  btn.id = 'fauward-trigger';
  btn.textContent = script.dataset.label ?? 'Ship a Package';
  btn.style.cssText = `
    position: fixed; bottom: 24px; right: 24px; z-index: 9999;
    background: var(--fauward-color, #2563eb); color: #fff;
    padding: 12px 20px; border-radius: 8px; border: none;
    font-size: 14px; font-weight: 600; cursor: pointer;
    box-shadow: 0 4px 14px rgba(0,0,0,.2);
  `;

  // Create iframe overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    display: none; position: fixed; inset: 0; z-index: 10000;
    background: rgba(0,0,0,.5); align-items: center; justify-content: center;
  `;

  const iframe = document.createElement('iframe');
  iframe.src = `https://widget.fauward.com/?tenant=${tenant}`;
  iframe.style.cssText = `
    width: 100%; max-width: 560px; height: 90vh; max-height: 760px;
    border: none; border-radius: 12px; background: #fff;
  `;

  overlay.appendChild(iframe);
  document.body.appendChild(btn);
  document.body.appendChild(overlay);

  btn.addEventListener('click', () => {
    overlay.style.display = 'flex';
  });

  window.addEventListener('message', (e) => {
    if (e.origin !== 'https://widget.fauward.com') return;
    if (e.data.type === 'WIDGET_CLOSE') overlay.style.display = 'none';
    if (e.data.type === 'SHIPMENT_CREATED') {
      overlay.style.display = 'none';
      // Dispatch DOM event for advanced integrations
      document.dispatchEvent(new CustomEvent('fauward:shipment', { detail: e.data }));
    }
  });
})();
```

Tenant's site just needs:
```html
<script src="https://fauward.com/embed.js" data-tenant="acme" async></script>
```

---

### Phase 5 — Tenant Onboarding Flow (Week 4–5)

**Goal:** Self-serve signup at `fauward.com/onboarding`.

Steps:
1. **Account** — email + password
2. **Company info** — business name, country
3. **Choose slug** — `yourcompany.fauward.com` (availability check)
4. **Branding** — logo upload, primary color picker
5. **Done** — redirect to `yourcompany.fauward.com`

On submit, server:
1. Inserts row in `public.tenants`
2. Inserts row in `public.tenant_branding`
3. Calls `createTenantSchema(slug)` to provision Supabase schema
4. Creates first user in `tenant_{slug}.users` with `role: owner`
5. Generates first API key (for embed.js)
6. Sends welcome email with embed code snippet

---

## packages/tenant-db — Supabase Client

```
packages/tenant-db/
├── src/
│   ├── index.ts            # Re-exports
│   ├── client.ts           # Supabase client factory
│   ├── schema.ts           # createTenantSchema() DDL runner
│   └── queries/
│       ├── tenants.ts      # getTenant(), createTenant()
│       ├── shipments.ts    # listShipments(), createShipment()
│       └── users.ts        # listTeamMembers(), inviteMember()
└── package.json
```

```typescript
// packages/tenant-db/src/client.ts
import { createClient } from '@supabase/supabase-js';

export function getTenantDb(schemaName: string) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { db: { schema: schemaName } }
  );
}

export function tenantSchema(slug: string) {
  return `tenant_${slug.replace(/-/g, '_')}`;
}
```

---

## Security Considerations

| Risk | Mitigation |
|---|---|
| Tenant data leakage | Postgres schema isolation + RLS policies per schema |
| Widget token abuse | Short-lived JWT (15 min), pinned to `allowedOrigin` |
| Subdomain takeover | Wildcard DNS only resolves to known tenants; 404 for unknown slugs |
| iframe clickjacking | Widget sets `X-Frame-Options: ALLOW-FROM fauward.com` + checks `allowedOrigin` |
| API key exposure | SHA-256 hashing — raw key never stored |
| Tenant slug collision | Unique constraint on `public.tenants.slug` + validation on signup |

---

## Environment Variables — New

Add to `apps/tenant-portal/.env.local` and `apps/widget/.env.local`:

```env
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# JWT signing for widget tokens
WIDGET_TOKEN_SECRET=          # 32+ char random string

# Twilio — for phone OTP verification in the widget
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=

# Platform base URL
NEXT_PUBLIC_WIDGET_BASE_URL=https://widget.fauward.com
NEXT_PUBLIC_PLATFORM_URL=https://fauward.com
```

---

## turbo.json — Add New Apps

```json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

Add to root `pnpm-workspace.yaml`:
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```
(already covers new apps automatically)

Add to root `package.json` scripts:
```json
{
  "dev:tenant": "turbo dev --filter=tenant-portal",
  "dev:widget": "turbo dev --filter=widget",
  "build:tenant": "turbo build --filter=tenant-portal",
  "build:widget": "turbo build --filter=widget"
}
```

---

## Open Questions Before Starting

1. **Auth provider for tenant portal users** — Use Supabase Auth (simpler, consistent with DB) or keep Firebase Auth for tenant users too? Recommendation: Supabase Auth for tenant portal, keeps it fully decoupled.

2. **Payment for shipments created via widget** — Does the tenant charge their customer directly (Stripe on tenant's account), does Fauward charge centrally, or is payment collected offline? This affects Phase 3 (whether to include/exclude the Stripe step).

3. **Phone OTP in widget** — The existing wizard requires phone verification via Twilio. Should the widget also require this, or skip it for widget-submitted shipments (lower friction)?

4. **Custom domains** — Tenants with `ship.acme.com` pointing to their widget: this requires a reverse proxy (Cloudflare or Vercel Edge) that maps custom domains to the correct tenant slug. Worth scoping separately.

---

## Suggested Build Order

| Week | Deliverable |
|---|---|
| 1 | Supabase project + public schema + `packages/tenant-db` |
| 2 | `apps/tenant-portal` scaffold — auth, subdomain routing, empty dashboard |
| 3 | Tenant portal — shipment list + detail views (read-only first) |
| 3 | `apps/widget` — DONE ✓ (scaffolded and ready) |
| 4 | Widget → Supabase API route, postMessage events |
| 4 | `packages/widget-sdk` — `embed.js` |
| 5 | Tenant portal — branding settings, team management, API key management |
| 5 | `fauward.com/onboarding` — self-serve tenant signup |
| 6 | End-to-end test: signup → brand → embed on test site → shipment appears in dashboard |
| 7 | Custom domain support (Cloudflare Workers or Vercel Edge) |
