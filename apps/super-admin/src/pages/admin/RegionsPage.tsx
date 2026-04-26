import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Clock3, Globe2, X } from "lucide-react";
import { useMemo, useState } from "react";

import { api } from "@/lib/api";

type RegionChangeStatus = "PENDING" | "APPROVED" | "REJECTED";

type RegionChangeRequest = {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  currentRegion: string;
  requestedRegion: string;
  requestedBy: string;
  status: RegionChangeStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
};

type RegionConfig = {
  key: string;
  label: string;
  paymentProviders: string[];
};

type RegionsResponse = {
  requests: RegionChangeRequest[];
  regions: RegionConfig[];
};

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "requests", label: "Region change requests" },
  { id: "payment", label: "Payment regions" },
  { id: "audit", label: "Audit" }
] as const;

type TabId = (typeof tabs)[number]["id"];

async function fetchRegions() {
  const response = await api.get<RegionsResponse>("/admin/region-change-requests");
  return response.data;
}

function formatRegion(region: string) {
  if (region === "northAmerica") return "North America";
  return region.charAt(0).toUpperCase() + region.slice(1);
}

function statusClass(status: RegionChangeStatus) {
  if (status === "APPROVED") return "border-green-200 bg-green-50 text-green-700";
  if (status === "REJECTED") return "border-red-200 bg-red-50 text-red-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function dateLabel(value?: string) {
  if (!value) return "n/a";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function RegionsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin-regions"], queryFn: fetchRegions });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "APPROVED" | "REJECTED" }) =>
      api.patch(`/admin/region-change-requests/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-regions"] })
  });

  const requests = query.data?.requests ?? [];
  const pendingRequests = requests.filter((request) => request.status === "PENDING");
  const reviewedRequests = requests.filter((request) => request.status !== "PENDING");

  const regionCounts = useMemo(() => {
    return requests.reduce<Record<string, number>>((counts, request) => {
      counts[request.requestedRegion] = (counts[request.requestedRegion] ?? 0) + 1;
      return counts;
    }, {});
  }, [requests]);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Region</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Review tenant region changes, payment-region coverage, and approval history.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-semibold text-[var(--color-text-primary)]">
          <Globe2 size={16} className="text-[var(--fauward-navy)]" />
          {pendingRequests.length} pending
        </div>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-white">
        <div className="flex flex-wrap gap-1 border-b border-[var(--color-border)] px-3 py-3">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition ${
                activeTab === tab.id
                  ? "bg-[var(--fauward-navy)] text-white"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-50)] hover:text-[var(--color-text-primary)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {query.isLoading ? (
            <div className="grid gap-3 md:grid-cols-3">
              {[0, 1, 2].map((item) => (
                <div key={item} className="h-28 animate-pulse rounded-lg bg-[var(--color-surface-50)]" />
              ))}
            </div>
          ) : null}

          {query.isError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Could not load region data.
            </div>
          ) : null}

          {!query.isLoading && !query.isError && activeTab === "overview" ? (
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border border-[var(--color-border)] p-4">
                <p className="text-sm text-[var(--color-text-muted)]">Pending tenant requests</p>
                <p className="mt-2 text-2xl font-bold text-[var(--color-text-primary)]">{pendingRequests.length}</p>
              </div>
              <div className="rounded-lg border border-[var(--color-border)] p-4">
                <p className="text-sm text-[var(--color-text-muted)]">Reviewed requests</p>
                <p className="mt-2 text-2xl font-bold text-[var(--color-text-primary)]">{reviewedRequests.length}</p>
              </div>
              <div className="rounded-lg border border-[var(--color-border)] p-4">
                <p className="text-sm text-[var(--color-text-muted)]">Configured regions</p>
                <p className="mt-2 text-2xl font-bold text-[var(--color-text-primary)]">{query.data?.regions.length ?? 0}</p>
              </div>
            </div>
          ) : null}

          {!query.isLoading && !query.isError && activeTab === "requests" ? (
            <div className="space-y-3">
              {requests.length === 0 ? (
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-50)] px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">
                  No tenant region change requests yet.
                </div>
              ) : null}

              {requests.map((request) => (
                <div key={request.id} className="rounded-lg border border-[var(--color-border)] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-[var(--color-text-primary)]">{request.tenantName}</p>
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass(request.status)}`}>
                          {request.status}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                        {formatRegion(request.currentRegion)} to {formatRegion(request.requestedRegion)}
                      </p>
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                        Requested by {request.requestedBy} on {dateLabel(request.createdAt)}
                      </p>
                      {request.reviewedAt ? (
                        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                          Reviewed by {request.reviewedBy ?? "Super admin"} on {dateLabel(request.reviewedAt)}
                        </p>
                      ) : null}
                    </div>

                    {request.status === "PENDING" ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={updateStatus.isPending}
                          onClick={() => updateStatus.mutate({ id: request.id, status: "APPROVED" })}
                          className="inline-flex items-center gap-1.5 rounded-md bg-green-600 px-3 py-2 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          <Check size={14} />
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={updateStatus.isPending}
                          onClick={() => updateStatus.mutate({ id: request.id, status: "REJECTED" })}
                          className="inline-flex items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                        >
                          <X size={14} />
                          Reject
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {!query.isLoading && !query.isError && activeTab === "payment" ? (
            <div className="grid gap-3 md:grid-cols-2">
              {(query.data?.regions ?? []).map((region) => (
                <div key={region.key} className="rounded-lg border border-[var(--color-border)] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-semibold text-[var(--color-text-primary)]">{region.label}</h2>
                    <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-50)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]">
                      {regionCounts[region.key] ?? 0} request{regionCounts[region.key] === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {region.paymentProviders.map((provider) => (
                      <span key={provider} className="rounded-md bg-[var(--color-surface-50)] px-2.5 py-1 text-xs font-medium text-[var(--color-text-primary)]">
                        {provider}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {!query.isLoading && !query.isError && activeTab === "audit" ? (
            <div className="space-y-3">
              {requests.length === 0 ? (
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-50)] px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">
                  No region activity has been recorded.
                </div>
              ) : null}
              {requests.map((request) => (
                <div key={request.id} className="flex gap-3 rounded-lg border border-[var(--color-border)] p-4">
                  <Clock3 size={16} className="mt-0.5 shrink-0 text-[var(--color-text-muted)]" />
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                      {request.tenantName} requested {formatRegion(request.requestedRegion)}
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                      Status: {request.status} - Created: {dateLabel(request.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
