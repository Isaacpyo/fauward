import { BarChart3, Building2, Gauge, ListChecks, Logs, UserCog, Wallet } from "lucide-react";
import { Link, Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";

import { DashboardPage } from "@/pages/admin/DashboardPage";
import { ImpersonationPage } from "@/pages/admin/ImpersonationPage";
import { QueuesPage } from "@/pages/admin/QueuesPage";
import { RevenuePage } from "@/pages/admin/RevenuePage";
import { SystemHealthPage } from "@/pages/admin/SystemHealthPage";
import { TenantDetailPage } from "@/pages/admin/TenantDetailPage";
import { TenantsListPage } from "@/pages/admin/TenantsListPage";

const navItems = [
  { to: "/admin", label: "Dashboard", icon: Gauge },
  { to: "/admin/tenants", label: "Tenants", icon: Building2 },
  { to: "/admin/revenue", label: "Revenue", icon: Wallet },
  { to: "/admin/system", label: "System", icon: BarChart3 },
  { to: "/admin/queues", label: "Queues", icon: ListChecks },
  { to: "/admin/logs", label: "Logs", icon: Logs },
  { to: "/admin/impersonation", label: "Impersonation", icon: UserCog },
];

function requireSuperAdmin(): boolean {
  return true;
}

function SuperAdminGuard() {
  const location = useLocation();
  if (!requireSuperAdmin()) {
    return <Navigate to="/" replace state={{ from: location }} />;
  }
  return <Outlet />;
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
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--fauward-navy)]">
            <svg className="h-4 w-4 text-amber-400" fill="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
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
        <div className="border-t border-[var(--color-border)] px-3 py-3">
          <div className="rounded-lg bg-[var(--color-surface-50)] px-3 py-2">
            <p className="text-xs font-semibold text-[var(--color-text-primary)]">Admin Session</p>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">super-admin@fauward.com</p>
          </div>
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
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold text-[var(--color-text-primary)]">Logs</h1>
      <div className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <pre className="overflow-x-auto rounded-lg bg-[var(--color-surface-50)] p-4 font-mono text-[11px] leading-relaxed text-[var(--color-text-primary)]">
{`2026-04-06T10:42:10Z  INFO  tenant=t_2  action=payment_failed
2026-04-06T10:43:55Z  WARN  queue=webhooks.deliveries retries=3
2026-04-06T10:44:12Z  INFO  tenant=t_1  action=upgrade_to_pro
2026-04-06T10:46:01Z  INFO  tenant=t_8  action=signup
2026-04-06T10:47:33Z  ERROR api route=/v1/shipments status=500`}
        </pre>
      </div>
    </div>
  );
}

export function AppRouter() {
  return (
    <Routes>
      <Route element={<SuperAdminGuard />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<DashboardPage />} />
          <Route path="/admin/tenants" element={<TenantsListPage />} />
          <Route path="/admin/tenants/:id" element={<TenantDetailPage />} />
          <Route path="/admin/revenue" element={<RevenuePage />} />
          <Route path="/admin/system" element={<SystemHealthPage />} />
          <Route path="/admin/queues" element={<QueuesPage />} />
          <Route path="/admin/logs" element={<LogsPage />} />
          <Route path="/admin/impersonation" element={<ImpersonationPage />} />
          <Route path="/" element={<Navigate to="/admin" replace />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
