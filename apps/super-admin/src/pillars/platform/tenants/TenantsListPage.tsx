import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { MoneyCell } from "@/components/service-kit/MoneyCell";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { type TenantListFilters, type TenantListRow, type TenantPlan, type TenantStatus, useTenantList } from "./api";
import { PlanOverrideDialog, SuspendTenantDialog } from "./components/TenantDialogs";

const PLANS: TenantPlan[] = ["STARTER", "PRO", "ENTERPRISE", "TRIALING"];
const STATUSES: TenantStatus[] = ["ACTIVE", "TRIALING", "SUSPENDED", "CANCELLED", "DEMO"];
const REGIONS = ["uk_europe", "europe", "africa", "northAmerica", "global"];
const FILTER_KEYS = ["search", "plan", "effectivePlan", "status", "region", "createdFrom", "createdTo", "sort", "order"] as const;

const input = "h-9 w-full rounded-md border border-[var(--color-border)] bg-white px-3 text-sm outline-none focus:border-[var(--fauward-navy)]";

export function statusTone(status: TenantStatus) {
  if (status === "SUSPENDED") return "border-red-200 bg-red-50 text-red-700";
  if (status === "CANCELLED") return "border-[var(--color-border)] bg-[var(--color-surface-50)] text-[var(--color-text-muted)]";
  if (status === "TRIALING" || status === "DEMO") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-green-200 bg-green-50 text-green-700";
}

export function TenantsListPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState(params.get("search") ?? "");
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [suspending, setSuspending] = useState<TenantListRow | null>(null);
  const [overriding, setOverriding] = useState<TenantListRow | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Filters live in the URL so a filtered view can be shared and survives reload (service kit §6.2).
  useEffect(() => {
    const next = new URLSearchParams(params);
    if (debouncedSearch.trim()) next.set("search", debouncedSearch.trim());
    else next.delete("search");
    if (next.toString() !== params.toString()) setParams(next, { replace: true });
  }, [debouncedSearch, params, setParams]);

  const filters = useMemo(() => {
    const value: Record<string, string> = {};
    for (const key of FILTER_KEYS) {
      const raw = params.get(key);
      if (raw) value[key] = raw;
    }
    return value as TenantListFilters;
  }, [params]);

  const list = useTenantList(filters);
  const rows = list.data?.pages.flatMap((page) => page.data) ?? [];
  const total = list.data?.pages[0]?.total ?? 0;

  function setFilter(key: (typeof FILTER_KEYS)[number], value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Tenants</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{list.isLoading ? "Loading…" : `${total} tenant${total === 1 ? "" : "s"} match these filters`}</p>
        </div>
        <Link to="/platform/tenants/region-requests" className="text-sm font-semibold text-[var(--fauward-navy)] hover:underline">
          Region change requests
        </Link>
      </header>

      {notice ? (
        <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {notice}
        </p>
      ) : null}

      <section className="grid gap-2 rounded-lg border border-[var(--color-border)] bg-white p-3 md:grid-cols-4 lg:grid-cols-8">
        <input aria-label="Search tenants" placeholder="Name, slug or domain" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} className={`${input} md:col-span-2`} />
        <select aria-label="Billing plan" value={filters.plan ?? ""} onChange={(event) => setFilter("plan", event.target.value)} className={input}>
          <option value="">Any billing plan</option>
          {PLANS.map((plan) => (
            <option key={plan} value={plan}>
              {plan}
            </option>
          ))}
        </select>
        <select aria-label="Effective plan" value={filters.effectivePlan ?? ""} onChange={(event) => setFilter("effectivePlan", event.target.value)} className={input}>
          <option value="">Any effective plan</option>
          {PLANS.map((plan) => (
            <option key={plan} value={plan}>
              {plan}
            </option>
          ))}
        </select>
        <select aria-label="Status" value={filters.status ?? ""} onChange={(event) => setFilter("status", event.target.value)} className={input}>
          <option value="">Any status (no demo)</option>
          {STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <select aria-label="Region" value={filters.region ?? ""} onChange={(event) => setFilter("region", event.target.value)} className={input}>
          <option value="">Any region</option>
          {REGIONS.map((region) => (
            <option key={region} value={region}>
              {region}
            </option>
          ))}
        </select>
        <input aria-label="Created from" type="date" value={filters.createdFrom ?? ""} onChange={(event) => setFilter("createdFrom", event.target.value)} className={input} />
        <input aria-label="Created to" type="date" value={filters.createdTo ?? ""} onChange={(event) => setFilter("createdTo", event.target.value)} className={input} />
      </section>

      {list.isError ? <ConsoleApiErrorPanel error={list.error} onRetry={() => void list.refetch()} title="Unable to load tenants" /> : null}

      {!list.isError ? (
        <section className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--color-surface-50)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              <tr>
                <th className="px-3 py-2">
                  <button type="button" onClick={() => setFilter("sort", filters.sort === "name" ? "" : "name")} className="uppercase">
                    Tenant
                  </button>
                </th>
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Region</th>
                <th className="px-3 py-2 text-right">MRR</th>
                <th className="px-3 py-2 text-right">Shipments (month)</th>
                <th className="px-3 py-2 text-right">Staff</th>
                <th className="px-3 py-2 text-right">AI (month, USD)</th>
                <th className="px-3 py-2 text-right">Health</th>
                <th className="px-3 py-2">Created</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((row) => (
                <tr key={row.id} data-testid="tenant-row" onClick={() => navigate(`/platform/tenants/${row.id}`)} className="cursor-pointer hover:bg-[var(--color-surface-50)]">
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-0.5">
                      <TenantChip tenantId={row.id} name={row.name} slug={row.slug} />
                      <span className="font-mono text-[11px] text-[var(--color-text-muted)]">{row.customDomain ?? row.slug}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{row.effectivePlan}</span>
                    {row.effectivePlan !== row.plan ? <span className="block text-[11px] text-[var(--color-text-muted)]">billing {row.plan}</span> : null}
                  </td>
                  <td className="px-3 py-2">
                    <span data-testid="tenant-status" className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusTone(row.status)}`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs">{row.region}</td>
                  <td className="px-3 py-2 text-right" title={row.mrrContribution.note}>
                    <MoneyCell amount={row.mrrContribution.amount} currency={row.mrrContribution.currency} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.shipmentsThisMonth}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.staffCount}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.aiSpendThisMonthUsd}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.healthScore ?? <span className="text-xs text-[var(--color-text-muted)]">Not yet scored</span>}</td>
                  <td className="px-3 py-2 text-xs">{new Date(row.createdAt).toLocaleDateString()}</td>
                  <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                    <div className="flex flex-wrap gap-1">
                      <PermissionButton
                        permission="platform.tenants.suspend"
                        disabled={row.status === "SUSPENDED" || row.status === "CANCELLED"}
                        onClick={() => setSuspending(row)}
                        className="rounded border border-[var(--color-border)] px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Suspend
                      </PermissionButton>
                      <PermissionButton
                        permission="revenue.subscriptions.override"
                        disabled={row.status === "CANCELLED"}
                        onClick={() => setOverriding(row)}
                        className="rounded border border-[var(--color-border)] px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Override plan
                      </PermissionButton>
                      <PermissionButton
                        permission="platform.impersonation.start"
                        disabled={row.status === "CANCELLED"}
                        onClick={() => navigate(`/platform/impersonation?tenantId=${encodeURIComponent(row.id)}`)}
                        className="rounded border border-[var(--color-border)] px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Impersonate
                      </PermissionButton>
                    </div>
                  </td>
                </tr>
              ))}
              {!list.isLoading && rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-8 text-center text-sm text-[var(--color-text-muted)]">
                    {Object.keys(filters).length > 0 ? "No tenant matches these filters." : "No tenants yet."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {list.hasNextPage ? (
            <div className="border-t border-[var(--color-border)] p-2 text-center">
              <button type="button" onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold disabled:opacity-50">
                {list.isFetchingNextPage ? "Loading…" : `Load more (${rows.length} of ${total})`}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      <SuspendTenantDialog
        tenant={suspending}
        open={suspending !== null}
        onClose={() => setSuspending(null)}
        onDone={(result) => setNotice(`${suspending?.name ?? "Tenant"} is ${result.tenant.status.toLowerCase()}. Tenant admins have been notified.`)}
      />
      <PlanOverrideDialog tenant={overriding} billingPlan={overriding?.plan} open={overriding !== null} onClose={() => setOverriding(null)} onDone={setNotice} />
    </div>
  );
}
