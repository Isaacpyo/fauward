import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, BriefcaseBusiness, ClipboardList, MapPinned, ShieldCheck, Smartphone, Truck, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";

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
type FauwardGoView = "main" | "workflow" | "records";

export function FauwardGoPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const overviewQuery = useQuery({
    queryKey: ["field-ops-overview"],
    queryFn: async () => normalizeOverview((await api.get("/v1/field/ops/overview")).data),
    refetchInterval: 30_000
  });

  const data = overviewQuery.data;
  const [selectedKpi, setSelectedKpi] = useState<KpiKey | null>(null);
  const detailPanelRef = useRef<HTMLDivElement | null>(null);
  const viewParam = searchParams.get("view");
  const activeView: FauwardGoView =
    viewParam === "workflow" || viewParam === "records" ? viewParam : "main";
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
  const kpiCards = data
    ? [
        { key: "activeRoutes" as const, label: "Active routes", value: data.kpis.activeRoutes, helper: "Routes running today", icon: Truck },
        { key: "openStops" as const, label: "Active workflow", value: data.kpis.openStops, helper: `${data.kpis.totalStops} total planned`, icon: Smartphone },
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
            <Button asChild variant="secondary" size="sm">
              <Link to="/routes">Open routes</Link>
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
            <Button asChild variant="secondary" size="sm">
              <Link to="/dispatch">Open dispatch</Link>
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
              <Button asChild variant="secondary" size="sm">
                <Link to="/dispatch">Open dispatch board</Link>
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
                <Button asChild variant="secondary">
                  <Link to="/routes">Open routes</Link>
                </Button>
                <Button asChild variant="secondary">
                  <Link to="/dispatch">Open dispatch</Link>
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
        : "The tenant portal now reads the same field workload, route execution, and telemetry data used by the Fauward Go app.";

  return (
    <PageShell
      title="Fauward Go"
      description={pageDescription}
      state={overviewQuery.isLoading ? "loading" : overviewQuery.isError ? "error" : "ready"}
      onRetry={() => void overviewQuery.refetch()}
      actions={
        activeView === "main" ? (
          <>
            <Button asChild variant="secondary">
              <Link to="/routes">Dispatch board</Link>
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

          <div className="grid gap-6 xl:grid-cols-[1.3fr,0.9fr]">
            <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Shared field workload</p>
                  <h2 className="mt-1 text-lg font-semibold text-gray-900">Current stops from Fauward Go</h2>
                </div>
                <Button asChild variant="secondary" size="sm">
                  <Link to="/dispatch">Manage dispatch</Link>
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
                <Button asChild variant="secondary">
                  <Link to="/routes">Review dispatch roles</Link>
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
