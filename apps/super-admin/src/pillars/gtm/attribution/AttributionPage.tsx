import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { consoleApi } from "@/lib/console-api";

// gtm.attribution (WP-4.16): AttributionPage with tabs (sources, campaigns, landing pages, funnel). Rows are first touches
// recorded at signup from the marketing site's consented cookie; signups without one are "unknown". The funnel is
// signup → activated (activation score at or above the threshold, or paying) → paid; DEMO tenants are left out.

type Counts = { signups: number; activated: number; paid: number };
type Meta = { from: string; to: string; activationThreshold: number };
type Summary = Meta & { totals: Counts; untracked: number; data: Array<Counts & { source: string; medium: string }> };
type Campaigns = Meta & { data: Array<Counts & { campaign: string }> };
type LandingPages = Meta & { data: Array<Counts & { landingPage: string }> };
type Funnel = Meta & { stages: Array<{ stage: string; count: number }>; bySource: Array<Counts & { source: string }> };

export type AttributionTab = "sources" | "campaigns" | "landing-pages" | "funnel";

const TABS: Array<{ id: AttributionTab; to: string; text: string }> = [
  { id: "sources", to: "/gtm/attribution", text: "Sources" },
  { id: "campaigns", to: "/gtm/attribution/campaigns", text: "Campaigns" },
  { id: "landing-pages", to: "/gtm/attribution/landing-pages", text: "Landing pages" },
  { id: "funnel", to: "/gtm/attribution/funnel", text: "Funnel" }
];
const ENDPOINT: Record<AttributionTab, string> = { sources: "/attribution/summary", campaigns: "/attribution/campaigns", "landing-pages": "/attribution/landing-pages", funnel: "/attribution/funnel" };
const STAGE_LABEL: Record<string, string> = { signup: "Signed up", activated: "Activated", paid: "Paying" };

function rate(part: number, whole: number) {
  return whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";
}

function CountsTable({ rows, label }: { rows: Array<Counts & { name: string }>; label: string }) {
  if (rows.length === 0) return <p className="text-sm text-[var(--color-text-muted)]">No signups in this range.</p>;
  return (
    <table className="w-full rounded-lg border border-[var(--color-border)] bg-white text-sm">
      <thead>
        <tr className="text-left text-xs text-[var(--color-text-muted)]">
          <th className="px-3 py-2">{label}</th>
          <th className="px-3 py-2">Signups</th>
          <th className="px-3 py-2">Activated</th>
          <th className="px-3 py-2">Paying</th>
          <th className="px-3 py-2">Signup → paying</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name} className="border-t border-[var(--color-border)]" data-testid="attribution-row">
            <td className="px-3 py-2">{row.name}</td>
            <td className="px-3 py-2">{row.signups}</td>
            <td className="px-3 py-2">{row.activated}</td>
            <td className="px-3 py-2">{row.paid}</td>
            <td className="px-3 py-2">{rate(row.paid, row.signups)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function rowsFor(tab: AttributionTab, data: unknown): Array<Counts & { name: string }> {
  if (tab === "sources") return ((data as Summary).data ?? []).map(({ source, medium, ...counts }) => ({ name: `${source} / ${medium}`, ...counts }));
  if (tab === "campaigns") return ((data as Campaigns).data ?? []).map(({ campaign, ...counts }) => ({ name: campaign, ...counts }));
  if (tab === "landing-pages") return ((data as LandingPages).data ?? []).map(({ landingPage, ...counts }) => ({ name: landingPage, ...counts }));
  return ((data as Funnel).bySource ?? []).map(({ source, ...counts }) => ({ name: source, ...counts }));
}

export function AttributionPage({ tab }: { tab: AttributionTab }) {
  const [params, setParams] = useSearchParams();
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const report = useQuery({
    queryKey: ["gtm.attribution", tab, from, to],
    queryFn: async () => (await consoleApi.get<Summary | Campaigns | LandingPages | Funnel>(ENDPOINT[tab], { params: { ...(from ? { from } : {}), ...(to ? { to } : {}) } })).data
  });
  const setRange = (key: "from" | "to", value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const data = report.data;
  const label = tab === "sources" ? "Source / medium" : tab === "campaigns" ? "Campaign" : tab === "landing-pages" ? "Landing page" : "Source";
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Marketing attribution</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">First touch on fauward.com for each signup (recorded only with cookie consent); demo tenants excluded.</p>
        </div>
        <nav className="flex flex-wrap gap-2" aria-label="Attribution views">
          {TABS.map((item) => (
            <Link key={item.id} to={{ pathname: item.to, search: params.toString() }} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${item.id === tab ? "bg-[var(--fauward-navy)] text-white" : "border border-[var(--color-border)]"}`}>
              {item.text}
            </Link>
          ))}
        </nav>
      </header>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
          From
          <input aria-label="From" type="date" value={from} onChange={(event) => setRange("from", event.target.value)} className="mt-1 block rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" />
        </label>
        <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
          To
          <input aria-label="To" type="date" value={to} onChange={(event) => setRange("to", event.target.value)} className="mt-1 block rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" />
        </label>
        {data ? (
          <p className="text-xs text-[var(--color-text-muted)]" data-testid="attribution-range">
            {new Date(data.from).toLocaleDateString()} – {new Date(data.to).toLocaleDateString()} · activated = score ≥ {data.activationThreshold} or paying
          </p>
        ) : null}
      </div>
      {report.isError ? <ConsoleApiErrorPanel error={report.error} onRetry={() => void report.refetch()} title="Unable to load attribution" /> : null}
      {data && tab === "sources" ? (
        <p className="text-sm" data-testid="attribution-totals">
          {(data as Summary).totals?.signups ?? 0} signups · {(data as Summary).totals?.paid ?? 0} paying · {(data as Summary).untracked ?? 0} without a recorded first touch
        </p>
      ) : null}
      {data && tab === "funnel" ? (
        <ol className="grid gap-3 sm:grid-cols-3" aria-label="Funnel">
          {((data as Funnel).stages ?? []).map((stage, index, stages) => (
            <li key={stage.stage} className="rounded-lg border border-[var(--color-border)] bg-white p-4" data-testid="funnel-stage">
              <p className="text-xs text-[var(--color-text-muted)]">{STAGE_LABEL[stage.stage] ?? stage.stage}</p>
              <p className="text-2xl font-bold">{stage.count}</p>
              {index > 0 ? <p className="text-xs text-[var(--color-text-muted)]">{rate(stage.count, stages[0].count)} of signups</p> : null}
            </li>
          ))}
        </ol>
      ) : null}
      {data ? <CountsTable rows={rowsFor(tab, data)} label={label} /> : null}
    </div>
  );
}
