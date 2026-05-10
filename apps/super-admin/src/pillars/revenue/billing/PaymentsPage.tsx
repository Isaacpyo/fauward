import { DenseTable, EmptyState } from "@fauward/internal-ui";
import { useQuery } from "@tanstack/react-query";
import { fetchPayments, type Payment } from "./api";

export function PaymentsPage() {
  const query = useQuery({ queryKey: ["billing-payments"], queryFn: fetchPayments });
  return <DenseTable<Payment> data={query.data ?? []} loading={query.isLoading} getRowId={(row) => row.id} emptyState={<EmptyState title="No payments" message="No payment ledger rows found." />} columns={[
    { id: "id", header: "Payment", cell: (row) => row.id },
    { id: "invoice", header: "Invoice", cell: (row) => row.invoiceId ?? "-" },
    { id: "status", header: "Status", cell: (row) => row.status },
    { id: "amount", header: "Amount", align: "right", cell: (row) => `${row.currency} ${row.amount}` },
    { id: "stripe", header: "Stripe", cell: (row) => row.gatewayRef ? <a className="text-[var(--fauward-navy)]" href={`https://dashboard.stripe.com/payments/${row.gatewayRef}`}>Open</a> : "-" }
  ]} />;
}
