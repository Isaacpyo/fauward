import { hasPermission, usePermission } from "@fauward/internal-rbac";
import { DenseTable, EmptyState } from "@fauward/internal-ui";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { useActivitySummary } from "@/lib/overview";
import type { PlatformPermissionContext } from "@/lib/platform-session";
import { StatusPill } from "@/components/service-kit/StatusPill";
import { navigableServices, type PillarManifest, type PillarServiceManifest } from "@/pillars/_manifests";
import { ServiceBadge } from "@/shell/ServiceBadge";

type PillarOverviewBaseProps = {
  manifest: PillarManifest;
  beforeGrid?: ReactNode;
};

/** Latest activity the caller can see for the service (GET /activity/summary, WP-3.5). */
function LastActivity({ serviceKey }: { serviceKey: string }) {
  const summary = useActivitySummary();
  if (summary.isLoading) return <span className="text-xs text-[var(--color-text-muted)]">Loading…</span>;
  if (summary.isError) return <span className="text-xs text-[var(--color-text-muted)]">Unavailable</span>;
  const entry = summary.data?.services?.find((item) => item.service === serviceKey);
  if (!entry?.lastOccurredAt) return <span className="text-xs text-[var(--color-text-muted)]">No activity recorded</span>;
  return (
    <time data-testid={`last-activity-${serviceKey}`} dateTime={entry.lastOccurredAt} className="text-xs">
      {new Date(entry.lastOccurredAt).toLocaleString()}
    </time>
  );
}

export function PillarOverviewBase({ manifest, beforeGrid }: PillarOverviewBaseProps) {
  const navigate = useNavigate();
  const permissionContext = usePermission() as PlatformPermissionContext;
  const rows = navigableServices(manifest).filter((service) => hasPermission(permissionContext.permissions, service.requiredPermission));

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

      {beforeGrid}

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
                  <p className="flex items-center gap-1.5 truncate font-semibold text-[var(--color-text-primary)]">
                    {row.name}
                    <StatusPill status={row.status} />
                  </p>
                  <p className="truncate text-xs text-[var(--color-text-muted)]">{row.description}</p>
                </div>
              </div>
            )
          },
          {
            id: "lastActivity",
            header: "Last activity",
            cell: (row) => <LastActivity serviceKey={`${manifest.id}.${row.id}`} />
          },
          {
            id: "status",
            header: "Status",
            cell: (row) => <ServiceBadge badgeKey={row.badgeKey} />
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
