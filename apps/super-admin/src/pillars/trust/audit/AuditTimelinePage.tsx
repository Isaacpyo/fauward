import { AuditTimeline } from "@fauward/internal-audit";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { fetchAuditEntries } from "./api";

export function AuditTimelinePage() {
  const [q, setQ] = useState("");
  const query = useQuery({ queryKey: ["audit-timeline", q], queryFn: () => fetchAuditEntries({ q: q || undefined, limit: 50 }) });
  const entries = (query.data?.data ?? []).map((entry) => ({
    id: entry.id,
    timestamp: new Date(entry.createdAt),
    actor_id: entry.actorEmail ?? entry.actorId,
    actor_role: entry.actorRole ?? "UNKNOWN",
    action: entry.action,
    target_type: entry.targetType ?? "route",
    target_id: entry.targetId ?? "-",
    before: entry.before,
    after: entry.after,
    reason: entry.reason,
    ip_address: "",
    session_id: "",
    jit_session_id: null,
    hash: entry.hash,
    prev_hash: entry.previousHash
  }));

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Audit timeline</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Timeline filtered by tenant, actor or target text.</p>
      </header>
      <input value={q} onChange={(event) => setQ(event.target.value)} className="w-full max-w-md rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" placeholder="Filter timeline" />
      <AuditTimeline entries={entries} />
    </div>
  );
}
