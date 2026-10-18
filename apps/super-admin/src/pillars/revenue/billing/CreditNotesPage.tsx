import { Link } from "react-router-dom";

import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { MoneyCell } from "@/components/service-kit/MoneyCell";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { useCreditNotes } from "./api";
import { LedgerFilters, useLedgerFilters } from "./components/LedgerFilters";

export function CreditNotesPage() {
  const { filters, set } = useLedgerFilters();
  const query = useCreditNotes(filters);
  const rows = query.data?.pages.flatMap((page) => page.data ?? []) ?? [];
  const kindSuffix = filters.kind === "PLATFORM" ? "" : "?kind=TENANT_CUSTOMER";
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Credit notes</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Credits reduce an invoice&apos;s balance and can never exceed it. Issue one from the invoice page.</p>
      </header>
      <LedgerFilters filters={filters} set={set} />
      {query.isError ? <ConsoleApiErrorPanel error={query.error} onRetry={() => void query.refetch()} title="Unable to load credit notes" /> : null}
      {!query.isError ? (
        <section className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--color-surface-50)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              <tr>
                <th className="px-3 py-2">Credit note</th>
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2">Invoice</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((credit) => (
                <tr key={credit.id}>
                  <td className="px-3 py-2 font-mono text-xs">{credit.creditNumber}</td>
                  <td className="px-3 py-2">{credit.tenant ? <TenantChip tenantId={credit.tenant.id} name={credit.tenant.name} /> : credit.tenantId}</td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {credit.invoice ? (
                      <Link to={`/revenue/billing/invoices/${credit.invoice.id}${kindSuffix}`} className="underline">
                        {credit.invoice.invoiceNumber}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">{credit.reason ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <MoneyCell amount={credit.amount} currency={credit.currency} />
                  </td>
                  <td className="px-3 py-2 text-xs">{new Date(credit.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {!query.isLoading && rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-[var(--color-text-muted)]">
                    No credit notes match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
