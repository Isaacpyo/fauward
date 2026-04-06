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
    ctaLabel: "Contact Sales",
    ctaHref: "/signup?plan=enterprise",
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
  { feature: "Shipment state machine", starter: true, pro: true, enterprise: true },
  { feature: "Invoice lifecycle", starter: true, pro: true, enterprise: true },
  { feature: "Public tracking page", starter: true, pro: true, enterprise: true },
  { feature: "API access", starter: false, pro: true, enterprise: true },
  { feature: "Webhook events", starter: false, pro: true, enterprise: true },
  { feature: "Custom domain", starter: false, pro: true, enterprise: true },
  { feature: "SSO / SAML", starter: false, pro: false, enterprise: true },
  { feature: "SLA", starter: false, pro: false, enterprise: true },
  { feature: "Dedicated support channel", starter: false, pro: false, enterprise: true }
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
  { value: "3", label: "Regions supported at launch", mono: false },
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
