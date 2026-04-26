import { BarChart3, Building2, ClipboardList, Gauge, Globe2, Inbox, ListChecks, LogOut, Logs, UserCog, Wallet } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import { DashboardPage } from "@/pages/admin/DashboardPage";
import { ImpersonationPage } from "@/pages/admin/ImpersonationPage";
import { QueuesPage } from "@/pages/admin/QueuesPage";
import { RegionsPage } from "@/pages/admin/RegionsPage";
import { RevenuePage } from "@/pages/admin/RevenuePage";
import { RelayPage } from "@/pages/admin/RelayPage";
import { SystemHealthPage } from "@/pages/admin/SystemHealthPage";
import { SupportAuditPage } from "@/pages/admin/SupportAuditPage";
import { TenantDetailPage } from "@/pages/admin/TenantDetailPage";
import { TenantsListPage } from "@/pages/admin/TenantsListPage";
import { RelayNotificationCenter } from "@/components/admin/RelayNotificationCenter";
import { api } from "@/lib/api";
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "@/lib/auth";

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
];

const PLATFORM_ADMIN_CREDENTIALS = {
  email: "fauward@gmail.com",
  password: "Oluwaseun44!",
};

const SUCCESSFUL_LOGIN_DELAY_MS = 1200;

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function SuperAdminGuard() {
  const location = useLocation();
  const [status, setStatus] = useState<"loading" | "ok" | "denied">(
    getAccessToken() ? "loading" : "denied"
  );

  useEffect(() => {
    if (!getAccessToken()) {
      setStatus("denied");
      return;
    }
    api
      .get("/auth/me")
      .then(({ data }) => {
        const role = data?.user?.role ?? data?.role;
        setStatus(role === "SUPER_ADMIN" ? "ok" : "denied");
      })
      .catch(() => setStatus("denied"));
  }, []);

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 bg-[var(--color-surface-50)]">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-200 border-t-[var(--fauward-navy)]" />
        <p className="text-sm text-[var(--color-text-muted)]">Verifying session…</p>
      </div>
    );
  }

  if (status === "denied") {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState(PLATFORM_ADMIN_CREDENTIALS.email);
  const [password, setPassword] = useState(PLATFORM_ADMIN_CREDENTIALS.password);
  const [loading, setLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", {
        email: email.trim().toLowerCase(),
        password: password.trim(),
      });
      // Reject non-super-admin tokens immediately — never grant UI access.
      if (data.role !== "SUPER_ADMIN" && data.user?.role !== "SUPER_ADMIN") {
        setError("Access denied — SUPER_ADMIN role required");
        return;
      }
      setTokens(data.accessToken, data.refreshToken);
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? "/admin";
      setRedirecting(true);
      await wait(SUCCESSFUL_LOGIN_DELAY_MS);
      navigate(from, { replace: true });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error ?? "Invalid credentials");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--color-surface-50)]">
      {loading || redirecting ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-white px-4 py-3 shadow-sm">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-200 border-t-[var(--fauward-navy)]" />
            <span className="text-sm font-medium text-[var(--color-text-primary)]">Signing in...</span>
          </div>
        </div>
      ) : null}
      <div className="w-full max-w-sm px-4">
        <div className="rounded-xl border border-[var(--color-border)] bg-white p-8 shadow-sm">
          <div className="mb-6 flex items-center gap-2.5">
            <img src="/brand/logo-mark.png" alt="Fauward logo" className="h-10 w-10 shrink-0 object-contain" />
            <div>
              <p className="text-sm font-bold text-[var(--fauward-navy)]">Fauward</p>
              <p className="text-xs text-[var(--color-text-muted)]">Super Admin</p>
            </div>
          </div>

          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Sign in</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Internal access only.</p>

          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]" htmlFor="sa-email">
                Email
              </label>
              <input
                id="sa-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--fauward-navy)] focus:ring-1 focus:ring-[var(--fauward-navy)]"
                placeholder={PLATFORM_ADMIN_CREDENTIALS.email}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-[var(--color-text-primary)]" htmlFor="sa-password">
                Password
              </label>
              <input
                id="sa-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text-primary)] outline-none focus:border-[var(--fauward-navy)] focus:ring-1 focus:ring-[var(--fauward-navy)]"
                placeholder="••••••••"
              />
            </div>
            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            ) : null}
            <button
              type="submit"
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-[var(--fauward-navy)] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
          <p className="mt-5 text-center text-xs text-[var(--color-text-muted)]">
            Need help?{" "}
            <a href="mailto:support@fauward.com" className="font-semibold text-[var(--fauward-navy)] hover:underline">
              Contact support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}

function SignOutButton() {
  const navigate = useNavigate();

  async function handleSignOut() {
    try {
      const refreshToken = getRefreshToken();
      await api.post("/auth/logout", { refreshToken });
    } catch {
      // Best-effort
    } finally {
      clearTokens();
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
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">super-admin@fauward.com</p>
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
      <Route path="/login" element={<LoginPage />} />
      <Route element={<SuperAdminGuard />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<DashboardPage />} />
          <Route path="/admin/tenants" element={<TenantsListPage />} />
          <Route path="/admin/tenants/:id" element={<TenantDetailPage />} />
          <Route path="/admin/regions" element={<RegionsPage />} />
          <Route path="/admin/revenue" element={<RevenuePage />} />
          <Route path="/admin/system" element={<SystemHealthPage />} />
          <Route path="/admin/queues" element={<QueuesPage />} />
          <Route path="/admin/relay" element={<RelayPage />} />
          <Route path="/admin/support-audit" element={<SupportAuditPage />} />
          <Route path="/admin/logs" element={<LogsPage />} />
          <Route path="/admin/impersonation" element={<ImpersonationPage />} />
          <Route path="/" element={<Navigate to="/admin" replace />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}
