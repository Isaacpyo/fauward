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

export type PillarServiceManifest = {
  id: string;
  name: string;
  route: string;
  owner: string;
  description: string;
  requiredPermission: Permission;
  badgeKey?: BadgeKey;
  icon: LucideIcon;
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
      { id: "tenants", name: "Tenant Control Plane", route: "/platform/tenants", owner: "Platform", description: "Directory, lifecycle, plan and quota control.", requiredPermission: "platform.tenants.read", badgeKey: "tenant-count", icon: Building2 },
      { id: "impersonation", name: "Impersonation Center", route: "/platform/impersonation", owner: "Platform", description: "Time-bound view-as with reason logging.", requiredPermission: "platform.impersonation.start", icon: UserCog },
      { id: "flags", name: "Feature Flags & Releases", route: "/platform/flags", owner: "Platform", description: "Per-tenant gates, rollouts, kill switches.", requiredPermission: "platform.flags.read", icon: Flag },
      { id: "queues", name: "Queue Operations", route: "/platform/queues", owner: "SRE", description: "DLQ inspection, replay and throttling.", requiredPermission: "platform.queues.read", badgeKey: "dlq-depth", icon: Workflow },
      { id: "incidents", name: "Incident Management", route: "/platform/incidents", owner: "SRE", description: "Active incidents, runbooks and postmortems.", requiredPermission: "platform.incidents.read", icon: Siren },
      { id: "health", name: "System Health", route: "/platform/health", owner: "SRE", description: "SLOs, latency, error rate and uptime.", requiredPermission: "platform.health.read", icon: Stethoscope },
      { id: "jobs", name: "Background Jobs", route: "/platform/jobs", owner: "Platform", description: "Cron status, scheduled tasks and retries.", requiredPermission: "platform.jobs.read", icon: RefreshCcw },
      { id: "integrations", name: "Integration Health", route: "/platform/integrations", owner: "Platform", description: "Stripe, Twilio and carrier API status.", requiredPermission: "platform.integrations.read", icon: PackageCheck },
      { id: "database", name: "Database Operations", route: "/platform/database", owner: "Platform", description: "Migration tracker, slow queries and schema viewer.", requiredPermission: "platform.database.read", icon: Database }
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
      { id: "billing", name: "Billing Console", route: "/revenue/billing", owner: "Finance", description: "Invoices, manual creation, refunds and credits.", requiredPermission: "revenue.invoices.read", icon: Receipt },
      { id: "dunning", name: "Dunning Manager", route: "/revenue/dunning", owner: "Finance", description: "Failed payment recovery.", requiredPermission: "revenue.dunning.read", icon: RefreshCcw },
      { id: "subscriptions", name: "Subscription Manager", route: "/revenue/subscriptions", owner: "RevOps", description: "Plans, custom contracts and MRR tracking.", requiredPermission: "revenue.subscriptions.read", icon: Wallet },
      { id: "disputes", name: "Disputes & Chargebacks", route: "/revenue/disputes", owner: "Finance", description: "Stripe dispute queue.", requiredPermission: "revenue.disputes.read", icon: ShieldAlert },
      { id: "tax", name: "Tax & Compliance", route: "/revenue/tax", owner: "Finance", description: "VAT, GST and sales tax per region.", requiredPermission: "revenue.tax.read", icon: Scale },
      { id: "recognition", name: "Revenue Recognition", route: "/revenue/recognition", owner: "Finance", description: "Deferred vs recognised revenue.", requiredPermission: "revenue.recognition.read", icon: FileCheck2 },
      { id: "commissions", name: "Reseller Commissions", route: "/revenue/commissions", owner: "RevOps", description: "Calculation and payout queue.", requiredPermission: "revenue.commissions.read", icon: Handshake },
      { id: "analytics", name: "Revenue Analytics", route: "/revenue/analytics", owner: "RevOps", description: "MRR, ARR, churn and cohorts.", requiredPermission: "revenue.analytics.read", badgeKey: "mrr", icon: LineChart }
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
      { id: "support", name: "Support Desk", route: "/customer/support", owner: "Support", description: "Ticket queue and support workflows.", requiredPermission: "customer.support.read", icon: LifeBuoy },
      { id: "360", name: "Customer 360", route: "/customer/360", owner: "Success", description: "Unified tenant view.", requiredPermission: "customer.360.read", icon: SearchCheck },
      { id: "success", name: "CS Console", route: "/customer/success", owner: "Success", description: "Health scoring, churn risk and playbooks.", requiredPermission: "customer.success.read", icon: HeartHandshake },
      { id: "feedback", name: "NPS & Feedback", route: "/customer/feedback", owner: "Success", description: "Survey results and themes.", requiredPermission: "customer.feedback.read", icon: MessageSquareText },
      { id: "kb", name: "Knowledge Base Mgmt", route: "/customer/kb", owner: "Support", description: "Internal runbooks and customer docs.", requiredPermission: "customer.kb.read", icon: FileText },
      { id: "comms", name: "Communications Hub", route: "/customer/comms", owner: "Support", description: "Mass email, banners and status notices.", requiredPermission: "customer.comms.read", icon: Megaphone },
      { id: "qbr", name: "QBR Center", route: "/customer/qbr", owner: "Success", description: "Quarterly business review prep.", requiredPermission: "customer.qbr.read", icon: ChartNoAxesCombined },
      { id: "onboarding", name: "Onboarding Tracker", route: "/customer/onboarding", owner: "Success", description: "New tenant activation funnel.", requiredPermission: "customer.onboarding.read", icon: ClipboardList }
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
      { id: "iam", name: "Employee IAM", route: "/trust/iam/users", owner: "Security", description: "Staff SSO, RBAC and sessions.", requiredPermission: "trust.iam.read", icon: Users },
      { id: "jit", name: "Just-in-Time Access", route: "/trust/jit", owner: "Security", description: "Break-glass elevation with approval.", requiredPermission: "trust.iam.read", icon: KeyRound },
      { id: "audit", name: "Audit Log", route: "/trust/audit", owner: "Compliance", description: "Immutable, searchable SOC 2 audit log.", requiredPermission: "trust.audit.read", icon: ClipboardList },
      { id: "compliance", name: "Compliance Operations", route: "/trust/compliance", owner: "Legal", description: "GDPR DSAR, legal hold and exports.", requiredPermission: "trust.compliance.dsar.read", icon: FileCheck2 },
      { id: "safety", name: "Trust & Safety", route: "/trust/safety", owner: "Trust", description: "Fraud, AUP enforcement and suspensions.", requiredPermission: "trust.safety.read", icon: ShieldAlert },
      { id: "kyc", name: "KYC & Sanctions", route: "/trust/kyc", owner: "Trust", description: "Enterprise verification and screening.", requiredPermission: "trust.kyc.read", icon: SearchCheck },
      { id: "secrets", name: "Secret Management", route: "/trust/secrets", owner: "Security", description: "API key rotation tracker.", requiredPermission: "trust.secrets.read", icon: LockKeyhole },
      { id: "security", name: "Security Monitoring", route: "/trust/security", owner: "Security", description: "Anomaly detection and login monitoring.", requiredPermission: "trust.security.read", icon: ShieldCheck }
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
      { id: "pipeline", name: "Sales Pipeline", route: "/gtm/pipeline", owner: "Sales", description: "Deals, stages and conversion.", requiredPermission: "gtm.pipeline.read", icon: BriefcaseBusiness },
      { id: "trials", name: "Trial Management", route: "/gtm/trials", owner: "Sales", description: "Active trials and conversion tracking.", requiredPermission: "gtm.trials.read", icon: Sparkles },
      { id: "demos", name: "Demo Environment Mgr", route: "/gtm/demos", owner: "Sales", description: "Provision and teardown demo tenants.", requiredPermission: "gtm.demos.read", icon: PackageCheck },
      { id: "contracts", name: "CPQ & Contracts", route: "/gtm/contracts", owner: "Sales", description: "Quotes, approvals and MSAs.", requiredPermission: "gtm.contracts.read", icon: FileText },
      { id: "partners", name: "Partner Portal Mgmt", route: "/gtm/partners", owner: "Partnerships", description: "Resellers and deal registration.", requiredPermission: "gtm.partners.read", icon: Handshake },
      { id: "attribution", name: "Marketing Attribution", route: "/gtm/attribution", owner: "Marketing", description: "Signup source and campaigns.", requiredPermission: "gtm.attribution.read", icon: Tags },
      { id: "pricing", name: "Pricing Experiments", route: "/gtm/pricing", owner: "Marketing", description: "A/B tests on pricing.", requiredPermission: "gtm.pricing.read", icon: BadgeDollarSign },
      { id: "handoff", name: "Sales Handoff", route: "/gtm/handoff", owner: "Sales", description: "Trial to paid to CS handoff.", requiredPermission: "gtm.handoff.read", icon: Handshake }
    ]
  }
];

export function findPillarById(id: string | undefined) {
  return PILLARS.find((pillar) => pillar.id === id);
}
