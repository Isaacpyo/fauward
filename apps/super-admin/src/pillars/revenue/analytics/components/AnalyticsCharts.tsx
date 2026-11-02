import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatCurrency } from "@/lib/badges";
import { isReconstructed, type CohortRow, type Coverage, type Forecast, type MovementRow, type PlanRow } from "@/pillars/revenue/analytics/api";

// Revenue analytics charts (WP-3.2). Colours follow the dataviz reference palette's categorical order (fixed per
// series, never cycled); one y-axis per chart; recessive grid; every chart has a table with the same numbers.

const SERIES = {
  new: { label: "New", color: "#2a78d6" },
  expansion: { label: "Expansion", color: "#eb6834" },
  reactivation: { label: "Reactivation", color: "#1baf7a" },
  contraction: { label: "Contraction", color: "#eda100" },
  churn: { label: "Churn", color: "#e87ba4" }
} as const;
type SeriesKey = keyof typeof SERIES;
const SERIES_KEYS = Object.keys(SERIES) as SeriesKey[];
const INK = "#0b0b0b";
const GRID = "#e5e4e0";
const AXIS = { fontSize: 11, fill: "#52514e" };
const RECONSTRUCTED_FILL = "#f1f0ec";

const money = (value: number | string, currency: string) => formatCurrency(String(value), currency);
const pct = (value: number | null) => (value === null ? "—" : `${Math.round(value * 1000) / 10}%`);
const th = "px-2 py-1 text-left text-xs font-semibold text-[var(--color-text-muted)]";
const td = "px-2 py-1 text-right tabular-nums";

function ReconstructedNote({ coverage }: { coverage: Coverage }) {
  if (!coverage.reconstructedBefore) return null;
  return (
    <p className="mt-2 text-xs text-[var(--color-text-muted)]" data-testid="reconstructed-note">
      <span className="mr-1 inline-block h-2.5 w-4 rounded-sm align-middle" style={{ backgroundColor: RECONSTRUCTED_FILL, border: "1px dashed #a8a7a1" }} />
      Months before {coverage.reconstructedBefore.slice(0, 7)} are reconstructed from the subscription backfill (trial conversions and price changes before then are estimated).
    </p>
  );
}

export function MrrMovementChart({ rows, coverage }: { rows: MovementRow[]; coverage: Coverage }) {
  const currency = coverage.baseCurrency;
  const data = rows.map((row) => ({ month: row.month, net: Number(row.net), ...Object.fromEntries(SERIES_KEYS.map((key) => [key, Number(row[key])])) }));
  const reconstructed = rows.filter((row) => row.reconstructed || isReconstructed(row.month, coverage)).map((row) => row.month);
  return (
    <div>
      <div className="h-72" data-testid="mrr-movement-chart" role="img" aria-label="MRR movement per month: new, expansion and reactivation above zero; contraction and churn below; net as a line">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} stackOffset="sign" margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            {reconstructed.length > 0 ? <ReferenceArea x1={reconstructed[0]} x2={reconstructed[reconstructed.length - 1]} fill={RECONSTRUCTED_FILL} fillOpacity={1} label={{ value: "Reconstructed", position: "insideTop", fontSize: 11, fill: "#52514e" }} /> : null}
            <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(value: number) => money(value, currency)} width={84} />
            <Tooltip formatter={(value: number, name: string) => [money(value, currency), name]} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {SERIES_KEYS.map((key) => (
              <Bar key={key} dataKey={key} name={SERIES[key].label} stackId="movement" fill={SERIES[key].color} stroke="#fcfcfb" strokeWidth={1} maxBarSize={36} />
            ))}
            <Line type="linear" dataKey="net" name="Net" stroke={INK} strokeWidth={2} dot={{ r: 4, fill: INK }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <ReconstructedNote coverage={coverage} />
      <table className="mt-3 w-full text-sm" data-testid="mrr-movement-table">
        <thead>
          <tr>
            <th className={th}>Month</th>
            {SERIES_KEYS.map((key) => (
              <th key={key} className={`${th} text-right`}>
                {SERIES[key].label}
              </th>
            ))}
            <th className={`${th} text-right`}>Net</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {rows.map((row) => (
            <tr key={row.month} data-testid="movement-row" className={reconstructed.includes(row.month) ? "bg-[var(--color-surface-50)] italic" : undefined}>
              <td className="px-2 py-1">
                {row.month}
                {reconstructed.includes(row.month) ? <span className="ml-1 text-xs not-italic text-[var(--color-text-muted)]">(reconstructed)</span> : null}
              </td>
              {SERIES_KEYS.map((key) => (
                <td key={key} className={td}>
                  {money(row[key], currency)}
                </td>
              ))}
              <td className={`${td} font-semibold`}>{money(row.net, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ByPlanChart({ rows, currency }: { rows: PlanRow[]; currency: string }) {
  const data = rows.map((row) => ({ name: `${row.plan} · ${row.billingCycle.toLowerCase()}`, mrr: Number(row.mrr), tenants: row.tenants }));
  return (
    <div>
      <div className="h-56" data-testid="by-plan-chart" role="img" aria-label="Current MRR per plan and billing cycle">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={GRID} horizontal={false} />
            <XAxis type="number" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={(value: number) => money(value, currency)} />
            <YAxis type="category" dataKey="name" tick={AXIS} tickLine={false} axisLine={false} width={130} />
            <Tooltip formatter={(value: number) => [money(value, currency), "MRR"]} />
            <Bar dataKey="mrr" name="MRR" fill={SERIES.new.color} radius={[0, 4, 4, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="mt-3 w-full text-sm" data-testid="by-plan-table">
        <thead>
          <tr>
            <th className={th}>Plan</th>
            <th className={th}>Billing</th>
            <th className={`${th} text-right`}>Tenants</th>
            <th className={`${th} text-right`}>MRR</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {rows.map((row) => (
            <tr key={`${row.plan}-${row.billingCycle}`}>
              <td className="px-2 py-1">{row.plan}</td>
              <td className="px-2 py-1">{row.billingCycle.toLowerCase()}</td>
              <td className={td}>{row.tenants}</td>
              <td className={td}>
                {money(row.mrr, currency)}
                {row.unconverted ? <span className="ml-1 text-xs text-[var(--color-text-muted)]">+{row.unconverted} without FX rate</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ForecastChart({ forecast }: { forecast: Forecast }) {
  const data = [{ month: "now", mrr: Number(forecast.basis.startingMrr) }, ...forecast.points.map((point) => ({ month: point.month, mrr: Number(point.mrr) }))];
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]" data-testid="forecast-label">
        {forecast.label}
      </p>
      <div className="h-56" data-testid="forecast-chart" role="img" aria-label="Projected MRR per month (run-rate projection)">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="month" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(value: number) => money(value, forecast.currency)} width={84} />
            <Tooltip formatter={(value: number) => [money(value, forecast.currency), "Projected MRR"]} />
            <Line type="linear" dataKey="mrr" name="Projected MRR" stroke={SERIES.new.color} strokeWidth={2} strokeDasharray="6 4" dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-[var(--color-text-muted)]" data-testid="forecast-method">
        {forecast.method} Basis: average net {money(forecast.basis.averageNet, forecast.currency)} per month over{" "}
        {forecast.basis.months.length ? forecast.basis.months.map((month) => month.month).join(", ") : "no complete months yet"}.
      </p>
    </div>
  );
}

function cellShade(value: number | null) {
  if (value === null) return undefined;
  const clamped = Math.max(0, Math.min(1, value));
  return { backgroundColor: `rgba(42, 120, 214, ${0.08 + clamped * 0.42})` };
}

export function CohortTable({ rows, currency }: { rows: CohortRow[]; currency: string }) {
  const width = Math.max(0, ...rows.map((row) => row.months.length));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="cohort-table">
        <thead>
          <tr>
            <th className={th}>Signup month</th>
            <th className={`${th} text-right`}>Sign-ups</th>
            <th className={`${th} text-right`}>Paying</th>
            <th className={`${th} text-right`}>Starting MRR</th>
            {Array.from({ length: width }, (_unused, offset) => (
              <th key={offset} className={`${th} text-right`}>
                M{offset}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {rows.map((row) => (
            <tr key={row.cohort} data-testid="cohort-row">
              <td className="px-2 py-1">{row.cohort}</td>
              <td className={td}>{row.signups}</td>
              <td className={td}>{row.paying}</td>
              <td className={td}>{money(row.startingMrr, currency)}</td>
              {Array.from({ length: width }, (_unused, offset) => {
                const month = row.months[offset];
                return (
                  <td key={offset} className={`${td} text-xs`} style={month ? cellShade(month.revenueRetention) : undefined} title={month ? `${month.month}: ${month.payingTenants} paying, ${money(month.mrr, currency)}` : undefined}>
                    {month ? (
                      <>
                        <span className="block font-semibold">{pct(month.revenueRetention)}</span>
                        <span className="block text-[var(--color-text-muted)]">{pct(month.logoRetention)} logos</span>
                      </>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
