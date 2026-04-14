# Implementation Phases & Tech Stack

> Phase roadmap · Strategic constraints · Build vs buy decisions · Tech stack summary

**Navigation →** [Implementation Status](./implementation-status.md) · [← README](../README.md)

---

## Contents

1. [Phase Roadmap](#1-phase-roadmap)
2. [Strategic Constraints](#2-strategic-constraints)
3. [Build vs Buy](#3-build-vs-buy)
4. [Tech Stack Summary](#4-tech-stack-summary)

---

## 1. Phase Roadmap

| Phase | Spec File | What Gets Built |
|-------|-----------|----------------|
| **1** | `PHASE-1-FOUNDATION.md` | Monorepo · Prisma schema · Tenant resolver · Auth · Prisma middleware · AsyncLocalStorage · CI |
| **2** | `PHASE-2-TENANT-ONBOARDING.md` | Tenant CRUD · Branding · Domain verification · Usage tracking · Plan enforcement · Feature guards |
| **3** | `PHASE-3-BILLING.md` | Stripe subscriptions · Trial · Dunning · Usage metering · Overage · Customer portal |
| **4** | `PHASE-4-LOGISTICS-CORE.md` | Shipment state machine · Tracking · WebSocket · Notifications · Driver model · POD · Documents |
| **5** | `PHASE-5-FRONTEND.md` | Marketing site · Tenant portal · Admin dashboard · Driver PWA · Super admin · Theming |
| **6** | `PHASE-6-PRO-FEATURES.md` | API keys + scopes · Webhooks + HMAC · Embeddable widget · Idempotency |
| **6b** | `PHASE-6B-CRM-DOCS-FINANCE.md` | CRM leads/quotes · Document generation · Finance module · Invoice lifecycle · Credit notes |
| **6c** | `PHASE-6C-INTEGRATIONS.md` | Xero/QuickBooks sync · Carrier APIs · E-invoicing · Regional payment gateways · Import tools |
| **7** | `PHASE-7-TESTING.md` | Cross-tenant security tests · State machine tests · Load test · E2E · Accessibility |
| **8** | `PHASE-8-DEPLOY.md` | Docker · CI/CD · AWS ECS/RDS/Redis/CloudFront · Custom domain SSL · CloudWatch · Launch checklist |
| **9** | `PHASE-9-ENTERPRISE.md` | SSO · Multi-branch · Advanced RBAC · Audit log · Dedicated infra · MFA · IP allowlist |

---

## 2. Strategic Constraints

> **Rule: Nothing gets built that does not directly enable a logistics business to create, manage, track a shipment, collect payment, and look professional to their customers.**

### V1 — Must ship at launch *(8 weeks)*

- Tenant signup + branding
- Shipment CRUD + state machine
- Real-time tracking via WebSocket
- Customer booking portal + public tracking page
- Stripe payments
- Email notifications
- PDF delivery note + basic invoice
- Admin dashboard
- Driver PWA

### V1.1 — Deferred to weeks 9–16

CRM · Advanced finance · Accounting integrations · Carrier APIs · Enterprise tier · SMS

### V2 — Deferred to months 5–12

Native accounting · E-invoicing / customs · Multi-branch · SSO · All Enterprise features

---

## 3. Build vs Buy

| Component | Decision | Rationale |
|-----------|----------|-----------|
| Payments | **Buy** — Stripe / Paystack | PCI compliance is non-trivial |
| Email | **Buy** — SendGrid | Deliverability infrastructure |
| SMS | **Buy** — Twilio | Global carrier relationships |
| Maps | **Buy** — Google Maps | Accuracy + autocomplete quality |
| PDF generation | **Build** — Puppeteer / PDFKit | Custom per-tenant branded templates |
| Document storage | **Buy** — AWS S3 | Managed, cheap, globally available |
| Auth (basic) | **Build** — JWT + bcrypt | Full control; no vendor lock-in |
| SSO | **Build on** — passport-saml | Library handles the SAML protocol |
| Accounting integrations | **Buy** — Merge.dev or direct APIs | Normalises 20+ accounting APIs |
| E-invoicing | **Buy** — Regional specialist | Each country is a unique compliance project |
| Monitoring | **Buy** — CloudWatch + Sentry | Managed infra + application errors |
| Search | **Build** — PostgreSQL full-text | Sufficient at scale; no extra service |

---

## 4. Tech Stack Summary

### Frontend

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Marketing site | Next.js 14, TypeScript, Tailwind | SSR, SEO-first |
| Tenant portal, Driver PWA, Super Admin | React 18, Vite, TypeScript, Tailwind | Fast builds, SPA |
| State management | Zustand (global) + React Query (server) | Lightweight, composable |
| UI primitives | Radix UI + CVA + Tailwind | Accessible, composable, unstyled base |
| Forms | React Hook Form + Zod | Type-safe validation |
| Tables | TanStack Table v8 | Virtualised, sortable, headless |
| Charts | Recharts | Declarative, React-native |
| Icons | Lucide React | Consistent set, MIT licence |

### Backend

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Runtime | Node.js, Fastify, TypeScript | High I/O throughput, type-safe |
| ORM | Prisma | Type-safe queries, migrations |
| Database | PostgreSQL 15 (Supabase) | ACID, JSONB, tenant isolation via middleware |
| Cache / PubSub | Redis (Upstash) | Sessions, real-time, rate limiting |
| Job queue | BullMQ | Reliable async processing, retries |
| WebSockets | Socket.io + Redis adapter | Real-time tracking, multi-instance |

### Integrations

| Purpose | Technology |
|---------|-----------|
| Payments | Stripe + Paystack + regional gateways |
| Email | SendGrid |
| SMS | Twilio |
| Maps | Google Maps Platform |
| Auth | JWT + bcrypt + HttpOnly cookies |

### Infrastructure

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| CI/CD | GitHub Actions | Test → Build → Deploy pipeline |
| Containers | Docker + AWS ECS/Fargate | Auto-scaling, managed |
| Monitoring | CloudWatch + Sentry | Infra logs/metrics + app errors |
| Testing | Jest (unit), Supertest (API), Playwright (E2E) | Full pyramid |

---

*Part of the [Fauward documentation](../README.md)*
