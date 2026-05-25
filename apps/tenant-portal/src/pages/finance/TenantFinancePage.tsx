import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleDollarSign,
  ClipboardCheck,
  CreditCard,
  FilePlus2,
  Lock,
  Plus,
  ReceiptText,
  RefreshCcw,
  Trash2,
  TrendingDown,
  TrendingUp,
  Truck,
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
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { Tabs, TabsContent } from "@/components/ui/Tabs";
import { Textarea } from "@/components/ui/Textarea";
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
  codOutstanding?: number;
  codCollected?: number;
  payoutsMatchedPct?: number | null;
  payoutsUnmatchedCount?: number | null;
};

type CollectionsResponse = {
  outstandingCount: number;
  outstandingValue: number;
  collectedCount: number;
  collectedValue: number;
  byDriver: Array<{ driverId: string; name: string; outstandingValue: number; collectedValue: number }>;
  outstandingList: Array<{ shipmentId: string; trackingNumber: string | null; amount: number; currency: string; assignedDriverId: string | null }>;
};

type FinanceReturn = {
  id: string;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  shipmentId: string;
  trackingNumber: string | null;
  customer: string | null;
  organisation: string | null;
  itemsCount: number;
  itemsValue: number;
  currency: string | null;
  returnFee: number;
  feeCurrency: string;
  paymentStatus: string;
  refundedTotal: number;
  creditedTotal: number;
  invoiceNumber: string | null;
};

type GatewayPayout = {
  id: string;
  providerPayoutId: string;
  provider: string;
  arrivalDate: string;
  amount: number;
  currency: string;
  status: string;
  _count?: { lines: number };
};

type GatewayPayoutLine = {
  id: string;
  payoutId: string;
  providerTxnId: string;
  providerSourceId: string | null;
  amount: number;
  currency: string;
  type: string;
  matchedPaymentId: string | null;
  payout?: { providerPayoutId: string; arrivalDate: string };
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

type FinanceCustomer = {
  id: string;
  name: string;
  billingEmail?: string | null;
  isActive?: boolean;
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

type CreateInvoiceLineItem = {
  id: string;
  description: string;
  quantity: string;
  unitAmount: string;
  taxRate: string;
};

type CreateInvoiceForm = {
  documentTitle: string;
  documentSubtitle: string;
  templateAccentColor: string;
  logoUrl: string;
  payeeName: string;
  payeeAddress: string;
  payeeVatId: string;
  payerName: string;
  payerAddress: string;
  payerVatId: string;
  organisationId: string;
  customerId: string;
  shipmentId: string;
  currency: string;
  dueDate: string;
  paymentTerms: string;
  discountAmount: string;
  notes: string;
  paymentInstructions: string;
  footerText: string;
  lineItems: CreateInvoiceLineItem[];
};

type CreateInvoicePayloadLineItem = {
  description: string;
  quantity: number;
  unitAmount: number;
  taxRate: number;
  amount: number;
  taxAmount: number;
};

type CreateInvoicePayload = {
  organisationId?: string;
  customerId?: string;
  shipmentId?: string;
  currency: string;
  dueDate?: string;
  paymentTerms: number;
  notes?: string;
  lineItems: CreateInvoicePayloadLineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountAmount: number;
  total: number;
};

const financeTabs = [
  { value: "overview", label: "Overview", minimumPlan: "starter" },
  { value: "invoices", label: "Invoices", minimumPlan: "starter" },
  { value: "create-invoice", label: "Create invoice", minimumPlan: "starter" },
  { value: "payments", label: "Payments", minimumPlan: "starter" },
  { value: "collections", label: "COD & Collections", minimumPlan: "pro" },
  { value: "returns", label: "Returns", minimumPlan: "pro" },
  { value: "settlements", label: "Settlements Reconciliation", minimumPlan: "enterprise" }
] as const satisfies Array<{ value: string; label: string; minimumPlan: Plan }>;

type FinanceTab = (typeof financeTabs)[number];
type FinanceTabValue = FinanceTab["value"];

const financeTabByValue = Object.fromEntries(
  financeTabs.map((tab) => [tab.value, tab])
) as Record<FinanceTabValue, FinanceTab>;

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

function getApiErrorMessage(error: unknown, fallback: string) {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return fallback;
  }
  const response = (error as { response?: { data?: { error?: string; message?: string } } }).response;
  return response?.data?.error ?? response?.data?.message ?? fallback;
}

function createLineItemId() {
  return crypto.randomUUID();
}

function createBlankInvoiceLineItem(): CreateInvoiceLineItem {
  return {
    id: createLineItemId(),
    description: "",
    quantity: "1",
    unitAmount: "",
    taxRate: "0"
  };
}

function createInitialInvoiceForm(
  currency = "GBP",
  defaults?: { tenantName?: string; logoUrl?: string; accentColor?: string }
): CreateInvoiceForm {
  return {
    documentTitle: "INVOICE",
    documentSubtitle: "Draft customer invoice",
    templateAccentColor: defaults?.accentColor || "#0D1F3C",
    logoUrl: defaults?.logoUrl ?? "",
    payeeName: defaults?.tenantName || "Fauward tenant",
    payeeAddress: "Company address\nCity, Postcode\nCountry",
    payeeVatId: "",
    payerName: "",
    payerAddress: "",
    payerVatId: "",
    organisationId: "",
    customerId: "",
    shipmentId: "",
    currency: currency.toUpperCase(),
    dueDate: "",
    paymentTerms: "14",
    discountAmount: "0",
    notes: "",
    paymentInstructions: "Payment due according to the terms above. Please include the invoice number as the payment reference.",
    footerText: "Thank you for your business.",
    lineItems: [createBlankInvoiceLineItem()]
  };
}

function normalizeHexColor(value: string, fallback = "#0D1F3C") {
  return /^#[0-9A-Fa-f]{6}$/.test(value) ? value : fallback;
}

function formatCurrencyCode(amount: number, currency: string, locale = "en-GB") {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency || "GBP"
    }).format(amount);
  } catch {
    return `${currency || "GBP"} ${amount.toFixed(2)}`;
  }
}

function parsePositiveNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function parseNonNegativeNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundRate(value: number) {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function calculateCreateInvoiceTotals(form: CreateInvoiceForm) {
  const lineItems = form.lineItems
    .map((item) => {
      const quantity = parsePositiveNumber(item.quantity);
      const unitAmount = parseNonNegativeNumber(item.unitAmount);
      const taxRate = parseNonNegativeNumber(item.taxRate);
      const amount = roundMoney(quantity * unitAmount);
      const taxAmount = roundMoney(amount * (taxRate / 100));

      return {
        description: item.description.trim(),
        quantity,
        unitAmount,
        taxRate,
        amount,
        taxAmount
      };
    })
    .filter((item) => item.description.length > 0 && item.quantity > 0 && item.unitAmount > 0);

  const subtotal = roundMoney(lineItems.reduce((sum, item) => sum + item.amount, 0));
  const taxAmount = roundMoney(lineItems.reduce((sum, item) => sum + item.taxAmount, 0));
  const discountAmount = Math.min(roundMoney(parseNonNegativeNumber(form.discountAmount)), roundMoney(subtotal + taxAmount));
  const total = roundMoney(subtotal + taxAmount - discountAmount);
  const taxRate = subtotal > 0 ? roundRate((taxAmount / subtotal) * 100) : 0;

  return {
    lineItems,
    subtotal,
    taxRate,
    taxAmount,
    discountAmount,
    total,
    validLineCount: lineItems.length
  };
}

function composeCreateInvoiceNotes(form: CreateInvoiceForm) {
  const payeeDetails = [form.payeeName.trim(), form.payeeAddress.trim()].filter(Boolean).join("\n");
  const payerDetails = [form.payerName.trim(), form.payerAddress.trim()].filter(Boolean).join("\n");

  return [
    payeeDetails ? `Payee:\n${payeeDetails}` : "",
    payerDetails ? `Bill to:\n${payerDetails}` : "",
    form.notes.trim(),
    form.paymentInstructions.trim() ? `Payment instructions:\n${form.paymentInstructions.trim()}` : "",
    form.footerText.trim() ? `Footer:\n${form.footerText.trim()}` : "",
    form.payeeVatId.trim() ? `Payee VAT ID: ${form.payeeVatId.trim()}` : "",
    form.payerVatId.trim() ? `Payer VAT ID: ${form.payerVatId.trim()}` : ""
  ].filter(Boolean).join("\n\n") || undefined;
}

function buildCreateInvoicePayload(form: CreateInvoiceForm): CreateInvoicePayload {
  const totals = calculateCreateInvoiceTotals(form);

  return {
    organisationId: form.organisationId.trim() || undefined,
    customerId: form.customerId.trim() || undefined,
    shipmentId: form.shipmentId.trim() || undefined,
    currency: form.currency.trim().toUpperCase(),
    dueDate: form.dueDate || undefined,
    paymentTerms: Math.trunc(parseNonNegativeNumber(form.paymentTerms)),
    notes: composeCreateInvoiceNotes(form),
    lineItems: totals.lineItems,
    subtotal: totals.subtotal,
    taxRate: totals.taxRate,
    taxAmount: totals.taxAmount,
    discountAmount: totals.discountAmount,
    total: totals.total
  };
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
  changePct?: number;
  positiveIsGood?: boolean;
  icon: ReactNode;
}) {
  const hasDelta = typeof delta === "number";
  const favorable = hasDelta ? (positiveIsGood ? delta! >= 0 : delta! <= 0) : true;
  const TrendIcon = hasDelta && delta! >= 0 ? TrendingUp : TrendingDown;

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
      {hasDelta ? (
        <p
          className={cn(
            "mt-4 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
            favorable
              ? "bg-[var(--color-success-light)] text-[var(--color-success)]"
              : "bg-[var(--color-error-light)] text-[var(--color-error)]"
          )}
        >
          <TrendIcon size={13} />
          {formatDelta(delta!)} vs previous period
        </p>
      ) : null}
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

type TenantRef = ReturnType<typeof useTenantStore.getState>["tenant"];

function CodCollections({
  data,
  fallbackCollectionRate,
  outstandingReceivables,
  overdueExposure,
  paymentMethodBreakdown,
  tenant
}: {
  data: CollectionsResponse | undefined;
  fallbackCollectionRate: number;
  outstandingReceivables: number;
  overdueExposure: number;
  paymentMethodBreakdown: Array<{ method: string; amount: number }>;
  tenant: TenantRef;
}) {
  if (!data) {
    return (
      <EmptyState
        icon={Wallet}
        title="No COD activity yet"
        description="COD outstanding and collected figures appear once cash-on-delivery shipments are created."
      />
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Collection Rate"
          value={`${fallbackCollectionRate.toFixed(1)}%`}
          hint="Collected value divided by total invoiced."
          icon={<Wallet size={18} />}
        />
        <MetricTile
          label="COD Collected"
          value={formatCurrency(data.collectedValue, tenant)}
          hint={`${data.collectedCount.toLocaleString()} completed cash-on-delivery payments.`}
          icon={<CircleDollarSign size={18} />}
        />
        <MetricTile
          label="COD Outstanding"
          value={formatCurrency(data.outstandingValue, tenant)}
          hint={`${data.outstandingCount.toLocaleString()} COD shipments awaiting collection.`}
          icon={<CreditCard size={18} />}
        />
        <MetricTile
          label="Overdue Exposure"
          value={formatCurrency(overdueExposure, tenant)}
          hint="Invoice value already outside payment terms."
          icon={<ReceiptText size={18} />}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="text-base font-semibold text-gray-900">By driver</h3>
          {data.byDriver.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">No driver-attributed COD activity yet.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {data.byDriver.map((row) => (
                <div key={row.driverId} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-3">
                  <span className="text-sm font-medium text-gray-700">{row.name}</span>
                  <span className="text-sm text-gray-500">
                    {formatCurrency(row.outstandingValue, tenant)} outstanding · {formatCurrency(row.collectedValue, tenant)} collected
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-xs text-gray-500">
            Outstanding receivables (all methods): {formatCurrency(outstandingReceivables, tenant)}
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="text-base font-semibold text-gray-900">Outstanding COD queue</h3>
          {data.outstandingList.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">No outstanding COD shipments.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {data.outstandingList.slice(0, 12).map((row) => (
                <div key={row.shipmentId} className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{row.trackingNumber ?? row.shipmentId.slice(0, 10)}</p>
                    <p className="text-xs text-gray-500">{row.assignedDriverId ? `Driver: ${row.assignedDriverId.slice(0, 10)}` : "Unassigned"}</p>
                  </div>
                  <span className="text-sm font-semibold text-gray-900">{formatCurrency(row.amount, tenant)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {paymentMethodBreakdown.length > 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="text-base font-semibold text-gray-900">Payment methods (all)</h3>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {paymentMethodBreakdown.map((entry) => (
              <div key={entry.method} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-3">
                <span className="text-sm font-medium text-gray-700">{entry.method.replaceAll("_", " ")}</span>
                <span className="text-sm font-semibold text-gray-900">{formatCurrency(entry.amount, tenant)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ReturnsAndAdjustments({
  returns,
  creditNotes,
  tenant
}: {
  returns: FinanceReturn[];
  creditNotes: CreditNote[];
  tenant: TenantRef;
}) {
  const [view, setView] = useState<"returns" | "adjustments">("returns");
  const manualAdjustments = creditNotes.filter((cn) => !cn.invoice?.id);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" variant={view === "returns" ? "primary" : "secondary"} onClick={() => setView("returns")}>
          Returns ({returns.length})
        </Button>
        <Button size="sm" variant={view === "adjustments" ? "primary" : "secondary"} onClick={() => setView("adjustments")}>
          Manual adjustments ({manualAdjustments.length})
        </Button>
      </div>

      {view === "returns" ? (
        returns.length === 0 ? (
          <EmptyState
            icon={RefreshCcw}
            title="No returns yet"
            description="Returns appear here once customers raise return requests."
          />
        ) : (
          <Table columns={["Return", "Shipment", "Customer", "Status", "Items", "Refunded", "Credited", "Created"]}>
            {returns.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono">{r.id.slice(0, 10)}</TableCell>
                <TableCell>
                  {r.trackingNumber ? (
                    <Link to={`/shipments/${r.shipmentId}`} className="font-semibold text-[var(--tenant-primary)] hover:underline">
                      {r.trackingNumber}
                    </Link>
                  ) : (
                    r.shipmentId.slice(0, 10)
                  )}
                </TableCell>
                <TableCell>{r.organisation ?? r.customer ?? "—"}</TableCell>
                <TableCell><Badge variant={statusBadgeVariant(r.status)}>{r.status}</Badge></TableCell>
                <TableCell>
                  {r.itemsCount.toLocaleString()} · {formatCurrency(r.itemsValue, tenant)}
                </TableCell>
                <TableCell>{formatCurrency(r.refundedTotal, tenant)}</TableCell>
                <TableCell>{formatCurrency(r.creditedTotal, tenant)}</TableCell>
                <TableCell>{formatDateTime(r.createdAt, tenant)}</TableCell>
              </TableRow>
            ))}
          </Table>
        )
      ) : manualAdjustments.length === 0 ? (
        <EmptyState
          icon={RefreshCcw}
          title="No manual adjustments"
          description="Credit notes issued outside of returns will appear here."
        />
      ) : (
        <Table columns={["Credit Note", "Customer", "Reason", "Created", "Amount"]}>
          {manualAdjustments.map((cn) => (
            <TableRow key={cn.id}>
              <TableCell className="font-semibold text-gray-900">{cn.creditNumber}</TableCell>
              <TableCell>{cn.organisation?.name ?? "Unknown customer"}</TableCell>
              <TableCell>{cn.reason ?? "No reason provided"}</TableCell>
              <TableCell>{formatDateTime(cn.createdAt, tenant)}</TableCell>
              <TableCell>{formatCurrency(Number(cn.amount ?? 0), tenant)}</TableCell>
            </TableRow>
          ))}
        </Table>
      )}
    </div>
  );
}

function SettlementsReconciliation({
  payouts,
  unmatchedLines,
  matchedPct,
  unmatchedCount,
  tenant
}: {
  payouts: GatewayPayout[];
  unmatchedLines: GatewayPayoutLine[];
  matchedPct: number | null;
  unmatchedCount: number | null;
  tenant: TenantRef;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricTile
          label="Payouts ingested"
          value={payouts.length.toLocaleString()}
          hint="Gateway payouts received from Stripe webhooks."
          icon={<Truck size={18} />}
        />
        <MetricTile
          label="Match rate"
          value={matchedPct === null ? "—" : `${matchedPct.toFixed(1)}%`}
          hint="Payout lines linked to a payment record."
          icon={<ClipboardCheck size={18} />}
        />
        <MetricTile
          label="Unmatched lines"
          value={(unmatchedCount ?? unmatchedLines.length).toLocaleString()}
          hint="Payout lines without a payment match."
          icon={<CircleDollarSign size={18} />}
        />
      </div>

      {payouts.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No payouts yet"
          description="Gateway payouts appear once Stripe payout.paid webhooks are received."
        />
      ) : (
        <Table columns={["Payout ID", "Arrival", "Provider", "Status", "Amount", "Lines"]}>
          {payouts.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-mono">{p.providerPayoutId}</TableCell>
              <TableCell>{formatDateTime(p.arrivalDate, tenant)}</TableCell>
              <TableCell>{p.provider}</TableCell>
              <TableCell><Badge variant={statusBadgeVariant(p.status.toUpperCase())}>{p.status}</Badge></TableCell>
              <TableCell>{formatCurrency(Number(p.amount ?? 0), tenant)}</TableCell>
              <TableCell>{p._count?.lines?.toLocaleString() ?? "—"}</TableCell>
            </TableRow>
          ))}
        </Table>
      )}

      {unmatchedLines.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h3 className="text-base font-semibold text-amber-900">Unmatched payout lines</h3>
          <p className="mt-1 text-xs text-amber-800">
            Lines from gateway payouts that did not resolve to a payment record. Manual matching is available via the API.
          </p>
          <div className="mt-3 space-y-2">
            {unmatchedLines.slice(0, 10).map((line) => (
              <div key={line.id} className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white px-3 py-2">
                <div>
                  <p className="font-mono text-xs text-gray-600">{line.providerTxnId}</p>
                  <p className="text-xs text-gray-500">{line.type} · source {line.providerSourceId ?? "—"}</p>
                </div>
                <span className="text-sm font-semibold text-gray-900">{formatCurrency(Number(line.amount ?? 0), tenant)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TenantFinancePage() {
  const user = useAppStore((state) => state.user);
  const addToast = useAppStore((state) => state.addToast);
  const tenant = useTenantStore((state) => state.tenant);
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const currentTab = rawTab === "refunds" ? "returns" : rawTab === "reconciliation" ? "settlements" : (rawTab ?? "overview");
  const initialFinanceRange = financePresetRange("30d");
  const [financePreset, setFinancePreset] = useState<FinanceRangePreset>("30d");
  const [financeRange, setFinanceRange] = useState<DateRange>(initialFinanceRange);
  const [createInvoiceForm, setCreateInvoiceForm] = useState<CreateInvoiceForm>(() =>
    createInitialInvoiceForm(tenant?.currency ?? "GBP", {
      tenantName: tenant?.name,
      logoUrl: tenant?.logo_url,
      accentColor: tenant?.primary_color
    })
  );
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

  const customersQuery = useQuery({
    queryKey: ["finance-customers"],
    queryFn: async () => (await fetchJson<{ data: FinanceCustomer[] }>("/v1/crm/customers")).data,
    enabled: hasToken && currentTab === "create-invoice",
    retry: false,
    staleTime: 60_000
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async (form: CreateInvoiceForm) => {
      const response = await api.post<FinanceInvoice>("/v1/finance/invoices", buildCreateInvoicePayload(form), {
        headers: { "Idempotency-Key": `invoice:create:${crypto.randomUUID()}` }
      });
      return response.data;
    },
    onSuccess: (invoice) => {
      queryClient.setQueryData<FinanceInvoice[]>(["finance-invoices"], (previous = []) => [invoice, ...previous]);
      void queryClient.invalidateQueries({ queryKey: ["finance-invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["finance-summary"] });
      setCreateInvoiceForm(createInitialInvoiceForm(invoice.currency || tenant?.currency || "GBP", {
        tenantName: tenant?.name,
        logoUrl: tenant?.logo_url,
        accentColor: tenant?.primary_color
      }));
      setSearchParams({ tab: "invoices" });
      addToast({
        title: "Invoice draft created",
        description: `${invoice.invoiceNumber} is ready to review.`,
        variant: "success"
      });
    },
    onError: (error) => {
      addToast({
        title: "Invoice was not created",
        description: getApiErrorMessage(error, "Check the invoice details and try again."),
        variant: "error"
      });
    }
  });

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "refunds") setSearchParams({ tab: "returns" }, { replace: true });
    else if (tab === "reconciliation") setSearchParams({ tab: "settlements" }, { replace: true });
  }, [searchParams, setSearchParams]);

  const planForGating = (user?.plan ?? tenant?.plan ?? "starter") as string;
  const canUseCod = hasPlanAccess(planForGating, "pro");
  const canUseReturns = hasPlanAccess(planForGating, "pro");
  const canUseSettlements = hasPlanAccess(planForGating, "enterprise");

  const collectionsQuery = useQuery({
    queryKey: ["finance-collections"],
    queryFn: () => fetchJson<CollectionsResponse>("/v1/finance/collections"),
    enabled: hasToken && canUseCod,
    retry: false,
    refetchInterval: 60_000
  });

  const returnsQuery = useQuery({
    queryKey: ["finance-returns"],
    queryFn: async () => (await fetchJson<{ data: FinanceReturn[] }>("/v1/finance/returns")).data,
    enabled: hasToken && canUseReturns && currentTab === "returns",
    retry: false,
    refetchInterval: 60_000
  });

  const payoutsQuery = useQuery({
    queryKey: ["finance-payouts"],
    queryFn: async () => (await fetchJson<{ data: GatewayPayout[] }>("/v1/finance/payouts")).data,
    enabled: hasToken && canUseSettlements && currentTab === "settlements",
    retry: false,
    refetchInterval: 60_000
  });

  const payoutsUnmatchedQuery = useQuery({
    queryKey: ["finance-payouts-unmatched"],
    queryFn: async () => (await fetchJson<{ data: GatewayPayoutLine[] }>("/v1/finance/payouts/unmatched")).data,
    enabled: hasToken && canUseSettlements && currentTab === "settlements",
    retry: false,
    refetchInterval: 60_000
  });

  const markPaidMutation = useMutation({
    mutationFn: async (invoice: FinanceInvoice) => {
      const response = await api.post<{ payment: unknown; invoice: FinanceInvoice }>(
        `/v1/finance/invoices/${invoice.id}/pay`,
        { amount: Number(invoice.total ?? 0), currency: invoice.currency, method: "MANUAL" }
      );
      return response.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["finance-invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["finance-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["finance-payments"] });
      addToast({ title: "Invoice marked paid", variant: "success" });
    },
    onError: (error) => {
      addToast({
        title: "Could not mark invoice paid",
        description: getApiErrorMessage(error, "Try again."),
        variant: "error"
      });
    }
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

  const isLoading =
    hasToken &&
    (summaryQuery.isLoading || invoicesQuery.isLoading || paymentsQuery.isLoading || creditNotesQuery.isLoading);

  const customerOptions = customersQuery.data ?? [];
  const createInvoiceTotals = useMemo(
    () => calculateCreateInvoiceTotals(createInvoiceForm),
    [createInvoiceForm]
  );
  const createInvoiceCanSubmit =
    hasToken &&
    createInvoiceTotals.validLineCount > 0 &&
    createInvoiceForm.currency.trim().length === 3 &&
    createInvoiceTotals.total >= 0;
  const customerSelectorUnavailable = getErrorStatus(customersQuery.error) === 403;
  const invoiceAccentColor = normalizeHexColor(createInvoiceForm.templateAccentColor, tenant?.primary_color ?? "#0D1F3C");
  const invoiceIssueDate = new Date().toISOString().slice(0, 10);
  const templateColorSwatches = Array.from(new Set([
    tenant?.primary_color ?? "#0D1F3C",
    tenant?.accent_color ?? "#D97706",
    "#111827",
    "#047857"
  ].map((color) => normalizeHexColor(color, "#0D1F3C"))));
  const formatCreateInvoiceCurrency = (amount: number) =>
    formatCurrencyCode(amount, createInvoiceForm.currency.trim().toUpperCase() || tenant?.currency || "GBP", tenant?.locale || "en-GB");

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

  function updateCreateInvoiceField<K extends Exclude<keyof CreateInvoiceForm, "lineItems">>(
    field: K,
    value: CreateInvoiceForm[K]
  ) {
    setCreateInvoiceForm((previous) => ({
      ...previous,
      [field]: field === "currency" ? String(value).toUpperCase().slice(0, 3) : value
    }));
  }

  function handleCreateInvoiceCustomerChange(customerId: string) {
    const customer = customerOptions.find((item) => item.id === customerId);
    setCreateInvoiceForm((previous) => ({
      ...previous,
      organisationId: customerId,
      payerName: customer?.name ?? previous.payerName,
      payerAddress: customer?.billingEmail ? `Billing email: ${customer.billingEmail}` : previous.payerAddress
    }));
  }

  function updateCreateInvoiceLineItem(
    id: string,
    field: Exclude<keyof CreateInvoiceLineItem, "id">,
    value: string
  ) {
    setCreateInvoiceForm((previous) => ({
      ...previous,
      lineItems: previous.lineItems.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    }));
  }

  function addCreateInvoiceLineItem() {
    setCreateInvoiceForm((previous) => ({
      ...previous,
      lineItems: [...previous.lineItems, createBlankInvoiceLineItem()]
    }));
  }

  function removeCreateInvoiceLineItem(id: string) {
    setCreateInvoiceForm((previous) => ({
      ...previous,
      lineItems: previous.lineItems.length === 1
        ? previous.lineItems
        : previous.lineItems.filter((item) => item.id !== id)
    }));
  }

  function handleCreateInvoiceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!createInvoiceCanSubmit || createInvoiceMutation.isPending) return;
    createInvoiceMutation.mutate(createInvoiceForm);
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
            hideTabList
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
                    {summary.codOutstanding !== undefined ? (
                      <FinanceKpiCard
                        label="COD outstanding"
                        value={summary.codOutstanding}
                        formatter={(value) => formatCurrency(value, tenant)}
                        positiveIsGood={false}
                        icon={<Truck size={18} />}
                      />
                    ) : null}
                    {summary.payoutsMatchedPct !== undefined && summary.payoutsMatchedPct !== null ? (
                      <FinanceKpiCard
                        label="Payout match rate"
                        value={summary.payoutsMatchedPct}
                        formatter={(value) => `${value.toFixed(1)}%`}
                        icon={<ClipboardCheck size={18} />}
                      />
                    ) : null}

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
                  ctaLabel="Create invoice"
                  onCtaClick={() => setSearchParams({ tab: "create-invoice" })}
                />
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<FilePlus2 size={14} />}
                      onClick={() => setSearchParams({ tab: "create-invoice" })}
                    >
                      Create invoice
                    </Button>
                  </div>
                  <Table columns={["Invoice", "Customer", "Status", "Created", "Due", "Amount", ""]}>
                    {invoices.map((invoice) => {
                      const canMarkPaid = invoice.status !== "PAID" && invoice.status !== "VOID";
                      return (
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
                          <TableCell>
                            {canMarkPaid ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                loading={markPaidMutation.isPending && markPaidMutation.variables?.id === invoice.id}
                                disabled={markPaidMutation.isPending}
                                onClick={() => {
                                  if (window.confirm(`Mark ${invoice.invoiceNumber} as paid?`)) {
                                    markPaidMutation.mutate(invoice);
                                  }
                                }}
                              >
                                Mark paid
                              </Button>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="create-invoice">
              {renderPlanGatedTab(financeTabByValue["create-invoice"], (
                <form className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_24rem]" onSubmit={handleCreateInvoiceSubmit}>
                  <div className="overflow-x-auto rounded-xl border border-gray-200 bg-gray-100 p-4">
                    <section
                      className="mx-auto flex min-h-[1123px] w-[794px] max-w-none flex-col bg-white p-12 shadow-sm"
                      style={{ borderTop: `10px solid ${invoiceAccentColor}` }}
                    >
                      <header className="flex items-start justify-between gap-10 border-b border-gray-200 pb-8">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-3">
                            {createInvoiceForm.logoUrl.trim() ? (
                              <img
                                src={createInvoiceForm.logoUrl}
                                alt=""
                                className="h-14 w-14 rounded-md border border-gray-200 object-contain"
                              />
                            ) : (
                              <div
                                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md text-lg font-semibold text-white"
                                style={{ backgroundColor: invoiceAccentColor }}
                              >
                                {(createInvoiceForm.payeeName || tenant?.name || "F").slice(0, 1).toUpperCase()}
                              </div>
                            )}
                            <Input
                              value={createInvoiceForm.payeeName}
                              onChange={(event) => updateCreateInvoiceField("payeeName", event.target.value)}
                              className="h-12 border-transparent px-0 text-xl font-semibold focus-visible:ring-0"
                              placeholder="Your company name"
                            />
                          </div>
                          <Textarea
                            value={createInvoiceForm.payeeAddress}
                            onChange={(event) => updateCreateInvoiceField("payeeAddress", event.target.value)}
                            className="mt-4 min-h-[86px] resize-none border-transparent bg-gray-50 text-sm leading-6 focus-visible:ring-0"
                            placeholder="Your billing address"
                          />
                          <Input
                            value={createInvoiceForm.payeeVatId}
                            onChange={(event) => updateCreateInvoiceField("payeeVatId", event.target.value)}
                            className="mt-2 h-9 border-transparent bg-gray-50 text-xs uppercase focus-visible:ring-0"
                            placeholder="VAT ID / tax number"
                          />
                        </div>

                        <div className="w-64 shrink-0 text-right">
                          <Input
                            value={createInvoiceForm.documentTitle}
                            onChange={(event) => updateCreateInvoiceField("documentTitle", event.target.value)}
                            className="h-14 border-transparent px-0 text-right text-4xl font-semibold focus-visible:ring-0"
                          />
                          <Input
                            value={createInvoiceForm.documentSubtitle}
                            onChange={(event) => updateCreateInvoiceField("documentSubtitle", event.target.value)}
                            className="h-9 border-transparent px-0 text-right text-sm text-gray-500 focus-visible:ring-0"
                          />
                          <div className="mt-4 inline-flex rounded-full px-3 py-1 text-xs font-semibold text-white" style={{ backgroundColor: invoiceAccentColor }}>
                            DRAFT
                          </div>
                          <p className="mt-3 text-xs text-gray-500">Invoice number is allocated when the draft is saved.</p>
                        </div>
                      </header>

                      <section className="mt-8 grid grid-cols-[minmax(0,1fr)_18rem] gap-8">
                        <div>
                          <p className="text-xs font-semibold uppercase text-gray-500">Bill to</p>
                          <select
                            className="mt-3 h-10 w-full rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tenant-primary-light)]"
                            value={createInvoiceForm.organisationId}
                            onChange={(event) => handleCreateInvoiceCustomerChange(event.target.value)}
                            disabled={customersQuery.isLoading || customerSelectorUnavailable}
                          >
                            <option value="">Select or type customer below</option>
                            {customerOptions.map((customer) => (
                              <option key={customer.id} value={customer.id}>
                                {customer.name}
                              </option>
                            ))}
                          </select>
                          <Input
                            value={createInvoiceForm.payerName}
                            onChange={(event) => updateCreateInvoiceField("payerName", event.target.value)}
                            className="mt-3 h-11 border-transparent bg-gray-50 text-base font-semibold focus-visible:ring-0"
                            placeholder="Customer name"
                          />
                          <Textarea
                            value={createInvoiceForm.payerAddress}
                            onChange={(event) => updateCreateInvoiceField("payerAddress", event.target.value)}
                            className="mt-2 min-h-[94px] resize-none border-transparent bg-gray-50 text-sm leading-6 focus-visible:ring-0"
                            placeholder="Customer billing address"
                          />
                          <Input
                            value={createInvoiceForm.payerVatId}
                            onChange={(event) => updateCreateInvoiceField("payerVatId", event.target.value)}
                            className="mt-2 h-9 border-transparent bg-gray-50 text-xs uppercase focus-visible:ring-0"
                            placeholder="Customer VAT ID / tax number"
                          />
                        </div>

                        <div className="rounded-lg bg-gray-50 p-4">
                          <div className="grid gap-3 text-sm">
                            <label className="space-y-1.5 font-medium text-gray-700">
                              Issue date
                              <Input type="date" value={invoiceIssueDate} readOnly className="h-10 bg-white" />
                            </label>
                            <label className="space-y-1.5 font-medium text-gray-700">
                              Due date
                              <Input
                                type="date"
                                value={createInvoiceForm.dueDate}
                                onChange={(event) => updateCreateInvoiceField("dueDate", event.target.value)}
                                className="h-10 bg-white"
                              />
                            </label>
                            <div className="grid grid-cols-2 gap-3">
                              <label className="space-y-1.5 font-medium text-gray-700">
                                Terms
                                <Input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={createInvoiceForm.paymentTerms}
                                  onChange={(event) => updateCreateInvoiceField("paymentTerms", event.target.value)}
                                  className="h-10 bg-white"
                                />
                              </label>
                              <label className="space-y-1.5 font-medium text-gray-700">
                                Currency
                                <Input
                                  value={createInvoiceForm.currency}
                                  onChange={(event) => updateCreateInvoiceField("currency", event.target.value)}
                                  maxLength={3}
                                  className="h-10 bg-white uppercase"
                                />
                              </label>
                            </div>
                            <label className="space-y-1.5 font-medium text-gray-700">
                              Shipment ID
                              <Input
                                value={createInvoiceForm.shipmentId}
                                onChange={(event) => updateCreateInvoiceField("shipmentId", event.target.value)}
                                className="h-10 bg-white font-mono text-xs"
                                placeholder="Optional"
                              />
                            </label>
                          </div>
                        </div>
                      </section>

                      <section className="mt-8">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <p className="text-xs font-semibold uppercase text-gray-500">Invoice items</p>
                          <Button type="button" variant="secondary" size="sm" icon={<Plus size={14} />} onClick={addCreateInvoiceLineItem}>
                            Add line
                          </Button>
                        </div>
                        <div className="overflow-hidden rounded-lg border border-gray-200">
                          <div
                            className="grid items-center gap-2 px-3 py-2 text-xs font-semibold uppercase text-white"
                            style={{
                              backgroundColor: invoiceAccentColor,
                              gridTemplateColumns: "minmax(0, 1fr) 64px 92px 72px 96px 40px"
                            }}
                          >
                            <span>Description</span>
                            <span>Qty</span>
                            <span>Unit</span>
                            <span>Tax</span>
                            <span className="text-right">Line total</span>
                            <span />
                          </div>
                          {createInvoiceForm.lineItems.map((item, index) => {
                            const quantity = parsePositiveNumber(item.quantity);
                            const unitAmount = parseNonNegativeNumber(item.unitAmount);
                            const taxRate = parseNonNegativeNumber(item.taxRate);
                            const lineTotal = roundMoney(quantity * unitAmount * (1 + taxRate / 100));

                            return (
                              <div
                                key={item.id}
                                className="grid items-center gap-2 border-t border-gray-200 px-3 py-2"
                                style={{ gridTemplateColumns: "minmax(0, 1fr) 64px 92px 72px 96px 40px" }}
                              >
                                <Input
                                  value={item.description}
                                  onChange={(event) => updateCreateInvoiceLineItem(item.id, "description", event.target.value)}
                                  className="h-9 border-transparent bg-gray-50 text-sm focus-visible:ring-0"
                                  placeholder={`Line ${index + 1}`}
                                />
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={item.quantity}
                                  onChange={(event) => updateCreateInvoiceLineItem(item.id, "quantity", event.target.value)}
                                  className="h-9 border-transparent bg-gray-50 text-sm focus-visible:ring-0"
                                />
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={item.unitAmount}
                                  onChange={(event) => updateCreateInvoiceLineItem(item.id, "unitAmount", event.target.value)}
                                  className="h-9 border-transparent bg-gray-50 text-sm focus-visible:ring-0"
                                />
                                <Input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={item.taxRate}
                                  onChange={(event) => updateCreateInvoiceLineItem(item.id, "taxRate", event.target.value)}
                                  className="h-9 border-transparent bg-gray-50 text-sm focus-visible:ring-0"
                                />
                                <span className="text-right text-sm font-semibold text-gray-900">{formatCreateInvoiceCurrency(lineTotal)}</span>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-9 w-9 px-0 text-red-600 hover:bg-red-50"
                                  aria-label={`Remove line ${index + 1}`}
                                  disabled={createInvoiceForm.lineItems.length === 1}
                                  onClick={() => removeCreateInvoiceLineItem(item.id)}
                                >
                                  <Trash2 size={15} />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      </section>

                      <section className="mt-8 grid grid-cols-[minmax(0,1fr)_18rem] gap-8">
                        <div className="space-y-4">
                          <label className="block space-y-1.5 text-sm font-medium text-gray-700">
                            Notes
                            <Textarea
                              value={createInvoiceForm.notes}
                              onChange={(event) => updateCreateInvoiceField("notes", event.target.value)}
                              className="min-h-[92px] resize-none border-transparent bg-gray-50 focus-visible:ring-0"
                              placeholder="Optional invoice memo"
                            />
                          </label>
                          <label className="block space-y-1.5 text-sm font-medium text-gray-700">
                            Payment instructions
                            <Textarea
                              value={createInvoiceForm.paymentInstructions}
                              onChange={(event) => updateCreateInvoiceField("paymentInstructions", event.target.value)}
                              className="min-h-[92px] resize-none border-transparent bg-gray-50 focus-visible:ring-0"
                            />
                          </label>
                        </div>

                        <div className="space-y-3 rounded-lg bg-gray-50 p-4 text-sm">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-gray-600">Subtotal</span>
                            <span className="font-semibold text-gray-900">{formatCreateInvoiceCurrency(createInvoiceTotals.subtotal)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-gray-600">Tax</span>
                            <span className="font-semibold text-gray-900">{formatCreateInvoiceCurrency(createInvoiceTotals.taxAmount)}</span>
                          </div>
                          <label className="block space-y-1.5 font-medium text-gray-700">
                            Discount
                            <Input
                              type="number"
                              min="0"
                              step="0.01"
                              value={createInvoiceForm.discountAmount}
                              onChange={(event) => updateCreateInvoiceField("discountAmount", event.target.value)}
                              className="h-10 bg-white"
                            />
                          </label>
                          <div className="border-t border-gray-200 pt-3">
                            <div className="flex items-center justify-between gap-4">
                              <span className="text-gray-600">Total</span>
                              <span className="text-xl font-semibold text-gray-900">{formatCreateInvoiceCurrency(createInvoiceTotals.total)}</span>
                            </div>
                          </div>
                        </div>
                      </section>

                      <footer className="mt-auto border-t border-gray-200 pt-6">
                        <Textarea
                          value={createInvoiceForm.footerText}
                          onChange={(event) => updateCreateInvoiceField("footerText", event.target.value)}
                          className="min-h-[58px] resize-none border-transparent bg-gray-50 text-center text-sm text-gray-600 focus-visible:ring-0"
                        />
                      </footer>
                    </section>
                  </div>

                  <aside className="space-y-4 2xl:sticky 2xl:top-4 2xl:self-start">
                    <section className="rounded-xl border border-gray-200 bg-white p-4">
                      <h3 className="text-base font-semibold text-gray-900">Template controls</h3>
                      <div className="mt-4 space-y-4">
                        <label className="block space-y-1.5 text-sm font-medium text-gray-700">
                          Logo URL
                          <Input
                            value={createInvoiceForm.logoUrl}
                            onChange={(event) => updateCreateInvoiceField("logoUrl", event.target.value)}
                            placeholder={tenant?.logo_url || "https://..."}
                          />
                        </label>

                        <div className="space-y-2">
                          <p className="text-sm font-medium text-gray-700">Accent color</p>
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="color"
                              value={invoiceAccentColor}
                              onChange={(event) => updateCreateInvoiceField("templateAccentColor", event.target.value)}
                              className="h-10 w-12 rounded-md border border-gray-300 bg-white p-1"
                              aria-label="Accent color"
                            />
                            {templateColorSwatches.map((color) => {
                              const swatchColor = normalizeHexColor(color, "#0D1F3C");
                              return (
                                <button
                                  key={swatchColor}
                                  type="button"
                                  className={cn(
                                    "h-9 w-9 rounded-full border-2",
                                    invoiceAccentColor === swatchColor ? "border-gray-900" : "border-white ring-1 ring-gray-300"
                                  )}
                                  style={{ backgroundColor: swatchColor }}
                                  aria-label={`Use ${swatchColor}`}
                                  onClick={() => updateCreateInvoiceField("templateAccentColor", swatchColor)}
                                />
                              );
                            })}
                          </div>
                        </div>

                        <label className="block space-y-1.5 text-sm font-medium text-gray-700">
                          Organisation ID
                          <Input
                            value={createInvoiceForm.organisationId}
                            onChange={(event) => updateCreateInvoiceField("organisationId", event.target.value)}
                            placeholder="Optional organisation UUID"
                          />
                        </label>

                        <label className="block space-y-1.5 text-sm font-medium text-gray-700">
                          Customer ID
                          <Input
                            value={createInvoiceForm.customerId}
                            onChange={(event) => updateCreateInvoiceField("customerId", event.target.value)}
                            placeholder="Optional customer UUID"
                          />
                        </label>
                      </div>
                    </section>

                    <section className="rounded-xl border border-gray-200 bg-white p-4">
                      <h3 className="text-base font-semibold text-gray-900">Draft total</h3>
                      <div className="mt-4 space-y-3 text-sm">
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-gray-600">Subtotal</span>
                          <span className="font-semibold text-gray-900">{formatCreateInvoiceCurrency(createInvoiceTotals.subtotal)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-gray-600">Tax</span>
                          <span className="font-semibold text-gray-900">{formatCreateInvoiceCurrency(createInvoiceTotals.taxAmount)}</span>
                        </div>
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-gray-600">Discount</span>
                          <span className="font-semibold text-gray-900">{formatCreateInvoiceCurrency(createInvoiceTotals.discountAmount)}</span>
                        </div>
                        <div className="border-t border-gray-200 pt-3">
                          <div className="flex items-center justify-between gap-4">
                            <span className="text-gray-600">Total</span>
                            <span className="text-xl font-semibold text-gray-900">{formatCreateInvoiceCurrency(createInvoiceTotals.total)}</span>
                          </div>
                        </div>
                      </div>

                      <Button
                        type="submit"
                        className="mt-5 w-full"
                        icon={<FilePlus2 size={16} />}
                        loading={createInvoiceMutation.isPending}
                        disabled={!createInvoiceCanSubmit}
                      >
                        Create draft invoice
                      </Button>
                      {!hasToken ? (
                        <p className="mt-3 text-sm text-amber-700">Sign in with a tenant session to create invoices.</p>
                      ) : null}
                      {createInvoiceTotals.validLineCount === 0 ? (
                        <p className="mt-3 text-sm text-gray-500">Add at least one billable line before creating the draft.</p>
                      ) : null}
                    </section>
                  </aside>
                </form>
              ))}
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
              {renderPlanGatedTab(financeTabByValue.collections, collectionsQuery.isLoading ? (
                <SectionLoader />
              ) : (
                <CodCollections
                  data={collectionsQuery.data}
                  fallbackCollectionRate={collectionRate}
                  outstandingReceivables={summary.outstanding}
                  overdueExposure={summary.overdue}
                  paymentMethodBreakdown={paymentMethodBreakdown}
                  tenant={tenant}
                />
              ))}
            </TabsContent>

            <TabsContent value="returns">
              {renderPlanGatedTab(financeTabByValue.returns, returnsQuery.isLoading ? (
                <SectionLoader />
              ) : (
                <div className="space-y-4">
                  <ReturnsAndAdjustments
                    returns={returnsQuery.data ?? []}
                    creditNotes={creditNotes}
                    tenant={tenant}
                  />
                </div>
              ))}
            </TabsContent>

            <TabsContent value="settlements">
              {renderPlanGatedTab(financeTabByValue.settlements, payoutsQuery.isLoading ? (
                <SectionLoader />
              ) : (
                <SettlementsReconciliation
                  payouts={payoutsQuery.data ?? []}
                  unmatchedLines={payoutsUnmatchedQuery.data ?? []}
                  matchedPct={summary.payoutsMatchedPct ?? null}
                  unmatchedCount={summary.payoutsUnmatchedCount ?? null}
                  tenant={tenant}
                />
              ))}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </PageShell>
  );
}
