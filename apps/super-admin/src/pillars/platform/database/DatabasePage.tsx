import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";

import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { DegradedBanner } from "@/components/service-kit/DegradedBanner";
import { consoleApi } from "@/lib/console-api";

// platform.database (WP-4.4): read-only tabs — migrations, tables, slow queries, connections. Every backend query runs
// in a READ ONLY transaction; nothing here can change the database.

type Migration = { name: string; status: "APPLIED" | "FAILED" | "ROLLED_BACK" | "PENDING" | "NOT_IN_REPO" | null; inRepo: boolean | null; startedAt: string | null; finishedAt: string | null; logs: string | null };
type Migrations = { tracked: boolean; repoAvailable: boolean; degraded: string | null; summary: { applied: number; failed: number; pending: number | null; rolledBack: number; notInRepo: number }; data: Migration[] };
type Table = { name: string; rowEstimate: number | null; totalBytes: number; tableBytes: number; indexBytes: number; deadTuples: number | null; lastVacuumAt: string | null; lastAnalyzeAt: string | null };
type SlowQueries = { available: boolean; extension: string; reason: string | null; data: Array<{ query: string; calls: number; meanMs: number; totalMs: number; rows: number }> };
type Connections = { data: Array<{ state: string; count: number }>; total: number; maxConnections: number | null };

const TABS = [
  { id: "migrations", label: "Migrations" },
  { id: "tables", label: "Tables" },
  { id: "slow-queries", label: "Slow queries" },
  { id: "connections", label: "Connections" }
] as const;
type Tab = (typeof TABS)[number]["id"];

const KEY = ["platform.database"] as const;

function bytes(value: number) {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(0)} kB`;
  return `${value} B`;
}

function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : "Never";
}

const STATUS_TONE: Record<string, string> = {
  APPLIED: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  ROLLED_BACK: "bg-amber-100 text-amber-900",
  PENDING: "bg-blue-100 text-blue-800",
  NOT_IN_REPO: "bg-amber-100 text-amber-900"
};

function MigrationsTab() {
  const query = useQuery({ queryKey: [...KEY, "migrations"], queryFn: async () => (await consoleApi.get<Migrations>("/database/migrations")).data });
  const data = query.data;
  return (
    <div className="space-y-3">
      {query.isError ? <ConsoleApiErrorPanel error={query.error} onRetry={() => void query.refetch()} title="Unable to load migrations" /> : null}
      {query.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading migrations…</p> : null}
      {data?.degraded ? (
        <DegradedBanner variant="not-wired" fixedBy={data.tracked ? "prisma/migrations" : "_prisma_migrations"}>
          {data.degraded}
        </DegradedBanner>
      ) : null}
      {data?.tracked ? (
        <p className="text-sm" data-testid="migration-summary">
          {data.summary.applied} applied · {data.summary.failed} failed · {data.summary.pending ?? "?"} pending · {data.summary.rolledBack} rolled back
          {data.summary.notInRepo ? ` · ${data.summary.notInRepo} not in the repo` : ""}
        </p>
      ) : null}
      {data && data.data.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-muted)]">
                <th className="px-3 py-2">Migration</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Finished</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {[...data.data].reverse().map((row) => (
                <tr key={row.name} data-testid="migration-row">
                  <td className="px-3 py-2 font-mono text-xs">
                    {row.name}
                    {row.logs ? <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-[11px] text-red-700">{row.logs}</pre> : null}
                  </td>
                  <td className="px-3 py-2">
                    {row.status ? <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_TONE[row.status]}`}>{row.status.replace("_", " ").toLowerCase()}</span> : <span className="text-xs text-[var(--color-text-muted)]">untracked</span>}
                  </td>
                  <td className="px-3 py-2 text-xs">{row.finishedAt ? new Date(row.finishedAt).toLocaleString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function TablesTab() {
  const query = useQuery({ queryKey: [...KEY, "tables"], queryFn: async () => (await consoleApi.get<{ data: Table[]; totalBytes: number }>("/database/tables")).data });
  const rows = query.data?.data ?? [];
  return (
    <div className="space-y-3">
      {query.isError ? <ConsoleApiErrorPanel error={query.error} onRetry={() => void query.refetch()} title="Unable to load tables" /> : null}
      {query.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading tables…</p> : null}
      {query.data ? <p className="text-sm">{rows.length} tables · {bytes(query.data.totalBytes)} including indexes</p> : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-muted)]">
                <th className="px-3 py-2">Table</th>
                <th className="px-3 py-2 text-right">Rows (estimate)</th>
                <th className="px-3 py-2 text-right">Size</th>
                <th className="px-3 py-2 text-right">Indexes</th>
                <th className="px-3 py-2">Last vacuum</th>
                <th className="px-3 py-2">Last analyze</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((row) => (
                <tr key={row.name} data-testid="table-row">
                  <td className="px-3 py-2 font-mono text-xs">{row.name}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">{row.rowEstimate?.toLocaleString() ?? "—"}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">{bytes(row.totalBytes)}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">{bytes(row.indexBytes)}</td>
                  <td className="px-3 py-2 text-xs">{when(row.lastVacuumAt)}</td>
                  <td className="px-3 py-2 text-xs">{when(row.lastAnalyzeAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function SlowQueriesTab() {
  const query = useQuery({ queryKey: [...KEY, "slow-queries"], queryFn: async () => (await consoleApi.get<SlowQueries>("/database/slow-queries")).data });
  const data = query.data;
  return (
    <div className="space-y-3">
      {query.isError ? <ConsoleApiErrorPanel error={query.error} onRetry={() => void query.refetch()} title="Unable to load slow queries" /> : null}
      {query.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading…</p> : null}
      {data && !data.available ? (
        <DegradedBanner variant="not-wired" fixedBy={data.extension}>
          {data.reason}
        </DegradedBanner>
      ) : null}
      {data?.available && data.data.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No statements recorded yet.</p> : null}
      {data?.available && data.data.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-muted)]">
                <th className="px-3 py-2">Statement (normalised)</th>
                <th className="px-3 py-2 text-right">Mean</th>
                <th className="px-3 py-2 text-right">Calls</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {data.data.map((row, index) => (
                <tr key={`${index}-${row.query.slice(0, 20)}`} data-testid="slow-query-row">
                  <td className="max-w-xl px-3 py-2">
                    <code className="line-clamp-3 break-all text-[11px]">{row.query}</code>
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">{row.meanMs.toFixed(1)} ms</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">{row.calls.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">{(row.totalMs / 1000).toFixed(1)} s</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function ConnectionsTab() {
  const query = useQuery({ queryKey: [...KEY, "connections"], queryFn: async () => (await consoleApi.get<Connections>("/database/connections")).data, refetchInterval: 30_000 });
  const data = query.data;
  return (
    <div className="space-y-3">
      {query.isError ? <ConsoleApiErrorPanel error={query.error} onRetry={() => void query.refetch()} title="Unable to load connections" /> : null}
      {query.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading…</p> : null}
      {data ? (
        <>
          <p className="text-sm" data-testid="connection-total">
            {data.total} connection{data.total === 1 ? "" : "s"} to this database{data.maxConnections ? ` (server limit ${data.maxConnections})` : ""}
          </p>
          <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white text-sm">
            {data.data.map((row) => (
              <li key={row.state} className="flex justify-between px-3 py-2" data-testid="connection-row">
                <span>{row.state}</span>
                <span className="tabular-nums">{row.count}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

export function DatabasePage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((item) => item.id === params.get("tab"))?.id ?? "migrations") as Tab;
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Database</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Read-only views of the production database. Nothing on this page can change it.</p>
      </header>
      <nav className="flex flex-wrap gap-2" role="tablist" aria-label="Database views">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setParams({ tab: item.id }, { replace: true })}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${tab === item.id ? "bg-[var(--fauward-navy)] text-white" : "border border-[var(--color-border)]"}`}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {tab === "migrations" ? <MigrationsTab /> : null}
      {tab === "tables" ? <TablesTab /> : null}
      {tab === "slow-queries" ? <SlowQueriesTab /> : null}
      {tab === "connections" ? <ConnectionsTab /> : null}
    </div>
  );
}
