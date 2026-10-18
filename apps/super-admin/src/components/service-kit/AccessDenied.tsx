import { Lock } from "lucide-react";
import { useState } from "react";
import type { Permission } from "@fauward/internal-rbac";

import { JitRequestDialog } from "./JitRequestDialog";

/**
 * Access-denied state for a page or tab the caller cannot read (architecture §4): names the permission and offers
 * "Request access" (JIT). Never an empty table, never a silently missing page.
 */
export function AccessDenied({ permission, title = "You don't have access to this page" }: { permission: Permission; title?: string }) {
  const [open, setOpen] = useState(false);
  const [requested, setRequested] = useState(false);
  return (
    <section data-testid="access-denied" className="mx-auto mt-8 max-w-lg rounded-lg border border-[var(--color-border)] bg-white p-6 text-center">
      <Lock size={20} className="mx-auto text-[var(--color-text-muted)]" />
      <h2 className="mt-3 text-base font-semibold text-[var(--color-text-primary)]">{title}</h2>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        Requires <code className="font-mono text-xs">{permission}</code>.
      </p>
      {requested ? (
        <p className="mt-4 text-sm font-medium text-[var(--color-text-primary)]">Request sent. It appears in your session as soon as an approver grants it.</p>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className="mt-4 rounded-md bg-[var(--fauward-navy)] px-3 py-2 text-sm font-semibold text-white">
          Request access
        </button>
      )}
      <JitRequestDialog open={open} permission={permission} onClose={() => setOpen(false)} onRequested={() => setRequested(true)} />
    </section>
  );
}
