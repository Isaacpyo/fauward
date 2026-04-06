import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { BillingSummary } from "@/types/billing";

const fallbackBillingSummary: BillingSummary = {
  plan: "pro",
  cycle: "monthly",
  amount: 79,
  renewalDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 16).toISOString(),
  trialDaysRemaining: 5,
  paymentStatus: "active",
  usage: {
    shipments: { used: 142, limit: 200 },
    staff: { used: 3, limit: 5 },
    apiCalls: { used: 12450, limit: 50000 }
  },
  paymentMethod: {
    brand: "Visa",
    last4: "4242",
    expMonth: 12,
    expYear: 2027
  },
  invoices: Array.from({ length: 16 }).map((_, index) => ({
    id: `inv-${index + 1}`,
    date: new Date(Date.now() - index * 1000 * 60 * 60 * 24 * 28).toISOString(),
    invoiceNumber: `INV-${3000 + index}`,
    amount: index % 2 === 0 ? 79 : 29,
    status: index % 5 === 0 ? "OVERDUE" : "PAID",
    pdfUrl: "#"
  }))
};

async function fetchBillingSummary(): Promise<BillingSummary> {
  const response = await api.get<BillingSummary>("/billing/summary");
  const data = response.data as unknown;
  if (
    typeof data !== "object" ||
    data === null ||
    typeof (data as BillingSummary).plan !== "string" ||
    typeof (data as BillingSummary).usage !== "object"
  ) {
    throw new Error("Invalid billing payload");
  }
  return data as BillingSummary;
}

export function useBilling() {
  const query = useQuery({
    queryKey: ["billing-summary"],
    queryFn: fetchBillingSummary,
    staleTime: 30_000,
    retry: 1
  });

  return {
    ...query,
    summary: query.data ?? fallbackBillingSummary
  };
}
