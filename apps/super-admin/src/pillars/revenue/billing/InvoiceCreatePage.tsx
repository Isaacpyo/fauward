import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createInvoice } from "./api";

export function InvoiceCreatePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ tenantId: "", description: "Off-cycle service fee", quantity: 1, unitAmount: 100, taxRate: 20, currency: "GBP", reason: "Manual off-cycle billing" });
  const mutation = useMutation({ mutationFn: createInvoice, onSuccess: (invoice) => navigate(`/revenue/billing/invoices/${invoice.id}`) });
  return (
    <div className="max-w-3xl space-y-5">
      <header><h1 className="text-xl font-bold text-[var(--color-text-primary)]">Create manual invoice</h1></header>
      <section className="grid gap-3 rounded-lg border border-[var(--color-border)] bg-white p-4 md:grid-cols-2">
        <input className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" placeholder="Tenant ID" value={form.tenantId} onChange={(e) => setForm({ ...form, tenantId: e.target.value })} />
        <input className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" placeholder="Currency" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
        <input className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm md:col-span-2" placeholder="Line description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <input className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })} />
        <input className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" type="number" value={form.unitAmount} onChange={(e) => setForm({ ...form, unitAmount: Number(e.target.value) })} />
        <input className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" type="number" value={form.taxRate} onChange={(e) => setForm({ ...form, taxRate: Number(e.target.value) })} />
        <input className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        <button type="button" className="rounded-md bg-[var(--fauward-navy)] px-4 py-2 text-sm font-semibold text-white md:col-span-2" onClick={() => mutation.mutate({ tenantId: form.tenantId, currency: form.currency, taxRate: form.taxRate, reason: form.reason, lineItems: [{ description: form.description, quantity: form.quantity, unitAmount: form.unitAmount }] })}>Create invoice</button>
      </section>
    </div>
  );
}
