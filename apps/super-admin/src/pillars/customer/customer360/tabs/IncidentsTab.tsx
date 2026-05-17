import { EmptyState } from "@fauward/internal-ui";
import { Link } from "react-router-dom";
import type { Customer360 } from "../api";

export default function IncidentsTab({ data }: { data: Customer360 }) {
  const impacts = data.incidents?.impacts ?? [];
  if (impacts.length === 0) return <EmptyState title="No incident impact" message="Incidents tagged to this tenant will appear here." />;
  return <section className="rounded-lg border border-[var(--color-border)] bg-white p-4"><h2 className="text-sm font-semibold">Incident Impact</h2><div className="mt-3 space-y-2">{impacts.map((impact) => <Link key={String(impact.id)} to={`/platform/incidents/${String(impact.incidentId ?? "")}`} className="block rounded border border-[var(--color-border)] px-3 py-2 text-sm"><p className="font-medium">{String((impact.incident as { title?: unknown } | undefined)?.title ?? impact.impactLevel ?? "Incident")}</p><p className="text-xs text-[var(--color-text-muted)]">{String(impact.createdAt ?? "")}</p></Link>)}</div></section>;
}
