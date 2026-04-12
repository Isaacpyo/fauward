# Frontend Design System & Surface Specifications

> Design tokens · Colour system · Typography · Surface specs for all 5 surfaces

**Navigation →** [Logistics Core](./logistics-core.md) · [API Design](./api.md) · [← README](../README.md)

---

## Contents

1. [Design Tokens](#1-design-tokens)
2. [Shipment State → Colour Mapping](#2-shipment-state--colour-mapping)
3. [Typography Scale](#3-typography-scale)
4. [Visual Principles](#4-visual-principles)
5. [Spacing, Radius & Breakpoints](#5-spacing-radius--breakpoints)
6. [State Patterns](#6-state-patterns)
7. [White-Label Theming Contract](#7-white-label-theming-contract)
8. [Surface Specifications](#8-surface-specifications)

---

## 1. Design Tokens

```css
/* ─── Brand (marketing site only) ─── */
--brand-navy:  #0D1F3C;
--brand-amber: #D97706;
--brand-white: #FFFFFF;

/* ─── Neutral palette ─── */
--gray-50:  #F9FAFB;
--gray-100: #F3F4F6;
--gray-200: #E5E7EB;
--gray-500: #6B7280;
--gray-700: #374151;
--gray-900: #111827;

/* ─── Semantic colours (FIXED — never overridden by tenant brand) ─── */
--color-success:       #16A34A;
--color-success-light: #DCFCE7;
--color-warning:       #D97706;
--color-warning-light: #FEF3C7;
--color-error:         #DC2626;
--color-error-light:   #FEE2E2;
--color-info:          #2563EB;
--color-info-light:    #DBEAFE;

/* ─── Tenant theme (CSS vars injected from API at runtime) ─── */
--tenant-primary:       <from API>;
--tenant-primary-hover: <darken 10%>;
--tenant-primary-light: <lighten + opacity>;
--tenant-accent:        <from API>;
```

---

## 2. Shipment State → Colour Mapping

| State | Background | Text | Indicator |
|-------|-----------|------|-----------|
| `PENDING` | `gray-100` | `gray-700` | gray-400 dot |
| `PROCESSING` | `blue-100` | `blue-700` | blue-500 dot |
| `PICKED_UP` | `indigo-100` | `indigo-700` | indigo-500 dot |
| `IN_TRANSIT` | `amber-100` | `amber-700` | amber-500 dot |
| `OUT_FOR_DELIVERY` | `amber-100` | `amber-700` | amber-500 *pulsing* |
| `DELIVERED` | `green-100` | `green-700` | green-500 dot |
| `FAILED_DELIVERY` | `red-100` | `red-700` | red-500 dot |
| `RETURNED` | `orange-100` | `orange-700` | orange-500 dot |
| `CANCELLED` | `gray-100` | `gray-400` | gray-300 *(strikethrough)* |
| `EXCEPTION` | `red-100` | `red-700` | red-500 *(alert icon)* |

**Invoice statuses:**
`DRAFT` = gray · `SENT` = blue · `PAID` = green · `OVERDUE` = red · `VOID` = gray + strikethrough

**Subscription statuses:**
`ACTIVE` = green · `TRIAL` = amber · `PAST_DUE` = red · `SUSPENDED` = red · `CANCELLED` = gray

---

## 3. Typography Scale

| Token | Size | Weight | Usage |
|-------|------|--------|-------|
| `xs` | 12 px | 400 | Captions, timestamps |
| `sm` | 14 px | 400 | Table cells, secondary text |
| `base` | 16 px | 400 | Body text, inputs |
| `lg` | 18 px | 500 | Subheadings |
| `xl` | 20 px | 600 | Section titles |
| `2xl` | 24 px | 700 | Page titles |
| `3xl` | 30 px | 700 | Marketing section headings |
| `4xl–5xl` | 36–48 px | 700 | Marketing hero headlines |

**Font families:**
- UI: `Inter`, `system-ui`, `sans-serif`
- Monospace: `JetBrains Mono`

### Monospace usage rules

> **Always monospace:** tracking numbers, API keys, webhook URLs/secrets, system IDs, queue names, JSON payloads, log entries, status codes, key prefixes.
>
> **Never monospace:** names, descriptions, labels, buttons, navigation, headings.

---

## 4. Visual Principles

- **Professional and operationally clear** — not startup-playful
- **Data-dense** where the context demands it (ops dashboards, tables)
- **Flat bordered cards** (`1px border-gray-200`) over heavy shadows
- **Accessible contrast** — WCAG 2.1 AA minimum
- **Role-aware navigation** — users only see what their role permits
- **No visual clutter** — no decorative animations in operational dashboards

### Elevation hierarchy

```
Border (default cards)
  ↓
shadow-sm  (dropdowns, tooltips)
  ↓
shadow-md  (modals, dialogs)
  ↓
shadow-lg  (drawers, side panels)
```

---

## 5. Spacing, Radius & Breakpoints

### Spacing scale (px)

`4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80 · 96 · 128`

### Border radius

| Token | Value | Used for |
|-------|-------|---------|
| `none` | 0 | — |
| `sm` | 4 px | Small badges |
| `md` | 6 px | Buttons, inputs |
| `lg` | 8 px | Cards |
| `xl` | 12 px | Modals |
| `full` | 9999 px | Pill badges, avatars |

### Responsive breakpoints

| Breakpoint | Width | Behaviour |
|------------|-------|-----------|
| `sm` | 640 px | — |
| `md` | 768 px | Tables → card layout |
| `lg` | 1024 px | Sidebar collapses |
| `xl` | 1280 px | — |
| `2xl` | 1536 px | — |

---

## 6. State Patterns

> **Every page must implement all six of these states.**

| State | Pattern |
|-------|---------|
| **Loading** | Skeleton matching the exact content shape |
| **Empty** | Illustration + heading + description + CTA |
| **Error** | Error message + retry button |
| **Permission denied** | Lock icon + "You don't have access" + "Contact your admin" |
| **Plan gated** | Lock icon + feature description + "Upgrade to Pro" CTA |
| **Limit reached** | Warning banner + upgrade CTA + action blocked |

---

## 7. White-Label Theming Contract

The tenant config API returns:

```json
{
  "primary_color": "#1E3A5F",
  "accent_color":  "#F59E0B",
  "logo_url":      "https://...",
  "brand_name":    "SwiftCargo",
  "rtl":           false,
  "locale":        "en-GB",
  "currency":      "GBP",
  "timezone":      "Europe/London"
}
```

- Applied as **CSS custom properties** on `:root` via `packages/theme-engine`
- Components reference `var(--tenant-primary)` — never hardcoded hex values
- **Semantic colours are fixed** — they are never overridable by tenant branding
- **RTL:** `dir="rtl"` on `<html>`, logical CSS properties throughout

> **Critical rule:** No hardcoded tenant colours in any white-label surface. This applies to `tenant-portal`, `driver` app, and `widget`.

---

## 8. Surface Specifications

### 8.1 Marketing Site — `fauward.com`

**Stack:** Next.js 14 App Router, TypeScript, Tailwind CSS — SSR/SEO-first, **Fauward brand only**

**Pages:** Landing, Pricing, Features (per module), Regional landings, Signup, Docs entry, Legal

**Landing page section order:**
```
Hero
  ↓ Social proof
  ↓ Feature sections (Tracking, Finance, Admin)
  ↓ Screenshot showcase
  ↓ Pricing preview
  ↓ Region strip
  ↓ Testimonials
  ↓ FAQ accordion
  ↓ CTA banner
  ↓ Footer
```

**Design:** Large typography, strong section spacing, subtle scroll animations, premium SaaS feel.

---

### 8.2 Tenant Portal — `{tenant}.fauward.com`

**Stack:** React 18, Vite, Tailwind CSS, Zustand, React Query, Radix UI, Socket.io-client

**Shell layout:**
```
┌─────────────────────────────────────────┐
│  Top Bar  (breadcrumb · search · notifs · avatar) │
├──────────┬──────────────────────────────┤
│          │                              │
│ Sidebar  │       Main Content           │
│ (256 px) │                              │
│          │                              │
└──────────┴──────────────────────────────┘
```

**Routes by audience:**

| Audience | Routes |
|----------|--------|
| Public (no auth) | `/track`, `/track/:number`, `/book` |
| Customer | Dashboard, Shipments, Booking, Invoices, Profile |
| Staff / Admin | Overview, Shipments, Dispatch, CRM, Finance, Analytics, Team, Settings |

---

### 8.3 Shipment Management UI

| Screen | Key Elements |
|--------|-------------|
| **List page** | Dense sortable table, filter bar (status/date/driver/customer), bulk actions, search by tracking number |
| **Detail page** | Summary card, info grid, tabs (Timeline · Documents · Invoice · Notes), status transition controls |
| **Create wizard** | 4 steps: Addresses → Package → Service/Pricing → Review → Success |
| **Status update** | Only valid next states shown; DELIVERED requires POD; FAILED requires reason |

---

### 8.4 Public Tracking

White-label pages under the tenant's branded domain. **No login required.**

| Page | Elements |
|------|---------|
| Lookup | Tenant logo · tracking number input · Track button |
| Result | Status progress bar · vertical event timeline · delivery confirmation |

---

### 8.5 Onboarding Wizard

5 steps — each achievable in under 2 minutes:

| Step | Action |
|------|--------|
| 1 | Upload logo + pick brand colour (live preview) |
| 2 | Create first shipment *(optional)* |
| 3 | Invite team members *(optional)* |
| 4 | Connect Stripe payment *(optional)* |
| 5 | Go live — platform URL, share button, confetti |

Dashboard checklist remains visible until all items are completed.

---

### 8.6 Driver Mobile PWA

**Constraints:** Mobile-first, **48 px minimum touch targets**, high contrast, offline-capable, one-handed use.

| Screen | Purpose |
|--------|---------|
| Login | Tenant slug + credentials |
| Route | Today's stops — pickup/delivery counts |
| Stop detail | Address, shipment info, navigate + arrive buttons |
| Capture POD | Camera photo + signature pad |
| Failed delivery | Reason selection + notes |
| History | Completed deliveries |

**Bottom tab bar:** Route · Deliveries · History · Profile

---

### 8.7 Super Admin Panel — `admin.fauward.com`

**Separate app, Fauward brand only.** Maximum data density — heavy tables, charts, logs.

| Page | Purpose |
|------|---------|
| Dashboard | MRR, tenant count, shipments today, DLQ depth |
| Tenants | Paginated list with search, plan filter; detail view with impersonate button |
| Revenue | MRR charts (new, churned, expansion, net), regional breakdown |
| System Health | API latency, DB health, Redis health, uptime |
| Queue Monitor | BullMQ queue stats, DLQ viewer |
| Impersonation | Active sessions with audit log |

---

### 8.8 Embeddable Widget

**Vanilla JS + CSS, Shadow DOM, < 15 KB gzipped. Zero dependencies.**

- Configurable via `data-tenant` and `data-theme` attributes on the `<script>` tag
- Renders: tracking number input + status timeline
- Served from `cdn.fauward.com/widget.js`

---

*Part of the [Fauward documentation](../README.md)*
