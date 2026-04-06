import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";

import { DocumentsPanel } from "@/components/shipments/DocumentsPanel";
import { NotesPanel } from "@/components/shipments/NotesPanel";
import { PODViewer } from "@/components/shipments/PODViewer";
import { ShipmentTimeline } from "@/components/shipments/ShipmentTimeline";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsContent } from "@/components/ui/Tabs";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";
import { useTenantStore } from "@/stores/useTenantStore";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { ShipmentDetail } from "@/types/shipment";
import type { ShipmentState } from "@/types/domain";

const fallbackShipment = (id: string): ShipmentDetail => ({
  id,
  tracking_number: id,
  status: "OUT_FOR_DELIVERY",
  service_tier: "Express",
  customer_id: "cus-1",
  customer_name: "Acme Retail",
  created_at: new Date().toISOString(),
  pickup_address: "Origin",
  delivery_address: "Destination",
  origin_city: "Origin",
  destination_city: "Destination",
  package_weight_kg: 4.2,
  package_quantity: 1,
  pricing_amount: 22.5,
  timeline: [],
  documents: [],
  notes: []
});

type PodResponse = {
  podAssets: Array<{ id: string; type: string; fileUrl: string; capturedAt?: string }>;
  recipientName: string;
  deliveredAt?: string | null;
  capturedBy: string;
};

async function fetchShipment(id: string): Promise<ShipmentDetail> {
  const response = await api.get<ShipmentDetail>(`/v1/shipments/${id}`);
  return response.data;
}

export function ShipmentDetailPage() {
  const { id = "FWD-2026-00001" } = useParams();
  const tenant = useTenantStore((state) => state.tenant);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("timeline");
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(["timeline"]));

  const shipmentQuery = useQuery({
    queryKey: ["shipment-detail", id],
    queryFn: () => fetchShipment(id),
    retry: 1
  });
  const shipment = shipmentQuery.data ?? fallbackShipment(id);

  const podQuery = useQuery({
    queryKey: ["shipment-pod", id],
    queryFn: async () => (await api.get<PodResponse>(`/v1/shipments/${id}/pod`)).data,
    enabled: shipment.status === "DELIVERED"
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (nextStatus: ShipmentState) => {
      await api.patch(`/v1/shipments/${id}/status`, { status: nextStatus });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["shipment-detail", id] });
      await queryClient.invalidateQueries({ queryKey: ["shipments-list"] });
    }
  });

  const quickNextStatuses = useMemo(() => {
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
  }, [shipment.status]);

  return (
    <PageShell title={`Shipment ${shipment.tracking_number}`} description="Operational detail, timeline, documents, and POD.">
      {shipmentQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : (
        <div className="space-y-4">
          <section className="grid gap-4 rounded-lg border border-gray-200 bg-white p-4 lg:grid-cols-[2fr,1fr]">
            <div>
              <p className="text-xs text-gray-500">Tracking</p>
              <p className="font-mono text-xl font-semibold text-gray-900">{shipment.tracking_number}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StatusBadge status={shipment.status} />
                <span className="text-sm text-gray-600">{shipment.service_tier}</span>
              </div>
              <p className="mt-3 text-sm text-gray-700">
                {shipment.pickup_address} {"->"} {shipment.delivery_address}
              </p>
              <p className="mt-1 text-sm text-gray-600">
                Weight {shipment.package_weight_kg}kg · Qty {shipment.package_quantity}
              </p>
              <p className="mt-1 text-sm text-gray-600">{formatCurrency(shipment.pricing_amount, tenant)}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xs text-gray-500">Quick update</p>
              <div className="flex flex-wrap gap-2">
                {quickNextStatuses.map((status) => (
                  <Button key={status} size="sm" variant="secondary" onClick={() => updateStatusMutation.mutate(status)}>
                    {status}
                  </Button>
                ))}
              </div>
              <Button variant="secondary" className="mt-3" asChild>
                <Link to={`/returns`}>Request return / manage returns</Link>
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
                <ShipmentTimeline events={shipment.timeline} onUpdateStatus={() => undefined} />
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
                      capturedBy={podQuery.data?.capturedBy ?? shipment.assigned_driver_name ?? "Driver"}
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
    </PageShell>
  );
}
