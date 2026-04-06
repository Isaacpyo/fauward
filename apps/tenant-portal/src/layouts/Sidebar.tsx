import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { NavLink } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { navItems } from "@/layouts/navigation";
import { useAppStore } from "@/stores/useAppStore";
import { useTenantStore } from "@/stores/useTenantStore";

type SidebarProps = {
  mobile?: boolean;
};

export function Sidebar({ mobile = false }: SidebarProps) {
  const user = useAppStore((state) => state.user);
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useAppStore((state) => state.setSidebarCollapsed);
  const tenant = useTenantStore((state) => state.tenant);

  const visibleItems = navItems.filter((item) =>
    user ? item.roles.includes(user.role) : false
  );

  return (
    <aside
      className={cn(
        mobile
          ? "flex h-full shrink-0 flex-col border-r border-gray-200 bg-white"
          : "hidden h-screen shrink-0 border-r border-gray-200 bg-white lg:flex lg:flex-col",
        mobile ? "w-64" : sidebarCollapsed ? "w-16" : "w-64"
      )}
    >
      <div className="flex h-16 items-center border-b border-gray-200 px-4">
        <div className={cn("h-8 rounded-md", mobile || !sidebarCollapsed ? "w-36" : "w-8")}>
          {tenant?.logo_url ? (
            <img src={tenant.logo_url} alt={`${tenant.name} logo`} className="h-full w-full object-contain object-left" />
          ) : (
            <div className="flex h-full items-center rounded-md bg-[var(--tenant-primary)] px-2 text-sm font-semibold text-white">
              {sidebarCollapsed && !mobile ? "F" : "Fauward"}
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {visibleItems.map((item) => {
          const link = (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "flex min-h-[44px] items-center rounded-md px-3 text-sm font-medium transition",
                  isActive
                    ? "bg-[var(--tenant-primary)] text-white"
                    : "text-gray-700 hover:bg-gray-100"
                )
              }
            >
              <item.icon size={18} />
              {!sidebarCollapsed || mobile ? <span className="ms-3">{item.label}</span> : null}
            </NavLink>
          );

          if (sidebarCollapsed && !mobile) {
            return (
              <Tooltip content={item.label} key={item.to}>
                {link}
              </Tooltip>
            );
          }

          return link;
        })}
      </nav>

      <footer className="space-y-2 border-t border-gray-200 p-2">
        <div className="rounded-md bg-gray-50 px-3 py-2">
          <p className="truncate text-sm font-medium text-gray-900">{tenant?.name ?? "Tenant"}</p>
          {!sidebarCollapsed || mobile ? <p className="truncate text-xs text-gray-500">{tenant?.domain}</p> : null}
        </div>
        {!mobile ? (
          <Button
            variant="ghost"
            className="w-full justify-start"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            leftIcon={sidebarCollapsed ? <ChevronsRight size={16} /> : <ChevronsLeft size={16} />}
          >
            {!sidebarCollapsed ? "Collapse sidebar" : ""}
          </Button>
        ) : null}
      </footer>
    </aside>
  );
}
