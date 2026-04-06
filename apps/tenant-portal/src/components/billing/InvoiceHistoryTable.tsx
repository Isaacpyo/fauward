import { useMemo, useState } from "react";

import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { useTenantStore } from "@/stores/useTenantStore";
import type { BillingSummary } from "@/types/billing";

type InvoiceHistoryTableProps = {
  summary: BillingSummary;
};

export function InvoiceHistoryTable({ summary }: InvoiceHistoryTableProps) {
  const tenant = useTenantStore((state) => state.tenant);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState("5");

  const total = summary.invoices.length;
  const pages = Math.max(1, Math.ceil(total / Number(perPage)));
  const paginated = useMemo(
    () =>
      summary.invoices.slice((page - 1) * Number(perPage), page * Number(perPage)),
    [page, perPage, summary.invoices]
  );

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-base font-semibold text-gray-900">Invoice history</h3>
      <Table columns={["Date", "Invoice #", "Amount", "Status", "PDF"]}>
        {paginated.map((invoice) => (
          <TableRow key={invoice.id}>
            <TableCell>{formatDateTime(invoice.date, tenant)}</TableCell>
            <TableCell className="font-mono">{invoice.invoiceNumber}</TableCell>
            <TableCell>{formatCurrency(invoice.amount, tenant)}</TableCell>
            <TableCell>
              <StatusBadge status={invoice.status} />
            </TableCell>
            <TableCell>
              <a href={invoice.pdfUrl} className="text-[var(--tenant-primary)] hover:underline">
                Download
              </a>
            </TableCell>
          </TableRow>
        ))}
      </Table>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-600">Page {page} of {pages}</p>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
            Previous
          </Button>
          <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage((current) => current + 1)}>
            Next
          </Button>
          <Select
            value={perPage}
            onValueChange={(value) => {
              setPerPage(value);
              setPage(1);
            }}
            options={[
              { label: "5 / page", value: "5" },
              { label: "10 / page", value: "10" },
              { label: "20 / page", value: "20" }
            ]}
            className="w-[120px]"
          />
        </div>
      </div>
    </section>
  );
}
