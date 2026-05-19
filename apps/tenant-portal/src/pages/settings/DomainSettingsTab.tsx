import { ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";

import type { DomainStatusResponse } from "@/api/domain";
import { useDomainStatus, useRemoveDomain } from "@/api/domain";
import { Button } from "@/components/ui/Button";
import { PageSpinner } from "@/components/ui/Spinner";
import { formatDateTime } from "@/lib/utils";
import { useTenantStore } from "@/stores/useTenantStore";
import { DnsInstructionsCard } from "./components/DnsInstructionsCard";
import { DomainEmptyState } from "./components/DomainEmptyState";
import { DomainStatusBadge } from "./components/DomainStatusBadge";
import { RemoveDomainDialog } from "./components/RemoveDomainDialog";

export function DomainSettingsTab() {
  const statusQuery = useDomainStatus();

  if (statusQuery.isLoading) {
    return <PageSpinner />;
  }

  if (statusQuery.isError || !statusQuery.data) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        Unable to load custom domain status.
      </div>
    );
  }

  const data = statusQuery.data;

  switch (data.status) {
    case "NONE":
      return <DomainEmptyState />;
    case "PENDING_DNS":
      return (
        <DnsInstructionsCard
          data={data}
          stage="dns"
          onRefresh={() => void statusQuery.refetch()}
          isRefreshing={statusQuery.isFetching}
        />
      );
    case "VERIFYING":
      return (
        <DnsInstructionsCard
          data={data}
          stage="ssl"
          onRefresh={() => void statusQuery.refetch()}
          isRefreshing={statusQuery.isFetching}
        />
      );
    case "ACTIVE":
      return <ActiveDomainPanel data={data} />;
    case "FAILED":
      return (
        <FailedDomainPanel
          data={data}
          onRetry={() => void statusQuery.refetch()}
          isRetrying={statusQuery.isFetching}
        />
      );
  }
}

function ActiveDomainPanel({ data }: { data: DomainStatusResponse }) {
  const tenant = useTenantStore((state) => state.tenant);
  const removeDomain = useRemoveDomain();
  const [removeOpen, setRemoveOpen] = useState(false);
  const domain = data.domain ?? "";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{domain}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
              This domain is verified and live for customer-facing portal and tracking traffic.
            </p>
            {data.verifiedAt ? (
              <p className="mt-2 text-xs text-gray-500">Verified {formatDateTime(data.verifiedAt, tenant)}</p>
            ) : null}
          </div>
          <DomainStatusBadge status="ACTIVE" />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <a href={`https://${domain}`} target="_blank" rel="noreferrer">
              <ExternalLink size={16} />
              Open domain
            </a>
          </Button>
          <Button type="button" variant="danger" onClick={() => setRemoveOpen(true)} leftIcon={<Trash2 size={16} />}>
            Remove domain
          </Button>
        </div>
      </div>

      <RemoveDomainDialog
        open={removeOpen}
        domain={domain}
        isRemoving={removeDomain.isPending}
        onOpenChange={setRemoveOpen}
        onConfirm={() =>
          removeDomain.mutate(undefined, {
            onSuccess: () => setRemoveOpen(false)
          })
        }
      />
    </div>
  );
}

function FailedDomainPanel({
  data,
  onRetry,
  isRetrying
}: {
  data: DomainStatusResponse;
  onRetry: () => void;
  isRetrying: boolean;
}) {
  const removeDomain = useRemoveDomain();
  const [removeOpen, setRemoveOpen] = useState(false);
  const domain = data.domain ?? "";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-red-200 bg-red-50 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-red-950">{domain}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-red-800">
              {data.error ?? "Fauward could not verify this domain. Retry the check or remove the domain."}
            </p>
          </div>
          <DomainStatusBadge status="FAILED" />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={onRetry} disabled={isRetrying} leftIcon={<RefreshCw size={16} />}>
            {isRetrying ? "Checking..." : "Retry"}
          </Button>
          <Button type="button" variant="danger" onClick={() => setRemoveOpen(true)} leftIcon={<Trash2 size={16} />}>
            Remove domain
          </Button>
        </div>
      </div>

      <RemoveDomainDialog
        open={removeOpen}
        domain={domain}
        isRemoving={removeDomain.isPending}
        onOpenChange={setRemoveOpen}
        onConfirm={() =>
          removeDomain.mutate(undefined, {
            onSuccess: () => setRemoveOpen(false)
          })
        }
      />
    </div>
  );
}
