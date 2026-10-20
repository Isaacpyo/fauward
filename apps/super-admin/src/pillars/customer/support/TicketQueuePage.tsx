import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { TenantPicker } from "@/components/service-kit/TenantPicker";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { type SupportTicket, type TicketFilters, label, useTickets } from "./api";
import { NewTicketDialog } from "./components/NewTicketDialog";

// Views are saved filters (catalogue: mine, unassigned, breached, all); every filter lives in the URL.
const VIEWS = [
  { id: "open", label: "All open", filters: { status: "OPEN,IN_PROGRESS,WAITING_CUSTOMER" } },
  { id: "mine", label: "Mine", filters: { status: "OPEN,IN_PROGRESS,WAITING_CUSTOMER", assignee: "me" } },
  { id: "unassigned", label: "Unassigned", filters: { status: "OPEN,IN_PROGRESS,WAITING_CUSTOMER", assignee: "unassigned" } },
  { id: "breached", label: "SLA breached", filters: { breached: "true" } },
  { id: "all", label: "All", filters: {} }
] as const satisfies ReadonlyArray<{ id: string; label: string; filters: TicketFilters }>;

const priorityTone: Record<string, string> = {
  URGENT: "border-red-200 bg-red-50 text-red-700",
  HIGH: "border-amber-200 bg-amber-50 text-amber-800",
  NORMAL: "border-[var(--color-border)] bg-[var(--color-surface-50)] text-[var(--color-text-muted)]",
  LOW: "border-[var(--color-border)] bg-white text-[var(--color-text-muted)]"
};

function waitingOn(ticket: SupportTicket) {
  if (ticket.status === "RESOLVED" || ticket.status === "CLOSED") return "—";
  return ticket.lastMessageAuthorType === "STAFF" ? "Tenant" : "Fauward";
}

export function TicketQueuePage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const viewId = params.get("view") ?? "open";
  const view = VIEWS.find((item) => item.id === viewId) ?? VIEWS[0];
  const [search, setSearch] = useState(params.get("q") ?? "");
  const q = useDebouncedValue(search.trim(), 300);
  const tenantId = params.get("tenantId") ?? undefined;
  const [tenantLabel, setTenantLabel] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const filters: TicketFilters = { ...view.filters, ...(tenantId ? { tenantId } : {}), ...(q ? { q } : {}) };
  const tickets = useTickets(filters);
  const rows = tickets.data?.pages.flatMap((page) => page.data) ?? [];
  const total = tickets.data?.pages[0]?.total ?? 0;

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Support Desk</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Tickets tenants opened with Fauward. {tickets.isLoading ? "" : `${total} in this view.`}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/customer/support/sla" className="text-sm font-semibold text-[var(--fauward-navy)] hover:underline">
            SLA
          </Link>
          <Link to="/customer/support/macros" className="text-sm font-semibold text-[var(--fauward-navy)] hover:underline">
            Macros
          </Link>
          <PermissionButton permission="customer.support.write" onClick={() => setCreating(true)} className="rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            New ticket
          </PermissionButton>
        </div>
      </header>

      <nav aria-label="Ticket views" className="flex flex-wrap gap-1">
        {VIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-pressed={item.id === view.id}
            onClick={() => setParam("view", item.id === "open" ? null : item.id)}
            className={`rounded-md border px-3 py-1.5 text-sm ${item.id === view.id ? "border-[var(--fauward-navy)] bg-[var(--fauward-navy)] text-white" : "border-[var(--color-border)] bg-white"}`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <section className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--color-border)] bg-white p-3">
        <label className="text-sm">
          <span className="block text-xs font-semibold text-[var(--color-text-muted)]">Search</span>
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setParam("q", event.target.value.trim() || null);
            }}
            placeholder="Ticket number or subject"
            className="w-64 rounded-md border border-[var(--color-border)] px-2 py-1.5 text-sm"
          />
        </label>
        <div className="w-72">
          {tenantId ? (
            <p className="text-sm">
              Tenant: <span className="font-semibold">{tenantLabel ?? tenantId}</span>{" "}
              <button type="button" className="text-xs font-semibold text-[var(--fauward-navy)] hover:underline" onClick={() => setParam("tenantId", null)}>
                Clear
              </button>
            </p>
          ) : (
            <TenantPicker
              label="Filter by tenant"
              onSelect={(tenant) => {
                setTenantLabel(`${tenant.name} (${tenant.slug})`);
                setParam("tenantId", tenant.id);
              }}
            />
          )}
        </div>
      </section>

      {tickets.isError ? <ConsoleApiErrorPanel error={tickets.error} onRetry={() => void tickets.refetch()} title="Unable to load tickets" /> : null}

      {!tickets.isError ? (
        <section className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--color-surface-50)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              <tr>
                <th className="px-3 py-2">Ticket</th>
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2">Priority</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Waiting on</th>
                <th className="px-3 py-2">Assignee</th>
                <th className="px-3 py-2">Last message</th>
                <th className="px-3 py-2">SLA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((ticket) => (
                <tr key={ticket.id} data-testid="ticket-row" onClick={() => navigate(`/customer/support/tickets/${ticket.id}`)} className="cursor-pointer hover:bg-[var(--color-surface-50)]">
                  <td className="px-3 py-2">
                    <Link to={`/customer/support/tickets/${ticket.id}`} onClick={(event) => event.stopPropagation()} className="font-mono text-xs font-semibold text-[var(--fauward-navy)] hover:underline">
                      {ticket.ticketNumber}
                    </Link>
                    <p className="max-w-xs truncate text-xs">{ticket.subject}</p>
                  </td>
                  <td className="px-3 py-2">
                    <TenantChip tenantId={ticket.tenant.id} name={ticket.tenant.name} slug={ticket.tenant.slug} />
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${priorityTone[ticket.priority]}`}>{ticket.priority}</span>
                  </td>
                  <td className="px-3 py-2 text-xs">{label(ticket.status)}</td>
                  <td className="px-3 py-2 text-xs">{waitingOn(ticket)}</td>
                  <td className="px-3 py-2 text-xs">{ticket.assignee ? ticket.assignee.name ?? ticket.assignee.email : "Unassigned"}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{ticket.lastMessageAt ? new Date(ticket.lastMessageAt).toLocaleString() : "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {ticket.slaBreach ? <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 font-semibold text-red-700">{ticket.slaBreach === "FIRST_RESPONSE" ? "No first response" : "Resolution overdue"}</span> : "Within SLA"}
                  </td>
                </tr>
              ))}
              {!tickets.isLoading && rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-sm text-[var(--color-text-muted)]">
                    No tickets in this view.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {tickets.isLoading ? <p className="p-3 text-sm text-[var(--color-text-muted)]">Loading tickets…</p> : null}
          {tickets.hasNextPage ? (
            <div className="border-t border-[var(--color-border)] p-2 text-center">
              <button type="button" onClick={() => void tickets.fetchNextPage()} disabled={tickets.isFetchingNextPage} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold disabled:opacity-50">
                {tickets.isFetchingNextPage ? "Loading…" : `Load more (${rows.length} of ${total})`}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      <NewTicketDialog open={creating} onClose={() => setCreating(false)} onCreated={(id) => navigate(`/customer/support/tickets/${id}`)} />
    </div>
  );
}
