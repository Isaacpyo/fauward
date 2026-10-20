import { useState } from "react";
import { Globe2 } from "lucide-react";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { type RegionRequest, useDecideRegionRequest, useRegionRequests } from "./api";

const FILTERS = [
  { id: "PENDING", label: "Pending" },
  { id: "APPLIED", label: "Applied" },
  { id: "REJECTED", label: "Rejected" },
  { id: "", label: "All" }
] as const;

const statusClass: Record<RegionRequest["status"], string> = {
  PENDING: "border-amber-200 bg-amber-50 text-amber-700",
  APPROVED: "border-green-200 bg-green-50 text-green-700",
  APPLIED: "border-green-200 bg-green-50 text-green-700",
  REJECTED: "border-red-200 bg-red-50 text-red-700",
  CANCELLED: "border-[var(--color-border)] bg-[var(--color-surface-50)] text-[var(--color-text-muted)]"
};

function dateLabel(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";
}

/** Tenant region change requests (L5, WP-2.6): approving applies the region to the tenant at once and tells its admins. */
export function RegionRequestsPage() {
  const [filter, setFilter] = useState<string>("PENDING");
  const query = useRegionRequests(filter || undefined);
  const decide = useDecideRegionRequest();
  const [decision, setDecision] = useState<{ request: RegionRequest; status: "APPROVED" | "REJECTED" } | null>(null);
  const regions = query.data?.regions ?? [];
  const label = (key: string) => regions.find((region) => region.key === key)?.label ?? key;
  const requests = query.data?.requests ?? [];

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Region change requests</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Approving moves the tenant to the requested region immediately; payment options follow the region.</p>
        </div>
        {filter === "PENDING" && query.data ? (
          <span className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-sm font-semibold">
            <Globe2 size={16} className="text-[var(--fauward-navy)]" />
            {requests.length} pending
          </span>
        ) : null}
      </header>

      <nav aria-label="Request status" className="flex flex-wrap gap-1">
        {FILTERS.map((item) => (
          <button
            key={item.id || "all"}
            type="button"
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
            className={`rounded-md border px-3 py-1.5 text-sm ${filter === item.id ? "border-[var(--fauward-navy)] bg-[var(--fauward-navy)] text-white" : "border-[var(--color-border)] bg-white"}`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {query.isError ? <ConsoleApiErrorPanel error={query.error} onRetry={() => void query.refetch()} title="Unable to load region requests" /> : null}
      {!query.isError ? (
        <ul className="space-y-3">
          {requests.map((request) => (
            <li key={request.id} data-testid="region-request" className="rounded-lg border border-[var(--color-border)] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {request.tenant ? <TenantChip tenantId={request.tenant.id} name={request.tenant.name} slug={request.tenant.slug} /> : <span className="font-mono text-xs">{request.tenantId}</span>}
                    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusClass[request.status]}`}>{request.status.toLowerCase()}</span>
                  </div>
                  <p className="text-sm">
                    {label(request.currentRegion)} → <span className="font-semibold">{label(request.requestedRegion)}</span>
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">Requested {dateLabel(request.createdAt)}</p>
                  {request.decidedAt ? (
                    <p className="text-xs text-[var(--color-text-muted)]">
                      Decided {dateLabel(request.decidedAt)}
                      {request.decisionReason ? `: ${request.decisionReason}` : ""}
                    </p>
                  ) : null}
                </div>
                {request.status === "PENDING" ? (
                  <div className="flex gap-2">
                    <PermissionButton permission="platform.tenants.write" onClick={() => setDecision({ request, status: "APPROVED" })} className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                      Approve
                    </PermissionButton>
                    <PermissionButton permission="platform.tenants.write" onClick={() => setDecision({ request, status: "REJECTED" })} className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50">
                      Reject
                    </PermissionButton>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
          {!query.isLoading && requests.length === 0 ? <li className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">No region change requests here.</li> : null}
        </ul>
      ) : null}

      {regions.length > 0 ? (
        <section className="rounded-lg border border-[var(--color-border)] bg-white p-4">
          <h2 className="text-sm font-semibold">Payment options by region</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {regions.map((region) => (
              <div key={region.key} className="rounded-md border border-[var(--color-border)] p-3 text-sm">
                <p className="font-semibold">{region.label}</p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">{region.paymentProviders.join(" · ")}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <ActionDialog
        open={decision !== null}
        title={decision ? `${decision.status === "APPROVED" ? "Approve" : "Reject"} the move to ${label(decision.request.requestedRegion)} for ${decision.request.tenant?.name ?? decision.request.tenantId}?` : ""}
        description={decision?.status === "APPROVED" ? "The tenant's region changes as soon as you confirm, and its admins are told." : "The tenant's admins see your reason."}
        confirmLabel={decision?.status === "APPROVED" ? "Approve and apply" : "Reject change"}
        dangerous
        onClose={() => setDecision(null)}
        onSubmit={async (reason) => decide.mutateAsync({ id: decision!.request.id, status: decision!.status, reason })}
      />
    </div>
  );
}
