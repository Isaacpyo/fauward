import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Clock3,
  FileText,
  MessageSquare,
  PackageCheck,
  ReceiptText,
  RotateCcw,
  Route,
  Shield,
  TrendingDown,
  TrendingUp,
  Truck,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { PageShell } from "@/layouts/PageShell";
import { apiErrorMessage } from "@/lib/api-error";
import { api } from "@/lib/api";
import { normalizeShipmentListResponse } from "@/lib/shipment-normalizers";
import { cn, formatCurrency, formatDateTime } from "@/lib/utils";
import { useTenantStore } from "@/stores/useTenantStore";
import type { ShipmentListItem } from "@/types/shipment";

type AnalyticsPreset = "today" | "7d" | "30d" | "90d";

type DateRange = {
  dateFrom: string;
  dateTo: string;
};

type TrendMetric = {
  value: number;
  previousValue?: number;
  changePct: number;
};

type AnalyticsFullResponse = {
  totals: {
    shipments: TrendMetric;
    revenue: TrendMetric;
    onTimeRate: TrendMetric;
    avgDeliveryDays: TrendMetric;
  };
  volumeByDay?: Array<{ date: string; count: number }>;
};

type ShipmentAnalyticsResponse = {
  lifecycleFunnel: Array<{ status: string; count: number; pct: number }>;
  slaCompliance: {
    onTime: number;
    late: number;
    compliancePct: number;
    avgDeliveryHours: number;
    breachesByReason: Array<{ reason: string; count: number }>;
  };
  exceptions: {
    activeExceptions: number;
    stalePendingOver24h: number;
    failedDeliveryRate: number;
    topExceptionRoutes: Array<{ route: string; count: number }>;
  };
};

type ActivityEntry = {
  id: string;
  type: "shipment" | "return" | "ticket" | "invoice" | "audit";
  title: string;
  subtitle: string;
  link: string;
  timestamp: string;
  icon: string;
  colour: string;
};

type BadgeVariant = "neutral" | "success" | "warning" | "error" | "info" | "primary" | "danger" | "default";

type RouteSummary = {
  route: string;
  total: number;
  delivered: number;
  exceptions: number;
  active: number;
  topCustomer: string;
  serviceTier: string;
  healthPct: number;
};

const analyticsPresets: Array<{ label: string; value: AnalyticsPreset }> = [
  { label: "Today", value: "today" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
  { label: "90d", value: "90d" }
];

const chartGridColor = "#E5E7EB";
const chartTickColor = "#6B7280";

const statusBars = [
  { key: "pending", label: "Pending", color: "#9CA3AF" },
  { key: "processing", label: "Processing", color: "var(--tenant-primary)" },
  { key: "inTransit", label: "In transit", color: "#2563EB" },
  { key: "outForDelivery", label: "Out for delivery", color: "var(--color-warning)" },
  { key: "delivered", label: "Delivered", color: "var(--color-success)" },
  { key: "exceptions", label: "Exceptions", color: "var(--color-error)" }
];

function presetRange(preset: AnalyticsPreset): DateRange {
  const now = new Date();
  const dateTo = now.toISOString().slice(0, 10);
  const start = new Date(now);
  if (preset === "today") start.setDate(now.getDate());
  if (preset === "7d") start.setDate(now.getDate() - 7);
  if (preset === "30d") start.setDate(now.getDate() - 30);
  if (preset === "90d") start.setDate(now.getDate() - 90);
  return { dateFrom: start.toISOString().slice(0, 10), dateTo };
}

function rangeQuery(range: DateRange) {
  return new URLSearchParams(range).toString();
}

async function fetchAnalyticsFull(range: DateRange) {
  const response = await api.get<AnalyticsFullResponse>(`/v1/analytics/full?${rangeQuery(range)}`);
  return response.data;
}

async function fetchShipmentAnalytics(range: DateRange) {
  const response = await api.get<ShipmentAnalyticsResponse>(`/v1/analytics/shipments?${rangeQuery(range)}`);
  return response.data;
}

async function fetchShipmentsInRange(range: DateRange) {
  const query = new URLSearchParams({ ...range, limit: "100" });
  const response = await api.get(`/v1/shipments?${query.toString()}`);
  return normalizeShipmentListResponse(response.data);
}

async function fetchActivityFeed(preset: AnalyticsPreset) {
  const timeframe = preset === "today" ? "24h" : preset === "7d" ? "7d" : "30d";
  const response = await api.get<{ entries: ActivityEntry[] }>(`/v1/activity?timeframe=${timeframe}`);
  return response.data.entries;
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

const EMPTY_TREND = { value: 0, previousValue: 0, changePct: 0 };

/** Shape used for derived charts before data arrives or when a request failed (the page shows the error). */
const EMPTY_OVERVIEW: AnalyticsFullResponse = {
  totals: { shipments: EMPTY_TREND, revenue: EMPTY_TREND, onTimeRate: EMPTY_TREND, avgDeliveryDays: EMPTY_TREND },
  volumeByDay: []
};

const EMPTY_SHIPMENT_ANALYTICS: ShipmentAnalyticsResponse = {
  lifecycleFunnel: [],
  slaCompliance: { onTime: 0, late: 0, compliancePct: 0, avgDeliveryHours: 0, breachesByReason: [] },
  exceptions: { activeExceptions: 0, stalePendingOver24h: 0, failedDeliveryRate: 0, topExceptionRoutes: [] }
};

function buildVolumeData(range: DateRange, volumeByDay: Array<{ date: string; count: number }> = []) {
  const countByDate = new Map(volumeByDay.map((entry) => [entry.date, Number(entry.count ?? 0)]));

  return enumerateDateKeys(range).map((date) => ({
    date,
    label: formatChartDate(date),
    shipments: countByDate.get(date) ?? 0
  }));
}

function buildStatusBreakdown(analytics: ShipmentAnalyticsResponse) {
  const count = (status: string) =>
    analytics.lifecycleFunnel.find((entry) => entry.status === status)?.count ?? 0;

  return [
    {
      name: "Shipments",
      pending: count("PENDING"),
      processing: count("PROCESSING"),
      inTransit: count("PICKED_UP") + count("IN_TRANSIT"),
      outForDelivery: count("OUT_FOR_DELIVERY"),
      delivered: count("DELIVERED"),
      exceptions: count("FAILED_DELIVERY") + count("RETURNED") + analytics.exceptions.activeExceptions
    }
  ];
}

/** The API returns one on-time rate for the range; it is drawn flat across the days that had shipments. */
function buildOnTimeSeries(volumeData: Array<{ date: string; label: string; shipments: number }>, rate: number) {
  return volumeData.map((point) => ({
    ...point,
    onTimeRate: point.shipments > 0 ? clamp(rate, 0, 100) : 0
  }));
}

function buildTopRoutes(shipments: ShipmentListItem[]): RouteSummary[] {
  const groups = new Map<
    string,
    {
      route: string;
      total: number;
      delivered: number;
      exceptions: number;
      active: number;
      customers: Map<string, number>;
      serviceTiers: Map<string, number>;
    }
  >();

  for (const shipment of shipments) {
    const route = shipment.route_name || `${compactLocation(shipment.origin)} -> ${compactLocation(shipment.destination)}`;
    const current = groups.get(route) ?? {
      route,
      total: 0,
      delivered: 0,
      exceptions: 0,
      active: 0,
      customers: new Map<string, number>(),
      serviceTiers: new Map<string, number>()
    };

    current.total += 1;
    if (shipment.status === "DELIVERED") current.delivered += 1;
    if (["FAILED_DELIVERY", "RETURNED", "CANCELLED", "EXCEPTION"].includes(shipment.status)) current.exceptions += 1;
    if (["PENDING", "PROCESSING", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"].includes(shipment.status)) current.active += 1;
    current.customers.set(shipment.customer_name, (current.customers.get(shipment.customer_name) ?? 0) + 1);
    current.serviceTiers.set(shipment.service_tier, (current.serviceTiers.get(shipment.service_tier) ?? 0) + 1);
    groups.set(route, current);
  }

  return [...groups.values()]
    .map((group) => ({
      route: group.route,
      total: group.total,
      delivered: group.delivered,
      exceptions: group.exceptions,
      active: group.active,
      topCustomer: topMapEntry(group.customers),
      serviceTier: topMapEntry(group.serviceTiers),
      healthPct: group.total > 0 ? Math.round(((group.total - group.exceptions) / group.total) * 1000) / 10 : 0
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
}

function topMapEntry(map: Map<string, number>) {
  return [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Not available";
}

function compactLocation(value: string) {
  return value.split(",")[0]?.trim() || "Unknown";
}

function formatChartDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC"
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function formatDelta(value: number) {
  const rounded = Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(1);
  return `${value >= 0 ? "+" : ""}${rounded}%`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function activityBadgeVariant(type: ActivityEntry["type"]): BadgeVariant {
  if (type === "shipment") return "primary";
  if (type === "ticket") return "success";
  if (type === "invoice") return "info";
  if (type === "return") return "warning";
  return "neutral";
}

function routeHealthVariant(value: number): BadgeVariant {
  if (value >= 95) return "success";
  if (value >= 85) return "warning";
  return "error";
}

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function activityIcon(type: ActivityEntry["type"]) {
  if (type === "shipment") return <Truck size={16} />;
  if (type === "ticket") return <MessageSquare size={16} />;
  if (type === "invoice") return <ReceiptText size={16} />;
  if (type === "return") return <RotateCcw size={16} />;
  return <Shield size={16} />;
}

function ChartCard({
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

function AnalyticsKpiCard({
  label,
  value,
  formatter,
  changePct,
  positiveIsGood = true,
  icon
}: {
  label: string;
  value: number;
  formatter?: (value: number) => string;
  changePct: number;
  positiveIsGood?: boolean;
  icon: ReactNode;
}) {
  const favorable = positiveIsGood ? changePct >= 0 : changePct <= 0;
  const TrendIcon = changePct >= 0 ? TrendingUp : TrendingDown;

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
        {formatDelta(changePct)} vs previous period
      </p>
    </div>
  );
}

export function AnalyticsPage() {
  const tenant = useTenantStore((state) => state.tenant);
  const initial = presetRange("30d");
  const [activePreset, setActivePreset] = useState<AnalyticsPreset>("30d");
  const [range, setRange] = useState<DateRange>(initial);

  const overviewQuery = useQuery({
    queryKey: ["analytics-full-dashboard", range.dateFrom, range.dateTo],
    queryFn: () => fetchAnalyticsFull(range),
    refetchInterval: 60_000,
    retry: 1
  });

  const shipmentAnalyticsQuery = useQuery({
    queryKey: ["analytics-shipments-dashboard", range.dateFrom, range.dateTo],
    queryFn: () => fetchShipmentAnalytics(range),
    refetchInterval: 60_000,
    retry: 1
  });

  const shipmentsQuery = useQuery({
    queryKey: ["analytics-top-routes-dashboard", range.dateFrom, range.dateTo],
    queryFn: () => fetchShipmentsInRange(range),
    refetchInterval: 60_000,
    retry: 1
  });

  const activityQuery = useQuery({
    queryKey: ["analytics-activity-dashboard", activePreset],
    queryFn: () => fetchActivityFeed(activePreset),
    refetchInterval: 60_000,
    retry: 1
  });

  const overview = overviewQuery.data ?? EMPTY_OVERVIEW;
  const shipmentAnalytics = shipmentAnalyticsQuery.data ?? EMPTY_SHIPMENT_ANALYTICS;
  const shipments = useMemo(() => shipmentsQuery.data ?? [], [shipmentsQuery.data]);
  const activity = activityQuery.data ?? [];
  const failedSections = [
    { label: "Overview", query: overviewQuery },
    { label: "Shipment status", query: shipmentAnalyticsQuery },
    { label: "Routes", query: shipmentsQuery },
    { label: "Activity", query: activityQuery }
  ].filter((section) => section.query.isError);
  const volumeData = useMemo(() => buildVolumeData(range, overview.volumeByDay), [overview.volumeByDay, range]);
  const statusBreakdown = useMemo(() => buildStatusBreakdown(shipmentAnalytics), [shipmentAnalytics]);
  const topRoutes = useMemo(() => buildTopRoutes(shipments), [shipments]);
  const onTimeSeries = useMemo(
    () => buildOnTimeSeries(volumeData, overview.totals.onTimeRate.value),
    [overview.totals.onTimeRate.value, volumeData]
  );
  const hasVolume = volumeData.some((entry) => entry.shipments > 0);
  const hasStatusBreakdown = statusBreakdown.some((entry) =>
    statusBars.some((bar) => Number(entry[bar.key as keyof typeof entry]) > 0)
  );
  const hasOnTime = onTimeSeries.some((entry) => entry.onTimeRate > 0);
  const primaryColor = "var(--tenant-primary)";

  const handlePresetChange = (preset: AnalyticsPreset) => {
    setActivePreset(preset);
    setRange(presetRange(preset));
  };

  return (
    <PageShell title="Analytics" description="Tenant performance metrics across shipment, SLA, route, and activity workflows.">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          {analyticsPresets.map((preset) => (
            <Button
              key={preset.value}
              variant="secondary"
              size="sm"
              className={cn(
                activePreset === preset.value && "border-[var(--tenant-primary)] text-[var(--tenant-primary)]"
              )}
              onClick={() => handlePresetChange(preset.value)}
            >
              {preset.label}
            </Button>
          ))}
        </div>

        {failedSections.length > 0 ? (
          <ErrorState
            title="Some analytics could not be loaded"
            description={`${failedSections.map((section) => section.label).join(", ")}: ${apiErrorMessage(failedSections[0].query.error, "the server returned an error")}. Those sections show no data until this is fixed.`}
            onRetry={() => failedSections.forEach((section) => void section.query.refetch())}
          />
        ) : null}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-12">
          {overviewQuery.isError ? null : overviewQuery.isLoading && !overviewQuery.data ? (
            Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-[154px] rounded-xl xl:col-span-3" />
            ))
          ) : (
            <>
              <AnalyticsKpiCard
                label="Total shipments"
                value={overview.totals.shipments.value}
                changePct={overview.totals.shipments.changePct}
                icon={<PackageCheck size={18} />}
              />
              <AnalyticsKpiCard
                label="Revenue"
                value={overview.totals.revenue.value}
                changePct={overview.totals.revenue.changePct}
                formatter={(value) => formatCurrency(value, tenant)}
                icon={<FileText size={18} />}
              />
              <AnalyticsKpiCard
                label="On-time rate"
                value={overview.totals.onTimeRate.value}
                changePct={overview.totals.onTimeRate.changePct}
                formatter={(value) => `${value.toFixed(1)}%`}
                icon={<Clock3 size={18} />}
              />
              <AnalyticsKpiCard
                label="Avg delivery days"
                value={overview.totals.avgDeliveryDays.value}
                changePct={overview.totals.avgDeliveryDays.changePct}
                positiveIsGood={false}
                formatter={(value) => `${value.toFixed(1)}d`}
                icon={<Truck size={18} />}
              />
            </>
          )}

          <ChartCard
            title="Shipment Volume"
            description="Daily shipment creation across the selected range."
            className="sm:col-span-2 xl:col-span-8"
          >
            {overviewQuery.isLoading && !overviewQuery.data ? (
              <Skeleton className="h-72 w-full rounded-lg" />
            ) : hasVolume ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={volumeData} margin={{ left: -10, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: chartTickColor }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: chartTickColor }} tickLine={false} axisLine={false} />
                    <Tooltip
                      cursor={{ fill: "rgba(17, 24, 39, 0.04)" }}
                      formatter={(value) => [Number(value).toLocaleString(), "Shipments"]}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""}
                    />
                    <Bar dataKey="shipments" fill={primaryColor} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState icon={PackageCheck} title="No shipment volume yet" description="Shipment volume appears once shipments are created in this date range." />
            )}
          </ChartCard>

          <ChartCard
            title="Activity Feed"
            description="Recent shipment, finance, support, return, and audit events."
            className="sm:col-span-2 xl:col-span-4"
          >
            {activityQuery.isLoading && !activityQuery.data ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Skeleton key={index} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            ) : activity.length > 0 ? (
              <div className="space-y-3">
                {activity.slice(0, 6).map((entry) => (
                  <Link
                    key={entry.id}
                    to={entry.link}
                    className="flex items-start gap-3 rounded-lg border border-gray-200 px-3 py-3 transition hover:border-gray-300 hover:bg-gray-50"
                  >
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-700">
                      {activityIcon(entry.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-semibold text-gray-900">{entry.title}</p>
                        <Badge variant={activityBadgeVariant(entry.type)}>{titleCase(entry.type)}</Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-gray-600">{entry.subtitle}</p>
                      <p className="mt-2 text-xs text-gray-500">{formatDateTime(entry.timestamp, tenant)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState icon={Activity} title="No activity yet" description="Operational events appear here as shipment and finance workflows move." />
            )}
          </ChartCard>

          <ChartCard
            title="Status Breakdown"
            description="Stacked operational status mix for shipments in range."
            className="sm:col-span-2 xl:col-span-6"
          >
            {shipmentAnalyticsQuery.isLoading && !shipmentAnalyticsQuery.data ? (
              <Skeleton className="h-72 w-full rounded-lg" />
            ) : hasStatusBreakdown ? (
              <div className="space-y-4">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statusBreakdown} layout="vertical" margin={{ left: 12, right: 12, top: 8, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 11, fill: chartTickColor }} tickLine={false} axisLine={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: chartTickColor }} tickLine={false} axisLine={false} />
                      <Tooltip
                        formatter={(value, name) => [
                          Number(value).toLocaleString(),
                          statusBars.find((bar) => bar.key === String(name))?.label ?? String(name)
                        ]}
                      />
                      {statusBars.map((bar) => (
                        <Bar key={bar.key} dataKey={bar.key} stackId="statuses" fill={bar.color} radius={bar.key === "exceptions" ? [0, 6, 6, 0] : 0} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex flex-wrap gap-2">
                  {statusBars.map((bar) => (
                    <span key={bar.key} className="inline-flex items-center gap-2 text-xs text-gray-600">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: bar.color }} />
                      {bar.label}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState icon={AlertTriangle} title="No status data yet" description="Status distribution appears once shipment events are recorded." />
            )}
          </ChartCard>

          <ChartCard
            title="On-Time Rate"
            description="SLA compliance across the selected range."
            className="sm:col-span-2 xl:col-span-6"
          >
            {overviewQuery.isLoading && !overviewQuery.data ? (
              <Skeleton className="h-72 w-full rounded-lg" />
            ) : hasOnTime ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={onTimeSeries} margin={{ left: -10, right: 12, top: 8, bottom: 0 }}>
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
                      formatter={(value) => [`${Number(value).toFixed(1)}%`, "On-time rate"]}
                      labelFormatter={(_, payload) => payload?.[0]?.payload?.date ?? ""}
                    />
                    <Line
                      type="monotone"
                      dataKey="onTimeRate"
                      stroke="var(--color-success)"
                      strokeWidth={3}
                      dot={false}
                      activeDot={{ r: 5, strokeWidth: 0, fill: "var(--color-success)" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState icon={Clock3} title="No SLA data yet" description="On-time performance appears once delivered shipments can be measured." />
            )}
          </ChartCard>

          <ChartCard
            title="Top Routes"
            description="Highest-volume lanes and operational health for the selected range."
            className="sm:col-span-2 xl:col-span-12"
          >
            {shipmentsQuery.isLoading && !shipmentsQuery.data ? (
              <div className="space-y-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : topRoutes.length > 0 ? (
              <Table columns={["Route", "Shipments", "Delivered", "Active", "Exceptions", "Top customer", "Service", "Health"]} className="border-0">
                {topRoutes.map((route) => (
                  <TableRow key={route.route}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Route size={15} className="text-gray-400" />
                        <span className="font-semibold text-gray-900">{route.route}</span>
                      </div>
                    </TableCell>
                    <TableCell>{route.total.toLocaleString()}</TableCell>
                    <TableCell>{route.delivered.toLocaleString()}</TableCell>
                    <TableCell>{route.active.toLocaleString()}</TableCell>
                    <TableCell>{route.exceptions.toLocaleString()}</TableCell>
                    <TableCell>{route.topCustomer}</TableCell>
                    <TableCell>{route.serviceTier}</TableCell>
                    <TableCell>
                      <Badge variant={routeHealthVariant(route.healthPct)}>{route.healthPct.toFixed(1)}%</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </Table>
            ) : (
              <EmptyState icon={Route} title="No route activity yet" description="Top routes appear once shipments are created in this date range." />
            )}
          </ChartCard>
        </div>
      </div>
    </PageShell>
  );
}
