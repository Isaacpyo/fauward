import { EmptyState } from "@fauward/internal-ui";
import type { Customer360 } from "../api";

function label(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : "-";
}

export default function TicketsTab({ data }: { data: Customer360 }) {
  if (data.tickets.length === 0) {
    return <EmptyState title="No support tickets" message="Zendesk tickets linked to this tenant will appear here." action={<a className="rounded-md bg-[var(--fauward-navy)] px-3 py-2 text-sm font-semibold text-white" href="https://zendesk.com">Open Zendesk</a>} />;
  }

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-white p-4">
      <h2 className="text-sm font-semibold">Tickets</h2>
      <div className="mt-3 divide-y divide-[var(--color-border)]">
        {data.tickets.map((ticket, index) => (
          <div key={label(ticket.id) || index} className="py-3 text-sm">
            <p className="font-medium text-[var(--color-text-primary)]">{label(ticket.subject)}</p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">{label(ticket.status)} | {label(ticket.priority)} | {label(ticket.requesterEmail)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
