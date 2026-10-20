import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { ErrorState } from "@/components/shared/ErrorState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { useTenantStore } from "@/stores/useTenantStore";
import type { ShipmentState } from "@/types/domain";

type CrmCustomerDetail = {
  id: string;
  name: string;
  billingEmail: string | null;
  companyNumber: string | null;
  taxNumber: string | null;
  paymentTerms: number;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  users: Array<{ id: string; email: string; firstName: string | null; lastName: string | null; role: string }>;
  shipments: Array<{ id: string; trackingNumber: string; status: ShipmentState; createdAt: string }>;
  invoices: Array<{ id: string; invoiceNumber: string; status: string; total: string | number; createdAt: string }>;
};

/** One business customer from `GET /v1/crm/customers/:id`. */
export function CrmDetailPage() {
  const { id = "" } = useParams();
  const tenant = useTenantStore((state) => state.tenant);
  const query = useQuery({
    queryKey: ["crm-customer", id],
    queryFn: async () => (await api.get<CrmCustomerDetail>(`/v1/crm/customers/${id}`)).data,
    enabled: Boolean(id),
    retry: false
  });

  if (query.isError) {
    return (
      <PageShell title="Customer">
        <ErrorState title="Customer could not be loaded" description={apiErrorMessage(query.error, "The CRM service returned an error.")} onRetry={() => void query.refetch()} />
      </PageShell>
    );
  }
  if (!query.data) {
    return (
      <PageShell title="Customer">
        <Skeleton className="h-48 w-full" />
      </PageShell>
    );
  }

  const customer = query.data;
  return (
    <PageShell title={customer.name} description={customer.billingEmail ?? "No billing email"}>
      <div className="space-y-4">
        <section className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-gray-500">Status</p>
            <p className="font-medium text-gray-900">{customer.isActive ? "Active" : "Inactive"}</p>
          </div>
          <div>
            <p className="text-gray-500">Payment terms</p>
            <p className="font-medium text-gray-900">{customer.paymentTerms} days</p>
          </div>
          <div>
            <p className="text-gray-500">Company number</p>
            <p className="font-medium text-gray-900">{customer.companyNumber ?? "Not set"}</p>
          </div>
          <div>
            <p className="text-gray-500">Customer since</p>
            <p className="font-medium text-gray-900">{formatDateTime(customer.createdAt, tenant)}</p>
          </div>
          {customer.notes ? <p className="sm:col-span-2 lg:col-span-4 text-gray-700">{customer.notes}</p> : null}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-base font-semibold text-gray-900">Contacts</h2>
          {customer.users.length === 0 ? (
            <p className="mt-2 text-sm text-gray-600">No contacts linked to this customer.</p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100 text-sm">
              {customer.users.map((user) => (
                <li key={user.id} className="flex justify-between py-2">
                  <span>{[user.firstName, user.lastName].filter(Boolean).join(" ") || user.email}</span>
                  <span className="text-gray-500">{user.email}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-base font-semibold text-gray-900">Recent shipments</h2>
          {customer.shipments.length === 0 ? (
            <p className="mt-2 text-sm text-gray-600">No shipments for this customer yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100 text-sm">
              {customer.shipments.map((shipment) => (
                <li key={shipment.id} className="flex items-center justify-between py-2">
                  <Link to={`/shipments/${shipment.id}`} className="font-mono text-[var(--tenant-primary)] hover:underline">
                    {shipment.trackingNumber}
                  </Link>
                  <StatusBadge status={shipment.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="text-base font-semibold text-gray-900">Invoices</h2>
          {customer.invoices.length === 0 ? (
            <p className="mt-2 text-sm text-gray-600">No invoices for this customer yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-gray-100 text-sm">
              {customer.invoices.map((invoice) => (
                <li key={invoice.id} className="flex items-center justify-between py-2">
                  <Link to={`/finance/${invoice.id}`} className="font-medium text-[var(--tenant-primary)] hover:underline">
                    {invoice.invoiceNumber}
                  </Link>
                  <span className="text-gray-600">
                    {invoice.status} · {formatCurrency(Number(invoice.total), tenant)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageShell>
  );
}
