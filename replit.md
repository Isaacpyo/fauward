# Fauward — Replit Project

## Overview
White-label logistics SaaS platform. Monorepo with multiple apps.

## Architecture

### Apps
- **`apps/frontend`** — Next.js 14 marketing/signup site (port 5000, webview)
- **`apps/backend`** — Fastify API server (port 3001, console)
- **`apps/tenant-portal`** — Vite React tenant dashboard (port 3000, console)
- **`apps/super-admin`** — Vite React super-admin panel (port 5173, console)
- **`apps/agents`** — Vite React agent mobile app
- **`apps/admin`** — Admin app (minimal)

### Packages (shared)
- `packages/shared-types` — Shared TypeScript types
- `packages/domain-types` — Domain-specific types
- `packages/formatting` — Formatting utilities
- `packages/design-tokens` — Design tokens
- `packages/brand` — Brand config
- `packages/theme-engine` — Theme engine

## Workflows (all running)
- **Start application** — `cd apps/frontend && npm install && npm run dev` → port 5000 (webview)
- **Backend API** — `cd apps/backend && npm install && npm run dev` → port 3001
- **Tenant Portal** — `cd apps/tenant-portal && npm install && npm run dev` → port 3000
- **Super Admin** — `cd apps/super-admin && npm install && npm run dev` → port 5173

## Package Manager
npm (npm workspaces monorepo)

## Required Environment Variables
The **backend** requires:
- `SUPABASE_DB_URL` — Supabase transaction pooler URL (port 6543, pgbouncer=true appended automatically)
- `SUPABASE_DIRECT_URL` — Supabase direct/session pooler URL (port 5432, used by Prisma for migrations)
- `REDIS_URL` — Redis connection URL (Upstash)
- `JWT_ACCESS_SECRET` — JWT signing secret (min 16 chars)
- `JWT_REFRESH_SECRET` — JWT refresh secret (min 16 chars)

## Database
- **Provider**: Supabase (PostgreSQL 17)
- **Schema push**: `cd apps/backend && npx prisma db push`
- **Prisma config**: uses `SUPABASE_DB_URL` (pooler) for runtime, `SUPABASE_DIRECT_URL` for migrations
- **PgBouncer fix**: `pgbouncer=true` is appended automatically in `apps/backend/src/plugins/prisma.ts`

## Replit Configuration
- Frontend runs on port 5000 (required for Replit webview)
- Backend runs on port 3001
- Tenant portal runs on port 3000
- Super admin runs on port 5173
- Node.js 20 installed
- All Vite apps use `host: '0.0.0.0', allowedHosts: true` for Replit proxy compatibility

## UI Improvements Applied

### Marketing Site (apps/frontend)
- All 14 marketing components enhanced: Navbar, Hero, SocialProof, PersonaSection, HowItWorks, FeatureSection, ScreenshotShowcase, CompetitorComparison, PricingCards, TestimonialCarousel, RegionStrip, FAQAccordion, CTABanner, Footer
- Auth pages: login, forgot-password, reset-password, signup — all with bg-grid, amber focus rings, show/hide password, Google SSO placeholder

### Tenant Portal (apps/tenant-portal)
- **Sidebar**: amber active indicator, section group labels (Operations/Business/Admin), polished footer
- **PageShell**: border-bottom header divider, bold heading, improved error/permission/plan states
- **StatCard**: trend indicator with SVG arrow, icon slot, hover shadow
- **Login/Register pages**: full-screen centered card, label+input stacks, show/hide password
- **index.css**: custom scrollbar, smooth focus transitions, page-fade-in animation class

### Super Admin (apps/super-admin)
- **AdminLayout**: wider sidebar (240px), brand logo strip, amber left-indicator for active nav, header with current page title and system status badge
- **MetricCard**: bold value, colored trend indicator (green ↑ / red ↓)
- **ActivityFeed**: timeline dots with connector lines, formatted timestamps, hover states
- **TenantsListPage**: polished filter bar with focus rings, search icon, count label
- **DashboardPage**: bold heading + description, trendUp props on metrics, alert section label
- **vite.config.ts**: port 5173, host 0.0.0.0, allowedHosts: true
- **index.css**: custom scrollbar, amber focus-visible ring, page animation

## Production Deployment

### Architecture
All apps are served from a single Replit deployment behind a reverse proxy:
- **Port 5000**: `proxy.js` — routes by `Host` header (exposed externally)
- **Port 3001**: Backend API (internal)
- **Port 3002**: Marketing Site / Next.js (internal)
- **Port 3003**: Tenant Portal static files (internal)
- **Port 3004**: Super Admin static files (internal)

### Build & Start scripts
- `scripts/build.sh` — builds all 4 apps for production
- `scripts/start.sh` — starts all 4 services + reverse proxy
- `proxy.js` — Node.js HTTP reverse proxy, routes by hostname

### Custom Domain Routing (fauward.com)
| Domain | App | Internal Port |
|---|---|---|
| fauward.com / www.fauward.com | Marketing Site | 3002 |
| app.fauward.com | Tenant Portal | 3003 |
| admin.fauward.com | Super Admin | 3004 |
| api.fauward.com | Backend API | 3001 |

### Cloudflare DNS Setup (after first deploy)
Add CNAME records for ALL subdomains pointing to the same Replit deployment URL:
- `@` (root) → `<replit-cname-target>` (Cloudflare CNAME Flattening handles apex)
- `www` → `<replit-cname-target>`
- `app` → `<replit-cname-target>`
- `admin` → `<replit-cname-target>`
- `api` → `<replit-cname-target>`

Set DNS records to **DNS-only** (grey cloud) initially; once TLS is verified by Replit, you can enable Cloudflare proxy.

## Notes
- Prisma schema pushed directly (`prisma db push`) — no migrations folder
- Footer.tsx is "use client" for newsletter state
- ScreenshotShowcase has animated Tailwind mockups (ShipmentOpsMockup, CustomerTrackingMockup, InvoicingMockup)
- `serve` package installed at root for static file serving in production
