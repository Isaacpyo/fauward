import { useState } from "react";

import { PermissionButton } from "@/components/service-kit/PermissionButton";
import type { AuditExportResult } from "./api";
import { AuditExportDialog, AuditExportResultLink } from "./components/AuditExportDialog";
import { AuditFilterBar, useAuditUrlFilters } from "./components/AuditFilterBar";

export function AuditExportPage() {
  const filterState = useAuditUrlFilters();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<AuditExportResult | null>(null);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Audit export</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">CSV or JSON evidence exports of a filtered set. Exports need a reason and a fresh MFA check, and are themselves audited.</p>
      </header>
      <AuditFilterBar state={filterState} />
      <PermissionButton permission="trust.audit.export" onClick={() => setOpen(true)} className="rounded-md bg-[var(--fauward-navy)] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
        Export…
      </PermissionButton>
      {result ? <AuditExportResultLink result={result} /> : null}
      <AuditExportDialog open={open} filters={filterState.filters} onClose={() => setOpen(false)} onDone={setResult} />
    </div>
  );
}
