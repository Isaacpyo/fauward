import { useQuery } from "@tanstack/react-query";
import { useId, useState } from "react";

import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { consoleApi } from "@/lib/console-api";
import { ConsoleApiErrorPanel } from "./ConsoleApiErrorPanel";

export type TenantOption = { id: string; name: string; slug: string; status: string; plan: string };

/** Search-as-you-type over the tenant directory (GET /api/internal/tenants?search=). */
export function TenantPicker({ onSelect, label = "Find a tenant" }: { onSelect: (tenant: TenantOption) => void; label?: string }) {
  const inputId = useId();
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search.trim(), 250);
  const query = useQuery({
    queryKey: ["tenant-picker", debounced],
    queryFn: async () => (await consoleApi.get<{ data: TenantOption[] }>("/tenants", { params: { search: debounced, limit: 20 } })).data.data,
    enabled: debounced.length > 0
  });

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-sm font-medium text-[var(--color-text-primary)]">
        {label}
      </label>
      <input
        id={inputId}
        type="search"
        autoComplete="off"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm outline-none focus:border-[var(--fauward-navy)]"
      />
      {query.isError ? <ConsoleApiErrorPanel error={query.error} onRetry={() => void query.refetch()} title="Tenant search failed" /> : null}
      {debounced && query.isFetching && !query.data ? <p className="text-sm text-[var(--color-text-muted)]">Searching...</p> : null}
      {query.data && query.data.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No tenant matches &quot;{debounced}&quot;.</p> : null}
      {query.data && query.data.length > 0 ? (
        <ul aria-label="Matching tenants" className="divide-y divide-[var(--color-border)] overflow-hidden rounded-md border border-[var(--color-border)] bg-white">
          {query.data.map((tenant) => (
            <li key={tenant.id}>
              <button type="button" onClick={() => onSelect(tenant)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-50)]">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-[var(--color-text-primary)]">{tenant.name}</span>
                  <span className="block truncate font-mono text-xs text-[var(--color-text-muted)]">{tenant.slug}</span>
                </span>
                <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
                  {tenant.plan} / {tenant.status}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
