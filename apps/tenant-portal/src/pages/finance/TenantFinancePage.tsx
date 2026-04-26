import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CircleDollarSign,
  ClipboardCheck,
  CreditCard,
  Lock,
  ReceiptText,
  RefreshCcw,
  TrendingDown,
  TrendingUp,
  Wallet
} from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { EmptyState } from "@/components/shared/EmptyState";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { Tabs, TabsContent } from "@/components/ui/Tabs";
import { PageShell } from "@/layouts/PageShell";
import { getAccessToken } from "@/lib/auth";
import { api } from "@/lib/api";
import { formatPlanLabel, hasPlanAccess, type Plan } from "@/lib/plan-features";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";
import { useAppStore } from "@/stores/useAppStore";
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

type FinanceRangePreset = "today" | "7d" | "30d" | "90d";

type DateRange = {
  dateFrom: string;
  dateTo: string;
};

type FinancePeriodSummary = FinanceSummary & {
  collectionRate: number;
};

type CustomerFinanceRow = {
  customer: string;
  invoices: number;
  totalInvoiced: number;
  collected: number;
  outstanding: number;
  overdue: number;
  collectionRate: number;
};

type BadgeVariant = "neutral" | "success" | "warning" | "error" | "info" | "primary" | "danger" | "default";

const financeTabs = [
  { value: "overview", label: "Overview", minimumPlan: "starter" },
  { value: "invoices", label: "Invoices", minimumPlan: "starter" },
  { value: "payments", label: "Payments", minimumPlan: "starter" },
  { value: "collections", label: "COD & Collections", minimumPlan: "pro" },
  { value: "refunds", label: "Refunds", minimumPlan: "pro" },
  { value: "settlements", label: "Settlements", minimumPlan: "pro" },
  { value: "reconciliation", label: "Reconciliation", minimumPlan: "enterprise" }
] as const satisfies Array<{ value: string; label: string; minimumPlan: Plan }>;

const financeRangePresets: Array<{ label: string; value: FinanceRangePreset }> = [
  { label: "Today", value: "today" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" }
];

const chartGridColor = "#E5E7EB";
const chartTickColor = "#6B7280";

const invoiceStatusBars = [
  { key: "draft", label: "Draft", color: "#9CA3AF" },
  { key: "sent", label: "Sent", color: "var(--tenant-primary)" },
  { key: "partiallyPaid", label: "Partial", color: "var(--color-warning)" },
  { key: "paid", label: "Paid", color: "var(--color-success)" },
  { key: "overdue", label: "Overdue", color: "var(--color-error)" },
  { key: "void", label: "Void", color: "#6B7280" }
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

function financePresetRange(preset: FinanceRangePreset): DateRange {
  const now = new Date();
  const dateTo = now.toISOString().slice(0, 10);
  const start = new Date(now);
  if (preset === "today") start.setDate(now.getDate());
  if (preset === "7d") start.setDate(now.getDate() - 7);
  if (preset === "30d") start.setDate(now.getDate() - 30);
  if (preset === "90d") start.setDate(now.getDate() - 90);
  return { dateFrom: start.toISOString().slice(0, 10), dateTo };
}

function dateRangeStart(range: DateRange) {
  return new Date(`${range.dateFrom}T00:00:00.000Z`).getTime();
}

function dateRangeEnd(range: DateRange) {
  return new Date(`${range.dateTo}T23:59:59.999Z`).getTime();
}

function getPreviousFinanceRange(range: DateRange): DateRange {
  const start = dateRangeStart(range);
  const end = dateRangeEnd(range);
  const duration = end - start;
  const previousEnd = new Date(start - 1);
  const previousStart = new Date(previousEnd.getTime() - duration);

  return {
    dateFrom: previousStart.toISOString().slice(0, 10),
    dateTo: previousEnd.toISOString().slice(0, 10)
  };
}

function isWithinRange(value: string | null | undefined, range: DateRange) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return timestamp >= dateRangeStart(range) && timestamp <= dateRangeEnd(range);
}

function enumerateDateKeys(range: DateRange) {
  const dates: string[] = [];
  const cursor = new Date(`${range.dateFrom}T00:00:00.000Z`);
  const end = new Date(`${range.dateTo}T00:00:00.000Z`);

  while (cursor.getTime() <= end.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates;
}

function formatChartDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function buildPaidAmountMap(payments: FinancePayment[]) {
  const map = new Map<string, number>();
  for (const payment of payments) {
    if (payment.status !== "COMPLETED") continue;
    const invoiceId = payment.invoiceId ?? payment.invoice?.id;
    if (!invoiceId) continue;
    map.set(invoiceId, (map.get(invoiceId) ?? 0) + Number(payment.amount ?? 0));
  }
  return map;
}

function getInvoicePaidAmount(invoice: FinanceInvoice, paidAmountByInvoiceId: Map<string, number>) {
  const paid = paidAmountByInvoiceId.get(invoice.id);
  if (paid !== undefined) return paid;
  return invoice.status === "PAID" ? Number(invoice.total ?? 0) : 0;
}

function calculateFinancePeriodSummary(
  invoices: FinanceInvoice[],
  payments: FinancePayment[],
  now = new Date()
): FinancePeriodSummary {
  const paidAmountByInvoiceId = buildPaidAmountMap(payments);
  const totalInvoiced = invoices.reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0);
  const collected = payments
    .filter((payment) => payment.status === "COMPLETED")
    .reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0);

  const outstanding = invoices.reduce((sum, invoice) => {
    if (invoice.status === "VOID") return sum;
    const paid = getInvoicePaidAmount(invoice, paidAmountByInvoiceId);
    return sum + Math.max(Number(invoice.total ?? 0) - paid, 0);
  }, 0);

  const overdue = invoices.reduce((sum, invoice) => {
    if (!invoice.dueDate || invoice.status === "PAID" || invoice.status === "VOID") return sum;
    if (new Date(invoice.dueDate).getTime() >= now.getTime()) return sum;
    const paid = getInvoicePaidAmount(invoice, paidAmountByInvoiceId);
    return sum + Math.max(Number(invoice.total ?? 0) - paid, 0);
  }, 0);

  return {
    totalInvoiced,
    collected,
    outstanding,
    overdue,
    collectionRate: totalInvoiced > 0 ? (collected / totalInvoiced) * 100 : 0
  };
}

function changePct(value: number, previousValue: number) {
  if (previousValue === 0) return value === 0 ? 0 : 100;
  return ((value - previousValue) / previousValue) * 100;
}

function formatDelta(value: number) {
  const rounded = Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(1);
  return `${value >= 0 ? "+" : ""}${rounded}%`;
}

function buildDailyFinanceData(range: DateRange, invoices: FinanceInvoice[], payments: FinancePayment[]) {
  const rows = new Map(
    enumerateDateKeys(range).map((date) => [
      date,
      {
        date,
        label: formatChartDate(date),
        invoiced: 0,
        collected: 0
      }
    ])
  );

  for (const invoice of invoices) {
    const key = invoice.createdAt.slice(0, 10);
    const row = rows.get(key);
    if (row) row.invoiced += Number(invoice.total ?? 0);
  }

  for (const payment of payments) {
    if (payment.status !== "COMPLETED") continue;
    const key = payment.createdAt.slice(0, 10);
    const row = rows.get(key);
    if (row) row.collected += Number(payment.amount ?? 0);
  }

  return [...rows.values()];
}

function buildCollectionRateSeries(dailyData: Array<{ date: string; label: string; invoiced: number; collected: number }>) {
  let invoiced = 0;
  let collected = 0;
  return dailyData.map((row) => {
    invoiced += row.invoiced;
    collected += row.collected;
    return {
      ...row,
      collectionRate: invoiced > 0 ? (collected / invoiced) * 100 : 0
    };
  });
}

function buildInvoiceStatusBreakdown(invoices: FinanceInvoice[]) {
  return [
    {
      name: "Invoices",
      draft: invoices.filter((invoice) => invoice.status === "DRAFT").reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0),
      sent: invoices.filter((invoice) => invoice.status === "SENT").reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0),
      partiallyPaid: invoices.filter((invoice) => invoice.status === "PARTIALLY_PAID").reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0),
      paid: invoices.filter((invoice) => invoice.status === "PAID").reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0),
      overdue: invoices.filter((invoice) => invoice.status === "OVERDUE").reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0),
      void: invoices.filter((invoice) => invoice.status === "VOID").reduce((sum, invoice) => sum + Number(invoice.total ?? 0), 0)
    }
  ];
}

function customerName(invoice: FinanceInvoice) {
  return invoice.organisation?.name ?? invoice.customerId ?? "Unknown customer";
}

function buildTopCustomerRows(invoices: FinanceInvoice[], payments: FinancePayment[]): CustomerFinanceRow[] {
  const paidAmountByInvoiceId = buildPaidAmountMap(payments);
  const groups = new Map<string, CustomerFinanceRow>();
  const now = Date.now();

  for (const invoice of invoices) {
    const customer = customerName(invoice);
    const row = groups.get(customer) ?? {
      customer,
      invoices: 0,
      totalInvoiced: 0,
      collected: 0,
      outstanding: 0,
      overdue: 0,
      collectionRate: 0
    };
    const total = Number(invoice.total ?? 0);
    const paid = getInvoicePaidAmount(invoice, paidAmountByInvoiceId);
    const outstanding = invoice.status === "VOID" ? 0 : Math.max(total - paid, 0);

    row.invoices += 1;
    row.totalInvoiced += total;
    row.collected += paid;
    row.outstanding += outstanding;
    if (invoice.dueDate && invoice.status !== "PAID" && invoice.status !== "VOID" && new Date(invoice.dueDate).getTime() < now) {
      row.overdue += outstanding;
    }
    row.collectionRate = row.totalInvoiced > 0 ? (row.collected / row.totalInvoiced) * 100 : 0;
    groups.set(customer, row);
  }

  return [...groups.values()].sort((a, b) => b.totalInvoiced - a.totalInvoiced).slice(0, 8);
}

function buildPaymentMethodData(payments: FinancePayment[]) {
  const map = new Map<string, number>();
  for (const payment of payments) {
    if (payment.status !== "COMPLETED") continue;
    const method = payment.method ?? "UNSPECIFIED";
    map.set(method, (map.get(method) ?? 0) + Number(payment.amount ?? 0));
  }
  return [...map.entries()]
    .map(([method, amount]) => ({
      method: method.replaceAll("_", " "),
      amount
    }))
    .sort((a, b) => b.amount - a.amount);
}

function collectionHealthVariant(value: number): BadgeVariant {
  if (value >= 90) return "success";
  if (value >= 70) return "warning";
  return "error";
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

function FinanceChartCard({
  title,
  description,
  className,
  children
}: {
  title: string;
  description?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("rounded-xl border border-gray-200 bg-white p-4", className)}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-gray-900 font-semibold">{title}</h2>
          {description ? <p className="mt-1 text-sm text-gray-500">{description}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

function FinanceKpiCard({
  label,
  value,
  formatter,
  changePct: delta,
  positiveIsGood = true,
  icon
}: {
  label: string;
  value: number;
  formatter: (value: number) => string;
  changePct: number;
  positiveIsGood?: boolean;
  icon: ReactNode;
}) {
  const favorable = positiveIsGood ? delta >= 0 : delta <= 0;
  const TrendIcon = delta >= 0 ? TrendingUp : TrendingDown;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 xl:col-span-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-[0.18em]">{label}</p>
          <p className="mt-3 text-3xl font-bold text-gray-900">
            <AnimatedNumber value={value} formatter={formatter} />
          </p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--tenant-primary-light)] text-[var(--tenant-primary)]">
          {icon}
        </div>
      </div>
      <p
        className={cn(
          "mt-4 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
          favorable
            ? "bg-[var(--color-success-light)] text-[var(--color-success)]"
            : "bg-[var(--color-error-light)] text-[var(--color-error)]"
        )}
      >
        <TrendIcon size={13} />
        {formatDelta(delta)} vs previous period
      </p>
    </div>
  );
}

function LockedFinancePanel({ minimumPlan, feature }: { minimumPlan: Plan; feature: string }) {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-6 py-8">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-amber-100 p-2 text-amber-700">
          <Lock size={18} />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
            {formatPlanLabel(minimumPlan)} finance feature
          </p>
          <h3 className="mt-2 text-lg font-semibold text-amber-950">{feature} requires an upgrade</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-amber-900">
            Starter includes core invoices and payments. Upgrade to {formatPlanLabel(minimumPlan)} or higher to unlock this finance workflow.
          </p>
          <Button asChild className="mt-4">
            <Link to="/settings?tab=billing">Upgrade plan</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export function TenantFinancePage() {
  const user = useAppStore((state) => state.user);
  const tenant = useTenantStore((state) => state.tenant);
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get("tab") ?? "overview";
  const initialFinanceRange = financePresetRange("30d");
  const [financePreset, setFinancePreset] = useState<FinanceRangePreset>("30d");
  const [financeRange, setFinanceRange] = useState<DateRange>(initialFinanceRange);
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
  const previousFinanceRange = useMemo(() => getPreviousFinanceRange(financeRange), [financeRange]);
  const financePeriodInvoices = useMemo(
    () => invoices.filter((invoice) => isWithinRange(invoice.createdAt, financeRange)),
    [financeRange, invoices]
  );
  const financePeriodPayments = useMemo(
    () => payments.filter((payment) => isWithinRange(payment.createdAt, financeRange)),
    [financeRange, payments]
  );
  const previousFinanceInvoices = useMemo(
    () => invoices.filter((invoice) => isWithinRange(invoice.createdAt, previousFinanceRange)),
    [invoices, previousFinanceRange]
  );
  const previousFinancePayments = useMemo(
    () => payments.filter((payment) => isWithinRange(payment.createdAt, previousFinanceRange)),
    [payments, previousFinanceRange]
  );
  const financePeriodSummary = useMemo(
    () => calculateFinancePeriodSummary(financePeriodInvoices, financePeriodPayments),
    [financePeriodInvoices, financePeriodPayments]
  );
  const previousFinanceSummary = useMemo(
    () => calculateFinancePeriodSummary(previousFinanceInvoices, previousFinancePayments),
    [previousFinanceInvoices, previousFinancePayments]
  );
  const financeDailyData = useMemo(
    () => buildDailyFinanceData(financeRange, financePeriodInvoices, financePeriodPayments),
    [financePeriodInvoices, financePeriodPayments, financeRange]
  );
  const collectionRateSeries = useMemo(() => buildCollectionRateSeries(financeDailyData), [financeDailyData]);
  const invoiceStatusBreakdown = useMemo(
    () => buildInvoiceStatusBreakdown(financePeriodInvoices),
    [financePeriodInvoices]
  );
  const topCustomerRows = useMemo(
    () => buildTopCustomerRows(financePeriodInvoices, financePeriodPayments),
    [financePeriodInvoices, financePeriodPayments]
  );
  const periodPaymentMethodData = useMemo(
    () => buildPaymentMethodData(financePeriodPayments),
    [financePeriodPayments]
  );
  const hasFinanceVolume = financeDailyData.some((entry) => entry.invoiced > 0 || entry.collected > 0);
  const hasStatusBreakdown = invoiceStatusBreakdown.some((entry) =>
    invoiceStatusBars.some((bar) => Number(entry[bar.key as keyof typeof entry]) > 0)
  );
  const hasCollectionRate = collectionRateSeries.some((entry) => entry.collectionRate > 0);
  const hasPaymentMethods = periodPaymentMethodData.some((entry) => entry.amount > 0);

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

  const tabItems = financeTabs.map((tab) => {
    const locked = !hasPlanAccess(user?.plan, tab.minimumPlan);
    return {
      value: tab.value,
      label: (
        <span className="inline-flex items-center justify-center gap-1.5">
          {tab.label}
          {locked ? <Lock size={12} aria-hidden /> : null}
          {locked ? <span className="text-[10px] font-bold uppercase">{formatPlanLabel(tab.minimumPlan)}</span> : null}
        </span>
      )
    };
  });

  function renderPlanGatedTab(tab: (typeof financeTabs)[number], content: ReactNode) {
    if (!hasPlanAccess(user?.plan, tab.minimumPlan)) {
      return <LockedFinancePanel minimumPlan={tab.minimumPlan} feature={tab.label} />;
    }
    return content;
  }

  function handleFinancePresetChange(preset: FinanceRangePreset) {
    setFinancePreset(preset);
    setFinanceRange(financePresetRange(preset));
  }

  return (
    <PageShell
      title="Finance"
      description="Tenant finance workspace for invoices, payments, collections, refunds, settlements, and reconciliation."
      actions={
        <div className="flex flex-wrap gap-2">
          {hasPlanAccess(user?.plan, "pro") ? (
            <Button asChild variant="secondary">
              <Link to="/reports">Export finance report</Link>
            </Button>
          ) : (
            <Button asChild variant="secondary">
              <Link to="/settings?tab=billing">Export finance report - Pro</Link>
            </Button>
          )}
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
            items={tabItems}
          >
            <TabsContent value="overview">
              {isLoading ? (
                <SectionLoader />
              ) : (
                <div className="space-y-6">
                  <div className="flex flex-wrap items-center gap-2">
                    {financeRangePresets.map((preset) => (
                      <Button
                        key={preset.value}
                        variant="secondary"
                        size="sm"
                        className={cn(
                          financePreset === preset.value && "border-[var(--tenant-primary)] text-[var(--tenant-primary)]"
                        )}
                        onClick={() => handleFinancePresetChange(preset.value)}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-12">
                    <FinanceKpiCard
                      label="Total invoiced"
                      value={financePeriodSummary.totalInvoiced}
                      formatter={(value) => formatCurrency(value, tenant)}
                      changePct={changePct(financePeriodSummary.totalInvoiced, previousFinanceSummary.totalInvoiced)}
                      icon={<ReceiptText size={18} />}
                    />
                    <FinanceKpiCard
                      label="Collected"
                      value={financePeriodSummary.collected}
                      formatter={(value) => formatCurrency(value, tenant)}
                      changePct={changePct(financePeriodSummary.collected, previousFinanceSummary.collected)}
                      icon={<Wallet size={18} />}
                    />
                    <FinanceKpiCard
                      label="Outstanding"
                      value={financePeriodSummary.outstanding}
                      formatter={(value) => formatCurrency(value, tenant)}
                      changePct={changePct(financePeriodSummary.outstanding, previousFinanceSummary.outstanding)}
                      positiveIsGood={false}
                      icon={<CircleDollarSign size={18} />}
                    />
                    <FinanceKpiCard
                      label="Overdue"
                      value={financePeriodSummary.overdue}
                      formatter={(value) => formatCurrency(value, tenant)}
                      changePct={changePct(financePeriodSummary.overdue, previousFinanceSummary.overdue)}
                      positiveIsGood={false}
                      icon={<CreditCard size={18} />}
                    />

                    <FinanceChartCard
                      title="Revenue Flow"
                      description="Daily invoice value and collected payments in the selected range."
                      className="sm:col-span-2 xl:col-span-8"
                    >
                      {hasFinanceVolume ? (
                        <div className="h-72">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={financeDailyData} margin={{ left: -10, right: 8, top: 8, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                              <XAxis dataKey="label" tick={{ fontSize: 11, fill: chartTickColor }} tickLine={false} axisLine={false} />
                              <YAxis
                                tick={{ fontSize: 11, fill: chartTickColor }}
                                tickFormatter={(value) => formatCurrency(Number(value), tenant)}
                                tickLine={false}
                                axisLine={false}
                              />
                              <Tooltip
                                cursor={{ fill: "rgba(17, 24, 39, 0.04)" }}
                                formatter={(value, name) => [
                                  formatCurrency(Number(value), tenant),
                                  name === "invoiced" ? "Invoiced" : "Collected"
                                ]}
                              />
                              <Bar dataKey="invoiced" fill="var(--tenant-primary)" radius={[6, 6, 0, 0]} />
                              <Bar dataKey="collected" fill="var(--color-success)" radius={[6, 6, 0, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <EmptyState icon={ReceiptText} title="No finance volume yet" description="Invoice and payment volume appears once finance events are recorded in this range." />
                      )}
                    </FinanceChartCard>

                    <FinanceChartCard
                      title="Payment Mix"
                      description="Completed payment value by collection method."
                      className="sm:col-span-2 xl:col-span-4"
                    >
                      {hasPaymentMethods ? (
                        <div className="h-72">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={periodPaymentMethodData} layout="vertical" margin={{ left: 16, right: 12, top: 8, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} horizontal={false} />
                              <XAxis
                                type="number"
                                tick={{ fontSize: 11, fill: chartTickColor }}
                                tickFormatter={(value) => formatCurrency(Number(value), tenant)}
                                tickLine={false}
                                axisLine={false}
                              />
                              <YAxis
                                type="category"
                                dataKey="method"
                                width={96}
                                tick={{ fontSize: 11, fill: chartTickColor }}
                                tickLine={false}
                                axisLine={false}
                              />
                              <Tooltip formatter={(value) => [formatCurrency(Number(value), tenant), "Collected"]} />
                              <Bar dataKey="amount" fill="var(--tenant-primary)" radius={[0, 6, 6, 0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <EmptyState icon={Wallet} title="No payments yet" description="Payment method mix appears once completed payments are received." />
                      )}
                    </FinanceChartCard>

                    <FinanceChartCard
                      title="Invoice Status"
                      description="Stacked invoice value by billing state."
                      className="sm:col-span-2 xl:col-span-6"
                    >
                      {hasStatusBreakdown ? (
                        <div className="space-y-4">
                          <div className="h-72">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={invoiceStatusBreakdown} layout="vertical" margin={{ left: 12, right: 12, top: 8, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} horizontal={false} />
                                <XAxis
                                  type="number"
                                  tick={{ fontSize: 11, fill: chartTickColor }}
                                  tickFormatter={(value) => formatCurrency(Number(value), tenant)}
                                  tickLine={false}
                                  axisLine={false}
                                />
                                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: chartTickColor }} tickLine={false} axisLine={false} />
                                <Tooltip
                                  formatter={(value, name) => [
                                    formatCurrency(Number(value), tenant),
                                    invoiceStatusBars.find((bar) => bar.key === String(name))?.label ?? String(name)
                                  ]}
                                />
                                {invoiceStatusBars.map((bar) => (
                                  <Bar key={bar.key} dataKey={bar.key} stackId="statuses" fill={bar.color} radius={bar.key === "void" ? [0, 6, 6, 0] : 0} />
                                ))}
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {invoiceStatusBars.map((bar) => (
                              <span key={bar.key} className="inline-flex items-center gap-2 text-xs text-gray-600">
                                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: bar.color }} />
                                {bar.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <EmptyState icon={CreditCard} title="No invoice status data" description="Invoice status value appears once invoices exist in this range." />
                      )}
                    </FinanceChartCard>

                    <FinanceChartCard
                      title="Collection Rate"
                      description="Cumulative collected value as a share of invoiced value."
                      className="sm:col-span-2 xl:col-span-6"
                    >
                      {hasCollectionRate ? (
                        <div className="h-72">
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={collectionRateSeries} margin={{ left: -10, right: 12, top: 8, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                              <XAxis dataKey="label" tick={{ fontSize: 11, fill: chartTickColor }} tickLine={false} axisLine={false} />
                              <YAxis
                                domain={[0, 100]}
                                tick={{ fontSize: 11, fill: chartTickColor }}
                                tickFormatter={(value) => `${value}%`}
                                tickLine={false}
                                axisLine={false}
                              />
                              <Tooltip
                                formatter={(value) => [`${Number(value).toFixed(1)}%`, "Collection rate"]}
                              />
                              <Line
                                type="monotone"
                                dataKey="collectionRate"
                                stroke="var(--color-success)"
                                strokeWidth={3}
                                dot={false}
                                activeDot={{ r: 5, strokeWidth: 0, fill: "var(--color-success)" }}
                              />
                            </LineChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <EmptyState icon={ClipboardCheck} title="No collection signal yet" description="Collection rate appears once invoices and payments overlap in this range." />
                      )}
                    </FinanceChartCard>

                    <FinanceChartCard
                      title="Top Customers"
                      description="Highest-value customers by invoiced amount and collection health."
                      className="sm:col-span-2 xl:col-span-12"
                    >
                      {topCustomerRows.length > 0 ? (
                        <Table columns={["Customer", "Invoices", "Invoiced", "Collected", "Outstanding", "Overdue", "Collection"]} className="border-0">
                          {topCustomerRows.map((row) => (
                            <TableRow key={row.customer}>
                              <TableCell className="font-semibold text-gray-900">{row.customer}</TableCell>
                              <TableCell>{row.invoices.toLocaleString()}</TableCell>
                              <TableCell>{formatCurrency(row.totalInvoiced, tenant)}</TableCell>
                              <TableCell>{formatCurrency(row.collected, tenant)}</TableCell>
                              <TableCell>{formatCurrency(row.outstanding, tenant)}</TableCell>
                              <TableCell>{formatCurrency(row.overdue, tenant)}</TableCell>
                              <TableCell>
                                <Badge variant={collectionHealthVariant(row.collectionRate)}>
                                  {row.collectionRate.toFixed(1)}%
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ))}
                        </Table>
                      ) : (
                        <EmptyState icon={ReceiptText} title="No customer finance data" description="Customer finance performance appears once invoices are created in this range." />
                      )}
                    </FinanceChartCard>
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
              {renderPlanGatedTab(financeTabs[3], isLoading ? (
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
              ))}
            </TabsContent>

            <TabsContent value="refunds">
              {renderPlanGatedTab(financeTabs[4], isLoading ? (
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
              ))}
            </TabsContent>

            <TabsContent value="settlements">
              {renderPlanGatedTab(financeTabs[5], isLoading ? (
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
              ))}
            </TabsContent>

            <TabsContent value="reconciliation">
              {renderPlanGatedTab(financeTabs[6], isLoading ? (
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
              ))}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </PageShell>
  );
}
