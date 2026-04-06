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
  { to: "/admin/impersonation", label: "Impersonation", icon: UserCog }
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
  return (
    <div className="min-h-screen bg-[var(--color-surface-50)] text-[var(--color-text-primary)]">
      <div className="grid min-h-screen grid-cols-[220px,1fr]">
        <aside className="border-r border-[var(--color-border)] bg-white p-3">
          <p className="text-xs font-semibold tracking-wide text-[var(--fauward-navy)]">FAUWARD SUPER ADMIN</p>
          <nav className="mt-3 space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-2 rounded px-2 py-2 text-xs font-medium ${
                  location.pathname === item.to ? "bg-[var(--fauward-navy)] text-white" : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-50)]"
                }`}
              >
                <item.icon size={14} />
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="p-3">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function LogsPage() {
  return (
    <section className="rounded-md border border-[var(--color-border)] bg-white p-3">
      <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">Logs</h1>
      <pre className="mt-2 overflow-x-auto rounded bg-[var(--color-surface-50)] p-2 font-mono text-[11px]">
{`2026-04-06T10:42:10Z INFO tenant=t_2 action=payment_failed
2026-04-06T10:43:55Z WARN queue=webhooks.deliveries retries=3
2026-04-06T10:44:12Z INFO tenant=t_1 action=upgrade_to_pro`}
      </pre>
    </section>
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
