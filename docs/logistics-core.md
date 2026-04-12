# Logistics Core

> Shipment state machine · Pricing engine · Feature modules · Regional deployment · Enterprise tier

**Navigation →** [Data Model](./data-model.md) · [Frontend](./frontend.md) · [API Design](./api.md) · [← README](../README.md)

---

## Contents

1. [Shipment State Machine](#1-shipment-state-machine)
2. [Feature Modules](#2-feature-modules)
3. [Regional Deployment & Tailoring](#3-regional-deployment--tailoring)
4. [Enterprise Tier](#4-enterprise-tier)

---

## 1. Shipment State Machine

### State Diagram

```
                 ┌─────────────┐
                 │   PENDING   │  ← Created; payment pending
                 └──────┬──────┘
                        │  Payment confirmed / manual
                 ┌──────▼──────┐
                 │ PROCESSING  │  ← Awaiting pickup
                 └──────┬──────┘
                        │  Driver collects
                 ┌──────▼──────┐
                 │  PICKED_UP  │
                 └──────┬──────┘
                        │  In transport network
                 ┌──────▼──────┐
           ┌─────│  IN_TRANSIT │─────┐
           │     └──────┬──────┘     │
           │     ┌──────▼──────┐     │
           │     │OUT_FOR_DELVRY│     │
           │     └──────┬──────┘     │
           │     ┌──────▼──────┐     │
           │     │  DELIVERED  │     │  ← terminal
           │     └─────────────┘     │
           │     ┌─────────────┐     │
           └────►│FAILED_DELIV.│◄────┘
                 └──────┬──────┘
                        │  Re-attempt / return
                 ┌──────▼──────┐
                 │  RETURNED   │  ← terminal
                 └─────────────┘

Any non-terminal state → CANCELLED  (only before PICKED_UP)
Any state            → EXCEPTION   (admin override — re-enters flow)
```

### Allowed Transitions

> All other transitions are **rejected with HTTP 400**. This is enforced in code — not just convention.

```typescript
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  PENDING:          ['PROCESSING', 'CANCELLED'],
  PROCESSING:       ['PICKED_UP', 'CANCELLED'],
  PICKED_UP:        ['IN_TRANSIT', 'EXCEPTION'],
  IN_TRANSIT:       ['OUT_FOR_DELIVERY', 'FAILED_DELIVERY', 'EXCEPTION'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED_DELIVERY', 'EXCEPTION'],
  FAILED_DELIVERY:  ['OUT_FOR_DELIVERY', 'RETURNED', 'EXCEPTION'],
  EXCEPTION:        ['PROCESSING', 'IN_TRANSIT', 'CANCELLED'],
  DELIVERED:        [],  // terminal
  RETURNED:         [],  // terminal
  CANCELLED:        [],  // terminal
};
```

**Special requirements on transitions:**

| Transition | Required |
|------------|---------|
| → `DELIVERED` | POD asset(s) must exist on the shipment |
| → `FAILED_DELIVERY` | `failedReason` must be provided |

### Tracking Number Format

```
{TENANT_SLUG}-{YYYYMM}-{6CHAR_ALPHANUMERIC}

Example:  FWD-202506-A3F9K2
```

Uniqueness is checked against the DB with up to 5 retries. See `shared/utils/trackingNumber.ts`.

### Baseline Pricing Engine

> The full configurable pricing system (tenant-controlled surcharges, weight tiers, dynamic rules, promo codes, tax) is specified in [Feature Additions → Section 25.4](./feature-additions.md#254-tenant-pricing-system-full-self-serve-control).

```
base price  =  weight_kg × zone_rate[origin_zone][dest_zone]

Service multiplier:
  STANDARD   = 1.0×
  EXPRESS    = 1.6×
  OVERNIGHT  = 2.2×

Surcharges:
  Oversize   = +15%   (if any dimension > 120 cm)
  Insurance  = +2%    (of declared value)
  Remote area = +£5–£20 (configurable flat fee)

Final price = (base × multiplier × surcharges) + VAT
```

---

## 2. Feature Modules

### 2.1 Core Platform *(all tiers)*

- Multi-tenant portal — branded subdomain or custom domain
- Shipment lifecycle with state machine
- Real-time status updates via WebSocket, scoped per tenant
- Role system with 8 roles
- Staff management — invite by email, assign roles
- Customer portal — self-service booking, order history, payment
- Basic analytics — shipment volumes, status breakdown
- Email notifications
- PDF delivery note generation
- PWA (installable, offline-capable)

### 2.2 CRM & Sales *(Pro + Enterprise)*

- Customer records with full shipment history
- Lead pipeline: Prospect → Quoted → Negotiating → Won/Lost
- Quotation engine with pricing breakdown
- Accepted quote → auto-creates shipment booking
- Revenue per sales rep, conversion rate, win/loss tracking

### 2.3 Operations & Document Management *(Pro + Enterprise)*

**Documents generated** (PDF, all tenant-branded):

| Document | Tier |
|----------|------|
| Booking confirmation | All |
| Delivery note | All |
| Proof of delivery (POD) | All |
| Cargo manifest | All |
| Packing list | All |
| Air waybill (IATA format) | Enterprise |
| Bill of lading (IMO format) | Enterprise |
| Commercial invoice for customs | Enterprise |

**Operations features:**
- Daily dispatch board — shipments grouped by driver
- Route optimisation view
- Capacity planning — shipments per driver, overload warnings
- Carrier assignment *(Enterprise)*

### 2.4 Finance & Invoicing *(Pro + Enterprise)*

- Auto-generate invoices on delivery or manual trigger
- Invoice lifecycle: `DRAFT` → `SENT` → `PAID` → `OVERDUE`
- Automatic overdue reminders (configurable: 7, 14, 30 days)
- Bulk invoicing for date ranges
- Record manual payments (bank transfer, cash)
- Revenue dashboard, outstanding receivables, cash vs invoiced
- Expense tracking and gross margin per shipment *(Enterprise)*

### 2.5 Accounting Integrations *(Pro: 1 · Enterprise: all)*

Bidirectional sync: invoices, payments, contacts, expenses.

| Software | Primary Regions |
|----------|----------------|
| Xero | UK, AU, NZ, South Africa |
| QuickBooks Online | US, Canada, UK, AU |
| Sage | UK, South Africa |
| SAP Business One / S/4HANA | Global Enterprise |
| Microsoft Dynamics 365 | Global Enterprise |
| Zoho Books | India, Middle East |
| TallyPrime | India, East Africa |

### 2.6 Carrier Integrations *(Enterprise)*

| Mode | Platforms |
|------|-----------|
| Air | Traxon CargoHUB, Descartes, WebCargo, CCNhub, Cargonaut |
| Ocean | INTTRA, CargoFive, Chain.io |
| Visibility | Wakeo, project44, FourKites |
| Last-mile | Region-specific (see Section 3) |

### 2.7 E-Invoicing & Tax Compliance *(Enterprise)*

| Region | Standard | Authority |
|--------|----------|-----------|
| UK | PEPPOL / MTD | HMRC |
| EU | PEPPOL EN16931 | National authorities |
| Nigeria | BIS Billing 3.0 | FIRS |
| Kenya | eTIMS | KRA |
| Saudi Arabia | ZATCA Phase 2 | ZATCA |
| UAE | VAT compliant | FTA |
| Egypt | ETA | Egyptian Tax Authority |
| South Africa | SARS e-filing | SARS |

### 2.8 API Access & Webhooks *(Pro + Enterprise)*

- Full REST API with API key authentication, per-key rate limiting, scoped permissions
- Webhooks fire on: `shipment.*`, `payment.*`, `invoice.*`, `quote.*`
- Each request signed with HMAC-SHA256 in `X-Webhook-Signature` header

### 2.9 Notifications

| Event | Starter | Pro / Enterprise |
|-------|:-------:|:----------------:|
| Booking confirmed | Email | Email + SMS |
| Payment received | Email | Email + SMS |
| Shipment picked up | Email | Email + SMS |
| In transit | Email | Email |
| Out for delivery | Email | Email + SMS |
| Delivered | Email | Email + SMS |
| Invoice sent | Email | Email |
| Invoice overdue | Email | Email + SMS |

### 2.10 Analytics & Reporting

| Tier | Capabilities |
|------|-------------|
| **Starter** | Shipments this month by status, recent activity feed |
| **Pro** | Revenue charts, volume trends, on-time rate, top customers, staff performance, CSV export |
| **Enterprise** | Profit margin per shipment/route/customer, multi-branch comparison, custom report builder, scheduled report emails, data warehouse export |

---

## 3. Regional Deployment & Tailoring

Each region is a **configuration profile** applied at tenant signup. It activates the correct payment gateway, currency, tax module, carriers, and language defaults.

### 3.1 UK & Western Europe

| Setting | Value |
|---------|-------|
| Payments | Stripe, GoCardless |
| Currencies | GBP, EUR, CHF |
| Languages | English, French, German, Spanish, Dutch |
| Accounting | Xero, QuickBooks, Sage |
| Tax | MTD (UK), PEPPOL, VAT per country |
| Carriers | Royal Mail, DPD, Evri, Parcelforce, DHL UK, FedEx UK |
| Customs | UK CDS, EU AES/ICS2 |
| Regulatory | GDPR, ICO registration |

### 3.2 West Africa

| Setting | Value |
|---------|-------|
| Markets | Nigeria, Ghana, Côte d'Ivoire, Senegal, Cameroon, Benin |
| Payments | Paystack, Flutterwave, Remita |
| Currencies | NGN, GHS, XOF, XAF |
| Languages | English, French |
| Tax | FIRS e-invoicing (Nigeria), GRA VAT (Ghana) |
| Carriers | GIG Logistics, Red Star Express, DHL Nigeria, Kwik |
| Customs | NICIS II (Nigeria), GCNET (Ghana) |
| Special | Mobile Money reconciliation, SMS-first notifications, offline-first |

### 3.3 East Africa

| Setting | Value |
|---------|-------|
| Markets | Kenya, Uganda, Tanzania, Ethiopia, Rwanda, Zambia |
| Payments | M-Pesa, Flutterwave, Pesapal |
| Currencies | KES, UGX, TZS, ETB, RWF, ZMW |
| Languages | English, Swahili |
| Tax | KRA eTIMS (Kenya), URA (Uganda) |
| Carriers | Sendy, Fargo Courier, DHL Kenya |
| Special | M-Pesa STK Push, multi-currency EAC corridor |

### 3.4 Southern Africa

| Setting | Value |
|---------|-------|
| Markets | South Africa, Zimbabwe, Zambia, Mozambique, Botswana, Namibia |
| Payments | Peach Payments, PayFast, Ozow, Stitch Money |
| Currencies | ZAR, ZWL, ZMW, MZN, BWP, NAD |
| Tax | SARS VAT 15%, VAT201 returns |
| Carriers | The Courier Guy, Courier It, Dawn Wing, PostNet, DHL SA |

### 3.5 North Africa & Middle East

| Setting | Value |
|---------|-------|
| Markets | UAE, Saudi Arabia, Egypt, Morocco, Tunisia, Qatar, Kuwait |
| Payments | Stripe MENA, Checkout.com, HyperPay, Fawry, PayTabs |
| Currencies | AED, SAR, EGP, MAD, TND, QAR, KWD |
| Languages | English, Arabic (full RTL) |
| Tax | UAE VAT 5%, ZATCA Phase 2 (Saudi), ETA e-invoicing (Egypt) |
| Carriers | Aramex, Fetchr, SMSA Express, Naqel, Bosta |
| Customs | Dubai Customs (Mirsal 2), FASAH (Saudi), ACID (Egypt) |
| Special | Full RTL UI, bilingual documents (Arabic + English), Hijri calendar |

### 3.6 North America

| Setting | Value |
|---------|-------|
| Markets | USA, Canada |
| Payments | Stripe, Square |
| Currencies | USD, CAD |
| Languages | English, French (Canada) |
| Tax | Sales tax per state (TaxJar), GST/HST/PST (Canada) |
| Carriers | UPS, FedEx, USPS, Canada Post, Purolator |
| Customs | ACE (USA), CERS (Canada) |

### 3.7 Asia Pacific

| Setting | Value |
|---------|-------|
| Markets | India, Australia, Singapore |
| Payments | Razorpay (India), Stripe (AU/SG), PayNow (SG) |
| Currencies | INR, AUD, SGD |
| Tax | GST e-invoicing (India), GST 10% (AU), GST 9% (SG) |
| Carriers | Delhivery, BlueDart (India), Australia Post, Sendle (AU), SingPost, Ninja Van (SG) |

### Regional Launch Sequence

| Quarter | Region | Rationale |
|---------|--------|-----------|
| **Q1** | UK + West Africa (Nigeria, Ghana) | Strongest network, Treny presence |
| **Q2** | East Africa (Kenya, Uganda) | M-Pesa + fast-growing market |
| **Q3** | Middle East (UAE, Saudi Arabia) | High ARPU, enterprise buyers, RTL ready |
| **Q4** | Southern Africa + North Africa | SARS + ZATCA compliance unlocks these |
| **Year 2** | North America + Asia Pacific | Larger competition; needs SOC2 first |

---

## 4. Enterprise Tier

### Dedicated Infrastructure

```
Enterprise Tenant Stack:
  ├── PostgreSQL  (db.t3.medium, Multi-AZ)
  ├── Redis cluster  (dedicated)
  ├── ECS task group  (dedicated)
  └── S3 bucket  (dedicated)

Data residency options:
  UK           eu-west-2
  EU           eu-central-1
  UAE          me-central-1
  West Africa  af-south-1
  US           us-east-1
```

### SSO Integration

SAML 2.0 + OAuth 2.0/OIDC. Compatible with: Azure AD, Okta, Google Workspace, OneLogin, Ping Identity.

**JIT provisioning** — users are auto-created on first SSO login with role mapping from IdP groups.

### Multi-Branch Support

One account, many offices. Branch-level staff assignment, analytics views, and shipment scoping. Super-admin sees a consolidated view.

### Advanced RBAC

Custom roles with granular permission sets beyond the standard 8 roles.

### Audit Log

Every state change is recorded: actor, IP, action, before/after state, timestamp, session ID.

- Immutable and exportable
- Retained **7 years**
- API-accessible for SIEM integration

### SLA & Support

| Level | Standard | Enterprise |
|-------|----------|-----------|
| Uptime | Best effort | **99.9%** (credits for breaches) |
| P1 response | 4 h | **1 h**, 24/7 |
| P2 response | 24 h | 4 h |
| P3 response | 48 h | 8 h |
| Support channels | Email | Email + Slack + Phone |
| Account manager | ❌ | ✅ Dedicated |

---

*Part of the [Fauward documentation](../README.md)*
