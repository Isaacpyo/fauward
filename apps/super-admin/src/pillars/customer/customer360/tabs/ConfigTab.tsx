import { MonoCell } from "@fauward/internal-ui";
import type { Customer360 } from "../api";
export default function ConfigTab({ data }: { data: Customer360 }) {
  return <section className="rounded-lg border border-[var(--color-border)] bg-white p-4"><h2 className="text-sm font-semibold">Config JSON</h2><pre className="mt-3 overflow-auto rounded bg-[var(--color-surface-50)] p-3 text-xs"><MonoCell value={JSON.stringify(data.tenant, null, 2)} /></pre></section>;
}
