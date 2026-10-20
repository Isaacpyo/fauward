import { useState } from "react";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { type JitRequest, useActiveJitGrants, useRevokeJitGrant } from "./api";
import { JitTable } from "./components/JitTable";
import { JitNav } from "./components/JitNav";

const card = "rounded-lg border border-[var(--color-border)] bg-white p-4";

export function JitActivePage() {
  const active = useActiveJitGrants();
  const revoke = useRevokeJitGrant();
  const [ending, setEnding] = useState<JitRequest | null>(null);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Active grants</h1>
        <p className="text-sm text-[var(--color-text-muted)]">Every unexpired JIT grant. A grant stops working at its expiry or as soon as it is ended here.</p>
        <JitNav />
      </header>
      <section className={card}>
        {active.isError ? <ConsoleApiErrorPanel error={active.error} onRetry={() => void active.refetch()} title="Unable to load active grants" /> : null}
        {active.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading…</p> : null}
        {active.data ? (
          <JitTable
            testId="jit-active"
            rows={active.data}
            columns={["requester", "approvals", "expires"]}
            empty="No grants are active."
            actions={(row) => (
              <PermissionButton
                permission="trust.jit.approve"
                onClick={() => setEnding(row)}
                className="rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                End grant
              </PermissionButton>
            )}
          />
        ) : null}
      </section>
      <ActionDialog
        open={ending !== null}
        title="End this grant?"
        description={ending ? <>Access to <code className="font-mono text-xs">{ending.permission}</code> for {ending.requester.name ?? ending.requester.email} ends immediately. They see your reason.</> : null}
        confirmLabel="End grant"
        dangerous
        onClose={() => setEnding(null)}
        onSubmit={async (reason) => {
          if (ending) await revoke.mutateAsync({ id: ending.id, reason });
        }}
      />
    </div>
  );
}
