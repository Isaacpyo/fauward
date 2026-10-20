import { DenseTable, EmptyState } from "@fauward/internal-ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { MoneyCell, formatMoney } from "@/components/service-kit/MoneyCell";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { createRefund, decideRefund, fetchRefunds, type Refund } from "./api";

type Dialog = { kind: "create" } | { kind: "decide"; refund: Refund; decision: "approve" | "reject" } | null;

const STATUS_STYLE: Record<string, string> = {
  PENDING_APPROVAL: "text-amber-700",
  PROCESSING: "text-amber-700",
  SUCCEEDED: "text-green-700",
  RECORDED_MANUAL: "text-green-700",
  FAILED: "text-red-700",
  REJECTED: "text-[var(--color-text-muted)]"
};

function currencyOf(refund: Refund) {
  return refund.currency ?? refund.payment?.currency ?? null;
}

export function RefundsPage() {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["billing-refunds"], queryFn: fetchRefunds });
  const [dialog, setDialog] = useState<Dialog>(null);
  const [paymentId, setPaymentId] = useState("");
  const [amount, setAmount] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  const refunds = query.data ?? [];
  const queue = refunds.filter((refund) => refund.status === "PENDING_APPROVAL");

  async function refresh(message: string) {
    setNotice(message);
    await queryClient.invalidateQueries({ queryKey: ["billing-refunds"] });
    await queryClient.invalidateQueries({ queryKey: ["billing-payments"] });
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Refunds</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Refunds without a card payment, or at or above the large-refund threshold without permission, need a second approver.</p>
        </div>
        <PermissionButton
          permission="revenue.invoices.refund"
          className="rounded-md bg-[var(--fauward-navy)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          onClick={() => {
            setPaymentId("");
            setAmount("");
            setDialog({ kind: "create" });
          }}
        >
          New refund
        </PermissionButton>
      </header>

      {notice ? (
        <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {notice}
        </p>
      ) : null}
      {query.isError ? <ConsoleApiErrorPanel error={query.error} onRetry={() => void query.refetch()} /> : null}

      <section className="rounded-lg border border-[var(--color-border)] bg-white p-4" aria-label="Approval queue">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Awaiting approval ({queue.length})</h2>
        {queue.length === 0 ? <p className="mt-2 text-sm text-[var(--color-text-muted)]">No refunds are waiting for a second approver.</p> : null}
        <ul className="mt-2 divide-y divide-[var(--color-border)]">
          {queue.map((refund) => (
            <li key={refund.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
              <div>
                <p className="font-semibold">
                  <MoneyCell amount={refund.amount} currency={currencyOf(refund)} /> for {refund.tenant?.name ?? refund.tenantId}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Payment {refund.paymentId} | requested by {refund.initiatedBy ?? "unknown"} | {refund.reason}
                </p>
              </div>
              <div className="flex gap-2">
                <PermissionButton permission="revenue.invoices.refund" className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50" onClick={() => setDialog({ kind: "decide", refund, decision: "approve" })}>
                  Approve
                </PermissionButton>
                <PermissionButton permission="revenue.invoices.refund" className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-50" onClick={() => setDialog({ kind: "decide", refund, decision: "reject" })}>
                  Reject
                </PermissionButton>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <DenseTable<Refund>
        data={refunds}
        loading={query.isLoading}
        getRowId={(row) => row.id}
        emptyState={<EmptyState title="No refunds" message="No refunds have been requested yet." />}
        columns={[
          { id: "tenant", header: "Tenant", cell: (row) => row.tenant?.name ?? row.tenantId },
          { id: "payment", header: "Payment", cell: (row) => <span className="font-mono text-xs">{row.paymentId}</span> },
          { id: "status", header: "Status", cell: (row) => <span className={`text-xs font-semibold ${STATUS_STYLE[row.status] ?? ""}`}>{row.status}</span> },
          { id: "amount", header: "Amount", align: "right", cell: (row) => <MoneyCell amount={row.amount} currency={currencyOf(row)} /> },
          { id: "reason", header: "Reason", cell: (row) => (row.failureReason ? <span className="text-red-700">{row.failureReason}</span> : row.reason ?? "-") }
        ]}
      />

      <ActionDialog
        open={dialog?.kind === "create"}
        title="New refund"
        description="Refunds are checked against the payment's refundable balance. The amount is in the payment's currency."
        confirmLabel="Request refund"
        dangerous
        validate={() => (!paymentId.trim() ? "Enter the payment ID." : !/^\d+(\.\d{1,3})?$/.test(amount.trim()) || Number(amount) <= 0 ? "Enter an amount such as 12.34." : null)}
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => {
          const result = await createRefund({ paymentId: paymentId.trim(), amount: amount.trim(), reason });
          const money = formatMoney(result.refund.amount, currencyOf(result.refund));
          await refresh(result.approvalRequired ? `Refund of ${money} is waiting for a second approver.` : `Refund of ${money} ${result.refund.status === "SUCCEEDED" ? "succeeded" : result.refund.status.toLowerCase()}.`);
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
            Payment ID
            <input value={paymentId} onChange={(event) => setPaymentId(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-normal" />
          </label>
          <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
            Amount
            <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-normal" />
          </label>
        </div>
      </ActionDialog>

      <ActionDialog
        open={dialog?.kind === "decide"}
        title={dialog?.kind === "decide" ? `${dialog.decision === "approve" ? "Approve" : "Reject"} refund of ${formatMoney(dialog.refund.amount, currencyOf(dialog.refund))}?` : ""}
        description={dialog?.kind === "decide" && dialog.decision === "approve" ? "Approving records the refund (or sends it to Stripe for card payments) and updates the payment's refunded amount." : "The refund will not be paid."}
        confirmLabel={dialog?.kind === "decide" && dialog.decision === "approve" ? "Approve refund" : "Reject refund"}
        dangerous
        onClose={() => setDialog(null)}
        onSubmit={async (reason) => {
          if (dialog?.kind !== "decide") return;
          const refund = await decideRefund(dialog.refund.id, dialog.decision, reason);
          await refresh(`Refund ${refund.status === "REJECTED" ? "rejected" : `now ${refund.status}`}.`);
        }}
      />
    </div>
  );
}
