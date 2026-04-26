import * as RadixDropdown from "@radix-ui/react-dropdown-menu";
import {
  Globe2,
  LogOut,
  Menu,
  Search,
  Settings,
  UserCircle2
} from "lucide-react";
import { Fragment, FormEvent, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { clearTokens, getDevTestSession, getRefreshToken, hasDevTestSession } from "@/lib/auth";
import { api } from "@/lib/api";

import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { NotificationCenter } from "@/components/shared/NotificationCenter";
import { useAppStore } from "@/stores/useAppStore";
import { useTenantStore } from "@/stores/useTenantStore";

const regionOptions = [
  { label: "Africa", value: "africa" },
  { label: "Europe", value: "europe" },
  { label: "North America", value: "northAmerica" },
  { label: "Global", value: "global" }
];

function formatRegion(region: string | undefined) {
  if (region === "northAmerica") return "North America";
  if (!region) return "Global";
  return region.charAt(0).toUpperCase() + region.slice(1);
}

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
  const setMobileSidebarOpen = useAppStore((state) => state.setMobileSidebarOpen);
  const setUser = useAppStore((state) => state.setUser);
  const tenant = useTenantStore((state) => state.tenant);
  const [searchQuery, setSearchQuery] = useState("");
  const [regionModalOpen, setRegionModalOpen] = useState(false);
  const [requestedRegion, setRequestedRegion] = useState(tenant?.region ?? "global");
  const [regionRequestSent, setRegionRequestSent] = useState(false);
  const [regionRequestLoading, setRegionRequestLoading] = useState(false);
  const [regionRequestError, setRegionRequestError] = useState<string | null>(null);

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

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;
    navigate(`/shipments?search=${encodeURIComponent(query)}`);
  }

  async function submitRegionChangeRequest() {
    setRegionRequestLoading(true);
    setRegionRequestError(null);

    try {
      if (hasDevTestSession()) {
        const devSession = getDevTestSession();
        await api.post("/v1/tenant/region-change-requests/dev", {
          tenantId: devSession?.tenant.tenant_id,
          tenantName: devSession?.tenant.name,
          tenantSlug: devSession?.tenant.domain?.split(".")[0],
          currentRegion: devSession?.tenant.region,
          requestedRegion,
          requestedBy: devSession?.user.email
        });
      } else {
        await api.post("/v1/tenant/region-change-requests", { requestedRegion });
      }

      setRegionRequestSent(true);
    } catch (error: unknown) {
      const axiosError = error as { response?: { data?: { error?: string } } };
      setRegionRequestError(axiosError.response?.data?.error ?? "Could not submit region change request.");
    } finally {
      setRegionRequestLoading(false);
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 lg:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2">
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
        <nav className="hidden min-w-0 overflow-hidden text-sm leading-5 text-gray-500 md:block" aria-label="Breadcrumb">
          <span className="block truncate whitespace-nowrap">
            {breadcrumbs.map((item, index) => (
              <Fragment key={item.to}>
                {index > 0 ? (
                  <span className="mx-2 align-baseline text-gray-300" aria-hidden>
                    /
                  </span>
                ) : null}
              <Link
                to={item.to}
                className={`align-baseline ${index === breadcrumbs.length - 1 ? "font-medium text-gray-900" : "hover:text-gray-700"}`}
              >
                {item.label}
              </Link>
              </Fragment>
            ))}
          </span>
        </nav>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <form onSubmit={submitSearch} className="relative hidden sm:block">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search tracking number, customer, reference..."
            className="h-10 w-64 rounded-md border border-gray-300 bg-white pl-9 pr-12 text-sm text-gray-900 outline-none transition placeholder:text-gray-500 focus:border-[var(--tenant-primary)] focus:ring-2 focus:ring-[var(--tenant-primary-light)] lg:w-80 xl:w-96"
          />
          <button
            type="submit"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-100 hover:text-gray-900"
          >
            Go
          </button>
        </form>

        <Button
          variant="secondary"
          size="sm"
          leftIcon={<Globe2 size={16} />}
          onClick={() => {
            setRequestedRegion(tenant?.region ?? "global");
            setRegionRequestSent(false);
            setRegionRequestError(null);
            setRegionModalOpen(true);
          }}
          className="hidden md:inline-flex"
        >
          {formatRegion(tenant?.region)}
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

      <Dialog
        open={regionModalOpen}
        onOpenChange={setRegionModalOpen}
        title="Request region change"
        description="Changing region can affect payment options, currency defaults, operational data handling, and customer-facing settings."
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Region changes are reviewed and approved by Fauward support before they take effect. Your current region remains active until approval is complete.
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Requested region</label>
            <Select
              value={requestedRegion}
              onValueChange={setRequestedRegion}
              options={regionOptions}
            />
          </div>
          {regionRequestSent ? (
            <p className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              Region change request submitted. Fauward support will review and confirm before applying the change.
            </p>
          ) : null}
          {regionRequestError ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {regionRequestError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRegionModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={submitRegionChangeRequest}
              disabled={regionRequestLoading || regionRequestSent}
            >
              {regionRequestLoading ? "Submitting..." : "Request approval"}
            </Button>
          </div>
        </div>
      </Dialog>

    </header>
  );
}
