import { useState } from "react";
import { useParams } from "react-router-dom";

import { PlanOverrideModal } from "@/components/admin/PlanOverrideModal";
import { SuspendDialog } from "@/components/admin/SuspendDialog";
import { TenantDetailTabs } from "@/components/admin/TenantDetailTabs";

export function TenantDetailPage() {
  const { id = "tenant_unknown" } = useParams();
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [planOverrideOpen, setPlanOverrideOpen] = useState(false);

  return (
    <div className="space-y-3">
      <header className="rounded-md border border-[var(--color-border)] bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">Tenant {id}</h1>
            <p className="text-xs text-[var(--color-text-muted)]">domain: tenant-{id}.fauward.app | status: Active | plan: Pro</p>
          </div>
          <div className="flex flex-wrap gap-1 text-xs">
            <button type="button" className="rounded border border-[var(--color-border)] px-2 py-1" onClick={() => window.open(`/admin/impersonation?tenant=${id}`, "_blank")}>
              Impersonate
            </button>
            <button type="button" className="rounded border border-[var(--color-border)] px-2 py-1" onClick={() => setSuspendOpen(true)}>
              Suspend
            </button>
            <button type="button" className="rounded border border-[var(--color-border)] px-2 py-1" onClick={() => setPlanOverrideOpen(true)}>
              Override Plan
            </button>
            <button type="button" className="rounded border border-red-300 px-2 py-1 text-red-700">
              Delete
            </button>
          </div>
        </div>
      </header>

      <TenantDetailTabs tenantId={id} />

      <SuspendDialog open={suspendOpen} tenantName={id} onClose={() => setSuspendOpen(false)} onConfirm={() => setSuspendOpen(false)} />
      <PlanOverrideModal open={planOverrideOpen} tenantName={id} onClose={() => setPlanOverrideOpen(false)} onConfirm={() => setPlanOverrideOpen(false)} />
    </div>
  );
}

