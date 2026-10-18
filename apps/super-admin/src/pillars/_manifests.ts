import {
  BadgeDollarSign,
  BriefcaseBusiness,
  Building2,
  ChartNoAxesCombined,
  ClipboardList,
  Database,
  FileCheck2,
  FileText,
  Flag,
  Handshake,
  HeartHandshake,
  KeyRound,
  LifeBuoy,
  LineChart,
  LockKeyhole,
  Megaphone,
  MessageSquareText,
  PackageCheck,
  Receipt,
  RefreshCcw,
  Scale,
  SearchCheck,
  ShieldAlert,
  ShieldCheck,
  Siren,
  Sparkles,
  Stethoscope,
  Tags,
  UserCog,
  Users,
  Wallet,
  Workflow,
  type LucideIcon
} from "lucide-react";
import type { Permission } from "@fauward/internal-rbac";

export type PillarId = "platform" | "revenue" | "customer" | "trust" | "gtm";

export type BadgeKey = "tenant-count" | "dlq-depth" | "mrr" | "active-tenants" | "shipments-today" | "placeholder";

/** live = meets the definition of done (architecture §12); preview = planned, not finished; deferred = not planned. */
export type ServiceStatus = "live" | "preview" | "deferred";
export type LivePhase = 0 | 1 | 2 | 3 | 4 | 5;

export type PillarServiceManifest = {
  id: string;
  name: string;
  route: string;
  owner: string;
  description: string;
  requiredPermission: Permission;
  badgeKey?: BadgeKey;
  icon: LucideIcon;
  status: ServiceStatus;
  /** Phase in which the service goes live (ADR 0002); null when not planned. */
  livePhase: LivePhase | null;
  /** Every console path the service owns (D1). */
  routes: string[];
  /** Preview: what is not wired yet (from 20-service-catalogue.md). Deferred: why it is not planned. */
  note?: string;
};

export type PillarManifest = {
  id: PillarId;
  name: string;
  shortName: string;
  route: string;
  description: string;
  accent: string;
  icon: LucideIcon;
  services: PillarServiceManifest[];
};

export const PILLARS: PillarManifest[] = [
  {
    id: "platform",
    name: "Platform Operations",
    shortName: "Platform",
    route: "/platform",
    description: "Reliability of the product",
    accent: "#2563EB",
    icon: Building2,
    services: [
      { id: "tenants", name: "Tenant Control Plane", route: "/platform/tenants", owner: "Platform", description: "Directory, lifecycle, plan and quota control.", requiredPermission: "platform.tenants.read", badgeKey: "tenant-count", icon: Building2, status: "preview", livePhase: 1, routes: ["/platform/tenants", "/platform/tenants/region-requests", "/platform/tenants/:id"], note: "List and detail are generated sample rows; suspend, plan-override and delete dialogs do nothing yet. The real tenant API is wired in Phase 1." },
      { id: "impersonation", name: "Impersonation Center", route: "/platform/impersonation", owner: "Platform", description: "Time-bound view-as with reason logging.", requiredPermission: "platform.impersonation.start", icon: UserCog, status: "preview", livePhase: 1, routes: ["/platform/impersonation"], note: "Read-only by default with a one-time exchange code (Phase 0 hardening). Tenant picker, active-session list and tenant-side visibility land in Phases 1 and 2." },
      { id: "flags", name: "Feature Flags & Releases", route: "/platform/flags", owner: "Platform", description: "Per-tenant gates, rollouts, kill switches.", requiredPermission: "platform.flags.read", icon: Flag, status: "preview", livePhase: 4, routes: ["/platform/flags", "/platform/flags/:key", "/platform/flags/:key/audit", "/platform/releases"], note: "LaunchDarkly list only; per-tenant overrides are disabled until native overrides (WP-1.4); releases are not wired." },
      { id: "queues", name: "Queue Operations", route: "/platform/queues", owner: "SRE", description: "DLQ inspection, replay and throttling.", requiredPermission: "platform.queues.read", badgeKey: "dlq-depth", icon: Workflow, status: "preview", livePhase: 3, routes: ["/platform/queues"], note: "Queue counts are real; DLQ depth, replay, purge and job inspection are not wired." },
      { id: "incidents", name: "Incident Management", route: "/platform/incidents", owner: "SRE", description: "Active incidents, runbooks and postmortems.", requiredPermission: "platform.incidents.read", icon: Siren, status: "preview", livePhase: 4, routes: ["/platform/incidents", "/platform/incidents/runbooks", "/platform/incidents/:id", "/platform/incidents/:id/postmortem"], note: "PagerDuty inbound only; native create/resolve and runbook editing are not wired." },
      { id: "health", name: "System Health", route: "/platform/health", owner: "SRE", description: "SLOs, latency, error rate and uptime.", requiredPermission: "platform.health.read", icon: Stethoscope, status: "preview", livePhase: 3, routes: ["/platform/health"], note: "Database and Redis latency are real; uptime, p95 latency and error-rate cards are not wired." },
      { id: "jobs", name: "Background Jobs", route: "/platform/jobs", owner: "Platform", description: "Cron status, scheduled tasks and retries.", requiredPermission: "platform.jobs.read", icon: RefreshCcw, status: "preview", livePhase: 3, routes: ["/platform/jobs"], note: "No console route yet; scheduled jobs run in the worker without run history." },
      { id: "integrations", name: "Integration Health", route: "/platform/integrations", owner: "Platform", description: "Stripe, Twilio and carrier API status.", requiredPermission: "platform.integrations.read", icon: PackageCheck, status: "preview", livePhase: 4, routes: ["/platform/integrations", "/platform/integrations/credentials", "/platform/integrations/webhooks", "/platform/integrations/:provider"], note: "Status is written only by inbound vendor webhooks; there is no poller and credentials are empty." },
      { id: "database", name: "Database Operations", route: "/platform/database", owner: "Platform", description: "Migration tracker, slow queries and schema viewer.", requiredPermission: "platform.database.read", icon: Database, status: "preview", livePhase: 4, routes: ["/platform/database"], note: "No console route yet (read-only migrations, slow queries and schema viewer planned)." }
    ]
  },
  {
    id: "revenue",
    name: "Revenue Operations",
    shortName: "Revenue",
    route: "/revenue",
    description: "Billing, finance and revenue control",
    accent: "#16A34A",
    icon: Wallet,
    services: [
      { id: "billing", name: "Billing Console", route: "/revenue/billing", owner: "Finance", description: "Invoices, manual creation, refunds and credits.", requiredPermission: "revenue.invoices.read", icon: Receipt, status: "preview", livePhase: 1, routes: ["/revenue/billing", "/revenue/billing/invoices", "/revenue/billing/invoices/create", "/revenue/billing/invoices/:id", "/revenue/billing/credit-notes", "/revenue/billing/refunds", "/revenue/billing/payments"], note: "Invoices are real; platform and tenant-customer ledgers are still mixed until WP-1.5." },
      { id: "dunning", name: "Dunning Manager", route: "/revenue/dunning", owner: "Finance", description: "Failed payment recovery.", requiredPermission: "revenue.dunning.read", icon: RefreshCcw, status: "preview", livePhase: 4, routes: ["/revenue/dunning", "/revenue/dunning/:tenantId", "/revenue/dunning/sequences", "/revenue/dunning/save-offers"], note: "Retry only records an event; sequences have no producer and save offers cannot be redeemed." },
      { id: "subscriptions", name: "Subscription Manager", route: "/revenue/subscriptions", owner: "RevOps", description: "Plans, custom contracts and MRR tracking.", requiredPermission: "revenue.subscriptions.read", icon: Wallet, status: "preview", livePhase: 2, routes: ["/revenue/subscriptions", "/revenue/subscriptions/:id", "/revenue/subscriptions/contracts", "/revenue/subscriptions/overrides"], note: "Subscriptions are written only at signup; contracts and overrides are never applied; detail ignores the id." },
      { id: "disputes", name: "Disputes & Chargebacks", route: "/revenue/disputes", owner: "Finance", description: "Stripe dispute queue.", requiredPermission: "revenue.disputes.read", icon: ShieldAlert, status: "preview", livePhase: 4, routes: ["/revenue/disputes"], note: "No route or model yet; disputes need the Stripe webhook producer." },
      { id: "tax", name: "Tax & Compliance", route: "/revenue/tax", owner: "Finance", description: "VAT, GST and sales tax per region.", requiredPermission: "revenue.tax.read", icon: Scale, status: "preview", livePhase: 4, routes: ["/revenue/tax", "/revenue/tax/returns", "/revenue/tax/registrations", "/revenue/tax/exemptions"], note: "Registrations, returns and exemptions have no producers; an approved exemption is not read by invoicing." },
      { id: "recognition", name: "Revenue Recognition", route: "/revenue/recognition", owner: "Finance", description: "Deferred vs recognised revenue.", requiredPermission: "revenue.recognition.read", icon: FileCheck2, status: "deferred", livePhase: null, routes: ["/revenue/recognition"], note: "Needs an accounting-system integration; not planned until an ADR names the source of truth." },
      { id: "commissions", name: "Reseller Commissions", route: "/revenue/commissions", owner: "RevOps", description: "Calculation and payout queue.", requiredPermission: "revenue.commissions.read", icon: Handshake, status: "preview", livePhase: null, routes: ["/revenue/commissions", "/revenue/commissions/payouts", "/revenue/commissions/disputes", "/revenue/commissions/:partnerId"], note: "No reseller programme: this service is being removed (WP-4.0b) and its data has no producer." },
      { id: "analytics", name: "Revenue Analytics", route: "/revenue/analytics", owner: "RevOps", description: "MRR, ARR, churn and cohorts.", requiredPermission: "revenue.analytics.read", badgeKey: "mrr", icon: LineChart, status: "preview", livePhase: 3, routes: ["/revenue/analytics"], note: "Charts are static sample data; MRR is computed from list-price literals." }
    ]
  },
  {
    id: "customer",
    name: "Customer Operations",
    shortName: "Customer",
    route: "/customer",
    description: "Support, success and onboarding",
    accent: "#9333EA",
    icon: HeartHandshake,
    services: [
      { id: "support", name: "Support Desk", route: "/customer/support", owner: "Support", description: "Ticket queue and support workflows.", requiredPermission: "customer.support.read", icon: LifeBuoy, status: "preview", livePhase: 2, routes: ["/customer/support", "/customer/support/sla", "/customer/support/macros"], note: "Tickets are real but end-customer and Fauward tickets are mixed; staff replies, internal notes and reply emails are not wired correctly." },
      { id: "360", name: "Customer 360", route: "/customer/360", owner: "Success", description: "Unified tenant view.", requiredPermission: "customer.360.read", icon: SearchCheck, status: "preview", livePhase: 1, routes: ["/customer/360", "/customer/360/:tenantId"], note: "Aggregate is real; tabs share one query, and some header values and the health fallback are not real yet." },
      { id: "success", name: "CS Console", route: "/customer/success", owner: "Success", description: "Health scoring, churn risk and playbooks.", requiredPermission: "customer.success.read", icon: HeartHandshake, status: "preview", livePhase: 4, routes: ["/customer/success", "/customer/success/at-risk", "/customer/success/expansion", "/customer/success/playbooks", "/customer/success/playbooks/:id/runs", "/customer/success/health-scoring"], note: "Health score inputs are partly static and playbook runs are never executed." },
      { id: "feedback", name: "NPS & Feedback", route: "/customer/feedback", owner: "Success", description: "Survey results and themes.", requiredPermission: "customer.feedback.read", icon: MessageSquareText, status: "preview", livePhase: 2, routes: ["/customer/feedback"], note: "No route, model or tenant-side producer yet." },
      { id: "kb", name: "Knowledge Base Mgmt", route: "/customer/kb", owner: "Support", description: "Internal runbooks and customer docs.", requiredPermission: "customer.kb.read", icon: FileText, status: "deferred", livePhase: null, routes: ["/customer/kb"], note: "Customer docs live on the marketing site; internal runbooks live in Incident runbooks (platform.incidents)." },
      { id: "comms", name: "Communications Hub", route: "/customer/comms", owner: "Support", description: "Mass email, banners and status notices.", requiredPermission: "customer.comms.read", icon: Megaphone, status: "preview", livePhase: 2, routes: ["/customer/comms"], note: "Announcements are real and shown to tenants; editing, expiry, receipts and the delivery log are not wired." },
      { id: "qbr", name: "QBR Center", route: "/customer/qbr", owner: "Success", description: "Quarterly business review prep.", requiredPermission: "customer.qbr.read", icon: ChartNoAxesCombined, status: "preview", livePhase: 4, routes: ["/customer/qbr", "/customer/qbr/templates", "/customer/qbr/:tenantId"], note: "Generate writes a stub deck; templates have no writer." },
      { id: "onboarding", name: "Onboarding Tracker", route: "/customer/onboarding", owner: "Success", description: "New tenant activation funnel.", requiredPermission: "customer.onboarding.read", icon: ClipboardList, status: "preview", livePhase: 2, routes: ["/customer/onboarding"], note: "The funnel reads steps the tenant portal marks done on every Next click; the real checklist is not shown." }
    ]
  },
  {
    id: "trust",
    name: "Trust, Compliance & Security",
    shortName: "Trust",
    route: "/trust",
    description: "Controls for compliance and risk",
    accent: "#DC2626",
    icon: ShieldCheck,
    services: [
      { id: "iam", name: "Employee IAM", route: "/trust/iam/users", owner: "Security", description: "Staff SSO, RBAC and sessions.", requiredPermission: "trust.iam.read", icon: Users, status: "live", livePhase: 0, routes: ["/trust/iam", "/trust/iam/users", "/trust/iam/users/:id", "/trust/iam/roles", "/trust/iam/roles/:id", "/trust/iam/permissions", "/trust/iam/groups"] },
      { id: "jit", name: "Just-in-Time Access", route: "/trust/jit", owner: "Security", description: "Break-glass elevation with approval.", requiredPermission: "trust.jit.request", icon: KeyRound, status: "preview", livePhase: 1, routes: ["/trust/jit", "/trust/jit/request", "/trust/jit/pending", "/trust/jit/active", "/trust/jit/audit"], note: "Approvals are not yet reflected in your session and most roles cannot request; fixed in WP-1.7." },
      { id: "audit", name: "Audit Log", route: "/trust/audit", owner: "Compliance", description: "Immutable, searchable SOC 2 audit log.", requiredPermission: "trust.audit.read", icon: ClipboardList, status: "preview", livePhase: 1, routes: ["/trust/audit", "/trust/audit/timeline", "/trust/audit/export", "/trust/audit/integrity"], note: "The read side is real; pagination and filters arrive in WP-1.9 and the hash chain is verifiable in Phase 5." },
      { id: "compliance", name: "Compliance Operations", route: "/trust/compliance", owner: "Legal", description: "GDPR DSAR, legal hold and exports.", requiredPermission: "trust.compliance.dsar.read", icon: FileCheck2, status: "preview", livePhase: 2, routes: ["/trust/compliance", "/trust/compliance/dsar", "/trust/compliance/dsar/:id", "/trust/compliance/legal-hold", "/trust/compliance/legal-hold/:id", "/trust/compliance/exports", "/trust/compliance/dpa", "/trust/compliance/subpoenas"], note: "DSAR exports are never processed and delivery links are not real; DPA and subpoena views show the DSAR queue." },
      { id: "safety", name: "Trust & Safety", route: "/trust/safety", owner: "Trust", description: "Fraud, AUP enforcement and suspensions.", requiredPermission: "trust.safety.read", icon: ShieldAlert, status: "preview", livePhase: 2, routes: ["/trust/safety", "/trust/safety/fraud", "/trust/safety/aup", "/trust/safety/suspensions", "/trust/safety/appeals", "/trust/safety/rules"], note: "Suspensions lack reasons and records; appeals do not lift suspensions; AUP and rules are empty." },
      { id: "kyc", name: "KYC & Sanctions", route: "/trust/kyc", owner: "Trust", description: "Enterprise verification and screening.", requiredPermission: "trust.kyc.read", icon: SearchCheck, status: "preview", livePhase: 4, routes: ["/trust/kyc", "/trust/kyc/pending", "/trust/kyc/:id", "/trust/kyc/sanctions", "/trust/kyc/pep"], note: "Persona and ComplyAdvantage only; the manual review queue is not wired." },
      { id: "secrets", name: "Secret Management", route: "/trust/secrets", owner: "Security", description: "API key rotation tracker.", requiredPermission: "trust.secrets.read", icon: LockKeyhole, status: "preview", livePhase: 4, routes: ["/trust/secrets", "/trust/secrets/expiring", "/trust/secrets/audit"], note: "The secret inventory has no producer yet." },
      { id: "security", name: "Security Monitoring", route: "/trust/security", owner: "Security", description: "Anomaly detection and login monitoring.", requiredPermission: "trust.security.read", icon: ShieldCheck, status: "preview", livePhase: 4, routes: ["/trust/security", "/trust/security/anomalies", "/trust/security/logins", "/trust/security/ip-blocks", "/trust/security/sessions"], note: "Anomalies and logins are real; IP blocks are recorded but not enforced." }
    ]
  },
  {
    id: "gtm",
    name: "Go-to-Market Operations",
    shortName: "GTM",
    route: "/gtm",
    description: "Sales, marketing and partner motion",
    accent: "#D97706",
    icon: BriefcaseBusiness,
    services: [
      { id: "pipeline", name: "Sales Pipeline", route: "/gtm/pipeline", owner: "Sales", description: "Deals, stages and conversion.", requiredPermission: "gtm.pipeline.read", icon: BriefcaseBusiness, status: "preview", livePhase: 4, routes: ["/gtm/pipeline", "/gtm/pipeline/forecasting", "/gtm/pipeline/:dealId"], note: "Deals have no producer (native CRUD and optional HubSpot import are planned)." },
      { id: "trials", name: "Trial Management", route: "/gtm/trials", owner: "Sales", description: "Active trials and conversion tracking.", requiredPermission: "gtm.trials.read", icon: Sparkles, status: "preview", livePhase: 4, routes: ["/gtm/trials", "/gtm/trials/expiring", "/gtm/trials/extensions", "/gtm/trials/:tenantId"], note: "Activation scores are real; extension approval does not change the trial end and requests have no producer." },
      { id: "demos", name: "Demo Environment Mgr", route: "/gtm/demos", owner: "Sales", description: "Provision and teardown demo tenants.", requiredPermission: "gtm.demos.read", icon: PackageCheck, status: "preview", livePhase: 4, routes: ["/gtm/demos", "/gtm/demos/create", "/gtm/demos/templates", "/gtm/demos/:id"], note: "Created demo tenants have no users and templates are hardcoded." },
      { id: "contracts", name: "CPQ & Contracts", route: "/gtm/contracts", owner: "Sales", description: "Quotes, approvals and MSAs.", requiredPermission: "gtm.contracts.read", icon: FileText, status: "preview", livePhase: 4, routes: ["/gtm/contracts", "/gtm/contracts/quotes", "/gtm/contracts/quotes/:id", "/gtm/contracts/discounts", "/gtm/contracts/msas"], note: "DocuSign envelopes are sent without a document; MSAs and approvals have no writer." },
      { id: "partners", name: "Partner Portal Mgmt", route: "/gtm/partners", owner: "Partnerships", description: "Resellers and deal registration.", requiredPermission: "gtm.partners.read", icon: Handshake, status: "preview", livePhase: null, routes: ["/gtm/partners", "/gtm/partners/applications", "/gtm/partners/deal-registration", "/gtm/partners/:id"], note: "No partner programme: this service is being removed (WP-4.0b)." },
      { id: "attribution", name: "Marketing Attribution", route: "/gtm/attribution", owner: "Marketing", description: "Signup source and campaigns.", requiredPermission: "gtm.attribution.read", icon: Tags, status: "preview", livePhase: 4, routes: ["/gtm/attribution", "/gtm/attribution/campaigns", "/gtm/attribution/funnel", "/gtm/attribution/landing-pages"], note: "Attribution has no producer; the funnel is empty." },
      { id: "pricing", name: "Pricing Experiments", route: "/gtm/pricing", owner: "Marketing", description: "A/B tests on pricing.", requiredPermission: "gtm.pricing.read", icon: BadgeDollarSign, status: "preview", livePhase: null, routes: ["/gtm/pricing", "/gtm/pricing/experiments", "/gtm/pricing/experiments/:id", "/gtm/pricing/plans"], note: "No experimentation platform: this service is being removed (WP-4.0b)." },
      { id: "handoff", name: "Sales Handoff", route: "/gtm/handoff", owner: "Sales", description: "Trial to paid to CS handoff.", requiredPermission: "gtm.handoff.read", icon: Handshake, status: "preview", livePhase: 4, routes: ["/gtm/handoff", "/gtm/handoff/won", "/gtm/handoff/onboarding-queue", "/gtm/handoff/templates"], note: "Handoffs have no producer and templates are hardcoded." }
    ]
  }
];

export function findPillarById(id: string | undefined) {
  return PILLARS.find((pillar) => pillar.id === id);
}

export type ServiceRef = PillarServiceManifest & { pillar: PillarManifest; key: string };

export const SERVICES: ServiceRef[] = PILLARS.flatMap((pillar) => pillar.services.map((service) => ({ ...service, pillar, key: `${pillar.id}.${service.id}` })));

/** `platform.jobs` -> service. */
export function findServiceByKey(key: string) {
  return SERVICES.find((service) => service.key === key);
}

function patternMatches(pattern: string, path: string) {
  const a = pattern.split("/").filter(Boolean);
  const b = path.split("/").filter(Boolean);
  return a.length === b.length && a.every((segment, index) => segment.startsWith(":") || segment === b[index]);
}

/** The service owning a route pattern or a concrete path (exact pattern match first). */
export function findServiceForPath(path: string) {
  return SERVICES.find((service) => service.routes.includes(path)) ?? SERVICES.find((service) => service.routes.some((pattern) => patternMatches(pattern, path)));
}

/** Services shown in navigation: everything except `deferred` (D1). */
export function navigableServices(pillar: PillarManifest) {
  return pillar.services.filter((service) => service.status !== "deferred");
}
