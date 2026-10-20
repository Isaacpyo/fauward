import { hasPermission, usePermission } from "@fauward/internal-rbac";
import { Link } from "react-router-dom";

import { useActivitySummary } from "@/lib/overview";
import type { PlatformPermissionContext } from "@/lib/platform-session";
import { navigableServices, type PillarManifest } from "@/pillars/_manifests";
import { ServiceRow } from "@/shell/ServiceRow";

type PillarCardProps = {
  pillar: PillarManifest;
};

export function PillarCard({ pillar }: PillarCardProps) {
  const permissionContext = usePermission() as PlatformPermissionContext;
  const visibleServices = navigableServices(pillar).filter((service) => hasPermission(permissionContext.permissions, service.requiredPermission));
  const disabled = visibleServices.length === 0;
  // ATTENTION/CRITICAL activity in the last 24 h for this pillar's services (WP-3.1).
  const summary = useActivitySummary();
  const keys = new Set(pillar.services.map((service) => `${pillar.id}.${service.id}`));
  const alertCount = summary.data?.services?.filter((entry) => keys.has(entry.service)).reduce((sum, entry) => sum + entry.alerts24h, 0) ?? null;

  return (
    <article
      title={disabled ? "No access" : undefined}
      className={`flex min-h-[360px] flex-col rounded-lg border border-[var(--color-border)] bg-white p-4 shadow-sm ${disabled ? "opacity-55 grayscale" : ""}`}
    >
      {disabled ? (
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md bg-[var(--color-surface-50)] text-[var(--color-text-muted)]">
            <pillar.icon size={18} />
          </div>
          <div>
            <h2 className="text-base font-bold text-[var(--color-text-primary)]">{pillar.name}</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">No access</p>
          </div>
        </div>
      ) : (
        <Link to={pillar.route} className="flex items-start gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-md" style={{ backgroundColor: `${pillar.accent}14`, color: pillar.accent }}>
            <pillar.icon size={18} />
          </div>
          <div>
            <h2 className="text-base font-bold text-[var(--color-text-primary)]">{pillar.name}</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">{pillar.description}</p>
          </div>
        </Link>
      )}

      <div className="mt-4 flex-1 space-y-1">
        {visibleServices.map((service) => (
          <ServiceRow key={service.id} pillar={pillar} service={service} />
        ))}
      </div>

      <div className="mt-4 border-t border-[var(--color-border)] pt-3 text-xs font-semibold text-[var(--color-text-muted)]">
        {visibleServices.length} services ·{" "}
        {alertCount === null ? (summary.isError ? "alerts unavailable" : "loading alerts") : <span data-testid={`pillar-alerts-${pillar.id}`} className={alertCount > 0 ? "text-red-700" : undefined}>{alertCount} alerts in 24 h</span>}
      </div>
    </article>
  );
}
