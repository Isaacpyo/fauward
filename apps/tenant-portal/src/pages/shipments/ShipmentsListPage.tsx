import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Printer, UserPlus } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import * as RadixDialog from "@radix-ui/react-dialog";
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
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";
import { apiErrorMessage } from "@/lib/api-error";
import { printShippingLabel } from "@/lib/shipping-label";
import { loadRouteOptions, type TenantRouteOption } from "@/lib/route-options";
import { normalizeShipmentListResponse } from "@/lib/shipment-normalizers";
import { getValidNextShipmentStates } from "@/lib/shipment-state";
import { useAppStore } from "@/stores/useAppStore";
import { useTenantStore } from "@/stores/useTenantStore";
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


type BulkResult = { ok: number; failed: Array<{ id: string; message: string }> };

/** Runs one real API call per shipment, sequentially, and reports what actually succeeded. */
async function runForEach(ids: string[], action: (id: string) => Promise<unknown>): Promise<BulkResult> {
  const result: BulkResult = { ok: 0, failed: [] };
  for (const id of ids) {
    try {
      await action(id);
      result.ok += 1;
    } catch (error) {
      result.failed.push({ id, message: apiErrorMessage(error, "Request failed") });
    }
  }
  return result;
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV of the selected rows exactly as loaded from `GET /v1/shipments`. */
function downloadShipmentsCsv(rows: ShipmentListItem[]) {
  const header = ["Tracking number", "Status", "Customer", "Origin", "Destination", "Field operator", "Created"];
  const lines = rows.map((row) =>
    [row.tracking_number, row.status, row.customer_name, row.origin, row.destination, row.driver_name ?? "", row.created_at].map(csvCell).join(",")
  );
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `shipments-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function fetchShipments(): Promise<ShipmentListItem[]> {
  const response = await api.get("/v1/shipments");
  return normalizeShipmentListResponse(response.data);
}

export function ShipmentsListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAppStore((state) => state.user);
  const addToast = useAppStore((state) => state.addToast);
  const tenantId = useTenantStore((state) => state.tenant?.tenant_id);

  const filterSearchParamsKey = buildFilterSearchParamsKey(searchParams);
  const selectedShipmentId = searchParams.get("selected");
  const [filters, setFilters] = useState<ShipmentFilters>(() =>
    filterSearchParamsKey ? buildFiltersFromSearchParams(searchParams) : initialFilters
  );
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState("25");
  const [assignDriverOpen, setAssignDriverOpen] = useState(false);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkStatus, setBulkStatus] = useState<ShipmentState | "">("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const queryClient = useQueryClient();
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
    queryKey: ["shipments-list", tenantId],
    queryFn: fetchShipments,
    staleTime: 30_000,
    retry: 1,
    enabled: Boolean(tenantId)
  });

  const driversQuery = useQuery({
    queryKey: ["fleet-drivers", tenantId],
    queryFn: async () => {
      type RawDriver = { id: string; user: { firstName: string; lastName: string }; todaysRouteStops?: number };
      const res = await api.get<{ drivers: RawDriver[] }>("/v1/fleet/drivers");
      return res.data.drivers.map((d): DriverListItem => ({
        id: d.id,
        name: `${d.user.firstName} ${d.user.lastName}`.trim(),
        current_load: d.todaysRouteStops ?? 0,
        status: "available"
      }));
    },
    enabled: Boolean(tenantId) && assignDriverOpen
  });

  const allShipments = shipmentsQuery.data ?? [];

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
    () =>
      allShipments.find(
        (shipment) =>
          shipment.id === selectedShipmentId || shipment.tracking_number === selectedShipmentId
      ),
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

  const reportBulk = (verb: string, result: BulkResult) => {
    if (result.failed.length === 0) {
      addToast({ title: `${verb} ${result.ok} shipment(s)`, variant: "success" });
    } else {
      addToast({
        title: `${verb} ${result.ok} of ${result.ok + result.failed.length} shipment(s)`,
        description: result.failed[0]?.message,
        variant: "error"
      });
    }
    void queryClient.invalidateQueries({ queryKey: ["shipments-list"] });
  };

  const applyBulkStatus = async () => {
    if (!bulkStatus) return;
    setBulkBusy(true);
    try {
      const result = await runForEach(selectedIds, (id) => api.patch(`/v1/shipments/${id}/status`, { status: bulkStatus }));
      reportBulk(`Moved to ${bulkStatus.replace(/_/g, " ").toLowerCase()}:`, result);
      if (result.failed.length === 0) {
        setSelectedIds([]);
        setBulkStatusOpen(false);
        setBulkStatus("");
      }
    } finally {
      setBulkBusy(false);
    }
  };

  const printSelectedLabels = async () => {
    setBulkBusy(true);
    try {
      reportBulk("Printed labels for", await runForEach(selectedIds, (id) => printShippingLabel(id)));
    } finally {
      setBulkBusy(false);
    }
  };

  const openShipmentWorkspace = (shipment: ShipmentListItem) => {
    const next = new URLSearchParams(searchParams);
    next.set("selected", shipment.tracking_number ?? shipment.id);
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
        <div className="sticky top-16 z-20">
        <ShipmentFilterBar
          filters={filters}
          onChange={(nextFilters) => {
            setFilters(nextFilters);
            setPage(1);
            setSelectedIds([]);
          }}
          onRefresh={() => void shipmentsQuery.refetch()}
          isRefreshing={shipmentsQuery.isFetching}
          role={user?.role}
          routeOptions={routeOptions}
        />
        </div>

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
                onClick={() => setBulkStatusOpen(true)}
              >
                Update status
              </Button>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Download size={14} />}
                onClick={() => downloadShipmentsCsv(selectedShipments)}
              >
                Export selected
              </Button>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<Printer size={14} />}
                loading={bulkBusy}
                disabled={bulkBusy}
                onClick={() => void printSelectedLabels()}
              >
                Print labels
              </Button>
            </div>
          </div>
        ) : null}

        {(!tenantId || shipmentsQuery.isLoading) ? (
          <div className="space-y-2 rounded-lg border border-gray-200 bg-white p-3">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full" />
            ))}
          </div>
        ) : shipmentsQuery.isError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
            <p className="font-semibold">Failed to load shipments</p>
            <p className="mt-1 text-red-600">
              {shipmentsQuery.error instanceof Error ? shipmentsQuery.error.message : "Could not fetch shipments. Please try again."}
            </p>
            <button
              type="button"
              className="mt-4 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
              onClick={() => void shipmentsQuery.refetch()}
            >
              Try again
            </button>
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

        <RadixDialog.Root open={!!selectedShipmentId} onOpenChange={(open) => { if (!open) closeShipmentWorkspace(); }}>
          <RadixDialog.Portal>
            <RadixDialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
            <RadixDialog.Content
              className="fixed left-1/2 top-1/2 z-50 w-[min(96vw,780px)] max-h-[90vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl bg-white shadow-xl focus-visible:outline-none"
              aria-label="Shipment workspace"
            >
              {selectedShipmentId ? (
                <ShipmentWorkspacePanel
                  shipmentId={selectedShipmentId}
                  fallbackShipment={selectedShipment}
                  onClose={closeShipmentWorkspace}
                />
              ) : null}
            </RadixDialog.Content>
          </RadixDialog.Portal>
        </RadixDialog.Root>
      </div>

      <AssignDriverModal
        open={assignDriverOpen}
        onOpenChange={setAssignDriverOpen}
        drivers={driversQuery.data ?? []}
        onConfirm={async (driverId) => {
          const driver = (driversQuery.data ?? []).find((item) => item.id === driverId);
          const result = await runForEach(selectedIds, (id) => api.patch(`/v1/shipments/${id}/assign-driver`, { driverId }));
          reportBulk(`Assigned to ${driver?.name ?? "field operator"}:`, result);
          if (result.failed.length === 0) setSelectedIds([]);
        }}
      />

      <Dialog
        open={bulkStatusOpen}
        onOpenChange={setBulkStatusOpen}
        title="Update status"
        description={`Move ${selectedIds.length} selected shipment(s) to a status every one of them allows.`}
      >
        <div className="space-y-4">
          <Select
            value={bulkStatus}
            onValueChange={(value) => setBulkStatus(value as ShipmentState)}
            options={sharedNextStates.map((status) => ({ label: status.replace(/_/g, " "), value: status }))}
          />
          <Button className="w-full" onClick={() => void applyBulkStatus()} loading={bulkBusy} disabled={!bulkStatus || bulkBusy}>
            Apply to {selectedIds.length} shipment(s)
          </Button>
        </div>
      </Dialog>
    </PageShell>
  );
}
