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
      "Driver mobile proof-of-delivery",
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
  { feature: "Driver proof-of-delivery", starter: true, pro: true, enterprise: true },
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
  { criterion: "Driver offline support", fauward: "Built-in, syncs on reconnect", genericSaaS: "Not available" }
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
  shortDescription: string;
  pageDescription: string;
  imageSrc: string;
  bullets: string[];
  cards: Array<{ title: string; description: string }>;
};

export const MARKETING_FEATURES: MarketingFeature[] = [
  {
    slug: "shipment-management",
    title: "Stop losing track of where things are",
    shortDescription:
      "Every shipment moves through a clear, auditable lifecycle — your dispatchers and customers always know the status.",
    pageDescription:
      "Keep operations aligned with a canonical shipment state machine from PENDING to DELIVERED, with clear handling for branch outcomes.",
    imageSrc: "/images/screens/portal-tracking.svg",
    bullets: [
      "Know which shipments are at risk before customers complain",
      "Drivers confirm handoffs without phone calls",
      "Customers self-serve on a branded tracking page"
    ],
    cards: [
      {
        title: "One source of truth",
        description:
          "Dispatch, finance, and drivers all read from the same live state — no reconciliation needed."
      },
      {
        title: "Fewer support tickets",
        description:
          "Proactive status updates cut inbound 'where is my parcel?' queries by removing the uncertainty."
      },
      {
        title: "Audit trail for disputes",
        description:
          "Every status transition is timestamped with actor and notes, making proof-of-delivery disputes resolvable in seconds."
      }
    ]
  },
  {
    slug: "finance",
    title: "Get paid without chasing invoices",
    shortDescription:
      "Invoice creation to collection in one screen — overdue reminders run automatically.",
    pageDescription:
      "Track invoice states from DRAFT to PAID, automate reminders for OVERDUE accounts, and keep tenant-level reporting consistent.",
    imageSrc: "/images/screens/portal-finance.svg",
    bullets: [
      "See every unpaid invoice across all customers at a glance",
      "Automated overdue reminders stop the manual follow-up cycle",
      "Finance and operations share one ledger — no CSV exports between teams"
    ],
    cards: [
      {
        title: "Cash flow visibility",
        description:
          "Monitor invoiced, paid, and overdue totals from a single finance dashboard."
      },
      {
        title: "Reduced manual follow-up",
        description:
          "Automated reminder workflows lower finance overhead and speed up collection."
      },
      {
        title: "Audit-ready records",
        description:
          "Every invoice action is timestamped for compliance and reconciliation."
      }
    ]
  },
  {
    slug: "white-label",
    title: "Launch under your own brand in minutes",
    shortDescription:
      "Your logo, domain, and colour palette — provisioned in minutes, not sprints.",
    pageDescription:
      "Launch a branded tenant portal and tracking pages quickly while preserving semantic logistics status colours across all customers.",
    imageSrc: "/images/screens/portal-overview.svg",
    bullets: [
      "Your customers see your brand on every screen — not Fauward's",
      "Custom domain for public shipment tracking",
      "Tenant theme applied instantly from API configuration"
    ],
    cards: [
      {
        title: "Live in minutes",
        description:
          "Provision a fully branded platform without a single line of custom engineering work."
      },
      {
        title: "Consistent status semantics",
        description:
          "Delivery success, warning, and error states stay universally readable for safety."
      },
      {
        title: "Enterprise-ready controls",
        description:
          "Role-based access for operators, finance teams, and customers — all under your identity."
      }
    ]
  }
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
  slug: "uk" | "africa" | "mena" | "global";
  name: string;
  label: string;
  summary: string;
  highlights: string[];
  badges?: string[];
};

export const REGIONS: RegionInfo[] = [
  {
    slug: "uk",
    name: "United Kingdom",
    label: "UK",
    summary: "Operate multi-depot courier and freight workflows with regional compliance awareness.",
    highlights: [
      "VAT-ready invoicing flows",
      "Urban and nationwide route planning support",
      "Local support coverage in GMT business hours"
    ],
    badges: ["Stripe", "GoCardless", "DPD", "Royal Mail", "Evri"]
  },
  {
    slug: "africa",
    name: "Africa",
    label: "Africa",
    summary:
      "Support M-Pesa and Paystack collections, offline driver workflows, and cross-border operations from a single platform.",
    highlights: [
      "Multi-currency finance controls",
      "Offline-tolerant driver workflows",
      "Country-specific delivery proof collection"
    ],
    badges: ["M-Pesa", "Paystack", "Flutterwave", "GIG Logistics", "DHL Africa"]
  },
  {
    slug: "mena",
    name: "MENA",
    label: "MENA",
    summary:
      "Handle COD, Aramex, and hub-and-spoke operations with payment flexibility and local onboarding playbooks.",
    highlights: [
      "Flexible COD and invoice management",
      "Hub-and-spoke operational modelling",
      "Regional onboarding and support playbooks"
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
      "Finance stopped chasing drivers for delivery confirmations. The invoice goes out automatically when the POD comes in. That alone changed how the business runs.",
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
  { quote: "Finance stopped asking me where the invoices were.", name: "Ops manager, MENA fleet operator" }
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
        question: "What happens if our driver loses connectivity mid-delivery?",
        answer:
          "The driver app queues actions locally and syncs when connectivity returns. Proof-of-delivery, status updates, and failed delivery notes are all preserved offline. No data is lost during connectivity gaps."
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
    title: "Driver Mobile App",
    summary:
      "A purpose-built driver app that works on and offline — capturing signatures, photos, and barcodes for irrefutable proof-of-delivery.",
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
      "Role-based access for staff, drivers, and customers",
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
      "Skip the months of custom development. Fauward gives you a branded platform, driver app, and customer tracking portal — ready to take your first booking today.",
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
      "Multi-depot freight operations need more than tracking links. Fauward gives dispatchers, drivers, and finance one coherent platform — with the audit trail to back it up.",
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
    bio: "Built logistics software for operators across Africa and MENA before founding Fauward. Former Head of Engineering at a pan-African courier network.",
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
      "A missed delivery notification is a failed business promise. Our infrastructure is built to stay online when your drivers are on the road.",
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
  { year: "2023", event: "Launched MENA region; crossed 10,000 shipments processed per month" },
  { year: "2024", event: "Released API v2, webhooks, and white-label multi-tenancy" },
  { year: "2025", event: "Launched AI Agent for autonomous shipment dispatch and exception handling" },
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
    title: "Introducing Fauward Agent: autonomous shipment dispatch powered by AI",
    summary:
      "Today we're launching Fauward Agent — an AI-powered layer that handles shipment assignment, exception routing, and driver communications without manual intervention.",
    publishedAt: "2025-04-10",
    readMinutes: 6,
    featured: true,
  },
  {
    slug: "mena-expansion",
    category: "Company",
    title: "Fauward expands MENA coverage with Checkout.com and HyperPay integrations",
    summary:
      "Gulf-based logistics operators can now accept card payments through Checkout.com and HyperPay — fully embedded in the Fauward invoicing flow.",
    publishedAt: "2025-03-22",
    readMinutes: 4,
  },
  {
    slug: "offline-driver-sync",
    category: "Engineering",
    title: "How we built offline-first proof-of-delivery for drivers in low-connectivity zones",
    summary:
      "An inside look at the sync architecture that lets drivers capture signatures and photos without a data connection — and reliably flush them when back online.",
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
    title: "Driver App",
    description: "Installing, using, and troubleshooting the driver mobile app.",
    articles: [
      { title: "Download and install the driver app", href: "/support/drivers/install" },
      { title: "Capturing proof-of-delivery", href: "/support/drivers/proof-of-delivery" },
      { title: "Offline mode and syncing", href: "/support/drivers/offline" },
      { title: "Driver troubleshooting guide", href: "/support/drivers/troubleshooting" },
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
    title: "Autonomous Dispatch",
    description:
      "Assign incoming shipments to the optimal driver automatically — factoring load, proximity, and historical performance.",
  },
  {
    icon: "alert-triangle",
    title: "Exception Management",
    description:
      "Detect failed deliveries, SLA breaches, and route anomalies in real time — and trigger re-routing or customer notifications without human input.",
  },
  {
    icon: "message-square",
    title: "Natural Language Ops",
    description:
      "Ask your operations data questions in plain English. \"How many deliveries failed this week in Birmingham?\" — answered in seconds.",
  },
  {
    icon: "trending-up",
    title: "Demand Forecasting",
    description:
      "Predict shipment volume by zone and day using historical patterns — so you have the right drivers rostered before the surge.",
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
    context: "Juggling dispatch, drivers, and constant customer status requests",
    pain: "Endless status calls, manual reconciliation, and no single view of what's in transit",
    gain: "One screen for every shipment state — dispatchers stop firefighting and customers stop calling"
  },
  {
    role: "Finance lead",
    context: "Chasing invoice payments and waiting for drivers to confirm deliveries",
    pain: "The invoice-to-payment cycle is entirely manual and depends on people remembering to do things",
    gain: "Invoices generate from confirmed deliveries. Overdue reminders run on a schedule. Collections happen without chasing."
  }
];
