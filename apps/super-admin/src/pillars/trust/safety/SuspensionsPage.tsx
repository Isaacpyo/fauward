import { useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { type Suspension, useLiftSuspension, useRules, useSuspensions, words } from "./api";
import { SafetyNav } from "./SafetyNav";

const SOURCES = ["PLATFORM", "DUNNING", "FRAUD", "AUP", "LEGAL", "SYSTEM"];

/** Every suspension cause from every source (D3, ACC-SAF-5); lifting one is dangerous. */
export function SuspensionsPage() {
  const [params, setParams] = useSearchParams();
  const source = params.get("source") ?? "";
  const status = params.get("status") ?? "ACTIVE";
  const suspensions = useSuspensions({ source: source || undefined, status: status === "ALL" ? undefined : status });
  const lift = useLiftSuspension();
  const rows = suspensions.data?.pages.flatMap((page) => page.data) ?? [];
  const [lifting, setLifting] = useState<Suspension | null>(null);
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <SafetyNav current="suspensions" />
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Suspensions</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Each row is one cause. A tenant is active again only when none of its causes is active.</p>
      </header>
      <div className="flex flex-wrap gap-3">
        <select aria-label="Source" value={source} onChange={(event) => set("source", event.target.value)} className="rounded-md border border-[var(--color-border)] px-2 py-1.5 text-sm">
          <option value="">All sources</option>
          {SOURCES.map((value) => (
            <option key={value} value={value}>
              {words(value)}
            </option>
          ))}
        </select>
        <select aria-label="Status" value={status} onChange={(event) => set("status", event.target.value === "ACTIVE" ? "" : event.target.value)} className="rounded-md border border-[var(--color-border)] px-2 py-1.5 text-sm">
          <option value="ACTIVE">Active</option>
          <option value="LIFTED">Lifted</option>
          <option value="ALL">All</option>
        </select>
      </div>
      {suspensions.isError ? <ConsoleApiErrorPanel error={suspensions.error} onRetry={() => void suspensions.refetch()} title="Unable to load suspensions" /> : null}
      {!suspensions.isError ? (
        <section className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--color-surface-50)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              <tr>
                <th className="px-3 py-2">Since</th>
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Internal reason</th>
                <th className="px-3 py-2">Shown to tenant</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((row) => (
                <tr key={row.id} data-testid="suspension-row">
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="px-3 py-2">{row.tenant ? <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} /> : <span className="font-mono text-xs">{row.tenantId}</span>}</td>
                  <td className="px-3 py-2 text-xs">
                    {words(row.source)} · {words(row.category)}
                  </td>
                  <td className="max-w-xs px-3 py-2 text-xs">{row.reason}</td>
                  <td className="max-w-xs px-3 py-2 text-xs">{row.publicReason ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {row.status === "ACTIVE" ? (
                      <PermissionButton permission="trust.safety.suspend" onClick={() => setLifting(row)} className="rounded-md border border-[var(--color-border)] px-2 py-1 font-semibold disabled:cursor-not-allowed disabled:opacity-50">
                        Lift
                      </PermissionButton>
                    ) : (
                      <span title={row.liftReason ?? undefined}>Lifted ({words(row.liftedVia ?? "manual")})</span>
                    )}
                  </td>
                </tr>
              ))}
              {!suspensions.isLoading && rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-[var(--color-text-muted)]">
                    No suspensions match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {suspensions.hasNextPage ? (
            <div className="border-t border-[var(--color-border)] p-2 text-center">
              <button type="button" onClick={() => void suspensions.fetchNextPage()} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold">
                Load more
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
      <ActionDialog
        open={lifting !== null}
        title="Lift this suspension cause"
        description={lifting ? `${lifting.tenant?.name ?? lifting.tenantId}: ${words(lifting.source)} — ${lifting.reason}. The tenant is reactivated only if no other cause is active.` : undefined}
        confirmLabel="Lift"
        dangerous
        onSubmit={async (reason) => lift.mutateAsync({ id: lifting!.id, reason })}
        onClose={() => setLifting(null)}
      />
    </div>
  );
}

/** Automatic rules, read-only: the same objects the enforcing code reads (config/safety-rules.ts). */
export function RulesPage() {
  const rules = useRules();
  return (
    <div className="space-y-4">
      <SafetyNav current="rules" />
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Automatic rules</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Defined in code and changed by a reviewed deploy. Shown here exactly as the backend runs them.</p>
      </header>
      {rules.isError ? <ConsoleApiErrorPanel error={rules.error} onRetry={() => void rules.refetch()} title="Unable to load rules" /> : null}
      <ul className="space-y-3">
        {(rules.data ?? []).map((rule) => (
          <li key={rule.id} data-testid="safety-rule" className="rounded-lg border border-[var(--color-border)] bg-white p-4 text-sm">
            <p className="font-semibold">{rule.name}</p>
            <p className="mt-1 text-[var(--color-text-muted)]">{rule.effect}</p>
            <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
              {Object.entries(rule.parameters).map(([key, value]) => (
                <div key={key} className="contents">
                  <dt className="font-mono text-[var(--color-text-muted)]">{key}</dt>
                  <dd className="font-mono">{Array.isArray(value) ? value.join(", ") : String(value)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
