export const SITE_NAME = "Fauward";
export const SITE_TAGLINE = "Launch your branded logistics platform in minutes";
export const SITE_URL = process.env.NEXT_PUBLIC_MARKETING_SITE_URL ?? "https://fauward.com";
export const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL ?? "https://docs.fauward.com";
export const ONBOARDING_URL =
  process.env.NEXT_PUBLIC_TENANT_ONBOARDING_URL ?? "https://portal.fauward.com/onboarding";

// ─── Billing / Pricing ────────────────────────────────────────────────────────

export type BillingPeriod = "monthly" | "annual";

export type PricingPlan = {
  id: "starter" | "pro" | "enterprise";
  name: string;
  tagline: string;
  recommended?: boolean;
  monthlyPrice: number | null;
  annualMonthlyEquivalent: number | null;
  annualBillingLabel?: string;
  shipmentLimit: string;
  staffLimit: string;
  ctaLabel: string;
  ctaHref: string;
  features: string[];
};

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "starter",
    name: "Starter",
    tagline: "For new logistics teams launching quickly",
    monthlyPrice: 29,
    annualMonthlyEquivalent: 24,
    annualBillingLabel: "Billed annually at £288",
    shipmentLimit: "300 shipments / month",
    staffLimit: "3 staff seats",
    ctaLabel: "Start Free Trial",
    ctaHref: "/signup",
    features: [
      "Shipment creation and tracking",
      "Branded customer notifications",
      "Basic invoicing",
      "Fauward Go proof-of-delivery",
      "Branded public tracking page",
      "VAT-ready invoicing",
      "Email support"
    ]
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For scaling operations that need automation",
    recommended: true,
    monthlyPrice: 79,
    annualMonthlyEquivalent: 65,
    annualBillingLabel: "Billed annually at £780",
    shipmentLimit: "2,000 shipments / month",
    staffLimit: "15 staff seats",
    ctaLabel: "Start Free Trial",
    ctaHref: "/signup",
    features: [
      "Everything in Starter",
      "API access",
      "Webhooks",
      "Custom domain",
      "Automation rules and webhook triggers",
      "Multi-depot route views",
      "Priority email + chat support",
      "Up to 15 staff users"
    ]
  },
  {
    id: "enterprise",
    name: "Enterprise",
    tagline: "For high-volume teams with strict requirements",
    monthlyPrice: null,
    annualMonthlyEquivalent: null,
    shipmentLimit: "Unlimited shipments",
    staffLimit: "Unlimited staff seats",
    ctaLabel: "Talk to Sales",
    ctaHref: "/support#contact",
    features: [
      "SSO / SAML",
      "SLA-backed uptime",
      "Dedicated support",
      "Advanced compliance controls",
      "Custom SLA and uptime guarantee",
      "Dedicated onboarding engineer",
      "Audit logs and compliance exports",
      "Unlimited users — not per seat"
    ]
  }
];

export const ANNUAL_DISCOUNT_BADGE = "Save up to 18%";

export const PRICING_DIFFERENTIATOR = {
  headline: "One flat company price. Zero per-seat charges.",
  subtext:
    "Most logistics tools charge per user. Fauward charges by shipment volume — so growing your team never costs more.",
  comparisonLabel: "Typical per-seat tool at 15 users",
  comparisonPrice: "£15–£30 / user / mo = £225–£450 / mo",
  fauwardLabel: "Fauward Pro at 2,000 shipments / mo",
  fauwardPrice: "£79 / mo flat"
};

// ─── Feature Comparison (used on /pricing) ────────────────────────────────────

export type ComparisonValue = string | boolean;

export type ComparisonRow = {
  feature: string;
  starter: ComparisonValue;
  pro: ComparisonValue;
  enterprise: ComparisonValue;
};

export const FEATURE_COMPARISON_ROWS: ComparisonRow[] = [
  { feature: "Included shipments", starter: "300 / month", pro: "2,000 / month", enterprise: "Unlimited" },
  { feature: "Staff seats", starter: "3", pro: "15", enterprise: "Unlimited" },
  { feature: "Fauward Agent", starter: "Upgrade to Pro", pro: "Included", enterprise: "Included" },
  { feature: "Agent setup", starter: false, pro: "Switch on from dashboard", enterprise: "Switch on from dashboard" },
  { feature: "Shipment state machine", starter: true, pro: true, enterprise: true },
  { feature: "Fauward Go proof-of-delivery", starter: true, pro: true, enterprise: true },
  { feature: "Branded customer notifications", starter: true, pro: true, enterprise: true },
  { feature: "Invoice lifecycle", starter: true, pro: true, enterprise: true },
  { feature: "VAT-ready invoicing", starter: true, pro: true, enterprise: true },
  { feature: "Public tracking page", starter: true, pro: true, enterprise: true },
  { feature: "Returns workflow", starter: true, pro: true, enterprise: true },
  { feature: "Live operations map", starter: "Basic", pro: "Advanced", enterprise: "Advanced" },
  { feature: "Automation rules", starter: false, pro: true, enterprise: true },
  { feature: "Multi-depot route views", starter: false, pro: true, enterprise: true },
  { feature: "API access", starter: false, pro: true, enterprise: true },
  { feature: "Webhook events", starter: false, pro: true, enterprise: true },
  { feature: "Custom domain", starter: false, pro: true, enterprise: true },
  { feature: "Custom email domain", starter: false, pro: false, enterprise: true },
  { feature: "Audit logs and compliance exports", starter: false, pro: false, enterprise: true },
  { feature: "SSO / SAML", starter: false, pro: false, enterprise: true },
  { feature: "SLA", starter: false, pro: false, enterprise: "Custom SLA" },
  { feature: "Support", starter: "Email", pro: "Priority email + chat", enterprise: "Dedicated support channel" }
];

// ─── Competitor Comparison (used on landing page) ─────────────────────────────

export type CompetitorRow = {
  criterion: string;
  fauward: string;
  genericSaaS: string;
};

export const COMPETITOR_COMPARISON_ROWS: CompetitorRow[] = [
  { criterion: "Pricing model", fauward: "Flat per shipment volume", genericSaaS: "Per user / seat" },
  { criterion: "Logistics-specific workflows", fauward: "Built-in (POD, state machine, COD)", genericSaaS: "Generic tools adapted" },
  { criterion: "White-label tracking page", fauward: "Included from Starter", genericSaaS: "Add-on or custom dev" },
  { criterion: "Regional payment methods", fauward: "M-Pesa, Paystack, Stripe, GoCardless", genericSaaS: "Stripe only" },
  { criterion: "Time to first shipment", fauward: "Under 10 minutes", genericSaaS: "Days of setup and training" },
  { criterion: "Fauward Go offline support", fauward: "Built-in, syncs on reconnect", genericSaaS: "Not available" }
];

// ─── Social Proof ──────────────────────────────────────────────────────────────

export type LogoItem = {
  name: string;
  imageSrc: string;
};

// Preserved for potential future use (regional pages, etc.)
export const SOCIAL_PROOF_LOGOS: LogoItem[] = [
  { name: "Northline Freight", imageSrc: "/images/logos/northline.svg" },
  { name: "Atlas Dispatch", imageSrc: "/images/logos/atlas.svg" },
  { name: "Relay Fleet", imageSrc: "/images/logos/relay.svg" },
  { name: "PortBridge Logistics", imageSrc: "/images/logos/portbridge.svg" },
  { name: "CargoSphere", imageSrc: "/images/logos/cargosphere.svg" }
];

export type StatHighlight = {
  value: string;
  label: string;
  mono?: boolean;
};

export const STAT_HIGHLIGHTS: StatHighlight[] = [
  { value: "10 min", label: "Median time to first live shipment", mono: true },
  { value: "£0", label: "Per-seat charges — ever", mono: true },
  { value: "4+", label: "Regions supported at launch", mono: false },
  { value: "99.9%", label: "Target uptime SLA (Enterprise)", mono: true }
];

// ─── Marketing Features (used on landing + /features/[slug]) ──────────────────

export type MarketingFeature = {
  slug: string;
  title: string;
  eyebrow: string;
  shortDescription: string;
  pageDescription: string;
  imageSrc: string;
  bullets: string[];
  cards: Array<{ title: string; description: string }>;
  metrics?: Array<{ value: string; label: string }>;
  workflow?: Array<{ step: string; title: string; description: string }>;
  useCases?: Array<{ persona: string; benefit: string }>;
  integrations?: string[];
  faqs?: Array<{ question: string; answer: string }>;
  highlightWord?: string;
  accent?: "amber" | "blue" | "purple";
};

export const MARKETING_FEATURES: MarketingFeature[] = [
  {
    slug: "shipment-management",
    title: "Stop losing track of where things are",
    eyebrow: "Shipment Operations",
    highlightWord: "where things are",
    accent: "blue",
    shortDescription:
      "Every shipment moves through a clear, auditable lifecycle — your dispatchers and customers always know the status.",
    pageDescription:
      "Keep operations aligned with a canonical shipment state machine from PENDING to DELIVERED, with clear handling for branch outcomes — failed deliveries, reattempts, returns, and exceptions all map to known states with explicit transitions.",
    imageSrc: "/images/screens/portal-tracking.svg",
    bullets: [
      "Know which shipments are at risk before customers complain",
      "Fauward Go operators confirm handoffs without phone calls",
      "Customers self-serve on a branded tracking page",
      "Configure SLAs per service-level and route type",
      "Bulk operations: import, assign, and reroute shipments in batches",
      "Webhook events fire on every state transition for downstream automation",
    ],
    cards: [
      {
        title: "One source of truth",
        description:
          "Dispatch, finance, and Fauward Go operators all read from the same live state — no reconciliation needed.",
      },
      {
        title: "Fewer support tickets",
        description:
          "Proactive status updates cut inbound 'where is my parcel?' queries by removing the uncertainty.",
      },
      {
        title: "Audit trail for disputes",
        description:
          "Every status transition is timestamped with actor and notes, making proof-of-delivery disputes resolvable in seconds.",
      },
    ],
    metrics: [
      { value: "60%", label: "Drop in WISMO calls" },
      { value: "< 1s", label: "State propagation latency" },
      { value: "100%", label: "Auditable transitions" },
      { value: "12+", label: "Lifecycle states modelled" },
    ],
    workflow: [
      { step: "01", title: "Booking created", description: "A shipment enters as PENDING via portal, API, or bulk CSV import — instantly visible to dispatch." },
      { step: "02", title: "Assigned to operator", description: "Fauward Agent or dispatch picks the right Fauward Go operator and routes the job; state becomes ASSIGNED." },
      { step: "03", title: "Out for delivery", description: "Driver collects, Fauward Go captures GPS waypoints, and the state moves through IN_TRANSIT with live ETA." },
      { step: "04", title: "Proof captured", description: "Photo, OTP, and signature confirm delivery; the shipment moves to DELIVERED and the customer is notified automatically." },
      { step: "05", title: "Exceptions handled", description: "Failed deliveries map to FAILED with a reason code, triggering a reattempt workflow or return-to-sender." },
    ],
    useCases: [
      { persona: "Couriers", benefit: "Replace WhatsApp chaos with a clean assignment + tracking board" },
      { persona: "Freight operators", benefit: "Multi-leg shipments with hub transfers, all visible in one view" },
      { persona: "3PLs", benefit: "Per-client tenant scope keeps every customer's shipments isolated" },
    ],
    integrations: ["Royal Mail", "DPD", "Evri", "Aramex", "DHL Africa", "M-Pesa proof", "Stripe", "Webhook API"],
    faqs: [
      { question: "Can I customise the lifecycle states?", answer: "The core states (PENDING → DELIVERED) are fixed for semantic safety, but per-tenant substates and reason codes are fully configurable." },
      { question: "How are exceptions surfaced?", answer: "Failed deliveries, SLA breaches, and route anomalies are surfaced in real time on the dispatcher dashboard and via webhooks — and optionally escalated by Fauward Agent." },
      { question: "Does it work with my existing carriers?", answer: "Yes. We have pre-built connectors for major UK and global carriers, plus a generic carrier-events webhook for anything custom." },
    ],
  },
  {
    slug: "finance",
    title: "Get paid without chasing invoices",
    eyebrow: "Finance & Invoicing",
    highlightWord: "chasing invoices",
    accent: "amber",
    shortDescription:
      "Invoice creation to collection in one screen — overdue reminders run automatically.",
    pageDescription:
      "Track invoice states from DRAFT to PAID, automate reminders for OVERDUE accounts, and keep tenant-level reporting consistent. Auto-invoice on POD confirmation, accept payments across every regional gateway, and reconcile cash-on-delivery without a spreadsheet.",
    imageSrc: "/images/screens/portal-finance.svg",
    bullets: [
      "See every unpaid invoice across all customers at a glance",
      "Automated overdue reminders stop the manual follow-up cycle",
      "Finance and operations share one ledger — no CSV exports between teams",
      "Auto-invoice on proof-of-delivery confirmation",
      "Multi-currency, VAT-ready, and COD reconciliation built in",
      "Payment gateways: Stripe, GoCardless, M-Pesa, Paystack, HyperPay, Checkout.com",
    ],
    cards: [
      {
        title: "Cash flow visibility",
        description:
          "Monitor invoiced, paid, and overdue totals from a single finance dashboard.",
      },
      {
        title: "Reduced manual follow-up",
        description:
          "Automated reminder workflows lower finance overhead and speed up collection.",
      },
      {
        title: "Audit-ready records",
        description:
          "Every invoice action is timestamped for compliance and reconciliation.",
      },
    ],
    metrics: [
      { value: "47%", label: "Faster cash collection" },
      { value: "0", label: "Manual follow-up emails" },
      { value: "6+", label: "Payment gateways supported" },
      { value: "VAT-ready", label: "Invoice formats per region" },
    ],
    workflow: [
      { step: "01", title: "Delivery confirmed", description: "Driver captures POD in Fauward Go — photo, OTP, or signature." },
      { step: "02", title: "Invoice auto-generated", description: "The shipment's price card runs and produces a draft invoice; tax, discounts, and surcharges are applied automatically." },
      { step: "03", title: "Sent to customer", description: "Invoice + payment link delivered via email and SMS in the customer's preferred channel." },
      { step: "04", title: "Reminders escalate", description: "If unpaid past terms, the system fires reminder 1, 2, and 3 — and flags the account for collections review." },
      { step: "05", title: "Reconciled on payment", description: "Webhook from gateway marks invoice PAID and posts to the ledger; finance dashboards update instantly." },
    ],
    useCases: [
      { persona: "Finance teams", benefit: "Live aged-debt board replaces end-of-month spreadsheet drudgery" },
      { persona: "COO / owner", benefit: "DSO drops as reminders run themselves on every overdue account" },
      { persona: "Customer success", benefit: "Customer portal lets clients self-serve invoice copies and statements" },
    ],
    integrations: ["Stripe", "GoCardless", "M-Pesa", "Paystack", "HyperPay", "Checkout.com", "Xero", "QuickBooks"],
    faqs: [
      { question: "Can I customise invoice templates?", answer: "Yes — logo, colours, footer notes, payment terms, and locale are all configurable per tenant. Branded PDFs go out under your domain." },
      { question: "Does it support multi-currency?", answer: "Invoices can be issued in any supported currency. Conversion to your reporting currency happens on the ledger using the market rate at payment time." },
      { question: "How are COD shipments reconciled?", answer: "Drivers confirm cash collected in Fauward Go, depot settlement records cash drops, and the invoice is auto-marked PAID with a cash audit trail." },
    ],
  },
  {
    slug: "white-label",
    title: "Launch under your own brand in minutes",
    eyebrow: "White-Label Platform",
    highlightWord: "your own brand",
    accent: "purple",
    shortDescription:
      "Your logo, domain, and colour palette — provisioned in minutes, not sprints.",
    pageDescription:
      "Launch a branded tenant portal and tracking pages quickly while preserving semantic logistics status colours across all customers. Custom domain, themed CSS variables, branded emails and SMS — your customers never see Fauward.",
    imageSrc: "/images/screens/portal-overview.svg",
    bullets: [
      "Your customers see your brand on every screen — not Fauward's",
      "Custom domain for public shipment tracking",
      "Tenant theme applied instantly from API configuration",
      "Branded emails, SMS templates, and customer notifications",
      "Per-tenant CSS variable injection — design tokens you control",
      "Role-based access for staff, drivers, and customers — all under your identity",
    ],
    cards: [
      {
        title: "Live in minutes",
        description:
          "Provision a fully branded platform without a single line of custom engineering work.",
      },
      {
        title: "Consistent status semantics",
        description:
          "Delivery success, warning, and error states stay universally readable for safety.",
      },
      {
        title: "Enterprise-ready controls",
        description:
          "Role-based access for operators, finance teams, and customers — all under your identity.",
      },
    ],
    metrics: [
      { value: "< 10 min", label: "Time to brand-live" },
      { value: "0", label: "Lines of custom code" },
      { value: "100%", label: "White-label coverage" },
      { value: "SSL", label: "Auto-provisioned per domain" },
    ],
    workflow: [
      { step: "01", title: "Configure your brand", description: "Upload logo, set primary/secondary colours, choose typography from the admin panel." },
      { step: "02", title: "Point your domain", description: "Add a CNAME record — SSL certificates auto-provision via Let's Encrypt." },
      { step: "03", title: "Theme propagates instantly", description: "CSS variables update across the tenant portal, Fauward Go, customer tracking, and email templates in seconds." },
      { step: "04", title: "Customers see your brand", description: "Tracking links, emails, SMS, invoices — every customer touchpoint is fully branded as yours." },
    ],
    useCases: [
      { persona: "Courier startups", benefit: "Look like an enterprise on day one without an engineering team" },
      { persona: "3PL providers", benefit: "Spin up branded portals for every client — each isolated and themed" },
      { persona: "Established freight", benefit: "Modernise your customer experience without rebuilding from scratch" },
    ],
    integrations: ["Custom DNS", "Let's Encrypt SSL", "SendGrid templates", "Twilio SMS", "API webhook events"],
    faqs: [
      { question: "Can each of my clients have their own domain?", answer: "Yes — under a single Fauward account you can provision unlimited tenants, each with their own custom domain, theme, and isolated data." },
      { question: "Is the customer tracking page fully white-labelled?", answer: "Completely. The public tracking page lives on your domain, uses your logo and colours, and has zero Fauward branding." },
      { question: "Can I A/B test brand variations?", answer: "Theme variants can be enabled per tenant, but customer-facing A/B testing is not a built-in feature today." },
    ],
  },
  {
    slug: "api-integrations",
    title: "Connect Fauward to your existing stack",
    eyebrow: "API & Integrations",
    highlightWord: "existing stack",
    accent: "blue",
    shortDescription:
      "REST API, webhooks, and pre-built carrier connectors — all documented and versioned.",
    pageDescription:
      "Fauward is API-first. Every action in the platform is available via REST, every state transition fires a webhook, and pre-built connectors cover the most common carriers and payment gateways. Build on top, sync to your ERP, or trigger downstream automation — without scraping screens.",
    imageSrc: "/images/screens/portal-overview.svg",
    bullets: [
      "REST API with full OpenAPI documentation",
      "Webhook events fire on every lifecycle transition",
      "Pre-built carrier connectors — DHL, Royal Mail, Aramex, GIG, DPD",
      "ERP and WMS sync via standard event payloads",
      "Sandbox environment for safe end-to-end testing",
      "Versioned API with deprecation notice policy",
    ],
    cards: [
      {
        title: "API-first architecture",
        description:
          "Everything in the dashboard is also in the API. Build a custom workflow on top without waiting for product roadmap.",
      },
      {
        title: "Webhook events",
        description:
          "Subscribe to shipment, invoice, and POD events. Trigger downstream systems in real time without polling.",
      },
      {
        title: "Pre-built connectors",
        description:
          "Skip the integration build. Royal Mail, DPD, Aramex, GIG, DHL, Stripe, M-Pesa, and Paystack are ready to flip on.",
      },
    ],
    metrics: [
      { value: "200+", label: "REST endpoints documented" },
      { value: "30+", label: "Webhook event types" },
      { value: "8+", label: "Pre-built carrier connectors" },
      { value: "v1 / v2", label: "Stable versioned API" },
    ],
    workflow: [
      { step: "01", title: "Get your API key", description: "Create a sandbox key from the dashboard. No approval queue — develop immediately." },
      { step: "02", title: "Build against sandbox", description: "Hit the same endpoints with sandbox data. State transitions and webhook events fire end-to-end." },
      { step: "03", title: "Subscribe to webhooks", description: "Point your endpoint at events you care about — shipment.dispatched, invoice.paid, pod.captured, and more." },
      { step: "04", title: "Connect carriers + gateways", description: "Flip on Royal Mail, DPD, Stripe, M-Pesa — credentials live in the admin panel, not your codebase." },
      { step: "05", title: "Promote to live", description: "Swap to your production key. Sandbox stays available for regression testing." },
    ],
    useCases: [
      { persona: "Engineering teams", benefit: "Stop scraping carrier screens — one API for every label, status, and POD" },
      { persona: "Ops + automation", benefit: "Trigger Zapier, n8n, or your own scripts on every shipment event" },
      { persona: "Finance ERP teams", benefit: "Sync paid invoices and credit notes to Xero, NetSuite, or QuickBooks in near-real-time" },
    ],
    integrations: [
      "Royal Mail", "DPD", "Evri", "Aramex", "GIG Logistics", "DHL", "Stripe", "GoCardless",
      "M-Pesa", "Paystack", "Checkout.com", "HyperPay", "Zapier", "n8n", "Xero", "QuickBooks",
    ],
    faqs: [
      { question: "Is the API rate-limited?", answer: "Yes, generously. Pro accounts get 600 requests/min, Enterprise gets 2,000 requests/min. Burst headroom is documented per endpoint." },
      { question: "What does webhook delivery look like?", answer: "At-least-once delivery, exponential backoff retries for 24 hours, HMAC-signed payloads. Failed deliveries surface in the admin panel." },
      { question: "Do you support GraphQL?", answer: "Not today — REST + webhooks cover the use cases we see. We do publish OpenAPI 3.1 specs so SDK generation is one command away." },
      { question: "Can I build my own carrier connector?", answer: "Yes. The carrier-events webhook lets you push status updates from any source into a shipment's lifecycle. Custom-carrier shipments work end-to-end." },
    ],
  },
];

// ─── Screenshot Showcase (used on landing page) ───────────────────────────────

export type ScreenshotItem = {
  title: string;
  description: string;
  imageSrc: string;
};

export const SCREENSHOT_SHOWCASE_ITEMS: ScreenshotItem[] = [
  {
    title: "Tenant operations dashboard",
    description: "See shipment flow, SLA risk, and route exceptions at a glance.",
    imageSrc: "/images/screens/portal-overview.svg"
  },
  {
    title: "Shipment tracking board",
    description: "Manage transitions from PROCESSING through DELIVERED in real time.",
    imageSrc: "/images/screens/portal-tracking.svg"
  },
  {
    title: "Finance and invoicing",
    description: "Track DRAFT, SENT, PAID, and OVERDUE invoices with clear actions.",
    imageSrc: "/images/screens/portal-finance.svg"
  }
];

// ─── Regions ──────────────────────────────────────────────────────────────────

export type RegionInfo = {
  slug: "uk" | "africa" | "asia" | "global";
  name: string;
  label: string;
  summary: string;
  highlights: string[];
  badges?: string[];
};

export const REGIONS: RegionInfo[] = [
  {
    slug: "uk",
    name: "UK & Europe",
    label: "UK & Europe",
    summary: "Operate multi-depot courier and freight workflows across the UK and European markets with regional compliance awareness.",
    highlights: [
      "VAT-ready invoicing flows for UK and EU markets",
      "Urban and nationwide route planning across Europe",
      "Local support coverage in GMT and CET business hours"
    ],
    badges: ["Stripe", "GoCardless", "DPD", "Royal Mail", "Evri", "DHL Europe"]
  },
  {
    slug: "africa",
    name: "Africa",
    label: "Africa",
    summary:
      "Support M-Pesa and Paystack collections, offline Fauward Go workflows, and cross-border operations from a single platform.",
    highlights: [
      "Multi-currency finance controls",
      "Offline-tolerant Fauward Go workflows",
      "Country-specific delivery proof collection"
    ],
    badges: ["M-Pesa", "Paystack", "Flutterwave", "GIG Logistics", "DHL Africa"]
  },
  {
    slug: "asia",
    name: "Asia",
    label: "Asia",
    summary:
      "Handle COD, Aramex, and hub-and-spoke operations across the Middle East, GCC, and Asia with payment flexibility and local onboarding playbooks.",
    highlights: [
      "Flexible COD and invoice management",
      "Hub-and-spoke operational modelling",
      "Regional onboarding and support playbooks across Asia"
    ],
    badges: ["Aramex", "SMSA", "COD workflows", "Checkout.com", "HyperPay"]
  },
  {
    slug: "global",
    name: "Global",
    label: "Global",
    summary:
      "Deploy a consistent logistics platform for distributed teams across regions — one account, every market.",
    highlights: [
      "Tenant-level customisation at scale",
      "Unified KPI and reporting standards",
      "Central governance with local execution"
    ],
    badges: ["Multi-currency", "Tenant isolation", "API-first", "Webhook events"]
  }
];

// ─── Testimonials ─────────────────────────────────────────────────────────────

export type Testimonial = {
  quote: string;
  name: string;
  role: string;
  company: string;
  avatarSrc: string;
  initials: string;
};

export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "We cut our 'where is my shipment?' call volume by 60% in the first month. Customers track themselves now — our dispatchers actually have time to do their jobs.",
    name: "Adebola Okonkwo",
    role: "COO",
    company: "Apex Road Freight, Lagos",
    avatarSrc: "",
    initials: "AO"
  },
  {
    quote:
      "Switching from a per-seat tool to Fauward saved us £340 a month the moment we hired our fourth dispatcher. The pricing model alone paid for itself.",
    name: "James Whitfield",
    role: "Operations Manager",
    company: "Meridian Couriers, Manchester",
    avatarSrc: "",
    initials: "JW"
  },
  {
    quote:
      "Finance stopped chasing Fauward Go operators for delivery confirmations. The invoice goes out automatically when the POD comes in. That alone changed how the business runs.",
    name: "Sara Al-Rashidi",
    role: "Finance Lead",
    company: "Gulf Link Logistics, Dubai",
    avatarSrc: "",
    initials: "SR"
  }
];

export type MiniTestimonial = {
  quote: string;
  name: string;
};

export const MINI_TESTIMONIALS: MiniTestimonial[] = [
  { quote: "The API docs are actually readable.", name: "Dev lead, UK courier startup" },
  { quote: "Genuinely 10 minutes to first shipment.", name: "MD, freight business, Nairobi" },
  { quote: "Finance stopped asking me where the invoices were.", name: "Ops manager, Asia fleet operator" }
];

// ─── FAQ ──────────────────────────────────────────────────────────────────────

export type FaqGroup = {
  topic: string;
  items: Array<{ question: string; answer: string }>;
};

export const GENERAL_FAQ_GROUPS: FaqGroup[] = [
  {
    topic: "Switching & Setup",
    items: [
      {
        question: "We already use spreadsheets and WhatsApp. Is switching really worth it?",
        answer:
          "If a dispatcher is manually texting status updates or copying rows between sheets, you're paying for invisible overhead — and your customers are feeling the gaps. Fauward replaces that loop with a live state machine and branded tracking. Most teams get their first shipment live in under 10 minutes after signup."
      },
      {
        question: "How long does onboarding actually take?",
        answer:
          "Brand configuration takes about 5 minutes. Adding your first carriers, staff, and shipment takes another 10. If you need a custom domain for the tracking page, add 24–48 hours for DNS propagation — that's the slowest part and it's on your DNS provider, not us."
      }
    ]
  },
  {
    topic: "Pricing & Commitment",
    items: [
      {
        question: "We're worried about being locked in. Do you have long-term contracts?",
        answer:
          "No minimum term on Starter or Pro. Month-to-month unless you choose annual billing for the discount. Enterprise agreements are tailored and fully negotiable — no hidden lock-in."
      },
      {
        question: "We have 12 dispatchers. Does the price go up per user?",
        answer:
          "No. Fauward prices by shipment volume, not by seat. All plans include multiple staff users — Pro includes 15 seats and Enterprise is unlimited. Adding dispatchers doesn't change your bill."
      }
    ]
  },
  {
    topic: "Operations & Security",
    items: [
      {
        question: "What happens if a Fauward Go operator loses connectivity mid-delivery?",
        answer:
          "Fauward Go queues actions locally and syncs when connectivity returns. Proof-of-delivery, status updates, and failed delivery notes are all preserved offline. No data is lost during connectivity gaps."
      },
      {
        question: "Can our customers track shipments without logging in?",
        answer:
          "Yes. Every shipment gets a public tracking URL on your branded domain — no login required. You control what status language and branding your customers see. Recipients can track directly from the link in their notification email or SMS."
      }
    ]
  }
];

export const BILLING_FAQ_GROUPS: FaqGroup[] = [
  {
    topic: "Billing",
    items: [
      {
        question: "What is included in the free trial?",
        answer: "You get full platform access with guided onboarding and no setup fee."
      },
      {
        question: "Do annual plans include a discount?",
        answer: "Yes. Annual billing provides discounted monthly equivalents for Starter and Pro."
      },
      {
        question: "What happens if we exceed our shipment allowance?",
        answer:
          "You can upgrade instantly from the billing screen or contact support for volume-based options."
      }
    ]
  },
  {
    topic: "Contracts",
    items: [
      {
        question: "Is there a long-term contract on Starter or Pro?",
        answer: "No long-term contract is required. You can change plans as your needs evolve."
      },
      {
        question: "How does Enterprise pricing work?",
        answer:
          "Enterprise is tailored for scale, support, and compliance requirements. Contact Sales for a custom proposal."
      }
    ]
  }
];

// ─── Services ─────────────────────────────────────────────────────────────────

export type ServiceItem = {
  slug: string;
  icon: string;
  title: string;
  summary: string;
  bullets: string[];
};

export const SERVICES: ServiceItem[] = [
  {
    slug: "shipment-ops",
    icon: "package",
    title: "Shipment Operations",
    summary:
      "End-to-end shipment lifecycle management from booking through proof-of-delivery — built for couriers, freight operators, and last-mile businesses.",
    bullets: [
      "Automated status transitions with configurable rules",
      "Real-time GPS tracking and ETA recalculation",
      "Failed delivery workflows with reattempt scheduling",
      "Bulk import and API-based shipment creation",
      "Multi-depot and hub-and-spoke routing",
    ],
  },
  {
    slug: "driver-app",
    icon: "smartphone",
    title: "Fauward Go",
    summary:
      "A purpose-built field operations app that works on and offline — capturing signatures, photos, and barcodes for irrefutable proof-of-delivery.",
    bullets: [
      "Offline-first: queues actions and syncs on reconnect",
      "Photo, signature, and barcode proof-of-delivery",
      "Turn-by-turn navigation integration",
      "Real-time task list with priority routing",
      "Instant push notifications for new assignments",
    ],
  },
  {
    slug: "invoicing",
    icon: "file-text",
    title: "Finance & Invoicing",
    summary:
      "Auto-generate invoices on delivery confirmation and collect payments across every major regional method — all without touching a spreadsheet.",
    bullets: [
      "Invoice auto-generation on POD confirmation",
      "VAT, COD, and multi-currency support",
      "Overdue reminder workflows that run automatically",
      "Stripe, M-Pesa, Paystack, and GoCardless integrations",
      "Exportable audit trail for reconciliation",
    ],
  },
  {
    slug: "customer-tracking",
    icon: "map-pin",
    title: "Customer Tracking Portal",
    summary:
      "Give your customers a fully branded, public tracking experience on your domain — no login required, no Fauward branding.",
    bullets: [
      "Custom domain for every tenant",
      "Live map view with estimated arrival",
      "SMS and email notification templates you control",
      "QR-code tracking link on packing slips",
      "Customer-configurable notification preferences",
    ],
  },
  {
    slug: "white-label-platform",
    icon: "layout",
    title: "White-Label Platform",
    summary:
      "Launch a complete branded logistics portal under your own domain, colours, and logo in under 10 minutes — no engineers needed.",
    bullets: [
      "Full theme control: logo, colours, fonts",
      "Custom domain with SSL auto-provisioning",
      "Role-based access for staff, Fauward Go operators, and customers",
      "Branded email and SMS notifications",
      "Tenant-scoped data isolation",
    ],
  },
  {
    slug: "api-integrations",
    icon: "code",
    title: "API & Integrations",
    summary:
      "Connect Fauward to your existing stack via REST API, webhooks, or direct carrier integrations — all documented and versioned.",
    bullets: [
      "RESTful API with full OpenAPI documentation",
      "Webhook events for every lifecycle transition",
      "Pre-built carrier connectors (DHL, Aramex, GIG, Royal Mail)",
      "ERP and WMS sync via standard event payloads",
      "Sandbox environment for safe testing",
    ],
  },
];

// ─── Business Solutions ────────────────────────────────────────────────────────

export type BusinessSolution = {
  slug: string;
  audience: string;
  title: string;
  summary: string;
  outcomes: string[];
  cta: string;
};

export const BUSINESS_SOLUTIONS: BusinessSolution[] = [
  {
    slug: "courier-startups",
    audience: "Courier Startups",
    title: "Launch a professional courier operation in one afternoon",
    summary:
      "Skip the months of custom development. Fauward gives you a branded platform, Fauward Go, and customer tracking portal — ready to take your first booking today.",
    outcomes: [
      "First live shipment in under 10 minutes",
      "Professional customer-facing tracking page from day one",
      "Grow your team without paying per seat",
    ],
    cta: "Start Free Trial",
  },
  {
    slug: "freight-operators",
    audience: "Freight Operators",
    title: "Replace spreadsheets with a single source of truth",
    summary:
      "Multi-depot freight operations need more than tracking links. Fauward gives dispatchers, Fauward Go operators, and finance one coherent platform — with the audit trail to back it up.",
    outcomes: [
      "Multi-depot route and hub-and-spoke visibility",
      "Finance and ops share one live ledger",
      "Compliance-ready audit trail for every transition",
    ],
    cta: "See Enterprise Plans",
  },
  {
    slug: "3pl-providers",
    audience: "3PL Providers",
    title: "Power your clients with white-label logistics software",
    summary:
      "Offer each of your clients their own branded portal. Fauward's multi-tenant architecture means one account manages unlimited client environments — all isolated.",
    outcomes: [
      "Unlimited client tenants under one account",
      "Branded portals for every client",
      "Per-tenant SLA and performance reporting",
    ],
    cta: "Talk to Sales",
  },
  {
    slug: "enterprise-fleets",
    audience: "Enterprise Fleets",
    title: "Enterprise controls without enterprise complexity",
    summary:
      "SSO, audit logs, dedicated support, and SLA-backed uptime — all available when your operation outgrows the basics. No re-platforming required.",
    outcomes: [
      "SAML/SSO for centralized identity management",
      "Dedicated onboarding engineer and support SLA",
      "Unlimited seats, unlimited shipments",
    ],
    cta: "Talk to Sales",
  },
];

// ─── About Us ─────────────────────────────────────────────────────────────────

export type TeamMember = {
  name: string;
  role: string;
  bio: string;
  initials: string;
  linkedIn?: string;
};

export const TEAM_MEMBERS: TeamMember[] = [
  {
    name: "Temitope Agbola",
    role: "Founder & CEO",
    bio: "Built logistics software for operators across Africa and Asia before founding Fauward. Former Head of Engineering at a pan-African courier network.",
    initials: "TA",
  },
  {
    name: "Priya Nair",
    role: "CTO",
    bio: "15 years building distributed systems. Previously principal engineer at a European parcel network. Obsessed with reliability and observability.",
    initials: "PN",
  },
  {
    name: "Marcus Osei",
    role: "Head of Product",
    bio: "Ex-operations manager turned product leader. Spent five years running a regional courier fleet before moving into software.",
    initials: "MO",
  },
  {
    name: "Lina Petrov",
    role: "Head of Customer Success",
    bio: "Spent a decade onboarding enterprise logistics clients at two global SaaS companies. Ensures every team goes live without friction.",
    initials: "LP",
  },
];

export type CompanyValue = {
  icon: string;
  title: string;
  description: string;
};

export const COMPANY_VALUES: CompanyValue[] = [
  {
    icon: "zap",
    title: "Operator-first",
    description:
      "Every feature is validated against real logistics workflows. We don't build for demos — we build for dispatchers managing 300 stops a day.",
  },
  {
    icon: "shield",
    title: "Reliability above all",
    description:
      "A missed delivery notification is a failed business promise. Our infrastructure is built to stay online when your Fauward Go operators are on the road.",
  },
  {
    icon: "globe",
    title: "Global from day one",
    description:
      "We support M-Pesa in Nairobi, GoCardless in Manchester, and Checkout.com in Dubai. No afterthoughts — regional coverage is in the core.",
  },
  {
    icon: "users",
    title: "Transparent partnership",
    description:
      "No per-seat traps, no hidden overage fees, no bait-and-switch onboarding. Our pricing and roadmap are as straightforward as our contracts.",
  },
];

export type CompanyMilestone = {
  year: string;
  event: string;
};

export const COMPANY_MILESTONES: CompanyMilestone[] = [
  { year: "2021", event: "Founded in London — first internal prototype built for a Lagos-based courier" },
  { year: "2022", event: "Closed seed round; launched beta across UK and West Africa" },
  { year: "2023", event: "Launched Asia region; crossed 10,000 shipments processed per month" },
  { year: "2024", event: "Released API v2, webhooks, and white-label multi-tenancy" },
  { year: "2025", event: "Launched Fauward Agent — policy-controlled AI operations layer for logistics" },
];

// ─── News / Blog ───────────────────────────────────────────────────────────────

export type NewsArticle = {
  slug: string;
  category: string;
  title: string;
  summary: string;
  publishedAt: string;
  readMinutes: number;
  featured?: boolean;
};

export const NEWS_ARTICLES: NewsArticle[] = [
  {
    slug: "ai-agent-launch",
    category: "Product",
    title: "Introducing Fauward Agent: policy-controlled operations powered by AI",
    summary:
      "Today we're launching Fauward Agent — a policy-controlled AI layer that automates safe operations, escalates risky ones for team approval, and keeps logistics running 24/7.",
    publishedAt: "2025-04-10",
    readMinutes: 6,
    featured: true,
  },
  {
    slug: "asia-expansion",
    category: "Company",
    title: "Fauward expands Asia coverage with Checkout.com and HyperPay integrations",
    summary:
      "Gulf-based logistics operators can now accept card payments through Checkout.com and HyperPay — fully embedded in the Fauward invoicing flow.",
    publishedAt: "2025-03-22",
    readMinutes: 4,
  },
  {
    slug: "offline-driver-sync",
    category: "Engineering",
    title: "How we built offline-first proof-of-delivery for Fauward Go operators in low-connectivity zones",
    summary:
      "An inside look at the sync architecture that lets Fauward Go operators capture signatures and photos without a data connection — and reliably flush them when back online.",
    publishedAt: "2025-03-05",
    readMinutes: 8,
  },
  {
    slug: "per-seat-pricing-broken",
    category: "Insights",
    title: "Per-seat pricing is broken for logistics — here's what we did instead",
    summary:
      "When you hire your fifth dispatcher, your SaaS bill shouldn't jump £150 a month. We explain why volume-based pricing is the only model that makes sense for ops teams.",
    publishedAt: "2025-02-18",
    readMinutes: 5,
  },
  {
    slug: "api-v2-release",
    category: "Product",
    title: "API v2 is live: webhooks, richer events, and a public OpenAPI spec",
    summary:
      "API v2 brings structured event payloads, per-tenant webhook endpoints, idempotency keys, and a fully documented OpenAPI 3.1 spec — all available on the Pro plan and above.",
    publishedAt: "2025-01-30",
    readMinutes: 5,
  },
  {
    slug: "cod-workflows-africa",
    category: "Insights",
    title: "Cash-on-delivery in 2025: how African logistics operators are handling the last mile",
    summary:
      "COD still accounts for over 60% of e-commerce deliveries in several African markets. We look at how forward-thinking operators are digitising the collection step.",
    publishedAt: "2025-01-14",
    readMinutes: 7,
  },
];

// ─── Support / Help Centre ─────────────────────────────────────────────────────

export type SupportCategory = {
  slug: string;
  icon: string;
  title: string;
  description: string;
  articles: Array<{ title: string; href: string }>;
};

export const SUPPORT_CATEGORIES: SupportCategory[] = [
  {
    slug: "getting-started",
    icon: "rocket",
    title: "Getting Started",
    description: "Set up your account, configure your brand, and create your first shipment.",
    articles: [
      { title: "Create your Fauward account", href: "/support/getting-started/create-account" },
      { title: "Configure your brand and domain", href: "/support/getting-started/branding" },
      { title: "Invite staff and assign roles", href: "/support/getting-started/invite-staff" },
      { title: "Create your first shipment", href: "/support/getting-started/first-shipment" },
    ],
  },
  {
    slug: "shipments",
    icon: "package",
    title: "Shipments & Tracking",
    description: "Understand the shipment lifecycle, status transitions, and public tracking.",
    articles: [
      { title: "Shipment status lifecycle explained", href: "/support/shipments/lifecycle" },
      { title: "Setting up public tracking pages", href: "/support/shipments/public-tracking" },
      { title: "Handling failed deliveries", href: "/support/shipments/failed-delivery" },
      { title: "Bulk importing shipments via CSV", href: "/support/shipments/bulk-import" },
    ],
  },
  {
    slug: "finance",
    icon: "credit-card",
    title: "Finance & Billing",
    description: "Invoice generation, payment collections, and reconciliation.",
    articles: [
      { title: "How invoice auto-generation works", href: "/support/finance/auto-invoicing" },
      { title: "Connecting a payment gateway", href: "/support/finance/payment-gateways" },
      { title: "Setting up overdue reminders", href: "/support/finance/overdue-reminders" },
      { title: "Exporting finance reports", href: "/support/finance/reports" },
    ],
  },
  {
    slug: "api",
    icon: "code",
    title: "API & Developers",
    description: "REST API reference, webhook setup, and integration guides.",
    articles: [
      { title: "API authentication and keys", href: "/support/api/authentication" },
      { title: "Webhook event reference", href: "/support/api/webhooks" },
      { title: "Testing in the sandbox environment", href: "/support/api/sandbox" },
      { title: "Rate limits and error handling", href: "/support/api/rate-limits" },
    ],
  },
  {
    slug: "drivers",
    icon: "smartphone",
    title: "Fauward Go",
    description: "Installing, using, and troubleshooting the Fauward Go field app.",
    articles: [
      { title: "Download and install Fauward Go", href: "/support/drivers/install" },
      { title: "Capturing proof-of-delivery", href: "/support/drivers/proof-of-delivery" },
      { title: "Offline mode and syncing", href: "/support/drivers/offline" },
      { title: "Fauward Go troubleshooting guide", href: "/support/drivers/troubleshooting" },
    ],
  },
  {
    slug: "account",
    icon: "settings",
    title: "Account & Security",
    description: "Manage your subscription, team access, and security settings.",
    articles: [
      { title: "Changing your plan or billing", href: "/support/account/billing" },
      { title: "Two-factor authentication", href: "/support/account/2fa" },
      { title: "Audit log and access history", href: "/support/account/audit-log" },
      { title: "Cancelling or pausing your account", href: "/support/account/cancel" },
    ],
  },
];

// ─── AI Agent App ──────────────────────────────────────────────────────────────

export type AgentCapability = {
  icon: string;
  title: string;
  description: string;
};

export const AGENT_CAPABILITIES: AgentCapability[] = [
  {
    icon: "cpu",
    title: "Shipment Assignment",
    description:
      "New shipments are assigned to the optimal Fauward Go operator automatically — factoring load, proximity, and current workload. No dispatcher needed.",
  },
  {
    icon: "alert-triangle",
    title: "Exception Management",
    description:
      "Detect failed deliveries, SLA breaches, and route anomalies in real time. The agent notifies the customer immediately and flags rerouting for your team to approve.",
  },
  {
    icon: "message-square",
    title: "Natural Language Ops",
    description:
      "Ask your operations data questions in plain English. \"How many deliveries failed this week in Birmingham?\" — answered in seconds.",
  },
  {
    icon: "trending-up",
    title: "Operations Reporting",
    description:
      "Get a full picture of your operations in plain English — delivery success rates, SLA breach trends, top delay reasons, and Fauward Go operator performance — all from a single query.",
  },
  {
    icon: "bell",
    title: "Proactive Alerts",
    description:
      "Get notified before a SLA is breached — not after. The agent monitors every shipment in real time and surfaces risk early.",
  },
  {
    icon: "link",
    title: "Carrier Intelligence",
    description:
      "Automatically select the best carrier for each shipment based on price, reliability score, and current service-level availability.",
  },
];

export const VALUE_PROP_BULLETS = [
  "Launch a branded logistics platform in minutes",
  "Manage shipment and invoice lifecycles in one place",
  "Automate customer updates with API and webhooks",
  "Scale from startup operations to enterprise delivery networks"
];

// ─── How It Works ─────────────────────────────────────────────────────────────

export type HowItWorksStep = {
  step: number;
  title: string;
  description: string;
  icon: "user-plus" | "package-plus" | "share-2";
};

export const HOW_IT_WORKS_STEPS: HowItWorksStep[] = [
  {
    step: 1,
    title: "Sign up and set your brand",
    description:
      "Enter your company name, upload your logo, and set your brand colour. Takes about 5 minutes. No engineer required.",
    icon: "user-plus"
  },
  {
    step: 2,
    title: "Add staff, carriers, and your first shipment",
    description:
      "Invite dispatchers, connect your delivery partners, and create your first live shipment with a real tracking number.",
    icon: "package-plus"
  },
  {
    step: 3,
    title: "Your customers track themselves",
    description:
      "Share the branded tracking link. Customers get real-time status updates — no phone calls, no manual chasing.",
    icon: "share-2"
  }
];

// ─── Persona Cards ────────────────────────────────────────────────────────────

export type PersonaCard = {
  role: string;
  context: string;
  pain: string;
  gain: string;
};

export const PERSONA_CARDS: PersonaCard[] = [
  {
    role: "Logistics founder or MD",
    context: "Running a courier or freight business without proper software",
    pain: "Spreadsheets, WhatsApp groups, and no real visibility into what's happening on the ground",
    gain: "A branded platform that looks like you built it yourself — without hiring an engineering team or paying enterprise prices"
  },
  {
    role: "Operations manager",
    context: "Juggling dispatch, Fauward Go operators, and constant customer status requests",
    pain: "Endless status calls, manual reconciliation, and no single view of what's in transit",
    gain: "One screen for every shipment state — dispatchers stop firefighting and customers stop calling"
  },
  {
    role: "Finance lead",
    context: "Chasing invoice payments and waiting for Fauward Go operators to confirm deliveries",
    pain: "The invoice-to-payment cycle is entirely manual and depends on people remembering to do things",
    gain: "Invoices generate from confirmed deliveries. Overdue reminders run on a schedule. Collections happen without chasing."
  }
];
