import { useState } from "react";
import { Link } from "react-router-dom";

import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { severityTone, useActivityFeed, type ActivitySeverity } from "@/lib/activity";
import { useActivityStreamStatus } from "@/lib/activity-stream";
import { PILLARS } from "@/pillars/_manifests";

// Dashboard activity feed (WP-3.5): the latest 50 events the caller may see, filterable by pillar and severity, kept
// current by the activity stream (new rows appear without a reload).

const SEVERITIES: ActivitySeverity[] = ["INFO", "ATTENTION", "CRITICAL"];

export function DashboardActivityFeed() {
  const [pillar, setPillar] = useState("");
  const [severity, setSeverity] = useState<ActivitySeverity | "">("");
  const status = useActivityStreamStatus();
  const feed = useActivityFeed("/activity", { ...(pillar ? { pillar } : {}), ...(severity ? { severity } : {}) });
  const rows = feed.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <section aria-label="Activity" className="rounded-lg border border-[var(--color-border)] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-[var(--color-text-primary)]">Activity</h2>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span data-testid="activity-stream-status" className={status === "live" ? "font-semibold text-green-700" : "text-[var(--color-text-muted)]"}>
            {status === "live" ? "● Live" : status === "connecting" ? "Connecting…" : "Reconnecting…"}
          </span>
          <label className="flex items-center gap-1">
            Pillar
            <select aria-label="Pillar" value={pillar} onChange={(event) => setPillar(event.target.value)} className="rounded-md border border-[var(--color-border)] px-2 py-1">
              <option value="">All</option>
              {PILLARS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1">
            Severity
            <select aria-label="Severity" value={severity} onChange={(event) => setSeverity(SEVERITIES.find((item) => item === event.target.value) ?? "")} className="rounded-md border border-[var(--color-border)] px-2 py-1">
              <option value="">All</option>
              {SEVERITIES.map((item) => (
                <option key={item} value={item}>
                  {item.toLowerCase()}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {feed.isError ? <ConsoleApiErrorPanel error={feed.error} onRetry={() => void feed.refetch()} title="Unable to load activity" /> : null}
      {feed.isLoading ? <p className="mt-3 text-sm text-[var(--color-text-muted)]">Loading activity…</p> : null}
      {feed.isSuccess && rows.length === 0 ? <p className="mt-3 text-sm text-[var(--color-text-muted)]">No activity in the services you can read{pillar || severity ? " for these filters" : ""}.</p> : null}
      {rows.length > 0 ? (
        <ul className="mt-3 divide-y divide-[var(--color-border)]">
          {rows.map((row) => (
            <li key={row.id} data-testid="dashboard-activity-row" className="flex items-start justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium">
                  {row.consoleLink ? (
                    <Link to={row.consoleLink} className="hover:underline">
                      {row.summary}
                    </Link>
                  ) : (
                    row.summary
                  )}
                </p>
                <p className="flex flex-wrap items-center gap-1 text-xs text-[var(--color-text-muted)]">
                  {row.tenant ? <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} /> : null}
                  <span>
                    {row.actorLabel} · {row.service}
                  </span>
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${severityTone[row.severity]}`}>{row.severity.toLowerCase()}</span>
                <time className="text-xs text-[var(--color-text-muted)]" dateTime={row.occurredAt}>
                  {new Date(row.occurredAt).toLocaleString()}
                </time>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {feed.hasNextPage ? (
        <button type="button" onClick={() => void feed.fetchNextPage()} disabled={feed.isFetchingNextPage} className="mt-2 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
          Older activity
        </button>
      ) : null}
    </section>
  );
}
