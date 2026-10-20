import { Link } from "react-router-dom";

import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { MoneyCell } from "@/components/service-kit/MoneyCell";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { usePayments } from "./api";
import { LedgerFilters, useLedgerFilters } from "./components/LedgerFilters";

export function PaymentsPage() {
  const { filters, set } = useLedgerFilters();
  const query = usePayments(filters);
  const rows = query.data?.pages.flatMap((page) => page.data ?? []) ?? [];
  const kindSuffix = filters.kind === "PLATFORM" ? "" : "?kind=TENANT_CUSTOMER";
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Payments</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Payments received against invoices. Record a manual payment from the invoice page.</p>
      </header>
      <LedgerFilters filters={filters} set={set} />
      {query.isError ? <ConsoleApiErrorPanel error={query.error} onRetry={() => void query.refetch()} title="Unable to load payments" /> : null}
      {!query.isError ? (
        <section className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--color-surface-50)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              <tr>
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2">Invoice</th>
                <th className="px-3 py-2">Method</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2 text-right">Refunded</th>
                <th className="px-3 py-2">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((payment) => (
                <tr key={payment.id} data-testid="payment-row">
                  <td className="px-3 py-2">{payment.tenant ? <TenantChip tenantId={payment.tenant.id} name={payment.tenant.name} /> : payment.tenantId}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {payment.invoice ? (
                      <Link to={`/revenue/billing/invoices/${payment.invoice.id}${kindSuffix}`} className="underline">
                        {payment.invoice.invoiceNumber}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">{payment.method ?? "—"}</td>
                  <td className="px-3 py-2 text-xs font-semibold">{payment.status}</td>
                  <td className="px-3 py-2 text-right">
                    <MoneyCell amount={payment.amount} currency={payment.currency} />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <MoneyCell amount={payment.refundedAmount} currency={payment.currency} />
                  </td>
                  <td className="px-3 py-2 text-xs">{new Date(payment.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {!query.isLoading && rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-sm text-[var(--color-text-muted)]">
                    No payments match these filters.
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
    </div>
  );
}
