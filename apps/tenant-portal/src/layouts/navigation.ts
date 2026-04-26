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

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: TenantRole[];
  feature: FeatureKey;
  showWhenLocked?: boolean;
};

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
    roles: ["TENANT_ADMIN", "TENANT_MANAGER", "TENANT_FINANCE"]
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
    to: "/fleet",
    label: "Fleet",
    icon: Truck,
    feature: "fleet",
    showWhenLocked: true,
    roles: ["TENANT_ADMIN", "TENANT_MANAGER"]
  },
  {
    to: "/agent",
    label: "Fauward Agent",
    icon: Bot,
    feature: "agent",
    showWhenLocked: true,
    roles: ["TENANT_ADMIN", "TENANT_MANAGER"]
  },
  {
    to: "/pricing",
    label: "Pricing",
    icon: DollarSign,
    feature: "pricing",
    roles: ["TENANT_ADMIN", "TENANT_MANAGER"]
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
    roles: ["TENANT_ADMIN", "TENANT_MANAGER", "TENANT_FINANCE"]
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
