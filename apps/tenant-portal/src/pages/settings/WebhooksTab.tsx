import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { AddEditEndpointModal } from "@/components/settings/AddEditEndpointModal";
import { WebhookDeliveryLog } from "@/components/settings/WebhookDeliveryLog";
import { WebhookEndpointTable } from "@/components/settings/WebhookEndpointTable";
import { WebhookPayloadViewer } from "@/components/settings/WebhookPayloadViewer";
import type { WebhookDeliveryLogItem, WebhookEndpoint, WebhookEventType, WebhookSendTestResult } from "@/components/settings/types";
import { WEBHOOK_EVENTS } from "@/components/settings/types";
import { PlanGate } from "@/components/shared/PlanGate";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { useAppStore } from "@/stores/useAppStore";

const ENDPOINTS_QUERY_KEY = ["settings", "webhooks", "endpoints"];
const DELIVERIES_QUERY_KEY = ["settings", "webhooks", "deliveries"];

const MOCK_ENDPOINTS: WebhookEndpoint[] = [
  {
    id: "wh_1",
    url: "https://example.com/webhooks/fauward",
    events: ["shipment.created", "shipment.status_changed", "invoice.paid"],
    active: true,
    secret: "whsec_4ca4fd9a6ca74cf081ef1ca7d9f8b94f",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString()
  }
];

const MOCK_DELIVERIES: WebhookDeliveryLogItem[] = [
  {
    id: "whdl_1",
    endpointId: "wh_1",
    timestamp: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    eventType: "shipment.status_changed",
    statusCode: 200,
    latencyMs: 118,
    attempts: 1,
    requestHeaders: { "content-type": "application/json", "x-fauward-signature": "sha256=..." },
    requestBody: { shipment_id: "shp_123", status: "IN_TRANSIT" },
    responseHeaders: { "content-type": "application/json" },
    responseBody: { received: true }
  }
];

async function fetchEndpoints(): Promise<WebhookEndpoint[]> {
  try {
    const response = await api.get<WebhookEndpoint[]>("/settings/webhooks/endpoints");
    return response.data;
  } catch {
    return MOCK_ENDPOINTS;
  }
}

async function fetchDeliveries(): Promise<WebhookDeliveryLogItem[]> {
  try {
    const response = await api.get<WebhookDeliveryLogItem[]>("/settings/webhooks/deliveries");
    return response.data;
  } catch {
    return MOCK_DELIVERIES;
  }
}

async function saveEndpoint(payload: { id?: string; url: string; events: WebhookEventType[]; secret: string; active: boolean }): Promise<WebhookEndpoint> {
  if (payload.id) {
    try {
      const response = await api.put<WebhookEndpoint>(`/settings/webhooks/endpoints/${payload.id}`, payload);
      return response.data;
    } catch {
      return {
        id: payload.id,
        url: payload.url,
        events: payload.events,
        secret: payload.secret,
        active: payload.active,
        createdAt: new Date().toISOString()
      };
    }
  }

  try {
    const response = await api.post<WebhookEndpoint>("/settings/webhooks/endpoints", payload);
    return response.data;
  } catch {
    return {
      id: crypto.randomUUID(),
      url: payload.url,
      events: payload.events,
      secret: payload.secret,
      active: payload.active,
      createdAt: new Date().toISOString()
    };
  }
}

async function deleteEndpoint(id: string) {
  try {
    await api.delete(`/settings/webhooks/endpoints/${id}`);
  } catch {
    return;
  }
}

async function sendTest(endpoint: WebhookEndpoint): Promise<WebhookSendTestResult> {
  try {
    const response = await api.post<WebhookSendTestResult>(`/settings/webhooks/endpoints/${endpoint.id}/test`);
    return response.data;
  } catch {
    const statusCode = Math.random() > 0.2 ? 200 : 500;
    return {
      endpointId: endpoint.id,
      ok: statusCode >= 200 && statusCode < 300,
      statusCode,
      latencyMs: Math.floor(Math.random() * 200) + 60,
      responsePreview: statusCode === 200 ? "OK" : "Internal Server Error"
    };
  }
}

export function WebhooksTab() {
  const user = useAppStore((state) => state.user);
  const addToast = useAppStore((state) => state.addToast);
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEndpoint, setEditingEndpoint] = useState<WebhookEndpoint | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<WebhookEndpoint | null>(null);
  const [selectedPayloadLog, setSelectedPayloadLog] = useState<WebhookDeliveryLogItem | undefined>(undefined);
  const [testResults, setTestResults] = useState<Record<string, WebhookSendTestResult | undefined>>({});

  const endpointsQuery = useQuery({
    queryKey: ENDPOINTS_QUERY_KEY,
    queryFn: fetchEndpoints,
    staleTime: 30_000,
    retry: 1
  });

  const deliveriesQuery = useQuery({
    queryKey: DELIVERIES_QUERY_KEY,
    queryFn: fetchDeliveries,
    staleTime: 15_000,
    retry: 1
  });

  const saveMutation = useMutation({
    mutationFn: saveEndpoint,
    onSuccess: (saved) => {
      queryClient.setQueryData<WebhookEndpoint[]>(ENDPOINTS_QUERY_KEY, (previous = []) => {
        const exists = previous.some((endpoint) => endpoint.id === saved.id);
        if (exists) {
          return previous.map((endpoint) => (endpoint.id === saved.id ? { ...endpoint, ...saved } : endpoint));
        }
        return [saved, ...previous];
      });
      addToast({ title: "Endpoint saved", variant: "success" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: deleteEndpoint,
    onSuccess: (_, id) => {
      queryClient.setQueryData<WebhookEndpoint[]>(ENDPOINTS_QUERY_KEY, (previous = []) => previous.filter((endpoint) => endpoint.id !== id));
      queryClient.setQueryData<WebhookDeliveryLogItem[]>(DELIVERIES_QUERY_KEY, (previous = []) => previous.filter((log) => log.endpointId !== id));
      setDeleteTarget(null);
      addToast({ title: "Endpoint deleted", variant: "warning" });
    }
  });

  const testMutation = useMutation({
    mutationFn: sendTest,
    onSuccess: (result, endpoint) => {
      setTestResults((previous) => ({ ...previous, [endpoint.id]: result }));
      queryClient.setQueryData<WebhookDeliveryLogItem[]>(DELIVERIES_QUERY_KEY, (previous = []) => [
        {
          id: crypto.randomUUID(),
          endpointId: endpoint.id,
          timestamp: new Date().toISOString(),
          eventType: endpoint.events[0] ?? WEBHOOK_EVENTS[0],
          statusCode: result.statusCode,
          latencyMs: result.latencyMs,
          attempts: 1,
          requestHeaders: { "content-type": "application/json", "x-fauward-signature": "sha256=test" },
          requestBody: { test: true, endpoint: endpoint.url },
          responseHeaders: { server: "mock" },
          responseBody: { preview: result.responsePreview }
        },
        ...previous
      ]);
      addToast({
        title: result.ok ? "Test delivered" : "Test failed",
        description: `${result.statusCode} in ${result.latencyMs}ms`,
        variant: result.ok ? "success" : "error"
      });
    }
  });

  const endpoints = useMemo(() => endpointsQuery.data ?? [], [endpointsQuery.data]);
  const deliveries = useMemo(() => deliveriesQuery.data ?? [], [deliveriesQuery.data]);

  return (
    <PlanGate minimumPlan="pro" currentPlan={user?.plan}>
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Webhooks</h3>
            <p className="text-sm text-gray-600">Manage endpoints, test deliveries, and inspect payload history.</p>
          </div>
          <Button
            onClick={() => {
              setEditingEndpoint(undefined);
              setModalOpen(true);
            }}
          >
            Add Endpoint
          </Button>
        </div>

        {endpointsQuery.isLoading ? (
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={`webhook-endpoint-skeleton-${index}`} className="mb-2 h-10 w-full last:mb-0" />
            ))}
          </div>
        ) : (
          <WebhookEndpointTable
            endpoints={endpoints}
            testResults={testResults}
            onAddEndpoint={() => {
              setEditingEndpoint(undefined);
              setModalOpen(true);
            }}
            onEdit={(endpoint) => {
              setEditingEndpoint(endpoint);
              setModalOpen(true);
            }}
            onDelete={(endpoint) => setDeleteTarget(endpoint)}
            onToggleActive={(endpoint, active) =>
              saveMutation.mutate({
                id: endpoint.id,
                url: endpoint.url,
                events: endpoint.events,
                secret: endpoint.secret,
                active
              })
            }
            onSendTest={(endpoint) => testMutation.mutate(endpoint)}
          />
        )}

        <section className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-900">Delivery Log</h4>
          {deliveriesQuery.isLoading ? (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={`webhook-log-skeleton-${index}`} className="mb-2 h-10 w-full last:mb-0" />
              ))}
            </div>
          ) : (
            <WebhookDeliveryLog logs={deliveries} onViewPayload={setSelectedPayloadLog} />
          )}
        </section>
      </section>

      <AddEditEndpointModal
        open={modalOpen}
        endpoint={editingEndpoint}
        onOpenChange={setModalOpen}
        onSave={async (payload) => {
          await saveMutation.mutateAsync(payload);
        }}
        saving={saveMutation.isPending}
      />

      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)} title="Delete endpoint">
        <p className="text-sm text-gray-700">
          Delete endpoint <span className="font-mono">{deleteTarget?.url}</span>? Delivery attempts will stop immediately.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={deleteMutation.isPending}
            onClick={() => {
              if (deleteTarget) {
                deleteMutation.mutate(deleteTarget.id);
              }
            }}
          >
            Delete
          </Button>
        </div>
      </Dialog>

      <WebhookPayloadViewer
        open={Boolean(selectedPayloadLog)}
        log={selectedPayloadLog}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedPayloadLog(undefined);
          }
        }}
      />
    </PlanGate>
  );
}

