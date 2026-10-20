import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Users } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { Tabs, TabsContent } from "@/components/ui/Tabs";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { useTenantStore } from "@/stores/useTenantStore";

type CrmCustomer = {
  id: string;
  name: string;
  shipmentCount: number;
  totalRevenue: number;
  billingEmail: string | null;
  isActive: boolean;
};

type CrmLead = {
  id: string;
  company: string | null;
  contactName: string | null;
  email: string | null;
  stage: string;
  source: string | null;
  createdAt: string;
};

function Loading() {
  return (
    <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  );
}

/** Business customers (`Organisation`) and sales leads from `/v1/crm/*` (crm.routes.ts). */
export function CrmPage() {
  const tenant = useTenantStore((state) => state.tenant);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("customers");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [billingEmail, setBillingEmail] = useState("");

  const customersQuery = useQuery({
    queryKey: ["crm-customers"],
    queryFn: async () => (await api.get<{ data: CrmCustomer[] }>("/v1/crm/customers")).data.data
  });
  const leadsQuery = useQuery({
    queryKey: ["crm-leads"],
    queryFn: async () => (await api.get<{ data: CrmLead[] }>("/v1/crm/leads", { params: { limit: 100 } })).data.data,
    enabled: tab === "leads"
  });

  const createCustomer = useMutation({
    mutationFn: async () => (await api.post<{ id: string }>("/v1/crm/customers", { name: name.trim(), billingEmail: billingEmail.trim() || undefined })).data,
    onSuccess: async (customer) => {
      setCreateOpen(false);
      setName("");
      setBillingEmail("");
      await queryClient.invalidateQueries({ queryKey: ["crm-customers"] });
      navigate(`/crm/${customer.id}`);
    }
  });

  return (
    <PageShell
      title="CRM"
      description="Business customers and sales leads."
      actions={<Button onClick={() => setCreateOpen(true)}>Add customer</Button>}
    >
      <Tabs
        value={tab}
        onValueChange={setTab}
        items={[
          { value: "customers", label: "Customers" },
          { value: "leads", label: "Leads" }
        ]}
      >
        <TabsContent value="customers">
          {customersQuery.isError ? (
            <ErrorState title="Customers could not be loaded" description={apiErrorMessage(customersQuery.error, "The CRM service returned an error.")} onRetry={() => void customersQuery.refetch()} />
          ) : !customersQuery.data ? (
            <Loading />
          ) : customersQuery.data.length === 0 ? (
            <EmptyState icon={Building2} title="No customers yet" description="Add a business customer to invoice it and link its shipments." ctaLabel="Add customer" onCtaClick={() => setCreateOpen(true)} />
          ) : (
            <Table columns={["Customer", "Billing email", "Shipments", "Invoiced", "Status"]}>
              {customersQuery.data.map((customer) => (
                <TableRow key={customer.id} onClick={() => navigate(`/crm/${customer.id}`)}>
                  <TableCell className="font-medium text-gray-900">
                    <Link to={`/crm/${customer.id}`} onClick={(event) => event.stopPropagation()} className="hover:underline">
                      {customer.name}
                    </Link>
                  </TableCell>
                  <TableCell>{customer.billingEmail ?? "Not set"}</TableCell>
                  <TableCell>{customer.shipmentCount}</TableCell>
                  <TableCell>{formatCurrency(customer.totalRevenue, tenant)}</TableCell>
                  <TableCell>
                    <Badge variant={customer.isActive ? "success" : "neutral"}>{customer.isActive ? "Active" : "Inactive"}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </Table>
          )}
        </TabsContent>

        <TabsContent value="leads">
          {leadsQuery.isError ? (
            <ErrorState title="Leads could not be loaded" description={apiErrorMessage(leadsQuery.error, "The CRM service returned an error.")} onRetry={() => void leadsQuery.refetch()} />
          ) : !leadsQuery.data ? (
            <Loading />
          ) : leadsQuery.data.length === 0 ? (
            <EmptyState icon={Users} title="No leads yet" description="Leads created through the CRM API appear here." />
          ) : (
            <Table columns={["Company", "Contact", "Email", "Stage", "Source", "Created"]}>
              {leadsQuery.data.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell className="font-medium text-gray-900">{lead.company ?? "Not set"}</TableCell>
                  <TableCell>{lead.contactName ?? "Not set"}</TableCell>
                  <TableCell>{lead.email ?? "Not set"}</TableCell>
                  <TableCell>
                    <Badge variant="neutral">{lead.stage}</Badge>
                  </TableCell>
                  <TableCell>{lead.source ?? "Not set"}</TableCell>
                  <TableCell>{formatDateTime(lead.createdAt, tenant)}</TableCell>
                </TableRow>
              ))}
            </Table>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={createOpen} onOpenChange={setCreateOpen} title="Add customer" description="Create a business customer you can invoice and link shipments to.">
        <div className="space-y-3">
          <label className="block text-sm font-medium text-gray-700">
            Name
            <Input className="mt-1" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="block text-sm font-medium text-gray-700">
            Billing email
            <Input className="mt-1" type="email" value={billingEmail} onChange={(event) => setBillingEmail(event.target.value)} />
          </label>
          {createCustomer.isError ? (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {apiErrorMessage(createCustomer.error, "The customer was not created.")}
            </p>
          ) : null}
          <Button className="w-full" onClick={() => createCustomer.mutate()} disabled={!name.trim() || createCustomer.isPending} loading={createCustomer.isPending}>
            Create customer
          </Button>
        </div>
      </Dialog>
    </PageShell>
  );
}
