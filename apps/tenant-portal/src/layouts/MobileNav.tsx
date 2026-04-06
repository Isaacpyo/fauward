import { BarChart3, Gauge, Package, UserCircle2, Wallet } from "lucide-react";
import { NavLink } from "react-router-dom";

import { useAppStore } from "@/stores/useAppStore";
import { cn } from "@/lib/utils";

const tenantItems = [
  { to: "/", label: "Home", icon: Gauge },
  { to: "/shipments", label: "Shipments", icon: Package },
  { to: "/finance", label: "Finance", icon: Wallet },
  { to: "/analytics", label: "Analytics", icon: BarChart3 }
];

const customerItems = [
  { to: "/", label: "Home", icon: Gauge },
  { to: "/shipments", label: "My Shipments", icon: Package },
  { to: "/finance", label: "Invoices", icon: Wallet },
  { to: "/settings", label: "Profile", icon: UserCircle2 }
];

export function MobileNav() {
  const user = useAppStore((state) => state.user);

  const items =
    user?.role === "CUSTOMER_ADMIN" || user?.role === "CUSTOMER_USER"
      ? customerItems
      : tenantItems;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 border-t border-gray-200 bg-white p-2 lg:hidden">
      <ul className="grid grid-cols-4 gap-1">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex min-h-[44px] flex-col items-center justify-center rounded-md text-xs text-gray-600",
                  isActive ? "bg-[var(--tenant-primary-light)] text-[var(--tenant-primary)]" : ""
                )
              }
            >
              <item.icon size={16} />
              <span>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
