import { HealthPill } from "@fauward/internal-ui";
import type { Customer360 } from "../api";
export default function HealthTab({ data }: { data: Customer360 }) {
  const factors = Array.isArray(data.health.factors) ? data.health.factors : Object.entries(data.health.factors).map(([key, value]) => `${key}: ${String(value)}`);
  return <section className="rounded-lg border border-[var(--color-border)] bg-white p-4"><HealthPill status={data.health.score >= 70 ? "green" : data.health.score >= 45 ? "amber" : "red"} label={`Score ${data.health.score}`} /><p className="mt-2 text-xs text-[var(--color-text-muted)]">Trend: {data.health.trend ?? "flat"}</p><div className="mt-4 space-y-2">{factors.map((factor) => <p key={factor} className="text-sm text-[var(--color-text-muted)]">{factor}</p>)}</div></section>;
}
