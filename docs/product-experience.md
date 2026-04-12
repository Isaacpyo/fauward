# Fauward — Product Experience, Analytics & Go-To-Market

> **Sections:** Onboarding Flow · Migration & Import · Error Handling UX · Analytics & SaaS Metrics · Go-To-Market · Legal & Compliance

---

## 18. Product Experience

### 18.1 Onboarding Flow

```
Step 0: Sign up → creates Tenant (TRIALING) + TENANT_ADMIN
Step 1: Logo & Brand (2 min) — upload logo, pick colour, live preview
Step 2: First Shipment (optional) — pre-filled example form
Step 3: Invite Team (optional) — email + role selector
Step 4: Connect Payment (optional) — Stripe Connect OAuth
Step 5: Go Live — platform URL, share button, confetti
```

**Dashboard checklist (shown until complete):**
- Upload logo → Create first shipment → Track a shipment → Invite staff → Connect payment → (Pro) Custom domain → (Pro) Generate API key

### 18.2 Migration & Import

- CSV import for customers, shipment history, rate cards
- Excel (.xlsx) and Google Sheets support
- Validation: duplicate detection, address format, preview before import
- "Import from Logistaas" wizard

### 18.3 Error Handling UX

- 400 validation: highlight specific fields with inline error messages
- 422 business rule: toast with reason
- 429 limit reached: modal with upgrade CTA or pay-per-shipment option
- Payment failure: toast with card decline reason in plain English + retry button
- Offline: persistent banner, pending sync count, auto-sync on reconnection

---

## 19. Analytics & SaaS Metrics

### Internal KPIs (Super Admin Dashboard)

| Metric | Target |
|--------|--------|
| Activation rate (≥1 shipment in 7 days) | > 60% |
| Time to first shipment | < 15 min |
| Trial conversion | > 25% |
| Monthly churn | < 3% |
| Expansion MRR (upgrades) | > 10% of new MRR |
| NPS | > 40 |
| DAU/MAU | > 40% |

### Per-Tenant Health Metrics

Health score (composite), delivery success rate, payment collection rate, feature adoption, support load.

### Super Admin Analytics

MRR movement (new, churned, expansion, net), signup → activation → conversion funnel (monthly cohort), tenant health heatmap, regional MRR breakdown.

---

## 20. Go-To-Market & Revenue Model

### Revenue Projections

| Month | Tenants | Breakdown | MRR |
|-------|---------|-----------|-----|
| 1–2 | 5 (beta) | Free — UK + Nigeria | £0 |
| 3 | 12 | 8 Starter + 4 Pro | £548 |
| 6 | ~50 | Mixed | £2,100 |
| 12 | ~110 | Mixed with Enterprise | £6,200 |
| 18 | ~180 | Growing Enterprise | £13,500 |
| 24 | ~260 | Full portfolio | £22,000 |

*Month 24 ARR: ~£264,000 (with 3% monthly churn)*

### Sales Funnel

**Starter/Pro (fully self-serve):**
Landing page → Pricing → Sign up → 14-day trial (full Pro) → Onboarding → First shipment (activation) → Day 12 email → Day 14 billing

**Enterprise (outbound + inbound):**
LinkedIn outreach / inbound → Discovery call → Demo → Proposal → 30-day managed trial → Contract → Onboarding → Go-live → Quarterly reviews

### Partner & Reseller Programme

**Referral Partners:** 20% recurring commission (12 months), unique link, no minimum.
**Reseller Partners:** 40% discount, full white-label rights, partner portal.
**Technology Partners:** Certified API integrations, co-marketing, revenue share.

---

## 21. Legal & Compliance

### Documents Required

Terms of Service, Privacy Policy, Data Processing Agreement (GDPR Article 28), Acceptable Use Policy, Cookie Policy, Enterprise SLA Addendum, Reseller Agreement, White-label Terms.

### Compliance Roadmap

| Certification | Target | Required For |
|---------------|--------|-------------|
| GDPR | Launch | UK/EU tenants |
| SOC2 Type 1 | Month 12 | Enterprise sales |
| SOC2 Type 2 | Month 24 | Large enterprise |
| ISO 27001 | Month 18 | Middle East enterprise |
| PCI DSS | Via Stripe/Paystack | Payment processing |

### Liability Limits

Fauward is a software platform, not a carrier. Not liable for physical shipment loss. Platform liability capped at 3 months of subscription fees. Tenant responsible for their own tax compliance, customs declarations, and carrier relationships.
