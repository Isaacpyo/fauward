import { useState, type ReactNode } from "react";

import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { formatCurrency } from "@/lib/badges";
import { useByPlan, useCohorts, useForecast, useMovement } from "@/pillars/revenue/analytics/api";
import { ByPlanChart, CohortTable, ForecastChart, MrrMovementChart } from "@/pillars/revenue/analytics/components/AnalyticsCharts";

// revenue.analytics (WP-3.2): MRR movement, signup cohorts, MRR by plan and a run-rate projection, all computed from
// SubscriptionEvent history. Months rebuilt from the backfill are marked "reconstructed".

const monthOf = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

function defaultRange(months: number) {
  const now = new Date();
  return { from: monthOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1))), to: monthOf(now) };
}

/** Renders a panel only for a well-formed analytics payload (every response carries the coverage fields). */
function hasCoverage<T extends object>(data: T | undefined): data is T & { baseCurrency: string } {
  return Boolean(data) && typeof (data as { baseCurrency?: unknown }).baseCurrency === "string";
}

function Panel({ title, children, query }: { title: string; children: ReactNode; query: { isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown } }) {
  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-white p-4">
      <h2 className="text-base font-bold text-[var(--color-text-primary)]">{title}</h2>
      <div className="mt-3">
        {query.isError ? <ConsoleApiErrorPanel error={query.error} onRetry={() => void query.refetch()} title={`Unable to load ${title.toLowerCase()}`} /> : null}
        {query.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading…</p> : null}
        {children}
      </div>
    </section>
  );
}

export function RevenueAnalyticsPage() {
  const [windowMonths, setWindowMonths] = useState(12);
  const range = defaultRange(windowMonths);
  const movement = useMovement(range);
  const cohorts = useCohorts(range);
  const byPlan = useByPlan();
  const forecast = useForecast(6);
  const coverage = hasCoverage(movement.data) ? movement.data : undefined;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Revenue analytics</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            From subscription history{coverage?.dataSince ? ` since ${new Date(coverage.dataSince).toLocaleDateString()}` : ""}. Amounts in {coverage?.baseCurrency ?? "the platform base currency"}.
            {coverage && coverage.unconvertedEvents > 0 ? ` ${coverage.unconvertedEvents} event(s) in a currency without a stored FX rate are left out.` : ""}
          </p>
        </div>
        <label className="text-xs font-semibold text-[var(--color-text-muted)]">
          Window
          <select aria-label="Window" value={windowMonths} onChange={(event) => setWindowMonths(Number(event.target.value))} className="ml-2 rounded-md border border-[var(--color-border)] px-2 py-1 text-sm">
            <option value={6}>Last 6 months</option>
            <option value={12}>Last 12 months</option>
            <option value={24}>Last 24 months</option>
          </select>
        </label>
      </header>

      {coverage && !coverage.dataSince ? (
        <p role="note" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          No subscription events are recorded yet. Movement and cohorts fill in as plans change; existing subscriptions appear once the 0051 subscription-events backfill has run.
        </p>
      ) : null}

      <Panel title="MRR movement" query={movement}>
        {hasCoverage(movement.data) && Array.isArray(movement.data.data) ? <MrrMovementChart rows={movement.data.data} coverage={movement.data} /> : null}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="MRR by plan" query={byPlan}>
          {hasCoverage(byPlan.data) && Array.isArray(byPlan.data.rows) ? (
            <>
              <p className="mb-2 text-sm">
                Total <span className="font-semibold" data-testid="by-plan-total">{formatCurrency(byPlan.data.total, byPlan.data.currency)}</span> across billing subscriptions.
              </p>
              {byPlan.data.rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No billing subscriptions.</p> : <ByPlanChart rows={byPlan.data.rows} currency={byPlan.data.currency} />}
            </>
          ) : null}
        </Panel>
        <Panel title="Forecast" query={forecast}>
          {hasCoverage(forecast.data) && Array.isArray(forecast.data.points) && forecast.data.basis ? <ForecastChart forecast={forecast.data} /> : null}
        </Panel>
      </div>

      <Panel title="Signup cohorts" query={cohorts}>
        {hasCoverage(cohorts.data) && Array.isArray(cohorts.data.data) ? (
          cohorts.data.data.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">No tenants with subscription history signed up in this window.</p>
          ) : (
            <>
              <p className="mb-2 text-xs text-[var(--color-text-muted)]">Each cell: MRR at month end against the cohort's first paid MRR (revenue retention), and paying tenants against those that ever paid (logo retention).</p>
              <CohortTable rows={cohorts.data.data} currency={cohorts.data.baseCurrency} />
            </>
          )
        ) : null}
      </Panel>
    </div>
  );
}
