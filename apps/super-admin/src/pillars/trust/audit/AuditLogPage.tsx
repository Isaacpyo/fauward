import { DiffViewer } from "@fauward/internal-ui";
import { useState } from "react";
import { Link } from "react-router-dom";

import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { type AuditEntry, type AuditExportResult, useAuditEntries } from "./api";
import { AuditExportDialog, AuditExportResultLink } from "./components/AuditExportDialog";
import { AuditFilterBar, useAuditUrlFilters } from "./components/AuditFilterBar";

function target(row: AuditEntry) {
  if (!row.targetType && !row.targetId) return "—";
  return `${row.targetType ?? "target"}:${row.targetId ?? "—"}`;
}

export function AuditLogPage() {
  const filterState = useAuditUrlFilters();
  const { filters } = filterState;
  const entries = useAuditEntries(filters);
  const rows = entries.data?.pages.flatMap((page) => page.data) ?? [];
  const total = entries.data?.pages[0]?.total ?? 0;
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<AuditExportResult | null>(null);
  const filteredTenant = filters.tenantId ? rows.find((row) => row.targetTenant?.id === filters.tenantId)?.targetTenant ?? null : null;

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr,420px]">
      <div className="min-w-0 space-y-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Audit log</h1>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{entries.isLoading ? "Loading…" : `${total} ${total === 1 ? "entry matches" : "entries match"} these filters`}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/trust/audit/integrity" className="text-sm font-semibold text-[var(--fauward-navy)] hover:underline">
              Chain integrity
            </Link>
            <PermissionButton permission="trust.audit.export" onClick={() => setExporting(true)} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">
              Export filtered set
            </PermissionButton>
          </div>
        </header>

        <AuditFilterBar state={filterState} tenantLabel={filteredTenant ? `${filteredTenant.name} (${filteredTenant.slug})` : null} />
        {exported ? <AuditExportResultLink result={exported} /> : null}
        {entries.isError ? <ConsoleApiErrorPanel error={entries.error} onRetry={() => void entries.refetch()} title="Unable to load the audit log" /> : null}

        {!entries.isError ? (
          <section className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--color-surface-50)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                <tr>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Actor</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Target</th>
                  <th className="px-3 py-2">Tenant</th>
                  <th className="px-3 py-2">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    data-testid="audit-row"
                    aria-selected={selected?.id === row.id}
                    onClick={() => setSelected(row)}
                    className={`cursor-pointer hover:bg-[var(--color-surface-50)] ${selected?.id === row.id ? "bg-[var(--color-surface-50)]" : ""}`}
                  >
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{new Date(row.createdAt).toISOString()}</td>
                    <td className="px-3 py-2 text-xs">{row.actorEmail ?? row.actorId}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.action}</td>
                    <td className="px-3 py-2 font-mono text-xs">{target(row)}</td>
                    <td className="px-3 py-2">
                      {row.targetTenant ? <TenantChip tenantId={row.targetTenant.id} name={row.targetTenant.name} slug={row.targetTenant.slug} /> : <span className="font-mono text-xs">{row.targetTenantId ?? "—"}</span>}
                    </td>
                    <td className="max-w-xs truncate px-3 py-2 text-xs" title={row.reason ?? undefined}>
                      {row.reason ?? "—"}
                    </td>
                  </tr>
                ))}
                {!entries.isLoading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-sm text-[var(--color-text-muted)]">
                      {Object.keys(filters).length > 0 ? "No audit entry matches these filters." : "No audit entries yet."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            {entries.hasNextPage ? (
              <div className="border-t border-[var(--color-border)] p-2 text-center">
                <button type="button" onClick={() => void entries.fetchNextPage()} disabled={entries.isFetchingNextPage} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold disabled:opacity-50">
                  {entries.isFetchingNextPage ? "Loading…" : `Load more (${rows.length} of ${total})`}
                </button>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>

      <aside aria-label="Entry detail" className="h-fit space-y-3 rounded-lg border border-[var(--color-border)] bg-white p-4 xl:sticky xl:top-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Entry detail</h2>
        {selected ? (
          <>
            <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-[var(--color-text-muted)]">Action</dt>
              <dd className="font-mono">{selected.action}</dd>
              <dt className="text-[var(--color-text-muted)]">Actor</dt>
              <dd>
                {selected.actorEmail ?? selected.actorId} {selected.actorRole ? <span className="text-[var(--color-text-muted)]">({selected.actorRole})</span> : null}
              </dd>
              <dt className="text-[var(--color-text-muted)]">Target</dt>
              <dd className="font-mono">{target(selected)}</dd>
              <dt className="text-[var(--color-text-muted)]">Reason</dt>
              <dd>{selected.reason ?? "—"}</dd>
              <dt className="text-[var(--color-text-muted)]">Hash</dt>
              <dd className="break-all font-mono">{selected.hash}</dd>
            </dl>
            {selected.before === null && selected.after === null ? (
              <p className="text-sm text-[var(--color-text-muted)]">This entry has no before/after snapshot.</p>
            ) : (
              <DiffViewer before={selected.before} after={selected.after} />
            )}
          </>
        ) : (
          <p className="text-sm text-[var(--color-text-muted)]">Select an entry to inspect its before/after diff.</p>
        )}
      </aside>

      <AuditExportDialog open={exporting} filters={filters} onClose={() => setExporting(false)} onDone={setExported} />
    </div>
  );
}
