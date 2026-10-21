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

/** Keys computed by GET /api/internal/badges (WP-3.4, architecture §6.4); services without one show no badge. */
export type BadgeKey =
  | "tenant-count"
  | "suspended-count"
  | "dlq-depth"
  | "mrr"
  | "open-platform-tickets"
  | "open-escalations"
  | "pending-approvals"
  | "open-appeals"
  | "dsar-due-7d"
  | "failed-jobs-24h"
  | "integrations-degraded"
  | "disputes-due"
  | "p95-latency"
  | "error-rate";

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
      { id: "tenants", name: "Tenant Control Plane", route: "/platform/tenants", owner: "Platform", description: "Directory, lifecycle, plan and quota control.", requiredPermission: "platform.tenants.read", badgeKey: "tenant-count", icon: Building2, status: "live", livePhase: 1, routes: ["/platform/tenants", "/platform/tenants/region-requests", "/platform/tenants/:id"] },
      { id: "impersonation", name: "Impersonation Center", route: "/platform/impersonation", owner: "Platform", description: "Time-bound view-as with reason logging.", requiredPermission: "platform.impersonation.start", icon: UserCog, status: "live", livePhase: 1, routes: ["/platform/impersonation", "/platform/impersonation/sessions/:id"] },
      { id: "flags", name: "Feature Flags & Releases", route: "/platform/flags", owner: "Platform", description: "Per-tenant gates, rollouts, kill switches.", requiredPermission: "platform.flags.read", icon: Flag, status: "live", livePhase: 4, routes: ["/platform/flags", "/platform/flags/:key", "/platform/flags/:key/audit", "/platform/releases"], note: "Native per-tenant overrides with an optional LaunchDarkly mirror (context kind tenant), audit trail, and releases from GitHub or build info (WP-4.1)." },
      { id: "queues", name: "Queue Operations", route: "/platform/queues", owner: "SRE", description: "DLQ inspection, replay and throttling.", requiredPermission: "platform.queues.read", badgeKey: "dlq-depth", icon: Workflow, status: "live", livePhase: 3, routes: ["/platform/queues", "/platform/queues/:name"], note: "Live counts, dead-letter depth, redacted job inspection, DLQ replay, clean and pause/resume (WP-3.6)." },
      { id: "incidents", name: "Incident Management", route: "/platform/incidents", owner: "SRE", description: "Active incidents, runbooks and postmortems.", requiredPermission: "platform.incidents.read", badgeKey: "open-escalations", icon: Siren, status: "live", livePhase: 4, routes: ["/platform/incidents", "/platform/incidents/escalations", "/platform/incidents/runbooks", "/platform/incidents/runbooks/:id", "/platform/incidents/:id"] },
      { id: "health", name: "System Health", route: "/platform/health", owner: "SRE", description: "SLOs, latency, error rate and uptime.", requiredPermission: "platform.health.read", badgeKey: "p95-latency", icon: Stethoscope, status: "live", livePhase: 3, routes: ["/platform/health"], note: "DB/Redis latency, API p50/p95/p99 and 5xx rate per route group (Redis minute buckets), worker heartbeats and a queue roll-up (WP-3.7)." },
      { id: "jobs", name: "Background Jobs", route: "/platform/jobs", owner: "Platform", description: "Cron status, scheduled tasks and retries.", requiredPermission: "platform.jobs.read", badgeKey: "failed-jobs-24h", icon: RefreshCcw, status: "live", livePhase: 3, routes: ["/platform/jobs", "/platform/jobs/:name"], note: "Registered scheduled jobs with next/last run, run history (ScheduledJobRun) and a dangerous manual trigger (WP-3.8)." },
      { id: "integrations", name: "Integration Health", route: "/platform/integrations", owner: "Platform", description: "Stripe, SendGrid, Twilio and vendor status, tenant gateways, webhooks.", requiredPermission: "platform.integrations.read", badgeKey: "integrations-degraded", icon: PackageCheck, status: "live", livePhase: 4, routes: ["/platform/integrations", "/platform/integrations/tenant-gateways", "/platform/integrations/credentials", "/platform/integrations/webhooks", "/platform/integrations/:provider"] },
      { id: "database", name: "Database Operations", route: "/platform/database", owner: "Platform", description: "Read-only migrations, table sizes, slow queries and connections.", requiredPermission: "platform.database.read", icon: Database, status: "live", livePhase: 4, routes: ["/platform/database"] }
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
      { id: "billing", name: "Billing Console", route: "/revenue/billing", owner: "Finance", description: "Invoices, manual creation, refunds and credits.", requiredPermission: "revenue.invoices.read", icon: Receipt, status: "live", livePhase: 1, routes: ["/revenue/billing", "/revenue/billing/invoices", "/revenue/billing/invoices/create", "/revenue/billing/invoices/:id", "/revenue/billing/credit-notes", "/revenue/billing/refunds", "/revenue/billing/payments"] },
      { id: "dunning", name: "Dunning Manager", route: "/revenue/dunning", owner: "Finance", description: "Failed payment recovery: sequences, retries, save offers.", requiredPermission: "revenue.dunning.read", icon: RefreshCcw, status: "live", livePhase: 4, routes: ["/revenue/dunning", "/revenue/dunning/tenants/:tenantId", "/revenue/dunning/sequences", "/revenue/dunning/sequences/:id", "/revenue/dunning/save-offers"] },
      { id: "subscriptions", name: "Subscription Manager", route: "/revenue/subscriptions", owner: "RevOps", description: "Plans, custom contracts and MRR tracking.", requiredPermission: "revenue.subscriptions.read", icon: Wallet, status: "live", livePhase: 2, routes: ["/revenue/subscriptions", "/revenue/subscriptions/:id", "/revenue/subscriptions/plan-change-requests", "/revenue/subscriptions/contracts", "/revenue/subscriptions/overrides"] },
      { id: "disputes", name: "Disputes & Chargebacks", route: "/revenue/disputes", owner: "Finance", description: "Stripe dispute queue, evidence and deadlines.", requiredPermission: "revenue.disputes.read", badgeKey: "disputes-due", icon: ShieldAlert, status: "live", livePhase: 4, routes: ["/revenue/disputes", "/revenue/disputes/:id"] },
      { id: "tax", name: "Tax & Compliance", route: "/revenue/tax", owner: "Finance", description: "Tax registrations and tenant exemption certificates.", requiredPermission: "revenue.tax.read", icon: Scale, status: "live", livePhase: 4, routes: ["/revenue/tax", "/revenue/tax/registrations", "/revenue/tax/exemptions"] },
      { id: "recognition", name: "Revenue Recognition", route: "/revenue/recognition", owner: "Finance", description: "Deferred vs recognised revenue.", requiredPermission: "revenue.recognition.read", icon: FileCheck2, status: "deferred", livePhase: null, routes: ["/revenue/recognition"], note: "Needs an accounting-system integration; not planned until an ADR names the source of truth." },
      { id: "commissions", name: "Reseller Commissions", route: "/revenue/commissions", owner: "RevOps", description: "Calculation and payout queue.", requiredPermission: "revenue.commissions.read", icon: Handshake, status: "deferred", livePhase: null, routes: ["/revenue/commissions"], note: "No reseller programme." },
      { id: "analytics", name: "Revenue Analytics", route: "/revenue/analytics", owner: "RevOps", description: "MRR, ARR, churn and cohorts.", requiredPermission: "revenue.analytics.read", badgeKey: "mrr", icon: LineChart, status: "live", livePhase: 3, routes: ["/revenue/analytics"], note: "MRR movement, signup cohorts, MRR by plan and a run-rate projection from subscription events; reconstructed months flagged (WP-3.2)." }
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
      { id: "support", name: "Support Desk", route: "/customer/support", owner: "Support", description: "Ticket queue and support workflows.", requiredPermission: "customer.support.read", badgeKey: "open-platform-tickets", icon: LifeBuoy, status: "live", livePhase: 2, routes: ["/customer/support", "/customer/support/tickets/:id", "/customer/support/sla", "/customer/support/macros"] },
      { id: "360", name: "Customer 360", route: "/customer/360", owner: "Success", description: "Unified tenant view.", requiredPermission: "customer.360.read", icon: SearchCheck, status: "live", livePhase: 1, routes: ["/customer/360", "/customer/360/:tenantId"] },
      { id: "success", name: "CS Console", route: "/customer/success", owner: "Success", description: "Health scoring, churn risk, expansion and playbooks.", requiredPermission: "customer.success.read", icon: HeartHandshake, status: "live", livePhase: 4, routes: ["/customer/success", "/customer/success/at-risk", "/customer/success/expansion", "/customer/success/playbooks", "/customer/success/playbooks/:id", "/customer/success/playbooks/:id/runs", "/customer/success/health-scoring"] },
      { id: "feedback", name: "NPS & Feedback", route: "/customer/feedback", owner: "Success", description: "Feature requests, feedback triage and NPS.", requiredPermission: "customer.feedback.read", icon: MessageSquareText, status: "live", livePhase: 2, routes: ["/customer/feedback", "/customer/feedback/nps", "/customer/feedback/:id"] },
      { id: "kb", name: "Knowledge Base Mgmt", route: "/customer/kb", owner: "Support", description: "Internal runbooks and customer docs.", requiredPermission: "customer.kb.read", icon: FileText, status: "deferred", livePhase: null, routes: ["/customer/kb"], note: "Customer docs live on the marketing site; internal runbooks live in Incident runbooks (platform.incidents)." },
      { id: "comms", name: "Communications Hub", route: "/customer/comms", owner: "Support", description: "Mass email, banners and status notices.", requiredPermission: "customer.comms.read", icon: Megaphone, status: "live", livePhase: 2, routes: ["/customer/comms", "/customer/comms/delivery-log"], note: "Announcements (publish, schedule, edit, archive, delete, receipts, audience preview, optional admin email) and the delivery log are live." },
      { id: "qbr", name: "QBR Center", route: "/customer/qbr", owner: "Success", description: "Quarterly business review prep.", requiredPermission: "customer.qbr.read", icon: ChartNoAxesCombined, status: "preview", livePhase: 4, routes: ["/customer/qbr", "/customer/qbr/templates", "/customer/qbr/:tenantId"], note: "Generate writes a stub deck; templates have no writer." },
      { id: "onboarding", name: "Onboarding Tracker", route: "/customer/onboarding", owner: "Success", description: "New tenant activation funnel.", requiredPermission: "customer.onboarding.read", icon: ClipboardList, status: "live", livePhase: 2, routes: ["/customer/onboarding", "/customer/onboarding/stuck"], note: "Funnel, stuck tenants and nudges read steps stamped by real events (WP-2.17)." }
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
      { id: "jit", name: "Just-in-Time Access", route: "/trust/jit", owner: "Security", description: "Break-glass elevation with approval.", requiredPermission: "trust.jit.request", badgeKey: "pending-approvals", icon: KeyRound, status: "live", livePhase: 1, routes: ["/trust/jit", "/trust/jit/request", "/trust/jit/pending", "/trust/jit/active", "/trust/jit/audit"] },
      { id: "audit", name: "Audit Log", route: "/trust/audit", owner: "Compliance", description: "Immutable, searchable SOC 2 audit log.", requiredPermission: "trust.audit.read", icon: ClipboardList, status: "live", livePhase: 1, routes: ["/trust/audit", "/trust/audit/tenant-events", "/trust/audit/timeline", "/trust/audit/export", "/trust/audit/integrity"] },
      { id: "compliance", name: "Compliance Operations", route: "/trust/compliance", owner: "Legal", description: "GDPR DSAR, legal hold and exports.", requiredPermission: "trust.compliance.dsar.read", badgeKey: "dsar-due-7d", icon: FileCheck2, status: "live", livePhase: 2, routes: ["/trust/compliance", "/trust/compliance/dsar", "/trust/compliance/dsar/:id", "/trust/compliance/legal-hold", "/trust/compliance/exports"] },
      { id: "safety", name: "Trust & Safety", route: "/trust/safety", owner: "Trust", description: "Fraud, AUP enforcement and suspensions.", requiredPermission: "trust.safety.read", badgeKey: "open-appeals", icon: ShieldAlert, status: "live", livePhase: 2, routes: ["/trust/safety", "/trust/safety/fraud", "/trust/safety/aup", "/trust/safety/signals", "/trust/safety/suspensions", "/trust/safety/appeals", "/trust/safety/appeals/:id", "/trust/safety/rules"] },
      { id: "kyc", name: "KYC & Sanctions", route: "/trust/kyc", owner: "Trust", description: "Enterprise verification and screening.", requiredPermission: "trust.kyc.read", icon: SearchCheck, status: "preview", livePhase: 4, routes: ["/trust/kyc", "/trust/kyc/pending", "/trust/kyc/:id", "/trust/kyc/sanctions", "/trust/kyc/pep"], note: "Persona and ComplyAdvantage only; the manual review queue is not wired." },
      { id: "secrets", name: "Secret Management", route: "/trust/secrets", owner: "Security", description: "API key rotation tracker.", requiredPermission: "trust.secrets.read", icon: LockKeyhole, status: "live", livePhase: 4, routes: ["/trust/secrets", "/trust/secrets/expiring", "/trust/secrets/:id"] },
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
      { id: "partners", name: "Partner Portal Mgmt", route: "/gtm/partners", owner: "Partnerships", description: "Resellers and deal registration.", requiredPermission: "gtm.partners.read", icon: Handshake, status: "deferred", livePhase: null, routes: ["/gtm/partners"], note: "No partner programme." },
      { id: "attribution", name: "Marketing Attribution", route: "/gtm/attribution", owner: "Marketing", description: "Signup source and campaigns.", requiredPermission: "gtm.attribution.read", icon: Tags, status: "preview", livePhase: 4, routes: ["/gtm/attribution", "/gtm/attribution/campaigns", "/gtm/attribution/funnel", "/gtm/attribution/landing-pages"], note: "Attribution has no producer; the funnel is empty." },
      { id: "pricing", name: "Pricing Experiments", route: "/gtm/pricing", owner: "Marketing", description: "A/B tests on pricing.", requiredPermission: "gtm.pricing.read", icon: BadgeDollarSign, status: "deferred", livePhase: null, routes: ["/gtm/pricing"], note: "No experimentation platform; the plan catalogue lives in planService." },
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
