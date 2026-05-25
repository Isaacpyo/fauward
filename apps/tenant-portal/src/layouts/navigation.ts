import {
  BarChart3,
  Bot,
  Map,
  BookOpen,
  CalendarClock,
  CreditCard,
  Gauge,
  GitBranch,
  Bell,
  MessageSquare,
  Package,
  RefreshCcw,
  LifeBuoy,
  FileSpreadsheet,
  Terminal,
  Truck,
  DollarSign,
  Route,
  ShieldCheck,
  Settings,
  Users,
  Wallet
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { TenantRole } from "@/types/domain";
import type { FeatureKey } from "@/lib/plan-features";

export type NavChild = {
  to: string;
  label: string;
  // Used for highlight matching when the URL uses ?tab=<value>; pricing children
  // use real routes and leave this undefined.
  tabValue?: string;
  minimumPlan?: "starter" | "pro" | "enterprise";
};

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: TenantRole[];
  feature: FeatureKey;
  showWhenLocked?: boolean;
  children?: NavChild[];
};

const settingsChildren: NavChild[] = [
  { to: "/settings?tab=profile", label: "Profile", tabValue: "profile", minimumPlan: "starter" },
  { to: "/settings?tab=general", label: "General", tabValue: "general", minimumPlan: "starter" },
  { to: "/settings?tab=domain", label: "Domain", tabValue: "domain", minimumPlan: "pro" },
  { to: "/settings?tab=integrations", label: "Integrations", tabValue: "integrations", minimumPlan: "starter" },
  { to: "/settings?tab=billing", label: "Billing", tabValue: "billing", minimumPlan: "starter" },
  { to: "/settings?tab=api-keys", label: "API keys", tabValue: "api-keys", minimumPlan: "pro" },
  { to: "/settings?tab=webhooks", label: "Webhooks", tabValue: "webhooks", minimumPlan: "pro" },
  { to: "/settings?tab=email", label: "Email", tabValue: "email", minimumPlan: "enterprise" },
  { to: "/settings?tab=branding", label: "Branding", tabValue: "branding", minimumPlan: "starter" },
  { to: "/settings?tab=privacy", label: "Privacy", tabValue: "privacy", minimumPlan: "starter" }
];

const financeChildren: NavChild[] = [
  { to: "/finance?tab=overview", label: "Overview", tabValue: "overview", minimumPlan: "starter" },
  { to: "/finance?tab=invoices", label: "Invoices", tabValue: "invoices", minimumPlan: "starter" },
  { to: "/finance?tab=create-invoice", label: "Create invoice", tabValue: "create-invoice", minimumPlan: "starter" },
  { to: "/finance?tab=payments", label: "Payments", tabValue: "payments", minimumPlan: "starter" },
  { to: "/finance?tab=collections", label: "COD & Collections", tabValue: "collections", minimumPlan: "pro" },
  { to: "/finance?tab=refunds", label: "Refunds", tabValue: "refunds", minimumPlan: "pro" },
  { to: "/finance?tab=settlements", label: "Settlements", tabValue: "settlements", minimumPlan: "pro" },
  { to: "/finance?tab=reconciliation", label: "Reconciliation", tabValue: "reconciliation", minimumPlan: "enterprise" }
];

const fleetChildren: NavChild[] = [
  { to: "/fleet?tab=drivers", label: "Field Operators", tabValue: "drivers" },
  { to: "/fleet?tab=vehicles", label: "Vehicles", tabValue: "vehicles" }
];

const developerChildren: NavChild[] = [
  { to: "/developer?tab=keys", label: "API keys", tabValue: "keys" },
  { to: "/developer?tab=webhooks", label: "Webhooks", tabValue: "webhooks" },
  { to: "/developer?tab=usage", label: "Usage", tabValue: "usage" }
];

const pricingChildren: NavChild[] = [
  { to: "/pricing", label: "Overview" },
  { to: "/pricing/zones", label: "Zones" },
  { to: "/pricing/rate-cards", label: "Rate Cards" },
  { to: "/pricing/service-tiers", label: "Service Tiers" },
  { to: "/pricing/surcharges", label: "Surcharges" },
  { to: "/pricing/insurance", label: "Insurance" },
  { to: "/pricing/weight-tiers", label: "Weight Tiers" },
  { to: "/pricing/rules", label: "Rules" },
  { to: "/pricing/promo-codes", label: "Promo Codes" },
  { to: "/pricing/tax", label: "Tax" },
  { to: "/pricing/currencies", label: "Currencies" },
  { to: "/pricing/settings", label: "Settings" },
  { to: "/pricing/calculator", label: "Calculator" }
];

export const navItems: NavItem[] = [
  {
    to: "/",
    label: "Dashboard",
    icon: Gauge,
    feature: "dashboard",
    roles: [
      "TENANT_ADMIN",
      "TENANT_MANAGER",
      "TENANT_FINANCE",
      "TENANT_STAFF",
      "CUSTOMER_ADMIN",
      "CUSTOMER_USER"
    ]
  },
  {
    to: "/shipments",
    label: "Shipments",
    icon: Package,
    feature: "shipments",
    roles: ["TENANT_ADMIN", "TENANT_MANAGER", "TENANT_STAFF", "CUSTOMER_ADMIN", "CUSTOMER_USER"]
  },
  {
    to: "/fauward-go",
    label: "Fauward Go",
    icon: Package,
    feature: "fauwardGo",
    roles: ["TENANT_ADMIN", "TENANT_MANAGER", "TENANT_STAFF"]
  },
  {
    to: "/routes",
    label: "Routes",
    icon: Route,
    feature: "routes",
    roles: ["TENANT_ADMIN", "TENANT_MANAGER", "TENANT_STAFF"]
  },
  {
    to: "/dispatch",
    label: "Dispatch",
    icon: CalendarClock,
    feature: "dispatch",
    roles: ["TENANT_ADMIN", "TENANT_MANAGER"]
  },
  {
    to: "/crm",
    label: "CRM",
    icon: Users,
    feature: "crm",
    roles: ["TENANT_ADMIN", "TENANT_MANAGER"]
  },
  {
    to: "/finance",
    label: "Finance",
    icon: Wallet,
    feature: "finance",
    roles: ["TENANT_ADMIN", "TENANT_MANAGER", "TENANT_FINANCE"],
    children: financeChildren
  },
  {
    to: "/analytics",
    label: "Analytics",
    icon: BarChart3,
    feature: "analytics",
    showWhenLocked: true,
    roles: ["TENANT_ADMIN", "TENANT_MANAGER", "TENANT_FINANCE"]
  },
  {
    to: "/activity",
    label: "Activity",
    icon: Bell,
    feature: "activity",
    roles: ["TENANT_ADMIN", "TENANT_MANAGER"]
  },
  {
    to: "/audit",
    label: "Audit Logs",
    icon: ShieldCheck,
    feature: "auditLogs",
    showWhenLocked: true,
    roles: ["TENANT_ADMIN", "TENANT_MANAGER"]
  },
  {
    to: "/messaging",
    label: "Messaging",
    icon: MessageSquare,
    feature: "messaging",
    showWhenLocked: true,
    roles: ["TENANT_ADMIN", "TENANT_MANAGER", "TENANT_STAFF", "CUSTOMER_ADMIN", "CUSTOMER_USER"]
  },
  {
    to: "/returns",
    label: "Returns",
    icon: RefreshCcw,
    feature: "returns",
    roles: ["TENANT_ADMIN", "TENANT_MANAGER", "TENANT_STAFF"]
  },
  {
    to: "/support",
    label: "Support",
    icon: LifeBuoy,
    feature: "support",
    roles: ["TENANT_ADMIN", "TENANT_MANAGER", "TENANT_STAFF"]
  },
  {
    to: "/reports",
    label: "Reports",
    icon: FileSpreadsheet,
    feature: "reports",
    showWhenLocked: true,
    roles: ["TENANT_ADMIN", "TENANT_MANAGER", "TENANT_FINANCE"]
  },
  {
    to: "/operations/live-map",
    label: "Live Map",
    icon: Map,
    feature: "liveMap",
    roles: ["TENANT_ADMIN", "TENANT_MANAGER"]
  },
  {
    to: "/operations/permission-requests",
    label: "Permission Requests",
    icon: ShieldCheck,
    feature: "fauwardGo",
    roles: ["TENANT_ADMIN", "TENANT_MANAGER"]
  },
  {
    to: "/fleet",
    label: "Fleet",
    icon: Truck,
    feature: "fleet",
    showWhenLocked: true,
    roles: ["TENANT_ADMIN", "TENANT_MANAGER"],
    children: fleetChildren
  },
  {
    to: "/agent",
    label: "Fauward Agent",
    icon: Bot,
    feature: "agent",
    showWhenLocked: true,
    roles: ["TENANT_ADMIN", "TENANT_MANAGER"],
    children: [
      { to: "/agent", label: "Overview" },
      { to: "/agent/actions", label: "Pending Actions" }
    ]
  },
  {
    to: "/pricing",
    label: "Pricing",
    icon: DollarSign,
    feature: "pricing",
    roles: ["TENANT_ADMIN", "TENANT_MANAGER"],
    children: pricingChildren
  },
  {
    to: "/developer",
    label: "Developer",
    icon: Terminal,
    feature: "settings",
    roles: ["TENANT_ADMIN", "TENANT_MANAGER"],
    children: developerChildren
  },
  {
    to: "/team",
    label: "Team",
    icon: Users,
    feature: "team",
    roles: ["TENANT_ADMIN"]
  },
  {
    to: "/settings",
    label: "Settings",
    icon: Settings,
    feature: "settings",
    roles: ["TENANT_ADMIN", "TENANT_MANAGER", "TENANT_FINANCE"],
    children: settingsChildren
  },
  {
    to: "/book",
    label: "Book Shipment",
    icon: BookOpen,
    feature: "shipments",
    roles: ["CUSTOMER_ADMIN", "CUSTOMER_USER"]
  },
  {
    to: "/finance",
    label: "Invoices",
    icon: CreditCard,
    feature: "finance",
    roles: ["CUSTOMER_ADMIN", "CUSTOMER_USER"]
  },
  {
    to: "/settings",
    label: "Profile",
    icon: GitBranch,
    feature: "settings",
    roles: ["CUSTOMER_ADMIN", "CUSTOMER_USER"]
  }
];
