import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { useAuditEntries } from "./api";
import { AuditFilterBar, useAuditUrlFilters } from "./components/AuditFilterBar";

export function AuditTimelinePage() {
  const filterState = useAuditUrlFilters();
  const entries = useAuditEntries(filterState.filters);
  const rows = entries.data?.pages.flatMap((page) => page.data) ?? [];
  const total = entries.data?.pages[0]?.total ?? 0;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Audit timeline</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">The same server-filtered audit trail, newest first, as a timeline.</p>
      </header>
      <AuditFilterBar state={filterState} />
      {entries.isError ? <ConsoleApiErrorPanel error={entries.error} onRetry={() => void entries.refetch()} title="Unable to load the audit timeline" /> : null}
      {!entries.isError && !entries.isLoading && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No audit entry matches these filters.</p> : null}
      <ol className="space-y-3 border-l border-[var(--color-border)] pl-4">
        {rows.map((entry) => (
          <li key={entry.id} data-testid="audit-timeline-entry" className="rounded-lg border border-[var(--color-border)] bg-white p-3">
            <p className="font-mono text-xs text-[var(--color-text-muted)]">{new Date(entry.createdAt).toISOString()}</p>
            <p className="mt-1 font-mono text-sm font-semibold text-[var(--color-text-primary)]">{entry.action}</p>
            <p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-[var(--color-text-muted)]">
              <span>{entry.actorEmail ?? entry.actorId}</span>
              <span>→</span>
              <span className="font-mono">
                {entry.targetType ?? "target"}:{entry.targetId ?? "—"}
              </span>
              {entry.targetTenant ? <TenantChip tenantId={entry.targetTenant.id} name={entry.targetTenant.name} slug={entry.targetTenant.slug} /> : null}
            </p>
            {entry.reason ? <p className="mt-1 text-xs">{entry.reason}</p> : null}
          </li>
        ))}
      </ol>
      {entries.hasNextPage ? (
        <button type="button" onClick={() => void entries.fetchNextPage()} disabled={entries.isFetchingNextPage} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold disabled:opacity-50">
          {entries.isFetchingNextPage ? "Loading…" : `Load more (${rows.length} of ${total})`}
        </button>
      ) : null}
    </div>
  );
}
