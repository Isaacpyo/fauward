import { useMemo, useState } from "react";

import { PlanOverrideModal } from "@/components/admin/PlanOverrideModal";
import { SuspendDialog } from "@/components/admin/SuspendDialog";
import { TenantTable } from "@/components/admin/TenantTable";
import type { TenantRow } from "@/components/admin/TenantTable";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

const baseTenants: TenantRow[] = [
  { id: "t_1", name: "Northline Logistics", domain: "northline.app", plan: "Pro", status: "Active", shipments: 1022, staff: 23, mrr: "GBP 79", created: "2025-09-14" },
  { id: "t_2", name: "Portbridge", domain: "portbridge.app", plan: "Starter", status: "Trial", shipments: 211, staff: 5, mrr: "GBP 29", created: "2026-01-08" },
  { id: "t_3", name: "Luma Freight", domain: "luma.app", plan: "Enterprise", status: "Active", shipments: 11320, staff: 184, mrr: "GBP 2800", created: "2024-03-11" }
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
    created: `2025-${String((suffix % 12) + 1).padStart(2, "0")}-${String((suffix % 28) + 1).padStart(2, "0")}`
  };
});

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
    <div className="space-y-3">
      <h1 className="text-lg font-semibold text-[var(--color-text-primary)]">Tenants</h1>

      <section className="grid gap-2 rounded-md border border-[var(--color-border)] bg-white p-3 md:grid-cols-4">
        <input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search name/domain"
          className="h-10 rounded border border-[var(--color-border)] px-2 text-xs"
        />
        <select value={planFilter} onChange={(event) => setPlanFilter(event.target.value)} className="h-10 rounded border border-[var(--color-border)] px-2 text-xs">
          <option value="all">All plans</option>
          <option value="starter">Starter</option>
          <option value="pro">Pro</option>
          <option value="enterprise">Enterprise</option>
        </select>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded border border-[var(--color-border)] px-2 text-xs">
          <option value="all">All status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="trial">Trial</option>
        </select>
        <input type="date" className="h-10 rounded border border-[var(--color-border)] px-2 text-xs" />
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
