# Product Experience, Analytics & Go-To-Market

> Onboarding flow · Migration & import · Error handling UX · Analytics & SaaS metrics · Go-to-market · Legal & compliance

**Navigation →** [Frontend](./frontend.md) · [Implementation Phases](./implementation-phases.md) · [← README](../README.md)

---

## Contents

1. [Onboarding Flow](#1-onboarding-flow)
2. [Migration & Import](#2-migration--import)
3. [Error Handling UX](#3-error-handling-ux)
4. [Analytics & SaaS Metrics](#4-analytics--saas-metrics)
5. [Go-To-Market & Revenue Model](#5-go-to-market--revenue-model)
6. [Legal & Compliance](#6-legal--compliance)

---

## 1. Onboarding Flow

```
Step 0  Sign up  →  creates Tenant (TRIALING) + TENANT_ADMIN
Step 1  Logo & Brand  (2 min)  — upload logo, pick colour, live preview
Step 2  First Shipment  (optional)  — pre-filled example form
Step 3  Invite Team  (optional)  — email + role selector
Step 4  Connect Payment  (optional)  — Stripe Connect OAuth
Step 5  Go Live  — platform URL, share button, 🎉 confetti
```

> Each step is achievable in **under 2 minutes**. Skip options are available for every optional step.

### Dashboard Checklist

The following checklist is shown until all items are completed:

| Item | Tier |
|------|------|
| Upload logo | All |
| Create first shipment | All |
| Track a shipment | All |
| Invite a staff member | All |
| Connect payment gateway | All |
| Set up custom domain | Pro+ |
| Generate API key | Pro+ |

---

## 2. Migration & Import

| Source | Support |
|--------|---------|
| CSV | Customers, shipment history, rate cards |
| Excel (`.xlsx`) | Full support |
| Google Sheets | Via export to CSV |
| Logistaas | Dedicated import wizard |

**Import validation pipeline:**
1. Parse file — detect encoding, delimiter
2. Validate rows — duplicate detection, address format, required fields
3. Preview — show first 20 rows, highlight errors
4. Confirm — import with per-row error reporting

---

## 3. Error Handling UX

| HTTP Status | User Experience |
|------------|----------------|
| `400` validation | Highlight specific fields with inline error messages |
| `422` business rule | Toast notification with plain-English reason |
| `429` limit reached | Modal with upgrade CTA or pay-per-shipment option |
| Payment failure | Toast with card decline reason in plain English + retry button |
| Offline | Persistent banner · pending sync count · auto-sync on reconnection |

---

## 4. Analytics & SaaS Metrics

### Internal KPIs *(Super Admin Dashboard)*

| Metric | Target |
|--------|--------|
| Activation rate (≥1 shipment in 7 days) | > 60% |
| Time to first shipment | < 15 min |
| Trial conversion | > 25% |
| Monthly churn | < 3% |
| Expansion MRR (upgrades) | > 10% of new MRR |
| NPS | > 40 |
| DAU / MAU | > 40% |

### Per-Tenant Health Score

A composite score built from:
- Delivery success rate
- Payment collection rate
- Feature adoption breadth
- Support ticket volume

### Super Admin Analytics Views

- **MRR movement** — new, churned, expansion, net
- **Funnel** — signup → activation → conversion (monthly cohort)
- **Tenant health heatmap** — spot at-risk accounts
- **Regional MRR breakdown** — performance by geography

---

## 5. Go-To-Market & Revenue Model

### Revenue Projections

| Month | Tenants | Mix | MRR |
|-------|--------:|-----|----:|
| 1–2 | 5 (beta) | Free — UK + Nigeria | £0 |
| 3 | 12 | 8 Starter + 4 Pro | £548 |
| 6 | ~50 | Mixed | £2,100 |
| 12 | ~110 | Mixed with Enterprise | £6,200 |
| 18 | ~180 | Growing Enterprise | £13,500 |
| 24 | ~260 | Full portfolio | £22,000 |

> **Month 24 ARR: ~£264,000** *(with 3% monthly churn)*

### Sales Funnels

**Starter / Pro — fully self-serve:**
```
Landing page
  → Pricing page
  → Sign up
  → 14-day trial (full Pro features)
  → Onboarding wizard
  → First shipment (activation event)
  → Day 12 email nudge
  → Day 14 billing starts
```

**Enterprise — outbound + inbound:**
```
LinkedIn outreach or inbound lead
  → Discovery call
  → Demo
  → Proposal
  → 30-day managed trial
  → Contract signed
  → Onboarding
  → Go-live
  → Quarterly reviews
```

### Partner & Reseller Programme

| Partner Type | Commission | Requirements |
|-------------|-----------|-------------|
| **Referral** | 20% recurring commission (12 months) | Unique link, no minimum |
| **Reseller** | 40% discount on all plans | Full white-label rights, partner portal access |
| **Technology** | Revenue share | Certified API integration, co-marketing |

---

## 6. Legal & Compliance

### Required Legal Documents

| Document | Purpose |
|----------|---------|
| Terms of Service | Platform usage |
| Privacy Policy | GDPR / data processing |
| Data Processing Agreement | GDPR Article 28 |
| Acceptable Use Policy | Prohibited uses |
| Cookie Policy | Browser data |
| Enterprise SLA Addendum | Uptime + credits |
| Reseller Agreement | Partner terms |
| White-label Terms | Branding usage |

### Compliance Roadmap

| Certification | Target | Required For |
|---------------|--------|-------------|
| **GDPR** | Launch | All UK/EU tenants |
| **SOC2 Type 1** | Month 12 | Enterprise sales |
| **ISO 27001** | Month 18 | Middle East enterprise |
| **SOC2 Type 2** | Month 24 | Large enterprise |
| **PCI DSS** | Via Stripe / Paystack | Payment processing (delegated) |

### Liability Position

> Fauward is a **software platform**, not a carrier. Fauward is not liable for physical shipment loss or damage.
>
> - Platform liability capped at **3 months of subscription fees**
> - Tenants are responsible for their own tax compliance, customs declarations, and carrier relationships

---

*Part of the [Fauward documentation](../README.md)*
