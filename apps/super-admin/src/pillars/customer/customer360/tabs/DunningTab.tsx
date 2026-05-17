import { EmptyState } from "@fauward/internal-ui";
import type { Customer360 } from "../api";

export default function DunningTab({ data }: { data: Customer360 }) {
  const events = data.dunning?.events ?? [];
  if (events.length === 0) return <EmptyState title="No dunning events" message="Failed payment recovery events will appear here." />;
  return <section className="rounded-lg border border-[var(--color-border)] bg-white p-4"><h2 className="text-sm font-semibold">Dunning</h2><div className="mt-3 space-y-2">{events.map((event) => <div key={String(event.id)} className="rounded border border-[var(--color-border)] px-3 py-2 text-sm"><p className="font-medium">{String(event.eventType ?? "Event")}</p><p className="text-xs text-[var(--color-text-muted)]">Attempt {String(event.attempt ?? 0)} | {String(event.createdAt ?? "")}</p></div>)}</div></section>;
}
