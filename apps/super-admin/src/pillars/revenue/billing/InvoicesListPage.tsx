import { DenseTable, EmptyState } from "@fauward/internal-ui";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { fetchInvoices, type Invoice } from "./api";

export function InvoicesListPage() {
  const navigate = useNavigate();
  const query = useQuery({ queryKey: ["billing-invoices"], queryFn: fetchInvoices });
  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Invoices</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Cross-tenant invoice list with status and Stripe references.</p>
        </div>
        <button type="button" onClick={() => navigate("/revenue/billing/invoices/create")} className="rounded-md bg-[var(--fauward-navy)] px-4 py-2 text-sm font-semibold text-white">Create invoice</button>
      </header>
      <DenseTable<Invoice>
        data={query.data ?? []}
        loading={query.isLoading}
        getRowId={(row) => row.id}
        onRowClick={(row) => navigate(`/revenue/billing/invoices/${row.id}`)}
        emptyState={<EmptyState title="No invoices" message="No invoices matched the current filters." />}
        columns={[
          { id: "number", header: "Invoice", cell: (row) => row.invoiceNumber },
          { id: "tenant", header: "Tenant", cell: (row) => row.tenant?.name ?? row.tenantId },
          { id: "status", header: "Status", cell: (row) => row.status },
          { id: "total", header: "Total", align: "right", cell: (row) => `${row.currency} ${row.total}` },
          { id: "created", header: "Created", cell: (row) => new Date(row.createdAt).toLocaleDateString() }
        ]}
      />
    </div>
  );
}
