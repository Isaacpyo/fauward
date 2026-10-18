import { Link } from "react-router-dom";

import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { label, useMacros, useSla } from "./api";

function duration(minutes: number) {
  return minutes % 60 === 0 ? `${minutes / 60} h` : `${minutes} min`;
}

/** SLA targets (config/support-sla.ts) and the open PLATFORM tickets missing them right now. */
export function SlaPage() {
  const sla = useSla();
  return (
    <div className="space-y-4">
      <header>
        <Link to="/customer/support" className="text-xs font-semibold text-[var(--fauward-navy)] hover:underline">
          ← Support Desk
        </Link>
        <h1 className="mt-1 text-xl font-bold text-[var(--color-text-primary)]">SLA</h1>
      </header>
      {sla.isError ? <ConsoleApiErrorPanel error={sla.error} onRetry={() => void sla.refetch()} title="Unable to load SLA data" /> : null}
      {sla.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading…</p> : null}
      {sla.data ? (
        <>
          <section className="rounded-lg border border-[var(--color-border)] bg-white p-4">
            <h2 className="text-sm font-semibold">Targets</h2>
            <table className="mt-2 text-sm">
              <thead className="text-left text-xs text-[var(--color-text-muted)]">
                <tr>
                  <th className="pr-6">Priority</th>
                  <th className="pr-6">First response</th>
                  <th>Resolution</th>
                </tr>
              </thead>
              <tbody>
                {sla.data.targets.map((target) => (
                  <tr key={target.priority}>
                    <td className="pr-6">{label(target.priority)}</td>
                    <td className="pr-6">{duration(target.firstResponseMinutes)}</td>
                    <td>{duration(target.resolutionMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="rounded-lg border border-[var(--color-border)] bg-white p-4">
            <h2 className="text-sm font-semibold">
              Missing SLA now: {sla.data.breaches.length} of {sla.data.openTickets} open tickets
            </h2>
            {sla.data.breaches.length === 0 ? <p className="mt-2 text-sm text-[var(--color-text-muted)]">Every open ticket is within its targets.</p> : null}
            <ul className="mt-2 divide-y divide-[var(--color-border)]">
              {sla.data.breaches.map((ticket) => (
                <li key={ticket.id} data-testid="sla-breach" className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <Link to={`/customer/support/tickets/${ticket.id}`} className="font-mono text-xs font-semibold text-[var(--fauward-navy)] hover:underline">
                      {ticket.ticketNumber}
                    </Link>
                    <TenantChip tenantId={ticket.tenant.id} name={ticket.tenant.name} slug={ticket.tenant.slug} />
                  </span>
                  <span className="text-xs text-red-700">
                    {label(ticket.priority)} · {ticket.slaBreach === "FIRST_RESPONSE" ? "no first response" : "resolution overdue"} · opened {new Date(ticket.createdAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}

/** Saved replies (config/support-macros.ts), read-only; staff insert them from a ticket's reply box. */
export function MacrosPage() {
  const macros = useMacros();
  return (
    <div className="space-y-4">
      <header>
        <Link to="/customer/support" className="text-xs font-semibold text-[var(--fauward-navy)] hover:underline">
          ← Support Desk
        </Link>
        <h1 className="mt-1 text-xl font-bold text-[var(--color-text-primary)]">Macros</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Saved replies. Insert one from a ticket&apos;s reply box; placeholders are filled from the ticket.</p>
      </header>
      {macros.isError ? <ConsoleApiErrorPanel error={macros.error} onRetry={() => void macros.refetch()} title="Unable to load macros" /> : null}
      <ul className="space-y-2">
        {(macros.data ?? []).map((macro) => (
          <li key={macro.id} className="rounded-lg border border-[var(--color-border)] bg-white p-3 text-sm">
            <p className="font-semibold">{macro.title}</p>
            <p className="mt-1 whitespace-pre-wrap text-[var(--color-text-muted)]">{macro.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
