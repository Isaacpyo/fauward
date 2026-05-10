import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";

import { fetchBadge } from "@/lib/badges";
import type { PillarManifest, PillarServiceManifest } from "@/pillars/_manifests";

type ServiceRowProps = {
  pillar: PillarManifest;
  service: PillarServiceManifest;
};

const toneClasses = {
  neutral: "border-[var(--color-border)] bg-[var(--color-surface-50)] text-[var(--color-text-muted)]",
  green: "border-green-200 bg-green-50 text-green-700",
  amber: "border-amber-200 bg-amber-50 text-amber-700",
  red: "border-red-200 bg-red-50 text-red-700"
};

export function ServiceRow({ pillar, service }: ServiceRowProps) {
  const badge = useQuery({
    queryKey: ["pillar-service-badge", service.id, service.badgeKey ?? "placeholder"],
    queryFn: () => fetchBadge(service.badgeKey),
    staleTime: 30_000
  });

  return (
    <Link to={service.route} className="flex min-h-9 items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--color-surface-50)]">
      <span className="flex min-w-0 items-center gap-2">
        <service.icon size={15} className="shrink-0" style={{ color: pillar.accent }} />
        <span className="truncate font-medium text-[var(--color-text-primary)]">{service.name}</span>
      </span>
      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${toneClasses[badge.data?.tone ?? "neutral"]}`}>
        {badge.isLoading ? "..." : badge.isError ? "-" : badge.data?.label ?? "-"}
      </span>
    </Link>
  );
}
