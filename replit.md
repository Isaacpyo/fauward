# Fauward — Replit Project

## Overview
White-label logistics SaaS platform. Monorepo with multiple apps.

## Architecture

### Apps
- **`apps/frontend`** — Next.js 14 marketing/signup site (port 5000, webview)
- **`apps/backend`** — Fastify API server (port 3001, console)
- **`apps/tenant-portal`** — Vite React tenant dashboard (port 3000, console)
- **`apps/super-admin`** — Vite React super-admin panel (port 5173, console)
- **`apps/driver`** — Vite React driver mobile app
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
- `DATABASE_URL` — PostgreSQL connection string (already set via Replit DB)
- `DIRECT_URL` — Direct DB connection (Prisma)
- `REDIS_URL` — Redis connection URL (Upstash)
- `JWT_ACCESS_SECRET` — JWT signing secret (min 16 chars)
- `JWT_REFRESH_SECRET` — JWT refresh secret (min 16 chars)

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

## Notes
- Prisma schema pushed directly (`prisma db push`) — no migrations folder
- Footer.tsx is "use client" for newsletter state
- ScreenshotShowcase has animated Tailwind mockups (ShipmentOpsMockup, CustomerTrackingMockup, InvoicingMockup)
