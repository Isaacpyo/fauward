import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { fetchInvoice } from "./api";

export function InvoiceDetailPage() {
  const { id = "" } = useParams();
  const query = useQuery({ queryKey: ["billing-invoice", id], queryFn: () => fetchInvoice(id), enabled: Boolean(id) });
  const invoice = query.data;
  if (query.isLoading) return <p className="text-sm text-[var(--color-text-muted)]">Loading invoice...</p>;
  if (!invoice) return <p className="text-sm text-[var(--color-text-muted)]">Invoice not found.</p>;
  return (
    <div className="space-y-5">
      <header className="rounded-lg border border-[var(--color-border)] bg-white p-5">
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{invoice.invoiceNumber}</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">{invoice.tenant?.name ?? invoice.tenantId} | {invoice.status} | {invoice.currency} {invoice.total}</p>
      </header>
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-[var(--color-border)] bg-white p-4"><h2 className="text-sm font-semibold">Line items</h2><pre className="mt-3 overflow-auto rounded bg-[var(--color-surface-50)] p-3 text-xs">{JSON.stringify(invoice.lineItems, null, 2)}</pre></div>
        <div className="rounded-lg border border-[var(--color-border)] bg-white p-4"><h2 className="text-sm font-semibold">Payments</h2><p className="mt-3 text-sm text-[var(--color-text-muted)]">{invoice.payments?.length ?? 0} payments</p></div>
        <div className="rounded-lg border border-[var(--color-border)] bg-white p-4"><h2 className="text-sm font-semibold">Credit notes</h2><p className="mt-3 text-sm text-[var(--color-text-muted)]">{invoice.creditNotes?.length ?? 0} credit notes</p></div>
      </section>
    </div>
  );
}
