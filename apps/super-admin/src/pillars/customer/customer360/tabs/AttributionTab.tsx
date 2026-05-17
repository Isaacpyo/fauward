import { EmptyState } from "@fauward/internal-ui";
import type { Customer360 } from "../api";

export default function AttributionTab({ data }: { data: Customer360 }) {
  const rows = data.attribution ?? [];
  if (rows.length === 0) return <EmptyState title="No attribution data" message="PostHog attribution rows linked to this tenant will appear here." />;
  return <section className="rounded-lg border border-[var(--color-border)] bg-white p-4"><h2 className="text-sm font-semibold">Attribution</h2><div className="mt-3 space-y-2">{rows.map((row) => <div key={String(row.id)} className="flex justify-between rounded border border-[var(--color-border)] px-3 py-2 text-sm"><span>{String(row.source ?? "source")}</span><span>{String(row.weight ?? "")}</span></div>)}</div></section>;
}
