import { hasPermission, usePermission } from "@fauward/internal-rbac";
import { Command } from "cmdk";
import { Search, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import { StatusPill } from "@/components/service-kit/StatusPill";
import type { PlatformPermissionContext } from "@/lib/platform-session";
import { PILLARS, navigableServices } from "@/pillars/_manifests";

type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** Service navigation from the manifest: deferred services are absent, preview ones carry a pill (D1).
 *  Entity search (tenants, staff, tickets, invoices) arrives with GET /api/internal/search in WP-1.2. */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const permissionContext = usePermission() as PlatformPermissionContext;
  const permissions = Array.isArray(permissionContext.permissions) ? permissionContext.permissions : [];
  const groups = useMemo(
    () =>
      PILLARS.map((pillar) => ({
        pillar,
        services: navigableServices(pillar).filter((service) => hasPermission(permissions, service.requiredPermission))
      })).filter((group) => group.services.length > 0),
    [permissions]
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenChange, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/30 p-4" onMouseDown={() => onOpenChange(false)}>
      <div className="mx-auto mt-20 w-full max-w-2xl overflow-hidden rounded-lg border border-[var(--color-border)] bg-white shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
        <Command label="Go to service" className="bg-white">
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3">
            <Search size={16} className="text-[var(--color-text-muted)]" />
            <Command.Input autoFocus placeholder="Go to a console service..." className="h-12 flex-1 bg-transparent text-sm outline-none" />
            <button type="button" onClick={() => onOpenChange(false)} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-50)]">
              <X size={16} />
            </button>
          </div>
          <Command.List className="max-h-96 overflow-y-auto p-2">
            <Command.Empty className="px-3 py-6 text-center text-sm text-[var(--color-text-muted)]">No service matches.</Command.Empty>
            {groups.map(({ pillar, services }) => (
              <Command.Group key={pillar.id} heading={pillar.name} className="px-1 py-2 text-xs font-semibold text-[var(--color-text-muted)]">
                {services.map((service) => (
                  <Command.Item
                    key={service.id}
                    value={`${pillar.shortName} ${service.name}`}
                    onSelect={() => {
                      navigate(service.route);
                      onOpenChange(false);
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-[var(--color-text-primary)] aria-selected:bg-[var(--color-surface-50)]"
                  >
                    <service.icon size={15} style={{ color: pillar.accent }} />
                    <span>{service.name}</span>
                    {service.status === "preview" ? <StatusPill status="preview" /> : null}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
