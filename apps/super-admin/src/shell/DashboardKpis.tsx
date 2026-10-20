import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { formatCurrency } from "@/lib/badges";
import { useOverview, type Overview } from "@/lib/overview";

// Console dashboard KPI tiles (WP-3.1). Every number comes from /metrics/overview; tiles the caller may not read are
// not rendered.

function Tile({ label, value, detail, to, testId, attention }: { label: string; value: ReactNode; detail?: ReactNode; to: string; testId: string; attention?: string | null }) {
  return (
    <Link to={to} data-testid={testId} className="block rounded-lg border border-[var(--color-border)] bg-white p-3 hover:border-[var(--fauward-navy)]">
      <p className="text-xs font-medium text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-[var(--color-text-primary)]">{value}</p>
      {detail ? <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{detail}</p> : null}
      {attention ? <p className="mt-1 text-xs font-semibold text-red-700">● {attention}</p> : null}
    </Link>
  );
}

const count = (value: number) => value.toLocaleString();

function approvalsTotal(pending: NonNullable<Overview["pendingApprovals"]>) {
  const parts: Array<[string, number | undefined, string]> = [
    ["refunds", pending.refunds, "/revenue/billing/refunds"],
    ["access requests", pending.jit, "/trust/jit/pending"],
    ["plan changes", pending.planChanges, "/revenue/subscriptions/plan-change-requests"],
    ["region requests", pending.regionRequests, "/platform/tenants/region-requests"],
    ["appeals", pending.appeals, "/trust/safety/appeals"],
    ["DSARs", pending.dsar, "/trust/compliance/dsar"]
  ];
  const visible = parts.filter((part): part is [string, number, string] => part[1] !== undefined);
  return { visible, total: visible.reduce((sum, [, value]) => sum + value, 0) };
}

export function DashboardKpis() {
  const overview = useOverview();
  if (overview.isError) return <ConsoleApiErrorPanel error={overview.error} onRetry={() => void overview.refetch()} title="Unable to load platform metrics" />;
  if (overview.isLoading || !overview.data) return <p className="text-sm text-[var(--color-text-muted)]">Loading platform metrics…</p>;
  const data = overview.data;
  const approvals = approvalsTotal(data.pendingApprovals ?? {});

  return (
    <section aria-label="Platform metrics" className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {data.mrr ? (
          <Tile
            testId="kpi-mrr"
            label="MRR"
            to="/revenue/analytics"
            value={formatCurrency(data.mrr.amount, data.mrr.currency)}
            detail={`${data.mrr.subscriptions} billing subscriptions${data.mrr.converted ? ` · ${data.mrr.converted} converted at stored FX rates` : ""}`}
            attention={data.mrr.unconverted ? `${data.mrr.unconverted} without an FX rate, not included` : null}
          />
        ) : null}
        {data.activeTenants !== undefined ? (
          <Tile
            testId="kpi-tenants"
            label="Active tenants"
            to="/platform/tenants"
            value={count(data.activeTenants)}
            detail={`${count(data.trialingTenants ?? 0)} trialing · ${count(data.suspendedTenants ?? 0)} suspended`}
          />
        ) : null}
        {data.signups7d !== undefined ? <Tile testId="kpi-signups" label="Sign-ups, last 7 days" to="/platform/tenants" value={count(data.signups7d)} /> : null}
        {data.shipmentsToday !== undefined ? (
          <Tile testId="kpi-shipments" label="Shipments today (UTC)" to="/platform/tenants" value={count(data.shipmentsToday)} detail={`${count(data.shipments30d ?? 0)} in the last 30 days`} />
        ) : null}
        {data.dlqDepth !== undefined ? (
          <Tile testId="kpi-dlq" label="Dead-lettered jobs" to="/platform/queues" value={count(data.dlqDepth)} attention={data.dlqDepth > 0 ? "Needs replay or review" : null} />
        ) : null}
        {data.error5xxRate1h !== undefined ? (
          <Tile
            testId="kpi-errors"
            label="5xx rate, last hour"
            to="/platform/health"
            value={data.error5xxRate1h.rate === null ? "No traffic" : `${(data.error5xxRate1h.rate * 100).toFixed(2)}%`}
            detail={`${count(data.error5xxRate1h.requests)} requests`}
          />
        ) : null}
        {data.failedPayments30d !== undefined ? (
          <Tile testId="kpi-failed-payments" label="Failed Fauward payments, 30 days" to="/revenue/billing/payments" value={count(data.failedPayments30d)} />
        ) : null}
        {data.openPlatformTickets !== undefined ? <Tile testId="kpi-tickets" label="Open tickets to Fauward" to="/customer/support" value={count(data.openPlatformTickets)} /> : null}
        {data.openEscalations !== undefined ? <Tile testId="kpi-escalations" label="Open tenant escalations" to="/platform/incidents/escalations" value={count(data.openEscalations)} /> : null}
        {approvals.visible.length > 0 ? (
          <Tile
            testId="kpi-approvals"
            label="Waiting for a decision"
            to={approvals.visible.find(([, value]) => value > 0)?.[2] ?? approvals.visible[0][2]}
            value={count(approvals.total)}
            detail={approvals.visible.map(([label, value]) => `${value} ${label}`).join(" · ")}
          />
        ) : null}
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">As of {new Date(data.asOf).toLocaleTimeString()} · refreshes every minute</p>
    </section>
  );
}
