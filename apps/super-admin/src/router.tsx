import { Activity, BarChart3, Building2, ClipboardList, Gauge, Globe2, Inbox, ListChecks, LogOut, Logs, UserCog, Wallet } from "lucide-react";
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";

import { LoginPage } from "@/auth/LoginPage";
import { SuperAdminGuard } from "@/auth/SuperAdminGuard";

import { StatusPage } from "@/pages/StatusPage";
import { RelayPage } from "@/pages/admin/RelayPage";
import { SupportAuditPage } from "@/pages/admin/SupportAuditPage";
import { RelayNotificationCenter } from "@/components/admin/RelayNotificationCenter";
import { ServiceChrome } from "@/components/service-kit/ServiceChrome";
import { consoleApi } from "@/lib/console-api";
import { ComingSoonRoute, consoleRoutes } from "@/console-routes";
import { ShellLayout } from "@/shell/ShellLayout";

const navItems = [
  { to: "/admin", label: "Dashboard", icon: Gauge },
  { to: "/admin/tenants", label: "Tenants", icon: Building2 },
  { to: "/admin/regions", label: "Region", icon: Globe2 },
  { to: "/admin/revenue", label: "Revenue", icon: Wallet },
  { to: "/admin/system", label: "System", icon: BarChart3 },
  { to: "/admin/queues", label: "Queues", icon: ListChecks },
  { to: "/admin/relay", label: "Relay", icon: Inbox },
  { to: "/admin/support-audit", label: "Support Audit", icon: ClipboardList },
  { to: "/admin/logs", label: "Logs", icon: Logs },
  { to: "/admin/impersonation", label: "Impersonation", icon: UserCog },
  { to: "/status", label: "Status", icon: Activity },
];

function SignOutButton() {
  const navigate = useNavigate();

  async function handleSignOut() {
    try {
      await consoleApi.post("/auth/logout");
    } catch {
      // Best-effort
    } finally {
      navigate("/login");
    }
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
    >
      <LogOut size={13} />
      Sign out
    </button>
  );
}

function AdminLayout() {
  const location = useLocation();

  function isActive(to: string) {
    if (to === "/admin") return location.pathname === "/admin";
    return location.pathname.startsWith(to);
  }

  return (
    <div className="flex min-h-screen bg-[var(--color-surface-50)] text-[var(--color-text-primary)]">
      {/* Sidebar */}
      <aside className="flex w-[240px] shrink-0 flex-col border-r border-[var(--color-border)] bg-white">
        {/* Brand strip */}
        <div className="flex h-14 items-center gap-2.5 border-b border-[var(--color-border)] px-4">
          <img src="/brand/logo-mark.png" alt="Fauward logo" className="h-8 w-8 shrink-0 object-contain" />
          <div>
            <p className="text-xs font-bold leading-none text-[var(--fauward-navy)]">Fauward</p>
            <p className="text-[10px] leading-none text-[var(--color-text-muted)] mt-0.5">Super Admin</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {navItems.map((item) => {
            const active = isActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-[var(--fauward-navy)]/8 text-[var(--fauward-navy)]"
                    : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-50)] hover:text-[var(--color-text-primary)]"
                }`}
              >
                {active && (
                  <span className="absolute inset-y-1 left-0 w-0.5 rounded-r bg-[var(--fauward-navy)]" aria-hidden />
                )}
                <item.icon size={16} className="shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-[var(--color-border)] px-3 py-3 space-y-2">
          <div className="rounded-lg bg-[var(--color-surface-50)] px-3 py-2">
            <p className="text-xs font-semibold text-[var(--color-text-primary)]">Admin Session</p>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">Platform control plane</p>
          </div>
          <SignOutButton />
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-[var(--color-border)] bg-white px-5">
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">
            {navItems.find((item) => isActive(item.to))?.label ?? "Admin"}
          </p>
          <div className="flex items-center gap-2">
            <RelayNotificationCenter />
            <span className="inline-flex items-center rounded-full bg-green-50 border border-green-200 px-2.5 py-0.5 text-[11px] font-semibold text-green-700">
              ● All systems operational
            </span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function LogsPage() {
  return null;
}

function NavigateToPlatformTenant() {
  const { id } = useParams();
  return <Navigate to={`/platform/tenants/${id ?? ""}`} replace />;
}

export function AppRouter() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<SuperAdminGuard />}>
        <Route element={<ShellLayout />}>
          {consoleRoutes.map((route) => (
            <Route key={route.path} path={route.path} element={<ServiceChrome path={route.path} comingSoon={route.element.type === ComingSoonRoute}>{route.element}</ServiceChrome>} />
          ))}
        </Route>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<Navigate to="/" replace />} />
          <Route path="/admin/tenants" element={<Navigate to="/platform/tenants" replace />} />
          <Route path="/admin/tenants/:id" element={<NavigateToPlatformTenant />} />
          <Route path="/admin/regions" element={<Navigate to="/platform/tenants/region-requests" replace />} />
          <Route path="/admin/revenue" element={<Navigate to="/revenue/analytics" replace />} />
          <Route path="/admin/system" element={<Navigate to="/platform/health" replace />} />
          <Route path="/admin/queues" element={<Navigate to="/platform/queues" replace />} />
          <Route path="/admin/relay" element={<RelayPage />} />
          <Route path="/admin/support-audit" element={<SupportAuditPage />} />
          <Route path="/admin/logs" element={<LogsPage />} />
          <Route path="/admin/impersonation" element={<Navigate to="/platform/impersonation" replace />} />
        </Route>
        <Route path="/status" element={<StatusPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
