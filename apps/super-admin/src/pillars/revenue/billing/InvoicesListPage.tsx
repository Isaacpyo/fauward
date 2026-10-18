import { Link, useNavigate } from "react-router-dom";

import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { MoneyCell } from "@/components/service-kit/MoneyCell";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { useInvoices } from "./api";
import { LedgerFilters, useLedgerFilters } from "./components/LedgerFilters";

const STATUSES = ["DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "OVERDUE", "VOID"];

export function InvoicesListPage() {
  const navigate = useNavigate();
  const { filters, set } = useLedgerFilters(true);
  const query = useInvoices(filters);
  const rows = query.data?.pages.flatMap((page) => page.data ?? []) ?? [];
  const kindSuffix = filters.kind === "PLATFORM" ? "" : "?kind=TENANT_CUSTOMER";

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Invoices</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">What Fauward bills its tenants. Amounts are in each invoice&apos;s own currency.</p>
        </div>
        <PermissionButton permission="revenue.invoices.write" onClick={() => navigate("/revenue/billing/invoices/create")} className="rounded-md bg-[var(--fauward-navy)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
          New invoice
        </PermissionButton>
      </header>
      <LedgerFilters filters={filters} set={set} statuses={STATUSES} />
      {query.isError ? <ConsoleApiErrorPanel error={query.error} onRetry={() => void query.refetch()} title="Unable to load invoices" /> : null}
      {!query.isError ? (
        <section className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--color-surface-50)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              <tr>
                <th className="px-3 py-2">Invoice</th>
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">Outstanding</th>
                <th className="px-3 py-2">Due</th>
                <th className="px-3 py-2">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((invoice) => (
                <tr key={invoice.id} data-testid="invoice-row" className="cursor-pointer hover:bg-[var(--color-surface-50)]" onClick={() => navigate(`/revenue/billing/invoices/${invoice.id}${kindSuffix}`)}>
                  <td className="px-3 py-2 font-mono text-xs">{invoice.invoiceNumber}</td>
                  <td className="px-3 py-2">{invoice.tenant ? <TenantChip tenantId={invoice.tenant.id} name={invoice.tenant.name} slug={invoice.tenant.slug} /> : invoice.tenantId}</td>
                  <td className="px-3 py-2 text-xs font-semibold">{invoice.status}</td>
                  <td className="px-3 py-2 text-right">
                    <MoneyCell amount={invoice.total} currency={invoice.currency} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <MoneyCell amount={invoice.outstanding} currency={invoice.currency} />
                  </td>
                  <td className="px-3 py-2 text-xs">{invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "—"}</td>
                  <td className="px-3 py-2 text-xs">{new Date(invoice.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {!query.isLoading && rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-[var(--color-text-muted)]">
                    {filters.kind === "PLATFORM" ? "Fauward has not invoiced any tenant matching these filters." : "No tenant customer invoices match these filters."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {query.hasNextPage ? (
            <div className="border-t border-[var(--color-border)] p-2 text-center">
              <button type="button" onClick={() => void query.fetchNextPage()} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold">
                Load more
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
      <p className="text-xs text-[var(--color-text-muted)]">
        See also <Link to="/revenue/billing/payments" className="underline">payments</Link>, <Link to="/revenue/billing/credit-notes" className="underline">credit notes</Link> and{" "}
        <Link to="/revenue/billing/refunds" className="underline">refunds</Link>.
      </p>
    </div>
  );
}
