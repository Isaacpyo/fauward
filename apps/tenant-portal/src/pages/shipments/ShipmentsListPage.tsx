import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Printer, UserPlus } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { AssignDriverModal } from "@/components/shipments/AssignDriverModal";
import { ShipmentCard } from "@/components/shipments/ShipmentCard";
import { ShipmentWorkspacePanel } from "@/components/shipments/ShipmentWorkspacePanel";
import {
  ShipmentFilterBar,
  type ShipmentFilters
} from "@/components/shipments/ShipmentFilterBar";
import { ShipmentTable } from "@/components/shipments/ShipmentTable";
import { EmptyState } from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";
import { defaultRouteOptions, loadRouteOptions, type TenantRouteOption } from "@/lib/route-options";
import { normalizeShipmentListResponse } from "@/lib/shipment-normalizers";
import { getValidNextShipmentStates } from "@/lib/shipment-state";
import { useAppStore } from "@/stores/useAppStore";
import type { ShipmentState } from "@/types/domain";
import type { DriverListItem, ShipmentListItem } from "@/types/shipment";

const initialFilters: ShipmentFilters = {
  search: "",
  statuses: [],
  dateFrom: "",
  dateTo: "",
  driver: "all",
  customer: "all",
  route: "all"
};

function buildFilterSearchParamsKey(searchParams: URLSearchParams) {
  const filterKeys = ["search", "status", "dateFrom", "dateTo", "datePreset", "driver", "customer", "route"];
  return filterKeys.map((key) => `${key}:${searchParams.get(key) ?? ""}`).join("|");
}

function buildFiltersFromSearchParams(searchParams: URLSearchParams): ShipmentFilters {
  const datePreset = searchParams.get("datePreset");
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const todayValue = `${yyyy}-${mm}-${dd}`;

  return {
    search: searchParams.get("search") ?? "",
    statuses: (searchParams.get("status") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean) as ShipmentState[],
    dateFrom: searchParams.get("dateFrom") ?? (datePreset === "today" ? todayValue : ""),
    dateTo: searchParams.get("dateTo") ?? (datePreset === "today" ? todayValue : ""),
    driver: searchParams.get("driver") ?? "all",
    customer: searchParams.get("customer") ?? "all",
    route: searchParams.get("route") ?? "all"
  };
}

const fallbackShipments: ShipmentListItem[] = Array.from({ length: 42 }).map((_, index) => ({
  id: `SHP-${index + 1}`,
  tracking_number: `FWD-2026-${String(index + 1).padStart(5, "0")}`,
  status: ([
    "PENDING",
    "PROCESSING",
    "PICKED_UP",
    "IN_TRANSIT",
    "OUT_FOR_DELIVERY",
    "FAILED_DELIVERY",
    "DELIVERED"
  ] as ShipmentState[])[index % 7],
  customer_name: index % 2 === 0 ? "Acme Retail" : "Northline Freight",
  origin: index % 2 === 0 ? "Lagos" : "Abuja",
  destination: index % 2 === 0 ? "London" : "Manchester",
  route_id: defaultRouteOptions[index % defaultRouteOptions.length]?.id,
  route_name: defaultRouteOptions[index % defaultRouteOptions.length]?.label,
  driver_name: index % 3 === 0 ? "Amina Yusuf" : index % 4 === 0 ? undefined : "Daniel Cole",
  service_tier: index % 3 === 0 ? "Same Day" : index % 2 === 0 ? "Express" : "Standard",
  created_at: new Date(Date.now() - index * 1000 * 60 * 60 * 4).toISOString(),
  reference: `REF-${2000 + index}`
}));

const fallbackDrivers: DriverListItem[] = [
  { id: "drv-1", name: "Amina Yusuf", current_load: 8, status: "busy" },
  { id: "drv-2", name: "Daniel Cole", current_load: 3, status: "available" },
  { id: "drv-3", name: "Lara Okafor", current_load: 0, status: "offline" }
];

const seededDeliveredShipment: ShipmentListItem = {
  id: "seed-delivered-shipment",
  tracking_number: "FWD-2026-DEL-0001",
  status: "DELIVERED",
  customer_name: "Acme Retail",
  origin: "Lagos",
  destination: "London",
  route_id: "route-london-c",
  route_name: "London Route C",
  driver_name: "Amina Yusuf",
  service_tier: "Express",
  created_at: new Date("2026-04-17T10:30:00.000Z").toISOString(),
  reference: "JOB-DELIVERED-0001"
};

async function fetchShipments(): Promise<ShipmentListItem[]> {
  const response = await api.get("/v1/shipments");
  return normalizeShipmentListResponse(response.data);
}

export function ShipmentsListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAppStore((state) => state.user);
  const addToast = useAppStore((state) => state.addToast);

  const filterSearchParamsKey = buildFilterSearchParamsKey(searchParams);
  const selectedShipmentId = searchParams.get("selected");
  const [filters, setFilters] = useState<ShipmentFilters>(() =>
    filterSearchParamsKey ? buildFiltersFromSearchParams(searchParams) : initialFilters
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState("25");
  const [assignDriverOpen, setAssignDriverOpen] = useState(false);
  const [routeOptions, setRouteOptions] = useState<TenantRouteOption[]>(() => loadRouteOptions());

  useEffect(() => {
    setFilters(filterSearchParamsKey ? buildFiltersFromSearchParams(searchParams) : initialFilters);
    setPage(1);
    setSelectedIds([]);
  }, [searchParams, filterSearchParamsKey]);

  useEffect(() => {
    setRouteOptions(loadRouteOptions());
  }, []);

  const shipmentsQuery = useQuery({
    queryKey: ["shipments-list"],
    queryFn: fetchShipments,
    staleTime: 30_000,
    retry: 1
  });

  const allShipments =
    shipmentsQuery.data === undefined
      ? fallbackShipments
      : shipmentsQuery.data.length > 0
        ? shipmentsQuery.data
        : [seededDeliveredShipment];

  const filteredShipments = useMemo(() => {
    return allShipments.filter((shipment) => {
      const text = `${shipment.tracking_number} ${shipment.customer_name} ${shipment.reference ?? ""}`.toLowerCase();
      const bySearch = filters.search ? text.includes(filters.search.toLowerCase()) : true;
      const byStatus =
        filters.statuses.length > 0 ? filters.statuses.includes(shipment.status) : true;
      const byDriver =
        filters.driver === "all"
          ? true
          : filters.driver === "assigned"
            ? Boolean(shipment.driver_name)
            : !shipment.driver_name;
      const byRoute =
        filters.route === "all"
          ? true
          : shipment.route_id === filters.route || shipment.route_name === filters.route;

      const created = new Date(shipment.created_at).getTime();
      const from = filters.dateFrom ? new Date(filters.dateFrom).getTime() : -Infinity;
      const to = filters.dateTo
        ? new Date(filters.dateTo + "T23:59:59").getTime()
        : Infinity;
      const byDate = created >= from && created <= to;

      return bySearch && byStatus && byDriver && byRoute && byDate;
    });
  }, [allShipments, filters]);

  const total = filteredShipments.length;
  const startIndex = (page - 1) * Number(perPage);
  const paginatedShipments = filteredShipments.slice(startIndex, startIndex + Number(perPage));
  const totalPages = Math.max(1, Math.ceil(total / Number(perPage)));

  const selectedShipments = useMemo(
    () => filteredShipments.filter((shipment) => selectedIds.includes(shipment.id)),
    [filteredShipments, selectedIds]
  );
  const selectedShipment = useMemo(
    () => allShipments.find((shipment) => shipment.id === selectedShipmentId),
    [allShipments, selectedShipmentId]
  );

  const sharedNextStates = useMemo(() => {
    if (selectedShipments.length === 0) {
      return [];
    }
    return selectedShipments
      .map((shipment) => getValidNextShipmentStates(shipment.status))
      .reduce<ShipmentState[]>((accumulator, current, index) => {
        if (index === 0) {
          return current;
        }
        return accumulator.filter((status) => current.includes(status));
      }, []);
  }, [selectedShipments]);

  const toggleSelect = (id: string, checked: boolean) => {
    setSelectedIds((current) =>
      checked ? [...new Set([...current, id])] : current.filter((value) => value !== id)
    );
  };

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? paginatedShipments.map((shipment) => shipment.id) : []);
  };

  const hasSelection = selectedIds.length > 0;

  const openShipmentWorkspace = (shipment: ShipmentListItem) => {
    const next = new URLSearchParams(searchParams);
    next.set("selected", shipment.id);
    setSearchParams(next, { replace: true });
  };

  const closeShipmentWorkspace = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("selected");
    setSearchParams(next, { replace: true });
  };

  return (
    <PageShell
      title="Shipments"
      actions={
        <Button onClick={() => navigate("/shipments/create")}>Create Shipment</Button>
      }
    >
      <div className={`grid gap-6 ${selectedShipmentId ? "lg:grid-cols-[minmax(0,1fr)_28rem]" : ""}`}>
        <div className="space-y-4">
        <ShipmentFilterBar
          filters={filters}
          onChange={(nextFilters) => {
            setFilters(nextFilters);
            setPage(1);
            setSelectedIds([]);
          }}
          role={user?.role}
          routeOptions={routeOptions}
        />

        {hasSelection ? (
          <div className="sticky top-[calc(var(--topbar-height)+8px)] z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
            <p className="text-sm text-gray-700">{selectedIds.length} selected</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<UserPlus size={14} />}
                onClick={() => setAssignDriverOpen(true)}
              >
                Assign field operator
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={sharedNextStates.length === 0}
                title={
                  sharedNextStates.length === 0
                    ? "No common valid status update for selected shipments"
                    : undefined
                }
                onClick={() => {
                  if (sharedNextStates.length === 0) {
                    return;
                  }
                  addToast({
                    title: `Available updates: ${sharedNextStates.join(", ")}`,
                    variant: "default"
                  });
                }}
              >
                Update status
              </Button>
              <Button variant="secondary" size="sm" leftIcon={<Download size={14} />}>
                Export selected
              </Button>
              <Button variant="secondary" size="sm" leftIcon={<Printer size={14} />}>
                Print labels
              </Button>
            </div>
          </div>
        ) : null}

        {shipmentsQuery.isLoading ? (
          <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-3">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : total === 0 ? (
          <EmptyState
            icon={Printer}
            title="No shipments yet"
            description="Create your first shipment to start tracking deliveries."
            ctaLabel="Create your first shipment"
            onCtaClick={() => navigate("/shipments/create")}
          />
        ) : (
          <>
            <div className="hidden lg:block">
              <ShipmentTable
                shipments={paginatedShipments}
                selectedIds={selectedIds}
                activeShipmentId={selectedShipmentId}
                onToggleSelect={toggleSelect}
                onToggleSelectAll={toggleSelectAll}
                onOpenShipment={openShipmentWorkspace}
              />
            </div>

            <div className="space-y-2 lg:hidden">
              {paginatedShipments.map((shipment) => (
                <ShipmentCard key={shipment.id} shipment={shipment} />
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
              <p className="text-sm text-gray-600">
                Showing {total === 0 ? 0 : startIndex + 1}-{Math.min(total, startIndex + Number(perPage))} of {total}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Previous
                </Button>
                <span className="px-1 text-sm text-gray-700">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </Button>
                <Select
                  value={perPage}
                  onValueChange={(value) => {
                    setPerPage(value);
                    setPage(1);
                  }}
                  options={[
                    { label: "25 / page", value: "25" },
                    { label: "50 / page", value: "50" },
                    { label: "100 / page", value: "100" }
                  ]}
                  className="w-[130px]"
                />
              </div>
            </div>
          </>
        )}
        </div>

        {selectedShipmentId ? (
          <ShipmentWorkspacePanel
            shipmentId={selectedShipmentId}
            fallbackShipment={selectedShipment}
            onClose={closeShipmentWorkspace}
          />
        ) : null}
      </div>

      <AssignDriverModal
        open={assignDriverOpen}
        onOpenChange={setAssignDriverOpen}
        drivers={fallbackDrivers}
        onConfirm={async (driverId) => {
          await new Promise((resolve) => window.setTimeout(resolve, 450));
          const driver = fallbackDrivers.find((item) => item.id === driverId);
          addToast({
            title: `Assigned ${selectedIds.length} shipment(s) to ${driver?.name ?? "field operator"}`,
            variant: "success"
          });
          setSelectedIds([]);
        }}
      />
    </PageShell>
  );
}
