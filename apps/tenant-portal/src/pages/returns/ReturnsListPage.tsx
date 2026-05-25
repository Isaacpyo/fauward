import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as ChartTooltip, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
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
  shipment?: { id: string; trackingNumber: string; originAddress?: string; destinationAddress?: string; carrierAccountId?: string };
  customer?: { firstName?: string | null; lastName?: string | null; email?: string | null };
  // Payment fields
  returnFee?: number | null;
  feeCurrency?: string | null;
  paymentStatus?: string | null;
  feeEmailSentAt?: string | null;
  feePaidAt?: string | null;
  returnPickupShipmentId?: string | null;
};

type AnalyticsResponse = {
  periods: Array<{ period: string; total: number; byReason: Record<string, number>; byCarrier: Record<string, number> }>;
  totals: { total: number; byReason: Record<string, number>; byCarrier: Record<string, number> };
};

function customerName(item: ReturnRequest) {
  return [item.customer?.firstName, item.customer?.lastName].filter(Boolean).join(" ") || item.customer?.email || "Customer";
}

const RETURN_STAGE_ORDER = ["LABEL_ISSUED", "PICKED_UP", "IN_HUB", "RECEIVED", "RESOLVED"] as const;

function ReturnDetailBody({
  item,
  feeInput,
  setFeeInput,
  declineReason,
  setDeclineReason,
  onApproveAndSendFee,
  onSendFee,
  onDecline,
  onWaive,
  sendFeeLoading,
  declineLoading,
}: {
  item: ReturnRequest;
  feeInput: string;
  setFeeInput: (v: string) => void;
  declineReason: string;
  setDeclineReason: (v: string) => void;
  onApproveAndSendFee: () => void;
  onSendFee: () => void;
  onDecline: () => void;
  onWaive: () => void;
  sendFeeLoading: boolean;
  declineLoading: boolean;
}) {
  const isRequested = item.status === "REQUESTED" || item.status === "PENDING";
  const isApproved = item.status === "APPROVED";
  const isRejected = item.status === "REJECTED";
  const isLabelIssuedOrLater = RETURN_STAGE_ORDER.includes(item.status as typeof RETURN_STAGE_ORDER[number]);
  const paymentStatus = item.paymentStatus ?? "NONE";

  return (
    <div className="space-y-5">
      {/* Header info */}
      <div className="space-y-2">
        {item.shipment && (
          <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">From</p>
              <p className="mt-0.5 truncate text-sm text-gray-700">{(item.shipment as { originAddress?: string }).originAddress ?? "—"}</p>
            </div>
            <svg className="shrink-0 text-gray-300" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">To</p>
              <p className="mt-0.5 truncate text-sm font-medium text-gray-900">{(item.shipment as { destinationAddress?: string }).destinationAddress ?? "—"}</p>
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
          <span><span className="font-medium text-gray-900">Customer:</span> {customerName(item)}</span>
          {item.customer?.email && <span className="text-gray-400">{item.customer.email}</span>}
        </div>
        {item.reason && <p className="text-sm text-gray-600"><span className="font-medium text-gray-900">Reason:</span> {item.reason}</p>}
        {item.photos && item.photos.length > 0 && (
          <div className="grid grid-cols-4 gap-1.5">
            {item.photos.map((src, i) => (
              <img key={i} src={src} alt={`Photo ${i + 1}`} className="h-16 w-full rounded-lg object-cover" />
            ))}
          </div>
        )}
      </div>

      {/* REQUESTED — approve with fee + decline */}
      {isRequested && (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-700">Return fee (£)</label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={feeInput}
              onChange={(e) => setFeeInput(e.target.value)}
              placeholder="e.g. 15.00"
              className="max-w-[180px]"
            />
          </div>
          <Button
            className="w-full"
            disabled={!feeInput || Number(feeInput) <= 0}
            loading={sendFeeLoading}
            onClick={onApproveAndSendFee}
          >
            Approve &amp; send fee invoice
          </Button>
          <div className="border-t border-gray-100 pt-4 space-y-2">
            <label className="block text-xs font-medium text-gray-700">Decline reason</label>
            <Textarea value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} placeholder="Optional — explain why the return is being declined" rows={2} />
            <Button variant="danger" className="w-full" disabled={declineLoading} loading={declineLoading} onClick={onDecline}>
              Decline return
            </Button>
          </div>
        </div>
      )}

      {/* APPROVED + no invoice sent yet */}
      {isApproved && paymentStatus === "NONE" && (
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Return fee: <span className="font-semibold text-gray-900">{item.returnFee != null ? `${item.feeCurrency ?? "GBP"} ${Number(item.returnFee).toFixed(2)}` : "Not set"}</span>
          </p>
          {item.returnFee != null ? (
            <Button className="w-full" loading={sendFeeLoading} onClick={onSendFee}>
              Send fee invoice email
            </Button>
          ) : (
            <div className="space-y-2">
              <Input type="number" min="0" step="0.01" value={feeInput} onChange={(e) => setFeeInput(e.target.value)} placeholder="Enter fee amount" className="max-w-[180px]" />
              <Button className="w-full" disabled={!feeInput || Number(feeInput) <= 0} loading={sendFeeLoading} onClick={onSendFee}>
                Send fee invoice email
              </Button>
            </div>
          )}
        </div>
      )}

      {/* APPROVED + invoice sent */}
      {isApproved && paymentStatus === "INVOICE_SENT" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Fee invoice sent {item.feeEmailSentAt ? new Date(item.feeEmailSentAt).toLocaleDateString() : ""}.
            Awaiting customer payment.
          </div>
          <Button variant="secondary" className="w-full" loading={sendFeeLoading} onClick={onSendFee}>
            Resend invoice email
          </Button>
          <Button variant="ghost" className="w-full" onClick={onWaive}>
            Waive payment
          </Button>
        </div>
      )}

      {/* APPROVED + paid */}
      {isApproved && paymentStatus === "PAID" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Payment confirmed {item.feePaidAt ? new Date(item.feePaidAt).toLocaleDateString() : ""}.
          </div>
          {item.returnPickupShipmentId && (
            <Button asChild variant="secondary" className="w-full">
              <Link to={`/shipments/${item.returnPickupShipmentId}`}>View reverse shipment →</Link>
            </Button>
          )}
        </div>
      )}

      {/* APPROVED + waived */}
      {isApproved && paymentStatus === "WAIVED" && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
          Payment waived. Return pickup can be dispatched.
        </div>
      )}

      {/* LABEL_ISSUED and beyond — stage timeline */}
      {isLabelIssuedOrLater && (
        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Return progress</p>
          <div className="flex items-center gap-1">
            {RETURN_STAGE_ORDER.map((stage, i) => {
              const stageIdx = RETURN_STAGE_ORDER.indexOf(item.status as typeof RETURN_STAGE_ORDER[number]);
              const done = i <= stageIdx;
              return (
                <div key={stage} className="flex items-center gap-1">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ${done ? "bg-emerald-500 text-white" : "border border-gray-200 text-gray-300"}`}>
                    {done ? "✓" : i + 1}
                  </div>
                  <span className={`text-[10px] font-medium ${done ? "text-emerald-700" : "text-gray-400"}`}>{stage.replace(/_/g, " ")}</span>
                  {i < RETURN_STAGE_ORDER.length - 1 && <div className="h-px w-3 bg-gray-200" />}
                </div>
              );
            })}
          </div>
          {item.returnPickupShipmentId && (
            <Button asChild variant="secondary" size="sm" className="mt-2">
              <Link to={`/shipments/${item.returnPickupShipmentId}`}>View reverse shipment →</Link>
            </Button>
          )}
        </div>
      )}

      {/* REJECTED */}
      {isRejected && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="font-semibold">Declined</span>
          {item.notes && <p className="mt-1">{item.notes}</p>}
        </div>
      )}
    </div>
  );
}

export function ReturnsListPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("PENDING");
  const [filters, setFilters] = useState({ from: "2026-04-01", to: new Date().toISOString().slice(0, 10), groupBy: "week" });

  // Detail dialog state
  const [selected, setSelected] = useState<ReturnRequest | null>(null);
  const [feeInput, setFeeInput] = useState("");
  const [declineReason, setDeclineReason] = useState("");

  const closeDialog = () => {
    setSelected(null);
    setFeeInput("");
    setDeclineReason("");
  };

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

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["tenant-returns"] });
    queryClient.invalidateQueries({ queryKey: ["returns-analytics"] });
  };

  const action = useMutation({
    mutationFn: async ({ id, type, reason }: { id: string; type: "approve" | "reject" | "receive"; reason?: string }) => {
      const suffix = type === "receive" ? "receive" : type;
      return api.post(`/v1/tenant/returns/${id}/${suffix}`, type === "reject" ? { reason } : {});
    },
    onSuccess: () => {
      closeDialog();
      invalidate();
    }
  });

  const sendFee = useMutation({
    mutationFn: ({ id, fee }: { id: string; fee: number }) =>
      api.post(`/v1/tenant/returns/${id}/send-fee`, { fee }),
    onSuccess: () => {
      closeDialog();
      invalidate();
    }
  });

  const waive = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      api.patch(`/v1/returns/${id}/status`, { status: "LABEL_ISSUED" }),
    onSuccess: () => {
      closeDialog();
      invalidate();
    }
  });

  const returnedShipmentsQuery = useQuery({
    queryKey: ["returned-shipments"],
    queryFn: async () => {
      const response = await api.get<{ data: Array<{ id: string; trackingNumber: string; deliveryAddress: string; updatedAt: string }> }>(
        "/v1/shipments",
        { params: { status: "RETURNED", limit: 100 } },
      );
      return response.data.data ?? [];
    },
    refetchInterval: 60_000,
  });

  const items = returnsQuery.data ?? [];
  const pending = items.filter((item) => item.status === "REQUESTED" || item.status === "PENDING");
  const approved = items.filter((item) => item.status === "APPROVED" || item.status === "LABEL_ISSUED");
  const rejected = items.filter((item) => item.status === "REJECTED");
  const returnedShipments = returnedShipmentsQuery.data ?? [];
  const chartData = analyticsQuery.data?.periods ?? [];
  const reasonRows = useMemo(() => Object.entries(analyticsQuery.data?.totals.byReason ?? {}), [analyticsQuery.data]);
  const carrierRows = useMemo(() => Object.entries(analyticsQuery.data?.totals.byCarrier ?? {}), [analyticsQuery.data]);

  function renderRows(rows: ReturnRequest[]) {
    return (
      <Table columns={["Shipment", "Customer", "Reason", "Status", "Requested"]}>
        {rows.map((item) => (
          <TableRow
            key={item.id}
            onClick={() => { setSelected(item); setFeeInput(""); setDeclineReason(""); }}
          >
            <TableCell className="font-mono">{item.shipment?.trackingNumber ?? item.shipment?.id ?? item.id}</TableCell>
            <TableCell>{customerName(item)}</TableCell>
            <TableCell>{item.reason ?? "Unspecified"}</TableCell>
            <TableCell>
              <Badge variant={item.status === "REJECTED" ? "error" : item.status === "APPROVED" || item.status === "LABEL_ISSUED" ? "success" : "default"}>
                {item.status}
              </Badge>
            </TableCell>
            <TableCell>{new Date(item.createdAt).toLocaleDateString()}</TableCell>
          </TableRow>
        ))}
        {rows.length === 0 && (
          <TableRow><TableCell colSpan={5} className="text-center text-sm text-gray-500 py-8">No returns.</TableCell></TableRow>
        )}
      </Table>
    );
  }

  return (
    <PageShell title="Returns" description="Approve, reject, receive, and analyse reverse logistics requests.">
      <div className="space-y-5">
        <Tabs value={tab} onValueChange={setTab} items={[
          { value: "PENDING", label: `Pending${pending.length ? ` (${pending.length})` : ""}` },
          { value: "APPROVED", label: "Approved" },
          { value: "REJECTED", label: "Rejected" },
          { value: "RECEIVED", label: `Received${returnedShipments.length ? ` (${returnedShipments.length})` : ""}` },
          { value: "ANALYTICS", label: "Analytics" }
        ]}>
          <TabsContent value="PENDING">{renderRows(pending)}</TabsContent>
          <TabsContent value="APPROVED">{renderRows(approved)}</TabsContent>
          <TabsContent value="REJECTED">{renderRows(rejected)}</TabsContent>
          <TabsContent value="RECEIVED">
            <Table columns={["Tracking", "Delivery Address", "Returned At"]}>
              {returnedShipments.length === 0 ? (
                <TableRow><TableCell colSpan={3} className="text-center text-sm text-gray-500">No returned shipments.</TableCell></TableRow>
              ) : (
                returnedShipments.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono">{s.trackingNumber ?? s.id}</TableCell>
                    <TableCell>{s.deliveryAddress ?? "—"}</TableCell>
                    <TableCell>{s.updatedAt ? new Date(s.updatedAt).toLocaleDateString() : "—"}</TableCell>
                  </TableRow>
                ))
              )}
            </Table>
          </TabsContent>
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
      </div>

      {selected && (
        <Dialog
          open
          onOpenChange={(open) => { if (!open) closeDialog(); }}
          title="Return request"
          description={selected.shipment?.trackingNumber ?? selected.id}
        >
          <ReturnDetailBody
            item={selected}
            feeInput={feeInput}
            setFeeInput={setFeeInput}
            declineReason={declineReason}
            setDeclineReason={setDeclineReason}
            onApproveAndSendFee={() => {
              sendFee.mutate({ id: selected.id, fee: Number(feeInput) });
            }}
            onSendFee={() => {
              const fee = selected.returnFee != null ? Number(selected.returnFee) : Number(feeInput);
              sendFee.mutate({ id: selected.id, fee });
            }}
            onDecline={() => {
              action.mutate({ id: selected.id, type: "reject", reason: declineReason || undefined });
            }}
            onWaive={() => {
              waive.mutate({ id: selected.id });
            }}
            sendFeeLoading={sendFee.isPending}
            declineLoading={action.isPending}
          />
        </Dialog>
      )}
    </PageShell>
  );
}
