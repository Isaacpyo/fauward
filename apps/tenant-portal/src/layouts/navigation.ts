import {
  BarChart3,
  Map,
  BookOpen,
  CalendarClock,
  CreditCard,
  Gauge,
  GitBranch,
  Bell,
  Package,
  RefreshCcw,
  LifeBuoy,
  FileSpreadsheet,
  Truck,
  DollarSign,
  Route,
  Settings,
  Users,
  Wallet
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { TenantRole } from "@/types/domain";

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: TenantRole[];
};

export const navItems: NavItem[] = [
  {
    to: "/",
    label: "Dashboard",
    icon: Gauge,
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
    roles: ["TENANT_ADMIN", "TENANT_MANAGER", "TENANT_STAFF", "CUSTOMER_ADMIN", "CUSTOMER_USER"]
  },
  {
    to: "/shipments/fauward-go",
    label: "Fauward Go",
    icon: Package,
    roles: ["TENANT_ADMIN", "TENANT_MANAGER", "TENANT_STAFF"]
  },
  {
    to: "/routes",
    label: "Routes",
    icon: Route,
    roles: ["TENANT_ADMIN", "TENANT_MANAGER", "TENANT_STAFF"]
  },
  {
    to: "/dispatch",
    label: "Dispatch",
    icon: CalendarClock,
    roles: ["TENANT_ADMIN", "TENANT_MANAGER"]
  },
  {
    to: "/crm",
    label: "CRM",
    icon: Users,
    roles: ["TENANT_ADMIN", "TENANT_MANAGER"]
  },
  {
    to: "/finance",
    label: "Finance",
    icon: Wallet,
    roles: ["TENANT_ADMIN", "TENANT_MANAGER", "TENANT_FINANCE"]
  },
  {
    to: "/analytics",
    label: "Analytics",
    icon: BarChart3,
    roles: ["TENANT_ADMIN", "TENANT_MANAGER", "TENANT_FINANCE"]
  },
  {
    to: "/activity",
    label: "Activity",
    icon: Bell,
    roles: ["TENANT_ADMIN", "TENANT_MANAGER"]
  },
  {
    to: "/returns",
    label: "Returns",
    icon: RefreshCcw,
    roles: ["TENANT_ADMIN", "TENANT_MANAGER", "TENANT_STAFF"]
  },
  {
    to: "/support",
    label: "Support",
    icon: LifeBuoy,
    roles: ["TENANT_ADMIN", "TENANT_MANAGER", "TENANT_STAFF"]
  },
  {
    to: "/reports",
    label: "Reports",
    icon: FileSpreadsheet,
    roles: ["TENANT_ADMIN", "TENANT_MANAGER", "TENANT_FINANCE"]
  },
  {
    to: "/operations/live-map",
    label: "Live Map",
    icon: Map,
    roles: ["TENANT_ADMIN", "TENANT_MANAGER"]
  },
  {
    to: "/fleet",
    label: "Fleet",
    icon: Truck,
    roles: ["TENANT_ADMIN", "TENANT_MANAGER"]
  },
  {
    to: "/pricing",
    label: "Pricing",
    icon: DollarSign,
    roles: ["TENANT_ADMIN", "TENANT_MANAGER"]
  },
  {
    to: "/team",
    label: "Team",
    icon: Users,
    roles: ["TENANT_ADMIN"]
  },
  {
    to: "/settings",
    label: "Settings",
    icon: Settings,
    roles: ["TENANT_ADMIN", "TENANT_MANAGER", "TENANT_FINANCE"]
  },
  {
    to: "/book",
    label: "Book Shipment",
    icon: BookOpen,
    roles: ["CUSTOMER_ADMIN", "CUSTOMER_USER"]
  },
  {
    to: "/finance",
    label: "Invoices",
    icon: CreditCard,
    roles: ["CUSTOMER_ADMIN", "CUSTOMER_USER"]
  },
  {
    to: "/settings",
    label: "Profile",
    icon: GitBranch,
    roles: ["CUSTOMER_ADMIN", "CUSTOMER_USER"]
  }
];
