import { useState } from "react";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { type JitRequest, useApproveJitRequest, useDenyJitRequest, usePendingJitRequests } from "./api";
import { JitTable } from "./components/JitTable";
import { JitNav } from "./components/JitNav";

const card = "rounded-lg border border-[var(--color-border)] bg-white p-4";
const OWN = "You cannot approve or deny your own request";

export function JitPendingPage() {
  const pending = usePendingJitRequests();
  const approve = useApproveJitRequest();
  const deny = useDenyJitRequest();
  const [decision, setDecision] = useState<{ row: JitRequest; kind: "approve" | "deny" } | null>(null);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Pending access requests</h1>
        <p className="text-sm text-[var(--color-text-muted)]">Approving grants the permission until its expiry. ROOT requests need two approvers.</p>
        <JitNav />
      </header>
      <section className={card}>
        {pending.isError ? <ConsoleApiErrorPanel error={pending.error} onRetry={() => void pending.refetch()} title="Unable to load the queue" /> : null}
        {pending.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading…</p> : null}
        {pending.data ? (
          <JitTable
            testId="jit-pending"
            rows={pending.data}
            columns={["requester", "approvals"]}
            empty="No requests are waiting."
            actions={(row) => (
              <div className="flex justify-end gap-2">
                <PermissionButton
                  permission="trust.jit.approve"
                  disabled={row.ownRequest}
                  title={row.ownRequest ? OWN : undefined}
                  onClick={() => setDecision({ row, kind: "approve" })}
                  className="rounded-md bg-[var(--fauward-navy)] px-2 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Approve
                </PermissionButton>
                <PermissionButton
                  permission="trust.jit.approve"
                  disabled={row.ownRequest}
                  title={row.ownRequest ? OWN : undefined}
                  onClick={() => setDecision({ row, kind: "deny" })}
                  className="rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Deny
                </PermissionButton>
              </div>
            )}
          />
        ) : null}
      </section>
      <ActionDialog
        open={decision !== null}
        title={decision?.kind === "approve" ? "Approve access" : "Deny access"}
        description={
          decision ? (
            <>
              <code className="font-mono text-xs">{decision.row.permission}</code> for {decision.row.durationMinutes} min, requested by {decision.row.requester.name ?? decision.row.requester.email}: “{decision.row.reason}”
              {decision.kind === "deny" ? <span className="mt-1 block">The requester sees your reason.</span> : null}
            </>
          ) : null
        }
        confirmLabel={decision?.kind === "approve" ? "Approve" : "Deny"}
        dangerous
        onClose={() => setDecision(null)}
        onSubmit={async (reason) => {
          if (!decision) return;
          if (decision.kind === "approve") await approve.mutateAsync({ id: decision.row.id, reason });
          else await deny.mutateAsync({ id: decision.row.id, reason });
        }}
      />
    </div>
  );
}
