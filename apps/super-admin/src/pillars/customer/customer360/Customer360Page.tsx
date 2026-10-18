import { HealthPill, JITGate } from "@fauward/internal-ui";
import type { Permission } from "@fauward/internal-rbac";
import type { ComponentType } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { AccessDenied } from "@/components/service-kit/AccessDenied";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { MoneyCell } from "@/components/service-kit/MoneyCell";
import { SectionErrorBoundary } from "@/components/service-kit/SectionErrorBoundary";
import { toConsoleApiError } from "@/lib/console-api-error";
import { useC360 } from "./api";
import { ActivityTab, AiTab, AuditTab, BillingTab, ConfigTab, HealthTab, NotesTab, OverviewTab, PeopleTab, TicketsTab, UsageTab } from "./Customer360Tabs";

type TabDef = { id: string; label: string; permission: Permission; Component: ComponentType<{ tenantId: string }> };

// Each tab: its own query, its own error boundary and its own permission gate (catalogue → customer.360).
const TABS: TabDef[] = [
  { id: "overview", label: "Overview", permission: "customer.360.read", Component: OverviewTab },
  { id: "activity", label: "Activity", permission: "customer.360.read", Component: ActivityTab },
  { id: "usage", label: "Usage", permission: "customer.360.read", Component: UsageTab },
  { id: "billing", label: "Billing", permission: "revenue.invoices.read", Component: BillingTab },
  { id: "tickets", label: "Tickets", permission: "customer.support.read", Component: TicketsTab },
  { id: "health", label: "Health", permission: "customer.success.read", Component: HealthTab },
  { id: "ai", label: "AI", permission: "customer.360.read", Component: AiTab },
  { id: "audit", label: "Audit", permission: "trust.audit.read", Component: AuditTab },
  { id: "people", label: "People", permission: "customer.360.read", Component: PeopleTab },
  { id: "config", label: "Config", permission: "platform.tenants.read", Component: ConfigTab },
  { id: "notes", label: "Notes", permission: "customer.360.read", Component: NotesTab }
];

function healthStatus(score: number) {
  return score >= 70 ? "green" : score >= 45 ? "amber" : "red";
}

export function Customer360Page() {
  const { tenantId = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = TABS.find((item) => item.id === params.get("tab")) ?? TABS[0];
  const summary = useC360(tenantId, "summary");

  if (summary.isError && toConsoleApiError(summary.error).status === 404) {
    return (
      <div className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <h1 className="text-lg font-semibold">Tenant not found</h1>
        <Link to="/customer/360" className="mt-2 inline-block text-sm font-semibold text-[var(--fauward-navy)] hover:underline">
          Pick another tenant
        </Link>
      </div>
    );
  }

  const data = summary.data;
  return (
    <div className="space-y-4">
      <header className="sticky top-14 z-10 rounded-lg border border-[var(--color-border)] bg-white p-4">
        {summary.isError ? <ConsoleApiErrorPanel error={summary.error} onRetry={() => void summary.refetch()} title="Unable to load the tenant header" /> : null}
        {data ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{data.identity.name}</h1>
              <p data-testid="c360-header" className="text-xs text-[var(--color-text-muted)]">
                {data.plan.effectivePlan} · {data.status} · MRR <MoneyCell amount={data.mrr.amount} currency={data.mrr.currency} /> · last sign-in {data.lastLoginAt ? new Date(data.lastLoginAt).toLocaleString() : "never"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {data.health ? <HealthPill status={healthStatus(data.health.score)} label={`Health ${data.health.score}`} /> : <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">Not yet scored</span>}
              <Link className="rounded-md border border-[var(--color-border)] px-3 py-2 text-xs font-semibold" to={`/platform/tenants/${data.identity.id}`}>
                Tenant controls
              </Link>
              <Link className="rounded-md border border-[var(--color-border)] px-3 py-2 text-xs font-semibold" to={`/platform/impersonation?tenantId=${encodeURIComponent(data.identity.id)}`}>
                Impersonate
              </Link>
            </div>
          </div>
        ) : summary.isLoading ? (
          <p className="text-sm text-[var(--color-text-muted)]">Loading tenant…</p>
        ) : null}
        <nav className="mt-4 flex gap-1 overflow-x-auto" aria-label="Customer 360 sections">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab.id === item.id}
              onClick={() => setParams({ tab: item.id }, { replace: true })}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${tab.id === item.id ? "bg-[var(--fauward-navy)] text-white" : "border border-[var(--color-border)] text-[var(--color-text-muted)]"}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>
      <SectionErrorBoundary label={tab.label} resetKey={`${tenantId}:${tab.id}`}>
        <JITGate permission={tab.permission} fallback={<AccessDenied permission={tab.permission} title={`You don't have access to the ${tab.label} tab`} />}>
          <tab.Component tenantId={tenantId} />
        </JITGate>
      </SectionErrorBoundary>
    </div>
  );
}
