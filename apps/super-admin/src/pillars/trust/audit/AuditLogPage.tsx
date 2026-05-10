import { DenseTable, DiffViewer, EmptyState, MonoCell } from "@fauward/internal-ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fetchAuditEntries, type AuditEntry, type AuditFilters } from "./api";

export function AuditLogPage() {
  const [filters, setFilters] = useState<AuditFilters>({ limit: 50 });
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const query = useQuery({ queryKey: ["audit-entries", filters], queryFn: () => fetchAuditEntries(filters) });

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr,420px]">
      <div className="space-y-5">
        <header>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Audit log</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Searchable, server-filtered platform audit trail.</p>
        </header>
        <section className="grid gap-2 rounded-lg border border-[var(--color-border)] bg-white p-3 md:grid-cols-3">
          <input className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" placeholder="Actor" onChange={(e) => setFilters((prev) => ({ ...prev, actor: e.target.value || undefined }))} />
          <input className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" placeholder="Action" onChange={(e) => setFilters((prev) => ({ ...prev, action: e.target.value || undefined }))} />
          <input className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" placeholder="Target ID" onChange={(e) => setFilters((prev) => ({ ...prev, targetId: e.target.value || undefined }))} />
          <input className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" type="datetime-local" onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value || undefined }))} />
          <input className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" type="datetime-local" onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value || undefined }))} />
          <input className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" placeholder="Free text" onChange={(e) => setFilters((prev) => ({ ...prev, q: e.target.value || undefined }))} />
        </section>
        <DenseTable<AuditEntry>
          data={query.data?.data ?? []}
          loading={query.isLoading}
          getRowId={(row) => row.id}
          onRowClick={setSelected}
          emptyState={<EmptyState title="No audit entries" message="No entries matched the current filters." />}
          columns={[
            { id: "createdAt", header: "Timestamp", width: 220, cell: (row) => <MonoCell value={new Date(row.createdAt).toISOString()} /> },
            { id: "actor", header: "Actor", width: 220, cell: (row) => row.actorEmail ?? row.actorId },
            { id: "action", header: "Action", width: 220, cell: (row) => row.action },
            { id: "target", header: "Target", width: 220, cell: (row) => `${row.targetType ?? "route"}:${row.targetId ?? "-"}` },
            { id: "reason", header: "Reason", width: 260, cell: (row) => row.reason ?? "-" }
          ]}
        />
      </div>
      <aside className="rounded-lg border border-[var(--color-border)] bg-white p-4">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Entry diff</h2>
        {selected ? <DiffViewer before={selected.before} after={selected.after} /> : <p className="mt-3 text-sm text-[var(--color-text-muted)]">Select an entry to inspect before/after JSON.</p>}
      </aside>
    </div>
  );
}
