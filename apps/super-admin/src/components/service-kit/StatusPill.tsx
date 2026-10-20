import type { ServiceStatus } from "@/pillars/_manifests";

const STYLES: Record<ServiceStatus, string> = {
  live: "border-green-200 bg-green-50 text-green-700",
  preview: "border-amber-200 bg-amber-50 text-amber-800",
  deferred: "border-[var(--color-border)] bg-[var(--color-surface-50)] text-[var(--color-text-muted)]"
};

const LABELS: Record<ServiceStatus, string> = { live: "Live", preview: "Preview", deferred: "Not planned" };

export function StatusPill({ status }: { status: ServiceStatus }) {
  return <span className={`inline-flex shrink-0 rounded-full border px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide ${STYLES[status]}`}>{LABELS[status]}</span>;
}
