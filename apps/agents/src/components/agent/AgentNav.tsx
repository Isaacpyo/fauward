import { NavLink } from "react-router-dom";

import { agentPath } from "@/lib/agentPaths";
import { useAgentAuth } from "@/context/AgentAuthContext";

const links = [
  { to: agentPath("dashboard"), label: "Dashboard" },
  { to: agentPath("scan"), label: "Scan" },
  { to: agentPath("shipments"), label: "Shipments" }
];

export function AgentNav() {
  const { logout, session } = useAgentAuth();

  return (
    <header className="sticky top-0 z-20 mb-6 border-b border-[var(--border-color)] bg-white/95 px-4 py-3 backdrop-blur">
      <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Agent workspace</p>
          <p className="text-sm font-semibold text-gray-900">{session?.tenantSlug ?? "Tenant"}</p>
        </div>

        <nav className="hidden items-center gap-2 md:flex">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `rounded-md px-3 py-2 text-sm font-medium ${isActive ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"}`
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          onClick={logout}
          className="min-h-[40px] rounded-md border border-[var(--border-color)] bg-white px-3 py-1 text-sm font-medium text-gray-700"
        >
          Logout
        </button>
      </div>
    </header>
  );
}