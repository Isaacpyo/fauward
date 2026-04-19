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

const NAV_GROUPS: { label: string; paths: string[] }[] = [
  { label: "Operations", paths: ["/", "/shipments", "/shipments/fauward-go", "/routes", "/dispatch", "/operations/live-map", "/fleet"] },
  { label: "Business", paths: ["/crm", "/finance", "/analytics", "/pricing", "/returns"] },
  { label: "Admin", paths: ["/team", "/activity", "/support", "/reports", "/settings"] },
  { label: "Customer", paths: ["/book"] },
];

function getGroupLabel(to: string): string | null {
  for (const group of NAV_GROUPS) {
    if (group.paths.includes(to)) return group.label;
  }
  return null;
}

export function Sidebar({ mobile = false }: SidebarProps) {
  const user = useAppStore((state) => state.user);
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useAppStore((state) => state.setSidebarCollapsed);
  const tenant = useTenantStore((state) => state.tenant);

  const visibleItems = navItems.filter((item) =>
    user ? item.roles.includes(user.role) : false
  );

  const seenGroups = new Set<string>();

  return (
    <aside
      className={cn(
        mobile
          ? "flex h-full shrink-0 flex-col border-r border-gray-200 bg-white"
          : "hidden h-screen shrink-0 border-r border-gray-200 bg-white lg:flex lg:flex-col",
        mobile ? "w-64" : sidebarCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* Brand header */}
      <div className="flex h-16 items-center border-b border-gray-100 px-4">
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

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {visibleItems.map((item) => {
          const groupLabel = (!sidebarCollapsed || mobile) ? getGroupLabel(item.to) : null;
          const showGroup = groupLabel && !seenGroups.has(groupLabel);
          if (showGroup) seenGroups.add(groupLabel);

          const link = (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "relative flex min-h-[40px] items-center rounded-md px-3 text-sm font-medium transition",
                  isActive
                    ? "bg-[var(--tenant-primary)]/10 text-[var(--tenant-primary)]"
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute inset-y-1 left-0 w-0.5 rounded-r bg-[var(--tenant-primary)]" aria-hidden />
                  )}
                  <item.icon size={17} className="shrink-0" />
                  {!sidebarCollapsed || mobile ? (
                    <span className="ms-3">{item.label}</span>
                  ) : null}
                </>
              )}
            </NavLink>
          );

          return (
            <div key={item.to}>
              {showGroup && (
                <p className="mb-1 mt-4 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 first:mt-0">
                  {groupLabel}
                </p>
              )}
              {sidebarCollapsed && !mobile ? (
                <Tooltip content={item.label} key={item.to}>
                  {link}
                </Tooltip>
              ) : (
                link
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <footer className="space-y-2 border-t border-gray-100 p-2">
        <div className={cn("rounded-lg bg-gray-50 px-3 py-2", sidebarCollapsed && !mobile ? "px-2" : "")}>
          <p className="truncate text-sm font-semibold text-gray-900">{tenant?.name ?? "Tenant"}</p>
          {!sidebarCollapsed || mobile ? (
            <p className="truncate text-xs text-gray-400">{tenant?.domain}</p>
          ) : null}
        </div>
        {!mobile ? (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-gray-500"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            leftIcon={sidebarCollapsed ? <ChevronsRight size={15} /> : <ChevronsLeft size={15} />}
          >
            {!sidebarCollapsed ? "Collapse" : ""}
          </Button>
        ) : null}
      </footer>
    </aside>
  );
}
