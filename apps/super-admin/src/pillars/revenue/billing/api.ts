import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { consoleApi as internalApi } from "@/lib/console-api";

// revenue.billing (WP-1.5): PLATFORM = Fauward billing tenants (writable); TENANT_CUSTOMER = a tenant's own customer
// ledger, read-only in the console for support investigations (D4). Amounts are decimal strings with their currency.

export type LedgerKind = "PLATFORM" | "TENANT_CUSTOMER";
type TenantRef = { id: string; name: string; slug: string };

export type LineItem = { description: string; quantity: number; unitAmount: string };

export type Invoice = {
  id: string;
  tenantId: string;
  tenant?: TenantRef;
  kind: LedgerKind;
  invoiceNumber: string;
  lineItems: LineItem[];
  subtotal: string;
  taxRate: string;
  taxAmount: string;
  total: string;
  currency: string;
  status: string;
  dueDate: string | null;
  sentAt: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  notes: string | null;
  createdAt: string;
  paid?: string;
  credited?: string;
  outstanding?: string;
};

export type Payment = { id: string; tenantId: string; tenant?: TenantRef; kind: LedgerKind; invoiceId: string | null; invoice?: { id: string; invoiceNumber: string } | null; amount: string; currency: string; method: string | null; status: string; gatewayRef: string | null; refundedAmount: string; createdAt: string; refunds?: Refund[] };
export type RefundApproval = { id: string; requestedBy: string; approvedBy: string | null; status: string; reason: string; decidedAt: string | null };
export type Refund = {
  id: string;
  tenantId: string;
  paymentId: string;
  amount: string;
  currency: string | null;
  reason: string | null;
  status: string;
  gatewayRef: string | null;
  failureReason: string | null;
  initiatedBy: string | null;
  createdAt: string;
  tenant?: TenantRef;
  payment?: Payment;
  approvals?: RefundApproval[];
};
export type RefundResult = { refund: Refund; path: "stripe" | "approval"; approvalRequired: boolean; replayed?: boolean };
export type CreditNote = { id: string; tenantId: string; tenant?: TenantRef; invoiceId: string | null; invoice?: { id: string; invoiceNumber: string } | null; creditNumber: string; amount: string; currency: string; reason: string | null; createdAt: string };
export type InvoiceDetail = Invoice & { readOnly: boolean; payments: Array<Payment & { refunds: Refund[] }>; creditNotes: CreditNote[] };

type Page<T> = { kind: LedgerKind; readOnly: boolean; data: T[]; nextCursor: string | null };
export type ListFilters = { kind: LedgerKind; tenantId?: string; status?: string; from?: string; to?: string };

export const BILLING_KEY = ["revenue.billing"] as const;

function clean(filters: ListFilters) {
  return Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined && value !== ""));
}

function useLedgerList<T>(resource: "invoices" | "payments" | "credit-notes", filters: ListFilters) {
  const params = clean(filters);
  return useInfiniteQuery({
    queryKey: [...BILLING_KEY, resource, params],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => (await internalApi.get<Page<T>>(`/billing/${resource}`, { params: { ...params, limit: 50, ...(pageParam ? { cursor: pageParam } : {}) } })).data,
    getNextPageParam: (last) => last.nextCursor ?? undefined
  });
}

export const useInvoices = (filters: ListFilters) => useLedgerList<Invoice>("invoices", filters);
export const usePayments = (filters: ListFilters) => useLedgerList<Payment>("payments", filters);
export const useCreditNotes = (filters: ListFilters) => useLedgerList<CreditNote>("credit-notes", filters);

export function useInvoice(id: string, kind: LedgerKind) {
  return useQuery({
    queryKey: [...BILLING_KEY, "invoice", id, kind],
    queryFn: async () => (await internalApi.get<InvoiceDetail>(`/billing/invoices/${encodeURIComponent(id)}`, { params: { kind } })).data,
    enabled: id.length > 0
  });
}

function useInvalidateBilling() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: BILLING_KEY });
}

export type CreateInvoiceInput = { tenantId: string; currency?: string; dueDate?: string; lineItems: LineItem[]; taxRate?: string; notes?: string; send: boolean; reason?: string };

export function useCreateInvoice() {
  const invalidate = useInvalidateBilling();
  return useMutation({ mutationFn: async (input: CreateInvoiceInput) => (await internalApi.post<Invoice>("/billing/invoices", input, { idempotent: true })).data, onSuccess: invalidate });
}

export function useVoidInvoice() {
  const invalidate = useInvalidateBilling();
  return useMutation({ mutationFn: async ({ id, reason }: { id: string; reason: string }) => (await internalApi.post<Invoice>(`/billing/invoices/${encodeURIComponent(id)}/void`, { reason }, { idempotent: true })).data, onSuccess: invalidate });
}

export function useRecordPayment() {
  const invalidate = useInvalidateBilling();
  return useMutation({
    mutationFn: async (input: { invoiceId: string; amount: string; method: string; reference?: string; reason: string }) =>
      (await internalApi.post<{ payment: Payment; invoiceStatus: string; liftedSuspension: boolean }>("/billing/payments", input, { idempotent: true })).data,
    onSuccess: invalidate
  });
}

export function useCreateCreditNote() {
  const invalidate = useInvalidateBilling();
  return useMutation({ mutationFn: async (input: { invoiceId: string; amount: string; reason: string }) => (await internalApi.post<CreditNote>("/billing/credit-notes", input, { idempotent: true })).data, onSuccess: invalidate });
}

export async function fetchRefunds() {
  const response = await internalApi.get<{ data: Refund[] }>("/billing/refunds");
  return response.data.data;
}

/** Amount is a major-unit decimal string in the payment's currency (e.g. "12.34"). Dangerous: fresh MFA + reason. */
export async function createRefund(input: { paymentId: string; amount: string; reason: string }) {
  const response = await internalApi.post<RefundResult>("/billing/refunds", input, { idempotent: true });
  return response.data;
}

export async function decideRefund(id: string, decision: "approve" | "reject", reason: string) {
  const response = await internalApi.post<{ refund: Refund }>(`/billing/refunds/${encodeURIComponent(id)}/${decision}`, { reason }, { idempotent: true });
  return response.data.refund;
}
