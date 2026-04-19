import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, Route, StickyNote, Truck, X } from "lucide-react";
import { Link } from "react-router-dom";

import { AssignDriverModal } from "@/components/shipments/AssignDriverModal";
import { DocumentsPanel } from "@/components/shipments/DocumentsPanel";
import { NotesPanel } from "@/components/shipments/NotesPanel";
import { PODViewer } from "@/components/shipments/PODViewer";
import { ShipmentTimeline } from "@/components/shipments/ShipmentTimeline";
import { UpdateStatusModal } from "@/components/shipments/UpdateStatusModal";
import { EmptyState } from "@/components/shared/EmptyState";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsContent } from "@/components/ui/Tabs";
import { Textarea } from "@/components/ui/Textarea";
import { api } from "@/lib/api";
import { normalizePodResponse, normalizeShipmentDetail } from "@/lib/shipment-normalizers";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { useAppStore } from "@/stores/useAppStore";
import { useTenantStore } from "@/stores/useTenantStore";
import type { ShipmentState } from "@/types/domain";
import type { DriverListItem, ShipmentDetail, ShipmentDocument, ShipmentListItem, ShipmentNote } from "@/types/shipment";

type ShipmentWorkspacePanelProps = {
  shipmentId: string;
  fallbackShipment?: ShipmentListItem;
  onClose: () => void;
};

type WorkflowStep = {
  id: string;
  title: string;
  owner: string;
  targetStatus: ShipmentState;
  notes: string;
  createdAt: string;
  completed: boolean;
};

const WORKFLOW_STORAGE_PREFIX = "fw-shipment-workflows";

function buildFallbackDetail(shipment: ShipmentListItem): ShipmentDetail {
  return {
    id: shipment.id,
    tracking_number: shipment.tracking_number,
    status: shipment.status,
    service_tier: shipment.service_tier,
    customer_id: "unknown-customer",
    customer_name: shipment.customer_name,
    reference_number: shipment.reference,
    created_at: shipment.created_at,
    pickup_address: shipment.origin,
    delivery_address: shipment.destination,
    origin_city: shipment.origin,
    destination_city: shipment.destination,
    package_weight_kg: 0,
    package_quantity: 1,
    pricing_amount: 0,
    assigned_driver_name: shipment.driver_name,
    timeline: [
      {
        id: `${shipment.id}-created`,
        status: shipment.status,
        description: `Shipment is currently ${shipment.status.replaceAll("_", " ").toLowerCase()}.`,
        timestamp: shipment.created_at,
        actor: "Operations"
      }
    ],
    documents: [],
    notes: []
  };
}

function workflowStorageKey(shipmentId: string) {
  return `${WORKFLOW_STORAGE_PREFIX}:${shipmentId}`;
}

function loadWorkflowSteps(shipmentId: string): WorkflowStep[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(workflowStorageKey(shipmentId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveWorkflowSteps(shipmentId: string, steps: WorkflowStep[]) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(workflowStorageKey(shipmentId), JSON.stringify(steps));
}

async function fetchShipment(shipmentId: string) {
  const response = await api.get(`/v1/shipments/${shipmentId}`);
  return normalizeShipmentDetail(response.data, shipmentId);
}

async function fetchPod(shipmentId: string) {
  const response = await api.get(`/v1/shipments/${shipmentId}/pod`);
  return normalizePodResponse(response.data);
}

async function fetchDrivers(): Promise<DriverListItem[]> {
  const response = await api.get<{ drivers?: Array<Record<string, unknown>> }>("/v1/fleet/drivers");
  const payload = Array.isArray(response.data) ? response.data : response.data.drivers ?? [];

  return payload.map((entry, index) => {
    const user = typeof entry.user === "object" && entry.user !== null ? (entry.user as Record<string, unknown>) : null;
    const name = [user?.firstName, user?.lastName].filter((value) => typeof value === "string" && value).join(" ");
    return {
      id: typeof entry.id === "string" ? entry.id : `driver-${index}`,
      name: name || (typeof user?.email === "string" ? user.email : "Field Operator"),
      avatar_url: typeof user?.avatarUrl === "string" ? user.avatarUrl : undefined,
      current_load: typeof entry.currentLoad === "number" ? entry.currentLoad : 0,
      status: entry.isAvailable === false ? "offline" : (typeof entry.status === "string" ? (entry.status.toLowerCase() as DriverListItem["status"]) : "available")
    };
  });
}

export function ShipmentWorkspacePanel({ shipmentId, fallbackShipment, onClose }: ShipmentWorkspacePanelProps) {
  const tenant = useTenantStore((state) => state.tenant);
  const addToast = useAppStore((state) => state.addToast);
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("overview");
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(new Set(["overview"]));
  const [documents, setDocuments] = useState<ShipmentDocument[]>([]);
  const [notes, setNotes] = useState<ShipmentNote[]>([]);
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([]);
  const [workflowTitle, setWorkflowTitle] = useState("");
  const [workflowOwner, setWorkflowOwner] = useState("");
  const [workflowTargetStatus, setWorkflowTargetStatus] = useState<ShipmentState>("PROCESSING");
  const [workflowNotes, setWorkflowNotes] = useState("");
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [assignDriverOpen, setAssignDriverOpen] = useState(false);

  const shipmentQuery = useQuery({
    queryKey: ["shipment-workspace", shipmentId],
    queryFn: () => fetchShipment(shipmentId),
    enabled: Boolean(shipmentId),
    retry: 1
  });

  const shipment = shipmentQuery.data ?? (fallbackShipment ? buildFallbackDetail(fallbackShipment) : null);

  const podQuery = useQuery({
    queryKey: ["shipment-workspace-pod", shipmentId],
    queryFn: () => fetchPod(shipmentId),
    enabled: Boolean(shipmentId && shipment?.status === "DELIVERED"),
    retry: 1
  });

  const driversQuery = useQuery({
    queryKey: ["shipment-workspace-drivers"],
    queryFn: fetchDrivers,
    retry: 1
  });

  useEffect(() => {
    if (!shipmentId) {
      return;
    }

    setWorkflowSteps(loadWorkflowSteps(shipmentId));
    setActiveTab("overview");
    setVisitedTabs(new Set(["overview"]));
  }, [shipmentId]);

  useEffect(() => {
    if (!shipment) {
      return;
    }

    setDocuments(shipment.documents);
    setNotes(shipment.notes);
  }, [shipment]);

  useEffect(() => {
    if (!shipmentId) {
      return;
    }

    saveWorkflowSteps(shipmentId, workflowSteps);
  }, [shipmentId, workflowSteps]);

  const updateStatusMutation = useMutation({
    mutationFn: async (payload: { nextStatus: ShipmentState; notes?: string; failedReason?: string }) => {
      await api.patch(`/v1/shipments/${shipmentId}/status`, {
        status: payload.nextStatus,
        notes: payload.notes,
        failedReason: payload.failedReason
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["shipments-list"] }),
        queryClient.invalidateQueries({ queryKey: ["shipment-workspace", shipmentId] }),
        queryClient.invalidateQueries({ queryKey: ["shipment-detail", shipmentId] }),
        queryClient.invalidateQueries({ queryKey: ["field-ops-overview"] })
      ]);
      addToast({ title: "Shipment status updated", variant: "success" });
    },
    onError: () => {
      addToast({
        title: "Status update failed",
        description: "Check the shipment rules. Delivered updates still require POD on the backend.",
        variant: "error"
      });
    }
  });

  const assignDriverMutation = useMutation({
    mutationFn: async (driverId: string) => {
      await api.patch(`/v1/shipments/${shipmentId}/assign-driver`, { driverId });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["shipments-list"] }),
        queryClient.invalidateQueries({ queryKey: ["shipment-workspace", shipmentId] })
      ]);
      addToast({ title: "Field operator assigned", variant: "success" });
    },
    onError: () => {
      addToast({ title: "Field operator assignment failed", variant: "error" });
    }
  });

  const workflowCounts = useMemo(
    () => ({
      total: workflowSteps.length,
      completed: workflowSteps.filter((step) => step.completed).length,
      open: workflowSteps.filter((step) => !step.completed).length
    }),
    [workflowSteps]
  );

  const createWorkflowStep = () => {
    if (!workflowTitle.trim()) {
      return;
    }

    setWorkflowSteps((current) => [
      {
        id: crypto.randomUUID(),
        title: workflowTitle.trim(),
        owner: workflowOwner.trim() || "Operations",
        targetStatus: workflowTargetStatus,
        notes: workflowNotes.trim(),
        createdAt: new Date().toISOString(),
        completed: false
      },
      ...current
    ]);
    setWorkflowTitle("");
    setWorkflowOwner("");
    setWorkflowTargetStatus(shipment?.status ?? "PROCESSING");
    setWorkflowNotes("");
    addToast({ title: "Workflow step created", variant: "success" });
  };

  if (!shipmentId) {
    return null;
  }

  return (
    <>
      <aside className="sticky top-[calc(var(--topbar-height)+16px)] hidden h-fit max-h-[calc(100vh-var(--topbar-height)-32px)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm lg:flex lg:flex-col">
        <div className="border-b border-gray-200 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">Shipment workspace</p>
              <h2 className="mt-1 font-mono text-lg font-semibold text-gray-900">
                {shipment?.tracking_number ?? fallbackShipment?.tracking_number ?? shipmentId}
              </h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {shipment ? <StatusBadge status={shipment.status} /> : null}
                {shipment?.service_tier ? <span className="text-sm text-gray-500">{shipment.service_tier}</span> : null}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-2 text-gray-500 transition hover:bg-gray-100"
              aria-label="Close shipment workspace"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {shipmentQuery.isLoading && !shipment ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : shipment ? (
            <>
              <section className="grid gap-3 sm:grid-cols-2">
                <article className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Customer</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">{shipment.customer_name}</p>
                  <p className="mt-1 text-sm text-gray-600">{shipment.delivery_address}</p>
                </article>
                <article className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Field Operator</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">{shipment.assigned_driver_name ?? "Unassigned"}</p>
                  <p className="mt-1 text-sm text-gray-600">Created {formatDateTime(shipment.created_at, tenant)}</p>
                </article>
                <article className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Shipment value</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">{formatCurrency(shipment.pricing_amount, tenant)}</p>
                  <p className="mt-1 text-sm text-gray-600">
                    {shipment.package_weight_kg}kg - Qty {shipment.package_quantity}
                  </p>
                </article>
                <article className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Workflow</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">{workflowCounts.open} open steps</p>
                  <p className="mt-1 text-sm text-gray-600">{workflowCounts.completed} completed steps</p>
                </article>
              </section>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setStatusModalOpen(true)}>
                  Update status
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setAssignDriverOpen(true)}>
                  Assign field operator
                </Button>
                <Button size="sm" variant="secondary" asChild>
                  <Link to={`/shipments/${shipment.id}`}>Open full page</Link>
                </Button>
              </div>

              <Tabs
                value={activeTab}
                onValueChange={(tab) => {
                  setActiveTab(tab);
                  setVisitedTabs((current) => new Set([...current, tab]));
                }}
                items={[
                  { value: "overview", label: "Overview" },
                  { value: "workflow", label: "Workflow" },
                  { value: "timeline", label: "Timeline" },
                  { value: "documents", label: "Documents" },
                  { value: "notes", label: "Notes" }
                ]}
              >
                {visitedTabs.has("overview") ? (
                  <TabsContent value="overview">
                    <div className="space-y-4">
                      <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                        <div className="flex items-center gap-2">
                          <Route size={16} className="text-[var(--tenant-primary)]" />
                          <h3 className="text-sm font-semibold text-gray-900">Route details</h3>
                        </div>
                        <div className="mt-3 space-y-3 text-sm text-gray-600">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Pickup</p>
                            <p className="mt-1">{shipment.pickup_address}</p>
                          </div>
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Delivery</p>
                            <p className="mt-1">{shipment.delivery_address}</p>
                          </div>
                          {shipment.special_instructions ? (
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Instructions</p>
                              <p className="mt-1">{shipment.special_instructions}</p>
                            </div>
                          ) : null}
                        </div>
                      </section>

                      {shipment.status === "DELIVERED" ? (
                        <PODViewer
                          shipmentId={shipment.id}
                          podAssets={podQuery.data?.podAssets ?? []}
                          recipientName={podQuery.data?.recipientName ?? shipment.customer_name}
                          deliveredAt={podQuery.data?.deliveredAt}
                          capturedBy={podQuery.data?.capturedBy ?? shipment.assigned_driver_name ?? "Field Operator"}
                        />
                      ) : null}

                      {shipment.invoice ? (
                        <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Invoice</p>
                          <p className="mt-2 text-sm font-semibold text-gray-900">{shipment.invoice.number}</p>
                          <p className="mt-1 text-sm text-gray-600">
                            {formatCurrency(shipment.invoice.amount, tenant)} due {formatDateTime(shipment.invoice.due_date, tenant)}
                          </p>
                        </section>
                      ) : null}
                    </div>
                  </TabsContent>
                ) : null}

                {visitedTabs.has("workflow") ? (
                  <TabsContent value="workflow">
                    <div className="space-y-4">
                      <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                        <div className="flex items-center gap-2">
                          <ClipboardList size={16} className="text-[var(--tenant-primary)]" />
                          <h3 className="text-sm font-semibold text-gray-900">Create workflow steps</h3>
                        </div>
                        <div className="mt-3 space-y-3">
                          <Input
                            value={workflowTitle}
                            onChange={(event) => setWorkflowTitle(event.target.value)}
                            placeholder="Step title"
                          />
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Input
                              value={workflowOwner}
                              onChange={(event) => setWorkflowOwner(event.target.value)}
                              placeholder="Owner"
                            />
                            <Select
                              value={workflowTargetStatus}
                              onValueChange={(value) => setWorkflowTargetStatus(value as ShipmentState)}
                              options={[
                                { label: "PROCESSING", value: "PROCESSING" },
                                { label: "PICKED_UP", value: "PICKED_UP" },
                                { label: "IN_TRANSIT", value: "IN_TRANSIT" },
                                { label: "OUT_FOR_DELIVERY", value: "OUT_FOR_DELIVERY" },
                                { label: "DELIVERED", value: "DELIVERED" },
                                { label: "RETURNED", value: "RETURNED" },
                                { label: "EXCEPTION", value: "EXCEPTION" }
                              ]}
                            />
                          </div>
                          <Textarea
                            value={workflowNotes}
                            onChange={(event) => setWorkflowNotes(event.target.value)}
                            placeholder="What should happen in this workflow step?"
                            className="min-h-[96px]"
                          />
                          <Button onClick={createWorkflowStep} disabled={!workflowTitle.trim()} className="w-full">
                            Add workflow step
                          </Button>
                        </div>
                      </section>

                      {workflowSteps.length === 0 ? (
                        <EmptyState
                          icon={StickyNote}
                          title="No workflow steps yet"
                          description="Create the operational steps this shipment should move through from assignment to closure."
                        />
                      ) : (
                        <div className="space-y-3">
                          {workflowSteps.map((step) => (
                            <article key={step.id} className="rounded-lg border border-gray-200 bg-white p-4">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-gray-900">{step.title}</p>
                                  <p className="mt-1 text-xs uppercase tracking-[0.14em] text-gray-500">{step.targetStatus.replaceAll("_", " ")}</p>
                                </div>
                                <StatusBadge status={step.completed ? "DELIVERED" : shipment.status} />
                              </div>
                              <p className="mt-2 text-sm text-gray-600">Owner: {step.owner}</p>
                              {step.notes ? <p className="mt-2 text-sm text-gray-600">{step.notes}</p> : null}
                              <p className="mt-2 text-xs text-gray-400">Created {formatDateTime(step.createdAt, tenant)}</p>
                              <div className="mt-3 flex gap-2">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() =>
                                    setWorkflowSteps((current) =>
                                      current.map((item) =>
                                        item.id === step.id ? { ...item, completed: !item.completed } : item
                                      )
                                    )
                                  }
                                >
                                  {step.completed ? "Reopen" : "Mark complete"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    setWorkflowSteps((current) => current.filter((item) => item.id !== step.id))
                                  }
                                >
                                  Remove
                                </Button>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>
                  </TabsContent>
                ) : null}

                {visitedTabs.has("timeline") ? (
                  <TabsContent value="timeline">
                    <ShipmentTimeline events={shipment.timeline} onUpdateStatus={() => setStatusModalOpen(true)} />
                  </TabsContent>
                ) : null}

                {visitedTabs.has("documents") ? (
                  <TabsContent value="documents">
                    <DocumentsPanel documents={documents} onDocumentsChange={setDocuments} />
                  </TabsContent>
                ) : null}

                {visitedTabs.has("notes") ? (
                  <TabsContent value="notes">
                    <NotesPanel notes={notes} onNotesChange={setNotes} canWrite />
                  </TabsContent>
                ) : null}
              </Tabs>
            </>
          ) : (
            <EmptyState
              icon={Truck}
              title="Shipment details unavailable"
              description="The selected shipment could not be loaded. Choose another shipment or refresh the list."
            />
          )}
        </div>
      </aside>

      {shipment ? (
        <>
          <UpdateStatusModal
            open={statusModalOpen}
            onOpenChange={setStatusModalOpen}
            currentStatus={shipment.status}
            onConfirm={async (payload) => {
              await updateStatusMutation.mutateAsync({
                nextStatus: payload.nextStatus,
                notes: payload.notes,
                failedReason: payload.failedReason
              });
            }}
          />

          <AssignDriverModal
            open={assignDriverOpen}
            onOpenChange={setAssignDriverOpen}
            drivers={driversQuery.data ?? []}
            currentDriverName={shipment.assigned_driver_name}
            currentDriverId={shipment.assigned_driver_id}
            onConfirm={async (driverId) => {
              await assignDriverMutation.mutateAsync(driverId);
            }}
          />
        </>
      ) : null}
    </>
  );
}
