import { hasPermission, usePermission } from "@fauward/internal-rbac";
import { DenseTable, EmptyState } from "@fauward/internal-ui";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { fetchBadge } from "@/lib/badges";
import type { PlatformPermissionContext } from "@/lib/platform-session";
import type { PillarManifest, PillarServiceManifest } from "@/pillars/_manifests";

type PillarOverviewBaseProps = {
  manifest: PillarManifest;
};

function StatusCell({ service }: { service: PillarServiceManifest }) {
  const query = useQuery({
    queryKey: ["pillar-overview-status", service.id, service.badgeKey ?? "placeholder"],
    queryFn: () => fetchBadge(service.badgeKey),
    staleTime: 30_000
  });

  const tone = query.data?.tone ?? "neutral";
  const className =
    tone === "green"
      ? "border-green-200 bg-green-50 text-green-700"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : tone === "red"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-[var(--color-border)] bg-[var(--color-surface-50)] text-[var(--color-text-muted)]";

  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${className}`}>
      {query.isLoading ? "..." : query.isError ? "-" : query.data?.label ?? "-"}
    </span>
  );
}

export function PillarOverviewBase({ manifest }: PillarOverviewBaseProps) {
  const navigate = useNavigate();
  const permissionContext = usePermission() as PlatformPermissionContext;
  const rows = manifest.services.filter((service) => hasPermission(permissionContext.permissions, service.requiredPermission));

  return (
    <div className="space-y-5">
      <header className="rounded-lg border border-[var(--color-border)] bg-white p-5">
        <div className="h-1 w-24 rounded-full" style={{ backgroundColor: manifest.accent }} />
        <div className="mt-4 flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md" style={{ backgroundColor: `${manifest.accent}14`, color: manifest.accent }}>
            <manifest.icon size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{manifest.name}</h1>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{manifest.description}</p>
          </div>
        </div>
      </header>

      <DenseTable<PillarServiceManifest>
        data={rows}
        getRowId={(row) => row.id}
        onRowClick={(row) => navigate(row.route)}
        emptyState={<EmptyState title="No accessible services" message="Your current role has no services in this pillar." />}
        columns={[
          {
            id: "service",
            header: "Service",
            sortable: true,
            cell: (row) => (
              <div className="flex min-w-0 items-center gap-2">
                <row.icon size={16} className="shrink-0" style={{ color: manifest.accent }} />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-[var(--color-text-primary)]">{row.name}</p>
                  <p className="truncate text-xs text-[var(--color-text-muted)]">{row.description}</p>
                </div>
              </div>
            )
          },
          {
            id: "lastActivity",
            header: "Last activity",
            cell: () => {
              // TODO: Replace with per-service activity endpoints as services are implemented.
              return <span className="text-[var(--color-text-muted)]">-</span>;
            }
          },
          {
            id: "status",
            header: "Status",
            cell: (row) => <StatusCell service={row} />
          },
          {
            id: "owner",
            header: "Owner team",
            sortable: true,
            cell: (row) => row.owner
          }
        ]}
      />
    </div>
  );
}
