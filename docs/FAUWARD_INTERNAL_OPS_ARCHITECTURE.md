# Fauward Internal Operations Platform — Architecture Spec

> **Codename:** Fauward Console
> **Surface:** `apps/super-admin/` (refactored in-place — not a new app)
> **Audience:** Fauward internal staff (engineering, support, CS, finance, legal, sales)
> **Status:** v1 — extends and refactors the existing 7-page super-admin
>
> ⚠️ **For Codex / implementers:** an `apps/super-admin/` already exists in the monorepo. This spec is a refactor + extension, not a greenfield rewrite. **Read [Appendix D — Migration from Existing super-admin](#appendix-d--migration-from-existing-super-admin) before writing any code.** Existing pages, components, hooks, API clients, and auth flows must be preserved and moved into pillar folders, not deleted and rebuilt.

---

## Table of Contents

1. [Why This Exists](#1-why-this-exists)
2. [Architecture Principles](#2-architecture-principles)
3. [Technology Stack, Repo Structure & App Layout](#3-technology-stack-repo-structure--app-layout)
4. [The Shell — Entry & Pillar Dashboard](#4-the-shell--entry--pillar-dashboard)
5. [Pillar 1 — Platform Operations](#5-pillar-1--platform-operations)
6. [Pillar 2 — Revenue Operations](#6-pillar-2--revenue-operations)
7. [Pillar 3 — Customer Operations](#7-pillar-3--customer-operations)
8. [Pillar 4 — Trust, Compliance & Security](#8-pillar-4--trust-compliance--security)
9. [Pillar 5 — Go-to-Market Operations](#9-pillar-5--go-to-market-operations)
10. [Cross-Cutting Systems](#10-cross-cutting-systems)
11. [Data Model Additions](#11-data-model-additions)
12. [Routing & URL Map](#12-routing--url-map)
13. [Concrete File Tree](#13-concrete-file-tree)
14. [Build Phasing](#14-build-phasing)

**Appendices**

- [A — Buy vs Build Decisions](#appendix-a--buy-vs-build-decisions)
- [B — Pillar Manifest Type](#appendix-b--example-pillar-manifest-type)
- [C — Login → Dashboard Flow](#appendix-c--login--dashboard-flow)
- [D — Migration from Existing super-admin](#appendix-d--migration-from-existing-super-admin) ⚠️ *Read before coding*
- [E — Codex Prompt Conventions for Existing Code](#appendix-e--codex-prompt-conventions-for-existing-code) ⚠️ *Read before writing prompts*

---

## 1. Why This Exists

The existing `apps/super-admin` is a single dashboard with 7 pages. It tells Fauward staff *what is happening* on the platform but provides almost no tooling to *do the jobs* of running a SaaS business.

A robust internal operations stack — the kind Stripe, Shopify, Twilio, Datadog and Linear all run — is a portfolio of purpose-built modules organised around the five operational pillars of a SaaS company:

| Pillar | Owns | Audience |
|---|---|---|
| Platform Operations | Reliability of the product itself | SRE, Engineering, Platform |
| Revenue Operations | Money flowing in and out | Finance, RevOps |
| Customer Operations | Tenant relationships post-sale | Support, Customer Success |
| Trust, Compliance & Security | Trust signals, legal, audit | Legal, Trust & Safety, SecOps |
| Go-to-Market Operations | Acquisition, expansion, partners | Sales, Marketing, Partnerships |

Each pillar gets its own service catalogue, its own permissions, its own UI density, but lives inside one unified shell so staff land in one place after login.

---

## 2. Architecture Principles

1. **One shell, five pillars, many services.** A single React app (`super-admin`) renders a top-level pillar dashboard. Each pillar is a feature module containing a list of services. Each service is its own routed feature with its own pages.
2. **Pillar boundaries are organisational, not technical.** Pillars are folders, not packages. Services can share components and data freely within the app.
3. **Every service must be extractable.** A service folder is self-contained (pages, components, hooks, API client, types) so it can be lifted into its own app or microfrontend later when team size demands it.
4. **No tenant branding.** This surface uses Fauward native brand only (navy / amber / monospace IDs). It is an internal tool, not a customer-facing product.
5. **Maximum density.** Internal-tool aesthetic — heavy tables, filters, monospace IDs, compact spacing. Efficiency over polish.
6. **Permissions are per-service, not per-pillar.** A Finance role gets all Revenue Ops services plus *read-only* access to specific Platform Ops services (system health, queues). RBAC is granular.
7. **Every action is audited.** Every mutating call from this app writes to `AuditLog` with actor, timestamp, target, before/after diff, and reason (where applicable).
8. **Buy where you can, build the integration layer.** Don't reinvent Sentry, PagerDuty, LaunchDarkly, Stripe, Zendesk. Build deep links and embedded views that surface their data in the right context.

---

## 3. Technology Stack, Repo Structure & App Layout

### 3.1 Technology Stack

The Fauward Console runs on the same stack as your existing tenant portal, with additions for internal-tools-specific needs. The stack is deliberately conservative — internal tools should use boring, well-trodden tech.

#### Frontend (`apps/super-admin`)

| Concern | Choice | Status |
|---|---|---|
| Language | TypeScript (strict) | existing |
| Framework | React 18 | existing |
| Build | Vite 5 | existing |
| Routing | React Router 6 | existing — keep |
| Styling | Tailwind CSS 3 | existing — extend tokens, don't replace |
| State (UI) | Zustand | existing |
| Data fetching | TanStack Query v5 | existing |
| Headless UI | Radix UI primitives | existing |
| Forms | React Hook Form + Zod | add if not present |
| Tables | TanStack Table v8 | new — powers `<DenseTable>` |
| Charts | Recharts | existing |
| Icons | lucide-react | existing |
| Dates | date-fns | existing |
| Diff viewer | react-diff-viewer-continued | new — for audit log |
| Cmd+K | cmdk | new — for global search |
| Fonts | Inter (UI) + JetBrains Mono (IDs/keys) | existing |
| Test (unit) | Vitest | use what exists |
| Test (e2e) | Playwright | use what exists |

#### Backend (`apps/backend` extension)

The existing Node.js API is extended with internal-only routes mounted under `/api/internal/*`. These are bound to the staff-session middleware (separate from the tenant-session middleware used by the public/tenant API).

| Concern | Choice | Notes |
|---|---|---|
| Runtime | Node.js | existing |
| Framework | Existing (Express or Hono — match what's there) | inventory will confirm |
| ORM | Prisma | existing |
| Validation | Zod | use everywhere internal |
| Job queue | BullMQ on Redis | existing |
| Audit middleware | `@fauward/internal-audit` (NEW) | mounted on all `/api/internal/*` mutating routes |
| Auth middleware | Staff session verification (NEW) | separate from tenant auth |

#### Datastores

| Use case | Technology | Phase |
|---|---|---|
| Operational data | Postgres | existing — adds new tables in §11 |
| Cache + sessions | Redis | existing |
| Job queue | BullMQ on Redis | existing |
| Audit log (hot) | Postgres `AuditLog` (existing, extended) | Phase 0 |
| Audit log (warm/cold) | S3 + Athena (or ClickHouse) | Phase 4 — SOC 2 needs 7-year retention |
| Impersonation recordings | S3 (encrypted, signed URLs) | Phase 1 |
| DSAR exports | S3 (encrypted, 30-day signed URL expiry) | Phase 3 |
| KYC documents | S3 (encrypted, restricted IAM access) | Phase 4 |
| BI / analytics | BigQuery or Snowflake | Phase 5+ |

#### Authentication (employee, not tenant)

| Method | Technology | When |
|---|---|---|
| Primary SSO | Google Workspace OAuth 2.0 | Phase 0 — all `@fauward.com` accounts |
| Optional SAML/SCIM | WorkOS | When first enterprise customer requires it |
| TOTP fallback | `speakeasy` + `qrcode` | Phase 0 — non-Google staff (counsel, contractors) |
| Hardware key | WebAuthn via `@simplewebauthn/server` | Phase 1 — ROOT role only |
| Session storage | HTTP-only cookie + `StaffSession` Postgres row | 8h sliding window |

#### Authorization

| Concern | Choice |
|---|---|
| Permission model | `@fauward/internal-rbac` — atomic permissions, role-to-permission mapping |
| JIT elevation | `@fauward/internal-rbac` `<JITGate>` + `JitAccessRequest` table |
| Approval workflow | Built-in (different staff member required, no self-approval) |

#### Third-party integrations (buy decisions)

| Pillar.Service | Vendor | Phase | Why |
|---|---|---|---|
| 1.3 Feature Flags | LaunchDarkly (or Statsig) | Phase 3 | Production-grade flagging is complex; don't build |
| 1.5 Incidents | Incident.io (or PagerDuty) | Phase 2 | Paging + war-room tooling |
| 1.6 Observability | Datadog (or Grafana Cloud) | existing | APM, logs, traces |
| 1.6 Error tracking | Sentry | existing | — |
| 1.6 Status page | Statuspage or Instatus | Phase 2 | Customer-facing uptime |
| 2.1 Billing | Stripe Billing | existing | — |
| 2.4 Disputes | Stripe Dashboard (deep-link) | Phase 1 | — |
| 2.5 Tax | Stripe Tax + Anrok | Phase 4 | Multi-region (UK, NG, KE, ZA, GH, EG, AE) |
| 3.1 Support | Plain (modern) or Zendesk (scale) | Phase 2 | Pick one — Plain if < 5 agents, Zendesk after |
| 3.6 Email send | Customer.io (lifecycle) + AWS SES (transactional) | Phase 2 | — |
| 3.4 NPS | Delighted | Phase 2 | Or build minimal in-app |
| 4.6 KYC | Persona | Phase 4 | Best UX, multi-doc verification |
| 4.6 Sanctions | ComplyAdvantage | Phase 4 | Reasonable pricing for OFAC/UN/EU lists |
| 4.7 Secrets | Doppler (or 1Password Secrets Automation) | Phase 4 | — |
| 5.1 CRM | HubSpot | Phase 6 | Free tier covers early phases |
| 5.4 E-signature | DocuSign | Phase 5 | Industry standard for MSAs |
| All | Email auth (Google) | Google Workspace | — |

#### Infrastructure

| Concern | Choice | Status |
|---|---|---|
| Cloud | AWS | existing |
| Web hosting (Console) | Vercel or Cloudflare Pages | new (or match existing tenant-portal hosting) |
| Container runtime | Docker | existing |
| Orchestration | Match existing (ECS / Fly / Render) | existing |
| Secrets | AWS Secrets Manager | existing |
| CDN | CloudFront or Cloudflare | existing |
| DNS | Route53 or Cloudflare | existing |

#### Dev tooling

| Concern | Choice |
|---|---|
| Monorepo | Turborepo (existing) |
| Package manager | pnpm |
| Linter | ESLint + Prettier |
| Type-check | `tsc --noEmit` |
| Migrations | Prisma Migrate |
| Local dev | Docker Compose for Postgres + Redis |
| CI/CD | GitHub Actions |

#### What's deliberately NOT in the stack

To keep the surface area defensible:

- ❌ A second UI library (Material UI, Chakra, Mantine) — Tailwind + Radix is enough
- ❌ A second state library (Redux, Jotai, Recoil) — Zustand + TanStack Query is enough
- ❌ A second routing solution (TanStack Router, Remix) — React Router 6 stays
- ❌ Custom SSR for the admin app — it's an internal tool, CSR is fine
- ❌ GraphQL on the internal API — REST is faster to build and audit
- ❌ Microfrontends — pillars are folders, not separately deployed apps (yet)

### 3.2 Repo Structure & App Layout

### What changes in your monorepo

Your current `apps/super-admin/` becomes the unified internal operations console. **The existing app is refactored in-place** — its pages, components, hooks, API client and auth flow are preserved and moved into pillar folders. No new top-level apps are added at this stage. New shared packages are created where logic is needed by multiple apps (e.g. `@fauward/internal-rbac`).

> **Codex contract:** `apps/super-admin/` already contains a working 7-page admin with React 18 + Vite + Tailwind, an axios API client at `src/lib/api.ts`, React Query setup at `src/lib/query-client.ts`, and pages under `src/features/`. Every implementer must run a full inventory of this directory before any code is touched. See [Appendix D](#appendix-d--migration-from-existing-super-admin) for the exact migration map.

```
apps/
  super-admin/                    ← refactor in-place (existing app)
    src/
      shell/                      ← NEW — layout, login, pillar dashboard
      pillars/
        platform/                 ← Pillar 1 services (existing 7 pages move here)
        revenue/                  ← Pillar 2 services
        customer/                 ← Pillar 3 services
        trust/                    ← Pillar 4 services
        gtm/                      ← Pillar 5 services
      lib/                        ← KEEP — existing api/query client/auth, extended
      components/                 ← KEEP — existing UI primitives, gradually migrated to internal-ui package
      features/                   ← REMOVE after migration to pillars/ (do NOT delete until moved)
      types/                      ← shared TypeScript types

packages/
  internal-rbac/                  ← NEW — staff role/permission matrix
  internal-audit/                 ← NEW — audit log writer + UI components
  internal-ui/                    ← NEW — dense table, filter bar, mono cell, etc.
  formatting/                     ← existing
```

### Why no separate apps per pillar?

At your projected scale (260 tenants by Month 24), splitting into 5 apps creates more friction than value:

- 5x build pipelines
- 5x deploy targets
- Cross-pillar navigation requires either iframes or top-bar links that feel disjointed
- Shared components diverge

When a single team owns all of internal tooling, one app is cleaner. The pillar folder structure means you can extract any pillar into its own app later with a `git mv` plus a routing change — the boundaries are already there.

---

## 4. The Shell — Entry & Pillar Dashboard

### 4.1 Login

`/login` — Fauward staff SSO. No tenant context. Three auth flows supported:

- **Google Workspace SSO** — primary, for `@fauward.com` accounts
- **Email + TOTP** — fallback for non-SSO accounts (legal counsel, contractors)
- **Break-glass** — emergency local admin, requires hardware key

After successful auth, redirect to `/` (pillar dashboard). Session is HTTP-only cookie, 8h expiry, sliding window.

### 4.2 Pillar Dashboard (`/`)

The post-login landing page. Five pillar cards laid out 3-2 on desktop, 2-2-1 on tablet, stacked on mobile.

**Each pillar card contains:**

```
┌───────────────────────────────────────────┐
│  ◉  PLATFORM OPERATIONS                   │
│  Reliability of the product               │
│                                           │
│  ▸ Tenant Control Plane                   │
│  ▸ Impersonation Center                   │
│  ▸ Feature Flags & Releases               │
│  ▸ Queue Operations                       │
│  ▸ Incident Management            ● 1     │← red badge: active incidents
│  ▸ System Health                  ● ok    │← green health pill
│  ▸ Background Jobs                        │
│  ▸ Integration Health             ● 2     │← amber: degraded
│                                           │
│  9 services · 3 alerts                    │
└───────────────────────────────────────────┘
```

**Interactive elements:**

- Click pillar header → goes to pillar overview page (`/platform`, `/revenue`, etc.)
- Click any service link → goes directly to that service (`/platform/queues`)
- Right side of each service row shows live status indicators:
  - Active incidents count (Platform)
  - Failed payments count (Revenue)
  - Open tickets count (Customer)
  - Pending DSARs (Trust)
  - Trial expiring this week (GTM)

**Header bar (always visible across all pages):**

- Fauward logo + "Console" wordmark
- Global search (Cmd+K) — searches tenants, users, invoices, tickets, audit log
- Pillar switcher dropdown
- On-call indicator (red dot if incident active)
- User menu (avatar, role, sign out)

**Footer of dashboard:**

- "Today's stats" strip: MRR, Active Tenants, Shipments Today, P95 latency, Error rate
- Active alerts banner across all pillars

### 4.3 Pillar Overview (`/platform`, etc.)

Each pillar has a dedicated overview page that lists its services in a denser grid with metrics:

| Service | Last activity | Status | Owner |
|---|---|---|---|
| Tenant Control Plane | 3 mins ago | — | Platform |
| Impersonation Center | 2h ago (you) | — | Platform |
| Queue Operations | now | ⚠ DLQ:3 | Platform |
| ... | | | |

Clicking a row enters that service.

---

## 5. Pillar 1 — Platform Operations

**Audience:** Engineering, SRE, Platform team
**Default role:** `PLATFORM_ENGINEER`, `SRE`, `PLATFORM_ADMIN`
**Brand accent on this pillar:** `#2563EB` (info blue)

### Services

| # | Service | Route | Purpose |
|---|---|---|---|
| 1.1 | Tenant Control Plane | `/platform/tenants` | Directory, lifecycle, plan/quota |
| 1.2 | Impersonation Center | `/platform/impersonation` | Time-bound view-as with reason logging |
| 1.3 | Feature Flags & Releases | `/platform/flags` | Per-tenant gates, rollouts, kill switches |
| 1.4 | Queue Operations | `/platform/queues` | DLQ inspection, replay, throttle |
| 1.5 | Incident Management | `/platform/incidents` | Active incidents, runbooks, postmortems |
| 1.6 | System Health | `/platform/health` | SLOs, latency, error rate, uptime |
| 1.7 | Background Jobs | `/platform/jobs` | Cron status, scheduled tasks, retries |
| 1.8 | Integration Health | `/platform/integrations` | Stripe, Twilio, carrier API status |
| 1.9 | Database Operations | `/platform/database` | Migration tracker, slow queries, schema viewer |

### 1.1 Tenant Control Plane

**Pages:**
- `/platform/tenants` — list (Tenant | Domain | Plan | Status | MRR | Shipments | Created | Actions)
- `/platform/tenants/:id` — detail (tabs: Overview, Shipments, Billing, Team, Config, Audit)
- `/platform/tenants/:id/quotas` — override plan limits
- `/platform/tenants/:id/lifecycle` — suspend, unsuspend, archive, delete (double confirm)

**Actions logged to AuditLog:** any plan override, status change, quota override, deletion.

### 1.2 Impersonation Center

**Pages:**
- `/platform/impersonation` — start session (search tenant + reason field, required)
- `/platform/impersonation/sessions` — active and historical impersonation sessions
- `/platform/impersonation/sessions/:id` — session replay (action timeline, screen recording link)

**Critical rules:**
- Reason is mandatory and free-text + dropdown (Support Ticket, Bug Reproduction, Customer Request, Investigation)
- Sessions auto-expire after 30 minutes
- Tenant gets a notification when impersonation starts
- All actions in impersonated session are tagged `impersonated_by=<staff_id>`
- Read-only by default; mutation requires escalated permission

### 1.3 Feature Flags & Releases

Buy: integrate with **LaunchDarkly** or **Statsig**. Build only the embedded views.

**Pages:**
- `/platform/flags` — flag list, search, status (on/off/rollout %)
- `/platform/flags/:key` — flag detail, per-tenant overrides, rollout config
- `/platform/flags/:key/audit` — change history
- `/platform/releases` — recent deploys, rollback button, current version per service

### 1.4 Queue Operations

**Pages:**
- `/platform/queues` — queue list (Name | Depth | Rate | DLQ Depth | Oldest msg | Status)
- `/platform/queues/:name` — depth chart, recent messages, throughput
- `/platform/queues/:name/dlq` — DLQ inspector with payload preview, replay, discard
- `/platform/queues/:name/consumers` — consumer health

### 1.5 Incident Management

Buy: integrate with **PagerDuty** or **Incident.io**. Build the tenant-impact mapping.

**Pages:**
- `/platform/incidents` — active + recent incidents, severity, status, on-call
- `/platform/incidents/:id` — timeline, affected tenants list, runbook links, comms log
- `/platform/incidents/:id/postmortem` — link out to postmortem doc
- `/platform/incidents/runbooks` — runbook library (markdown rendered)

### 1.6 System Health

**Pages:**
- `/platform/health` — SLO dashboard (API p50/p95/p99, error rate, uptime, WS connections)
- `/platform/health/services` — per-service health (backend, fauward-go, python-services, agents)
- `/platform/health/regions` — regional health (UK, NG, KE, ZA, GH, EG, AE)
- `/platform/health/budget` — error budget burn-down

### 1.7 Background Jobs

**Pages:**
- `/platform/jobs` — scheduled job list (Name | Schedule | Last Run | Next Run | Status | Avg Duration)
- `/platform/jobs/:id` — run history, logs, retry button
- `/platform/jobs/:id/triggers` — manual trigger UI (with reason)

### 1.8 Integration Health

**Pages:**
- `/platform/integrations` — third-party status grid (Stripe, Twilio, Sendgrid, carriers, Xero, QuickBooks)
- `/platform/integrations/:provider` — health detail, recent errors, quota usage
- `/platform/integrations/credentials` — credential rotation tracker (no secret values shown)
- `/platform/integrations/webhooks` — outbound webhook delivery health (per tenant)

### 1.9 Database Operations

**Pages:**
- `/platform/database/migrations` — migration history, current schema version, pending migrations
- `/platform/database/slow-queries` — top 50 slow queries (read-only, last 24h)
- `/platform/database/schema` — table list, column inspector (read-only)
- `/platform/database/connections` — pool usage per service

---

## 6. Pillar 2 — Revenue Operations

**Audience:** Finance, RevOps, Billing
**Default role:** `FINANCE_ANALYST`, `FINANCE_ADMIN`, `REVOPS`
**Brand accent:** `#16A34A` (success green)

### Services

| # | Service | Route | Purpose |
|---|---|---|---|
| 2.1 | Billing Console | `/revenue/billing` | Invoices, manual creation, refunds, credits |
| 2.2 | Dunning Manager | `/revenue/dunning` | Failed payment recovery |
| 2.3 | Subscription Manager | `/revenue/subscriptions` | Plans, custom contracts, MRR tracking |
| 2.4 | Disputes & Chargebacks | `/revenue/disputes` | Stripe dispute queue |
| 2.5 | Tax & Compliance | `/revenue/tax` | VAT/GST/sales tax per region |
| 2.6 | Revenue Recognition | `/revenue/recognition` | Deferred vs recognised revenue |
| 2.7 | Reseller Commissions | `/revenue/commissions` | Calculation, payout queue |
| 2.8 | Revenue Analytics | `/revenue/analytics` | MRR, ARR, churn, expansion, cohorts |

### 2.1 Billing Console

**Pages:**
- `/revenue/billing/invoices` — all invoices across tenants (filters: status, tenant, date, amount)
- `/revenue/billing/invoices/:id` — invoice detail, edit (if draft), void, refund, credit note
- `/revenue/billing/invoices/create` — manual invoice for off-cycle billing
- `/revenue/billing/credit-notes` — credit note ledger
- `/revenue/billing/refunds` — refund queue + history (approval workflow for refunds > £500)
- `/revenue/billing/payments` — payment ledger, failed payments, retry button

### 2.2 Dunning Manager

**Pages:**
- `/revenue/dunning` — failed payment queue (Tenant | Amount | Failure Reason | Attempts | Days Past Due | Status)
- `/revenue/dunning/:tenantId` — dunning timeline for a tenant
- `/revenue/dunning/sequences` — configure dunning email/action sequences (D+1, D+3, D+7, D+14 → suspend)
- `/revenue/dunning/save-offers` — save-the-customer discount approvals

### 2.3 Subscription Manager

**Pages:**
- `/revenue/subscriptions` — all subscriptions (Tenant | Plan | MRR | Renewal | Status)
- `/revenue/subscriptions/:id` — subscription detail, plan changes, custom pricing
- `/revenue/subscriptions/contracts` — enterprise MSAs, NDA tracking, contract attachments
- `/revenue/subscriptions/overrides` — non-standard pricing approvals (audit trail)

### 2.4 Disputes & Chargebacks

**Pages:**
- `/revenue/disputes` — open disputes queue (Stripe), evidence due date countdown
- `/revenue/disputes/:id` — dispute detail, evidence builder, response submission
- `/revenue/disputes/analytics` — dispute rate by tenant, by reason, trend

### 2.5 Tax & Compliance

**Pages:**
- `/revenue/tax` — tax dashboard per region (UK VAT, NG VAT, KE VAT, ZA VAT, GH VAT, EG VAT, AE VAT)
- `/revenue/tax/returns` — return periods, filing status, export (CSV/PDF for accountant)
- `/revenue/tax/registrations` — VAT/GST registration numbers per region
- `/revenue/tax/exemptions` — tenants with tax exemption certificates

### 2.6 Revenue Recognition

**Pages:**
- `/revenue/recognition` — deferred vs recognised revenue chart
- `/revenue/recognition/schedules` — revenue schedule per subscription
- `/revenue/recognition/journal` — accounting journal entries (read-only, exportable)
- `/revenue/recognition/reports` — monthly/quarterly RevRec reports

### 2.7 Reseller Commissions

**Pages:**
- `/revenue/commissions` — partner commission ledger
- `/revenue/commissions/payouts` — pending payouts, approve & queue
- `/revenue/commissions/:partnerId` — partner detail, deals, commissions earned
- `/revenue/commissions/disputes` — partner commission disputes

### 2.8 Revenue Analytics

**Pages:**
- `/revenue/analytics` — MRR/ARR overview, growth rate, ARPU
- `/revenue/analytics/movement` — MRR movement (new + expansion − churn − contraction)
- `/revenue/analytics/cohorts` — cohort retention table
- `/revenue/analytics/by-plan` — revenue by plan, by region
- `/revenue/analytics/forecasts` — revenue forecast (rolling 12 months)

---

## 7. Pillar 3 — Customer Operations

**Audience:** Support, Customer Success, Onboarding
**Default role:** `SUPPORT_AGENT`, `SUPPORT_LEAD`, `CSM`, `CS_DIRECTOR`
**Brand accent:** `#9333EA` (purple)

### Services

| # | Service | Route | Purpose |
|---|---|---|---|
| 3.1 | Support Desk | `/customer/support` | Ticket queue (Zendesk-integrated) |
| 3.2 | Customer 360 | `/customer/360/:tenantId` | Unified tenant view |
| 3.3 | CS Console | `/customer/success` | Health scoring, churn risk, playbooks |
| 3.4 | NPS & Feedback | `/customer/feedback` | Survey results, themes |
| 3.5 | Knowledge Base Mgmt | `/customer/kb` | Internal runbooks + customer docs |
| 3.6 | Communications Hub | `/customer/comms` | Mass email, banners, status notices |
| 3.7 | QBR Center | `/customer/qbr` | Quarterly business review prep |
| 3.8 | Onboarding Tracker | `/customer/onboarding` | New tenant activation funnel |

### 3.1 Support Desk

Buy: integrate with **Zendesk**, **Intercom**, or **Plain**. Build the deep-link to Customer 360 from any ticket.

**Pages:**
- `/customer/support` — embedded ticket queue (or summary + deep link to Zendesk)
- `/customer/support/sla` — SLA breach risk dashboard
- `/customer/support/macros` — canned responses (managed in Zendesk, surfaced here)

### 3.2 Customer 360

The crown-jewel page. When any staff member opens a tenant context, this is where they land.

**Page structure for `/customer/360/:tenantId`:**

```
┌────────────────────────────────────────────────────────────────┐
│  Acme Logistics  [PRO]  [ACTIVE]  [HEALTH: 84]  [MRR: £299/mo] │
├────────────────────────────────────────────────────────────────┤
│  Open tickets: 2  ·  Open invoices: 1  ·  Last login: 3h ago    │
├────────────────────────────────────────────────────────────────┤
│ Tabs: Overview | Usage | Billing | Tickets | Health | Audit |   │
│       People | Config | Notes                                   │
└────────────────────────────────────────────────────────────────┘
```

Tabs aggregate data from:
- **Overview** — key metrics, recent activity timeline
- **Usage** — shipments/month chart, feature adoption heat map
- **Billing** — invoices, payments, dunning state, MRR history
- **Tickets** — Zendesk ticket list (last 90 days)
- **Health** — health score breakdown, churn risk factors
- **Audit** — staff actions on this tenant
- **People** — tenant users, roles, last login
- **Config** — tenant config JSON (read-only, copyable)
- **Notes** — internal CS notes (markdown)

### 3.3 CS Console

**Pages:**
- `/customer/success` — CSM book of business (assigned tenants, health, last touch)
- `/customer/success/at-risk` — churn risk queue (sorted by ARR × probability)
- `/customer/success/expansion` — expansion-ready accounts
- `/customer/success/playbooks` — playbook library (onboarding, save, expansion, churn)
- `/customer/success/playbooks/:id/runs` — active playbook runs
- `/customer/success/health-scoring` — health score model configuration

**Health score factors (composite 0–100):**
- Login recency × frequency
- Shipment volume trend (30/60/90d)
- Feature breadth adoption
- Payment health (current/dunning)
- Ticket sentiment & volume
- NPS response

### 3.4 NPS & Feedback

**Pages:**
- `/customer/feedback/nps` — NPS dashboard (score, trend, by plan, by region)
- `/customer/feedback/responses` — individual responses, comments, sentiment
- `/customer/feedback/themes` — auto-clustered themes from comments
- `/customer/feedback/surveys` — survey configuration

### 3.5 Knowledge Base Management

**Pages:**
- `/customer/kb/internal` — internal runbook library (ops procedures)
- `/customer/kb/external` — customer-facing help articles (proxied from CMS)
- `/customer/kb/drafts` — articles awaiting review
- `/customer/kb/analytics` — most-viewed, lowest-rated, search-no-result

### 3.6 Communications Hub

**Pages:**
- `/customer/comms/email` — mass email composer with tenant segmentation
- `/customer/comms/banners` — in-app banner manager (per plan, per region, scheduled)
- `/customer/comms/maintenance` — maintenance notices, status page integration
- `/customer/comms/history` — sent communications log

### 3.7 QBR Center

**Pages:**
- `/customer/qbr` — QBR calendar (which tenants are due)
- `/customer/qbr/:tenantId` — auto-generated QBR deck (usage, health, ROI, roadmap)
- `/customer/qbr/templates` — deck templates per segment

### 3.8 Onboarding Tracker

**Pages:**
- `/customer/onboarding` — funnel view (Signed up → Logo → First shipment → Invited team → Connected payment → Live)
- `/customer/onboarding/:tenantId` — per-tenant checklist + intervention triggers
- `/customer/onboarding/blockers` — tenants stuck > N days at a step

---

## 8. Pillar 4 — Trust, Compliance & Security

**Audience:** Legal, Trust & Safety, Security, Compliance
**Default role:** `TRUST_ANALYST`, `LEGAL_COUNSEL`, `SECURITY_ENGINEER`, `COMPLIANCE_ADMIN`
**Brand accent:** `#DC2626` (error red — signals seriousness)

This pillar is what unblocks enterprise sales and SOC 2.

### Services

| # | Service | Route | Purpose |
|---|---|---|---|
| 4.1 | Employee IAM | `/trust/iam` | Staff SSO, RBAC, sessions |
| 4.2 | Just-in-Time Access | `/trust/jit` | Break-glass elevation with approval |
| 4.3 | Audit Log | `/trust/audit` | Immutable, searchable, SOC2-ready |
| 4.4 | Compliance Operations | `/trust/compliance` | GDPR DSAR, legal hold, data export |
| 4.5 | Trust & Safety | `/trust/safety` | Fraud, AUP enforcement, suspensions |
| 4.6 | KYC & Sanctions | `/trust/kyc` | Enterprise verification, screening |
| 4.7 | Secret Management | `/trust/secrets` | API key rotation tracker |
| 4.8 | Security Monitoring | `/trust/security` | Anomaly detection, login attempts |

### 4.1 Employee IAM

**Pages:**
- `/trust/iam/users` — staff directory, role, last login, session count, status
- `/trust/iam/users/:id` — user detail, role assignments, MFA status, recent activity
- `/trust/iam/roles` — role catalogue, permission matrix, role hierarchy
- `/trust/iam/permissions` — atomic permission inventory
- `/trust/iam/groups` — team groupings (Support, Finance, Engineering)

**Granular roles to define (replace single `SUPER_ADMIN`):**

```
PLATFORM_ENGINEER, SRE, PLATFORM_ADMIN
FINANCE_ANALYST, FINANCE_ADMIN, REVOPS
SUPPORT_AGENT, SUPPORT_LEAD, CSM, CS_DIRECTOR
TRUST_ANALYST, LEGAL_COUNSEL, SECURITY_ENGINEER, COMPLIANCE_ADMIN
SALES_REP, SALES_MANAGER, MARKETING_OPS, PARTNER_OPS
EXECUTIVE  (read-only across pillars)
ROOT       (everything — emergency only, requires hardware key)
```

### 4.2 Just-in-Time Access

**Pages:**
- `/trust/jit/request` — request elevated access (target permission, reason, duration)
- `/trust/jit/pending` — pending approvals queue
- `/trust/jit/active` — currently elevated sessions across the org
- `/trust/jit/audit` — historical elevations

**Approval rules:**
- Request must include reason + business justification
- Approval required from a different person (no self-approval)
- ROOT requires two approvers + hardware key
- Auto-expires after requested duration (max 4h)
- Every elevated action double-tagged in AuditLog

### 4.3 Audit Log

**Pages:**
- `/trust/audit` — searchable audit log (actor, action, target, timestamp, diff)
- `/trust/audit/timeline` — timeline view filtered by tenant or actor
- `/trust/audit/export` — SOC 2 evidence export (date range → CSV/JSON)
- `/trust/audit/integrity` — log integrity verification (hash chain)

**Filters:** actor, action, target tenant, target type, time range, free-text search.

### 4.4 Compliance Operations

**Pages:**
- `/trust/compliance/dsar` — Data Subject Access Request queue (GDPR Art. 15, 17, 20)
- `/trust/compliance/dsar/:id` — DSAR detail, deadline (30 days), evidence collection, response builder
- `/trust/compliance/legal-hold` — legal hold list, scope, expiry
- `/trust/compliance/legal-hold/:id` — affected tenants/users/data
- `/trust/compliance/exports` — bulk data exports (with approval workflow)
- `/trust/compliance/dpa` — DPA tracking per tenant
- `/trust/compliance/subpoenas` — subpoena response workflow

**DSAR workflow:**

```
RECEIVED → IDENTITY_VERIFIED → DATA_GATHERED → REVIEWED →
RESPONSE_DRAFTED → APPROVED → DELIVERED → CLOSED
                                              ↓
                                         (SLA: 30 days)
```

### 4.5 Trust & Safety

**Pages:**
- `/trust/safety/fraud` — fraud signals queue (suspicious signups, payment fraud, velocity flags)
- `/trust/safety/aup` — AUP violation queue (illegal content, spam, abuse reports)
- `/trust/safety/suspensions` — suspended tenants, reason, appeals
- `/trust/safety/appeals` — appeal queue + resolution
- `/trust/safety/rules` — fraud rule engine configuration

### 4.6 KYC & Sanctions

**Pages:**
- `/trust/kyc/pending` — KYC verification queue (enterprise tenants only)
- `/trust/kyc/:id` — verification detail, document review
- `/trust/kyc/sanctions` — sanctions screening (OFAC, UN, EU lists)
- `/trust/kyc/pep` — Politically Exposed Persons screening

### 4.7 Secret Management

**Pages:**
- `/trust/secrets` — credential inventory (Stripe, Twilio, carriers, accounting) with rotation status
- `/trust/secrets/expiring` — expiring within 30 days alert list
- `/trust/secrets/audit` — secret access audit (who used what, when)

**Rules:** secret values are NEVER displayed. Only metadata (created, rotated, expires, last accessed).

### 4.8 Security Monitoring

**Pages:**
- `/trust/security/anomalies` — anomaly detection queue (login from new country, mass data export, bulk deletion)
- `/trust/security/logins` — failed login monitoring
- `/trust/security/ip-blocks` — IP blocklist management
- `/trust/security/sessions` — active staff sessions, revoke

---

## 9. Pillar 5 — Go-to-Market Operations

**Audience:** Sales, Marketing, Partnerships
**Default role:** `SALES_REP`, `SALES_MANAGER`, `MARKETING_OPS`, `PARTNER_OPS`
**Brand accent:** `#D97706` (Fauward amber)

### Services

| # | Service | Route | Purpose |
|---|---|---|---|
| 5.1 | Sales Pipeline | `/gtm/pipeline` | Deals, stages, conversion |
| 5.2 | Trial Management | `/gtm/trials` | Active trials, conversion tracking |
| 5.3 | Demo Environment Mgr | `/gtm/demos` | Provision/teardown demo tenants |
| 5.4 | CPQ & Contracts | `/gtm/contracts` | Quotes, approvals, MSAs |
| 5.5 | Partner Portal Mgmt | `/gtm/partners` | Resellers, deal registration |
| 5.6 | Marketing Attribution | `/gtm/attribution` | Signup source, campaigns |
| 5.7 | Pricing Experiments | `/gtm/pricing` | A/B tests on pricing |
| 5.8 | Sales Handoff | `/gtm/handoff` | Trial → paid → CS handoff |

### 5.1 Sales Pipeline

Buy: integrate with **HubSpot** or **Salesforce**. Embed views, deep-link out for editing.

**Pages:**
- `/gtm/pipeline` — pipeline kanban (PROSPECT → QUALIFIED → DEMO → PROPOSAL → NEGOTIATION → WON/LOST)
- `/gtm/pipeline/:dealId` — deal detail with linked tenant, contacts, activities
- `/gtm/pipeline/forecasting` — quarterly forecast vs target

### 5.2 Trial Management

**Pages:**
- `/gtm/trials` — active trials (Tenant | Started | Days Left | Activation Score | Owner)
- `/gtm/trials/:tenantId` — trial detail, activation events, intervention queue
- `/gtm/trials/expiring` — trials expiring next 7 days
- `/gtm/trials/extensions` — extension requests + approvals

### 5.3 Demo Environment Manager

**Pages:**
- `/gtm/demos` — demo tenant inventory (named: `demo-acme`, `demo-pitch-mvp`)
- `/gtm/demos/create` — provision new demo tenant (template, seed data, expiry)
- `/gtm/demos/:id` — demo detail, refresh data, share link, extend, destroy
- `/gtm/demos/templates` — demo template catalogue

### 5.4 CPQ & Contracts

**Pages:**
- `/gtm/contracts/quotes` — quote builder, approval workflow
- `/gtm/contracts/quotes/:id` — quote detail, approvals
- `/gtm/contracts/discounts` — discount approval queue (>10% requires manager, >25% requires director)
- `/gtm/contracts/msas` — MSA repository (DocuSign integration)

### 5.5 Partner Portal Management

**Pages:**
- `/gtm/partners` — partner directory (referral, reseller, technology)
- `/gtm/partners/:id` — partner detail, deals, commissions, performance
- `/gtm/partners/applications` — partner applications queue
- `/gtm/partners/deal-registration` — partner-registered deals

### 5.6 Marketing Attribution

**Pages:**
- `/gtm/attribution` — signup source dashboard (organic, paid, partner, referral)
- `/gtm/attribution/campaigns` — campaign performance
- `/gtm/attribution/funnel` — visit → signup → activation → paid funnel
- `/gtm/attribution/landing-pages` — landing page performance + experiments

### 5.7 Pricing Experiments

**Pages:**
- `/gtm/pricing/experiments` — active and historical pricing tests
- `/gtm/pricing/experiments/:id` — experiment detail (variant, conversion, lift, significance)
- `/gtm/pricing/plans` — plan editor (price, features, limits)

### 5.8 Sales Handoff

**Pages:**
- `/gtm/handoff/won` — newly-won deals awaiting CS handoff
- `/gtm/handoff/onboarding-queue` — handed-off accounts in active onboarding
- `/gtm/handoff/templates` — handoff document templates

---

## 10. Cross-Cutting Systems

### 10.1 Authentication

```
Google SSO ─┐
            ├─→  staff_session (HTTP-only cookie, 8h sliding) ─→  RBAC middleware
TOTP ───────┤
            │
Hardware ───┘
key (root)
```

`packages/internal-auth/` exports:
- `useStaffSession()` — current staff user, role, permissions
- `requirePermission(perm)` — route guard
- `<RoleGate roles={[...]}>` — component-level gate

### 10.2 RBAC (`packages/internal-rbac`)

Permissions are atomic, services compose them:

```typescript
type Permission =
  | 'platform.tenants.read' | 'platform.tenants.write'
  | 'platform.tenants.suspend' | 'platform.tenants.delete'
  | 'platform.impersonation.start' | 'platform.impersonation.mutate'
  | 'platform.flags.read' | 'platform.flags.write'
  | 'revenue.invoices.read' | 'revenue.invoices.write'
  | 'revenue.invoices.refund' | 'revenue.invoices.refund.large' // > £500
  // ... full inventory in /packages/internal-rbac/src/permissions.ts
  ;

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPPORT_AGENT: [
    'platform.tenants.read',
    'customer.support.*',
    'customer.360.read',
    'platform.impersonation.start', // not mutate
  ],
  // ...
};
```

### 10.3 Audit Log (`packages/internal-audit`)

Every mutating API call passes through `auditMiddleware` which writes:

```typescript
{
  id: string;
  timestamp: Date;
  actor_id: string;        // staff user
  actor_role: Role;
  action: string;          // 'tenant.suspend', 'invoice.refund', etc.
  target_type: string;     // 'tenant', 'invoice', 'user'
  target_id: string;
  before: JsonValue | null;
  after: JsonValue | null;
  reason: string | null;   // required for sensitive actions
  ip_address: string;
  session_id: string;
  jit_session_id: string | null;  // if performed under JIT elevation
}
```

Hash-chained for tamper evidence (each entry's hash = `sha256(prev_hash + entry)`).

### 10.4 Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│  FAUWARD CONSOLE   [search ⌘K]     [pillar▾]  [on-call●]  [user▾]   │
├──────────┬──────────────────────────────────────────────────────────┤
│          │                                                          │
│ pillar   │   page content                                           │
│ sidebar  │   (compact, dense, dark-mode-capable)                    │
│          │                                                          │
│ Service  │                                                          │
│ Service  │                                                          │
│ Service  │                                                          │
│ ...      │                                                          │
│          │                                                          │
└──────────┴──────────────────────────────────────────────────────────┘
```

The sidebar updates per pillar — when in `/platform/*`, sidebar shows all 9 platform services. When in `/revenue/*`, shows 8 revenue services. Top bar pillar dropdown switches contexts.

### 10.5 Shared Internal UI (`packages/internal-ui`)

Components built for density, not polish:

- `<DenseTable>` — sticky header, virtualised rows, column resize, multi-sort
- `<FilterBar>` — facet filters, search, save view
- `<MonoCell>` — JetBrains Mono with copy-on-click for IDs/keys/timestamps
- `<DiffViewer>` — before/after JSON diff for audit log
- `<ReasonModal>` — required-reason confirmation modal for mutating actions
- `<JITGate>` — wraps an action; if missing permission, prompts JIT request
- `<ImpersonationBanner>` — shown across all surfaces during impersonation
- `<HealthPill>` — green/amber/red with tooltip
- `<ActorChip>` — staff user with role badge
- `<TenantChip>` — tenant link that opens Customer 360

---

## 11. Data Model Additions

New tables to add to `schema.prisma`:

```prisma
// === Internal IAM ===
model StaffUser {
  id            String   @id @default(cuid())
  email         String   @unique
  name          String
  ssoProvider   String   // 'google' | 'totp' | 'root'
  status        StaffStatus @default(ACTIVE)
  mfaEnabled    Boolean  @default(false)
  hardwareKeyId String?
  createdAt     DateTime @default(now())
  lastLoginAt   DateTime?

  roleAssignments StaffRoleAssignment[]
  sessions        StaffSession[]
  auditEntries    AuditLog[]
  jitRequests     JitAccessRequest[]
}

model StaffRole {
  id          String   @id
  name        String
  description String
  permissions String[] // array of Permission strings
  isSystem    Boolean  @default(false)
}

model StaffRoleAssignment {
  id        String    @id @default(cuid())
  staffId   String
  roleId    String
  grantedBy String
  grantedAt DateTime  @default(now())
  expiresAt DateTime?

  staff StaffUser @relation(fields: [staffId], references: [id])
  role  StaffRole @relation(fields: [roleId], references: [id])
}

model StaffSession {
  id          String   @id @default(cuid())
  staffId    String
  ipAddress   String
  userAgent   String
  startedAt   DateTime @default(now())
  expiresAt   DateTime
  revokedAt   DateTime?

  staff StaffUser @relation(fields: [staffId], references: [id])
}

// === JIT Access ===
model JitAccessRequest {
  id           String   @id @default(cuid())
  requesterId  String
  permission   String
  reason       String
  duration     Int      // seconds
  status       JitStatus @default(PENDING)
  approverId   String?
  approvedAt   DateTime?
  expiresAt    DateTime?
  createdAt    DateTime @default(now())

  requester StaffUser @relation(fields: [requesterId], references: [id])
}

// === Audit (extends existing AuditLog) ===
// Add fields: actor_role, jit_session_id, hash, prev_hash

// === Impersonation ===
model ImpersonationSession {
  id          String   @id @default(cuid())
  staffId     String
  tenantId    String
  reason      String
  reasonType  String   // 'support' | 'bug' | 'investigation' | 'request'
  startedAt   DateTime @default(now())
  endedAt     DateTime?
  expiresAt   DateTime  // startedAt + 30min
  recordingUrl String?
}

// === Compliance ===
model DSARRequest {
  id              String      @id @default(cuid())
  tenantId        String?
  subjectEmail    String
  type            DSARType    // ACCESS | ERASURE | PORTABILITY | RECTIFICATION
  status          DSARStatus  @default(RECEIVED)
  receivedAt      DateTime    @default(now())
  deadline        DateTime    // received + 30 days
  resolvedAt      DateTime?
  assignedToId    String?
  evidenceLinks   Json?
}

model LegalHold {
  id          String   @id @default(cuid())
  name        String
  scope       Json     // { tenantIds: [], userIds: [], dataTypes: [] }
  reason      String
  startedAt   DateTime @default(now())
  expiresAt   DateTime?
  createdById String
}

// === Trust & Safety ===
model FraudSignal {
  id          String   @id @default(cuid())
  tenantId    String?
  signalType  String   // 'velocity' | 'identity' | 'payment' | 'content'
  severity    Severity
  payload     Json
  status      SignalStatus @default(OPEN)
  resolvedAt  DateTime?
  resolvedBy  String?
  createdAt   DateTime @default(now())
}

// === CS / Health ===
model TenantHealthScore {
  id           String   @id @default(cuid())
  tenantId     String   @unique
  score        Int      // 0-100
  factors      Json     // breakdown by factor
  computedAt   DateTime @default(now())
  trend        String   // 'up' | 'flat' | 'down'
}

model CSPlaybookRun {
  id           String   @id @default(cuid())
  playbookId   String
  tenantId     String
  status       String   // 'running' | 'paused' | 'completed' | 'failed'
  startedAt    DateTime @default(now())
  completedAt  DateTime?
  steps        Json     // step-by-step state
}

// === Demo / Trial ===
model DemoTenant {
  id           String   @id @default(cuid())
  name         String
  templateId   String
  ownerId      String   // sales rep
  expiresAt    DateTime
  shareToken   String   @unique
  createdAt    DateTime @default(now())
}

// Enums
enum StaffStatus { ACTIVE SUSPENDED OFFBOARDED }
enum JitStatus { PENDING APPROVED DENIED EXPIRED USED }
enum DSARType { ACCESS ERASURE PORTABILITY RECTIFICATION }
enum DSARStatus { RECEIVED IDENTITY_VERIFIED DATA_GATHERED REVIEWED RESPONSE_DRAFTED APPROVED DELIVERED CLOSED }
enum Severity { LOW MEDIUM HIGH CRITICAL }
enum SignalStatus { OPEN INVESTIGATING RESOLVED FALSE_POSITIVE }
```

---

## 12. Routing & URL Map

```
/login
/                                       → pillar dashboard

/platform                               → pillar overview
/platform/tenants                       → service: control plane
/platform/tenants/:id
/platform/tenants/:id/quotas
/platform/tenants/:id/lifecycle
/platform/impersonation
/platform/impersonation/sessions
/platform/impersonation/sessions/:id
/platform/flags
/platform/flags/:key
/platform/flags/:key/audit
/platform/releases
/platform/queues
/platform/queues/:name
/platform/queues/:name/dlq
/platform/queues/:name/consumers
/platform/incidents
/platform/incidents/:id
/platform/incidents/:id/postmortem
/platform/incidents/runbooks
/platform/health
/platform/health/services
/platform/health/regions
/platform/health/budget
/platform/jobs
/platform/jobs/:id
/platform/jobs/:id/triggers
/platform/integrations
/platform/integrations/:provider
/platform/integrations/credentials
/platform/integrations/webhooks
/platform/database/migrations
/platform/database/slow-queries
/platform/database/schema
/platform/database/connections

/revenue                                → pillar overview
/revenue/billing/invoices
/revenue/billing/invoices/:id
/revenue/billing/invoices/create
/revenue/billing/credit-notes
/revenue/billing/refunds
/revenue/billing/payments
/revenue/dunning
/revenue/dunning/:tenantId
/revenue/dunning/sequences
/revenue/dunning/save-offers
/revenue/subscriptions
/revenue/subscriptions/:id
/revenue/subscriptions/contracts
/revenue/subscriptions/overrides
/revenue/disputes
/revenue/disputes/:id
/revenue/disputes/analytics
/revenue/tax
/revenue/tax/returns
/revenue/tax/registrations
/revenue/tax/exemptions
/revenue/recognition
/revenue/recognition/schedules
/revenue/recognition/journal
/revenue/recognition/reports
/revenue/commissions
/revenue/commissions/payouts
/revenue/commissions/:partnerId
/revenue/commissions/disputes
/revenue/analytics
/revenue/analytics/movement
/revenue/analytics/cohorts
/revenue/analytics/by-plan
/revenue/analytics/forecasts

/customer                               → pillar overview
/customer/support
/customer/support/sla
/customer/support/macros
/customer/360/:tenantId
/customer/success
/customer/success/at-risk
/customer/success/expansion
/customer/success/playbooks
/customer/success/playbooks/:id/runs
/customer/success/health-scoring
/customer/feedback/nps
/customer/feedback/responses
/customer/feedback/themes
/customer/feedback/surveys
/customer/kb/internal
/customer/kb/external
/customer/kb/drafts
/customer/kb/analytics
/customer/comms/email
/customer/comms/banners
/customer/comms/maintenance
/customer/comms/history
/customer/qbr
/customer/qbr/:tenantId
/customer/qbr/templates
/customer/onboarding
/customer/onboarding/:tenantId
/customer/onboarding/blockers

/trust                                  → pillar overview
/trust/iam/users
/trust/iam/users/:id
/trust/iam/roles
/trust/iam/permissions
/trust/iam/groups
/trust/jit/request
/trust/jit/pending
/trust/jit/active
/trust/jit/audit
/trust/audit
/trust/audit/timeline
/trust/audit/export
/trust/audit/integrity
/trust/compliance/dsar
/trust/compliance/dsar/:id
/trust/compliance/legal-hold
/trust/compliance/legal-hold/:id
/trust/compliance/exports
/trust/compliance/dpa
/trust/compliance/subpoenas
/trust/safety/fraud
/trust/safety/aup
/trust/safety/suspensions
/trust/safety/appeals
/trust/safety/rules
/trust/kyc/pending
/trust/kyc/:id
/trust/kyc/sanctions
/trust/kyc/pep
/trust/secrets
/trust/secrets/expiring
/trust/secrets/audit
/trust/security/anomalies
/trust/security/logins
/trust/security/ip-blocks
/trust/security/sessions

/gtm                                    → pillar overview
/gtm/pipeline
/gtm/pipeline/:dealId
/gtm/pipeline/forecasting
/gtm/trials
/gtm/trials/:tenantId
/gtm/trials/expiring
/gtm/trials/extensions
/gtm/demos
/gtm/demos/create
/gtm/demos/:id
/gtm/demos/templates
/gtm/contracts/quotes
/gtm/contracts/quotes/:id
/gtm/contracts/discounts
/gtm/contracts/msas
/gtm/partners
/gtm/partners/:id
/gtm/partners/applications
/gtm/partners/deal-registration
/gtm/attribution
/gtm/attribution/campaigns
/gtm/attribution/funnel
/gtm/attribution/landing-pages
/gtm/pricing/experiments
/gtm/pricing/experiments/:id
/gtm/pricing/plans
/gtm/handoff/won
/gtm/handoff/onboarding-queue
/gtm/handoff/templates
```

---

## 13. Concrete File Tree

```
apps/super-admin/
├── package.json
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── index.html
└── src/
    ├── main.tsx
    ├── router.tsx                          # top-level routes + pillar routes
    ├── index.css
    │
    ├── shell/
    │   ├── ShellLayout.tsx                 # top bar + pillar sidebar + outlet
    │   ├── TopBar.tsx
    │   ├── PillarSidebar.tsx               # context-aware per pillar
    │   ├── CommandPalette.tsx              # Cmd+K global search
    │   ├── LoginPage.tsx
    │   ├── PillarDashboard.tsx             # the entry view (5 cards)
    │   └── PillarOverviewPage.tsx          # generic pillar overview shell
    │
    ├── pillars/
    │   ├── platform/
    │   │   ├── index.ts                    # pillar manifest (services, routes, perms)
    │   │   ├── PlatformOverview.tsx
    │   │   ├── tenants/
    │   │   │   ├── TenantsListPage.tsx
    │   │   │   ├── TenantDetailPage.tsx
    │   │   │   ├── TenantQuotasPage.tsx
    │   │   │   ├── TenantLifecyclePage.tsx
    │   │   │   ├── components/
    │   │   │   ├── hooks/
    │   │   │   └── api.ts
    │   │   ├── impersonation/
    │   │   ├── flags/
    │   │   ├── queues/
    │   │   ├── incidents/
    │   │   ├── health/
    │   │   ├── jobs/
    │   │   ├── integrations/
    │   │   └── database/
    │   │
    │   ├── revenue/
    │   │   ├── index.ts
    │   │   ├── RevenueOverview.tsx
    │   │   ├── billing/
    │   │   ├── dunning/
    │   │   ├── subscriptions/
    │   │   ├── disputes/
    │   │   ├── tax/
    │   │   ├── recognition/
    │   │   ├── commissions/
    │   │   └── analytics/
    │   │
    │   ├── customer/
    │   │   ├── index.ts
    │   │   ├── CustomerOverview.tsx
    │   │   ├── support/
    │   │   ├── customer360/
    │   │   ├── success/
    │   │   ├── feedback/
    │   │   ├── kb/
    │   │   ├── comms/
    │   │   ├── qbr/
    │   │   └── onboarding/
    │   │
    │   ├── trust/
    │   │   ├── index.ts
    │   │   ├── TrustOverview.tsx
    │   │   ├── iam/
    │   │   ├── jit/
    │   │   ├── audit/
    │   │   ├── compliance/
    │   │   ├── safety/
    │   │   ├── kyc/
    │   │   ├── secrets/
    │   │   └── security/
    │   │
    │   └── gtm/
    │       ├── index.ts
    │       ├── GtmOverview.tsx
    │       ├── pipeline/
    │       ├── trials/
    │       ├── demos/
    │       ├── contracts/
    │       ├── partners/
    │       ├── attribution/
    │       ├── pricing/
    │       └── handoff/
    │
    ├── lib/
    │   ├── api.ts                          # axios client with audit headers
    │   ├── query-client.ts
    │   ├── auth.ts
    │   ├── rbac.ts                         # re-exports from @fauward/internal-rbac
    │   └── format.ts
    │
    ├── components/                         # local-only, app-specific
    │   └── (very few — most are in @fauward/internal-ui)
    │
    └── types/
        └── (shared types)

packages/
├── internal-rbac/
│   └── src/
│       ├── permissions.ts                  # Permission inventory
│       ├── roles.ts                        # Role → Permission[] mapping
│       ├── guards.ts                       # requirePermission, RoleGate
│       └── index.ts
│
├── internal-audit/
│   └── src/
│       ├── client.ts                       # writeAudit()
│       ├── middleware.ts                   # audit middleware (Express/Hono)
│       ├── components.tsx                  # <DiffViewer>, <AuditEntry>
│       └── index.ts
│
└── internal-ui/
    └── src/
        ├── DenseTable.tsx
        ├── FilterBar.tsx
        ├── MonoCell.tsx
        ├── ReasonModal.tsx
        ├── JITGate.tsx
        ├── HealthPill.tsx
        ├── ActorChip.tsx
        ├── TenantChip.tsx
        ├── ImpersonationBanner.tsx
        └── index.ts
```

### Pillar manifest pattern

Each pillar exports an `index.ts` describing itself. The shell uses these manifests to build the dashboard, sidebar, and routes — adding a new service is a one-file change.

```typescript
// apps/super-admin/src/pillars/platform/index.ts
import type { PillarManifest } from '../../types/pillar';

export const platformPillar: PillarManifest = {
  id: 'platform',
  name: 'Platform Operations',
  description: 'Reliability of the product itself',
  accentColor: '#2563EB',
  icon: 'Server',
  defaultRoles: ['PLATFORM_ENGINEER', 'SRE', 'PLATFORM_ADMIN'],
  services: [
    {
      id: 'tenants',
      name: 'Tenant Control Plane',
      route: '/platform/tenants',
      description: 'Directory, lifecycle, plan/quota',
      icon: 'Building2',
      requiredPermission: 'platform.tenants.read',
      liveBadge: 'tenant_count',
    },
    {
      id: 'impersonation',
      name: 'Impersonation Center',
      route: '/platform/impersonation',
      description: 'Time-bound view-as with reason logging',
      icon: 'Eye',
      requiredPermission: 'platform.impersonation.start',
    },
    // ... 7 more services
  ],
};
```

---

## 14. Build Phasing

You're at ~12 tenants now, projecting 260 by Month 24. Don't build all 41 services at once. Build the shell + the highest-pain services first, iterate.

### Phase 0 — Inventory & Shell (1–2 weeks)

**Step 0a: Inventory the existing super-admin (mandatory, no code yet).**

Before any file is moved or created, produce `apps/super-admin/INVENTORY.md` documenting:
- Every page file under `src/features/` (or wherever they currently live), its route, and its purpose
- Every component in `src/components/` and where it's used
- Every hook in `src/hooks/` and what data it fetches
- The API client config (base URL, interceptors, auth headers)
- React Query setup (cache keys, default options)
- The current auth flow (login page, session storage, route guards, role check)
- Any environment variables required
- Direct dependencies on `@fauward/*` workspace packages

This inventory is the source of truth for the migration. It is reviewed before Step 0b begins.

**Step 0b: Build the shell (additive, no deletions).**

- Add `src/shell/` (pillar dashboard, top bar, pillar sidebar, command palette, login)
- Add `src/pillars/{platform,revenue,customer,trust,gtm}/` with empty pillar manifests and overview pages
- Wire the new router so existing routes keep working alongside new pillar routes
- Existing `src/features/` and existing routes remain functional during transition

**Step 0c: Create the three new packages.**

- `@fauward/internal-rbac` — permission inventory + role mapping + guards
- `@fauward/internal-ui` — `DenseTable`, `MonoCell`, `ReasonModal`, `HealthPill` (extracted from existing `src/components/` where applicable)
- `@fauward/internal-audit` — audit writer + `<DiffViewer>` + `<AuditEntry>`

**Step 0d: Migrate the 7 existing pages into the Platform pillar.**

Follow the migration map in [Appendix D](#appendix-d--migration-from-existing-super-admin) exactly. For each page:
1. Move file (don't rewrite)
2. Update imports
3. Update route in router
4. Add legacy redirect from old route to new route
5. Verify in browser
6. Commit

Only after all 7 pages have been moved and verified does the old `src/features/` folder get removed.

**Step 0e: Replace `SUPER_ADMIN` role check at every guard with the new RBAC permission check.** This is preparation for Phase 1's IAM work — even with one role today, the indirection layer goes in now.

### Phase 1 — Foundation (next 2–4 weeks)

Highest-pain gaps that block the business:

1. **4.1 Employee IAM** — granular roles, replace single `SUPER_ADMIN`
2. **4.3 Audit Log** — searchable audit, hash-chained
3. **2.1 Billing Console** — manual invoices, refunds, credits
4. **3.2 Customer 360** — unified tenant view (consumed by every other pillar)

### Phase 2 — At ~50 tenants

Support starts hurting, churn becomes measurable:

5. **3.1 Support Desk** — Zendesk integration
6. **3.3 CS Console** — health scoring + at-risk queue
7. **2.2 Dunning Manager**
8. **1.5 Incident Management** — PagerDuty integration

### Phase 3 — At ~100 tenants

Compliance and security start mattering for enterprise:

9. **4.2 Just-in-Time Access**
10. **4.4 Compliance Operations** — DSAR workflow (required for GDPR)
11. **4.5 Trust & Safety** — fraud signals, suspensions
12. **1.3 Feature Flags** — LaunchDarkly integration

### Phase 4 — Pre-SOC 2 audit

13. **4.7 Secret Management**
14. **4.8 Security Monitoring**
15. **4.6 KYC & Sanctions**
16. **1.8 Integration Health** — credential rotation
17. **2.5 Tax & Compliance** — full RegionalProfile coverage

### Phase 5 — First enterprise deal

18. **2.3 Subscription Manager** — custom contracts
19. **5.4 CPQ & Contracts**
20. **3.7 QBR Center**

### Phase 6 — Scale & GTM

21. **5.1 Sales Pipeline** — HubSpot integration
22. **5.5 Partner Portal Mgmt**
23. **2.7 Reseller Commissions**
24. **5.6 Marketing Attribution**
25. Remaining services

---

## Appendix A — Buy vs Build Decisions

| Service | Decision | Vendor (if buy) | Build cost | Reasoning |
|---|---|---|---|---|
| Feature Flags | Buy | LaunchDarkly / Statsig | High | Solved problem, complex correctly |
| Incident Mgmt | Buy + thin layer | PagerDuty / Incident.io | Med | Vendor for paging, build tenant-impact map |
| Support Desk | Buy + deep links | Zendesk / Plain / Intercom | High | Massive feature surface |
| Sales Pipeline | Buy | HubSpot / Salesforce | Very high | Don't build a CRM |
| Observability | Buy | Datadog / Grafana | Very high | Don't build monitoring |
| Email mass send | Buy + UI | Customer.io / Loops | Med | Deliverability is hard |
| Status page | Buy | Statuspage / Instatus | Low | Not differentiating |
| KYC | Buy | Persona / Sumsub / Onfido | High | Compliance complexity |
| Sanctions screening | Buy | ComplyAdvantage / Sanction.io | High | Lists are licensed |
| Quote/Contract | Build thin + Buy signing | DocuSign for signing | Med | Quote logic is yours |
| Tenant Control Plane | Build | — | Med | Core product knowledge |
| Customer 360 | Build | — | Med | Pulls from your own data |
| CS Health Scoring | Build | — | Med | Domain-specific factors |
| Dunning | Build (over Stripe) | — | Low | Stripe handles retry; you handle comms/save |
| Audit Log | Build | — | Low | Must be tightly integrated |
| Employee IAM | Build (Auth0/WorkOS optional) | WorkOS | Low–Med | Can buy SSO, build RBAC |
| DSAR Workflow | Build | — | Med | Domain-specific, audit-heavy |
| Demo Env Mgr | Build | — | Low | Wraps your provisioning |

---

## Appendix B — Example Pillar Manifest Type

```typescript
// apps/super-admin/src/types/pillar.ts

export interface ServiceManifest {
  id: string;
  name: string;
  route: string;
  description: string;
  icon: string;                   // Lucide icon name
  requiredPermission: string;
  liveBadge?:                     // for dashboard count badges
    | 'tenant_count'
    | 'open_incidents'
    | 'failed_payments'
    | 'open_tickets'
    | 'pending_dsar'
    | 'expiring_trials'
    | 'dlq_depth';
}

export interface PillarManifest {
  id: 'platform' | 'revenue' | 'customer' | 'trust' | 'gtm';
  name: string;
  description: string;
  accentColor: string;            // hex
  icon: string;                   // Lucide icon
  defaultRoles: Role[];
  services: ServiceManifest[];
}
```

---

## Appendix C — Login → Dashboard Flow

```
┌────────────┐
│   /login   │
└─────┬──────┘
      │ Google SSO (or TOTP)
      ▼
┌─────────────────┐
│ POST /auth      │
│ /staff/sso      │
└─────┬───────────┘
      │ Set-Cookie: staff_session
      ▼
┌─────────────────┐
│ GET /api/me     │ → { id, email, roles, permissions }
└─────┬───────────┘
      ▼
┌─────────────────────────────────────────────────┐
│ /                                               │
│ <PillarDashboard>                               │
│   ↳ for each pillar in PILLARS                  │
│      ↳ <PillarCard pillar={p}>                  │
│         ↳ filter services by user permissions   │
│         ↳ fetch live badges in parallel         │
│         ↳ render service list + counts          │
└─────────────────────────────────────────────────┘
      │
      │ user clicks Pillar
      ▼
┌─────────────────────────────────────────────────┐
│ /platform                                       │
│ <PillarOverviewPage pillar={platformPillar}>    │
│   ↳ PillarSidebar shows 9 services              │
│   ↳ Service grid with last-activity column      │
└─────────────────────────────────────────────────┘
      │
      │ user clicks Service
      ▼
┌─────────────────────────────────────────────────┐
│ /platform/queues                                │
│ <QueuesListPage>                                │
│   ↳ Sidebar still shows pillar's services       │
│   ↳ Queue Operations is highlighted             │
└─────────────────────────────────────────────────┘
```

---

## Appendix D — Migration from Existing super-admin

The existing `apps/super-admin/` is a working Vite + React 18 + Tailwind app with 7 pages, a configured API client, React Query setup, and auth wired to `staff_session` cookies. **It is not torn down — it is refactored in-place.**

### D.1 Existing → New mapping

The 7 existing pages all migrate into Pillar 1 (Platform Operations). Map:

| # | Existing route | Existing file (likely path) | New route | New file location |
|---|---|---|---|---|
| 1 | `/admin` (Dashboard) | `src/features/dashboard/DashboardPage.tsx` | **Replaced by `/` (pillar dashboard)**. Metric cards + alerts move to `/platform` (pillar overview). | `src/shell/PillarDashboard.tsx` (new) + `src/pillars/platform/PlatformOverview.tsx` (absorbs metrics/alerts) |
| 2 | `/admin/tenants` | `src/features/tenants/TenantsPage.tsx` | `/platform/tenants` | `src/pillars/platform/tenants/TenantsListPage.tsx` |
| 3 | `/admin/tenants/:id` | `src/features/tenants/TenantDetailPage.tsx` | `/platform/tenants/:id` | `src/pillars/platform/tenants/TenantDetailPage.tsx` |
| 4 | `/admin/revenue` | `src/features/revenue/RevenueAnalyticsPage.tsx` | `/revenue/analytics` (moves to **Pillar 2**) | `src/pillars/revenue/analytics/RevenueAnalyticsPage.tsx` |
| 5 | `/admin/system` | `src/features/system/SystemHealthPage.tsx` | `/platform/health` | `src/pillars/platform/health/SystemHealthPage.tsx` |
| 6 | `/admin/queues` | `src/features/queues/QueuesPage.tsx` | `/platform/queues` | `src/pillars/platform/queues/QueuesListPage.tsx` |
| 7 | `/admin/impersonation` | `src/features/impersonation/ImpersonationPage.tsx` | `/platform/impersonation` | `src/pillars/platform/impersonation/ImpersonationStartPage.tsx` |

> Run the inventory in Phase 0 Step 0a to confirm exact filenames — paths above are the most likely locations based on the master spec, but Codex must verify against the actual repo.

### D.2 What gets preserved verbatim

These do **not** get rewritten in Phase 0:

| Existing artefact | Treatment |
|---|---|
| `src/main.tsx` | Edit to use new router; keep React Query provider, BrowserRouter, StrictMode |
| `src/lib/api.ts` (axios instance) | Keep entirely. Extend with audit headers later in Phase 1. |
| `src/lib/query-client.ts` | Keep entirely. |
| Auth flow (login page + session cookie + 401 handler) | Keep. Add new RBAC permission checks as a layer on top. |
| Existing components (`Button`, `Badge`, `Input`, `StatCard`, `UsageMeter`, etc.) | Keep. Reference from new pillar pages. Migrate the dense-table-style ones into `@fauward/internal-ui` over time, keep app-specific ones in place. |
| Tailwind config and CSS variables | Keep. Add pillar accent colors as new tokens. |
| Existing TypeScript types | Keep. Add new types for staff/RBAC/audit/etc. without breaking existing imports. |
| Tests, if any | Keep passing. Update import paths only. |

### D.3 What gets renamed or restructured

| Change | Reason |
|---|---|
| `src/features/` → distributed into `src/pillars/{pillarId}/{serviceId}/` | Pillar-based organisation |
| Single `SUPER_ADMIN` role check → `requirePermission('platform.tenants.read')` etc. | Granular RBAC |
| `/admin/*` routes → `/platform/*`, `/revenue/*` etc. | Pillar-based routing |
| Top-level Dashboard at `/admin` → Pillar Dashboard at `/` | New entry point |

### D.4 Legacy route redirects (mandatory)

For every old URL, add a server-side or client-side redirect. Bookmarks and Slack links must keep working:

```typescript
// src/router.tsx — legacy redirects
const legacyRedirects = [
  { from: '/admin',                  to: '/' },
  { from: '/admin/tenants',          to: '/platform/tenants' },
  { from: '/admin/tenants/:id',      to: '/platform/tenants/:id' },
  { from: '/admin/revenue',          to: '/revenue/analytics' },
  { from: '/admin/system',           to: '/platform/health' },
  { from: '/admin/queues',           to: '/platform/queues' },
  { from: '/admin/impersonation',    to: '/platform/impersonation' },
];
```

### D.5 Migration commit sequence

Each item below is a separate commit. Each commit must build, lint, and pass type-check.

```
1. chore(super-admin): inventory existing app          (adds INVENTORY.md only)
2. feat(internal-rbac): scaffold package               (no usages yet)
3. feat(internal-ui): scaffold package + extract DenseTable
4. feat(internal-audit): scaffold package
5. feat(super-admin): add shell layout + pillar dashboard at /
6. feat(super-admin): add 5 pillar overview pages (empty service grids)
7. refactor(super-admin): move tenants pages → pillars/platform/tenants/
8. refactor(super-admin): move revenue analytics → pillars/revenue/analytics/
9. refactor(super-admin): move system health → pillars/platform/health/
10. refactor(super-admin): move queues → pillars/platform/queues/
11. refactor(super-admin): move impersonation → pillars/platform/impersonation/
12. refactor(super-admin): port dashboard metrics into PlatformOverview
13. feat(super-admin): add legacy /admin/* redirects
14. chore(super-admin): remove now-empty src/features/
15. refactor(super-admin): replace SUPER_ADMIN checks with permission gates
```

After commit 15, Phase 0 is complete and Phase 1 can begin.

### D.6 What to do if the inventory disagrees with this spec

The inventory is the truth. If a file is in a different path, has a different name, or implements behaviour not described above:

1. Document the discrepancy in `INVENTORY.md`
2. Update the migration table (D.1) for the actual paths
3. Preserve actual behaviour over the spec's assumed behaviour
4. Flag any genuine architectural conflict for human review before proceeding

---

## Appendix E — Codex Prompt Conventions for Existing Code

Every Codex prompt that touches `apps/super-admin/` must follow this template. The goal is to make Codex read the existing code first, treat it as the source of truth, and refactor rather than rewrite.

### E.1 Mandatory prompt header

Every prompt for this app must start with this block:

```
You are working on the Fauward Console (apps/super-admin/) — an EXISTING
React 18 + Vite + TypeScript + Tailwind app. This is a refactor + extension,
not a greenfield build.

BEFORE WRITING ANY CODE:
1. Read apps/super-admin/INVENTORY.md if present.
2. Otherwise, run a directory listing of apps/super-admin/src/ and read:
   - src/main.tsx
   - src/router.tsx (or equivalent)
   - src/lib/api.ts
   - src/lib/query-client.ts
   - the auth provider / hook
   - all files in src/features/ (or current page directory)
   - all files in src/components/
   - package.json (note React/Vite/Tailwind/Radix versions)
3. Print a short inventory summary: routes that exist today, components
   available, API client base config, auth model.
4. Only then propose changes.

CONSTRAINTS:
- Do NOT delete any file in src/features/ in this prompt's work — only move
  files via git-aware operations and update imports.
- Do NOT replace src/lib/api.ts. Extend it (new interceptors, new headers).
- Do NOT change Tailwind config tokens that already exist. Add new tokens.
- Do NOT change the auth cookie name, session storage strategy, or login URL.
- Do NOT introduce new state management libraries. Use existing Zustand
  and React Query setup.
- Use the components already in src/components/ where they fit. Only build
  new components in @fauward/internal-ui when the existing one doesn't fit.

REFERENCE: docs/FAUWARD_INTERNAL_OPS_ARCHITECTURE.md
  — Section 3 (Repo Structure)
  — Appendix D (Migration map)
  — Whichever pillar/service section applies to this prompt
```

### E.2 Per-prompt requirements

Every prompt must additionally:

1. **Cite the section of this spec** it implements (e.g. "implements §5.4 Queue Operations").
2. **Cite the migration row in Appendix D** if it touches an existing page.
3. **Specify the commit boundary** — which of the commits in D.5 this prompt produces.
4. **Forbid scope creep** — explicit "do not modify other pillars or other services in this prompt".
5. **Require legacy redirect** — every prompt that moves a route must add or update the redirect map.
6. **Require type-check + lint** — final step in every prompt is `pnpm typecheck && pnpm lint`.

### E.3 Prompt template skeleton

```
## Goal
Implement <service name> at <route> per FAUWARD_INTERNAL_OPS_ARCHITECTURE.md §<n>.

## Existing code to read first
- apps/super-admin/src/<existing path>
- (any existing components/hooks this will reuse)

## Migration row from Appendix D
<paste the row>

## What to build
<files to create / modify>

## What NOT to change
- Any file outside apps/super-admin/src/pillars/<pillar>/<service>/
- Auth, API client, query client, Tailwind config

## Commit
Produces commit: "<commit message from D.5 sequence>"

## Verification
- pnpm typecheck passes
- pnpm lint passes
- Old route /admin/<x> redirects to new route
- New route renders without errors
```

### E.4 Anti-patterns to forbid in prompts

Every prompt should explicitly forbid:

- Generating a new `package.json` for `apps/super-admin/`
- Re-installing or upgrading dependencies (let the human do it)
- Creating parallel files (e.g. `TenantsPage.new.tsx`) — refactor in place
- Re-implementing existing components from scratch ("I'll build a Button component")
- Changing routing library (the existing one stays)
- Adding new top-level providers in `main.tsx` without justification
- Creating mock data files when the existing API client already has the endpoint

### E.5 Inventory output schema

The very first prompt (Phase 0 Step 0a) produces `apps/super-admin/INVENTORY.md` with this structure:

```markdown
# super-admin Inventory — <date>

## Stack
- React: <version>
- Vite: <version>
- Tailwind: <version>
- Routing: <library + version>
- State: <Zustand version, React Query version>
- UI deps: <Radix, lucide-react, recharts, etc.>

## Routes (current)
| Route | File | Purpose |
| ... | ... | ... |

## Pages
| File | Route | Data sources | Components used |
| ... | ... | ... | ... |

## Components
| File | Used in | Notes |

## Hooks
| File | Returns | Used in |

## API client
- Base URL: <env var>
- Auth: <cookie name, header, etc.>
- Interceptors: <list>
- Error handling: <401 handler, etc.>

## React Query
- Default options: <stale time, refetch policy>
- Query key conventions: <e.g. ['tenants', filters]>

## Auth
- Login page: <path>
- Session model: <cookie / localStorage>
- Route guards: <how they work>
- Current role: SUPER_ADMIN (single role)

## Environment variables
| Var | Used by | Notes |

## Test setup
- Framework: <vitest / jest / none>
- Coverage: <if any>

## Open questions / discrepancies with spec
- ...
```

This file is committed and lives at `apps/super-admin/INVENTORY.md` permanently. It is updated whenever a refactor lands.

---



Next-step deliverables (in order of dependency):

1. Codex prompt for **Phase 0 Step 0a — Inventory** (produces `apps/super-admin/INVENTORY.md`, no other code changes)
2. Codex prompt for **Phase 0 Steps 0b–0e — Shell + Migration** (pillar dashboard, sidebar, routing, three packages, move existing pages per Appendix D)
3. Prisma migration for new tables in [§11](#11-data-model-additions)
4. Codex prompt for **Phase 1 — Employee IAM + Audit Log + Billing Console + Customer 360**
5. Per-service Codex prompts as you reach each phase, all using the [Appendix E](#appendix-e--codex-prompt-conventions-for-existing-code) template
