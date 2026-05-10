import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { exportAudit } from "./api";

export function AuditExportPage() {
  const [form, setForm] = useState({ from: "", to: "", format: "json" as "csv" | "json", reason: "SOC 2 evidence export" });
  const mutation = useMutation({ mutationFn: exportAudit });
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Audit export</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Build CSV or JSON evidence exports. Export actions are audited.</p>
      </header>
      <section className="max-w-2xl rounded-lg border border-[var(--color-border)] bg-white p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <input type="datetime-local" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" />
          <input type="datetime-local" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" />
          <select value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value as "csv" | "json" })} className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
          </select>
          <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" />
        </div>
        <button type="button" className="mt-3 rounded-md bg-[var(--fauward-navy)] px-4 py-2 text-sm font-semibold text-white" onClick={() => mutation.mutate({ ...form, from: form.from || undefined, to: form.to || undefined })}>
          Generate export
        </button>
        {mutation.data ? <a className="mt-4 block break-all font-mono text-xs text-[var(--fauward-navy)]" href={mutation.data.url}>Signed export URL ({mutation.data.rows} rows)</a> : null}
      </section>
    </div>
  );
}
