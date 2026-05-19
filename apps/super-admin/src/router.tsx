import { Activity, BarChart3, Building2, ClipboardList, Gauge, Globe2, Inbox, ListChecks, LogOut, Logs, UserCog, Wallet } from "lucide-react";
import { FormEvent, type ReactNode, useEffect, useState } from "react";
import { Link, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";

import { RegionsPage } from "@/pages/admin/RegionsPage";
import { StatusPage } from "@/pages/StatusPage";
import { RelayPage } from "@/pages/admin/RelayPage";
import { SupportAuditPage } from "@/pages/admin/SupportAuditPage";
import { RelayNotificationCenter } from "@/components/admin/RelayNotificationCenter";
import { api } from "@/lib/api";
import { hasPlatformSessionHint } from "@/lib/auth";
import { internalApi } from "@/lib/internal-api";
import { buildPermissionContext, type PlatformSessionUser } from "@/lib/platform-session";
import { CustomerOverview } from "@/pillars/customer/CustomerOverview";
import { Customer360Page } from "@/pillars/customer/customer360/Customer360Page";
import { GtmOverview } from "@/pillars/gtm/GtmOverview";
import { InternalOpsPage } from "@/pillars/InternalOpsPage";
import { WorkflowOpsPage, hasWorkflowSurface } from "@/pillars/WorkflowOpsPage";
import { SystemHealthPage } from "@/pillars/platform/health/SystemHealthPage";
import { ImpersonationStartPage } from "@/pillars/platform/impersonation/ImpersonationStartPage";
import { PlatformOverview } from "@/pillars/platform/PlatformOverview";
import { QueuesListPage } from "@/pillars/platform/queues/QueuesListPage";
import { TenantDetailPage } from "@/pillars/platform/tenants/TenantDetailPage";
import { TenantsListPage } from "@/pillars/platform/tenants/TenantsListPage";
import { RevenueOverview } from "@/pillars/revenue/RevenueOverview";
import { RevenueAnalyticsPage } from "@/pillars/revenue/analytics/RevenueAnalyticsPage";
import { CreditNotesPage } from "@/pillars/revenue/billing/CreditNotesPage";
import { InvoiceCreatePage } from "@/pillars/revenue/billing/InvoiceCreatePage";
import { InvoiceDetailPage } from "@/pillars/revenue/billing/InvoiceDetailPage";
import { InvoicesListPage } from "@/pillars/revenue/billing/InvoicesListPage";
import { PaymentsPage } from "@/pillars/revenue/billing/PaymentsPage";
import { RefundsPage } from "@/pillars/revenue/billing/RefundsPage";
import { TrustOverview } from "@/pillars/trust/TrustOverview";
import { AuditExportPage } from "@/pillars/trust/audit/AuditExportPage";
import { AuditIntegrityPage } from "@/pillars/trust/audit/AuditIntegrityPage";
import { AuditLogPage } from "@/pillars/trust/audit/AuditLogPage";
import { AuditTimelinePage } from "@/pillars/trust/audit/AuditTimelinePage";
import { GroupsPage } from "@/pillars/trust/iam/GroupsPage";
import { PermissionsPage } from "@/pillars/trust/iam/PermissionsPage";
import { RoleDetailPage } from "@/pillars/trust/iam/RoleDetailPage";
import { RolesPage } from "@/pillars/trust/iam/RolesPage";
import { UserDetailPage } from "@/pillars/trust/iam/UserDetailPage";
import { UsersListPage } from "@/pillars/trust/iam/UsersListPage";
import { PillarDashboard } from "@/shell/PillarDashboard";
import { ShellLayout } from "@/shell/ShellLayout";
import { PermissionProvider, type Permission } from "@fauward/internal-rbac";
import { JITGate } from "@fauward/internal-ui";

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

const SUCCESSFUL_LOGIN_DELAY_MS = 1200;

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function SuperAdminGuard() {
  const location = useLocation();
  const [status, setStatus] = useState<"loading" | "ok" | "denied">(
    hasPlatformSessionHint() ? "loading" : "denied"
  );
  const [user, setUser] = useState<PlatformSessionUser | null>(null);

  useEffect(() => {
    if (!hasPlatformSessionHint()) {
      setStatus("denied");
      return;
    }
    api
      .get("/auth/me")
      .then(({ data }) => {
        if (!Array.isArray(data?.user?.permissions)) {
          setStatus("denied");
          return;
        }

        setUser({
          id: String(data.user.id),
          email: String(data.user.email),
          name: typeof data.user.name === "string" ? data.user.name : null,
          role: typeof data.user.role === "string" ? data.user.role : null,
          permissions: data.user.permissions.map(String)
        });
        setStatus("ok");
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

  if (!user) {
    return null;
  }

  const permissionContext = buildPermissionContext(user);

  return (
    <PermissionProvider roles={permissionContext.roles} permissions={permissionContext.permissions}>
      <Outlet context={{ user }} />
    </PermissionProvider>
  );
}

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
        password,
      });
      // Reject tokens without platform permissions immediately; never grant UI access.
      if (!Array.isArray(data.user?.permissions)) {
        setError("Access denied - platform console permission required");
        return;
      }
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? "/";
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
                placeholder="platform-admin@example.com"
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
      await api.post("/auth/logout");
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

type NotificationLog = {
  id: string;
  tenantId: string;
  channel: string;
  event: string;
  status: string;
  error?: string | null;
  createdAt: string;
};

function LogsPanel({ onClose }: { onClose: () => void }) {
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ logs: NotificationLog[] }>("/logs")
      .then((r) => setLogs(r.data.logs ?? []))
      .finally(() => setLoading(false));
  }, []);

  const statusColour: Record<string, string> = {
    SENT: "text-green-600",
    QUEUED: "text-amber-600",
    FAILED: "text-red-600",
  };

  return (
    <>
      {/* backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px]"
        onClick={onClose}
      />
      {/* panel */}
      <div className="fixed inset-y-0 right-0 z-50 flex w-[480px] flex-col border-l border-[var(--color-border)] bg-white shadow-2xl">
        {/* header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4">
          <div className="flex items-center gap-2">
            <Logs size={16} className="text-[var(--color-text-muted)]" />
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">Notification Logs</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-50)] hover:text-[var(--color-text-primary)]"
          >
            ✕
          </button>
        </div>

        {/* body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-200 border-t-[var(--fauward-navy)]" />
            </div>
          ) : logs.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[var(--color-text-muted)]">No logs found.</p>
          ) : (
            <ul className="divide-y divide-[var(--color-border)]">
              {logs.map((log) => (
                <li key={log.id} className="px-4 py-3 hover:bg-[var(--color-surface-50)]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs font-semibold text-[var(--color-text-primary)]">
                        {log.event}
                      </p>
                      <p className="mt-0.5 font-mono text-[11px] text-[var(--color-text-muted)]">
                        {log.channel} · {log.tenantId.slice(0, 8)}…
                      </p>
                      {log.error ? (
                        <p className="mt-1 truncate font-mono text-[11px] text-red-600">{log.error}</p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <span className={`font-mono text-[11px] font-semibold ${statusColour[log.status] ?? "text-[var(--color-text-muted)]"}`}>
                        {log.status}
                      </span>
                      <p className="mt-0.5 font-mono text-[10px] text-[var(--color-text-muted)]">
                        {new Date(log.createdAt).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

function LogsPage() {
  return null;
}

function ForbiddenRoute() {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-white p-5">
      <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">Access denied</h1>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">You do not have permission to view this page.</p>
    </div>
  );
}

async function requestJitAccess(permission: Permission, reason: string) {
  await internalApi.post("/jit/requests", { permission, reason, durationMinutes: 60 });
}

function PermissionRoute({ permission, children }: { permission: Permission; children: ReactNode }) {
  return (
    <JITGate permission={permission} requestTitle="Request elevated access" onRequest={requestJitAccess}>
      {children}
    </JITGate>
  );
}

function OpsRoute({ permission, title, description, endpoint, related, primaryAction }: { permission: Permission; title: string; description: string; endpoint: string; related?: Array<{ label: string; to: string }>; primaryAction?: string }) {
  const Page = hasWorkflowSurface(endpoint) ? WorkflowOpsPage : InternalOpsPage;
  return (
    <PermissionRoute permission={permission}>
      <Page title={title} description={description} endpoint={endpoint} related={related} primaryAction={primaryAction} />
    </PermissionRoute>
  );
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
          <Route path="/" element={<PillarDashboard />} />
          <Route path="/platform" element={<PlatformOverview />} />
          <Route
            path="/platform/health"
            element={
              <PermissionRoute permission="platform.health.read">
                <SystemHealthPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/platform/queues"
            element={
              <PermissionRoute permission="platform.queues.read">
                <QueuesListPage />
              </PermissionRoute>
            }
          />
          <Route path="/platform/flags" element={<OpsRoute permission="platform.flags.read" title="Feature Flags" description="LaunchDarkly flags with Fauward per-tenant override audit." endpoint="/flags" related={[{ label: "Releases", to: "/platform/releases" }]} />} />
          <Route path="/platform/flags/:key" element={<OpsRoute permission="platform.flags.read" title="Feature Flag Detail" description="Flag detail, tenant overrides and local audit entries." endpoint="/flags/:key" related={[{ label: "Audit", to: "audit" }]} />} />
          <Route path="/platform/flags/:key/audit" element={<OpsRoute permission="platform.flags.read" title="Flag Audit" description="Local audit of per-tenant LaunchDarkly override changes." endpoint="/flags/:key/audit" />} />
          <Route path="/platform/releases" element={<OpsRoute permission="platform.flags.read" title="Releases" description="Current deployed versions and release workflow links." endpoint="/releases" />} />
          <Route path="/platform/incidents" element={<OpsRoute permission="platform.incidents.read" title="Incidents" description="PagerDuty incidents enriched with affected Fauward tenants." endpoint="/incidents" related={[{ label: "Runbooks", to: "/platform/incidents/runbooks" }]} />} />
          <Route path="/platform/incidents/runbooks" element={<OpsRoute permission="platform.incidents.read" title="Incident Runbooks" description="Markdown runbook library for incident responders." endpoint="/incidents/runbooks" />} />
          <Route path="/platform/incidents/:id" element={<OpsRoute permission="platform.incidents.read" title="Incident Detail" description="Incident timeline and tenant impact mapping." endpoint="/incidents/:id" />} />
          <Route path="/platform/incidents/:id/postmortem" element={<OpsRoute permission="platform.incidents.read" title="Postmortem" description="Postmortem link and incident closure context." endpoint="/incidents/:id" />} />
          <Route path="/platform/integrations" element={<OpsRoute permission="platform.integrations.read" title="Integration Health" description="Third-party provider status, credentials and webhook delivery health." endpoint="/integrations" related={[{ label: "Credentials", to: "/platform/integrations/credentials" }, { label: "Webhooks", to: "/platform/integrations/webhooks" }]} />} />
          <Route path="/platform/integrations/credentials" element={<OpsRoute permission="platform.integrations.read" title="Integration Credentials" description="Credential metadata shared with the secret rotation tracker." endpoint="/integrations/credentials" />} />
          <Route path="/platform/integrations/webhooks" element={<OpsRoute permission="platform.integrations.read" title="Webhook Health" description="Outbound webhook delivery attempts, retries and failures." endpoint="/integrations/webhooks" />} />
          <Route path="/platform/integrations/:provider" element={<OpsRoute permission="platform.integrations.read" title="Provider Detail" description="Provider health detail and recent status." endpoint="/integrations/:provider" />} />
          <Route
            path="/platform/impersonation"
            element={
              <PermissionRoute permission="platform.impersonation.start">
                <ImpersonationStartPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/platform/tenants"
            element={
              <PermissionRoute permission="platform.tenants.read">
                <TenantsListPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/platform/tenants/:id"
            element={
              <PermissionRoute permission="platform.tenants.read">
                <TenantDetailPage />
              </PermissionRoute>
            }
          />
          <Route path="/revenue" element={<RevenueOverview />} />
          <Route path="/revenue/billing" element={<Navigate to="/revenue/billing/invoices" replace />} />
          <Route
            path="/revenue/billing/invoices"
            element={
              <PermissionRoute permission="revenue.invoices.read">
                <InvoicesListPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/revenue/billing/invoices/create"
            element={
              <PermissionRoute permission="revenue.invoices.write">
                <InvoiceCreatePage />
              </PermissionRoute>
            }
          />
          <Route
            path="/revenue/billing/invoices/:id"
            element={
              <PermissionRoute permission="revenue.invoices.read">
                <InvoiceDetailPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/revenue/billing/credit-notes"
            element={
              <PermissionRoute permission="revenue.invoices.write">
                <CreditNotesPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/revenue/billing/refunds"
            element={
              <PermissionRoute permission="revenue.invoices.refund">
                <RefundsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/revenue/billing/payments"
            element={
              <PermissionRoute permission="revenue.invoices.read">
                <PaymentsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/revenue/analytics"
            element={
              <PermissionRoute permission="revenue.analytics.read">
                <RevenueAnalyticsPage />
              </PermissionRoute>
            }
          />
          <Route path="/revenue/dunning" element={<OpsRoute permission="revenue.dunning.read" title="Dunning Manager" description="Failed payment recovery, retry limits and save-the-customer offers." endpoint="/dunning/failed-payments" related={[{ label: "Sequences", to: "/revenue/dunning/sequences" }, { label: "Save Offers", to: "/revenue/dunning/save-offers" }]} />} />
          <Route path="/revenue/dunning/:tenantId" element={<OpsRoute permission="revenue.dunning.read" title="Dunning Timeline" description="Tenant-level failed payment and recovery timeline." endpoint="/dunning/timeline/:tenantId" />} />
          <Route path="/revenue/dunning/sequences" element={<OpsRoute permission="revenue.dunning.read" title="Dunning Sequences" description="Email and action sequences for failed payment recovery." endpoint="/dunning/sequences" />} />
          <Route path="/revenue/dunning/save-offers" element={<OpsRoute permission="revenue.dunning.read" title="Save Offers" description="Approved discounts and credits for save-the-customer workflows." endpoint="/dunning/save-offers" />} />
          <Route path="/revenue/tax" element={<OpsRoute permission="revenue.tax.read" title="Tax & Compliance" description="Regional VAT/GST registrations, returns and exemption workflow." endpoint="/tax" related={[{ label: "Returns", to: "/revenue/tax/returns" }, { label: "Registrations", to: "/revenue/tax/registrations" }, { label: "Exemptions", to: "/revenue/tax/exemptions" }]} />} />
          <Route path="/revenue/tax/returns" element={<OpsRoute permission="revenue.tax.read" title="Tax Returns" description="Per-region return periods and filing status." endpoint="/tax/returns" />} />
          <Route path="/revenue/tax/registrations" element={<OpsRoute permission="revenue.tax.read" title="Tax Registrations" description="VAT and GST registrations across Fauward operating regions." endpoint="/tax/registrations" />} />
          <Route path="/revenue/tax/exemptions" element={<OpsRoute permission="revenue.tax.read" title="Tax Exemptions" description="Tenant exemption certificates and approval state." endpoint="/tax/exemptions" />} />
          <Route path="/revenue/subscriptions" element={<OpsRoute permission="revenue.subscriptions.read" title="Subscription Manager" description="Custom contracts, pricing overrides and subscription state." endpoint="/subscriptions" related={[{ label: "Contracts", to: "/revenue/subscriptions/contracts" }, { label: "Overrides", to: "/revenue/subscriptions/overrides" }]} />} />
          <Route path="/revenue/subscriptions/:id" element={<OpsRoute permission="revenue.subscriptions.read" title="Subscription Detail" description="Subscription and custom contract context." endpoint="/subscriptions" />} />
          <Route path="/revenue/subscriptions/contracts" element={<OpsRoute permission="revenue.subscriptions.read" title="Enterprise MSAs" description="Custom contracts and signed agreement metadata." endpoint="/subscriptions/contracts" />} />
          <Route path="/revenue/subscriptions/overrides" element={<OpsRoute permission="revenue.subscriptions.read" title="Pricing Overrides" description="Non-standard pricing approvals and active override rules." endpoint="/subscriptions/overrides" />} />
          <Route path="/revenue/commissions" element={<OpsRoute permission="revenue.commissions.read" title="Reseller Commissions" description="Partner commission ledger and payout controls." endpoint="/commissions" related={[{ label: "Payouts", to: "/revenue/commissions/payouts" }, { label: "Disputes", to: "/revenue/commissions/disputes" }]} />} />
          <Route path="/revenue/commissions/payouts" element={<OpsRoute permission="revenue.commissions.read" title="Commission Payouts" description="Finance-approved payout queue with CFO threshold controls." endpoint="/commissions/payouts" />} />
          <Route path="/revenue/commissions/disputes" element={<OpsRoute permission="revenue.commissions.read" title="Commission Disputes" description="Partner disputes over commission attribution or payout." endpoint="/commissions/disputes" />} />
          <Route path="/revenue/commissions/:partnerId" element={<OpsRoute permission="revenue.commissions.read" title="Partner Commissions" description="Per-partner commission ledger and payout history." endpoint="/commissions" />} />
          <Route path="/customer" element={<CustomerOverview />} />
          <Route
            path="/customer/360/:tenantId"
            element={
              <PermissionRoute permission="customer.360.read">
                <Customer360Page />
              </PermissionRoute>
            }
          />
          <Route path="/customer/support" element={<OpsRoute permission="customer.support.read" title="Support Desk" description="Zendesk tickets and SLA risk surfaced by tenant context." endpoint="/support/tickets" related={[{ label: "SLA", to: "/customer/support/sla" }, { label: "Macros", to: "/customer/support/macros" }]} />} />
          <Route path="/customer/support/sla" element={<OpsRoute permission="customer.support.read" title="SLA Risk" description="Open support tickets ordered by oldest update and breach risk." endpoint="/support/sla" />} />
          <Route path="/customer/support/macros" element={<OpsRoute permission="customer.support.read" title="Support Macros" description="Canned responses sourced from Zendesk when configured." endpoint="/support/macros" />} />
          <Route path="/customer/success" element={<OpsRoute permission="customer.success.read" title="CS Console" description="CSM book of business and tenant health score rollups." endpoint="/success" related={[{ label: "At Risk", to: "/customer/success/at-risk" }, { label: "Expansion", to: "/customer/success/expansion" }, { label: "Playbooks", to: "/customer/success/playbooks" }, { label: "Health Scoring", to: "/customer/success/health-scoring" }]} />} />
          <Route path="/customer/success/at-risk" element={<OpsRoute permission="customer.success.read" title="At-Risk Accounts" description="Low health score tenants queued for intervention." endpoint="/success/at-risk" />} />
          <Route path="/customer/success/expansion" element={<OpsRoute permission="customer.success.read" title="Expansion Ready" description="High health score tenants ready for expansion motion." endpoint="/success/expansion" />} />
          <Route path="/customer/success/playbooks" element={<OpsRoute permission="customer.success.read" title="CS Playbooks" description="Health-triggered customer success playbooks." endpoint="/success/playbooks" />} />
          <Route path="/customer/success/playbooks/:id/runs" element={<OpsRoute permission="customer.success.read" title="Playbook Runs" description="Sequential playbook execution status for tenant workflows." endpoint="/success/playbooks/:id/runs" />} />
          <Route path="/customer/success/health-scoring" element={<OpsRoute permission="customer.success.read" title="Health Scoring" description="Weighted model configuration for nightly health scoring." endpoint="/success/health-scoring" />} />
          <Route path="/customer/comms" element={<OpsRoute permission="customer.comms.read" title="Communications Hub" description="Tenant-facing announcements and incident notices." endpoint="/announcements" primaryAction="New announcement" />} />
          <Route path="/customer/onboarding" element={<OpsRoute permission="customer.onboarding.read" title="Onboarding Tracker" description="Activation funnel for recently created tenants." endpoint="/onboarding/funnel" />} />
          <Route path="/customer/qbr" element={<OpsRoute permission="customer.qbr.read" title="QBR Center" description="Quarterly business review calendar and generated decks." endpoint="/qbr" related={[{ label: "Templates", to: "/customer/qbr/templates" }]} />} />
          <Route path="/customer/qbr/templates" element={<OpsRoute permission="customer.qbr.read" title="QBR Templates" description="HTML/CSS deck templates by customer segment." endpoint="/qbr/templates" />} />
          <Route path="/customer/qbr/:tenantId" element={<OpsRoute permission="customer.qbr.read" title="Tenant QBR" description="Generated QBR decks and export status for one tenant." endpoint="/qbr/:tenantId" />} />
          <Route path="/trust" element={<TrustOverview />} />
          <Route path="/trust/iam" element={<Navigate to="/trust/iam/users" replace />} />
          <Route
            path="/trust/iam/users"
            element={
              <PermissionRoute permission="trust.iam.read">
                <UsersListPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/trust/iam/users/:id"
            element={
              <PermissionRoute permission="trust.iam.read">
                <UserDetailPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/trust/iam/roles"
            element={
              <PermissionRoute permission="trust.iam.read">
                <RolesPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/trust/iam/roles/:id"
            element={
              <PermissionRoute permission="trust.iam.read">
                <RoleDetailPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/trust/iam/permissions"
            element={
              <PermissionRoute permission="trust.iam.read">
                <PermissionsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/trust/iam/groups"
            element={
              <PermissionRoute permission="trust.iam.read">
                <GroupsPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/trust/audit"
            element={
              <PermissionRoute permission="trust.audit.read">
                <AuditLogPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/trust/audit/timeline"
            element={
              <PermissionRoute permission="trust.audit.read">
                <AuditTimelinePage />
              </PermissionRoute>
            }
          />
          <Route
            path="/trust/audit/export"
            element={
              <PermissionRoute permission="trust.audit.export">
                <AuditExportPage />
              </PermissionRoute>
            }
          />
          <Route
            path="/trust/audit/integrity"
            element={
              <PermissionRoute permission="trust.audit.read">
                <AuditIntegrityPage />
              </PermissionRoute>
            }
          />
          <Route path="/trust/jit" element={<Navigate to="/trust/jit/pending" replace />} />
          <Route path="/trust/jit/request" element={<OpsRoute permission="trust.jit.request" title="Request JIT Access" description="Temporary permission elevation requests with reason and expiry." endpoint="/jit/sessions/active" primaryAction="Request access" />} />
          <Route path="/trust/jit/pending" element={<OpsRoute permission="trust.jit.approve" title="Pending JIT Requests" description="Cross-approval queue for elevated access requests." endpoint="/jit/requests/pending" />} />
          <Route path="/trust/jit/active" element={<OpsRoute permission="trust.jit.approve" title="Active JIT Sessions" description="Currently elevated staff permissions and expiry times." endpoint="/jit/sessions/active" />} />
          <Route path="/trust/jit/audit" element={<OpsRoute permission="trust.audit.read" title="JIT Audit" description="Historical elevated access audit entries." endpoint="/audit/entries?action=jit" />} />
          <Route path="/trust/compliance" element={<Navigate to="/trust/compliance/dsar" replace />} />
          <Route path="/trust/compliance/dsar" element={<OpsRoute permission="trust.compliance.dsar.read" title="DSAR Queue" description="GDPR data subject request workflow and SLA countdown." endpoint="/compliance/dsar" />} />
          <Route path="/trust/compliance/dsar/:id" element={<OpsRoute permission="trust.compliance.dsar.read" title="DSAR Detail" description="DSAR transition history and export delivery status." endpoint="/compliance/dsar" />} />
          <Route path="/trust/compliance/legal-hold" element={<OpsRoute permission="trust.compliance.legal-hold.read" title="Legal Holds" description="Active holds that block tenant data deletion and erasure completion." endpoint="/compliance/legal-hold" />} />
          <Route path="/trust/compliance/legal-hold/:id" element={<OpsRoute permission="trust.compliance.legal-hold.read" title="Legal Hold Detail" description="Hold scope and affected data." endpoint="/compliance/legal-hold" />} />
          <Route path="/trust/compliance/exports" element={<OpsRoute permission="trust.compliance.dsar.read" title="Compliance Exports" description="Bulk export jobs and signed delivery links." endpoint="/audit/entries?action=compliance" />} />
          <Route path="/trust/compliance/dpa" element={<OpsRoute permission="trust.compliance.dsar.read" title="DPA Tracking" description="Data processing agreement tracking surface." endpoint="/compliance/dsar" />} />
          <Route path="/trust/compliance/subpoenas" element={<OpsRoute permission="trust.compliance.dsar.read" title="Subpoenas" description="Subpoena response queue and audit trail." endpoint="/compliance/dsar" />} />
          <Route path="/trust/safety" element={<Navigate to="/trust/safety/fraud" replace />} />
          <Route path="/trust/safety/fraud" element={<OpsRoute permission="trust.safety.read" title="Fraud Queue" description="Manual, Stripe Radar and velocity fraud signals." endpoint="/safety/fraud" />} />
          <Route path="/trust/safety/aup" element={<OpsRoute permission="trust.safety.read" title="AUP Violations" description="Acceptable use policy review queue." endpoint="/safety/aup" />} />
          <Route path="/trust/safety/suspensions" element={<OpsRoute permission="trust.safety.read" title="Suspensions" description="Suspended tenants and enforcement state." endpoint="/safety/suspensions" />} />
          <Route path="/trust/safety/appeals" element={<OpsRoute permission="trust.safety.read" title="Appeals" description="Tenant suspension appeals and resolution status." endpoint="/safety/appeals" />} />
          <Route path="/trust/safety/rules" element={<OpsRoute permission="trust.safety.read" title="Safety Rules" description="Phase 4 placeholder for automated trust and safety rules." endpoint="/safety/rules" />} />
          <Route path="/trust/secrets" element={<OpsRoute permission="trust.secrets.read" title="Secret Management" description="Doppler metadata inventory, expiry tracking and access audit." endpoint="/secrets" related={[{ label: "Expiring", to: "/trust/secrets/expiring" }, { label: "Audit", to: "/trust/secrets/audit" }]} />} />
          <Route path="/trust/secrets/expiring" element={<OpsRoute permission="trust.secrets.read" title="Expiring Secrets" description="Credentials expiring within 30 days." endpoint="/secrets/expiring" />} />
          <Route path="/trust/secrets/audit" element={<OpsRoute permission="trust.secrets.read" title="Secret Access Audit" description="Metadata-only secret access audit log." endpoint="/secrets/audit" />} />
          <Route path="/trust/security" element={<Navigate to="/trust/security/anomalies" replace />} />
          <Route path="/trust/security/anomalies" element={<OpsRoute permission="trust.security.read" title="Security Anomalies" description="Anomaly detection queue built on platform audit and login telemetry." endpoint="/security/anomalies" />} />
          <Route path="/trust/security/logins" element={<OpsRoute permission="trust.security.read" title="Login Monitoring" description="Staff login successes, failures and lockout signals." endpoint="/security/logins" />} />
          <Route path="/trust/security/ip-blocks" element={<OpsRoute permission="trust.security.read" title="IP Blocks" description="Blocked IP addresses from security monitoring." endpoint="/security/ip-blocks" />} />
          <Route path="/trust/security/sessions" element={<OpsRoute permission="trust.security.read" title="Staff Sessions" description="Active staff sessions with revocation support." endpoint="/security/sessions" />} />
          <Route path="/trust/kyc" element={<Navigate to="/trust/kyc/pending" replace />} />
          <Route path="/trust/kyc/pending" element={<OpsRoute permission="trust.kyc.read" title="KYC Queue" description="Persona verification reviews and decision workflow." endpoint="/kyc/pending" />} />
          <Route path="/trust/kyc/:id" element={<OpsRoute permission="trust.kyc.read" title="KYC Detail" description="Verification detail and review decision context." endpoint="/kyc/pending" />} />
          <Route path="/trust/kyc/sanctions" element={<OpsRoute permission="trust.kyc.read" title="Sanctions Screening" description="ComplyAdvantage screening results and review queue." endpoint="/kyc/sanctions" />} />
          <Route path="/trust/kyc/pep" element={<OpsRoute permission="trust.kyc.read" title="PEP Screening" description="Politically exposed person matches requiring senior approval." endpoint="/kyc/pep" />} />
          <Route path="/gtm" element={<GtmOverview />} />
          <Route path="/gtm/pipeline" element={<OpsRoute permission="gtm.pipeline.read" title="Sales Pipeline" description="HubSpot deal sync with Fauward tenant linking." endpoint="/pipeline" related={[{ label: "Forecasting", to: "/gtm/pipeline/forecasting" }]} />} />
          <Route path="/gtm/pipeline/forecasting" element={<OpsRoute permission="gtm.pipeline.read" title="Forecasting" description="Quarterly forecast from synced HubSpot deal amount and probability." endpoint="/pipeline/forecasting" />} />
          <Route path="/gtm/pipeline/:dealId" element={<OpsRoute permission="gtm.pipeline.read" title="Deal Detail" description="Deal detail and linked tenant context." endpoint="/pipeline/:dealId" />} />
          <Route path="/gtm/trials" element={<OpsRoute permission="gtm.trials.read" title="Trial Management" description="Trial activation scoring and intervention queues." endpoint="/trials" related={[{ label: "Expiring", to: "/gtm/trials/expiring" }, { label: "Extensions", to: "/gtm/trials/extensions" }]} />} />
          <Route path="/gtm/trials/expiring" element={<OpsRoute permission="gtm.trials.read" title="Expiring Trials" description="Trials expiring in the next seven days." endpoint="/trials/expiring" />} />
          <Route path="/gtm/trials/extensions" element={<OpsRoute permission="gtm.trials.read" title="Trial Extensions" description="Extension requests and approval thresholds." endpoint="/trials/extensions" />} />
          <Route path="/gtm/trials/:tenantId" element={<OpsRoute permission="gtm.trials.read" title="Trial Detail" description="Activation score and tenant-level intervention context." endpoint="/trials/:tenantId" />} />
          <Route path="/gtm/demos" element={<OpsRoute permission="gtm.demos.read" title="Demo Environments" description="Demo tenant inventory and expiry lifecycle." endpoint="/demos" related={[{ label: "Templates", to: "/gtm/demos/templates" }]} />} />
          <Route path="/gtm/demos/create" element={<OpsRoute permission="gtm.demos.write" title="Create Demo" description="Provision templated demo tenants for sales." endpoint="/demos/templates" primaryAction="Create demo" />} />
          <Route path="/gtm/demos/templates" element={<OpsRoute permission="gtm.demos.read" title="Demo Templates" description="Template catalogue for demo tenant seeding." endpoint="/demos/templates" />} />
          <Route path="/gtm/demos/:id" element={<OpsRoute permission="gtm.demos.read" title="Demo Detail" description="Demo refresh, sharing and destruction state." endpoint="/demos" />} />
          <Route path="/gtm/handoff/won" element={<OpsRoute permission="gtm.handoff.read" title="Won Deals" description="Deals awaiting structured sales-to-CS handoff." endpoint="/handoff/won" />} />
          <Route path="/gtm/handoff" element={<Navigate to="/gtm/handoff/won" replace />} />
          <Route path="/gtm/handoff/onboarding-queue" element={<OpsRoute permission="gtm.handoff.read" title="Onboarding Queue" description="Handed-off accounts waiting for CSM acceptance." endpoint="/handoff/onboarding-queue" />} />
          <Route path="/gtm/handoff/templates" element={<OpsRoute permission="gtm.handoff.read" title="Handoff Templates" description="Structured handoff document templates." endpoint="/handoff/templates" />} />
          <Route path="/gtm/attribution" element={<OpsRoute permission="gtm.attribution.read" title="Marketing Attribution" description="PostHog-based multi-touch source and campaign attribution." endpoint="/attribution" related={[{ label: "Campaigns", to: "/gtm/attribution/campaigns" }, { label: "Funnel", to: "/gtm/attribution/funnel" }, { label: "Landing Pages", to: "/gtm/attribution/landing-pages" }]} />} />
          <Route path="/gtm/attribution/campaigns" element={<OpsRoute permission="gtm.attribution.read" title="Campaign Performance" description="Campaign-level source and revenue attribution." endpoint="/attribution/campaigns" />} />
          <Route path="/gtm/attribution/funnel" element={<OpsRoute permission="gtm.attribution.read" title="Attribution Funnel" description="Visit to signup to activation to paid conversion." endpoint="/attribution/funnel" />} />
          <Route path="/gtm/attribution/landing-pages" element={<OpsRoute permission="gtm.attribution.read" title="Landing Pages" description="Landing page attribution and conversion performance." endpoint="/attribution/landing-pages" />} />
          <Route path="/gtm/pricing/experiments" element={<OpsRoute permission="gtm.pricing.read" title="Pricing Experiments" description="Statsig/LaunchDarkly pricing tests with revenue impact." endpoint="/pricing/experiments" related={[{ label: "Plans", to: "/gtm/pricing/plans" }]} />} />
          <Route path="/gtm/pricing" element={<Navigate to="/gtm/pricing/experiments" replace />} />
          <Route path="/gtm/pricing/experiments/:id" element={<OpsRoute permission="gtm.pricing.read" title="Pricing Experiment Detail" description="Variant conversion, ARPU and revenue lift detail." endpoint="/pricing/experiments" />} />
          <Route path="/gtm/pricing/plans" element={<OpsRoute permission="gtm.pricing.read" title="Plan Editor" description="Plan, price, feature and limit catalogue." endpoint="/pricing/plans" />} />
          <Route path="/gtm/contracts/quotes" element={<OpsRoute permission="gtm.contracts.read" title="Quote Builder" description="CPQ quotes, discount approvals and DocuSign handoff." endpoint="/contracts/quotes" related={[{ label: "Discounts", to: "/gtm/contracts/discounts" }, { label: "MSAs", to: "/gtm/contracts/msas" }]} />} />
          <Route path="/gtm/contracts" element={<Navigate to="/gtm/contracts/quotes" replace />} />
          <Route path="/gtm/contracts/quotes/:id" element={<OpsRoute permission="gtm.contracts.read" title="Quote Detail" description="Quote approval and signature state." endpoint="/contracts/quotes/:id" />} />
          <Route path="/gtm/contracts/discounts" element={<OpsRoute permission="gtm.contracts.read" title="Discount Approvals" description="Quotes waiting for manager or CFO discount approval." endpoint="/contracts/discounts" />} />
          <Route path="/gtm/contracts/msas" element={<OpsRoute permission="gtm.contracts.read" title="MSA Repository" description="Signed master service agreements and renewal metadata." endpoint="/contracts/msas" />} />
          <Route path="/gtm/partners" element={<OpsRoute permission="gtm.partners.read" title="Partner Directory" description="Referral, reseller and technology partner management." endpoint="/partners" related={[{ label: "Applications", to: "/gtm/partners/applications" }, { label: "Deal Registration", to: "/gtm/partners/deal-registration" }]} />} />
          <Route path="/gtm/partners/applications" element={<OpsRoute permission="gtm.partners.read" title="Partner Applications" description="Partner application review and onboarding queue." endpoint="/partners/applications" />} />
          <Route path="/gtm/partners/deal-registration" element={<OpsRoute permission="gtm.partners.read" title="Deal Registration" description="Partner registered deals and 90-day lead locks." endpoint="/partners/deal-registration" />} />
          <Route path="/gtm/partners/:id" element={<OpsRoute permission="gtm.partners.read" title="Partner Detail" description="Partner deals, applications and commission context." endpoint="/partners" />} />
        </Route>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<Navigate to="/" replace />} />
          <Route path="/admin/tenants" element={<Navigate to="/platform/tenants" replace />} />
          <Route path="/admin/tenants/:id" element={<NavigateToPlatformTenant />} />
          <Route path="/admin/regions" element={<RegionsPage />} />
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
