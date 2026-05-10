import { EmptyState } from "@fauward/internal-ui";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { fetchPermissionInventory } from "./api";

export function PermissionsPage() {
  const [search, setSearch] = useState("");
  const query = useQuery({ queryKey: ["permission-inventory"], queryFn: fetchPermissionInventory });
  const grouped = useMemo(() => {
    const filtered = (query.data ?? []).filter((permission) => permission.includes(search.trim().toLowerCase()));
    return filtered.reduce<Record<string, string[]>>((acc, permission) => {
      const [pillar = "other"] = permission.split(".");
      acc[pillar] = [...(acc[pillar] ?? []), permission];
      return acc;
    }, {});
  }, [query.data, search]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Permission inventory</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Read-only atomic permission list from `@fauward/internal-rbac`.</p>
        </div>
        <input value={search} onChange={(event) => setSearch(event.target.value)} className="w-full max-w-sm rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" placeholder="Filter permissions" />
      </header>

      {query.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading permissions...</p> : null}
      {!query.isLoading && Object.keys(grouped).length === 0 ? <EmptyState title="No permissions" message="No permissions matched the current filter." /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {Object.entries(grouped).map(([pillar, permissions]) => (
          <section key={pillar} className="rounded-lg border border-[var(--color-border)] bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold capitalize text-[var(--color-text-primary)]">{pillar}</h2>
              <span className="text-xs text-[var(--color-text-muted)]">{permissions.length} permissions</span>
            </div>
            <div className="grid gap-2">
              {permissions.map((permission) => (
                <span key={permission} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-50)] px-2 py-1 font-mono text-xs">
                  {permission}
                </span>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
