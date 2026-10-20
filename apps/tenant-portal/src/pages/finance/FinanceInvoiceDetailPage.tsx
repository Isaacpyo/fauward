import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { ErrorState } from "@/components/shared/ErrorState";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { formatDateTime } from "@/lib/utils";
import { useTenantStore } from "@/stores/useTenantStore";

type Money = string | number;

type InvoiceDetail = {
  id: string;
  invoiceNumber: string;
  status: string;
  currency: string;
  subtotal: Money;
  taxAmount: Money;
  discountAmount?: Money | null;
  total: Money;
  dueDate: string | null;
  sentAt: string | null;
  paidAt: string | null;
  createdAt: string;
  notes: string | null;
  lineItems: Array<{ description?: string; quantity?: number; unitPrice?: Money; total?: Money }> | null;
  organisation: { id: string; name: string } | null;
  shipment: { id: string; trackingNumber: string } | null;
  payments: Array<{ id: string; amount: Money; currency: string; method: string | null; status: string; createdAt: string }>;
  creditNotes: Array<{ id: string; creditNumber: string; amount: Money; currency: string; reason: string | null; createdAt: string }>;
};

function money(amount: Money | null | undefined, currency: string) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(amount ?? 0));
}

/** One of this workspace's customer invoices (`GET /v1/finance/invoices/:id`, TENANT_CUSTOMER ledger). */
export function FinanceInvoiceDetailPage() {
  const { id = "" } = useParams();
  const tenant = useTenantStore((state) => state.tenant);
  const query = useQuery({
    queryKey: ["finance-invoice", id],
    queryFn: async () => (await api.get<InvoiceDetail>(`/v1/finance/invoices/${id}`)).data,
    enabled: Boolean(id),
    retry: false
  });

  if (query.isError) {
    return (
      <PageShell title="Invoice">
        <ErrorState title="Invoice could not be loaded" description={apiErrorMessage(query.error, "The finance service returned an error.")} onRetry={() => void query.refetch()} />
      </PageShell>
    );
  }
  if (!query.data) {
    return (
      <PageShell title="Invoice">
        <Skeleton className="h-48 w-full" />
      </PageShell>
    );
  }

  const invoice = query.data;
  const lineItems = Array.isArray(invoice.lineItems) ? invoice.lineItems : [];
  return (
    <PageShell
      title={`Invoice ${invoice.invoiceNumber}`}
      description={invoice.organisation ? `Billed to ${invoice.organisation.name}` : "No customer linked"}
    >
      <div className="space-y-4">
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Badge variant="neutral">{invoice.status}</Badge>
            <p className="text-lg font-semibold text-gray-900">{money(invoice.total, invoice.currency)}</p>
          </div>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-gray-500">Issued</dt>
              <dd>{formatDateTime(invoice.createdAt, tenant)}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Due</dt>
              <dd>{invoice.dueDate ? formatDateTime(invoice.dueDate, tenant) : "No due date"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Paid</dt>
              <dd>{invoice.paidAt ? formatDateTime(invoice.paidAt, tenant) : "Not paid"}</dd>
            </div>
          </dl>
          {invoice.shipment ? (
            <p className="mt-3 text-sm">
              Shipment{" "}
              <Link to={`/shipments/${invoice.shipment.id}`} className="font-mono text-[var(--tenant-primary)] hover:underline">
                {invoice.shipment.trackingNumber}
              </Link>
            </p>
          ) : null}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4 text-sm">
          <h2 className="text-base font-semibold text-gray-900">Lines</h2>
          {lineItems.length === 0 ? (
            <p className="mt-2 text-gray-600">No line items.</p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100">
              {lineItems.map((line, index) => (
                <li key={index} className="flex justify-between py-2">
                  <span>
                    {line.description ?? "Line"} {line.quantity ? `× ${line.quantity}` : ""}
                  </span>
                  <span>{money(line.total ?? line.unitPrice, invoice.currency)}</span>
                </li>
              ))}
            </ul>
          )}
          <dl className="mt-3 space-y-1 border-t border-gray-100 pt-3">
            <div className="flex justify-between">
              <dt>Subtotal</dt>
              <dd>{money(invoice.subtotal, invoice.currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Tax</dt>
              <dd>{money(invoice.taxAmount, invoice.currency)}</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>Total</dt>
              <dd>{money(invoice.total, invoice.currency)}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4 text-sm">
          <h2 className="text-base font-semibold text-gray-900">Payments and credits</h2>
          {invoice.payments.length === 0 && invoice.creditNotes.length === 0 ? (
            <p className="mt-2 text-gray-600">No payments or credit notes recorded.</p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100">
              {invoice.payments.map((payment) => (
                <li key={payment.id} className="flex justify-between py-2">
                  <span>
                    Payment · {payment.method ?? "Unknown method"} · {payment.status}
                  </span>
                  <span>
                    {money(payment.amount, payment.currency)} · {formatDateTime(payment.createdAt, tenant)}
                  </span>
                </li>
              ))}
              {invoice.creditNotes.map((credit) => (
                <li key={credit.id} className="flex justify-between py-2">
                  <span>
                    Credit note {credit.creditNumber} {credit.reason ? `· ${credit.reason}` : ""}
                  </span>
                  <span>{money(credit.amount, credit.currency)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageShell>
  );
}
