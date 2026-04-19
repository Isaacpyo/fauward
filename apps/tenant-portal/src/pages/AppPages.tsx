import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CreditCard, Package, Truck, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { BillingTab } from "@/pages/settings/BillingTab";
import { ApiKeysTab } from "@/pages/settings/ApiKeysTab";
import { WebhooksTab } from "@/pages/settings/WebhooksTab";
import { EmailSettingsTab } from "@/pages/settings/EmailSettingsTab";
import { ProfileTab } from "@/pages/settings/ProfileTab";
import { DomainSettingsTab } from "@/pages/settings/DomainSettingsTab";
import { BrandingTab } from "@/pages/settings/BrandingTab";
import { IntegrationsTab } from "@/pages/settings/IntegrationsTab";
import { TenantDashboardPage } from "@/pages/dashboard/TenantDashboardPage";
import { TenantFinancePage } from "@/pages/finance/TenantFinancePage";
import { EmptyState } from "@/components/shared/EmptyState";
import { PlanGate } from "@/components/shared/PlanGate";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { TrackingNumber } from "@/components/shared/TrackingNumber";
import { UsageMeter } from "@/components/shared/UsageMeter";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { Tabs, TabsContent } from "@/components/ui/Tabs";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { PageShell } from "@/layouts/PageShell";
import { ListPageTemplate, type ListRow } from "@/pages/ListPageTemplate";
import { useAppStore } from "@/stores/useAppStore";
import { useTenantStore } from "@/stores/useTenantStore";
import { createDevTestSession, matchesDevTestLogin, setTokens } from "@/lib/auth";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { api } from "@/lib/api";

const shipmentsRows: ListRow[] = Array.from({ length: 28 }).map((_, index) => ({
  id: `TRK-${1000 + index}`,
  href: `/shipments/TRK-${1000 + index}`,
  values: [
    `TRK-${1000 + index}`,
    index % 2 === 0 ? "Acme Retail" : "Northline Logistics",
    index % 4 === 0 ? "IN_TRANSIT" : index % 5 === 0 ? "DELIVERED" : "PROCESSING",
    "UK - London"
  ]
}));

const financeRows: ListRow[] = Array.from({ length: 20 }).map((_, index) => ({
  id: `INV-${2000 + index}`,
  href: `/finance/INV-${2000 + index}`,
  values: [
    `INV-${2000 + index}`,
    index % 2 === 0 ? "Acme Retail" : "PortBridge",
    index % 3 === 0 ? "PAID" : index % 4 === 0 ? "OVERDUE" : "SENT",
    `£${(Math.random() * 3000 + 200).toFixed(2)}`
  ]
}));

const crmRows: ListRow[] = Array.from({ length: 16 }).map((_, index) => ({
  id: `CRM-${400 + index}`,
  href: `/crm/CRM-${400 + index}`,
  values: [`Contact ${index + 1}`, index % 2 === 0 ? "Acme Retail" : "Relay Fleet", "Open", "Lagos"]
}));

const teamRows: ListRow[] = Array.from({ length: 10 }).map((_, index) => ({
  id: `TEAM-${50 + index}`,
  href: `/team`,
  values: [`Member ${index + 1}`, index % 3 === 0 ? "TENANT_MANAGER" : "TENANT_STAFF", "Active", "Last seen 2h ago"]
}));

const TEST_LOGIN = {
  email: "admin@fauward.com",
  password: "12345678A"
};

export function DashboardPage() {
  return <TenantDashboardPage />;
  /*
  const tenant = useTenantStore((state) => state.tenant);
  const user = useAppStore((state) => state.user);
  const dashboardChecklistDismissed = useAppStore((state) => state.dashboardChecklistDismissed);
  const setDashboardChecklistDismissed = useAppStore((state) => state.setDashboardChecklistDismissed);

  return (
    <PageShell
      title="Dashboard"
      description={`Welcome back${user ? `, ${user.full_name}` : ""}. Live view of shipment, finance, and team health.`}
      actions={
        <Button asChild>
          <Link to="/shipments/create">Create shipment</Link>
        </Button>
      }
    >
      <div className="grid gap-4 xl:grid-cols-4">
        <StatCard label="Today shipments" value="124" trend="↑ 12% vs yesterday" trendUp />
        <StatCard label="In transit" value="53" trend="4 delayed" trendUp={false} />
        <StatCard label="Overdue invoices" value="7" trend="2 added today" trendUp={false} />
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Plan usage</p>
          <div className="mt-3">
            <UsageMeter used={820} total={1000} />
          </div>
          <p className="mt-1.5 text-xs text-gray-400">820 / 1,000 shipments</p>
        </div>
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr,1fr]">
        {!dashboardChecklistDismissed ? (
          <DashboardChecklist
            state={{
              brandConfigured: Boolean(tenant?.name),
              firstShipmentCreated: false,
              teamInvited: false,
              paymentsConnected: false,
              domainConfigured: false
            }}
            onDismiss={() => setDashboardChecklistDismissed(true)}
          />
        ) : (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-600">Checklist dismissed.</p>
            <Button variant="secondary" size="sm" className="mt-2" onClick={() => setDashboardChecklistDismissed(false)}>
              Re-show checklist
            </Button>
          </div>
        )}
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-base font-semibold text-gray-900">Tenant details</h3>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-gray-500">Tenant</dt>
              <dd className="font-medium text-gray-900">{tenant?.name ?? "N/A"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Timezone</dt>
              <dd className="font-medium text-gray-900">{tenant?.timezone ?? "UTC"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Currency</dt>
              <dd className="font-medium text-gray-900">{tenant?.currency ?? "GBP"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Locale</dt>
              <dd className="font-medium text-gray-900">{tenant?.locale ?? "en-GB"}</dd>
            </div>
          </dl>
        </div>
      </div>
    </PageShell>
  );
  */
}

export function ShipmentsPage() {
  return (
    <ListPageTemplate
      title="Shipments"
      description="Manage shipment lifecycle from PENDING through DELIVERED."
      createLabel="Create shipment"
      createTo="/shipments/create"
      columns={["Tracking", "Customer", "Status", "Route"]}
      rows={shipmentsRows}
      emptyTitle="No shipments found"
      emptyDescription="Create your first shipment to start tracking."
    />
  );
}

export function ShipmentDetailPage() {
  const { id = "TRK-0000" } = useParams();
  const tenant = useTenantStore((state) => state.tenant);

  return (
    <PageShell title={`Shipment ${id}`} description="Shipment detail and timeline">
      <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <TrackingNumber value={id} />
            <StatusBadge status="IN_TRANSIT" />
          </div>
          <Table columns={["Step", "Timestamp", "Actor", "Notes"]} className="mt-4">
            {[
              ["PROCESSING", new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(), "Dispatcher", "Validated manifest"],
              ["PICKED_UP", new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), "Driver", "Collected from hub"],
              ["IN_TRANSIT", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), "Driver", "En route to destination"]
            ].map((row) => (
              <TableRow key={row[0]}>
                <TableCell>{row[0]}</TableCell>
                <TableCell>{formatDateTime(row[1], tenant)}</TableCell>
                <TableCell>{row[2]}</TableCell>
                <TableCell>{row[3]}</TableCell>
              </TableRow>
            ))}
          </Table>
        </div>
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900">Consignee</h3>
            <p className="mt-2 text-sm text-gray-600">Acme Retail, London</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900">SLA progress</h3>
            <div className="mt-2">
              <UsageMeter used={72} total={100} />
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

export function CreateShipmentPage() {
  return (
    <PageShell title="Create shipment wizard" description="Multi-step setup for shipment details, routing, and notifications.">
      <div className="grid gap-4 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-2">
        <Input placeholder="Customer name" />
        <Input placeholder="Tracking reference" />
        <Input placeholder="Pickup address" />
        <Input placeholder="Delivery address" />
        <Input type="date" />
        <Input placeholder="Delivery contact phone" />
        <div className="md:col-span-2">
          <Button>Create shipment</Button>
        </div>
      </div>
    </PageShell>
  );
}

export function RoutesPage() {
  return (
    <PageShell title="Routes / Dispatch Board" description="View active routes, vehicle assignments, and dispatch priorities.">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900">Assigned routes</h3>
          <p className="mt-2 text-3xl font-semibold text-gray-900">18</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900">Drivers on duty</h3>
          <p className="mt-2 text-3xl font-semibold text-gray-900">31</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900">Pending assignments</h3>
          <p className="mt-2 text-3xl font-semibold text-gray-900">4</p>
        </div>
      </div>
    </PageShell>
  );
}

export function CrmPage() {
  return (
    <ListPageTemplate
      title="CRM"
      description="Contacts and organizations in your logistics pipeline."
      createLabel="Create contact"
      createTo="/crm/new"
      columns={["Name", "Organization", "Stage", "Region"]}
      rows={crmRows}
      emptyTitle="No CRM records"
      emptyDescription="Add your first contact to begin relationship tracking."
    />
  );
}

export function CrmDetailPage() {
  const { id = "CRM-0" } = useParams();
  return (
    <PageShell title={`Contact ${id}`} description="Contact timeline, notes, and account summary.">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="text-sm text-gray-600">No activity yet for this contact.</p>
      </div>
    </PageShell>
  );
}

export function FinancePage() {
  return <TenantFinancePage />;
}

export function FinanceDetailPage() {
  const { id = "INV-0000" } = useParams();
  const tenant = useTenantStore((state) => state.tenant);

  return (
    <PageShell title={`Invoice ${id}`} description="Invoice details, payment history, and customer notes.">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <StatusBadge status="SENT" />
          <p className="text-lg font-semibold text-gray-900">{formatCurrency(2450.5, tenant)}</p>
        </div>
        <p className="mt-3 text-sm text-gray-600">Issued {formatDateTime(new Date(), tenant)}</p>
      </div>
    </PageShell>
  );
}

export function AnalyticsPage() {
  const user = useAppStore((state) => state.user);
  const tenant = useTenantStore((state) => state.tenant);
  const query = useQuery({
    queryKey: ["analytics-full"],
    queryFn: async () => (await api.get("/v1/analytics/full")).data,
    refetchInterval: 60_000,
    retry: 1
  });

  const totals = query.data?.totals ?? {
    shipments: { value: 124, changePct: 12.6 },
    revenue: { value: 58320, changePct: 9.2 },
    onTimeRate: { value: 96.4, changePct: 2.4 },
    avgDeliveryDays: { value: 1.8, changePct: -4.5 }
  };

  return (
    <PageShell title="Analytics" description="Tenant performance metrics across shipment and finance workflows.">
      <PlanGate minimumPlan="pro" currentPlan={user?.plan}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="text-sm text-gray-500">Shipments</h3>
            <p className="mt-2 text-3xl font-semibold text-gray-900">
              <AnimatedNumber value={Number(totals.shipments.value ?? 0)} />
            </p>
            <p className="mt-1 text-xs text-gray-500">{Number(totals.shipments.changePct ?? 0).toFixed(1)}% vs previous period</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="text-sm text-gray-500">Revenue</h3>
            <p className="mt-2 text-3xl font-semibold text-gray-900">
              <AnimatedNumber
                value={Number(totals.revenue.value ?? 0)}
                formatter={(value) => formatCurrency(value, tenant)}
              />
            </p>
            <p className="mt-1 text-xs text-gray-500">{Number(totals.revenue.changePct ?? 0).toFixed(1)}% vs previous period</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="text-sm text-gray-500">On-time rate</h3>
            <p className="mt-2 text-3xl font-semibold text-gray-900">
              <AnimatedNumber value={Number(totals.onTimeRate.value ?? 0)} formatter={(value) => `${value.toFixed(1)}%`} />
            </p>
            <p className="mt-1 text-xs text-gray-500">{Number(totals.onTimeRate.changePct ?? 0).toFixed(1)}% vs previous period</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="text-sm text-gray-500">Avg delivery days</h3>
            <p className="mt-2 text-3xl font-semibold text-gray-900">
              <AnimatedNumber value={Number(totals.avgDeliveryDays.value ?? 0)} formatter={(value) => `${value.toFixed(1)}d`} />
            </p>
            <p className="mt-1 text-xs text-gray-500">{Number(totals.avgDeliveryDays.changePct ?? 0).toFixed(1)}% vs previous period</p>
          </div>
        </div>
      </PlanGate>
    </PageShell>
  );
}

export function TeamPage() {
  return (
    <ListPageTemplate
      title="Team"
      description="Manage tenant members, roles, and activity."
      createLabel="Invite member"
      createTo="/team/invite"
      columns={["Name", "Role", "Status", "Activity"]}
      rows={teamRows}
      emptyTitle="No team members"
      emptyDescription="Invite members to collaborate in this tenant."
    />
  );
}

export function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get("tab") ?? "profile";
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set([currentTab]));

  useEffect(() => {
    setVisitedTabs((previous) => (previous.has(currentTab) ? previous : new Set([...previous, currentTab])));
  }, [currentTab]);

  return (
    <PageShell title="Settings" description="Tenant profile, integrations, billing, API keys, webhooks, email, and branding.">
      <Tabs
        value={currentTab}
        onValueChange={(tab) => {
          setSearchParams({ tab });
          setVisitedTabs((previous) => new Set([...previous, tab]));
        }}
        items={[
          { value: "profile", label: "Profile" },
          { value: "general", label: "General" },
          { value: "domain", label: "Domain" },
          { value: "integrations", label: "Integrations" },
          { value: "billing", label: "Billing" },
          { value: "api-keys", label: "API keys" },
          { value: "webhooks", label: "Webhooks" },
          { value: "email", label: "Email" },
          { value: "branding", label: "Branding" }
        ]}
      >
        {visitedTabs.has("profile") ? (
          <TabsContent value="profile" className="rounded-lg border border-gray-200 bg-white p-4">
            <ProfileTab />
          </TabsContent>
        ) : null}
        {visitedTabs.has("general") ? (
          <TabsContent value="general" className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-600">Tenant profile, locale, timezone, and regional settings.</p>
          </TabsContent>
        ) : null}
        {visitedTabs.has("domain") ? (
          <TabsContent value="domain" className="rounded-lg border border-gray-200 bg-white p-4">
            <DomainSettingsTab />
          </TabsContent>
        ) : null}
        {visitedTabs.has("integrations") ? (
          <TabsContent value="integrations" className="rounded-lg border border-gray-200 bg-white p-4">
            <IntegrationsTab />
          </TabsContent>
        ) : null}
        {visitedTabs.has("billing") ? (
          <TabsContent value="billing">
            <BillingTab />
          </TabsContent>
        ) : null}
        {visitedTabs.has("api-keys") ? (
          <TabsContent value="api-keys" className="rounded-lg border border-gray-200 bg-white p-4">
            <ApiKeysTab />
          </TabsContent>
        ) : null}
        {visitedTabs.has("webhooks") ? (
          <TabsContent value="webhooks" className="rounded-lg border border-gray-200 bg-white p-4">
            <WebhooksTab />
          </TabsContent>
        ) : null}
        {visitedTabs.has("email") ? (
          <TabsContent value="email" className="rounded-lg border border-gray-200 bg-white p-4">
            <EmailSettingsTab />
          </TabsContent>
        ) : null}
        {visitedTabs.has("branding") ? (
          <TabsContent value="branding" className="rounded-lg border border-gray-200 bg-white p-4">
            <BrandingTab />
          </TabsContent>
        ) : null}
      </Tabs>
    </PageShell>
  );
}

export function PublicTrackLookupPage() {
  const [number, setNumber] = useState("");

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6">
      <h1 className="text-2xl font-semibold text-gray-900">Track shipment</h1>
      <p className="mt-2 text-sm text-gray-600">Enter a tracking number to view latest shipment updates.</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Input value={number} onChange={(event) => setNumber(event.target.value)} placeholder="TRK-1001" />
        <Button asChild>
          <Link to={`/track/${number || "TRK-1001"}`}>Track</Link>
        </Button>
      </div>
    </section>
  );
}

export function PublicTrackResultPage() {
  const { number = "TRK-1001" } = useParams();
  return (
    <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
      <h1 className="text-2xl font-semibold text-gray-900">Tracking result</h1>
      <TrackingNumber value={number} />
      <StatusBadge status="OUT_FOR_DELIVERY" />
      <p className="text-sm text-gray-600">Shipment is out for delivery and will arrive by end of day.</p>
    </section>
  );
}

export function PublicBookingPage() {
  return (
    <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
      <h1 className="text-2xl font-semibold text-gray-900">Book shipment</h1>
      <div className="grid gap-3 md:grid-cols-2">
        <Input placeholder="Name" />
        <Input placeholder="Email" />
        <Input placeholder="Pickup address" />
        <Input placeholder="Dropoff address" />
      </div>
      <Button>Submit booking request</Button>
    </section>
  );
}

export function LoginPage() {
  const navigate = useNavigate ? useNavigate() : null;
  const location = useLocation ? useLocation() : null;
  const isDevTestLogin = import.meta.env.DEV;
  const setUser = useAppStore((state) => state.setUser);
  const setNotifications = useAppStore((state) => state.setNotifications);
  const setTenant = useTenantStore((state) => state.setTenant);
  const setAppTenant = useAppStore((state) => state.setTenant);
  const [email, setEmail] = useState(() => (isDevTestLogin ? TEST_LOGIN.email : ""));
  const [password, setPassword] = useState(() => (isDevTestLogin ? TEST_LOGIN.password : ""));
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (matchesDevTestLogin(email, password)) {
        const session = createDevTestSession();
        setUser(session.user);
        setNotifications([]);
        setTenant(session.tenant);
        setAppTenant(session.tenant);
        const from = (location?.state as { from?: { pathname: string } })?.from?.pathname ?? "/";
        navigate?.(from, { replace: true });
        return;
      }

      const { data } = await api.post("/v1/auth/login", { email, password });
      setTokens(data.accessToken, data.refreshToken, data.tenantSlug);
      const from = (location?.state as { from?: { pathname: string } })?.from?.pathname ?? "/";
      navigate?.(from, { replace: true });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(axiosErr.response?.data?.error ?? "Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 py-12">
      <div className="w-full max-w-md px-4">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
          <h1 className="text-2xl font-bold text-gray-900">Sign in to your portal</h1>
          <p className="mt-1.5 text-sm text-gray-500">Enter your email and password to continue.</p>
          <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="login-email">Email</label>
              <Input id="login-email" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="login-password">Password</label>
              <div className="relative">
                <Input id="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password" placeholder="••••••••" className="pr-11" value={password} onChange={(e) => setPassword(e.target.value)} required />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 min-h-0 text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" /></svg>
                  )}
                </button>
              </div>
            </div>
            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            ) : null}
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
          <p className="mt-4 text-xs text-gray-400 text-center">
            <Link to="/forgot-password" className="underline hover:text-gray-600">Forgot your password?</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 py-12">
      <div className="w-full max-w-md px-4">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
          <h1 className="text-2xl font-bold text-gray-900">Create your account</h1>
          <p className="mt-1.5 text-sm text-gray-500">Get started with your tenant workspace.</p>
          <div className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="reg-name">Full name</label>
              <Input id="reg-name" type="text" autoComplete="name" placeholder="Jane Smith" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="reg-email">Work email</label>
              <Input id="reg-email" type="email" autoComplete="email" placeholder="jane@company.com" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="reg-company">Company</label>
              <Input id="reg-company" type="text" autoComplete="organization" placeholder="Acme Logistics" />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="reg-password">Password</label>
              <div className="relative">
                <Input id="reg-password" type={showPassword ? "text" : "password"} autoComplete="new-password" placeholder="Min 8 characters" className="pr-11" />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 min-h-0 text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" /></svg>
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z" /></svg>
                  )}
                </button>
              </div>
            </div>
            <Button className="w-full" size="lg">Create account</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function OnboardingPage() {
  return (
    <PageShell title="Onboarding wizard" description="Complete setup and launch your tenant operations.">
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { icon: Users, title: "Invite team", body: "Add managers, finance users, and staff." },
          { icon: Package, title: "Configure shipments", body: "Define states, labels, and notifications." },
          { icon: CreditCard, title: "Setup billing", body: "Choose plan and add payment details." },
          { icon: Truck, title: "Add drivers", body: "Create driver profiles and route assignments." }
        ].map((item) => (
          <article key={item.title} className="rounded-lg border border-gray-200 bg-white p-4">
            <item.icon size={18} className="text-[var(--tenant-primary)]" />
            <h3 className="mt-3 text-base font-semibold text-gray-900">{item.title}</h3>
            <p className="mt-1 text-sm text-gray-600">{item.body}</p>
            <Badge variant="neutral" className="mt-3">
              Pending
            </Badge>
          </article>
        ))}
      </div>
    </PageShell>
  );
}

export function PlaceholderCustomerPage({ title, description }: { title: string; description: string }) {
  return (
    <PageShell title={title} description={description}>
      <EmptyState icon={Package} title={`No ${title.toLowerCase()} yet`} description="Data will appear once records are available." />
    </PageShell>
  );
}

export function NotFoundPage() {
  const options = useMemo(
    () => [
      { to: "/", label: "Dashboard" },
      { to: "/shipments", label: "Shipments" },
      { to: "/settings", label: "Settings" }
    ],
    []
  );

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6">
      <h1 className="text-2xl font-semibold text-gray-900">Page not found</h1>
      <p className="mt-2 text-sm text-gray-600">The page may have moved or no longer exists.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {options.map((option) => (
          <Button key={option.to} variant="secondary" asChild>
            <Link to={option.to}>{option.label}</Link>
          </Button>
        ))}
      </div>
    </section>
  );
}
