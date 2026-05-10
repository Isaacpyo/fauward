import { internalApi } from "@/lib/internal-api";

export type Invoice = {
  id: string;
  tenantId: string;
  tenant?: { id: string; name: string; slug: string };
  invoiceNumber: string;
  lineItems: unknown;
  subtotal: string;
  taxAmount: string;
  total: string;
  currency: string;
  status: string;
  dueDate: string | null;
  createdAt: string;
  payments?: Payment[];
  creditNotes?: CreditNote[];
};

export type Payment = { id: string; tenantId: string; invoiceId: string | null; amount: string; currency: string; status: string; gatewayRef: string | null; refundedAmount: string; createdAt: string };
export type Refund = { id: string; tenantId: string; paymentId: string; amount: string; reason: string | null; status: string; gatewayRef: string | null; createdAt: string };
export type CreditNote = { id: string; tenantId: string; invoiceId: string | null; creditNumber: string; amount: string; currency: string; reason: string | null; createdAt: string };

export async function fetchInvoices() {
  const response = await internalApi.get<{ data: Invoice[] }>("/billing/invoices");
  return response.data.data;
}

export async function fetchInvoice(id: string) {
  const response = await internalApi.get<Invoice>(`/billing/invoices/${id}`);
  return response.data;
}

export async function createInvoice(input: { tenantId: string; dueDate?: string; currency: string; lineItems: Array<{ description: string; quantity: number; unitAmount: number }>; taxRate: number; notes?: string; reason: string }) {
  const response = await internalApi.post<Invoice>("/billing/invoices", input);
  return response.data;
}

export async function fetchPayments() {
  const response = await internalApi.get<{ data: Payment[] }>("/billing/payments");
  return response.data.data;
}

export async function fetchRefunds() {
  const response = await internalApi.get<{ data: Refund[] }>("/billing/refunds");
  return response.data.data;
}

export async function createRefund(input: { paymentId: string; amount: number; reason: string }) {
  const response = await internalApi.post<Refund>("/billing/refunds", input);
  return response.data;
}

export async function fetchCreditNotes() {
  const response = await internalApi.get<{ data: CreditNote[] }>("/billing/credit-notes");
  return response.data.data;
}

export async function createCreditNote(input: { tenantId: string; invoiceId?: string; amount: number; currency: string; reason: string }) {
  const response = await internalApi.post<CreditNote>("/billing/credit-notes", input);
  return response.data;
}
