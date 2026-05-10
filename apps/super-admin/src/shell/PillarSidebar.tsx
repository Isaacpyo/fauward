import { hasPermission, usePermission } from "@fauward/internal-rbac";
import { Link, useLocation } from "react-router-dom";

import { PILLARS, findPillarById } from "@/pillars/_manifests";

export function PillarSidebar() {
  const location = useLocation();
  const firstSegment = location.pathname.split("/").filter(Boolean)[0];
  const pillar = findPillarById(firstSegment);
  const permissionContext = usePermission() as ReturnType<typeof usePermission> & { permissions?: never };
  const permissions = Array.isArray(permissionContext.permissions) ? permissionContext.permissions : [];

  if (!pillar) {
    return (
      <aside className="hidden w-[260px] shrink-0 border-r border-[var(--color-border)] bg-white lg:block">
        <div className="border-b border-[var(--color-border)] px-4 py-4">
          <p className="text-xs font-semibold uppercase text-[var(--color-text-muted)]">Pillars</p>
        </div>
        <nav className="space-y-1 px-2 py-3">
          {PILLARS.map((item) => (
            <Link key={item.id} to={item.route} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-[var(--color-text-muted)] hover:bg-[var(--color-surface-50)] hover:text-[var(--color-text-primary)]">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.accent }} />
              {item.shortName}
            </Link>
          ))}
        </nav>
      </aside>
    );
  }

  const visibleServices = pillar.services.filter((service) => hasPermission(permissions, service.requiredPermission));

  return (
    <aside className="hidden w-[280px] shrink-0 border-r border-[var(--color-border)] bg-white lg:block">
      <div className="border-b border-[var(--color-border)] px-4 py-4">
        <div className="flex items-center gap-2">
          <pillar.icon size={18} style={{ color: pillar.accent }} />
          <p className="text-sm font-bold text-[var(--color-text-primary)]">{pillar.shortName}</p>
        </div>
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">{pillar.description}</p>
      </div>
      <nav className="space-y-1 px-2 py-3">
        {visibleServices.length === 0 ? (
          <p className="px-3 py-2 text-sm text-[var(--color-text-muted)]">No accessible services.</p>
        ) : (
          visibleServices.map((service) => {
            const active = location.pathname === service.route || location.pathname.startsWith(`${service.route}/`);
            return (
              <Link
                key={service.id}
                to={service.route}
                className="relative flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition hover:bg-[var(--color-surface-50)]"
                style={{ color: active ? pillar.accent : "var(--color-text-muted)" }}
              >
                {active ? <span className="absolute inset-y-1 left-0 w-0.5 rounded-r" style={{ backgroundColor: pillar.accent }} /> : null}
                <service.icon size={15} className="shrink-0" />
                <span className="truncate">{service.name}</span>
              </Link>
            );
          })
        )}
      </nav>
    </aside>
  );
}
