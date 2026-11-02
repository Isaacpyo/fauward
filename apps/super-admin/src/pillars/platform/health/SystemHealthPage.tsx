import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { formatPercent, formatUptime, isUnavailable, useHealth, type HealthReport, type RouteLatency, type WorkerStatus } from "@/pillars/platform/health/api";

// platform.health (WP-3.7): DB/Redis latency, API latency percentiles and 5xx rate (last 15 min, all instances),
// slowest route groups, worker heartbeats and a queue roll-up.

function Card({ title, children, testId }: { title: string; children: ReactNode; testId?: string }) {
  return (
    <article data-testid={testId} className="rounded-lg border border-[var(--color-border)] bg-white p-4">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{title}</h2>
      <div className="mt-2 text-sm">{children}</div>
    </article>
  );
}

function Reason({ reason }: { reason: string }) {
  return <p className="text-sm text-[var(--color-text-muted)]">Not measured: {reason}</p>;
}

function Big({ value, unit }: { value: string | number; unit?: string }) {
  return (
    <p className="text-2xl font-bold tabular-nums text-[var(--color-text-primary)]">
      {value}
      {unit ? <span className="ml-1 text-sm font-medium text-[var(--color-text-muted)]">{unit}</span> : null}
    </p>
  );
}

function RouteLatencyTable({ routes }: { routes: RouteLatency[] }) {
  if (routes.length === 0) return <p className="text-sm text-[var(--color-text-muted)]">No route groups recorded in this window.</p>;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs text-[var(--color-text-muted)]">
          <th className="py-1">Route group</th>
          <th className="py-1 text-right">Requests</th>
          <th className="py-1 text-right">p50</th>
          <th className="py-1 text-right">p95</th>
          <th className="py-1 text-right">p99</th>
          <th className="py-1 text-right">5xx</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-[var(--color-border)]">
        {routes.map((route) => (
          <tr key={route.group} data-testid="route-latency">
            <td className="py-1 font-mono text-xs">{route.group}</td>
            <td className="py-1 text-right tabular-nums">{route.count}</td>
            <td className="py-1 text-right tabular-nums">{route.p50} ms</td>
            <td className="py-1 text-right tabular-nums">{route.p95} ms</td>
            <td className="py-1 text-right tabular-nums">{route.p99} ms</td>
            <td className={`py-1 text-right tabular-nums ${route.errorRate5xx > 0 ? "text-red-700" : ""}`}>{formatPercent(route.errorRate5xx)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function WorkersPanel({ workers }: { workers: WorkerStatus[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {workers.map((worker) => (
        <li key={worker.name} data-testid={`worker-${worker.name}`} className="flex items-center justify-between rounded-md border border-[var(--color-border)] px-3 py-2">
          <span className="font-mono text-xs">{worker.name}</span>
          <span className={`text-xs font-semibold ${worker.alive ? "text-green-700" : "text-red-700"}`}>
            {worker.alive ? "Alive" : "No heartbeat"}
            {worker.lastBeat ? <span className="ml-1 font-normal text-[var(--color-text-muted)]">{new Date(worker.lastBeat).toLocaleTimeString()}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function HealthBody({ report }: { report: HealthReport }) {
  return (
    <>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card title="Database" testId="health-db">
          {isUnavailable(report.db) ? <Reason reason={report.db.reason} /> : <Big value={report.db.latencyMs} unit="ms" />}
        </Card>
        <Card title="Redis" testId="health-redis">
          {isUnavailable(report.redis) ? <Reason reason={report.redis.reason} /> : <Big value={report.redis.latencyMs} unit="ms" />}
        </Card>
        <Card title="API uptime" testId="health-uptime">
          <Big value={formatUptime(report.uptimeSeconds)} />
          <p className="text-xs text-[var(--color-text-muted)]">This API instance</p>
        </Card>
        <Card title="Version" testId="health-version">
          {isUnavailable(report.version) ? (
            <Reason reason={report.version.reason} />
          ) : (
            <p className="font-mono text-sm">
              {report.version.version ?? "unversioned"}
              {report.version.commit ? ` · ${report.version.commit.slice(0, 7)}` : ""}
            </p>
          )}
        </Card>
      </section>

      <section className="grid gap-3 lg:grid-cols-3">
        <Card title={`API latency (last ${report.windowMinutes} min)`} testId="health-latency">
          {isUnavailable(report.http) ? (
            <Reason reason={report.http.reason} />
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-xs text-[var(--color-text-muted)]">p50</p>
                <Big value={report.http.p50} unit="ms" />
              </div>
              <div>
                <p className="text-xs text-[var(--color-text-muted)]">p95</p>
                <Big value={report.http.p95} unit="ms" />
              </div>
              <div>
                <p className="text-xs text-[var(--color-text-muted)]">p99</p>
                <Big value={report.http.p99} unit="ms" />
              </div>
            </div>
          )}
        </Card>
        <Card title={`5xx error rate (last ${report.windowMinutes} min)`} testId="health-errors">
          {isUnavailable(report.http) ? (
            <Reason reason={report.http.reason} />
          ) : (
            <>
              <Big value={formatPercent(report.http.errorRate5xx)} />
              <p className="text-xs text-[var(--color-text-muted)]">
                {report.http.count} requests · {report.http.rpm} per minute
              </p>
            </>
          )}
        </Card>
        <Card title="Queues" testId="health-queues">
          {isUnavailable(report.queuesSummary) ? (
            <Reason reason={report.queuesSummary.reason} />
          ) : (
            <>
              <p>
                {report.queuesSummary.waiting} waiting · {report.queuesSummary.active} active · {report.queuesSummary.failed1h} failed in 1 h
              </p>
              <p className={report.queuesSummary.dlqDepth > 0 ? "text-red-700" : "text-[var(--color-text-muted)]"}>
                {report.queuesSummary.dlqDepth} dead-lettered{report.queuesSummary.paused > 0 ? ` · ${report.queuesSummary.paused} paused` : ""}
              </p>
              <Link to="/platform/queues" className="text-xs font-semibold text-[var(--fauward-navy)] hover:underline">
                Queue operations
              </Link>
            </>
          )}
        </Card>
      </section>

      <Card title="Slowest route groups (p95)">
        <RouteLatencyTable routes={report.routes} />
      </Card>

      <Card title="Background workers">{isUnavailable(report.workers) ? <Reason reason={report.workers.reason} /> : <WorkersPanel workers={report.workers} />}</Card>
    </>
  );
}

export function SystemHealthPage() {
  const query = useHealth();
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">System health</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Measured from every API instance (request metrics in Redis) and worker heartbeats.{query.data ? ` As of ${new Date(query.data.asOf).toLocaleTimeString()}.` : ""}
        </p>
      </header>
      {query.isError ? <ConsoleApiErrorPanel error={query.error} onRetry={() => void query.refetch()} title="Unable to load system health" /> : null}
      {query.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading system health…</p> : null}
      {query.data ? <HealthBody report={query.data} /> : null}
    </div>
  );
}
