# FAUWARD

> Multi-tenant B2B SaaS platform for logistics businesses — couriers, freight forwarders, and 3PLs.
> Owner: Temitope Agbola, Treny Limited

Fauward gives logistics businesses their own branded, fully operational platform in 10 minutes, for less than the cost of one extra staff member per month. Flat company pricing. Self-serve. White-label. Region-specific from day one.

---

## Documentation

| Document | Contents |
|----------|---------|
| [Product Overview](docs/product-overview.md) | What Fauward is, brand & identity, product surfaces, target market & competitive positioning |
| [Pricing & Billing](docs/pricing-billing.md) | Tier definitions, usage enforcement, unit economics, enterprise pricing variables |
| [Roles & Permissions](docs/roles-permissions.md) | Role hierarchy, full permission matrix, customer organisation model |
| [System Architecture](docs/system-architecture.md) | Architecture style, high-level diagram, multi-tenancy, event-driven patterns, idempotency |
| [Data Model](docs/data-model.md) | Complete SQL schema for all 35+ tables |
| [Logistics Core](docs/logistics-core.md) | Shipment state machine, pricing engine, feature modules, regional deployment, enterprise tier |
| [Frontend](docs/frontend.md) | Design system tokens, surface specifications for all 5 surfaces |
| [API Design](docs/api.md) | REST conventions, all endpoints, WebSocket events, rate limiting, error format |
| [Infrastructure & Security](docs/infrastructure-security.md) | Performance targets, scaling strategy, caching, backup/DR, security controls |
| [Product Experience](docs/product-experience.md) | Onboarding flow, migration/import, error UX, analytics & SaaS metrics, go-to-market, legal & compliance |
| [Implementation Phases](docs/implementation-phases.md) | Phase roadmap, strategic constraints, build vs buy decisions, tech stack |
| [Implementation Status](docs/implementation-status.md) | Ground truth of what's built vs spec, priority build order (Priorities 1–15), env vars, phase completion summary |
| [Feature Additions](docs/feature-additions.md) | TrenyConnect audit: returns, support tickets, email config, full pricing system, QR scanning, live map, fleet, analytics enhancements (Priorities 16–32) |

---

## Quick Start (local dev)

```bash
# Start PostgreSQL 15, Redis 7, MailHog
docker-compose up -d

# Install all workspace dependencies
npm install

# Push Prisma schema to local DB
npx prisma db push --schema=apps/backend/prisma/schema.prisma

# Start the backend
npm run dev
```

**Required env vars** — see [Implementation Status → Environment Variables](docs/implementation-status.md#2411-environment-variables-required).

---

## Monorepo Structure

```
apps/
├── backend/          Node.js · Fastify · TypeScript · Prisma
├── frontend/         Next.js 14 (marketing site)
├── tenant-portal/    React 18 · Vite (ops portal)
├── driver/           React 18 · Vite · PWA
└── super-admin/      React 18 · Vite
packages/
├── brand/            Design tokens
├── shared-types/     Cross-app TypeScript interfaces
├── domain-types/     Domain model types
├── theme-engine/     Tenant CSS var injection
├── design-tokens/    Token definitions
└── formatting/       Currency, date, weight formatters
widget/               Vanilla JS embeddable tracking widget
```

---

## Where to Start

- **New to the project?** → [Product Overview](docs/product-overview.md)
- **Building backend?** → [Implementation Status](docs/implementation-status.md) (check the priority build order)
- **Building frontend?** → [Frontend Design System](docs/frontend.md)
- **Database questions?** → [Data Model](docs/data-model.md)
- **API integration?** → [API Design](docs/api.md)
- **Adding new features?** → [Feature Additions](docs/feature-additions.md)
