import { Link } from "react-router-dom";

import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { useQueues, type QueueSummary } from "@/pillars/platform/queues/api";

// platform.queues (WP-3.6): one row per BullMQ queue. DLQ = entries in the queue's dead-letter queue (jobs that used
// every retry), not the queue's own failed set.

function statusOf(queue: QueueSummary) {
  if (queue.paused) return { label: "Paused", className: "border-amber-200 bg-amber-50 text-amber-800" };
  if ((queue.dlqDepth ?? 0) > 0 || queue.failed1h > 0) return { label: "Failures", className: "border-red-200 bg-red-50 text-red-700" };
  return { label: "Running", className: "border-green-200 bg-green-50 text-green-700" };
}

export function QueuesListPage() {
  const query = useQueues();
  const rows = query.data?.queues ?? [];

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Queue operations</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Live BullMQ counts. Throughput is jobs completed in the last 5 minutes per minute; DLQ counts dead-lettered jobs waiting for replay.
        </p>
      </header>
      {query.isError ? <ConsoleApiErrorPanel error={query.error} onRetry={() => void query.refetch()} title="Unable to load queues" /> : null}
      {query.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading queues…</p> : null}
      {query.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No queues are registered.</p> : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-muted)]">
                <th className="px-3 py-2">Queue</th>
                <th className="px-3 py-2 text-right">Waiting</th>
                <th className="px-3 py-2 text-right">Active</th>
                <th className="px-3 py-2 text-right">Delayed</th>
                <th className="px-3 py-2 text-right">Completed 1 h</th>
                <th className="px-3 py-2 text-right">Failed 1 h</th>
                <th className="px-3 py-2 text-right">DLQ</th>
                <th className="px-3 py-2 text-right">Jobs/min</th>
                <th className="px-3 py-2">Last processed</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((queue) => {
                const status = statusOf(queue);
                return (
                  <tr key={queue.name} data-testid="queue-row" className="hover:bg-[var(--color-surface-50)]">
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link to={`/platform/queues/${encodeURIComponent(queue.name)}`} className="font-semibold text-[var(--fauward-navy)] hover:underline">
                        {queue.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{queue.waiting}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{queue.active}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{queue.delayed}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{queue.completed1h}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{queue.failed1h}</td>
                    <td className="px-3 py-2 text-right tabular-nums" data-testid={`dlq-${queue.name}`}>
                      {queue.dlqDepth === null ? <span className="text-xs text-[var(--color-text-muted)]">no DLQ</span> : queue.dlqDepth}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{queue.throughputPerMin}</td>
                    <td className="px-3 py-2 text-xs">{queue.lastProcessedAt ? new Date(queue.lastProcessedAt).toLocaleString() : "No completed jobs kept"}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${status.className}`}>{status.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {query.data ? <p className="text-xs text-[var(--color-text-muted)]">As of {new Date(query.data.asOf).toLocaleTimeString()} · refreshes every 10 s</p> : null}
    </div>
  );
}
