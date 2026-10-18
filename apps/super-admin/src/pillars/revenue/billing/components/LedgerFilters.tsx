import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import type { LedgerKind, ListFilters } from "../api";

const input = "h-9 rounded-md border border-[var(--color-border)] bg-white px-3 text-sm";

/** Ledger toggle + filters, kept in the URL. TENANT_CUSTOMER is a read-only support view, labelled as such (D4). */
export function useLedgerFilters(withStatus = false) {
  const [params, setParams] = useSearchParams();
  const filters = useMemo<ListFilters>(
    () => ({
      kind: params.get("kind") === "TENANT_CUSTOMER" ? "TENANT_CUSTOMER" : "PLATFORM",
      tenantId: params.get("tenantId") ?? undefined,
      status: withStatus ? params.get("status") ?? undefined : undefined,
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined
    }),
    [params, withStatus]
  );
  function set(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }
  return { filters, set };
}

export function LedgerFilters({ filters, set, statuses }: { filters: ListFilters; set: (key: string, value: string) => void; statuses?: string[] }) {
  return (
    <section className="space-y-2 rounded-lg border border-[var(--color-border)] bg-white p-3">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Ledger">
        {(["PLATFORM", "TENANT_CUSTOMER"] as LedgerKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={filters.kind === kind}
            onClick={() => set("kind", kind === "PLATFORM" ? "" : kind)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${filters.kind === kind ? "border-[var(--fauward-navy)] bg-[var(--fauward-navy)] text-white" : "border-[var(--color-border)]"}`}
          >
            {kind === "PLATFORM" ? "Fauward → tenants" : "Tenants → their customers (read-only)"}
          </button>
        ))}
      </div>
      {filters.kind === "TENANT_CUSTOMER" ? (
        <p data-testid="ledger-readonly" className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          You are viewing tenants&apos; own customer billing. It is read-only here and is not Fauward revenue.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <input aria-label="Tenant id" placeholder="Tenant id" value={filters.tenantId ?? ""} onChange={(event) => set("tenantId", event.target.value.trim())} className={input} />
        {statuses ? (
          <select aria-label="Status" value={filters.status ?? ""} onChange={(event) => set("status", event.target.value)} className={input}>
            <option value="">Any status</option>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        ) : null}
        <input aria-label="From" type="date" value={filters.from ?? ""} onChange={(event) => set("from", event.target.value)} className={input} />
        <input aria-label="To" type="date" value={filters.to ?? ""} onChange={(event) => set("to", event.target.value)} className={input} />
      </div>
    </section>
  );
}
