import { useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleDollarSign, ClipboardCheck, CreditCard, ReceiptText, RefreshCcw, Wallet } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";

import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { Tabs, TabsContent } from "@/components/ui/Tabs";
import { PageShell } from "@/layouts/PageShell";
import { getAccessToken } from "@/lib/auth";
import { api } from "@/lib/api";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { useTenantStore } from "@/stores/useTenantStore";

type FinanceSummary = {
  totalInvoiced: number;
  collected: number;
  outstanding: number;
  overdue: number;
};

type FinanceInvoice = {
  id: string;
  invoiceNumber: string;
  total: number;
  currency: string;
  status: string;
  dueDate?: string | null;
  sentAt?: string | null;
  paidAt?: string | null;
  createdAt: string;
  customerId?: string | null;
  organisation?: {
    id: string;
    name: string;
  } | null;
};

type FinancePayment = {
  id: string;
  invoiceId?: string | null;
  amount: number;
  currency: string;
  status: string;
  method?: string | null;
  gatewayRef?: string | null;
  createdAt: string;
  invoice?: {
    id: string;
    invoiceNumber: string;
    total: number;
    status: string;
    customerId?: string | null;
  } | null;
};

type CreditNote = {
  id: string;
  creditNumber: string;
  amount: number;
  currency: string;
  reason?: string | null;
  createdAt: string;
  invoice?: {
    id: string;
    invoiceNumber: string;
  } | null;
  organisation?: {
    id: string;
    name: string;
  } | null;
};

const financeTabs = [
  { value: "overview", label: "Overview" },
  { value: "invoices", label: "Invoices" },
  { value: "payments", label: "Payments" },
  { value: "collections", label: "COD & Collections" },
  { value: "refunds", label: "Refunds" },
  { value: "settlements", label: "Settlements" },
  { value: "reconciliation", label: "Reconciliation" }
];

const fallbackSummary: FinanceSummary = {
  totalInvoiced: 124000,
  collected: 91350,
  outstanding: 32650,
  overdue: 8200
};

const fallbackInvoices: FinanceInvoice[] = [
  {
    id: "inv-1",
    invoiceNumber: "FWD-INV-2026-0001",
    total: 4820,
    currency: "GBP",
    status: "PAID",
    dueDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    paidAt: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
    sentAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 6).toISOString(),
    organisation: { id: "org-1", name: "Acme Retail" }
  },
  {
    id: "inv-2",
    invoiceNumber: "FWD-INV-2026-0002",
    total: 3120,
    currency: "GBP",
    status: "OVERDUE",
    dueDate: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    sentAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 11).toISOString(),
    organisation: { id: "org-2", name: "Northline Logistics" }
  },
  {
    id: "inv-3",
    invoiceNumber: "FWD-INV-2026-0003",
    total: 1980,
    currency: "GBP",
    status: "PARTIALLY_PAID",
    dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 2).toISOString(),
    sentAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    organisation: { id: "org-3", name: "PortBridge" }
  }
];

const fallbackPayments: FinancePayment[] = [
  {
    id: "pay-1",
    invoiceId: "inv-1",
    amount: 4820,
    currency: "GBP",
    status: "COMPLETED",
    method: "CARD",
    gatewayRef: "pi_001",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
    invoice: { id: "inv-1", invoiceNumber: "FWD-INV-2026-0001", total: 4820, status: "PAID" }
  },
  {
    id: "pay-2",
    invoiceId: "inv-3",
    amount: 980,
    currency: "GBP",
    status: "COMPLETED",
    method: "COD",
    gatewayRef: "cod_980",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 28).toISOString(),
    invoice: { id: "inv-3", invoiceNumber: "FWD-INV-2026-0003", total: 1980, status: "PARTIALLY_PAID" }
  },
  {
    id: "pay-3",
    invoiceId: "inv-4",
    amount: 1240,
    currency: "GBP",
    status: "COMPLETED",
    method: "BANK_TRANSFER",
    gatewayRef: "tr_004",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 52).toISOString(),
    invoice: { id: "inv-4", invoiceNumber: "FWD-INV-2026-0004", total: 1240, status: "PAID" }
  }
];

const fallbackCreditNotes: CreditNote[] = [
  {
    id: "cr-1",
    creditNumber: "FWD-CR-2026-0001",
    amount: 240,
    currency: "GBP",
    reason: "Damaged parcel refund",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(),
    invoice: { id: "inv-2", invoiceNumber: "FWD-INV-2026-0002" },
    organisation: { id: "org-2", name: "Northline Logistics" }
  }
];

function hasApiToken() {
  return Boolean(getAccessToken());
}

async function fetchJson<T>(path: string) {
  const response = await api.get<T>(path);
  return response.data;
}

function getErrorStatus(error: unknown) {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return null;
  }
  return ((error as { response?: { status?: number } }).response?.status ?? null);
}

function statusBadgeVariant(status: string): "success" | "warning" | "error" | "info" | "neutral" {
  if (status === "PAID" || status === "COMPLETED" || status === "MATCHED") return "success";
  if (status === "OVERDUE" || status === "UNRECONCILED") return "error";
  if (status === "PARTIALLY_PAID" || status === "PARTIAL") return "warning";
  if (status === "SENT" || status === "IN_REVIEW") return "info";
  return "neutral";
}

function SectionLoader() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  );
}

function MetricTile({
  label,
  value,
  hint,
  icon
}: {
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
          <p className="mt-2 text-xs text-gray-500">{hint}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-gray-700">{icon}</div>
      </div>
    </div>
  );
}

export function TenantFinancePage() {
  const tenant = useTenantStore((state) => state.tenant);
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get("tab") ?? "overview";
  const hasToken = hasApiToken();

  const summaryQuery = useQuery({
    queryKey: ["finance-summary"],
    queryFn: () => fetchJson<FinanceSummary>("/v1/finance/summary"),
    enabled: hasToken,
    retry: false,
    refetchInterval: 60_000
  });

  const invoicesQuery = useQuery({
    queryKey: ["finance-invoices"],
    queryFn: async () => (await fetchJson<{ data: FinanceInvoice[] }>("/v1/finance/invoices")).data,
    enabled: hasToken,
    retry: false,
    refetchInterval: 60_000
  });

  const paymentsQuery = useQuery({
    queryKey: ["finance-payments"],
    queryFn: async () => (await fetchJson<{ data: FinancePayment[] }>("/v1/finance/payments")).data,
    enabled: hasToken,
    retry: false,
    refetchInterval: 60_000
  });

  const creditNotesQuery = useQuery({
    queryKey: ["finance-credit-notes"],
    queryFn: async () => (await fetchJson<{ data: CreditNote[] }>("/v1/finance/credit-notes")).data,
    enabled: hasToken,
    retry: false,
    refetchInterval: 60_000
  });

  const financeUnavailable =
    getErrorStatus(summaryQuery.error) === 403 ||
    getErrorStatus(invoicesQuery.error) === 403 ||
    getErrorStatus(paymentsQuery.error) === 403 ||
    getErrorStatus(creditNotesQuery.error) === 403;

  const summary = summaryQuery.data ?? fallbackSummary;
  const invoices = invoicesQuery.data ?? fallbackInvoices;
  const payments = paymentsQuery.data ?? fallbackPayments;
  const creditNotes = creditNotesQuery.data ?? fallbackCreditNotes;

  const paidAmountByInvoiceId = useMemo(() => {
    const map = new Map<string, number>();
    for (const payment of payments) {
      if (!payment.invoiceId || payment.status !== "COMPLETED") continue;
      map.set(payment.invoiceId, (map.get(payment.invoiceId) ?? 0) + Number(payment.amount ?? 0));
    }
    return map;
  }, [payments]);

  const codPayments = useMemo(
    () => payments.filter((payment) => ["COD", "CASH", "CASH_ON_DELIVERY"].includes((payment.method ?? "").toUpperCase())),
    [payments]
  );

  const collectionRate = useMemo(() => {
    if (summary.totalInvoiced <= 0) return 0;
    return (summary.collected / summary.totalInvoiced) * 100;
  }, [summary]);

  const paymentMethodBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const payment of payments) {
      const method = payment.method ?? "UNSPECIFIED";
      map.set(method, (map.get(method) ?? 0) + Number(payment.amount ?? 0));
    }
    return [...map.entries()]
      .map(([method, amount]) => ({ method, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [payments]);

  const settlementRows = useMemo(() => {
    const refundTotal = creditNotes.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
    const remitted = payments
      .filter((payment) => payment.status === "COMPLETED")
      .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);
    const pending = Math.max(summary.outstanding - refundTotal, 0);
    return [
      {
        id: "settlement-remitted",
        label: "Cleared receivables",
        amount: remitted,
        status: "SETTLED",
        description: "Completed inflows already captured against invoices."
      },
      {
        id: "settlement-pending",
        label: "Pending remittance",
        amount: pending,
        status: "IN_REVIEW",
        description: "Open invoice value still awaiting customer payment or remittance."
      },
      {
        id: "settlement-refunds",
        label: "Credits and refunds",
        amount: refundTotal,
        status: "ADJUSTED",
        description: "Credit notes issued back against customer balances."
      }
    ];
  }, [creditNotes, payments, summary.outstanding]);

  const reconciliationRows = useMemo(() => {
    return invoices.map((invoice) => {
      const paidAmount = paidAmountByInvoiceId.get(invoice.id) ?? 0;
      const total = Number(invoice.total ?? 0);
      let status = "UNRECONCILED";
      if (paidAmount >= total && total > 0) status = "MATCHED";
      else if (paidAmount > 0) status = "PARTIAL";

      return {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        customer: invoice.organisation?.name ?? "Unknown customer",
        invoiceTotal: total,
        paidAmount,
        delta: total - paidAmount,
        status
      };
    });
  }, [invoices, paidAmountByInvoiceId]);

  const isLoading =
    hasToken &&
    (summaryQuery.isLoading || invoicesQuery.isLoading || paymentsQuery.isLoading || creditNotesQuery.isLoading);

  return (
    <PageShell
      title="Finance"
      description="Tenant finance workspace for invoices, payments, collections, refunds, settlements, and reconciliation."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link to="/reports">Export finance report</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/settings?tab=billing">Billing settings</Link>
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {!hasToken ? (
          <div className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Dev session detected. Finance uses sample data until a real tenant API session is available.
          </div>
        ) : null}

        {financeUnavailable ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-6 py-8">
            <h2 className="text-lg font-semibold text-amber-900">Finance module not enabled</h2>
            <p className="mt-2 text-sm text-amber-800">
              This tenant cannot access invoices, payments, and collections yet. Enable the finance module to unlock the full finance workspace.
            </p>
            <Button asChild className="mt-4">
              <Link to="/settings?tab=billing">Open billing settings</Link>
            </Button>
          </div>
        ) : (
          <Tabs
            value={currentTab}
            onValueChange={(tab) => setSearchParams({ tab })}
            items={financeTabs}
          >
            <TabsContent value="overview">
              {isLoading ? (
                <SectionLoader />
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <MetricTile
                      label="Total Invoiced"
                      value={formatCurrency(summary.totalInvoiced, tenant)}
                      hint="Gross invoice value raised for this tenant."
                      icon={<ReceiptText size={18} />}
                    />
                    <MetricTile
                      label="Collected"
                      value={formatCurrency(summary.collected, tenant)}
                      hint={`${collectionRate.toFixed(1)}% collection rate across raised invoices.`}
                      icon={<Wallet size={18} />}
                    />
                    <MetricTile
                      label="Outstanding"
                      value={formatCurrency(summary.outstanding, tenant)}
                      hint="Open balances still awaiting settlement."
                      icon={<CircleDollarSign size={18} />}
                    />
                    <MetricTile
                      label="Overdue"
                      value={formatCurrency(summary.overdue, tenant)}
                      hint="Invoices already past due date and needing follow-up."
                      icon={<CreditCard size={18} />}
                    />
                  </div>

                  <div className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-base font-semibold text-gray-900">Recent invoices</h3>
                        <Button asChild variant="secondary" size="sm">
                          <Link to="/finance?tab=invoices">See all invoices</Link>
                        </Button>
                      </div>
                      <div className="mt-4 space-y-3">
                        {invoices.slice(0, 5).map((invoice) => (
                          <Link
                            key={invoice.id}
                            to={`/finance/${invoice.id}`}
                            className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-3 transition hover:bg-gray-50"
                          >
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{invoice.invoiceNumber}</p>
                              <p className="text-xs text-gray-500">{invoice.organisation?.name ?? "Unknown customer"}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-gray-900">{formatCurrency(Number(invoice.total ?? 0), tenant)}</p>
                              <Badge variant={statusBadgeVariant(invoice.status)}>{invoice.status}</Badge>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-base font-semibold text-gray-900">Cash movement</h3>
                        <Badge variant="primary">{payments.length} payment records</Badge>
                      </div>
                      <div className="mt-4 space-y-3">
                        {paymentMethodBreakdown.slice(0, 4).map((entry) => (
                          <div key={entry.method} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-3">
                            <span className="text-sm font-medium text-gray-700">{entry.method.replaceAll("_", " ")}</span>
                            <span className="text-sm font-semibold text-gray-900">{formatCurrency(entry.amount, tenant)}</span>
                          </div>
                        ))}
                        {paymentMethodBreakdown.length === 0 ? (
                          <p className="text-sm text-gray-500">No payment activity yet.</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="invoices">
              {isLoading ? (
                <SectionLoader />
              ) : invoices.length === 0 ? (
                <EmptyState
                  icon={ReceiptText}
                  title="No invoices yet"
                  description="Invoice records will appear here once shipment billing starts."
                />
              ) : (
                <Table columns={["Invoice", "Customer", "Status", "Created", "Due", "Amount"]}>
                  {invoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell>
                        <Link to={`/finance/${invoice.id}`} className="font-semibold text-[var(--tenant-primary)] hover:underline">
                          {invoice.invoiceNumber}
                        </Link>
                      </TableCell>
                      <TableCell>{invoice.organisation?.name ?? "Unknown customer"}</TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(invoice.status)}>{invoice.status}</Badge>
                      </TableCell>
                      <TableCell>{formatDateTime(invoice.createdAt, tenant)}</TableCell>
                      <TableCell>{invoice.dueDate ? formatDateTime(invoice.dueDate, tenant) : "Not set"}</TableCell>
                      <TableCell>{formatCurrency(Number(invoice.total ?? 0), tenant)}</TableCell>
                    </TableRow>
                  ))}
                </Table>
              )}
            </TabsContent>

            <TabsContent value="payments">
              {isLoading ? (
                <SectionLoader />
              ) : payments.length === 0 ? (
                <EmptyState
                  icon={Wallet}
                  title="No payments yet"
                  description="Payment events and gateway settlements will appear once invoices are paid."
                />
              ) : (
                <Table columns={["Payment", "Invoice", "Method", "Status", "Gateway Ref", "Received", "Amount"]}>
                  {payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell className="font-mono">{payment.id.slice(0, 10)}</TableCell>
                      <TableCell>
                        {payment.invoice?.id ? (
                          <Link to={`/finance/${payment.invoice.id}`} className="font-semibold text-[var(--tenant-primary)] hover:underline">
                            {payment.invoice.invoiceNumber}
                          </Link>
                        ) : (
                          "Unlinked"
                        )}
                      </TableCell>
                      <TableCell>{payment.method ?? "Unspecified"}</TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(payment.status)}>{payment.status}</Badge>
                      </TableCell>
                      <TableCell>{payment.gatewayRef ?? "N/A"}</TableCell>
                      <TableCell>{formatDateTime(payment.createdAt, tenant)}</TableCell>
                      <TableCell>{formatCurrency(Number(payment.amount ?? 0), tenant)}</TableCell>
                    </TableRow>
                  ))}
                </Table>
              )}
            </TabsContent>

            <TabsContent value="collections">
              {isLoading ? (
                <SectionLoader />
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <MetricTile
                      label="Collection Rate"
                      value={`${collectionRate.toFixed(1)}%`}
                      hint="Collected value divided by total invoiced."
                      icon={<Wallet size={18} />}
                    />
                    <MetricTile
                      label="COD Captured"
                      value={formatCurrency(codPayments.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0), tenant)}
                      hint="Completed cash-on-delivery or cash-collected payments."
                      icon={<CircleDollarSign size={18} />}
                    />
                    <MetricTile
                      label="Outstanding Receivables"
                      value={formatCurrency(summary.outstanding, tenant)}
                      hint="Open balances pending collection."
                      icon={<CreditCard size={18} />}
                    />
                    <MetricTile
                      label="Overdue Exposure"
                      value={formatCurrency(summary.overdue, tenant)}
                      hint="Value already outside payment terms."
                      icon={<ReceiptText size={18} />}
                    />
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <h3 className="text-base font-semibold text-gray-900">Collection channels</h3>
                      <div className="mt-4 space-y-2">
                        {paymentMethodBreakdown.map((entry) => (
                          <div key={entry.method} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-3">
                            <span className="text-sm font-medium text-gray-700">{entry.method.replaceAll("_", " ")}</span>
                            <span className="text-sm font-semibold text-gray-900">{formatCurrency(entry.amount, tenant)}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-xl border border-gray-200 bg-white p-4">
                      <h3 className="text-base font-semibold text-gray-900">COD queue</h3>
                      {codPayments.length === 0 ? (
                        <p className="mt-4 text-sm text-gray-500">No COD payments recorded yet.</p>
                      ) : (
                        <div className="mt-4 space-y-2">
                          {codPayments.map((payment) => (
                            <div key={payment.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-3">
                              <div>
                                <p className="text-sm font-semibold text-gray-900">{payment.invoice?.invoiceNumber ?? payment.id}</p>
                                <p className="text-xs text-gray-500">{formatDateTime(payment.createdAt, tenant)}</p>
                              </div>
                              <span className="text-sm font-semibold text-gray-900">{formatCurrency(Number(payment.amount ?? 0), tenant)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="refunds">
              {isLoading ? (
                <SectionLoader />
              ) : creditNotes.length === 0 ? (
                <EmptyState
                  icon={RefreshCcw}
                  title="No refunds or credit notes"
                  description="Credit notes and refund adjustments will appear here once issued."
                />
              ) : (
                <Table columns={["Credit Note", "Invoice", "Customer", "Reason", "Created", "Amount"]}>
                  {creditNotes.map((creditNote) => (
                    <TableRow key={creditNote.id}>
                      <TableCell className="font-semibold text-gray-900">{creditNote.creditNumber}</TableCell>
                      <TableCell>
                        {creditNote.invoice?.id ? (
                          <Link to={`/finance/${creditNote.invoice.id}`} className="font-semibold text-[var(--tenant-primary)] hover:underline">
                            {creditNote.invoice.invoiceNumber}
                          </Link>
                        ) : (
                          "Unlinked"
                        )}
                      </TableCell>
                      <TableCell>{creditNote.organisation?.name ?? "Unknown customer"}</TableCell>
                      <TableCell>{creditNote.reason ?? "No reason provided"}</TableCell>
                      <TableCell>{formatDateTime(creditNote.createdAt, tenant)}</TableCell>
                      <TableCell>{formatCurrency(Number(creditNote.amount ?? 0), tenant)}</TableCell>
                    </TableRow>
                  ))}
                </Table>
              )}
            </TabsContent>

            <TabsContent value="settlements">
              {isLoading ? (
                <SectionLoader />
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-3">
                    {settlementRows.map((row) => (
                      <div key={row.id} className="rounded-xl border border-gray-200 bg-white p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-gray-900">{row.label}</p>
                          <Badge variant={statusBadgeVariant(row.status)}>{row.status}</Badge>
                        </div>
                        <p className="mt-3 text-2xl font-semibold text-gray-900">{formatCurrency(row.amount, tenant)}</p>
                        <p className="mt-2 text-xs text-gray-500">{row.description}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-base font-semibold text-gray-900">Settlement candidates</h3>
                      <Badge variant="primary">{payments.filter((payment) => payment.status === "COMPLETED").length} cleared payments</Badge>
                    </div>
                    <div className="mt-4 space-y-2">
                      {payments
                        .filter((payment) => payment.status === "COMPLETED")
                        .slice(0, 6)
                        .map((payment) => (
                          <div key={payment.id} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-3">
                            <div>
                              <p className="text-sm font-semibold text-gray-900">{payment.invoice?.invoiceNumber ?? payment.id}</p>
                              <p className="text-xs text-gray-500">{payment.method ?? "Unspecified"} settlement inflow</p>
                            </div>
                            <span className="text-sm font-semibold text-gray-900">{formatCurrency(Number(payment.amount ?? 0), tenant)}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="reconciliation">
              {isLoading ? (
                <SectionLoader />
              ) : reconciliationRows.length === 0 ? (
                <EmptyState
                  icon={ClipboardCheck}
                  title="Nothing to reconcile yet"
                  description="Reconciliation status appears once invoice and payment records exist."
                />
              ) : (
                <Table columns={["Invoice", "Customer", "Invoice Total", "Paid", "Delta", "Status"]}>
                  {reconciliationRows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Link to={`/finance/${row.id}`} className="font-semibold text-[var(--tenant-primary)] hover:underline">
                          {row.invoiceNumber}
                        </Link>
                      </TableCell>
                      <TableCell>{row.customer}</TableCell>
                      <TableCell>{formatCurrency(row.invoiceTotal, tenant)}</TableCell>
                      <TableCell>{formatCurrency(row.paidAmount, tenant)}</TableCell>
                      <TableCell className={row.delta > 0 ? "text-amber-700" : "text-emerald-700"}>
                        {formatCurrency(row.delta, tenant)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(row.status)}>{row.status}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </Table>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </PageShell>
  );
}
