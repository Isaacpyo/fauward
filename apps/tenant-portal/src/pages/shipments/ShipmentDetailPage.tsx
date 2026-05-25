import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { DocumentsPanel } from "@/components/shipments/DocumentsPanel";
import { NotesPanel } from "@/components/shipments/NotesPanel";
import { PODViewer } from "@/components/shipments/PODViewer";
import { ShipmentTimeline } from "@/components/shipments/ShipmentTimeline";
import { UpdateStatusModal } from "@/components/shipments/UpdateStatusModal";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsContent } from "@/components/ui/Tabs";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";
import { normalizePodResponse, normalizeShipmentDetail } from "@/lib/shipment-normalizers";
import { useTenantStore } from "@/stores/useTenantStore";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { ShipmentState } from "@/types/domain";

type PodResponse = {
  podAssets: Array<{ id: string; type: string; fileUrl: string; capturedAt?: string }>;
  recipientName: string;
  deliveredAt?: string | null;
  capturedBy: string;
};

async function fetchShipment(id: string) {
  const response = await api.get(`/v1/shipments/${id}`);
  return normalizeShipmentDetail(response.data, id);
}

export function ShipmentDetailPage() {
  const { id = "" } = useParams();
  const tenant = useTenantStore((state) => state.tenant);
  const tenantId = tenant?.tenant_id;
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("timeline");
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(["timeline"]));
  const [showStatusModal, setShowStatusModal] = useState(false);

  const shipmentQuery = useQuery({
    queryKey: ["shipment-detail", tenantId, id],
    queryFn: () => fetchShipment(id),
    retry: 1,
    enabled: Boolean(tenantId && id)
  });
  const shipment = shipmentQuery.data;

  const podQuery = useQuery({
    queryKey: ["shipment-pod", id],
    queryFn: async () => normalizePodResponse((await api.get<PodResponse>(`/v1/shipments/${id}/pod`)).data),
    enabled: shipment?.status === "DELIVERED"
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (payload: {
      status: ShipmentState;
      notes?: string;
      timestamp?: string;
      failedReason?: string;
      assignedDriverId?: string;
      courierRefOrigin?: string;
      courierRefDestination?: string;
      originCourierConfirmed?: boolean;
      destinationCourierConfirmed?: boolean;
      customsClearanceConfirmed?: boolean;
    }) => {
      await api.patch(`/v1/shipments/${id}/status`, payload);
    },
    onSuccess: async (_, payload) => {
      setShowStatusModal(false);
      await queryClient.invalidateQueries({ queryKey: ["shipment-detail", id] });
      await queryClient.invalidateQueries({ queryKey: ["shipments-list"] });
      if (payload.status === "RETURNED") {
        await queryClient.invalidateQueries({ queryKey: ["tenant-returns"] });
        await queryClient.invalidateQueries({ queryKey: ["returned-shipments"] });
      }
    }
  });

  const quickNextStatuses = useMemo(() => {
    if (!shipment) return [];
    const map: Record<string, ShipmentState[]> = {
      PENDING: ["PROCESSING", "CANCELLED"],
      PROCESSING: ["PICKED_UP"],
      PICKED_UP: ["IN_TRANSIT", "EXCEPTION", "FAILED_DELIVERY"],
      IN_TRANSIT: ["OUT_FOR_DELIVERY", "EXCEPTION", "FAILED_DELIVERY"],
      OUT_FOR_DELIVERY: ["DELIVERED", "FAILED_DELIVERY", "EXCEPTION"],
      FAILED_DELIVERY: ["OUT_FOR_DELIVERY", "RETURNED", "EXCEPTION"],
      DELIVERED: ["RETURNED"],
      EXCEPTION: ["PROCESSING", "OUT_FOR_DELIVERY", "FAILED_DELIVERY"],
      RETURNED: [],
      CANCELLED: []
    };
    return map[shipment.status] ?? [];
  }, [shipment]);

  const pageTitle = shipment ? `Shipment ${shipment.tracking_number}` : "Shipment";

  return (
    <PageShell title={pageTitle} description="Operational detail, timeline, documents, and POD.">
      {shipmentQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : shipmentQuery.isError || !shipment ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          <p className="font-semibold">Failed to load shipment</p>
          <p className="mt-1 text-red-600">
            {shipmentQuery.error instanceof Error ? shipmentQuery.error.message : "The shipment could not be found or you don't have access."}
          </p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={() => void shipmentQuery.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <section className="grid gap-4 rounded-lg border border-gray-200 bg-white p-4 lg:grid-cols-[2fr,1fr]">
            <div>
              <p className="text-xs text-gray-500">Tracking</p>
              <div className="mt-1 flex items-center gap-2">
                <p className="font-mono text-xl font-semibold text-gray-900">{shipment.tracking_number}</p>
                <button
                  type="button"
                  title="Copy tracking number"
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                  onClick={() => void navigator.clipboard.writeText(shipment.tracking_number)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge status={shipment.status} />
                <span className="text-sm text-gray-600">{shipment.service_tier}</span>
              </div>

              <div className="mt-3 grid grid-cols-[1fr,auto,1fr] items-start gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">From</p>
                  <p className="mt-0.5 truncate text-sm text-gray-700">{shipment.pickup_address}</p>
                </div>
                <svg className="mt-4 shrink-0 text-gray-300" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
                <div className="min-w-0">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">To</p>
                  <p className="mt-0.5 truncate text-sm font-medium text-gray-900">{shipment.delivery_address}</p>
                </div>
              </div>

              <p className="mt-2 text-sm text-gray-500">
                {shipment.package_weight_kg}kg · Qty {shipment.package_quantity} · {formatCurrency(shipment.pricing_amount, tenant)}
              </p>
            </div>
            <div className="space-y-3">
              {quickNextStatuses.length > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  loading={updateStatusMutation.isPending}
                  onClick={() => setShowStatusModal(true)}
                >
                  Update Status
                </Button>
              )}
              <Button variant="secondary" size="sm" className="w-full" asChild>
                <Link to="/returns">Manage returns</Link>
              </Button>
            </div>
          </section>

          <Tabs
            value={activeTab}
            onValueChange={(tab) => {
              setActiveTab(tab);
              setVisitedTabs((prev) => new Set([...prev, tab]));
            }}
            items={[
              { value: "timeline", label: "Timeline" },
              { value: "documents", label: "Documents" },
              { value: "invoice", label: "Invoice" },
              { value: "notes", label: "Notes" }
            ]}
          >
            {visitedTabs.has("timeline") ? (
              <TabsContent value="timeline">
                <ShipmentTimeline
                  events={shipment.timeline}
                  onUpdateStatus={() => undefined}
                  isUpdating={updateStatusMutation.isPending}
                />
              </TabsContent>
            ) : null}

            {visitedTabs.has("documents") ? (
              <TabsContent value="documents">
                <div className="space-y-4">
                  <DocumentsPanel documents={shipment.documents} onDocumentsChange={(documents) => void documents} />
                  {shipment.status === "DELIVERED" ? (
                    <PODViewer
                      shipmentId={shipment.id}
                      podAssets={podQuery.data?.podAssets ?? []}
                      recipientName={podQuery.data?.recipientName ?? shipment.customer_name}
                      deliveredAt={podQuery.data?.deliveredAt}
                      capturedBy={podQuery.data?.capturedBy ?? shipment.assigned_driver_name ?? "Field Operator"}
                    />
                  ) : null}
                </div>
              </TabsContent>
            ) : null}

            {visitedTabs.has("invoice") ? (
              <TabsContent value="invoice">
                {shipment.invoice ? (
                  <div className="rounded-lg border border-gray-200 bg-white p-4">
                    <p className="text-sm font-semibold text-gray-900">{shipment.invoice.number}</p>
                    <p className="text-sm text-gray-600">
                      Amount {formatCurrency(shipment.invoice.amount, tenant)} · Due {formatDateTime(shipment.invoice.due_date, tenant)}
                    </p>
                    <Button asChild className="mt-3">
                      <Link to={`/finance/${shipment.invoice.id}`}>View invoice</Link>
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">No invoice linked.</div>
                )}
              </TabsContent>
            ) : null}

            {visitedTabs.has("notes") ? (
              <TabsContent value="notes">
                <NotesPanel notes={shipment.notes} canWrite onNotesChange={(notes) => void notes} />
              </TabsContent>
            ) : null}
          </Tabs>
        </div>
      )}

      {shipment ? (
        <UpdateStatusModal
          open={showStatusModal}
          onOpenChange={setShowStatusModal}
          currentStatus={shipment.status}
          hasAssignedDriver={!!shipment.assigned_driver_id}
          onConfirm={async ({ nextStatus, notes, timestamp, failedReason, assignedDriverId, courierRefOrigin, courierRefDestination, originCourierConfirmed, destinationCourierConfirmed, customsClearanceConfirmed }) => {
            await updateStatusMutation.mutateAsync({ status: nextStatus, notes, timestamp, failedReason, assignedDriverId, courierRefOrigin, courierRefDestination, originCourierConfirmed, destinationCourierConfirmed, customsClearanceConfirmed });
          }}
        />
      ) : null}
    </PageShell>
  );
}
