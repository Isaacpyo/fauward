import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  Clock3,
  MapPinned,
  PackageCheck,
  ReceiptText,
  Route,
  ShieldAlert,
  Ticket,
  Truck,
} from "lucide-react";
import { Link } from "react-router-dom";

import { DashboardChecklist } from "@/components/onboarding/DashboardChecklist";
import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { PageShell } from "@/layouts/PageShell";
import { getAccessToken } from "@/lib/auth";
import { api } from "@/lib/api";
import { formatCurrency, formatDateTime, cn } from "@/lib/utils";
import { useAppStore } from "@/stores/useAppStore";
import { useTenantStore } from "@/stores/useTenantStore";

type TrendMetric = {
  value: number;
  previousValue: number;
  changePct: number;
};

type AnalyticsFullResponse = {
  totals: {
    shipments: TrendMetric;
    revenue: TrendMetric;
    onTimeRate: TrendMetric;
    avgDeliveryDays: TrendMetric;
  };
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

type RevenueAnalyticsResponse = {
  byServiceTier: Array<{ serviceTier: string; revenue: number }>;
  topCustomers: Array<{ customerId: string; customerName: string; revenue: number }>;
  collectionRate: number;
};

type FinanceSummaryResponse = {
  totalInvoiced: number;
  collected: number;
  outstanding: number;
  overdue: number;
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

type ActivityResponse = {
  entries: ActivityEntry[];
};

type LiveMapShipment = {
  shipmentId: string;
  trackingNumber: string;
  lat: number;
  lng: number;
  status: string;
  driverName: string | null;
  recipientName: string;
  estimatedDelivery?: string | null;
  origin: string;
  destination: string;
};

type LiveMapResponse = {
  shipments: LiveMapShipment[];
};

type StaffRow = {
  staffId: string;
  staffName: string;
  role: string;
  shipmentsProcessed: number;
  completedStops: number;
  avgHandleMinutes: number;
};

type StaffAnalyticsResponse = {
  data: StaffRow[];
};

type OnboardingResponse = {
  paymentConnected?: boolean;
};

type ShipmentsMetaResponse = {
  data: unknown[];
  meta: {
    total: number;
  };
};

type SupportTicketsResponse = {
  tickets: unknown[];
  total: number;
};

const fallbackOverview: AnalyticsFullResponse = {
  totals: {
    shipments: { value: 124, previousValue: 111, changePct: 11.7 },
    revenue: { value: 58320, previousValue: 53400, changePct: 9.2 },
    onTimeRate: { value: 96.4, previousValue: 94.1, changePct: 2.4 },
    avgDeliveryDays: { value: 1.8, previousValue: 2.1, changePct: -14.3 }
  }
};

const fallbackShipmentAnalytics: ShipmentAnalyticsResponse = {
  lifecycleFunnel: [
    { status: "PENDING", count: 26, pct: 100 },
    { status: "PROCESSING", count: 24, pct: 92.3 },
    { status: "PICKED_UP", count: 21, pct: 80.8 },
    { status: "IN_TRANSIT", count: 19, pct: 73.1 },
    { status: "OUT_FOR_DELIVERY", count: 14, pct: 53.8 },
    { status: "DELIVERED", count: 11, pct: 42.3 },
    { status: "FAILED_DELIVERY", count: 3, pct: 11.5 },
    { status: "RETURNED", count: 1, pct: 3.8 }
  ],
  slaCompliance: {
    onTime: 108,
    late: 7,
    compliancePct: 93.9,
    avgDeliveryHours: 28.4,
    breachesByReason: [
      { reason: "FAILED_DELIVERY", count: 3 },
      { reason: "EXCEPTION", count: 4 }
    ]
  },
  exceptions: {
    activeExceptions: 6,
    stalePendingOver24h: 4,
    failedDeliveryRate: 6.2,
    topExceptionRoutes: [
      { route: "Lagos -> London", count: 3 },
      { route: "Abuja -> Manchester", count: 2 },
      { route: "Birmingham -> Glasgow", count: 1 }
    ]
  }
};

const fallbackFinanceSummary: FinanceSummaryResponse = {
  totalInvoiced: 124000,
  collected: 91350,
  outstanding: 32650,
  overdue: 8200
};

const fallbackRevenueAnalytics: RevenueAnalyticsResponse = {
  byServiceTier: [
    { serviceTier: "EXPRESS", revenue: 28210 },
    { serviceTier: "STANDARD", revenue: 18450 },
    { serviceTier: "SAME_DAY", revenue: 11660 }
  ],
  topCustomers: [
    { customerId: "cust-1", customerName: "Acme Retail", revenue: 18420 },
    { customerId: "cust-2", customerName: "Northline Logistics", revenue: 14980 },
    { customerId: "cust-3", customerName: "PortBridge", revenue: 11830 }
  ],
  collectionRate: 78.6
};

const fallbackActivity: ActivityEntry[] = [
  {
    id: "activity-1",
    type: "shipment",
    title: "Shipment FWD-2026-00051 out for delivery",
    subtitle: "Assigned to Amina Yusuf for the west London run",
    link: "/shipments",
    timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    icon: "truck",
    colour: "blue"
  },
  {
    id: "activity-2",
    type: "ticket",
    title: "Support issue opened",
    subtitle: "Need POD photo for invoice dispute",
    link: "/support",
    timestamp: new Date(Date.now() - 1000 * 60 * 26).toISOString(),
    icon: "message-square",
    colour: "emerald"
  },
  {
    id: "activity-3",
    type: "invoice",
    title: "Invoice FW-INV-2026-0012 paid",
    subtitle: "4,820.00 GBP settled via Stripe",
    link: "/finance",
    timestamp: new Date(Date.now() - 1000 * 60 * 48).toISOString(),
    icon: "file-text",
    colour: "violet"
  },
  {
    id: "activity-4",
    type: "return",
    title: "Return approved",
    subtitle: "Reattempt exceeded for customer order RET-284",
    link: "/returns",
    timestamp: new Date(Date.now() - 1000 * 60 * 82).toISOString(),
    icon: "rotate-ccw",
    colour: "amber"
  }
];

const fallbackMapShipments: LiveMapShipment[] = [
  {
    shipmentId: "map-1",
    trackingNumber: "FWD-2026-00051",
    lat: 51.509,
    lng: -0.118,
    status: "OUT_FOR_DELIVERY",
    driverName: "Amina Yusuf",
    recipientName: "Acme Retail",
    estimatedDelivery: new Date(Date.now() + 1000 * 60 * 45).toISOString(),
    origin: "Heathrow Hub",
    destination: "Soho, London"
  },
  {
    shipmentId: "map-2",
    trackingNumber: "FWD-2026-00048",
    lat: 51.515,
    lng: -0.072,
    status: "IN_TRANSIT",
    driverName: "Daniel Cole",
    recipientName: "Northline Logistics",
    estimatedDelivery: new Date(Date.now() + 1000 * 60 * 90).toISOString(),
    origin: "Barking Hub",
    destination: "Canary Wharf"
  },
  {
    shipmentId: "map-3",
    trackingNumber: "FWD-2026-00042",
    lat: 51.486,
    lng: -0.135,
    status: "OUT_FOR_DELIVERY",
    driverName: "Lara Okafor",
    recipientName: "PortBridge",
    estimatedDelivery: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    origin: "Croydon Hub",
    destination: "Vauxhall"
  }
];

const fallbackStaff: StaffRow[] = [
  { staffId: "staff-1", staffName: "Amina Yusuf", role: "TENANT_DRIVER", shipmentsProcessed: 9, completedStops: 7, avgHandleMinutes: 11.2 },
  { staffId: "staff-2", staffName: "Daniel Cole", role: "TENANT_DRIVER", shipmentsProcessed: 7, completedStops: 6, avgHandleMinutes: 13.1 },
  { staffId: "staff-3", staffName: "Lara Okafor", role: "TENANT_DRIVER", shipmentsProcessed: 3, completedStops: 2, avgHandleMinutes: 9.6 }
];

const fallbackActiveDeliveryCount = 53;
const fallbackOpenTicketCount = 4;

function DashboardShimmer() {
  return (
    <PageShell title="Dashboard" description="Loading your operational command centre.">
      <div className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-4 h-8 w-20" />
              <Skeleton className="mt-3 h-3 w-32" />
            </div>
          ))}
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-72 rounded-2xl" />
        </div>
        <div className="grid gap-4 xl:grid-cols-[1.3fr,0.7fr]">
          <Skeleton className="h-80 rounded-2xl" />
          <div className="space-y-3">
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
            <Skeleton className="h-24 rounded-2xl" />
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function daysAgo(days: number) {
  const date = startOfDay();
  date.setDate(date.getDate() - days);
  return date;
}

function buildRangeQuery(dateFrom: Date, dateTo = new Date()) {
  return new URLSearchParams({
    dateFrom: dateFrom.toISOString(),
    dateTo: dateTo.toISOString()
  }).toString();
}

function formatDelta(value: number, suffix = "%") {
  const rounded = Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(1);
  return `${value >= 0 ? "+" : ""}${rounded}${suffix}`;
}

function compactRouteLabel(route: string) {
  return route.length > 48 ? `${route.slice(0, 45)}...` : route;
}

function formatRoleLabel(role: string) {
  if (role === "TENANT_DRIVER") {
    return "Field Operator";
  }

  return role.replaceAll("_", " ").toLowerCase();
}

function queryEnabled() {
  return Boolean(getAccessToken());
}

async function fetchJson<T>(path: string) {
  const response = await api.get<T>(path);
  return response.data;
}

function queryErrorStatus(error: unknown) {
  if (typeof error !== "object" || error === null || !("response" in error)) {
    return null;
  }

  const response = (error as { response?: { status?: number } }).response;
  return response?.status ?? null;
}

function MetricCard({
  label,
  value,
  delta,
  href,
  icon,
  accent,
  subtitle
}: {
  label: string;
  value: string;
  delta: string;
  href: string;
  icon: ReactNode;
  accent: string;
  subtitle: string;
}) {
  return (
    <Link
      to={href}
      className="group flex min-h-[188px] flex-col rounded-2xl border border-gray-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-h-8 max-w-[11rem] text-[11px] font-semibold uppercase leading-4 tracking-[0.16em] text-gray-400">
          {label}
        </p>
        <div className="shrink-0 rounded-xl border border-gray-200 bg-gray-50 p-2.5 text-gray-700">{icon}</div>
      </div>
      <p className="mt-3 text-3xl font-bold leading-none text-gray-900">{value}</p>
      <p className={cn("mt-4 inline-flex min-h-8 w-fit max-w-full items-center rounded-full border px-2.5 py-1 text-xs font-semibold leading-4", accent)}>
        {delta}
      </p>
      <p className="mt-auto pt-3 text-xs leading-5 text-gray-500">{subtitle}</p>
    </Link>
  );
}

function SectionCard({
  title,
  description,
  action,
  children
}: {
  title: string;
  description: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function SectionLoading({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-14 w-full rounded-xl" />
      ))}
    </div>
  );
}

function MapSnapshot({ shipments }: { shipments: LiveMapShipment[] }) {
  const points = useMemo(() => {
    if (shipments.length === 0) {
      return [];
    }

    const latitudes = shipments.map((shipment) => shipment.lat);
    const longitudes = shipments.map((shipment) => shipment.lng);
    const minLat = Math.min(...latitudes);
    const maxLat = Math.max(...latitudes);
    const minLng = Math.min(...longitudes);
    const maxLng = Math.max(...longitudes);

    return shipments.map((shipment, index) => {
      const xSpan = maxLng - minLng || 1;
      const ySpan = maxLat - minLat || 1;
      const left = ((shipment.lng - minLng) / xSpan) * 78 + 8;
      const top = 82 - ((shipment.lat - minLat) / ySpan) * 64;
      return {
        ...shipment,
        left,
        top,
        emphasis: index === 0 || index === shipments.length - 1
      };
    });
  }, [shipments]);

  if (shipments.length === 0) {
    return (
      <EmptyState
        icon={MapPinned}
        title="No active locations yet"
        description="Field operator locations and route clusters appear here once live shipment telemetry is available."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="relative h-56 overflow-hidden rounded-2xl border border-gray-200 bg-gray-50">
        <div className="absolute inset-0 opacity-60">
          <div className="absolute inset-x-6 top-10 h-px bg-slate-200" />
          <div className="absolute inset-x-6 top-24 h-px bg-slate-200" />
          <div className="absolute inset-x-6 top-40 h-px bg-slate-200" />
          <div className="absolute inset-y-6 left-16 w-px bg-slate-200" />
          <div className="absolute inset-y-6 left-1/2 w-px bg-slate-200" />
          <div className="absolute inset-y-6 right-16 w-px bg-slate-200" />
        </div>
        {points.map((point) => (
          <div
            key={point.shipmentId}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${point.left}%`, top: `${point.top}%` }}
          >
            <div
              className={cn(
                "h-3.5 w-3.5 rounded-full border-2 border-white shadow",
                point.status === "OUT_FOR_DELIVERY" ? "bg-[var(--tenant-primary)]" : "bg-gray-500"
              )}
            />
            {point.emphasis ? (
              <div className="mt-2 rounded-full bg-slate-900/85 px-2 py-1 text-[11px] font-semibold text-white">
                {point.trackingNumber}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Active field operators</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">
            {new Set(shipments.map((shipment) => shipment.driverName).filter(Boolean)).size}
          </p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Live shipments</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">{shipments.length}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Delayed hotspots</p>
          <p className="mt-2 text-2xl font-semibold text-gray-900">
            {
              shipments.filter((shipment) => shipment.estimatedDelivery && new Date(shipment.estimatedDelivery) < new Date()).length
            }
          </p>
        </div>
      </div>
    </div>
  );
}

export function TenantDashboardPage() {
  const [showShimmer, setShowShimmer] = useState(true);
  const tenant = useTenantStore((state) => state.tenant);
  const user = useAppStore((state) => state.user);
  const dashboardChecklistDismissed = useAppStore((state) => state.dashboardChecklistDismissed);
  const setDashboardChecklistDismissed = useAppStore((state) => state.setDashboardChecklistDismissed);
  const hasApiSession = queryEnabled();

  const todayRange = useMemo(() => buildRangeQuery(startOfDay()), []);
  const weekRange = useMemo(() => buildRangeQuery(daysAgo(6)), []);

  const overviewQuery = useQuery({
    queryKey: ["dashboard-overview", todayRange],
    queryFn: () => fetchJson<AnalyticsFullResponse>(`/v1/analytics/full?${todayRange}`),
    enabled: hasApiSession,
    retry: false,
    refetchInterval: 60_000
  });

  const shipmentAnalyticsTodayQuery = useQuery({
    queryKey: ["dashboard-shipment-analytics", todayRange],
    queryFn: () => fetchJson<ShipmentAnalyticsResponse>(`/v1/analytics/shipments?${todayRange}`),
    enabled: hasApiSession,
    retry: false,
    refetchInterval: 60_000
  });

  const shipmentAnalyticsWeekQuery = useQuery({
    queryKey: ["dashboard-shipment-analytics-week", weekRange],
    queryFn: () => fetchJson<ShipmentAnalyticsResponse>(`/v1/analytics/shipments?${weekRange}`),
    enabled: hasApiSession,
    retry: false,
    refetchInterval: 60_000
  });

  const activeDeliveriesQuery = useQuery({
    queryKey: ["dashboard-active-deliveries"],
    queryFn: () => fetchJson<ShipmentsMetaResponse>("/v1/shipments?status=IN_TRANSIT,OUT_FOR_DELIVERY&limit=1"),
    enabled: hasApiSession,
    retry: false,
    refetchInterval: 60_000
  });

  const supportOpenQuery = useQuery({
    queryKey: ["dashboard-open-tickets"],
    queryFn: () => fetchJson<SupportTicketsResponse>("/v1/support/tickets?status=OPEN&limit=1"),
    enabled: hasApiSession,
    retry: false,
    refetchInterval: 60_000
  });

  const activityQuery = useQuery({
    queryKey: ["dashboard-activity"],
    queryFn: () => fetchJson<ActivityResponse>("/v1/activity?timeframe=24h"),
    enabled: hasApiSession,
    retry: false,
    refetchInterval: 60_000
  });

  const liveMapQuery = useQuery({
    queryKey: ["dashboard-live-map"],
    queryFn: () => fetchJson<LiveMapResponse>("/v1/shipments/live-map"),
    enabled: hasApiSession,
    retry: false,
    refetchInterval: 60_000
  });

  const financeSummaryQuery = useQuery({
    queryKey: ["dashboard-finance-summary"],
    queryFn: () => fetchJson<FinanceSummaryResponse>("/v1/finance/summary"),
    enabled: hasApiSession,
    retry: false,
    refetchInterval: 60_000
  });

  const revenueQuery = useQuery({
    queryKey: ["dashboard-revenue-analytics", weekRange],
    queryFn: () => fetchJson<RevenueAnalyticsResponse>(`/v1/analytics/revenue?${weekRange}`),
    enabled: hasApiSession,
    retry: false,
    refetchInterval: 60_000
  });

  const staffQuery = useQuery({
    queryKey: ["dashboard-staff-analytics", weekRange],
    queryFn: () => fetchJson<StaffAnalyticsResponse>(`/v1/analytics/staff?${weekRange}`),
    enabled: hasApiSession,
    retry: false,
    refetchInterval: 60_000
  });

  const onboardingQuery = useQuery({
    queryKey: ["dashboard-onboarding-state"],
    queryFn: () => fetchJson<OnboardingResponse>("/v1/tenant/onboarding"),
    enabled: hasApiSession,
    retry: false,
    refetchInterval: 60_000
  });

  const overview = overviewQuery.data ?? fallbackOverview;
  const shipmentAnalyticsToday = shipmentAnalyticsTodayQuery.data ?? fallbackShipmentAnalytics;
  const shipmentAnalyticsWeek = shipmentAnalyticsWeekQuery.data ?? fallbackShipmentAnalytics;
  const activity = activityQuery.data?.entries ?? fallbackActivity;
  const liveShipments = liveMapQuery.data?.shipments ?? fallbackMapShipments;
  const financeSummary = financeSummaryQuery.data ?? fallbackFinanceSummary;
  const revenue = revenueQuery.data ?? fallbackRevenueAnalytics;
  const staff = staffQuery.data?.data ?? fallbackStaff;

  const deliveredToday =
    shipmentAnalyticsToday.lifecycleFunnel.find((entry) => entry.status === "DELIVERED")?.count ?? 0;
  const activeDeliveries = activeDeliveriesQuery.data?.meta.total ?? fallbackActiveDeliveryCount;
  const openTickets = supportOpenQuery.data?.total ?? fallbackOpenTicketCount;
  const mapDriversOnline = new Set(liveShipments.map((shipment) => shipment.driverName).filter(Boolean)).size;
  const overloadedDrivers = staff.filter((row) => row.shipmentsProcessed >= 8).length;
  const totalDriverWorkload = staff.reduce((sum, row) => sum + row.shipmentsProcessed, 0);
  const averageJobsPerDriver = staff.length > 0 ? totalDriverWorkload / staff.length : 0;
  const riskItems = [
    {
      label: "Overdue pending jobs",
      value: shipmentAnalyticsWeek.exceptions.stalePendingOver24h,
      tone: "border-amber-200 bg-amber-50 text-amber-900",
      hint: "Shipments stuck without progress for more than 24 hours.",
      href: "/shipments?status=PENDING"
    },
    {
      label: "Active exceptions",
      value: shipmentAnalyticsWeek.exceptions.activeExceptions,
      tone: "border-amber-200 bg-amber-50 text-amber-900",
      hint: "Operational exceptions needing intervention.",
      href: "/shipments?status=EXCEPTION"
    },
    {
      label: "Failed delivery rate",
      value: `${shipmentAnalyticsWeek.exceptions.failedDeliveryRate.toFixed(1)}%`,
      tone: "border-gray-200 bg-gray-50 text-gray-800",
      hint: "Share of out-for-delivery jobs ending in a failed attempt.",
      href: "/analytics"
    },
    {
      label: "Open support cases",
      value: openTickets,
      tone: "border-gray-200 bg-gray-50 text-gray-800",
      hint: "Tickets still open across customer and ops support.",
      href: "/support"
    }
  ];
  const financeForbidden = queryErrorStatus(financeSummaryQuery.error) === 403 || queryErrorStatus(revenueQuery.error) === 403;

  useEffect(() => {
    const timer = window.setTimeout(() => setShowShimmer(false), 1400);
    return () => window.clearTimeout(timer);
  }, []);

  if (showShimmer) {
    return <DashboardShimmer />;
  }

  return (
    <PageShell
      title="Dashboard"
      description={`Welcome back${user ? `, ${user.full_name}` : ""}. Operational command centre across shipments, finance, fleet, and support.`}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <Link to="/operations/live-map">Open live map</Link>
          </Button>
          <Button asChild>
            <Link to="/shipments/create">Create shipment</Link>
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {!hasApiSession ? (
          <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Dev session detected. Dashboard widgets fall back to local sample data until a real API token is present.
          </div>
        ) : null}

        <SectionCard
          title="Action Centre"
          description="High-frequency operational shortcuts for dispatch, support, reporting, and team management."
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Create shipment",
                to: "/shipments/create",
                className: "border-gray-200 bg-white text-gray-800 hover:border-[var(--tenant-primary)] hover:bg-gray-50"
              },
              {
                label: "Bulk import",
                to: "/reports",
                className: "border-gray-200 bg-white text-gray-800 hover:border-[var(--tenant-primary)] hover:bg-gray-50"
              },
              {
                label: "Dispatch jobs",
                to: "/dispatch",
                className: "border-gray-200 bg-white text-gray-800 hover:border-[var(--tenant-primary)] hover:bg-gray-50"
              },
              {
                label: "Build route",
                to: "/routes",
                className: "border-gray-200 bg-white text-gray-800 hover:border-[var(--tenant-primary)] hover:bg-gray-50"
              },
              {
                label: "Raise support case",
                to: "/support",
                className: "border-gray-200 bg-white text-gray-800 hover:border-[var(--tenant-primary)] hover:bg-gray-50"
              },
              {
                label: "Invite team",
                to: "/team",
                className: "border-gray-200 bg-white text-gray-800 hover:border-[var(--tenant-primary)] hover:bg-gray-50"
              },
              {
                label: "Export report",
                to: "/reports",
                className: "border-gray-200 bg-white text-gray-800 hover:border-[var(--tenant-primary)] hover:bg-gray-50"
              },
              {
                label: "Open live map",
                to: "/operations/live-map",
                className: "border-gray-200 bg-white text-gray-800 hover:border-[var(--tenant-primary)] hover:bg-gray-50"
              }
            ].map((action) => (
              <Button
                key={action.label}
                asChild
                variant="secondary"
                className={cn("justify-between border font-semibold", action.className)}
              >
                <Link to={action.to}>
                  {action.label}
                  <ArrowRight size={14} />
                </Link>
              </Button>
            ))}
          </div>
        </SectionCard>

        <div className="grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-3">
          <MetricCard
            label="Shipments today"
            value={String(overview.totals.shipments.value)}
            delta={`${formatDelta(overview.totals.shipments.changePct)} vs previous window`}
            href="/shipments?datePreset=today"
            icon={<PackageCheck size={18} />}
            accent={overview.totals.shipments.changePct >= 0 ? "border-gray-200 bg-gray-50 text-gray-700" : "border-amber-200 bg-amber-50 text-amber-900"}
            subtitle="New shipments created since midnight"
          />
          <MetricCard
            label="Active deliveries"
            value={String(activeDeliveries)}
            delta={`${activeDeliveries} live in transit or out for delivery`}
            href="/shipments?status=IN_TRANSIT,OUT_FOR_DELIVERY"
            icon={<Truck size={18} />}
            accent="border-gray-200 bg-gray-50 text-gray-700"
            subtitle="Click through to the filtered shipment queue"
          />
          <MetricCard
            label="Delivered today"
            value={String(deliveredToday)}
            delta={`${shipmentAnalyticsToday.slaCompliance.onTime} on time today`}
            href="/shipments?status=DELIVERED"
            icon={<PackageCheck size={18} />}
            accent="border-gray-200 bg-gray-50 text-gray-700"
            subtitle="Completed delivery events in the current day"
          />
          <MetricCard
            label="Exception queue"
            value={String(shipmentAnalyticsWeek.exceptions.activeExceptions)}
            delta={`${shipmentAnalyticsWeek.exceptions.stalePendingOver24h} ageing jobs over 24h`}
            href="/shipments?status=EXCEPTION"
            icon={<ShieldAlert size={18} />}
            accent="border-amber-200 bg-amber-50 text-amber-900"
            subtitle="Operational incidents requiring manual follow-up"
          />
          <MetricCard
            label="Support tickets"
            value={String(openTickets)}
            delta={`${activity.filter((entry) => entry.type === "ticket").length} ticket events in 24h`}
            href="/support"
            icon={<Ticket size={18} />}
            accent="border-gray-200 bg-gray-50 text-gray-700"
            subtitle="Open customer and operations cases"
          />
          <MetricCard
            label="SLA compliance"
            value={`${shipmentAnalyticsWeek.slaCompliance.compliancePct.toFixed(1)}%`}
            delta={`${shipmentAnalyticsWeek.slaCompliance.late} late deliveries in range`}
            href="/analytics"
            icon={<Clock3 size={18} />}
            accent="border-gray-200 bg-gray-50 text-gray-700"
            subtitle="On-time performance across delivered shipments"
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.45fr,0.95fr]">
          <div className="space-y-6">
            {tenant?.onboarding_complete === false && !dashboardChecklistDismissed ? (
              <DashboardChecklist
                state={{
                  brandConfigured: Boolean(tenant?.name),
                  firstShipmentCreated: overview.totals.shipments.value > 0,
                  teamInvited: staff.length > 1,
                  paymentsConnected: onboardingQuery.data?.paymentConnected ?? financeSummary.collected > 0,
                  domainConfigured: Boolean(tenant?.domain)
                }}
                onDismiss={() => setDashboardChecklistDismissed(true)}
              />
            ) : null}

            <SectionCard
              title="Exception and Risk Panel"
              description="High-priority problems that need intervention before they cascade into missed SLAs."
              action={
                <Button asChild variant="secondary" size="sm">
                  <Link to="/shipments?status=EXCEPTION">View exception queue</Link>
                </Button>
              }
            >
              {shipmentAnalyticsWeekQuery.isLoading && hasApiSession ? (
                <SectionLoading />
              ) : (
                <div className="space-y-3">
                  {riskItems.map((item) => (
                    <Link
                      key={item.label}
                      to={item.href}
                      className={cn("flex items-start justify-between gap-4 rounded-xl border px-4 py-3 transition hover:shadow-sm", item.tone)}
                    >
                      <div>
                        <p className="text-sm font-semibold">{item.label}</p>
                        <p className="mt-1 text-xs opacity-80">{item.hint}</p>
                      </div>
                      <div className="flex items-center gap-2 text-right">
                        <span className="text-2xl font-bold">{item.value}</span>
                        <ArrowRight size={16} />
                      </div>
                    </Link>
                  ))}

                  {shipmentAnalyticsWeek.exceptions.topExceptionRoutes.length > 0 ? (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-gray-900">Top exception routes</p>
                        <Badge variant="neutral">Last 7 days</Badge>
                      </div>
                      <div className="mt-3 space-y-2">
                        {shipmentAnalyticsWeek.exceptions.topExceptionRoutes.map((route) => (
                          <div key={route.route} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-sm text-gray-700">
                            <span>{compactRouteLabel(route.route)}</span>
                            <Badge variant="warning">{route.count}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Live Operations Board"
              description="Recent shipment, ticket, return, and finance events across the tenant."
              action={
                <Button asChild variant="secondary" size="sm">
                  <Link to="/activity">Open activity timeline</Link>
                </Button>
              }
            >
              {activityQuery.isLoading && hasApiSession ? (
                <SectionLoading rows={5} />
              ) : activity.length === 0 ? (
                <EmptyState
                  icon={Activity}
                  title="No live operations yet"
                  description="Shipment events, support changes, and finance actions will surface here as they happen."
                />
              ) : (
                <div className="space-y-3">
                  {activity.slice(0, 8).map((entry) => (
                    <Link
                      key={entry.id}
                      to={entry.link}
                      className="flex items-start gap-3 rounded-xl border border-gray-200 px-4 py-3 transition hover:border-gray-300 hover:bg-gray-50"
                    >
                      <div className="mt-0.5 rounded-xl bg-gray-100 p-2 text-gray-700">
                        {entry.type === "shipment" ? <Truck size={16} /> : null}
                        {entry.type === "ticket" ? <Ticket size={16} /> : null}
                        {entry.type === "invoice" ? <ReceiptText size={16} /> : null}
                        {entry.type === "return" ? <Route size={16} /> : null}
                        {entry.type === "audit" ? <ShieldAlert size={16} /> : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-gray-900">{entry.title}</p>
                          <Badge variant="neutral">{entry.type}</Badge>
                        </div>
                        <p className="mt-1 text-sm text-gray-600">{entry.subtitle}</p>
                      </div>
                      <p className="shrink-0 text-xs text-gray-500">{formatDateTime(entry.timestamp, tenant)}</p>
                    </Link>
                  ))}
                </div>
              )}
            </SectionCard>

          </div>

          <div className="space-y-6">
            <SectionCard
              title="Map Snapshot"
              description="Quick view of active field operators, live shipments, and delayed hotspots."
              action={
                <Button asChild variant="secondary" size="sm">
                  <Link to="/operations/live-map">Open live map</Link>
                </Button>
              }
            >
              {liveMapQuery.isLoading && hasApiSession ? <SectionLoading rows={3} /> : <MapSnapshot shipments={liveShipments} />}
            </SectionCard>

            <SectionCard
              title="Finance Summary"
              description="Collections, exposure, and top customer revenue over the last week."
              action={
                <Button asChild variant="secondary" size="sm">
                  <Link to="/finance">Open finance</Link>
                </Button>
              }
            >
              {financeForbidden ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Finance is plan-gated for this tenant. Upgrade the finance module to unlock invoices, payments, and collections analytics here.
                </div>
              ) : financeSummaryQuery.isLoading && hasApiSession ? (
                <SectionLoading />
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Invoiced</p>
                      <p className="mt-2 text-2xl font-semibold text-gray-900">{formatCurrency(financeSummary.totalInvoiced, tenant)}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Collected</p>
                      <p className="mt-2 text-2xl font-semibold text-gray-900">{formatCurrency(financeSummary.collected, tenant)}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Outstanding</p>
                      <p className="mt-2 text-2xl font-semibold text-gray-900">{formatCurrency(financeSummary.outstanding, tenant)}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Overdue</p>
                      <p className="mt-2 text-2xl font-semibold text-gray-900">{formatCurrency(financeSummary.overdue, tenant)}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-200 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-gray-900">Collections and top customers</p>
                      <Badge variant="primary">{revenue.collectionRate.toFixed(1)}% collection rate</Badge>
                    </div>
                    <div className="mt-3 space-y-2">
                      {revenue.topCustomers.slice(0, 4).map((customer) => (
                        <div key={customer.customerId} className="flex items-center justify-between gap-3 rounded-lg bg-gray-50 px-3 py-2 text-sm">
                          <span className="font-medium text-gray-800">{customer.customerName}</span>
                          <span className="text-gray-600">{formatCurrency(customer.revenue, tenant)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </SectionCard>

            <SectionCard
              title="Team and Fleet Health"
              description="Field operator throughput, active capacity, and workload distribution."
              action={
                <Button asChild variant="secondary" size="sm">
                  <Link to="/fleet">Open fleet</Link>
                </Button>
              }
            >
              {staffQuery.isLoading && hasApiSession ? (
                <SectionLoading />
              ) : (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Field Operators online</p>
                      <p className="mt-2 text-2xl font-semibold text-gray-900">{mapDriversOnline}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Avg jobs per field operator</p>
                      <p className="mt-2 text-2xl font-semibold text-gray-900">{averageJobsPerDriver.toFixed(1)}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Overloaded field operators</p>
                      <p className="mt-2 text-2xl font-semibold text-gray-900">{overloadedDrivers}</p>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Average handle time</p>
                      <p className="mt-2 text-2xl font-semibold text-gray-900">
                        {staff.length > 0
                          ? `${(staff.reduce((sum, row) => sum + row.avgHandleMinutes, 0) / staff.length).toFixed(1)}m`
                          : "0m"}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {staff.slice(0, 4).map((member) => (
                      <div key={member.staffId} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{member.staffName}</p>
                          <p className="text-xs text-gray-500">{formatRoleLabel(member.role)}</p>
                        </div>
                        <div className="text-right text-sm text-gray-600">
                          <p>{member.shipmentsProcessed} jobs</p>
                          <p>{member.completedStops} completed stops</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </SectionCard>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
