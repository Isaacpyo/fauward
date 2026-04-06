import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";

type ReturnDetail = {
  id: string;
  status: string;
  reason: string;
  notes?: string | null;
  returnLabel?: string | null;
  createdAt: string;
  approvedAt?: string | null;
  receivedAt?: string | null;
  refundedAt?: string | null;
  shipment: {
    id: string;
    trackingNumber: string;
    status: string;
  };
};

async function fetchReturn(id: string) {
  const response = await api.get<ReturnDetail>(`/v1/returns/${id}`);
  return response.data;
}

export function ReturnDetailPage() {
  const { id = "" } = useParams();
  const [rejectReason, setRejectReason] = useState("");
  const [nextStatus, setNextStatus] = useState("");
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["return-detail", id],
    queryFn: () => fetchReturn(id)
  });

  const actionMutation = useMutation({
    mutationFn: async (input: { action: "approve" | "reject" | "status" | "refund"; payload?: Record<string, unknown> }) => {
      if (input.action === "approve") return api.patch(`/v1/returns/${id}/approve`);
      if (input.action === "reject") return api.patch(`/v1/returns/${id}/reject`, input.payload);
      if (input.action === "status") return api.patch(`/v1/returns/${id}/status`, input.payload);
      return api.post(`/v1/returns/${id}/refund`, input.payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["return-detail", id] });
    }
  });

  const item = query.data;

  return (
    <PageShell title={`Return ${id}`} description="Return request details, status updates, and refund controls.">
      {item ? (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-500">Shipment</p>
            <p className="font-mono text-lg font-semibold text-gray-900">{item.shipment.trackingNumber}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="neutral">{item.status}</Badge>
              <Badge variant="warning">{item.reason}</Badge>
            </div>
            {item.notes ? <p className="mt-3 text-sm text-gray-700">{item.notes}</p> : null}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900">Actions</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => actionMutation.mutate({ action: "approve" })}>Approve</Button>
              <Button
                variant="secondary"
                onClick={() => actionMutation.mutate({ action: "reject", payload: { reason: rejectReason || "Rejected by staff" } })}
              >
                Reject
              </Button>
              <Button variant="secondary" onClick={() => actionMutation.mutate({ action: "refund" })}>
                Mark refunded
              </Button>
            </div>
            <Input
              className="mt-3"
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder="Rejection reason"
            />
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h3 className="text-sm font-semibold text-gray-900">Advance status</h3>
            <div className="mt-3 flex gap-2">
              <Select
                value={nextStatus}
                onValueChange={setNextStatus}
                options={[
                  { label: "LABEL_ISSUED", value: "LABEL_ISSUED" },
                  { label: "PICKED_UP", value: "PICKED_UP" },
                  { label: "IN_HUB", value: "IN_HUB" },
                  { label: "RECEIVED", value: "RECEIVED" },
                  { label: "RESOLVED", value: "RESOLVED" }
                ]}
                className="w-[220px]"
              />
              <Button
                variant="secondary"
                disabled={!nextStatus}
                onClick={() => actionMutation.mutate({ action: "status", payload: { status: nextStatus } })}
              >
                Update
              </Button>
            </div>
          </div>

          {item.returnLabel ? (
            <a className="text-sm font-medium text-[var(--tenant-primary)] hover:underline" href={item.returnLabel} target="_blank" rel="noreferrer">
              Download return label
            </a>
          ) : null}
        </div>
      ) : null}
    </PageShell>
  );
}

