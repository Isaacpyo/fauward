import { internalApi } from "@/lib/internal-api";

export type Customer360 = {
  tenant: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
    plan: string;
    status: string;
    defaultCurrency: string;
    internalNotes: string | null;
    users: Array<{ id: string; email: string; name: string | null; role: string; lastLoginAt: string | null }>;
    shipments: Array<{ id: string; status: string; createdAt: string; trackingNumber?: string | null }>;
    invoices: Array<{ id: string; invoiceNumber: string; status: string; total: string; currency: string; createdAt: string }>;
    notificationLogs: Array<{ id: string; event: string; status: string; createdAt: string }>;
    auditLogs: Array<{ id: string; action: string; resourceType: string | null; timestamp: string }>;
  };
  metrics: { shipmentCount: number; invoiceCount: number; userCount: number; notificationCount: number; supportTicketCount: number; healthScore: number };
  usage: { shipmentStatusBreakdown: Array<{ status: string; _count: { id: number } }> };
  tickets: unknown[];
  health: { score: number; factors: string[] };
};

export async function fetchCustomer360(tenantId: string) {
  const response = await internalApi.get<Customer360>(`/customer/360/${tenantId}`);
  return response.data;
}

export async function updateCustomerNotes(tenantId: string, internalNotes: string) {
  const response = await internalApi.patch<{ internalNotes: string }>(`/customer/360/${tenantId}/notes`, { internalNotes, reason: "Customer 360 note update" });
  return response.data;
}
