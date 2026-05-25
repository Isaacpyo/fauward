import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/shared/EmptyState";
import { PageShell } from "@/layouts/PageShell";
import { api } from "@/lib/api";

type PermissionRequest = {
  id: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | "EXPIRED";
  note: string | null;
  requestedAction: string;
  createdAt: string;
  respondedAt: string | null;
  shipment: {
    id: string;
    trackingNumber: string;
    status: string;
    recipientName: string | null;
    currentDriver: { id: string; name: string } | null;
  };
  requester: {
    id: string;
    name: string;
    role: string | null;
  };
};

const formatDateTime = (value: string | null) => {
  if (!value) return "—";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
};

const formatElapsed = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 0) return "just now";
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

export function PermissionRequestsPage() {
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const focusId = searchParams.get("focus");
  const focusRef = useRef<HTMLElement | null>(null);

  const requestsQuery = useQuery({
    queryKey: ["permission-requests", "PENDING"],
    queryFn: async () => {
      const res = await api.get<{ requests: PermissionRequest[] }>("/v1/permission-requests", {
        params: { status: "PENDING" },
      });
      return res.data.requests ?? [];
    },
    refetchInterval: 30_000,
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/v1/permission-requests/${id}/approve`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["permission-requests"] }),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      await api.post(`/v1/permission-requests/${id}/reject`, reason ? { reason } : {});
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["permission-requests"] }),
  });

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    if (focusId && focusRef.current) {
      focusRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [focusId, requestsQuery.data]);

  const handleApprove = (id: string) => {
    approveMutation.mutate(id);
  };

  const handleRejectStart = (id: string) => {
    setRejectingId(id);
    setRejectReason("");
  };

  const handleRejectConfirm = () => {
    if (!rejectingId) return;
    rejectMutation.mutate(
      { id: rejectingId, reason: rejectReason.trim() || undefined },
      {
        onSettled: () => {
          setRejectingId(null);
          setRejectReason("");
        },
      },
    );
  };

  const requests = requestsQuery.data ?? [];

  return (
    <PageShell
      title="Permission requests"
      description="Field operators have asked to handle these shipments. Approve to reassign them to the requester, or reject."
      state={requestsQuery.isLoading ? "loading" : "ready"}
      onRetry={() => void requestsQuery.refetch()}
    >
      {requests.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No pending permission requests"
          description="When a field operator scans a shipment they aren't assigned to and requests permission, it will appear here."
        />
      ) : (
        <div className="space-y-3">
          {requests.map((request) => {
            const isFocused = focusId === request.id;
            return (
              <article
                key={request.id}
                ref={isFocused ? focusRef : undefined}
                className={`rounded-xl border bg-white p-5 shadow-sm ${
                  isFocused ? "border-[var(--tenant-primary)] ring-2 ring-[var(--tenant-primary-light)]" : "border-gray-200"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                      {request.requester.name}
                      {request.requester.role ? ` · ${request.requester.role.replace(/_/g, " ")}` : ""}
                    </p>
                    <h3 className="text-lg font-semibold text-gray-900">{request.shipment.trackingNumber}</h3>
                    <p className="text-sm text-gray-600">
                      Wants to take over from{" "}
                      <span className="font-medium">{request.shipment.currentDriver?.name ?? "Unassigned"}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant="neutral">{request.shipment.status.replace(/_/g, " ")}</Badge>
                    <p className="mt-1 text-xs text-gray-400">{formatElapsed(request.createdAt)}</p>
                  </div>
                </div>

                {request.shipment.recipientName ? (
                  <p className="mt-3 text-sm text-gray-600">
                    Recipient: <span className="font-medium text-gray-900">{request.shipment.recipientName}</span>
                  </p>
                ) : null}

                {request.note ? (
                  <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                    <span className="font-semibold">Note:</span> {request.note}
                  </p>
                ) : null}

                {rejectingId === request.id ? (
                  <div className="mt-4 space-y-2">
                    <textarea
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="Optional reason for the requester"
                      rows={2}
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setRejectingId(null);
                          setRejectReason("");
                        }}
                        disabled={rejectMutation.isPending}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={handleRejectConfirm}
                        disabled={rejectMutation.isPending}
                      >
                        {rejectMutation.isPending ? "Rejecting…" : "Confirm reject"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleApprove(request.id)}
                      disabled={approveMutation.isPending || rejectMutation.isPending}
                    >
                      {approveMutation.isPending && approveMutation.variables === request.id
                        ? "Approving…"
                        : "Approve & reassign"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleRejectStart(request.id)}
                      disabled={approveMutation.isPending || rejectMutation.isPending}
                    >
                      Reject
                    </Button>
                  </div>
                )}

                <p className="mt-3 text-xs text-gray-400">Requested {formatDateTime(request.createdAt)}</p>
              </article>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
