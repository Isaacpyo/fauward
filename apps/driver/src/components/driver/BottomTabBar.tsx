import { Clock3, Package, Truck, User } from "lucide-react";
import { NavLink } from "react-router-dom";

const tabs = [
  { to: "/route", label: "Route", icon: Truck },
  { to: "/route", label: "Deliveries", icon: Package },
  { to: "/history", label: "History", icon: Clock3 },
  { to: "/profile", label: "Profile", icon: User }
];

export function BottomTabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border-color)] bg-white">
      <ul className="grid grid-cols-4">
        {tabs.map((tab) => (
          <li key={`${tab.to}-${tab.label}`}>
            <NavLink
              to={tab.to}
              className={({ isActive }) =>
                `flex min-h-[56px] flex-col items-center justify-center gap-1 text-[12px] font-medium ${
                  isActive ? "text-[var(--tenant-primary)]" : "text-gray-500"
                }`
              }
            >
              <tab.icon size={18} />
              {tab.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

