import { useState } from "react";
import { Link } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import { usePermission } from "@fauward/internal-rbac";

import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { TenantPicker, type TenantOption } from "@/components/service-kit/TenantPicker";
import { consoleApi } from "@/lib/console-api";

// trust.audit — tenant events (L17, WP-2.16): search over tenants' own audit trails. A tenant must be chosen unless the
// caller holds trust.audit.export (then every tenant can be searched at once).

type TenantEvent = {
  id: string;
  tenantId: string;
  tenant: { id: string; name: string; slug: string };
  actorType: string;
  actorLabel: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  timestamp: string;
};
type TenantEventsPage = { data: TenantEvent[]; nextCursor: string | null };

const field = "rounded-md border border-[var(--color-border)] px-2 py-1.5 text-sm";

function toIso(local: string, endOfDay = false) {
  if (!local) return undefined;
  return new Date(`${local}T${endOfDay ? "23:59:59" : "00:00:00"}`).toISOString();
}

export function TenantAuditEventsPage() {
  const crossTenant = usePermission("trust.audit.export") === true;
  const [tenant, setTenant] = useState<TenantOption | null>(null);
  const [action, setAction] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const filters = { tenantId: tenant?.id, action: action.trim() || undefined, from: toIso(from), to: toIso(to, true) };
  const enabled = Boolean(tenant) || crossTenant;
  const events = useInfiniteQuery({
    queryKey: ["trust.audit", "tenant-events", filters],
    queryFn: async ({ pageParam }) => (await consoleApi.get<TenantEventsPage>("/audit/tenant-events", { params: { ...filters, limit: 50, ...(pageParam ? { cursor: pageParam } : {}) } })).data,
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled
  });
  const rows = events.data?.pages.flatMap((page) => page.data) ?? [];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Tenant audit events</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">What happened inside tenants&apos; workspaces, from their own audit trails.</p>
        </div>
        <Link to="/trust/audit" className="text-sm font-semibold text-[var(--fauward-navy)] hover:underline">
          Platform audit log
        </Link>
      </header>
      <section className="grid gap-3 rounded-lg border border-[var(--color-border)] bg-white p-4 lg:grid-cols-[2fr_1fr_1fr_1fr]">
        <div>
          {tenant ? (
            <div className="flex items-center gap-2 text-sm" data-testid="tenant-events-tenant">
              <TenantChip tenantId={tenant.id} name={tenant.name} slug={tenant.slug} />
              <button type="button" className="text-xs font-semibold text-[var(--fauward-navy)] hover:underline" onClick={() => setTenant(null)}>
                Change
              </button>
            </div>
          ) : (
            <TenantPicker onSelect={setTenant} label={crossTenant ? "Tenant (optional)" : "Tenant (required)"} />
          )}
        </div>
        <label className="text-xs font-semibold text-[var(--color-text-muted)]">
          Action
          <input aria-label="Action" className={`${field} mt-1 block w-full`} value={action} onChange={(event) => setAction(event.target.value)} placeholder="e.g. SHIPMENT" />
        </label>
        <label className="text-xs font-semibold text-[var(--color-text-muted)]">
          From
          <input aria-label="From" type="date" className={`${field} mt-1 block w-full`} value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="text-xs font-semibold text-[var(--color-text-muted)]">
          To
          <input aria-label="To" type="date" className={`${field} mt-1 block w-full`} value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
      </section>
      {!enabled ? <p className="text-sm text-[var(--color-text-muted)]">Choose a tenant to search its audit trail. Searching every tenant needs trust.audit.export.</p> : null}
      {events.isError ? <ConsoleApiErrorPanel error={events.error} onRetry={() => void events.refetch()} title="Unable to load tenant audit events" /> : null}
      {enabled && events.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading audit events…</p> : null}
      {enabled && events.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No events match these filters.</p> : null}
      {rows.length > 0 ? (
        <table className="w-full rounded-lg border border-[var(--color-border)] bg-white text-sm">
          <thead>
            <tr className="text-left text-xs text-[var(--color-text-muted)]">
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Tenant</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Resource</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {rows.map((row) => (
              <tr key={row.id} data-testid="tenant-event">
                <td className="px-3 py-2 text-xs">{new Date(row.timestamp).toLocaleString()}</td>
                <td className="px-3 py-2">
                  <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} />
                </td>
                <td className="px-3 py-2 text-xs">{row.actorLabel}</td>
                <td className="px-3 py-2 font-mono text-xs">{row.action}</td>
                <td className="px-3 py-2 text-xs">{[row.resourceType, row.resourceId].filter(Boolean).join(" · ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {events.hasNextPage ? (
        <button type="button" disabled={events.isFetchingNextPage} onClick={() => void events.fetchNextPage()} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold disabled:opacity-50">
          {events.isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </div>
  );
}
