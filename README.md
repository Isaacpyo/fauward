# Fauward

> Multi-tenant B2B SaaS platform for logistics businesses — couriers, freight forwarders, and 3PLs.
> **Owner:** Temitope Agbola, Treny Limited · **Status:** Active development

Fauward gives logistics businesses their own branded, fully operational platform in 10 minutes. Flat company pricing. Self-serve. White-label. Region-specific from day one.

**Tagline:** *"Ship smarter. Everywhere."*

---

## Documentation

| Document | What's inside |
|----------|--------------|
| [Product Overview](docs/product-overview.md) | What Fauward is, brand & identity, product surfaces, target market, competitive positioning |
| [Pricing & Billing](docs/pricing-billing.md) | Tier definitions (Starter / Pro / Enterprise), usage enforcement, unit economics |
| [Roles & Permissions](docs/roles-permissions.md) | Role hierarchy, full permission matrix, customer organisation model |
| [Gating Implementation](docs/gating-implementation.md) | How each of the five surfaces is gated — auth, RBAC, plan features, gaps checklist |
| [Auth Flows](docs/auth-flows.md) | Sign-in, sign-out, token refresh, impersonation, password reset, MFA across all surfaces |
| [System Architecture](docs/system-architecture.md) | Architecture style, high-level diagram, multi-tenancy, event-driven patterns |
| [Data Model](docs/data-model.md) | Human-readable schema companion; Prisma remains canonical |
| [Logistics Core](docs/logistics-core.md) | Shipment state machine, pricing engine, feature modules, regional deployment, enterprise tier |
| [Frontend](docs/frontend.md) | Design system tokens, surface specs for all 5 surfaces |
| [API Design](docs/api.md) | REST endpoints, WebSocket events, rate limiting, idempotency, error format |
| [Infrastructure & Security](docs/infrastructure-security.md) | Performance targets, scaling strategy, caching, backup/DR, security controls |
| [Product Experience](docs/product-experience.md) | Onboarding flow, error UX, analytics & SaaS metrics, go-to-market, legal |
| [Implementation Phases](docs/implementation-phases.md) | Phase roadmap, build vs buy decisions, full tech stack |
| [Implementation Status](docs/implementation-status.md) | **Start here if you're coding.** Ground truth of what's built, what's missing, priority build order, env vars |
| [Feature Additions](docs/feature-additions.md) | Returns, support tickets, full pricing system, QR scanning, live map, fleet management, and more (Priorities 16–32) |
| [Tracking Core](docs/tracking-core.md) | Unified tracking system — TrackingEvent, TrackingSnapshot, visibility rules, portal APIs, migration |
| [Relay](docs/relay.md) | AI-assisted customer support, draft approval flow, LLM gateway routing, knowledge base, widget UI, tracking integration |

---

## Current Implementation Status

As of 2026-05-10, the May implementation run is complete:

| Area | Status |
|------|:------:|
| Phase 1 - Operational core | 30 of 30 |
| Phase 2 - Commercial core | 34 of 34 |
| Phase 3 - AI layer | 42 of 42 |
| Tenant portal additions | 6 of 6 |
| Global checks | 7 of 7 |

Backend Vitest reached 149 passing tests, and backend, tenant portal, and Fauward-Go TypeScript checks passed in the final verification run. Prisma client generation is clean. Local Supabase migration status may be deferred when direct port 5432 access is blocked; migration deployment should run from CI/CD or a network with a reachable `DIRECT_URL`.

---

## Quick Start

```bash
# 1. Start local services (PostgreSQL 15, Redis 7, MailHog)
docker-compose up -d

# 2. Install all workspace dependencies
npm install

# 3. Generate Prisma client and apply migrations
npm run prisma:generate --workspace=apps/backend
npm run prisma:migrate --workspace=apps/backend

# 4. Start the backend
npm run dev
```

> **Required environment variables** - see `apps/backend/.env.example` and [Implementation Status](docs/implementation-status.md).

---

## Monorepo Structure

```
apps/
├── backend/          Node.js · Fastify · TypeScript · Prisma
├── frontend/         Next.js 14  (marketing site — fauward.com)
├── tenant-portal/    React 18 · Vite  (tenant ops portal)
├── agents/           React 18 · Vite · PWA  (agent mobile app)
└── super-admin/      React 18 · Vite  (Fauward internal admin)

packages/
├── brand/            Design tokens — brand.css
├── shared-types/     Cross-app TypeScript interfaces
├── domain-types/     Domain model types
├── theme-engine/     Tenant CSS variable injection
├── design-tokens/    Token definitions
└── formatting/       Currency, date, weight formatters

widget/               Vanilla JS embeddable tracking widget
```

---

## Where to Start

| Goal | Go to |
|------|-------|
| New to the project | [Product Overview](docs/product-overview.md) |
| Building backend features | [Implementation Status → Priority Build Order](docs/implementation-status.md#10-priority-build-order) |
| Building frontend | [Frontend Design System](docs/frontend.md) |
| Understanding the database | [Data Model](docs/data-model.md) |
| Integrating via API | [API Design](docs/api.md) |
| Adding new features | [Feature Additions](docs/feature-additions.md) |
| Understanding the tech choices | [Implementation Phases → Tech Stack](docs/implementation-phases.md#4-tech-stack-summary) |
