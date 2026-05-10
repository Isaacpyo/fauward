import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { getAccessToken, hasDevTestSession } from "@/lib/auth";
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

type TenantBillingPayload = {
  plan?: string;
  status?: string;
  maxStaff?: number;
};

type UsagePayload = {
  shipments?: {
    used?: number;
    limit?: number;
  };
};

type InvoicePayload = {
  id: string;
  createdAt?: string;
  invoiceNumber?: string;
  total?: number | string;
  status?: BillingSummary["invoices"][number]["status"];
};

function normalizePlan(plan?: string): BillingSummary["plan"] {
  const normalized = plan?.toLowerCase();
  if (normalized === "pro" || normalized === "enterprise") return normalized;
  return "starter";
}

function planAmount(plan: BillingSummary["plan"]) {
  if (plan === "enterprise") return 249;
  if (plan === "pro") return 79;
  return 29;
}

function paymentStatus(status?: string): BillingSummary["paymentStatus"] {
  if (status === "SUSPENDED") return "suspended";
  if (status === "CANCELLED") return "failed";
  return "active";
}

async function fetchBillingSummary(): Promise<BillingSummary> {
  const [tenantResult, usageResult, invoicesResult] = await Promise.allSettled([
    api.get<TenantBillingPayload>("/v1/tenant/me"),
    api.get<UsagePayload>("/v1/tenant/usage"),
    api.get<{ data: InvoicePayload[] }>("/v1/finance/invoices")
  ]);

  const tenant = tenantResult.status === "fulfilled" ? tenantResult.value.data : {};
  const usage = usageResult.status === "fulfilled" ? usageResult.value.data : {};
  const invoices = invoicesResult.status === "fulfilled" ? invoicesResult.value.data.data : [];
  const plan = normalizePlan(tenant.plan);
  const apiLimit = plan === "enterprise" ? 500_000 : plan === "pro" ? 50_000 : 0;

  return {
    plan,
    cycle: "monthly",
    amount: planAmount(plan),
    renewalDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
    trialDaysRemaining: tenant.status === "TRIALING" ? 14 : undefined,
    paymentStatus: paymentStatus(tenant.status),
    usage: {
      shipments: {
        used: usage.shipments?.used ?? 0,
        limit: usage.shipments?.limit ?? fallbackBillingSummary.usage.shipments.limit
      },
      staff: {
        used: 1,
        limit: tenant.maxStaff ?? fallbackBillingSummary.usage.staff.limit
      },
      apiCalls: {
        used: 0,
        limit: apiLimit
      }
    },
    invoices: invoices.map((invoice) => ({
      id: invoice.id,
      date: invoice.createdAt ?? new Date().toISOString(),
      invoiceNumber: invoice.invoiceNumber ?? invoice.id,
      amount: Number(invoice.total ?? 0),
      status: invoice.status ?? "SENT",
      pdfUrl: "#"
    }))
  };
}

export function useBilling() {
  const canFetchBilling = Boolean(getAccessToken()) && !hasDevTestSession();
  const query = useQuery({
    queryKey: ["billing-summary"],
    queryFn: fetchBillingSummary,
    staleTime: 30_000,
    retry: 1,
    enabled: canFetchBilling
  });

  return {
    ...query,
    summary: query.data ?? fallbackBillingSummary
  };
}
