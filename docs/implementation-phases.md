# Fauward — Implementation Phases & Tech Stack

> **Sections:** Implementation Phases · Strategic Constraints · Build vs Buy · Tech Stack Summary

---

## 22. Implementation Phases

| Phase | File | Builds |
|-------|------|--------|
| 1 | `PHASE-1-FOUNDATION.md` | Monorepo · Prisma schema · Tenant resolver · Auth · Prisma middleware · AsyncLocalStorage · CI |
| 2 | `PHASE-2-TENANT-ONBOARDING.md` | Tenant CRUD · Branding · Domain verification · Usage tracking · Plan enforcement · Feature guards |
| 3 | `PHASE-3-BILLING.md` | Stripe subscriptions · Trial · Dunning · Usage metering · Overage · Customer portal |
| 4 | `PHASE-4-LOGISTICS-CORE.md` | Shipment state machine · Tracking · WebSocket · Notifications · Driver model · POD · Documents |
| 5 | `PHASE-5-FRONTEND.md` | Marketing site · Tenant portal · Admin dashboard · Driver PWA · Super admin · Theming |
| 6 | `PHASE-6-PRO-FEATURES.md` | API keys + scopes · Webhooks + HMAC · Embeddable widget · Idempotency |
| 6b | `PHASE-6B-CRM-DOCS-FINANCE.md` | CRM leads/quotes · Document generation · Finance module · Invoice lifecycle · Credit notes |
| 6c | `PHASE-6C-INTEGRATIONS.md` | Xero/QuickBooks sync · Carrier APIs · E-invoicing · Regional payment gateways · Import tools |
| 7 | `PHASE-7-TESTING.md` | Cross-tenant security tests · State machine tests · Load test · E2E · Accessibility |
| 8 | `PHASE-8-DEPLOY.md` | Docker · CI/CD · AWS ECS/RDS/Redis/CloudFront · Custom domain SSL · CloudWatch · Launch checklist |
| 9 | `PHASE-9-ENTERPRISE.md` | SSO · Multi-branch · Advanced RBAC · Audit log · Dedicated infra · MFA · IP allowlist |

### Strategic Constraint — What We Build First

**Rule:** Nothing gets built that does not directly enable a logistics business to create, manage, track a shipment, collect payment, and look professional to their customers.

**Must-have at launch (V1 — 8 weeks):** Tenant signup + branding, Shipment CRUD + state machine, Real-time tracking, Customer booking portal + public tracking, Stripe payments, Email notifications, PDF delivery note + basic invoice, Admin dashboard, PWA.

**Deferred to V1.1 (weeks 9–16):** CRM, Advanced finance, Accounting integrations, Carrier APIs, Enterprise tier, SMS.

**Deferred to V2 (months 5–12):** Native accounting, E-invoicing/customs, Multi-branch, SSO, All Enterprise features.

### Build vs Buy

| Component | Decision | Why |
|-----------|----------|-----|
| Payments | **Buy:** Stripe / Paystack | PCI compliance |
| Email | **Buy:** SendGrid | Deliverability |
| SMS | **Buy:** Twilio | Global carriers |
| Maps | **Buy:** Google Maps | Accuracy |
| PDF generation | **Build:** Puppeteer / PDFKit | Custom tenant templates |
| Document storage | **Buy:** AWS S3 | Managed, cheap |
| Auth (basic) | **Build:** JWT + bcrypt | Full control |
| SSO | **Build on:** passport-saml | Library handles protocol |
| Accounting integrations | **Buy:** Merge.dev or direct | Normalises 20+ APIs |
| E-invoicing | **Buy:** Regional specialist | Country-specific |
| Monitoring | **Buy:** CloudWatch + Sentry | Infra + app errors |
| Search | **Build:** PostgreSQL full-text | Sufficient at scale |

---

## 23. Tech Stack Summary

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend (Marketing)** | Next.js 14, TypeScript, Tailwind | SSR, SEO-first |
| **Frontend (Portal)** | React 18, Vite, TypeScript, Tailwind | Fast builds, SPA |
| **State Management** | Zustand (global) + React Query (server) | Lightweight |
| **UI Primitives** | Radix UI + CVA + Tailwind | Accessible, composable |
| **Forms** | React Hook Form + Zod | Type-safe validation |
| **Tables** | TanStack Table v8 | Virtualised, sortable |
| **Charts** | Recharts | Declarative, React-native |
| **Icons** | Lucide React | Consistent, MIT |
| **Backend** | Node.js, Fastify, TypeScript | High I/O throughput |
| **ORM** | Prisma | Type-safe, migrations |
| **Database** | PostgreSQL 15 (Supabase) | ACID, JSONB, tenant isolation |
| **Cache / PubSub** | Redis (Upstash) | Sessions, real-time, rate limiting |
| **Job Queue** | BullMQ | Reliable async processing |
| **WebSockets** | Socket.io + Redis adapter | Real-time tracking |
| **Payments** | Stripe + Paystack + regional | PCI-compliant, multi-region |
| **Email** | SendGrid | Transactional at scale |
| **SMS** | Twilio | Programmable SMS |
| **Maps** | Google Maps Platform | Autocomplete, routing |
| **Auth** | JWT + bcrypt + HttpOnly cookies | Stateless, secure |
| **CI/CD** | GitHub Actions | Test → Build → Deploy |
| **Containers** | Docker + AWS ECS/Fargate | Auto-scaling |
| **Monitoring** | CloudWatch + Sentry | Logs, metrics, errors |
| **Testing** | Jest (unit), Supertest (API), Playwright (E2E) | Full pyramid |
