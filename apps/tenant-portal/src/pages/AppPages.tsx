import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CreditCard, Package, Truck, Users } from "lucide-react";

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
import { StatusBadge } from "@/components/shared/StatusBadge";
import { TrackingNumber } from "@/components/shared/TrackingNumber";
import { UsageMeter } from "@/components/shared/UsageMeter";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { Textarea } from "@/components/ui/Textarea";
import { Tabs, TabsContent } from "@/components/ui/Tabs";
import { PageShell } from "@/layouts/PageShell";
import { ListPageTemplate, type ListRow } from "@/pages/ListPageTemplate";
import { useAppStore } from "@/stores/useAppStore";
import { useTenantStore } from "@/stores/useTenantStore";
import { createDevTestSession, isDevTestEmail, matchesDevTestLogin, setTokens } from "@/lib/auth";
import { getFirebaseAuthErrorMessage, signInWithGoogle } from "@/lib/firebase";
import { formatPlanLabel, hasPlanAccess, type Plan } from "@/lib/plan-features";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { api } from "@/lib/api";
import { loadRouteOptions, saveRouteOptions, type TenantRouteOption } from "@/lib/route-options";

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
  email: "fauward@gmail.com",
  password: "Oluwaseun44!"
};

const SUCCESSFUL_LOGIN_DELAY_MS = 1200;

const settingsTabs = [
  { value: "profile", label: "Profile", minimumPlan: "starter" },
  { value: "general", label: "General", minimumPlan: "starter" },
  { value: "domain", label: "Domain", minimumPlan: "pro" },
  { value: "integrations", label: "Integrations", minimumPlan: "starter" },
  { value: "billing", label: "Billing", minimumPlan: "starter" },
  { value: "api-keys", label: "API keys", minimumPlan: "pro" },
  { value: "webhooks", label: "Webhooks", minimumPlan: "pro" },
  { value: "email", label: "Email", minimumPlan: "enterprise" },
  { value: "branding", label: "Branding", minimumPlan: "starter" }
] as const satisfies Array<{ value: string; label: string; minimumPlan: Plan }>;

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getLoginErrorMessage(message: string) {
  if (message === "Tenant context required") {
    return "We could not find a tenant workspace for this email.";
  }
  if (message === "Internal Server Error") {
    return "Invalid email or password.";
  }
  return message;
}

function LockedSettingsPanel({ minimumPlan, feature }: { minimumPlan: Plan; feature: string }) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-6 py-8">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
        {formatPlanLabel(minimumPlan)} settings feature
      </p>
      <h3 className="mt-2 text-lg font-semibold text-amber-950">{feature} requires an upgrade</h3>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-amber-900">
        This workspace can see the setting, but it requires the {formatPlanLabel(minimumPlan)} plan or higher to configure.
      </p>
      <Button asChild className="mt-4">
        <Link to="/settings?tab=billing">Upgrade plan</Link>
      </Button>
    </div>
  );
}

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
              ["PICKED_UP", new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), "Field Operator", "Collected from hub"],
              ["IN_TRANSIT", new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), "Field Operator", "En route to destination"]
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
  const [routeOptions, setRouteOptions] = useState<TenantRouteOption[]>(() => loadRouteOptions());
  const [routeLabel, setRouteLabel] = useState("");
  const [routeDescription, setRouteDescription] = useState("");

  const createRouteOption = () => {
    if (!routeLabel.trim()) {
      return;
    }

    const normalizedSlug = routeLabel
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const nextRoutes = [
      {
        id: `route-${normalizedSlug || crypto.randomUUID()}`,
        label: routeLabel.trim(),
        description: routeDescription.trim() || "No route description provided yet."
      },
      ...routeOptions
    ];

    setRouteOptions(nextRoutes);
    saveRouteOptions(nextRoutes);
    setRouteLabel("");
    setRouteDescription("");
  };

  const removeRouteOption = (routeId: string) => {
    const nextRoutes = routeOptions.filter((route) => route.id !== routeId);
    setRouteOptions(nextRoutes);
    saveRouteOptions(nextRoutes);
  };

  return (
    <PageShell title="Routes / Dispatch Board" description="View active routes, vehicle assignments, and dispatch priorities.">
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900">Assigned routes</h3>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{routeOptions.length}</p>
            <p className="mt-1 text-sm text-gray-500">Saved route options available for assignment and filtering.</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900">Field Operators on duty</h3>
            <p className="mt-2 text-3xl font-semibold text-gray-900">31</p>
            <p className="mt-1 text-sm text-gray-500">Current dispatch staffing snapshot.</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900">Pending assignments</h3>
            <p className="mt-2 text-3xl font-semibold text-gray-900">4</p>
            <p className="mt-1 text-sm text-gray-500">Loads still waiting for route planning.</p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.95fr,1.25fr]">
          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Create route option</p>
            <h2 className="mt-1 text-lg font-semibold text-gray-900">Add a route with description</h2>
            <p className="mt-2 text-sm text-gray-600">
              Create reusable route options here. They will appear in the shipment tab route filter for planning and review.
            </p>

            <div className="mt-4 space-y-3">
              <Input
                value={routeLabel}
                onChange={(event) => setRouteLabel(event.target.value)}
                placeholder="Route name"
              />
              <Textarea
                value={routeDescription}
                onChange={(event) => setRouteDescription(event.target.value)}
                placeholder="Describe the route coverage, operating window, or assignment purpose"
                className="min-h-[140px]"
              />
              <Button onClick={createRouteOption} disabled={!routeLabel.trim()} className="w-full">
                Create route option
              </Button>
            </div>
          </section>

          <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Route catalog</p>
            <h2 className="mt-1 text-lg font-semibold text-gray-900">Available route options</h2>
            <div className="mt-4 space-y-3">
              {routeOptions.map((route) => (
                <article key={route.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">{route.label}</h3>
                      <p className="mt-2 text-sm text-gray-600">{route.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="neutral">{route.id}</Badge>
                      <Button size="sm" variant="ghost" onClick={() => removeRouteOption(route.id)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
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
  const user = useAppStore((state) => state.user);
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get("tab") ?? "profile";
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set([currentTab]));

  useEffect(() => {
    setVisitedTabs((previous) => (previous.has(currentTab) ? previous : new Set([...previous, currentTab])));
  }, [currentTab]);

  const tabItems = settingsTabs.map((tab) => {
    const locked = !hasPlanAccess(user?.plan, tab.minimumPlan);
    return {
      value: tab.value,
      label: (
        <span className="inline-flex items-center justify-center gap-1.5">
          {tab.label}
          {locked ? <span className="text-[10px] font-bold uppercase">{formatPlanLabel(tab.minimumPlan)}</span> : null}
        </span>
      )
    };
  });

  function renderSettingsTab(tab: (typeof settingsTabs)[number], content: React.ReactNode) {
    if (!hasPlanAccess(user?.plan, tab.minimumPlan)) {
      return <LockedSettingsPanel minimumPlan={tab.minimumPlan} feature={tab.label} />;
    }
    return content;
  }

  return (
    <PageShell title="Settings" description="Tenant profile, integrations, billing, API keys, webhooks, email, and branding.">
      <Tabs
        value={currentTab}
        onValueChange={(tab) => {
          setSearchParams({ tab });
          setVisitedTabs((previous) => new Set([...previous, tab]));
        }}
        items={tabItems}
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
            {renderSettingsTab(settingsTabs[2], <DomainSettingsTab />)}
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
            {renderSettingsTab(settingsTabs[5], <ApiKeysTab />)}
          </TabsContent>
        ) : null}
        {visitedTabs.has("webhooks") ? (
          <TabsContent value="webhooks" className="rounded-lg border border-gray-200 bg-white p-4">
            {renderSettingsTab(settingsTabs[6], <WebhooksTab />)}
          </TabsContent>
        ) : null}
        {visitedTabs.has("email") ? (
          <TabsContent value="email" className="rounded-lg border border-gray-200 bg-white p-4">
            {renderSettingsTab(settingsTabs[7], <EmailSettingsTab />)}
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
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState(() => (isDevTestLogin ? TEST_LOGIN.email : ""));
  const [resetLoading, setResetLoading] = useState(false);

  async function completeDevLogin(loginEmail = email) {
    const session = createDevTestSession(loginEmail);
    setUser(session.user);
    setNotifications([]);
    setTenant(session.tenant);
    setAppTenant(session.tenant);
    const from = (location?.state as { from?: { pathname: string } })?.from?.pathname ?? "/";
    await wait(SUCCESSFUL_LOGIN_DELAY_MS);
    navigate?.(from, { replace: true });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      if (matchesDevTestLogin(email, password)) {
        setRedirecting(true);
        await completeDevLogin();
        return;
      }

      const { data } = await api.post("/v1/auth/login", { email, password });
      setTokens(data.accessToken, data.refreshToken, data.tenantSlug);
      const from = (location?.state as { from?: { pathname: string } })?.from?.pathname ?? "/";
      setRedirecting(true);
      await wait(SUCCESSFUL_LOGIN_DELAY_MS);
      navigate?.(from, { replace: true });
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      setError(getLoginErrorMessage(axiosErr.response?.data?.error ?? "Invalid email or password"));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleLogin() {
    setError(null);
    setNotice(null);
    setGoogleLoading(true);
    try {
      const result = await signInWithGoogle();
      const googleEmail = result.user.email?.trim().toLowerCase();
      if (!googleEmail || !isDevTestEmail(googleEmail)) {
        throw new Error("Invalid credentials");
      }
      setRedirecting(true);
      await completeDevLogin(googleEmail);
    } catch (err: unknown) {
      setError(getFirebaseAuthErrorMessage(err));
    } finally {
      setGoogleLoading(false);
    }
  }

  async function handleResetPassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setResetLoading(true);
    try {
      await api.post("/v1/auth/forgot-password", { email: resetEmail.trim() });
      setNotice("Password reset instructions have been sent if the account exists.");
      setResetOpen(false);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      const message = axiosErr.response?.data?.error ?? "Unable to send reset instructions right now.";
      setError(message);
    } finally {
      setResetLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 py-12">
      {loading || googleLoading || redirecting ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-amber-200 border-t-amber-600" />
            <span className="text-sm font-medium text-gray-700">Signing in...</span>
          </div>
        </div>
      ) : null}
      <div className="w-full max-w-md px-4">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm lg:p-8">
          <div className="mb-6 flex items-center gap-2.5">
            <img src="/brand/logo-mark.png" alt="Fauward logo" className="h-10 w-10 shrink-0 object-contain" />
            <div>
              <p className="text-sm font-bold text-[var(--tenant-primary)]">Fauward</p>
              <p className="text-xs text-gray-500">Tenant Portal</p>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Sign in to your portal</h1>
          <p className="mt-1.5 text-sm text-gray-500">Enter your email and password to continue.</p>
          <div className="mt-6 space-y-4">
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading || googleLoading}
              className="inline-flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="inline-flex h-5 w-5 items-center justify-center">
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
              </span>
              {googleLoading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-amber-600" aria-hidden />
                  Connecting...
                </>
              ) : (
                "Continue with Google"
              )}
            </button>

            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs text-gray-400">or</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>
          </div>

          <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
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
            {notice ? (
              <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">{notice}</p>
            ) : null}
            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? (
                <span className="inline-flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-200 border-t-white" aria-hidden />
                  Signing in...
                </span>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>
          <div className="mt-4 text-center text-xs text-gray-400">
            <button
              type="button"
              onClick={() => {
                setResetEmail(email || TEST_LOGIN.email);
                setResetOpen((value) => !value);
                setError(null);
                setNotice(null);
              }}
              className="underline hover:text-gray-600"
            >
              Forgot your password?
            </button>
          </div>
          {resetOpen ? (
            <form className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4" onSubmit={handleResetPassword}>
              <label className="mb-1.5 block text-sm font-medium text-gray-700" htmlFor="reset-email">Reset email</label>
              <Input id="reset-email" type="email" value={resetEmail} onChange={(event) => setResetEmail(event.target.value)} required />
              <Button type="submit" className="mt-3 w-full" size="lg" disabled={resetLoading}>
                {resetLoading ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-amber-200 border-t-white" aria-hidden />
                    Sending...
                  </span>
                ) : (
                  "Send reset instructions"
                )}
              </Button>
            </form>
          ) : null}
          <p className="mt-5 text-center text-xs text-gray-500">
            Need help?{" "}
            <a href="mailto:support@fauward.com" className="font-semibold text-[var(--tenant-primary)] hover:underline">
              Contact support
            </a>
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
          { icon: Truck, title: "Add field operators", body: "Create field operator profiles and route assignments." }
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
