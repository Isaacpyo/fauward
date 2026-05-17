import { EmptyState, HealthPill } from "@fauward/internal-ui";
import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { internalApi } from "@/lib/internal-api";

type InternalOpsPageProps = {
  title: string;
  description: string;
  endpoint: string;
  primaryAction?: string;
  related?: Array<{ label: string; to: string }>;
};

function normalizeRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record.data)) return record.data;
    for (const value of Object.values(record)) {
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

function valueLabel(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "name" in value && typeof (value as { name?: unknown }).name === "string") return String((value as { name: string }).name);
  return JSON.stringify(value);
}

function rowTitle(row: unknown): string {
  if (!row || typeof row !== "object") return valueLabel(row);
  const record = row as Record<string, unknown>;
  return valueLabel(record.name ?? record.title ?? record.subject ?? record.quoteNumber ?? record.provider ?? record.region ?? record.id);
}

function rowStatus(row: unknown): string | null {
  if (!row || typeof row !== "object") return null;
  const status = (row as Record<string, unknown>).status ?? (row as Record<string, unknown>).decision;
  return typeof status === "string" ? status : null;
}

function statusColor(status: string): "green" | "amber" | "red" {
  const normalized = status.toLowerCase();
  if (["active", "approved", "paid", "verified", "operational", "won", "completed"].some((term) => normalized.includes(term))) return "green";
  if (["pending", "draft", "open", "queued", "trial", "review"].some((term) => normalized.includes(term))) return "amber";
  if (["failed", "suspended", "rejected", "denied", "down", "lost", "expired"].some((term) => normalized.includes(term))) return "red";
  return "amber";
}

function compactFields(row: unknown): Array<[string, string]> {
  if (!row || typeof row !== "object") return [];
  const record = row as Record<string, unknown>;
  return Object.entries(record)
    .filter(([key, value]) => !["id", "payload", "terms", "metadata", "before", "after"].includes(key) && value !== null && value !== undefined && typeof value !== "object")
    .slice(0, 5)
    .map(([key, value]) => [key, valueLabel(value)]);
}

export function InternalOpsPage({ title, description, endpoint, primaryAction, related = [] }: InternalOpsPageProps) {
  const params = useParams();
  const resolvedEndpoint = Object.entries(params).reduce((path, [key, value]) => path.replace(`:${key}`, value ?? ""), endpoint);
  const query = useQuery({
    queryKey: ["internal-ops", resolvedEndpoint],
    queryFn: async () => (await internalApi.get(resolvedEndpoint)).data
  });
  const rows = normalizeRows(query.data);
  const vendor = query.data && typeof query.data === "object" ? (query.data as Record<string, unknown>).vendor : null;

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--color-text-muted)]">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {related.map((item) => (
            <Link key={item.to} to={item.to} className="rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--fauward-navy)]">
              {item.label}
            </Link>
          ))}
          {primaryAction ? <button className="rounded-md bg-[var(--fauward-navy)] px-3 py-2 text-xs font-semibold text-white">{primaryAction}</button> : null}
        </div>
      </header>

      {vendor ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Vendor integration is not configured in this environment. Read-only Fauward data is still shown.
        </div>
      ) : null}

      {query.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading...</p> : null}
      {query.isError ? <EmptyState title="Unable to load" message="The service endpoint returned an error or is not configured for this environment." /> : null}
      {!query.isLoading && !query.isError && rows.length === 0 ? <EmptyState title="No records" message="No records matched this operational view yet." /> : null}

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-white">
          <div className="divide-y divide-[var(--color-border)]">
            {rows.map((row, index) => {
              const status = rowStatus(row);
              return (
                <article key={typeof row === "object" && row && "id" in row ? String((row as { id: unknown }).id) : index} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{rowTitle(row)}</h2>
                    {status ? <HealthPill status={statusColor(status)} label={status} /> : null}
                  </div>
                  <dl className="mt-3 grid gap-2 text-xs md:grid-cols-3">
                    {compactFields(row).map(([key, value]) => (
                      <div key={key}>
                        <dt className="font-medium capitalize text-[var(--color-text-muted)]">{key.replace(/([A-Z])/g, " $1")}</dt>
                        <dd className="mt-0.5 truncate text-[var(--color-text-primary)]">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
