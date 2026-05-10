import type { Customer360 } from "../api";
export default function AuditTab({ data }: { data: Customer360 }) {
  return <section className="rounded-lg border border-[var(--color-border)] bg-white p-4"><h2 className="text-sm font-semibold">Tenant audit</h2><div className="mt-3 space-y-2">{data.tenant.auditLogs.map((entry) => <p key={entry.id} className="text-sm"><span className="font-mono text-xs text-[var(--color-text-muted)]">{new Date(entry.timestamp).toLocaleString()}</span> {entry.action}</p>)}</div></section>;
}
