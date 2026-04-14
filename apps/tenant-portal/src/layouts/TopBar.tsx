import * as RadixDropdown from "@radix-ui/react-dropdown-menu";
import {
  ChevronRight,
  LogOut,
  Menu,
  Search,
  Settings,
  UserCircle2
} from "lucide-react";
import { useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { clearTokens, getRefreshToken } from "@/lib/auth";

import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { NotificationCenter } from "@/components/shared/NotificationCenter";
import { useAppStore } from "@/stores/useAppStore";
import { useTenantStore } from "@/stores/useTenantStore";

const breadcrumbLabelMap: Record<string, string> = {
  shipments: "Shipments",
  create: "Create",
  routes: "Routes",
  dispatch: "Dispatch",
  crm: "CRM",
  finance: "Finance",
  analytics: "Analytics",
  activity: "Activity",
  returns: "Returns",
  support: "Support",
  reports: "Reports",
  operations: "Operations",
  "live-map": "Live Map",
  fleet: "Fleet",
  pricing: "Pricing",
  team: "Team",
  settings: "Settings",
  track: "Track",
  book: "Book",
  onboarding: "Onboarding",
  login: "Login",
  register: "Register"
};

function humanizeSegment(segment: string): string {
  return breadcrumbLabelMap[segment] || segment.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function TopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAppStore((state) => state.user);
  const setCommandPaletteOpen = useAppStore((state) => state.setCommandPaletteOpen);
  const setMobileSidebarOpen = useAppStore((state) => state.setMobileSidebarOpen);
  const setUser = useAppStore((state) => state.setUser);
  const tenant = useTenantStore((state) => state.tenant);

  const breadcrumbs = useMemo(() => {
    const parts = location.pathname.split("/").filter(Boolean);
    const list = [{ label: "Dashboard", to: "/" }];
    let currentPath = "";
    parts.forEach((part) => {
      currentPath += `/${part}`;
      list.push({ label: humanizeSegment(part), to: currentPath });
    });
    return list;
  }, [location.pathname]);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 lg:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="lg:hidden"
          leftIcon={<Menu size={16} />}
          onClick={() => setMobileSidebarOpen(true)}
        >
          Menu
        </Button>
        <div className="lg:hidden">
          {tenant?.logo_url ? (
            <img src={tenant.logo_url} alt={tenant.name} className="h-8 w-auto object-contain" />
          ) : (
            <div className="rounded bg-[var(--tenant-primary)] px-2 py-1 text-xs font-semibold text-white">F</div>
          )}
        </div>
        <nav className="hidden min-w-0 items-center gap-1 text-sm text-gray-500 md:flex" aria-label="Breadcrumb">
          {breadcrumbs.map((item, index) => (
            <div key={item.to} className="flex min-w-0 items-center gap-1">
              {index > 0 ? <ChevronRight size={14} className="shrink-0" /> : null}
              <Link
                to={item.to}
                className={`truncate ${index === breadcrumbs.length - 1 ? "text-gray-900" : "hover:text-gray-700"}`}
              >
                {item.label}
              </Link>
            </div>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Search size={16} />}
          onClick={() => setCommandPaletteOpen(true)}
          className="hidden sm:inline-flex"
        >
          Search
          <span className="ms-1 rounded bg-gray-100 px-1 py-0.5 text-xs text-gray-500">Ctrl+K</span>
        </Button>

        <NotificationCenter />

        <RadixDropdown.Root>
          <RadixDropdown.Trigger asChild>
            <button className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-white px-2 py-1.5 hover:bg-gray-50">
              <Avatar src={user?.avatar_url} fallback={user?.full_name ?? "User"} className="h-8 w-8" />
              <div className="hidden text-left sm:block">
                <p className="text-sm font-medium text-gray-900">{user?.full_name ?? "User"}</p>
                <Badge variant="neutral" className="mt-0.5">
                  {user?.role ?? "Unknown"}
                </Badge>
              </div>
            </button>
          </RadixDropdown.Trigger>
          <RadixDropdown.Portal>
            <RadixDropdown.Content
              align="end"
              sideOffset={8}
              className="z-50 w-[220px] rounded-lg border border-gray-200 bg-white p-1 shadow-sm"
            >
              <RadixDropdown.Item asChild>
                <Link className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100" to="/profile">
                  <UserCircle2 size={15} />
                  Profile
                </Link>
              </RadixDropdown.Item>
              <RadixDropdown.Item asChild>
                <Link className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-gray-700 hover:bg-gray-100" to="/settings">
                  <Settings size={15} />
                  Settings
                </Link>
              </RadixDropdown.Item>
              <RadixDropdown.Separator className="my-1 h-px bg-gray-200" />
              <RadixDropdown.Item
                className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm text-red-600 outline-none hover:bg-red-50"
                onSelect={async () => {
                  try {
                    const refreshToken = getRefreshToken();
                    await import("@/lib/api").then(({ api: apiClient }) =>
                      apiClient.post("/v1/auth/logout", { refreshToken })
                    );
                  } catch {
                    // Best-effort — always clear locally regardless of API outcome
                  } finally {
                    clearTokens();
                    setUser(null);
                    navigate("/login");
                  }
                }}
              >
                <LogOut size={15} />
                Logout
              </RadixDropdown.Item>
            </RadixDropdown.Content>
          </RadixDropdown.Portal>
        </RadixDropdown.Root>
      </div>

    </header>
  );
}
