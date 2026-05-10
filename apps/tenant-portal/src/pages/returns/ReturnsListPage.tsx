import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, TableCell, TableRow } from "@/components/ui/Table";
import { Tabs, TabsContent } from "@/components/ui/Tabs";
import { Textarea } from "@/components/ui/Textarea";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";

type ReturnRequest = {
  id: string;
  status: string;
  reason?: string;
  items?: unknown[];
  photos?: string[];
  labelId?: string;
  returnLabel?: string;
  createdAt: string;
  notes?: string;
  shipment?: { id: string; trackingNumber: string; carrierAccountId?: string };
  customer?: { firstName?: string | null; lastName?: string | null; email?: string | null };
};

type AnalyticsResponse = {
  periods: Array<{ period: string; total: number; byReason: Record<string, number>; byCarrier: Record<string, number> }>;
  totals: { total: number; byReason: Record<string, number>; byCarrier: Record<string, number> };
};

function customerName(item: ReturnRequest) {
  return [item.customer?.firstName, item.customer?.lastName].filter(Boolean).join(" ") || item.customer?.email || "Customer";
}

export function ReturnsListPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("PENDING");
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [filters, setFilters] = useState({ from: "2026-04-01", to: new Date().toISOString().slice(0, 10), groupBy: "week" });

  const returnsQuery = useQuery({
    queryKey: ["tenant-returns"],
    queryFn: async () => {
      const response = await api.get<{ data: ReturnRequest[] }>("/v1/tenant/returns");
      return response.data.data;
    },
    refetchInterval: 60_000
  });

  const analyticsQuery = useQuery({
    queryKey: ["returns-analytics", filters],
    queryFn: async () => {
      const response = await api.get<AnalyticsResponse>("/v1/tenant/returns/analytics", { params: filters });
      return response.data;
    }
  });

  const action = useMutation({
    mutationFn: async ({ id, type, reason }: { id: string; type: "approve" | "reject" | "receive"; reason?: string }) => {
      const suffix = type === "receive" ? "receive" : type;
      return api.post(`/v1/tenant/returns/${id}/${suffix}`, type === "reject" ? { reason } : {});
    },
    onSuccess: () => {
      setRejecting(null);
      setRejectReason("");
      queryClient.invalidateQueries({ queryKey: ["tenant-returns"] });
      queryClient.invalidateQueries({ queryKey: ["returns-analytics"] });
    }
  });

  const items = returnsQuery.data ?? [];
  const pending = items.filter((item) => item.status === "REQUESTED" || item.status === "PENDING");
  const approved = items.filter((item) => item.status === "APPROVED" || item.status === "LABEL_ISSUED");
  const rejected = items.filter((item) => item.status === "REJECTED");
  const chartData = analyticsQuery.data?.periods ?? [];
  const reasonRows = useMemo(() => Object.entries(analyticsQuery.data?.totals.byReason ?? {}), [analyticsQuery.data]);
  const carrierRows = useMemo(() => Object.entries(analyticsQuery.data?.totals.byCarrier ?? {}), [analyticsQuery.data]);

  function renderRows(rows: ReturnRequest[], mode: "pending" | "approved" | "rejected") {
    return (
      <Table columns={mode === "pending" ? ["Shipment", "Customer", "Reason", "Items", "Photos", "Requested", "Actions"] : ["Shipment", "Customer", "Reason", "Status", "Label", "Actions"]}>
        {rows.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="font-mono">{item.shipment?.trackingNumber ?? item.shipment?.id ?? item.id}</TableCell>
            <TableCell>{customerName(item)}</TableCell>
            <TableCell>{item.reason ?? "Unspecified"}</TableCell>
            {mode === "pending" ? (
              <>
                <TableCell>{item.items?.length ?? 0}</TableCell>
                <TableCell>{item.photos?.length ?? 0}</TableCell>
                <TableCell>{new Date(item.createdAt).toLocaleDateString()}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" loading={action.isPending} onClick={() => action.mutate({ id: item.id, type: "approve" })}>Approve</Button>
                    <Button size="sm" variant="danger" onClick={() => setRejecting(item.id)}>Reject</Button>
                  </div>
                </TableCell>
              </>
            ) : (
              <>
                <TableCell><Badge variant={mode === "rejected" ? "error" : "success"}>{item.status}</Badge></TableCell>
                <TableCell>{item.returnLabel ? <a className="text-[var(--tenant-primary)] underline" href={item.returnLabel}>Reverse label</a> : item.labelId ?? "None"}</TableCell>
                <TableCell>
                  {mode === "approved" ? <Button size="sm" variant="secondary" onClick={() => action.mutate({ id: item.id, type: "receive" })}>Mark as received</Button> : item.notes ?? "Read-only"}
                </TableCell>
              </>
            )}
          </TableRow>
        ))}
      </Table>
    );
  }

  return (
    <PageShell title="Returns" description="Approve, reject, receive, and analyse reverse logistics requests.">
      <div className="space-y-5">
        <Tabs value={tab} onValueChange={setTab} items={[
          { value: "PENDING", label: "Pending" },
          { value: "APPROVED", label: "Approved" },
          { value: "REJECTED", label: "Rejected" },
          { value: "ANALYTICS", label: "Analytics" }
        ]}>
          <TabsContent value="PENDING">{renderRows(pending, "pending")}</TabsContent>
          <TabsContent value="APPROVED">{renderRows(approved, "approved")}</TabsContent>
          <TabsContent value="REJECTED">{renderRows(rejected, "rejected")}</TabsContent>
          <TabsContent value="ANALYTICS">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-3">
                <Input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} />
                <Input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} />
                <Select value={filters.groupBy} onValueChange={(value) => setFilters((current) => ({ ...current, groupBy: value }))} options={[{ label: "Day", value: "day" }, { label: "Week", value: "week" }, { label: "Month", value: "month" }]} />
              </div>
              <div className="h-72 rounded-lg border border-gray-200 bg-white p-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <ChartTooltip />
                    <Bar dataKey="total" fill="var(--tenant-primary)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
                <Table columns={["Reason", "Count", "Percent"]}>
                  {reasonRows.map(([reason, count]) => (
                    <TableRow key={reason}><TableCell>{reason}</TableCell><TableCell>{count}</TableCell><TableCell>{analyticsQuery.data?.totals.total ? Math.round((count / analyticsQuery.data.totals.total) * 100) : 0}%</TableCell></TableRow>
                  ))}
                </Table>
                <Table columns={["Carrier", "Count"]}>
                  {carrierRows.map(([carrier, count]) => (
                    <TableRow key={carrier}><TableCell>{carrier}</TableCell><TableCell>{count}</TableCell></TableRow>
                  ))}
                </Table>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {rejecting ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <Textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} placeholder="Rejection reason" />
            <div className="mt-3 flex gap-2">
              <Button variant="danger" disabled={!rejectReason.trim()} onClick={() => action.mutate({ id: rejecting, type: "reject", reason: rejectReason })}>Confirm rejection</Button>
              <Button variant="secondary" onClick={() => setRejecting(null)}>Cancel</Button>
            </div>
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}
