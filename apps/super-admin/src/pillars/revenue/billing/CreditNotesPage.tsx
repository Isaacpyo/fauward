import { DenseTable, EmptyState } from "@fauward/internal-ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createCreditNote, fetchCreditNotes, type CreditNote } from "./api";

export function CreditNotesPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ tenantId: "", invoiceId: "", amount: 0, currency: "GBP", reason: "Credit note" });
  const query = useQuery({ queryKey: ["billing-credit-notes"], queryFn: fetchCreditNotes });
  const mutation = useMutation({ mutationFn: createCreditNote, onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["billing-credit-notes"] }) });
  return <div className="space-y-4"><section className="grid gap-2 rounded-lg border border-[var(--color-border)] bg-white p-4 md:grid-cols-5"><input placeholder="Tenant ID" className="rounded-md border px-3 py-2 text-sm" value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })} /><input placeholder="Invoice ID" className="rounded-md border px-3 py-2 text-sm" value={form.invoiceId} onChange={(e) => setForm({ ...form, invoiceId: e.target.value })} /><input type="number" className="rounded-md border px-3 py-2 text-sm" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /><input className="rounded-md border px-3 py-2 text-sm" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /><button className="rounded-md bg-[var(--fauward-navy)] px-3 py-2 text-sm font-semibold text-white" onClick={() => mutation.mutate({ ...form, invoiceId: form.invoiceId || undefined })}>Issue credit</button></section><DenseTable<CreditNote> data={query.data ?? []} loading={query.isLoading} getRowId={(row) => row.id} emptyState={<EmptyState title="No credit notes" message="No credit notes found." />} columns={[{ id: "number", header: "Credit note", cell: (row) => row.creditNumber }, { id: "invoice", header: "Invoice", cell: (row) => row.invoiceId ?? "-" }, { id: "amount", header: "Amount", align: "right", cell: (row) => `${row.currency} ${row.amount}` }, { id: "reason", header: "Reason", cell: (row) => row.reason ?? "-" }]} /></div>;
}
