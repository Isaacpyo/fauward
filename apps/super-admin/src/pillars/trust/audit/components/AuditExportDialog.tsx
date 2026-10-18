import { useState } from "react";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { type AuditExportResult, type AuditFilters, exportAudit } from "../api";

const label = "block text-xs font-semibold text-[var(--color-text-muted)]";

function describeFilters(filters: AuditFilters) {
  const entries = Object.entries(filters);
  if (entries.length === 0) return "every entry (no filters)";
  return entries.map(([key, value]) => `${key}=${value}`).join(", ");
}

/** Export of a filtered set (dangerous: reason + fresh MFA). The export writes its own audit row server-side. */
export function AuditExportDialog({ open, filters, onClose, onDone }: { open: boolean; filters: AuditFilters; onClose: () => void; onDone: (result: AuditExportResult) => void }) {
  const [format, setFormat] = useState<"csv" | "json">("csv");
  return (
    <ActionDialog
      open={open}
      dangerous
      title="Export audit entries"
      description={
        <>
          Exports {describeFilters(filters)}. The export itself is recorded in the audit log.
        </>
      }
      confirmLabel="Export"
      onClose={onClose}
      onSubmit={async (reason) => onDone(await exportAudit({ ...filters, format, reason }))}
    >
      <div>
        <label htmlFor="audit-export-format" className={label}>
          Format
        </label>
        <select id="audit-export-format" value={format} onChange={(event) => setFormat(event.target.value === "json" ? "json" : "csv")} className="mt-1 h-9 w-full rounded-md border border-[var(--color-border)] bg-white px-3 text-sm">
          <option value="csv">CSV</option>
          <option value="json">JSON</option>
        </select>
      </div>
    </ActionDialog>
  );
}

export function AuditExportResultLink({ result }: { result: AuditExportResult }) {
  return (
    <div role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
      <a href={result.url} download={`fauward-audit-export.${result.format}`} className="font-semibold underline">
        Download {result.format.toUpperCase()} ({result.rows} {result.rows === 1 ? "entry" : "entries"})
      </a>
      {result.truncated ? <p className="mt-1 text-xs text-amber-800">Capped at {result.maxRows} entries — narrow the date range to export the rest.</p> : null}
    </div>
  );
}
