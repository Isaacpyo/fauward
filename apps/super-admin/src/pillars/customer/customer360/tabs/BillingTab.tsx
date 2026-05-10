import { Link } from "react-router-dom";
import type { Customer360 } from "../api";
export default function BillingTab({ data }: { data: Customer360 }) {
  return <section className="rounded-lg border border-[var(--color-border)] bg-white p-4"><h2 className="text-sm font-semibold">Billing</h2><div className="mt-3 space-y-2">{data.tenant.invoices.map((invoice) => <Link key={invoice.id} to={`/revenue/billing/invoices/${invoice.id}`} className="flex justify-between rounded border border-[var(--color-border)] px-3 py-2 text-sm"><span>{invoice.invoiceNumber}</span><span>{invoice.currency} {invoice.total}</span></Link>)}</div></section>;
}
