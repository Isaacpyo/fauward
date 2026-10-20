import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";

import { StatusBadge } from "@/components/shared/StatusBadge";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { api } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";
import { useTenantStore } from "@/stores/useTenantStore";
import type { InvoiceState } from "@/types/domain";

const BADGE_STATES = new Set<string>(["DRAFT", "SENT", "PAID", "OVERDUE", "VOID"]);
const isBadgeState = (status: string): status is InvoiceState => BADGE_STATES.has(status);

export type FauwardInvoice = {
  id: string;
  invoiceNumber: string;
  status: string;
  currency: string;
  total: string;
  paid: string;
  credited: string;
  outstanding: string;
  dueDate: string | null;
  sentAt: string | null;
  createdAt: string;
};

export const FAUWARD_INVOICES_KEY = ["tenant", "me", "billing", "invoices"] as const;

/** Amounts are the API's decimal strings in the invoice's own currency (never the workspace default). */
function money(amount: string, currency: string) {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${amount} ${currency}`;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** "Invoices from Fauward" (D4): what Fauward billed this workspace — not the invoices it sends its own customers. */
export function FauwardInvoicesTable() {
  const tenant = useTenantStore((state) => state.tenant);
  const query = useQuery({
    queryKey: FAUWARD_INVOICES_KEY,
    queryFn: async () => (await api.get<{ invoices: FauwardInvoice[] }>("/v1/tenants/me/billing/invoices")).data.invoices
  });

  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="text-base font-semibold text-gray-900">Invoices from Fauward</h3>
      <p className="mb-3 text-sm text-gray-600">What Fauward has billed this workspace. Invoices you send your own customers are under Finance.</p>
      {query.isLoading ? <p className="text-sm text-gray-500">Loading invoices…</p> : null}
      {query.isError ? (
        <p className="text-sm text-red-700">
          {isAxiosError(query.error) && query.error.response?.status === 403 ? "Only workspace admins and finance users can see Fauward invoices." : "Invoices could not be loaded."}
        </p>
      ) : null}
      {query.data && query.data.length === 0 ? <p className="text-sm text-gray-600">Fauward has not invoiced this workspace yet.</p> : null}
      {query.data && query.data.length > 0 ? (
        <Table columns={["Date", "Invoice #", "Total", "Outstanding", "Due", "Status"]}>
          {query.data.map((invoice) => (
            <TableRow key={invoice.id}>
              <TableCell>{formatDateTime(invoice.sentAt ?? invoice.createdAt, tenant)}</TableCell>
              <TableCell className="font-mono">{invoice.invoiceNumber}</TableCell>
              <TableCell>{money(invoice.total, invoice.currency)}</TableCell>
              <TableCell>{money(invoice.outstanding, invoice.currency)}</TableCell>
              <TableCell>{invoice.dueDate ? formatDateTime(invoice.dueDate, tenant) : "—"}</TableCell>
              <TableCell>
                {isBadgeState(invoice.status) ? <StatusBadge status={invoice.status} /> : <span className="text-xs font-semibold text-gray-700">{invoice.status.replace("_", " ")}</span>}
              </TableCell>
            </TableRow>
          ))}
        </Table>
      ) : null}
    </section>
  );
}
