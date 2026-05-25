import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight, Lock } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { navItems, type NavChild, type NavItem } from "@/layouts/navigation";
import {
  formatPlanLabel,
  getFeatureMinimumPlan,
  hasFeatureAccess,
  hasPlanAccess,
  type Plan
} from "@/lib/plan-features";
import { useAppStore } from "@/stores/useAppStore";
import { useTenantStore } from "@/stores/useTenantStore";

type SidebarProps = {
  mobile?: boolean;
};

const NAV_GROUPS: { label: string; paths: string[] }[] = [
  { label: "Operations", paths: ["/", "/shipments", "/fauward-go", "/operations", "/operations/live-map", "/fleet"] },
  { label: "Business", paths: ["/crm", "/finance", "/analytics", "/pricing", "/returns"] },
  { label: "Admin", paths: ["/team", "/activity", "/support", "/reports", "/settings", "/developer"] },
  { label: "Customer", paths: ["/book"] },
];

function getGroupLabel(to: string): string | null {
  for (const group of NAV_GROUPS) {
    if (group.paths.includes(to)) return group.label;
  }
  return null;
}

function isChildActive(child: NavChild, pathname: string, tabParam: string | null): boolean {
  const [childPath] = child.to.split("?");
  if (child.tabValue !== undefined) {
    return pathname === childPath && tabParam === child.tabValue;
  }
  return pathname === childPath;
}

function isParentActive(item: NavItem, pathname: string, tabParam: string | null): boolean {
  if (pathname === item.to || pathname.startsWith(`${item.to}/`)) return true;
  if (!item.children) return false;
  return item.children.some((child) => isChildActive(child, pathname, tabParam));
}

export function Sidebar({ mobile = false }: SidebarProps) {
  const user = useAppStore((state) => state.user);
  const sidebarCollapsed = useAppStore((state) => state.sidebarCollapsed);
  const setSidebarCollapsed = useAppStore((state) => state.setSidebarCollapsed);
  const tenant = useTenantStore((state) => state.tenant);

  const location = useLocation();
  const tabParam = new URLSearchParams(location.search).get("tab");

  const currentPlan = user?.plan;
  const visibleItems = navItems.filter((item) => {
    if (!user || !item.roles.includes(user.role)) return false;
    return hasFeatureAccess(currentPlan, item.feature) || item.showWhenLocked;
  });

  const activeParent =
    visibleItems.find((item) => item.children && isParentActive(item, location.pathname, tabParam))?.to ?? null;

  const [expandedParent, setExpandedParent] = useState<string | null>(activeParent);

  useEffect(() => {
    if (activeParent && activeParent !== expandedParent) {
      setExpandedParent(activeParent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeParent]);

  const seenGroups = new Set<string>();

  return (
    <aside
      className={cn(
        mobile
          ? "flex h-full shrink-0 flex-col border-r border-gray-200 bg-white"
          : "sticky top-0 hidden h-screen shrink-0 self-start border-r border-gray-200 bg-white lg:flex lg:flex-col",
        mobile ? "w-64" : sidebarCollapsed ? "w-16" : "w-64"
      )}
    >
      {/* Brand header */}
      <div className="flex h-16 items-center border-b border-gray-100 px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <img src="/brand/logo-mark.png" alt="Fauward logo" className="h-8 w-8 shrink-0 object-contain" />
          {!sidebarCollapsed || mobile ? (
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-[var(--tenant-primary)]">Fauward</p>
              <p className="truncate text-[11px] text-gray-400">{tenant?.name ?? "Tenant Portal"}</p>
            </div>
          ) : null}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {visibleItems.map((item) => {
          const groupLabel = (!sidebarCollapsed || mobile) ? getGroupLabel(item.to) : null;
          const showGroup = groupLabel && !seenGroups.has(groupLabel);
          if (showGroup) seenGroups.add(groupLabel);
          const locked = !hasFeatureAccess(currentPlan, item.feature);
          const minimumPlan = getFeatureMinimumPlan(item.feature);
          const hasChildren = Boolean(item.children?.length);
          const isExpanded = hasChildren && expandedParent === item.to;
          const parentIsActiveSelf = location.pathname === item.to || location.pathname.startsWith(`${item.to}/`);
          const showChildren = hasChildren && isExpanded && (!sidebarCollapsed || mobile);

          const parentLabel = (
            <>
              <item.icon size={17} className="shrink-0" />
              {!sidebarCollapsed || mobile ? (
                <>
                  <span className="ms-3 min-w-0 flex-1 truncate">{item.label}</span>
                  {locked ? (
                    <span className="ms-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      <Lock size={10} />
                      {formatPlanLabel(minimumPlan)}
                    </span>
                  ) : null}
                  {hasChildren ? (
                    isExpanded ? (
                      <ChevronDown size={14} className="ms-1 shrink-0 text-gray-400" aria-hidden />
                    ) : (
                      <ChevronRight size={14} className="ms-1 shrink-0 text-gray-400" aria-hidden />
                    )
                  ) : null}
                </>
              ) : null}
              {sidebarCollapsed && !mobile && locked ? <Lock size={13} className="ms-auto" /> : null}
            </>
          );

          const parentClass = ({ isActive }: { isActive: boolean }) =>
            cn(
              "relative flex min-h-[34px] w-full items-center rounded-md px-3 text-left text-xs font-medium transition",
              locked
                ? "text-gray-400 hover:bg-amber-50 hover:text-amber-700"
                : isActive || (hasChildren && (parentIsActiveSelf || isExpanded))
                ? "bg-[var(--tenant-primary)]/10 text-[var(--tenant-primary)]"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            );

          // Parent: clicking it both navigates AND expands children (Cloudflare pattern).
          const parentLink = (
            <NavLink
              to={item.to}
              end={item.to === "/"}
              onClick={() => {
                if (hasChildren) {
                  setExpandedParent((current) => (current === item.to ? null : item.to));
                }
              }}
              className={parentClass}
              aria-expanded={hasChildren ? isExpanded : undefined}
            >
              {({ isActive }) => (
                <>
                  {isActive && !hasChildren && (
                    <span className="absolute inset-y-1 left-0 w-0.5 rounded-r bg-[var(--tenant-primary)]" aria-hidden />
                  )}
                  {parentLabel}
                </>
              )}
            </NavLink>
          );

          return (
            <div key={`${item.to}-${item.label}`}>
              {showGroup && (
                <p className="mb-1 mt-3 px-3 text-[9px] font-bold uppercase tracking-[0.14em] text-gray-400 first:mt-0">
                  {groupLabel}
                </p>
              )}
              {sidebarCollapsed && !mobile ? (
                <Tooltip content={locked ? `${item.label} requires ${formatPlanLabel(minimumPlan)}` : item.label}>
                  {parentLink}
                </Tooltip>
              ) : (
                parentLink
              )}

              {showChildren ? (
                <ul className="mt-0.5 mb-1 space-y-0.5">
                  {item.children!.map((child) => {
                    const childActive = isChildActive(child, location.pathname, tabParam);
                    const childLocked = child.minimumPlan
                      ? !hasPlanAccess(currentPlan, child.minimumPlan as Plan)
                      : false;
                    return (
                      <li key={child.to}>
                        <NavLink
                          to={child.to}
                          className={cn(
                            "flex min-h-[28px] items-center rounded-md py-1 pl-10 pr-3 text-[11px] font-medium transition",
                            childActive
                              ? "bg-[var(--tenant-primary)]/10 text-[var(--tenant-primary)]"
                              : childLocked
                              ? "text-gray-400 hover:bg-amber-50 hover:text-amber-700"
                              : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                          )}
                        >
                          <span className="min-w-0 flex-1 truncate">{child.label}</span>
                          {childLocked ? (
                            <span className="ms-2 inline-flex items-center gap-1 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">
                              <Lock size={9} />
                              {formatPlanLabel(child.minimumPlan as Plan)}
                            </span>
                          ) : null}
                        </NavLink>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <footer className="space-y-2 border-t border-gray-100 p-2">
        <div className={cn("rounded-lg bg-gray-50 px-3 py-2", sidebarCollapsed && !mobile ? "px-2" : "")}>
          <p className="truncate text-xs font-semibold text-gray-900">{tenant?.name ?? "Tenant"}</p>
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
