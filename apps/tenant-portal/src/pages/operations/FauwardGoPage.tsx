import { useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, BriefcaseBusiness, CalendarClock, ClipboardList, MapPinned, Route as RouteIcon, ShieldCheck, Smartphone, Truck, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";
import { loadRouteOptions, saveRouteOptions, type TenantRouteOption } from "@/lib/route-options";

type FieldOpsOverview = {
  kpis: {
    activeRoutes: number;
    totalStops: number;
    openStops: number;
    deliveredToday: number;
    exceptionsToday: number;
    activeDrivers: number;
  };
  routes: Array<{
    id: string;
    date: string;
    status: string;
    stopCount: number;
    completedStops: number;
  }>;
  stops: Array<{
    id: string;
    routeId: string;
    shipmentId: string;
    trackingNumber: string;
    stopOrder: number;
    type: string;
    workflowStage: string;
    shipmentStatus: string;
    address: string;
    driverName: string | null;
    estimatedAt: string | null;
    arrivedAt: string | null;
    completedAt: string | null;
  }>;
  driverLocations: Array<{
    driverId: string;
    driverName: string;
    vehicleLabel: string;
    lat: number;
    lng: number;
    lastUpdated: string | null;
  }>;
  recentEvents: Array<{
    id: string;
    shipmentId: string;
    trackingNumber: string;
    status: string;
    source: string;
    notes: string | null;
    timestamp: string;
  }>;
};

const emptyOverview: FieldOpsOverview = {
  kpis: {
    activeRoutes: 0,
    totalStops: 0,
    openStops: 0,
    deliveredToday: 0,
    exceptionsToday: 0,
    activeDrivers: 0
  },
  routes: [],
  stops: [],
  driverLocations: [],
  recentEvents: []
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

const asArray = (value: unknown) => (Array.isArray(value) ? value : []);

const asNumber = (value: unknown, fallback = 0) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);

const asString = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);

function normalizeOverview(input: unknown): FieldOpsOverview {
  const root = asRecord(input);
  if (!root) {
    return emptyOverview;
  }

  const kpis = asRecord(root.kpis);

  return {
    kpis: {
      activeRoutes: asNumber(kpis?.activeRoutes),
      totalStops: asNumber(kpis?.totalStops),
      openStops: asNumber(kpis?.openStops),
      deliveredToday: asNumber(kpis?.deliveredToday),
      exceptionsToday: asNumber(kpis?.exceptionsToday),
      activeDrivers: asNumber(kpis?.activeDrivers)
    },
    routes: asArray(root.routes).map((item) => {
      const route = asRecord(item);
      return {
        id: asString(route?.id),
        date: asString(route?.date),
        status: asString(route?.status),
        stopCount: asNumber(route?.stopCount),
        completedStops: asNumber(route?.completedStops)
      };
    }),
    stops: asArray(root.stops).map((item) => {
      const stop = asRecord(item);
      return {
        id: asString(stop?.id),
        routeId: asString(stop?.routeId),
        shipmentId: asString(stop?.shipmentId),
        trackingNumber: asString(stop?.trackingNumber),
        stopOrder: asNumber(stop?.stopOrder),
        type: asString(stop?.type),
        workflowStage: asString(stop?.workflowStage),
        shipmentStatus: asString(stop?.shipmentStatus),
        address: asString(stop?.address),
        driverName: stop?.driverName === null ? null : asString(stop?.driverName),
        estimatedAt: stop?.estimatedAt === null ? null : asString(stop?.estimatedAt),
        arrivedAt: stop?.arrivedAt === null ? null : asString(stop?.arrivedAt),
        completedAt: stop?.completedAt === null ? null : asString(stop?.completedAt)
      };
    }),
    driverLocations: asArray(root.driverLocations).map((item) => {
      const location = asRecord(item);
      return {
        driverId: asString(location?.driverId),
        driverName: asString(location?.driverName),
        vehicleLabel: asString(location?.vehicleLabel),
        lat: asNumber(location?.lat),
        lng: asNumber(location?.lng),
        lastUpdated: location?.lastUpdated === null ? null : asString(location?.lastUpdated)
      };
    }),
    recentEvents: asArray(root.recentEvents).map((item) => {
      const event = asRecord(item);
      return {
        id: asString(event?.id),
        shipmentId: asString(event?.shipmentId),
        trackingNumber: asString(event?.trackingNumber),
        status: asString(event?.status),
        source: asString(event?.source),
        notes: event?.notes === null ? null : asString(event?.notes),
        timestamp: asString(event?.timestamp)
      };
    })
  };
}

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "Not available";
  }

  return new Date(value).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  });
};

type KpiKey = "activeRoutes" | "openStops" | "deliveredToday" | "exceptionsToday" | "activeDrivers";
type FauwardGoView = "main" | "workflow" | "records" | "dispatch" | "routes";

type AssignedTask = {
  id: string;
  trackingNumber: string;
  status: string;
  driverName: string | null;
  deliveryAddress: string;
  assignedAt: string;
};

type DispatchShipmentRow = {
  id: string;
  trackingNumber: string;
  status: string;
  assignedDriverId?: string | null;
  driver?: {
    id: string;
    user?: { firstName?: string | null; lastName?: string | null; email?: string | null } | null;
  } | null;
};

type DriverGroup = {
  key: string;
  driverName: string;
  rows: DispatchShipmentRow[];
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function DispatchSubview({ onBack }: { onBack: () => void }) {
  const [date, setDate] = useState(todayIso());

  const query = useQuery({
    queryKey: ["fauward-go-dispatch", date],
    queryFn: async () => {
      const statuses = ["PROCESSING", "PICKED_UP", "IN_TRANSIT", "OUT_FOR_DELIVERY"].join(",");
      const response = await api.get<{ data: DispatchShipmentRow[] }>(
        `/v1/shipments?status=${statuses}&dateFrom=${date}&dateTo=${date}`
      );
      return response.data.data ?? [];
    },
    refetchInterval: 60_000,
  });

  const groups = useMemo<DriverGroup[]>(() => {
    const rows = query.data ?? [];
    const byDriver = new Map<string, DriverGroup>();

    for (const row of rows) {
      const driverId = row.assignedDriverId ?? "unassigned";
      const driverName = row.driver
        ? [row.driver.user?.firstName, row.driver.user?.lastName].filter(Boolean).join(" ") ||
          row.driver.user?.email ||
          "Assigned Field Operator"
        : "Unassigned";

      if (!byDriver.has(driverId)) {
        byDriver.set(driverId, { key: driverId, driverName, rows: [] });
      }
      byDriver.get(driverId)!.rows.push(row);
    }

    return [...byDriver.values()].sort((a, b) => {
      if (a.key === "unassigned") return -1;
      if (b.key === "unassigned") return 1;
      return a.driverName.localeCompare(b.driverName);
    });
  }, [query.data]);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Dispatch board</p>
            <h2 className="mt-1 text-lg font-semibold text-gray-900">Active shipments grouped by field operator</h2>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              Operational view of in-flight shipments for the selected date. Capacity warnings appear when a single
              operator holds more than 20 stops.
            </p>
          </div>
          <Button variant="secondary" leftIcon={<ArrowLeft size={14} />} onClick={onBack}>
            Back to Fauward Go
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="max-w-[220px]"
          />
          <Button type="button" variant="secondary" onClick={() => void query.refetch()}>
            Refresh
          </Button>
        </div>
      </section>

      {groups.length === 0 ? (
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <EmptyState
            icon={Truck}
            title="No active shipments for this date"
            description="Pick another date or wait for new dispatch events to land."
          />
        </section>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((group) => {
            const stopCount = group.rows.length;
            const delivered = group.rows.filter((row) => row.status === "DELIVERED").length;
            const progressPct = stopCount > 0 ? Math.round((delivered / stopCount) * 100) : 0;
            const capacityWarning = stopCount > 20;

            return (
              <section key={group.key} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">{group.driverName}</h3>
                  {capacityWarning ? (
                    <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                      Capacity warning
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-xs text-gray-500">Stops: {stopCount}</p>
                <div className="mt-3 h-2 w-full rounded-full bg-gray-200">
                  <div
                    className="h-2 rounded-full bg-[var(--tenant-primary)]"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="mt-3 space-y-2">
                  {group.rows.map((row) => (
                    <div key={row.id} className="rounded-md border border-gray-200 p-2 text-xs">
                      <div className="font-mono text-gray-900">{row.trackingNumber}</div>
                      <div className="text-gray-600">{row.status}</div>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RoutesSubview({ onBack }: { onBack: () => void }) {
  const [routeOptions, setRouteOptions] = useState<TenantRouteOption[]>(() => loadRouteOptions());
  const [routeLabel, setRouteLabel] = useState("");
  const [routeDescription, setRouteDescription] = useState("");

  const createRouteOption = () => {
    if (!routeLabel.trim()) return;

    const normalizedSlug = routeLabel
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    const nextRoutes = [
      {
        id: `route-${normalizedSlug || crypto.randomUUID()}`,
        label: routeLabel.trim(),
        description: routeDescription.trim() || "No route description provided yet.",
      },
      ...routeOptions,
    ];

    setRouteOptions(nextRoutes);
    saveRouteOptions(nextRoutes);
    setRouteLabel("");
    setRouteDescription("");
  };

  const removeRouteOption = (routeId: string) => {
    const nextRoutes = routeOptions.filter((route) => route.id !== routeId);
    setRouteOptions(nextRoutes);
    saveRouteOptions(nextRoutes);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Route catalog</p>
            <h2 className="mt-1 text-lg font-semibold text-gray-900">Reusable route options</h2>
            <p className="mt-2 max-w-3xl text-sm text-gray-600">
              Build named route options here. They surface in shipment filtering and route planning to keep dispatch
              decisions consistent.
            </p>
          </div>
          <Button variant="secondary" leftIcon={<ArrowLeft size={14} />} onClick={onBack}>
            Back to Fauward Go
          </Button>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <h3 className="text-sm font-semibold text-gray-900">Saved options</h3>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{routeOptions.length}</p>
            <p className="mt-1 text-sm text-gray-500">Route templates available for filtering.</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <h3 className="text-sm font-semibold text-gray-900">Field Operators on duty</h3>
            <p className="mt-2 text-3xl font-semibold text-gray-900">31</p>
            <p className="mt-1 text-sm text-gray-500">Current dispatch staffing snapshot.</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <h3 className="text-sm font-semibold text-gray-900">Pending assignments</h3>
            <p className="mt-2 text-3xl font-semibold text-gray-900">4</p>
            <p className="mt-1 text-sm text-gray-500">Loads still waiting for route planning.</p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.95fr,1.25fr]">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Create route option</p>
          <h2 className="mt-1 text-lg font-semibold text-gray-900">Add a route with description</h2>
          <p className="mt-2 text-sm text-gray-600">
            Create reusable route options here. They will appear in the shipment route filter for planning and review.
          </p>

          <div className="mt-4 space-y-3">
            <Input
              value={routeLabel}
              onChange={(event) => setRouteLabel(event.target.value)}
              placeholder="Route name"
            />
            <Textarea
              value={routeDescription}
              onChange={(event) => setRouteDescription(event.target.value)}
              placeholder="Describe the route coverage, operating window, or assignment purpose"
              className="min-h-[140px]"
            />
            <Button onClick={createRouteOption} disabled={!routeLabel.trim()} className="w-full">
              Create route option
            </Button>
          </div>
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Route catalog</p>
          <h2 className="mt-1 text-lg font-semibold text-gray-900">Available route options</h2>
          <div className="mt-4 space-y-3">
            {routeOptions.length === 0 ? (
              <EmptyState
                icon={RouteIcon}
                title="No route options yet"
                description="Use the form to add your first reusable route."
              />
            ) : (
              routeOptions.map((route) => (
                <article key={route.id} className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">{route.label}</h3>
                      <p className="mt-2 text-sm text-gray-600">{route.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="neutral">{route.id}</Badge>
                      <Button size="sm" variant="ghost" onClick={() => removeRouteOption(route.id)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export function FauwardGoPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const overviewQuery = useQuery({
    queryKey: ["field-ops-overview"],
    queryFn: async () => {
      try {
        return normalizeOverview((await api.get("/v1/field/ops/overview")).data);
      } catch {
        return emptyOverview;
      }
    },
    refetchInterval: 30_000,
    retry: false
  });

  const assignedTasksQuery = useQuery({
    queryKey: ["field-ops-assigned-tasks"],
    queryFn: async () => {
      const res = await api.get<{ tasks: AssignedTask[] }>("/v1/field/ops/assigned-tasks");
      return (res.data.tasks ?? []) as AssignedTask[];
    },
    refetchInterval: 30_000,
    retry: 1
  });

  const assignedTasks = assignedTasksQuery.data ?? [];
  const data = overviewQuery.data ?? emptyOverview;
  const [selectedKpi, setSelectedKpi] = useState<KpiKey | null>(null);
  const detailPanelRef = useRef<HTMLDivElement | null>(null);
  const viewParam = searchParams.get("view");
  const activeView: FauwardGoView =
    viewParam === "workflow" || viewParam === "records" || viewParam === "dispatch" || viewParam === "routes"
      ? viewParam
      : "main";
  const roleGuidance = [
    {
      role: "TENANT_ADMIN",
      summary: "Controls Fauward Go access, invites users, and manages role assignments."
    },
    {
      role: "TENANT_MANAGER",
      summary: "Oversees dispatch, route execution, and issue resolution across active jobs."
    },
    {
      role: "TENANT_STAFF",
      summary: "Supports shipment intake, updates records, and coordinates with the field team."
    },
    {
      role: "Field Operator",
      summary: "Uses the Fauward Go app to execute stops, scans, proofs, and status updates."
    }
  ];
  const activeWorkflowCount = data.kpis.openStops > 0 ? data.kpis.openStops : assignedTasks.length;
  const totalPlanned = data.kpis.totalStops > 0 ? data.kpis.totalStops : assignedTasks.length;

  const kpiCards = data
    ? [
        { key: "activeRoutes" as const, label: "Active routes", value: data.kpis.activeRoutes, helper: "Routes running today", icon: Truck },
        { key: "openStops" as const, label: "Active workflow", value: activeWorkflowCount, helper: `${totalPlanned} total planned`, icon: Smartphone },
        { key: "deliveredToday" as const, label: "Delivered today", value: data.kpis.deliveredToday, helper: "Reconciled from field events", icon: MapPinned },
        { key: "exceptionsToday" as const, label: "Exceptions", value: data.kpis.exceptionsToday, helper: "Failed or exception updates", icon: AlertTriangle },
        { key: "activeDrivers" as const, label: "Field Operators online", value: data.kpis.activeDrivers, helper: "Location seen in last 15 min", icon: Truck }
      ]
    : [];

  const deliveredEvents = data?.recentEvents.filter((event) => event.status.toUpperCase().includes("DELIVERED")) ?? [];
  const exceptionEvents = data?.recentEvents.filter((event) => {
    const status = event.status.toUpperCase();
    return status.includes("EXCEPTION") || status.includes("FAILED");
  }) ?? [];

  const openSubview = (view: Exclude<FauwardGoView, "main">) => {
    const next = new URLSearchParams(searchParams);
    next.set("view", view);
    setSearchParams(next, { replace: true });
    setSelectedKpi(null);
  };

  const returnToMain = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("view");
    setSearchParams(next, { replace: true });
    setSelectedKpi(null);
  };
  const exceptionStops = data?.stops.filter((stop) => {
    const shipmentStatus = stop.shipmentStatus.toUpperCase();
    const workflowStage = stop.workflowStage.toUpperCase();
    return shipmentStatus.includes("EXCEPTION") || shipmentStatus.includes("FAILED") || workflowStage.includes("EXCEPTION");
  }) ?? [];

  const handleKpiClick = (key: KpiKey) => {
    setSelectedKpi((current) => {
      const next = current === key ? null : key;
      if (next) {
        requestAnimationFrame(() => {
          detailPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      return next;
    });
  };

  const renderKpiDetail = () => {
    if (!data || !selectedKpi) {
      return null;
    }

    if (selectedKpi === "activeRoutes") {
      return (
        <section ref={detailPanelRef} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Active routes</p>
              <h2 className="mt-1 text-lg font-semibold text-gray-900">Routes currently feeding Fauward Go</h2>
            </div>
            <Button variant="secondary" size="sm" onClick={() => openSubview("routes")}>
              Open routes
            </Button>
          </div>
          <div className="mt-4 space-y-3">
            {data.routes.length === 0 ? (
              <EmptyState
                icon={Truck}
                title="No active routes"
                description="Create or dispatch routes and they will appear here as soon as field execution begins."
              />
            ) : (
              data.routes.map((route) => (
                <article key={route.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Route {route.id.slice(0, 8)}</p>
                      <h3 className="mt-1 text-base font-semibold text-gray-900">{route.status.replace(/_/g, " ")}</h3>
                    </div>
                    <p className="text-sm text-gray-500">{formatDateTime(route.date)}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-500">
                    <span>{route.stopCount} planned stops</span>
                    <span>{route.completedStops} completed stops</span>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      );
    }

    if (selectedKpi === "openStops") {
      return (
        <section ref={detailPanelRef} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Open stops</p>
              <h2 className="mt-1 text-lg font-semibold text-gray-900">Stops still awaiting field completion</h2>
            </div>
            <Button variant="secondary" size="sm" onClick={() => openSubview("dispatch")}>
              Open dispatch
            </Button>
          </div>
          <div className="mt-4 space-y-3">
            {data.stops.length === 0 ? (
              <EmptyState
                icon={Smartphone}
                title="No open stops"
                description="Once shipments are assigned to live routes, open stops will appear here for review."
              />
            ) : (
              data.stops.map((stop) => (
                <article key={stop.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                        Stop {stop.stopOrder} - {stop.workflowStage.replace(/_/g, " ")}
                      </p>
                      <h3 className="mt-1 text-base font-semibold text-gray-900">{stop.trackingNumber}</h3>
                      <p className="mt-1 text-sm text-gray-600">{stop.address}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">{stop.shipmentStatus}</p>
                      <p className="mt-1 text-sm text-gray-600">{stop.driverName ?? "Unassigned field operator"}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-500">
                    <span>Route {stop.routeId.slice(0, 8)}</span>
                    <span>ETA {formatDateTime(stop.estimatedAt)}</span>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      );
    }

    if (selectedKpi === "deliveredToday") {
      return (
        <section ref={detailPanelRef} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Delivered today</p>
              <h2 className="mt-1 text-lg font-semibold text-gray-900">Completed field activity reconciled from the app</h2>
            </div>
            <Button asChild variant="secondary" size="sm">
              <Link to="/shipments">Open shipments</Link>
            </Button>
          </div>
          <div className="mt-4 space-y-3">
            {deliveredEvents.length === 0 ? (
              <EmptyState
                icon={MapPinned}
                title="No delivered events yet"
                description="Delivered jobs will be listed here when Fauward Go sends completion events back to the portal."
              />
            ) : (
              deliveredEvents.map((event) => (
                <article key={event.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">{event.trackingNumber}</h3>
                      <p className="mt-1 text-sm text-gray-600">{event.status}</p>
                    </div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">{event.source}</p>
                  </div>
                  <p className="mt-3 text-sm text-gray-500">{event.notes ?? "No additional notes"}</p>
                  <p className="mt-2 text-xs text-gray-400">{formatDateTime(event.timestamp)}</p>
                </article>
              ))
            )}
          </div>
        </section>
      );
    }

    if (selectedKpi === "exceptionsToday") {
      return (
        <section ref={detailPanelRef} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Exceptions</p>
              <h2 className="mt-1 text-lg font-semibold text-gray-900">Field issues that need attention</h2>
            </div>
            <Button asChild variant="secondary" size="sm">
              <Link to="/support">Open support</Link>
            </Button>
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-gray-500">Shipment exceptions</h3>
              {exceptionStops.length === 0 ? (
                <EmptyState
                  icon={AlertTriangle}
                  title="No exception stops"
                  description="Exception or failed stops will surface here when they are reported by the field app."
                />
              ) : (
                exceptionStops.map((stop) => (
                  <article key={stop.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <h4 className="text-sm font-semibold text-gray-900">{stop.trackingNumber}</h4>
                    <p className="mt-1 text-sm text-gray-600">{stop.shipmentStatus}</p>
                    <p className="mt-2 text-sm text-gray-500">{stop.address}</p>
                  </article>
                ))
              )}
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-gray-500">Exception events</h3>
              {exceptionEvents.length === 0 ? (
                <EmptyState
                  icon={AlertTriangle}
                  title="No exception events"
                  description="Failed updates and exception events will be grouped here for triage."
                />
              ) : (
                exceptionEvents.map((event) => (
                  <article key={event.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <h4 className="text-sm font-semibold text-gray-900">{event.trackingNumber}</h4>
                    <p className="mt-1 text-sm text-gray-600">{event.status}</p>
                    <p className="mt-2 text-sm text-gray-500">{event.notes ?? "No additional notes"}</p>
                    <p className="mt-2 text-xs text-gray-400">{formatDateTime(event.timestamp)}</p>
                  </article>
                ))
              )}
            </div>
          </div>
        </section>
      );
    }

    return (
      <section ref={detailPanelRef} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Field Operators online</p>
            <h2 className="mt-1 text-lg font-semibold text-gray-900">Latest mobile activity from the field team</h2>
          </div>
          <Button asChild variant="secondary" size="sm">
            <Link to="/operations/live-map">Open live map</Link>
          </Button>
        </div>
        <div className="mt-4 space-y-3">
          {data.driverLocations.length === 0 ? (
            <EmptyState
              icon={Truck}
              title="No active field operators"
              description="Field operator locations will appear here after the Fauward Go app syncs fresh telemetry."
            />
          ) : (
            data.driverLocations.map((location) => (
              <article key={location.driverId} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{location.driverName}</h3>
                    <p className="mt-1 text-sm text-gray-600">{location.vehicleLabel}</p>
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                    {formatDateTime(location.lastUpdated)}
                  </p>
                </div>
                <p className="mt-3 text-sm text-gray-500">
                  {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                </p>
              </article>
            ))
          )}
        </div>
      </section>
      );
    };

  const renderWorkflowSubview = () => {
    if (!data) {
      return null;
    }

    return (
      <div className="space-y-6">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Workflow workspace</p>
              <h2 className="mt-1 text-lg font-semibold text-gray-900">Manage workflow steps</h2>
              <p className="mt-2 max-w-3xl text-sm text-gray-600">
                This view keeps job workflow planning inside Fauward Go. Use it to move work from shipment intake into
                route planning, field execution, and closure without leaving this tab.
              </p>
            </div>
            <Button variant="secondary" leftIcon={<ArrowLeft size={14} />} onClick={returnToMain}>
              Back to Fauward Go
            </Button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Intake",
                value: data.kpis.totalStops,
                helper: "Planned workflow records ready for dispatch shaping"
              },
              {
                label: "Planning",
                value: data.kpis.activeRoutes,
                helper: "Routes currently feeding the job workflow"
              },
              {
                label: "Execution",
                value: data.kpis.openStops,
                helper: "Open field steps still waiting on completion"
              },
              {
                label: "Closure",
                value: data.kpis.deliveredToday,
                helper: `${data.kpis.exceptionsToday} exception jobs still need follow-up`
              }
            ].map((item) => (
              <article key={item.label} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">{item.label}</p>
                <p className="mt-3 text-3xl font-semibold text-gray-900">{item.value}</p>
                <p className="mt-2 text-sm text-gray-500">{item.helper}</p>
              </article>
            ))}
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Current workflow queue</p>
                <h3 className="mt-1 text-lg font-semibold text-gray-900">Jobs moving through active steps</h3>
              </div>
              <Button variant="secondary" size="sm" onClick={() => openSubview("dispatch")}>
                Open dispatch board
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {data.stops.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="No workflow steps in motion"
                  description="As soon as shipments are assigned into active routes, their field workflow steps will be listed here."
                />
              ) : (
                data.stops.map((stop) => (
                  <article key={stop.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                          Step {stop.stopOrder} - {stop.workflowStage.replace(/_/g, " ")}
                        </p>
                        <h4 className="mt-1 text-base font-semibold text-gray-900">{stop.trackingNumber}</h4>
                        <p className="mt-1 text-sm text-gray-600">{stop.address}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">{stop.shipmentStatus}</p>
                        <p className="mt-1 text-sm text-gray-600">{stop.driverName ?? "Unassigned field operator"}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-500">
                      <span>Route {stop.routeId.slice(0, 8)}</span>
                      <span>ETA {formatDateTime(stop.estimatedAt)}</span>
                      <span>{stop.completedAt ? `Completed ${formatDateTime(stop.completedAt)}` : "Waiting on field completion"}</span>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <div className="space-y-6">
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Route handoff board</p>
              <h3 className="mt-1 text-lg font-semibold text-gray-900">Routes currently driving workflow execution</h3>
              <div className="mt-4 space-y-3">
                {data.routes.length === 0 ? (
                  <p className="text-sm text-gray-500">No active routes are feeding the workflow yet.</p>
                ) : (
                  data.routes.map((route) => (
                    <article key={route.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900">Route {route.id.slice(0, 8)}</h4>
                          <p className="mt-1 text-sm text-gray-600">{route.status.replace(/_/g, " ")}</p>
                        </div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                          {formatDateTime(route.date)}
                        </p>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-500">
                        <span>{route.stopCount} planned stops</span>
                        <span>{route.completedStops} completed stops</span>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Next workflow actions</p>
              <h3 className="mt-1 text-lg font-semibold text-gray-900">Keep the job moving</h3>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button asChild>
                  <Link to="/shipments">Review existing shipments</Link>
                </Button>
                <Button variant="secondary" onClick={() => openSubview("routes")}>
                  Open routes
                </Button>
                <Button variant="secondary" onClick={() => openSubview("dispatch")}>
                  Open dispatch
                </Button>
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  };

  const renderRecordsSubview = () => {
    if (!data) {
      return null;
    }

    return (
      <div className="space-y-6">
        <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Job record review</p>
              <h2 className="mt-1 text-lg font-semibold text-gray-900">Review job records</h2>
              <p className="mt-2 max-w-3xl text-sm text-gray-600">
                This view keeps the job register inside Fauward Go. Use it to inspect synced field events, delivered outcomes,
                open records, and exceptions without switching into another page.
              </p>
            </div>
            <Button variant="secondary" leftIcon={<ArrowLeft size={14} />} onClick={returnToMain}>
              Back to Fauward Go
            </Button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Recent events",
                value: data.recentEvents.length,
                helper: "Field records synced back into the portal"
              },
              {
                label: "Delivered records",
                value: deliveredEvents.length,
                helper: "Jobs closed successfully from field updates"
              },
              {
                label: "Exception records",
                value: exceptionEvents.length,
                helper: "Failed or exception updates needing review"
              },
              {
                label: "Open records",
                value: data.stops.length,
                helper: "Current shipment steps still active in the field"
              }
            ].map((item) => (
              <article key={item.label} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">{item.label}</p>
                <p className="mt-3 text-3xl font-semibold text-gray-900">{item.value}</p>
                <p className="mt-2 text-sm text-gray-500">{item.helper}</p>
              </article>
            ))}
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Recent record stream</p>
                <h3 className="mt-1 text-lg font-semibold text-gray-900">Latest field records shared back from the app</h3>
              </div>
              <Button asChild variant="secondary" size="sm">
                <Link to="/shipments">Open shipments</Link>
              </Button>
            </div>

            <div className="mt-4 space-y-3">
              {data.recentEvents.length === 0 ? (
                <EmptyState
                  icon={MapPinned}
                  title="No job records yet"
                  description="When Fauward Go syncs field activity, the job register will populate here."
                />
              ) : (
                data.recentEvents.map((event) => (
                  <article key={event.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900">{event.trackingNumber}</h4>
                        <p className="mt-1 text-sm text-gray-600">{event.status}</p>
                      </div>
                      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">{event.source}</p>
                    </div>
                    <p className="mt-3 text-sm text-gray-500">{event.notes ?? "No additional notes"}</p>
                    <p className="mt-2 text-xs text-gray-400">{formatDateTime(event.timestamp)}</p>
                  </article>
                ))
              )}
            </div>
          </section>

          <div className="space-y-6">
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Delivered register</p>
              <h3 className="mt-1 text-lg font-semibold text-gray-900">Closed job outcomes</h3>
              <div className="mt-4 space-y-3">
                {deliveredEvents.length === 0 ? (
                  <p className="text-sm text-gray-500">No delivered job records have been synced yet.</p>
                ) : (
                  deliveredEvents.map((event) => (
                    <article key={event.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <h4 className="text-sm font-semibold text-gray-900">{event.trackingNumber}</h4>
                      <p className="mt-1 text-sm text-gray-600">{event.status}</p>
                      <p className="mt-2 text-xs text-gray-400">{formatDateTime(event.timestamp)}</p>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Exception register</p>
              <h3 className="mt-1 text-lg font-semibold text-gray-900">Records that still need intervention</h3>
              <div className="mt-4 space-y-3">
                {exceptionEvents.length === 0 ? (
                  <p className="text-sm text-gray-500">No exception job records are active right now.</p>
                ) : (
                  exceptionEvents.map((event) => (
                    <article key={event.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <h4 className="text-sm font-semibold text-gray-900">{event.trackingNumber}</h4>
                      <p className="mt-1 text-sm text-gray-600">{event.status}</p>
                      <p className="mt-2 text-sm text-gray-500">{event.notes ?? "No additional notes"}</p>
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  };

  const pageDescription =
    activeView === "workflow"
      ? "Manage the Fauward Go workflow stages and route handoffs without leaving this tab."
      : activeView === "records"
        ? "Review synced job records and field outcomes without leaving the Fauward Go tab."
        : activeView === "dispatch"
          ? "Active shipments grouped by field operator for the selected date."
          : activeView === "routes"
            ? "Create and manage reusable route options for dispatch planning."
            : "The tenant portal now reads the same field workload, route execution, and telemetry data used by the Fauward Go app.";

  return (
    <PageShell
      title="Fauward Go"
      description={pageDescription}
      state={overviewQuery.isLoading ? "loading" : "ready"}
      onRetry={() => void overviewQuery.refetch()}
      actions={
        activeView === "main" ? (
          <>
            <Button variant="secondary" onClick={() => openSubview("dispatch")}>
              Dispatch board
            </Button>
            <Button asChild>
              <Link to="/operations/live-map">Live map</Link>
            </Button>
          </>
        ) : (
          <Button variant="secondary" leftIcon={<ArrowLeft size={14} />} onClick={returnToMain}>
            Back to Fauward Go
          </Button>
        )
      }
    >
      {data ? (
        activeView === "workflow" ? (
          renderWorkflowSubview()
        ) : activeView === "records" ? (
          renderRecordsSubview()
        ) : activeView === "dispatch" ? (
          <DispatchSubview onBack={returnToMain} />
        ) : activeView === "routes" ? (
          <RoutesSubview onBack={returnToMain} />
        ) : (
          <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {kpiCards.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => handleKpiClick(item.key)}
                aria-expanded={selectedKpi === item.key}
                className={`rounded-xl border bg-white p-4 text-left shadow-sm transition hover:border-[var(--tenant-primary)] hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tenant-primary-light)] ${
                  selectedKpi === item.key ? "border-[var(--tenant-primary)] ring-1 ring-[var(--tenant-primary-light)]" : "border-gray-200"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">{item.label}</p>
                  <item.icon className="h-4 w-4 text-[var(--tenant-primary)]" />
                </div>
                <p className="mt-3 text-3xl font-semibold text-gray-900">{item.value}</p>
                <p className="mt-1 text-sm text-gray-500">{item.helper}</p>
              </button>
            ))}
          </div>

          {renderKpiDetail()}

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Job workflow</p>
                <h2 className="mt-1 text-lg font-semibold text-gray-900">Add jobs for Fauward Go</h2>
                <p className="mt-2 max-w-3xl text-sm text-gray-600">
                  A job is the full operating workflow around a shipment: creation, planning, route assignment, field execution,
                  and final closure as delivered or returned.
                </p>
              </div>
              <div className="rounded-full bg-[color:var(--tenant-primary-soft)] p-3 text-[var(--tenant-primary)]">
                <BriefcaseBusiness className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {[
                {
                  title: "Start the job",
                  body: "Create the shipment record that opens the operational workflow and gives the job its intake data."
                },
                {
                  title: "Move through execution",
                  body: "Plan the route, assign the field stop, and let Fauward Go carry the job through each operational step."
                },
                {
                  title: "Close the outcome",
                  body: "Finish the workflow as delivered, failed, or returned and sync the final field events back to the portal."
                }
              ].map((item) => (
                <article key={item.title} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <h3 className="text-sm font-semibold text-gray-900">{item.title}</h3>
                  <p className="mt-2 text-sm text-gray-600">{item.body}</p>
                </article>
              ))}
            </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Button asChild>
                  <Link to="/shipments">Start from existing shipments</Link>
                </Button>
                <Button variant="secondary" onClick={() => openSubview("workflow")}>
                  Manage workflow steps
                </Button>
                <Button variant="secondary" onClick={() => openSubview("records")}>
                  Review job records
                </Button>
            </div>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Assigned tasks</p>
                <h2 className="mt-1 text-lg font-semibold text-gray-900">Shipments assigned to field operators</h2>
              </div>
              <Button asChild variant="secondary" size="sm">
                <Link to="/shipments">View all shipments</Link>
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              {assignedTasksQuery.isLoading ? (
                <p className="text-sm text-gray-500">Loading assigned tasks…</p>
              ) : assignedTasksQuery.isError ? (
                <p className="text-sm text-red-500">
                  Error loading tasks: {assignedTasksQuery.error instanceof Error ? assignedTasksQuery.error.message : "Unknown error"}
                </p>
              ) : assignedTasks.length === 0 ? (
                <p className="text-sm text-gray-500">No shipments are currently assigned to field operators.</p>
              ) : (
                assignedTasks.map((task) => (
                  <article key={task.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">DIRECT ASSIGNMENT</p>
                        <h3 className="mt-1 text-base font-semibold text-gray-900">{task.trackingNumber}</h3>
                        <p className="mt-1 text-sm text-gray-600">{task.deliveryAddress}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">{task.status.replace(/_/g, " ")}</p>
                        <p className="mt-1 text-sm text-gray-600">{task.driverName ?? "Unassigned"}</p>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-[1.3fr,0.9fr]">
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Shared field workload</p>
                  <h2 className="mt-1 text-lg font-semibold text-gray-900">Current stops from Fauward Go</h2>
                </div>
                <Button variant="secondary" size="sm" onClick={() => openSubview("dispatch")}>
                  Manage dispatch
                </Button>
              </div>

              <div className="mt-4 space-y-3">
                {data.stops.length === 0 ? (
                  <EmptyState
                    icon={Smartphone}
                    title="No active field stops"
                    description="Routes and stops assigned in the database will appear here automatically for both the portal and Fauward Go."
                  />
                ) : (
                  data.stops.map((stop) => (
                    <article key={stop.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                            Stop {stop.stopOrder} • {stop.workflowStage.replace(/_/g, " ")}
                          </p>
                          <h3 className="mt-1 text-base font-semibold text-gray-900">{stop.trackingNumber}</h3>
                          <p className="mt-1 text-sm text-gray-600">{stop.address}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">{stop.shipmentStatus}</p>
                          <p className="mt-1 text-sm text-gray-600">{stop.driverName ?? "Unassigned field operator"}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-500">
                        <span>Route {stop.routeId.slice(0, 8)}</span>
                        <span>ETA {formatDateTime(stop.estimatedAt)}</span>
                        <span>{stop.completedAt ? `Completed ${formatDateTime(stop.completedAt)}` : "Awaiting field completion"}</span>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </section>

            <div className="space-y-6">
              <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Field operator telemetry</p>
                <h2 className="mt-1 text-lg font-semibold text-gray-900">Latest field operator locations</h2>
                <div className="mt-4 space-y-3">
                  {data.driverLocations.length === 0 ? (
                    <p className="text-sm text-gray-500">No field operator locations have been synced yet.</p>
                  ) : (
                    data.driverLocations.map((location) => (
                      <article key={location.driverId} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold text-gray-900">{location.driverName}</h3>
                            <p className="mt-1 text-sm text-gray-600">{location.vehicleLabel}</p>
                          </div>
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                            {formatDateTime(location.lastUpdated)}
                          </p>
                        </div>
                        <p className="mt-3 text-sm text-gray-500">
                          {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                        </p>
                      </article>
                    ))
                  )}
                </div>
              </section>

              <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Recent field events</p>
                <h2 className="mt-1 text-lg font-semibold text-gray-900">Activity shared back from the app</h2>
                <div className="mt-4 space-y-3">
                  {data.recentEvents.length === 0 ? (
                    <p className="text-sm text-gray-500">No field events have been reconciled yet.</p>
                  ) : (
                    data.recentEvents.map((event) => (
                      <article key={event.id} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="text-sm font-semibold text-gray-900">{event.trackingNumber}</h3>
                            <p className="mt-1 text-sm text-gray-600">{event.status}</p>
                          </div>
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">{event.source}</p>
                        </div>
                        <p className="mt-3 text-sm text-gray-500">{event.notes ?? "No additional notes"}</p>
                        <p className="mt-2 text-xs text-gray-400">{formatDateTime(event.timestamp)}</p>
                      </article>
                    ))
                  )}
                </div>
              </section>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-1">
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">User roles</p>
                  <h2 className="mt-1 text-lg font-semibold text-gray-900">Assign the right access to users</h2>
                  <p className="mt-2 max-w-2xl text-sm text-gray-600">
                    Roles decide who can create jobs, manage dispatch, and operate the Fauward Go mobile workflow.
                  </p>
                </div>
                <div className="rounded-full bg-[color:var(--tenant-primary-soft)] p-3 text-[var(--tenant-primary)]">
                  <Users className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {roleGuidance.map((item) => (
                  <article key={item.role} className="flex items-start gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <div className="mt-0.5 rounded-full bg-white p-2 text-[var(--tenant-primary)] shadow-sm">
                      <ShieldCheck className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">{item.role}</h3>
                      <p className="mt-1 text-sm text-gray-600">{item.summary}</p>
                    </div>
                  </article>
                ))}
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <Button asChild>
                  <Link to="/team">Manage users</Link>
                </Button>
                <Button variant="secondary" onClick={() => openSubview("dispatch")}>
                  Review dispatch roles
                </Button>
              </div>
            </section>
          </div>
          </div>
        )
      ) : null}
    </PageShell>
  );
}
