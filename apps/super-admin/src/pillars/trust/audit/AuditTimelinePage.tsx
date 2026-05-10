import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fetchAuditEntries } from "./api";

export function AuditTimelinePage() {
  const [q, setQ] = useState("");
  const query = useQuery({ queryKey: ["audit-timeline", q], queryFn: () => fetchAuditEntries({ q: q || undefined, limit: 50 }) });
  const entries = query.data?.data ?? [];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Audit timeline</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Timeline filtered by tenant, actor or target text.</p>
      </header>
      <input value={q} onChange={(event) => setQ(event.target.value)} className="w-full max-w-md rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" placeholder="Filter timeline" />
      <div className="space-y-3">
        {entries.map((entry) => (
          <div key={entry.id} className="rounded-lg border border-[var(--color-border)] bg-white p-3">
            <p className="font-mono text-xs text-[var(--color-text-muted)]">{new Date(entry.createdAt).toISOString()}</p>
            <p className="mt-1 text-sm font-semibold text-[var(--color-text-primary)]">{entry.action}</p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">{entry.actorEmail ?? entry.actorId} to {entry.targetType ?? "route"}:{entry.targetId ?? "-"}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
