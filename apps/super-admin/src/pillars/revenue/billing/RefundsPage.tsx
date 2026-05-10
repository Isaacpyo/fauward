import { DenseTable, EmptyState } from "@fauward/internal-ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createRefund, fetchRefunds, type Refund } from "./api";

export function RefundsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ paymentId: "", amount: 0, reason: "Customer refund request" });
  const query = useQuery({ queryKey: ["billing-refunds"], queryFn: fetchRefunds });
  const mutation = useMutation({ mutationFn: createRefund, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["billing-refunds"] }) });
  return <div className="space-y-4"><section className="grid gap-2 rounded-lg border border-[var(--color-border)] bg-white p-4 md:grid-cols-4"><input placeholder="Payment ID" className="rounded-md border px-3 py-2 text-sm" value={form.paymentId} onChange={(e) => setForm({ ...form, paymentId: e.target.value })} /><input type="number" className="rounded-md border px-3 py-2 text-sm" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /><input className="rounded-md border px-3 py-2 text-sm" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /><button className="rounded-md bg-[var(--fauward-navy)] px-3 py-2 text-sm font-semibold text-white" onClick={() => mutation.mutate(form)}>Create refund</button></section><DenseTable<Refund> data={query.data ?? []} loading={query.isLoading} getRowId={(row) => row.id} emptyState={<EmptyState title="No refunds" message="No refunds found." />} columns={[{ id: "id", header: "Refund", cell: (row) => row.id }, { id: "payment", header: "Payment", cell: (row) => row.paymentId }, { id: "status", header: "Status", cell: (row) => row.status }, { id: "amount", header: "Amount", align: "right", cell: (row) => row.amount }, { id: "reason", header: "Reason", cell: (row) => row.reason ?? "-" }]} /></div>;
}
