# Product Overview

> **Fauward** — multi-tenant B2B SaaS for logistics businesses.
> *What it is · Who it's for · How it's positioned.*

**Navigation →** [Pricing](./pricing-billing.md) · [Roles](./roles-permissions.md) · [Architecture](./system-architecture.md) · [← README](../README.md)

---

## Contents

1. [What Is Fauward](#1-what-is-fauward)
2. [Brand & Identity](#2-brand--identity)
3. [Product Surfaces](#3-product-surfaces)
4. [Target Market & Positioning](#4-target-market--positioning)

---

## 1. What Is Fauward

Fauward is a **multi-tenant B2B SaaS platform** that gives logistics businesses — couriers, freight forwarders, and 3PLs — their own branded, fully operational platform in **10 minutes**, for less than the cost of one extra staff member per month.

### What it replaces

| Old way | Problem |
|---------|---------|
| WhatsApp shipment coordination | No tracking, no record, no scale |
| Excel shipment tracking | Manual, error-prone, not real-time |
| Bespoke TMS | £20k–£100k to build, £500+/month to maintain |
| Per-user SaaS (e.g. Logistaas) | £450+/month for a 10-person team at $45–$85/user |

### What it provides

- A **customer-facing portal** for booking, tracking, and payment
- An **operations dashboard** for internal staff to manage shipments end-to-end
- A **real-time tracking engine** with WebSocket broadcasting
- A **secure payment pipeline** with multi-gateway support
- A **notification layer** (email + SMS) for all key events
- A **driver mobile PWA** for field operations
- An **embeddable tracking widget** for third-party websites
- Full **white-label branding** per tenant

### Why it wins

| Advantage | Detail |
|-----------|--------|
| Flat company pricing | A 50-person logistics company pays **£79/month**, not £4,250/month |
| Self-serve in 10 minutes | No demo calls, no implementation teams |
| Region-specific from day one | Right payment gateways, tax compliance, and carrier integrations per market |
| White-label | Their customers see their brand, not ours |

---

## 2. Brand & Identity

**Name:** Fauward — */fɔː-wəd/* — from "forward" + "forwarder"
**Domains:** `fauward.com` · `fauward.io`

### Colour Palette

| Token | Hex | Usage |
|-------|-----|-------|
| Primary | `#0D1F3C` | Headers, navigation, trust signals |
| Accent | `#D97706` | CTAs, highlights, energy |
| Surface | `#FFFFFF` | Card backgrounds |
| Background | `#F8FAFC` | Page background |
| Border | `#E2E8F0` | Card and input borders |
| Text | `#1E293B` | Primary body text |
| Muted | `#64748B` | Secondary / helper text |

### Typography

| Role | Font |
|------|------|
| UI | `Inter`, `system-ui`, `sans-serif` |
| Monospace | `JetBrains Mono` — tracking numbers, API keys, logs, webhook signatures, system IDs |

**Tone:** Reliable, modern, global but grounded — not startup-playful.

**Tagline:** *"Ship smarter. Everywhere."*

---

## 3. Product Surfaces

> Fauward is not one app. It is a **multi-surface product ecosystem**. Each surface has its own UX persona and density. Do **not** apply one generic SaaS design to everything.

| # | Surface | Tech Stack | Audience | Design Intent |
|---|---------|------------|----------|---------------|
| 1 | **Marketing site** | Next.js 14, SSR, SEO-first | Prospects | Premium, conversion-focused, spacious |
| 2 | **Tenant portal** | React 18, Vite, Tailwind, Zustand, React Query, Radix | Logistics businesses + their customers | Data-dense, operational, white-label themed |
| 3 | **Driver mobile PWA** | React 18, Vite, PWA plugin | Delivery drivers | Touch-first, high contrast, offline-capable |
| 4 | **Super admin panel** | React 18, Vite, Tailwind | Fauward internal team | Maximum density, internal-tool efficient |
| 5 | **Embeddable widget** | Vanilla JS, Shadow DOM | Third-party websites | < 15 KB, zero dependencies, host-safe |

See [Frontend Design System](./frontend.md) for full surface specifications.

---

## 4. Target Market & Positioning

### Primary Buyers

Small to mid-size logistics businesses across **7 global regions** who are:

- Running operations on WhatsApp, spreadsheets, or outdated software
- Priced out of enterprise TMS solutions ($500–$2,000/month)
- Looking for a platform they can brand as their own
- Growing fast enough to need real operational infrastructure

### Personas by Region

| Persona | Region | Staff | Monthly Volume | Core Pain |
|---------|--------|-------|----------------|-----------|
| Last-mile courier startup | West Africa | 3–15 | 200–800 shipments | No tracking, manual payments |
| Regional freight forwarder | UK / Middle East | 15–60 | 500–5,000 shipments | Disconnected tools, no portal |
| Cross-border 3PL | East Africa / UK-Africa | 10–40 | 300–2,000 shipments | No real-time visibility for clients |
| E-commerce fulfilment | South Africa / UAE | 20–80 | 1,000–10,000 shipments | Can't connect to Shopify/WooCommerce |
| Air/ocean freight SME | Middle East / North Africa | 20–100 | Complex multi-modal | Needs carrier integrations + customs |

### Competitive Landscape

| Competitor | Type | Price | Why customers leave |
|------------|------|-------|---------------------|
| WhatsApp + Excel | Current state | Free | No tracking, no payments, no scale |
| Logistaas | TMS SaaS | $45–$85/user/month | Too expensive for small teams, no SMB self-serve |
| Shipday | Delivery mgmt | $49–$299/month | US-focused, no B2B finance module |
| Tookan | Delivery mgmt | $25–$95/month | No white-label, no Africa/MENA payment gateways |
| Onro | White-label TMS | Custom pricing | Expensive, slow onboarding |
| Enterprise TMS (SAP, Oracle) | Enterprise | $2,000–$50,000/month | Not for SMBs, requires implementation team |

### Differentiation vs Logistaas (closest competitor)

| Dimension | Logistaas | **Fauward** |
|-----------|-----------|-------------|
| Pricing model | $45–$85/user/month | **£29–£199/company/month flat** |
| Entry price (10 users) | ~$450/month | **£29/month** |
| Self-serve signup | ❌ Demo required | ✅ Live in 10 min |
| White-label | ❌ | ✅ Pro+ |
| PWA / mobile | ❌ | ✅ |
| Embeddable widget | ❌ | ✅ Pro+ |
| African payment gateways | ❌ | ✅ Paystack, M-Pesa, Flutterwave |
| Arabic RTL | ❌ | ✅ |
| Per-user penalty | ✅ Yes | ❌ No (flat rate) |

---

*Part of the [Fauward documentation](../README.md)*
