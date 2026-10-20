import { Link } from "react-router-dom";

import { StatusPill } from "@/components/service-kit/StatusPill";
import type { PillarManifest, PillarServiceManifest } from "@/pillars/_manifests";
import { ServiceBadge } from "@/shell/ServiceBadge";

type ServiceRowProps = {
  pillar: PillarManifest;
  service: PillarServiceManifest;
};

export function ServiceRow({ pillar, service }: ServiceRowProps) {
  return (
    <Link to={service.route} className="flex min-h-9 items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-[var(--color-surface-50)]">
      <span className="flex min-w-0 items-center gap-2">
        <service.icon size={15} className="shrink-0" style={{ color: pillar.accent }} />
        <span className="truncate font-medium text-[var(--color-text-primary)]">{service.name}</span>
        {service.status === "preview" ? <StatusPill status="preview" /> : null}
      </span>
      <ServiceBadge badgeKey={service.badgeKey} />
    </Link>
  );
}
