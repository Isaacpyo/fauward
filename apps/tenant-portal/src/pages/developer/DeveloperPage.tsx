import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Line, LineChart, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { Tabs, TabsContent } from "@/components/ui/Tabs";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";

type ApiKey = { id: string; name?: string; scopes?: string[]; isSandbox?: boolean; lastUsedAt?: string; monthlyRequestCount?: number };
type WebhookEndpoint = { id: string; url: string; events: string[]; isActive: boolean };
type WebhookDelivery = { id: string; endpointId?: string; eventType: string; status: string; responseCode?: number; responseLatencyMs?: number; createdAt: string; deadLetteredAt?: string };
type UsageRow = { keyId: string; keyName: string; endpoint: string; method: string; date: string; requestCount: number; errorCount: number; avgLatencyMs: number };

const scopes = ["shipments:read", "shipments:write", "labels:read", "webhooks:write", "returns:read", "customs:read", "api-keys:read"];

export function DeveloperPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") ?? "keys";
  const setTab = (next: string) => setSearchParams({ tab: next });
  const [newKey, setNewKey] = useState({ name: "", scopes: [] as string[], isSandbox: false });
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [newEndpoint, setNewEndpoint] = useState({ url: "", events: "shipment.created,shipment.delivered" });
  const [dateRange, setDateRange] = useState({ from: "2026-04-01", to: new Date().toISOString().slice(0, 10) });

  const keysQuery = useQuery({ queryKey: ["api-keys"], queryFn: async () => (await api.get<ApiKey[]>("/v1/tenant/api-keys")).data });
  const usageQuery = useQuery({ queryKey: ["api-usage", dateRange], queryFn: async () => (await api.get<{ breakdown?: UsageRow[]; rows?: UsageRow[] }>("/v1/tenant/api-usage", { params: dateRange })).data });
  const webhooksQuery = useQuery({ queryKey: ["webhooks"], queryFn: async () => (await api.get<WebhookEndpoint[]>("/v1/tenant/webhooks")).data });
  const deliveriesQuery = useQuery({ queryKey: ["webhook-deliveries"], queryFn: async () => (await api.get<WebhookDelivery[]>("/v1/tenant/webhooks/deliveries")).data });

  const createKey = useMutation({
    mutationFn: async () => (await api.post("/v1/tenant/api-keys", newKey)).data,
    onSuccess: (data) => {
      setCreatedKey(data.key);
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    }
  });
  const revokeKey = useMutation({
    mutationFn: async (id: string) => api.delete(`/v1/tenant/api-keys/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] })
  });
  const createWebhook = useMutation({
    mutationFn: async () => api.post("/v1/tenant/webhooks", { url: newEndpoint.url, events: newEndpoint.events.split(",").map((event) => event.trim()).filter(Boolean) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhooks"] })
  });
  const updateWebhook = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => api.patch(`/v1/tenant/webhooks/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhooks"] })
  });
  const replay = useMutation({
    mutationFn: async ({ endpointId, deliveryId }: { endpointId: string; deliveryId: string }) => api.post(`/v1/tenant/webhooks/${endpointId}/deliveries/${deliveryId}/replay`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["webhook-deliveries"] })
  });

  const usageRows = usageQuery.data?.breakdown ?? usageQuery.data?.rows ?? [];
  const chartRows = usageRows.map((row) => ({ date: row.date, requests: row.requestCount, key: row.keyName }));

  return (
    <PageShell title="Developer" description="Manage API keys, webhook delivery health, and usage analytics.">
      <Tabs value={tab} onValueChange={setTab} items={[
        { value: "keys", label: "API keys" },
        { value: "webhooks", label: "Webhooks" },
        { value: "usage", label: "Usage" }
      ]} hideTabList>
        <TabsContent value="keys">
          <div className="space-y-4">
            {createdKey ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                <div className="font-semibold">This will not be shown again</div>
                <code className="mt-2 block break-all rounded bg-white p-2">{createdKey}</code>
              </div>
            ) : null}
            <div className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-[1fr_2fr_auto]">
              <Input value={newKey.name} onChange={(event) => setNewKey((current) => ({ ...current, name: event.target.value }))} placeholder="Key name" />
              <div className="flex flex-wrap gap-2">
                {scopes.map((scope) => (
                  <label key={scope} className="flex items-center gap-2 rounded-md border border-gray-200 px-2 py-1 text-xs">
                    <input
                      type="checkbox"
                      checked={newKey.scopes.includes(scope)}
                      onChange={(event) => setNewKey((current) => ({ ...current, scopes: event.target.checked ? [...current.scopes, scope] : current.scopes.filter((item) => item !== scope) }))}
                    />
                    {scope}
                  </label>
                ))}
              </div>
              <div className="flex items-center gap-3"><Switch checked={newKey.isSandbox} onCheckedChange={(isSandbox) => setNewKey((current) => ({ ...current, isSandbox }))} /><Button onClick={() => createKey.mutate()}>Create key</Button></div>
            </div>
            <Table columns={["Name", "Scopes", "Sandbox", "Last used", "Monthly requests", "Revoke"]}>
              {(keysQuery.data ?? []).map((key) => (
                <TableRow key={key.id}>
                  <TableCell>{key.name ?? key.id}</TableCell>
                  <TableCell>{key.scopes?.join(", ")}</TableCell>
                  <TableCell>{key.isSandbox ? <Badge variant="warning">Sandbox</Badge> : <Badge variant="neutral">Live</Badge>}</TableCell>
                  <TableCell>{key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString() : "Never"}</TableCell>
                  <TableCell>{key.monthlyRequestCount ?? 0}</TableCell>
                  <TableCell><Button size="sm" variant="danger" onClick={() => window.confirm("Revoke this key?") && revokeKey.mutate(key.id)}>Revoke</Button></TableCell>
                </TableRow>
              ))}
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="webhooks">
          <div className="space-y-4">
            <div className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 md:grid-cols-[1fr_1fr_auto]">
              <Input value={newEndpoint.url} onChange={(event) => setNewEndpoint((current) => ({ ...current, url: event.target.value }))} placeholder="Endpoint URL" />
              <Input value={newEndpoint.events} onChange={(event) => setNewEndpoint((current) => ({ ...current, events: event.target.value }))} placeholder="Event types, comma separated" />
              <Button onClick={() => createWebhook.mutate()}>Add endpoint</Button>
            </div>
            <Table columns={["URL", "Events", "Active", "Last 24h", "Delivery log"]}>
              {(webhooksQuery.data ?? []).map((endpoint) => {
                const deliveries = (deliveriesQuery.data ?? []).filter((delivery) => delivery.endpointId === endpoint.id);
                const success = deliveries.filter((delivery) => delivery.status === "DELIVERED").length;
                const failed = deliveries.filter((delivery) => delivery.status !== "DELIVERED").length;
                return (
                  <TableRow key={endpoint.id}>
                    <TableCell>{endpoint.url}</TableCell>
                    <TableCell>{endpoint.events.join(", ")}</TableCell>
                    <TableCell><Switch checked={endpoint.isActive} onCheckedChange={(isActive) => updateWebhook.mutate({ id: endpoint.id, isActive })} /></TableCell>
                    <TableCell>{success} success / {failed} failed</TableCell>
                    <TableCell>
                      <div className="max-h-40 space-y-2 overflow-auto">
                        {deliveries.map((delivery) => (
                          <div key={delivery.id} className="rounded-md border border-gray-100 p-2 text-xs">
                            <div>{delivery.eventType} - {delivery.status} - {delivery.responseCode ?? "no code"} - {delivery.responseLatencyMs ?? 0} ms</div>
                            {delivery.deadLetteredAt ? <Button size="sm" className="mt-2" variant="secondary" onClick={() => replay.mutate({ endpointId: endpoint.id, deliveryId: delivery.id })}>Retry</Button> : null}
                          </div>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </Table>
          </div>
        </TabsContent>

        <TabsContent value="usage">
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Input type="date" value={dateRange.from} onChange={(event) => setDateRange((current) => ({ ...current, from: event.target.value }))} />
              <Input type="date" value={dateRange.to} onChange={(event) => setDateRange((current) => ({ ...current, to: event.target.value }))} />
            </div>
            <div className="h-72 rounded-lg border border-gray-200 bg-white p-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartRows}>
                  <XAxis dataKey="date" />
                  <YAxis />
                  <ChartTooltip />
                  <Line dataKey="requests" stroke="var(--tenant-primary)" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <Table columns={["Key", "Endpoint", "Method", "Date", "Requests", "Errors", "Avg latency"]}>
              {usageRows.map((row, index) => (
                <TableRow key={`${row.keyId}-${row.endpoint}-${row.date}-${index}`}>
                  <TableCell>{row.keyName}</TableCell>
                  <TableCell>{row.endpoint}</TableCell>
                  <TableCell>{row.method}</TableCell>
                  <TableCell>{row.date}</TableCell>
                  <TableCell>{row.requestCount}</TableCell>
                  <TableCell>{row.errorCount}</TableCell>
                  <TableCell>{Math.round(row.avgLatencyMs)} ms</TableCell>
                </TableRow>
              ))}
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
