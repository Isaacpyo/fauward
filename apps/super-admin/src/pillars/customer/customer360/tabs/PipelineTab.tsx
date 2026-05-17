import { EmptyState } from "@fauward/internal-ui";
import { Link } from "react-router-dom";
import type { Customer360 } from "../api";

export default function PipelineTab({ data }: { data: Customer360 }) {
  const deals = data.pipeline ?? [];
  if (deals.length === 0) return <EmptyState title="No linked deals" message="HubSpot deals linked to this tenant will appear here." />;
  return <section className="rounded-lg border border-[var(--color-border)] bg-white p-4"><h2 className="text-sm font-semibold">Pipeline</h2><div className="mt-3 space-y-2">{deals.map((deal) => <Link key={String(deal.id)} to={`/gtm/pipeline/${String(deal.id)}`} className="flex justify-between rounded border border-[var(--color-border)] px-3 py-2 text-sm"><span>{String(deal.name ?? "Deal")}</span><span>{String(deal.stage ?? "")}</span></Link>)}</div></section>;
}
