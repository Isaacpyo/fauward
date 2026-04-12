# Fauward — Frontend Design System & Surface Specifications

> **Sections:** Design System · Surface Specifications for all 5 surfaces

---

## 13. Frontend Design System

### 13.1 Design Tokens

```css
/* Brand (marketing site only) */
--brand-navy: #0D1F3C;
--brand-amber: #D97706;
--brand-white: #FFFFFF;

/* Neutral palette */
--gray-50: #F9FAFB; --gray-100: #F3F4F6; --gray-200: #E5E7EB;
--gray-500: #6B7280; --gray-700: #374151; --gray-900: #111827;

/* Semantic (FIXED — never overridden by tenant brand) */
--color-success: #16A34A;       --color-success-light: #DCFCE7;
--color-warning: #D97706;       --color-warning-light: #FEF3C7;
--color-error: #DC2626;         --color-error-light: #FEE2E2;
--color-info: #2563EB;          --color-info-light: #DBEAFE;

/* Tenant theme (CSS vars loaded from API) */
--tenant-primary: <from API>;
--tenant-primary-hover: <darken 10%>;
--tenant-primary-light: <lighten + opacity>;
--tenant-accent: <from API>;
```

### 13.2 Shipment State → Colour Mapping

| State | Background | Text | Dot |
|-------|-----------|------|-----|
| PENDING | gray-100 | gray-700 | gray-400 |
| PROCESSING | blue-100 | blue-700 | blue-500 |
| PICKED_UP | indigo-100 | indigo-700 | indigo-500 |
| IN_TRANSIT | amber-100 | amber-700 | amber-500 |
| OUT_FOR_DELIVERY | amber-100 | amber-700 | amber-500 (pulse) |
| DELIVERED | green-100 | green-700 | green-500 |
| FAILED_DELIVERY | red-100 | red-700 | red-500 |
| RETURNED | orange-100 | orange-700 | orange-500 |
| CANCELLED | gray-100 | gray-400 | gray-300 (strikethrough) |
| EXCEPTION | red-100 | red-700 | red-500 (alert icon) |

Invoice: DRAFT=gray | SENT=blue | PAID=green | OVERDUE=red | VOID=gray+strikethrough
Subscription: ACTIVE=green | TRIAL=amber | PAST_DUE=red | SUSPENDED=red | CANCELLED=gray

### 13.3 Typography Scale

| Token | Size | Use |
|-------|------|-----|
| xs | 12px | Captions, timestamps |
| sm | 14px | Table cells, secondary text |
| base | 16px | Body text, inputs |
| lg | 18px | Subheadings |
| xl | 20px | Section titles |
| 2xl | 24px | Page titles |
| 3xl–5xl | 30–48px | Marketing headlines |

Weights: 400 (normal), 500 (medium), 600 (semibold), 700 (bold)

**Monospace rules — ALWAYS mono:** tracking numbers, API keys, webhook URLs/secrets, system IDs, queue names, JSON payloads, log entries, status codes, key prefixes.
**NEVER mono:** names, descriptions, labels, buttons, navigation, headings.

### 13.4 Visual Principles

- Professional, modern, operationally clear
- Data-dense where needed
- Flat bordered cards (1px border-gray-200) over heavy shadows
- Accessible contrast (WCAG 2.1 AA)
- Role-aware navigation
- No visual clutter, no "startup gimmick" visuals in operational dashboards
- Elevation priority: borders > shadow-sm (dropdowns) > shadow-md (modals) > shadow-lg (drawers)

### 13.5 Spacing Scale (px)

4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128

### 13.6 Border Radius

none=0 | sm=4 | md=6 | lg=8 | xl=12 | full=9999
Cards: lg | Buttons: md | Badges: full | Inputs: md

### 13.7 Responsive Breakpoints

sm=640 | md=768 | lg=1024 | xl=1280 | 2xl=1536
Sidebar collapses at <lg. Tables convert to cards at <md.

### 13.8 State Patterns (every page must implement)

- **Loading:** skeleton matching content shape
- **Empty:** illustration + heading + description + CTA
- **Error:** error message + retry button
- **Permission denied:** lock icon + "You don't have access" + "Contact your admin"
- **Plan gated:** lock icon + feature description + "Upgrade to Pro" CTA
- **Limit reached:** warning banner + upgrade CTA + action blocked

### 13.9 White-Label Theming Contract

Tenant config API returns: `{ primary_color, accent_color, logo_url, brand_name, rtl, locale, currency, timezone }`

Applied as CSS custom properties on `:root`. Components reference `var(--tenant-primary)`. Semantic colours are hardcoded, never variable. RTL: `dir="rtl"` on html, logical CSS properties.

**Critical rule: No hardcoded tenant colours in any white-label surface.**

---

## 14. Frontend Surface Specifications

### 14.1 Marketing Site — fauward.com

**Stack:** Next.js 14 App Router, TypeScript, Tailwind, SSR/SEO-first, Fauward brand only.

**Pages:** Landing, Pricing, Features (per module), Regional landings, Signup, Docs entry.

**Landing page sections:** Hero → Social proof → Feature sections (Tracking, Finance, Admin) → Screenshot showcase → Pricing preview → Region strip → Testimonials → FAQ → CTA banner → Footer.

**Design:** Large typography, strong section spacing, subtle motion, premium SaaS feel, logistics credibility.

### 14.2 Tenant Portal — {tenant}.fauward.com

**Stack:** React 18, Vite, Tailwind, Zustand, React Query, Radix UI, Socket.io-client.

**Shell:** Left sidebar (256px, collapsible) + top bar (breadcrumb, search, notifications, avatar) + main content.

**Navigation by role:** Role-based sidebar items. Active state uses `var(--tenant-primary)`.

**Public routes (no auth):** `/track`, `/track/:number`, `/book`
**Customer routes:** Dashboard, Shipments, Booking, Invoices, Profile
**Staff/Admin routes:** Admin overview, Shipments management, Routes/dispatch, CRM, Finance, Analytics, Team, Settings (branding, billing, API keys, webhooks)

### 14.3 Shipment Management UI

**List page:** Dense sortable table with filters (status, date, route, driver, customer), bulk actions, search by tracking number.

**Detail page:** Summary card + info grid + tabs (Timeline, Documents, Invoice, Notes) + status transition controls.

**Create wizard:** 4 steps (Addresses → Package → Service/Pricing → Review) → success state with tracking number.

**Status update:** Only valid next states shown. DELIVERED requires POD. FAILED requires reason.

### 14.4 Public Tracking

White-label pages under tenant's branded domain. No login required.

**Lookup:** Tenant logo + tracking input + Track button. Clean, trustworthy, mobile-first.
**Result:** Tracking number + status progress bar + vertical timeline (hero element) + delivery confirmation.

### 14.5 Onboarding Wizard

5 steps: Brand → First Shipment → Invite Team → Connect Payment → Go Live.
Each step achievable in under 2 minutes. Skip options for optional steps. Live preview for branding. Dashboard checklist shown after completion.

### 14.6 Billing & Plan Management

Current plan card + usage meters (80% warning, 100% error) + plan comparison + invoice history + payment method. Global banners for trial expiry, usage warnings, limit reached, failed payment, suspension.

### 14.7 API Keys & Webhooks (Pro+)

**API Keys:** Table + generate modal + one-time reveal + copy + revoke flow.
**Webhooks:** Endpoint table + add/edit modal + send test + delivery log with payload viewer.

### 14.8 Driver Mobile PWA

**Constraints:** Mobile-first, 48px touch targets, high contrast, offline-capable, one-handed use.
**Screens:** Login → Today's route → Stop detail → Shipment detail → Capture POD → Failed delivery → Offline/sync state.
**Bottom tab bar:** Route | Deliveries | History | Profile.

### 14.9 Super Admin Panel — admin.fauward.com

**Separate app, Fauward brand only.** Maximum data density. Heavy tables, filters, charts, logs.

**Pages:** Dashboard (MRR, tenants, shipments, DLQ) → Tenants list/detail → Revenue analytics → System health → Queue monitoring → Impersonation.

### 14.10 Embeddable Widget

Vanilla JS + CSS, Shadow DOM, < 15KB gzipped. Zero dependencies. Configurable via `<script>` tag attributes. Renders tracking input + timeline inline.
