import { hasPermission, usePermission } from "@fauward/internal-rbac";
import { Command } from "cmdk";
import { Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { StatusPill } from "@/components/service-kit/StatusPill";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { consoleApi } from "@/lib/console-api";
import type { PlatformPermissionContext } from "@/lib/platform-session";
import { PILLARS, navigableServices } from "@/pillars/_manifests";

type CommandPaletteProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type SearchResults = {
  tenants: Array<{ id: string; name: string; slug: string; status: string }> | null;
  staff: Array<{ id: string; name: string; email: string }> | null;
  tickets: Array<{ id: string; ticketNumber: string; subject: string; tenantId: string; tenant: { name: string } }> | null;
  invoices: Array<{ id: string; invoiceNumber: string; total: string; currency: string; tenant: { name: string } }> | null;
};

/** Service navigation from the manifest (deferred services absent, preview ones pilled, D1) plus entity search over
 *  GET /api/internal/search — sections the caller cannot read come back null and are not shown (§9.9). */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const debounced = useDebouncedValue(term.trim(), 250);
  const search = useQuery({
    queryKey: ["shell", "search", debounced],
    queryFn: async () => (await consoleApi.get<SearchResults>("/search", { params: { q: debounced } })).data,
    enabled: open && debounced.length >= 2
  });
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

  useEffect(() => {
    if (!open) setTerm("");
  }, [open]);

  if (!open) return null;

  function go(path: string) {
    navigate(path);
    onOpenChange(false);
  }
  const results = search.data;
  const itemClass = "flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-[var(--color-text-primary)] aria-selected:bg-[var(--color-surface-50)]";
  const groupClass = "px-1 py-2 text-xs font-semibold text-[var(--color-text-muted)]";

  return (
    <div className="fixed inset-0 z-50 bg-black/30 p-4" onMouseDown={() => onOpenChange(false)}>
      <div className="mx-auto mt-20 w-full max-w-2xl overflow-hidden rounded-lg border border-[var(--color-border)] bg-white shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
        <Command label="Go to service" className="bg-white">
          <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3">
            <Search size={16} className="text-[var(--color-text-muted)]" />
            <Command.Input autoFocus value={term} onValueChange={setTerm} placeholder="Go to a service, or search tenants, staff, tickets, invoices…" className="h-12 flex-1 bg-transparent text-sm outline-none" />
            <button type="button" onClick={() => onOpenChange(false)} className="rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface-50)]">
              <X size={16} />
            </button>
          </div>
          <Command.List className="max-h-96 overflow-y-auto p-2">
            <Command.Empty className="px-3 py-6 text-center text-sm text-[var(--color-text-muted)]">{search.isFetching ? "Searching…" : "Nothing matches."}</Command.Empty>
            {search.isError ? <p className="px-3 py-2 text-xs text-red-700">Search failed. Service navigation still works.</p> : null}
            {results?.tenants?.length ? (
              <Command.Group heading="Tenants" className={groupClass}>
                {results.tenants.map((tenant) => (
                  <Command.Item key={tenant.id} value={`tenant ${tenant.name} ${tenant.slug} ${term}`} onSelect={() => go(`/platform/tenants/${tenant.id}`)} className={itemClass}>
                    <span>{tenant.name}</span>
                    <span className="font-mono text-[11px] text-[var(--color-text-muted)]">{tenant.slug}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}
            {results?.staff?.length ? (
              <Command.Group heading="Staff" className={groupClass}>
                {results.staff.map((staff) => (
                  <Command.Item key={staff.id} value={`staff ${staff.name} ${staff.email} ${term}`} onSelect={() => go(`/trust/iam/users/${staff.id}`)} className={itemClass}>
                    <span>{staff.name}</span>
                    <span className="text-[11px] text-[var(--color-text-muted)]">{staff.email}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}
            {results?.tickets?.length ? (
              <Command.Group heading="Tickets" className={groupClass}>
                {results.tickets.map((ticket) => (
                  <Command.Item key={ticket.id} value={`ticket ${ticket.ticketNumber} ${term}`} onSelect={() => go(`/customer/360/${ticket.tenantId}?tab=tickets`)} className={itemClass}>
                    <span className="font-mono">{ticket.ticketNumber}</span>
                    <span className="truncate text-[11px] text-[var(--color-text-muted)]">
                      {ticket.subject} · {ticket.tenant.name}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}
            {results?.invoices?.length ? (
              <Command.Group heading="Invoices" className={groupClass}>
                {results.invoices.map((invoice) => (
                  <Command.Item key={invoice.id} value={`invoice ${invoice.invoiceNumber} ${term}`} onSelect={() => go(`/revenue/billing/invoices/${invoice.id}`)} className={itemClass}>
                    <span className="font-mono">{invoice.invoiceNumber}</span>
                    <span className="text-[11px] text-[var(--color-text-muted)]">{invoice.tenant.name}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            ) : null}
            {groups.map(({ pillar, services }) => (
              <Command.Group key={pillar.id} heading={pillar.name} className="px-1 py-2 text-xs font-semibold text-[var(--color-text-muted)]">
                {services.map((service) => (
                  <Command.Item
                    key={service.id}
                    value={`${pillar.shortName} ${service.name}`}
                    onSelect={() => go(service.route)}
                    className={itemClass}
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
