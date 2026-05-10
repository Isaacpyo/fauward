import { HealthPill } from "@fauward/internal-ui";
import type { Customer360 } from "../api";
export default function HealthTab({ data }: { data: Customer360 }) {
  return <section className="rounded-lg border border-[var(--color-border)] bg-white p-4"><HealthPill status={data.health.score >= 70 ? "green" : "amber"} label={`Score ${data.health.score}`} /><div className="mt-4 space-y-2">{data.health.factors.map((factor) => <p key={factor} className="text-sm text-[var(--color-text-muted)]">{factor}</p>)}</div></section>;
}
