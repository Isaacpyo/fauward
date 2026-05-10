import { HealthPill } from "@fauward/internal-ui";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense, useMemo, type ComponentType } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { fetchCustomer360 } from "./api";

const OverviewTab = lazy(() => import("./tabs/OverviewTab"));
const UsageTab = lazy(() => import("./tabs/UsageTab"));
const BillingTab = lazy(() => import("./tabs/BillingTab"));
const TicketsTab = lazy(() => import("./tabs/TicketsTab"));
const HealthTab = lazy(() => import("./tabs/HealthTab"));
const AuditTab = lazy(() => import("./tabs/AuditTab"));
const PeopleTab = lazy(() => import("./tabs/PeopleTab"));
const ConfigTab = lazy(() => import("./tabs/ConfigTab"));
const NotesTab = lazy(() => import("./tabs/NotesTab"));

const tabs = ["overview", "usage", "billing", "tickets", "health", "audit", "people", "config", "notes"] as const;

export function Customer360Page() {
  const { tenantId = "" } = useParams();
  const [params] = useSearchParams();
  const activeTab = tabs.includes(params.get("tab") as never) ? params.get("tab") as (typeof tabs)[number] : "overview";
  const query = useQuery({ queryKey: ["customer-360", tenantId], queryFn: () => fetchCustomer360(tenantId), enabled: Boolean(tenantId) });
  const data = query.data;
  const Tab = useMemo<ComponentType<{ data: NonNullable<typeof data> }>>(() => ({
    overview: OverviewTab,
    usage: UsageTab,
    billing: BillingTab,
    tickets: TicketsTab,
    health: HealthTab,
    audit: AuditTab,
    people: PeopleTab,
    config: ConfigTab,
    notes: NotesTab
  })[activeTab], [activeTab]);

  if (query.isLoading) return <p className="text-sm text-[var(--color-text-muted)]">Loading Customer 360...</p>;
  if (!data) return <p className="text-sm text-[var(--color-text-muted)]">Tenant not found.</p>;

  return (
    <div className="space-y-4">
      <header className="sticky top-14 z-10 rounded-lg border border-[var(--color-border)] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {data.tenant.logoUrl ? <img src={data.tenant.logoUrl} alt="" className="h-10 w-10 rounded object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded bg-[var(--color-surface-50)] font-semibold">{data.tenant.name[0]}</span>}
            <div>
              <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{data.tenant.name}</h1>
              <p className="text-xs text-[var(--color-text-muted)]">{data.tenant.plan} | {data.tenant.status} | MRR placeholder | Last login placeholder</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <HealthPill status={data.metrics.healthScore >= 70 ? "green" : data.metrics.healthScore >= 45 ? "amber" : "red"} label={`Health ${data.metrics.healthScore}`} />
            <Link className="rounded-md border border-[var(--color-border)] px-3 py-2 text-xs font-semibold" to={`/platform/impersonation?tenant=${data.tenant.id}`}>Impersonate</Link>
            <a className="rounded-md border border-[var(--color-border)] px-3 py-2 text-xs font-semibold" href={`https://dashboard.stripe.com/search?query=${data.tenant.id}`}>Stripe</a>
            <a className="rounded-md border border-[var(--color-border)] px-3 py-2 text-xs font-semibold" href={`https://zendesk.com/search?query=${data.tenant.slug}`}>Zendesk</a>
          </div>
        </div>
        <nav className="mt-4 flex gap-1 overflow-x-auto">
          {tabs.map((tab) => <Link key={tab} to={`?tab=${tab}`} className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize ${activeTab === tab ? "bg-[var(--fauward-navy)] text-white" : "border border-[var(--color-border)] text-[var(--color-text-muted)]"}`}>{tab}</Link>)}
        </nav>
      </header>
      <Suspense fallback={<p className="text-sm text-[var(--color-text-muted)]">Loading tab...</p>}>
        <Tab data={data} />
      </Suspense>
    </div>
  );
}
