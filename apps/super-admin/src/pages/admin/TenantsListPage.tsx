import { useMemo, useState } from "react";

import { PlanOverrideModal } from "@/components/admin/PlanOverrideModal";
import { SuspendDialog } from "@/components/admin/SuspendDialog";
import { TenantTable } from "@/components/admin/TenantTable";
import type { TenantRow } from "@/components/admin/TenantTable";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

const baseTenants: TenantRow[] = [
  { id: "t_1", name: "Northline Logistics", domain: "northline.app", plan: "Pro", status: "Active", shipments: 1022, staff: 23, mrr: "GBP 79", created: "2025-09-14" },
  { id: "t_2", name: "Portbridge", domain: "portbridge.app", plan: "Starter", status: "Trial", shipments: 211, staff: 5, mrr: "GBP 29", created: "2026-01-08" },
  { id: "t_3", name: "Luma Freight", domain: "luma.app", plan: "Enterprise", status: "Active", shipments: 11320, staff: 184, mrr: "GBP 2800", created: "2024-03-11" },
];

const tenantsSeed: TenantRow[] = Array.from({ length: 220 }).map((_, index) => {
  const base = baseTenants[index % baseTenants.length];
  const suffix = index + 1;
  return {
    ...base,
    id: `t_${suffix}`,
    name: `${base.name} ${suffix}`,
    domain: `${base.domain.split(".")[0]}-${suffix}.app`,
    shipments: base.shipments + suffix * 3,
    staff: base.staff + (suffix % 7),
    created: `2025-${String((suffix % 12) + 1).padStart(2, "0")}-${String((suffix % 28) + 1).padStart(2, "0")}`,
  };
});

const inputCls = "h-10 w-full rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500 transition min-h-0";

export function TenantsListPage() {
  const [searchInput, setSearchInput] = useState("");
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [suspendTenant, setSuspendTenant] = useState<TenantRow | null>(null);
  const [overrideTenant, setOverrideTenant] = useState<TenantRow | null>(null);

  const rows = useMemo(() => {
    return tenantsSeed.filter((row) => {
      const needle = debouncedSearch.toLowerCase();
      const matchesSearch = row.name.toLowerCase().includes(needle) || row.domain.includes(needle);
      const matchesPlan = planFilter === "all" || row.plan.toLowerCase() === planFilter;
      const matchesStatus = statusFilter === "all" || row.status.toLowerCase() === statusFilter;
      return matchesSearch && matchesPlan && matchesStatus;
    });
  }, [debouncedSearch, planFilter, statusFilter]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Tenants</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{rows.length} tenant{rows.length !== 1 ? "s" : ""} matching current filters</p>
        </div>
      </div>

      <section className="rounded-xl border border-[var(--color-border)] bg-white p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="relative">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607z" />
            </svg>
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search name or domain…"
              className={`${inputCls} pl-9`}
            />
          </div>
          <select value={planFilter} onChange={(event) => setPlanFilter(event.target.value)} className={inputCls}>
            <option value="all">All plans</option>
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
            <option value="enterprise">Enterprise</option>
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={inputCls}>
            <option value="all">All status</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="trial">Trial</option>
          </select>
          <div className="relative">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
            </svg>
            <input type="date" className={`${inputCls} pl-9`} />
          </div>
        </div>
      </section>

      <TenantTable
        rows={rows}
        onImpersonate={(id) => window.open(`/admin/impersonation?tenant=${id}`, "_blank")}
        onSuspendToggle={(id) => setSuspendTenant(rows.find((row) => row.id === id) ?? null)}
        onOverridePlan={(id) => setOverrideTenant(rows.find((row) => row.id === id) ?? null)}
      />

      <SuspendDialog
        open={Boolean(suspendTenant)}
        tenantName={suspendTenant?.name}
        onClose={() => setSuspendTenant(null)}
        onConfirm={() => setSuspendTenant(null)}
      />

      <PlanOverrideModal
        open={Boolean(overrideTenant)}
        tenantName={overrideTenant?.name}
        onClose={() => setOverrideTenant(null)}
        onConfirm={() => setOverrideTenant(null)}
      />
    </div>
  );
}
