# Fauward — Pricing, Billing & Unit Economics

---

## 5.1 Tier Definitions

| | Starter | Pro | Enterprise |
|---|---------|-----|-----------|
| **Price** | £29/month · £290/year | £79/month · £790/year | From £500/month |
| **Shipments/month** | 300 | 2,000 | Unlimited |
| **Staff accounts** | 3 | 15 | Unlimited |
| **Organisations (B2B clients)** | 10 | Unlimited | Unlimited |
| **Custom domain** | ❌ | ✅ | ✅ |
| **White-label** | ❌ (Powered by Fauward) | ✅ | ✅ |
| **CRM & Sales** | ❌ | ✅ | ✅ |
| **Document generation** | Basic (delivery note, invoice) | Full suite | Full + custom templates |
| **Finance module** | Basic invoicing | Full | Full + accounting |
| **Accounting integrations** | ❌ | 1 integration | All integrations |
| **SMS notifications** | ❌ | ✅ | ✅ |
| **API access** | ❌ | ✅ | ✅ (higher rate limits) |
| **Webhooks** | ❌ | ✅ | ✅ |
| **Carrier integrations** | ❌ | ❌ | ✅ |
| **E-invoicing / customs** | ❌ | ❌ | ✅ |
| **Multi-branch** | ❌ | ❌ | ✅ |
| **SSO** | ❌ | ❌ | ✅ |
| **Dedicated infrastructure** | ❌ | ❌ | ✅ |
| **SLA guarantee** | ❌ | ❌ | 99.9% with credits |
| **Data residency** | ❌ | ❌ | ✅ |
| **Support** | Email 48h | Email+Slack 12h | 24/7 dedicated |

---

## 5.2 Usage Enforcement

**At 80% of shipment limit:**
- In-app banner: "You've used 240 of your 300 shipments this month"
- Email notification to TENANT_ADMIN

**At 100% — Starter (hard stop with grace):**
- HTTP 429 with upgrade URL and overage option
- Admin emailed immediately

**At 100% — Pro (pay-as-you-go overage):**
- Shipments continue at £0.08/shipment
- Billed at end of month via Stripe metered billing

**Grace period on failed payment:**
- Day 0: Payment fails — retry in 3 days
- Day 3: Retry. If fails — SUSPENDED, email warning
- Day 7: Final retry. If fails — portal shows "account suspended"
- Day 30: CANCELLED — data retained 30 days then purged

---

## 5.3 Unit Economics

| Tier | Price | Infra Cost | SMS/Email | Support | Total Cost | Gross Margin |
|------|-------|-----------|-----------|---------|-----------|-------------|
| Starter | £29 | £2.50 | £0.50 | £2.00 | £5.00 | £24 (83%) |
| Pro | £79 | £4.00 | £3.00 | £5.00 | £12.00 | £67 (85%) |
| Enterprise | £800 avg | £150.00 | £15.00 | £80.00 | £245.00 | £555 (69%) |

**Break-even:** 10 Starter + 4 Pro = £508 margin vs £440 fixed costs ✅

---

## 5.4 Enterprise Pricing Variables

| Variable | Range | Impact |
|----------|-------|--------|
| Monthly shipment volume | 2,000–unlimited | Base price |
| Staff users | 15–unlimited | +£3/user above 50 |
| Regions activated | 1–7 | +£100–500/region |
| Custom integrations | Per integration | £500–£5,000 one-time |
| Data residency | EU/UK standard; others | +£100/month |
| SLA level | 99.9% standard; 99.95% | +£200/month |
| Contract duration | Monthly/Annual/2yr | 5%/15%/25% discount |
