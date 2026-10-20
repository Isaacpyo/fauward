import { useEffect, useState } from "react";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { TenantPicker, type TenantOption } from "@/components/service-kit/TenantPicker";
import { type Contract, money, useActivateContract, useContracts, useCreateContract, useCreateOverride, useOverrides, words } from "./api";
import { SubscriptionsNav } from "./SubscriptionsNav";

const field = "mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm";

function TenantField({ tenant, onChange }: { tenant: TenantOption | null; onChange: (tenant: TenantOption | null) => void }) {
  return tenant ? (
    <p className="text-sm">
      Tenant: <TenantChip tenantId={tenant.id} name={tenant.name} slug={tenant.slug} />{" "}
      <button type="button" className="text-xs font-semibold text-[var(--fauward-navy)] hover:underline" onClick={() => onChange(null)}>
        Change
      </button>
    </p>
  ) : (
    <TenantPicker label="Tenant" onSelect={onChange} />
  );
}

/** Custom contracts: an ACTIVE contract replaces the list price in the tenant's MRR for its term. */
export function ContractsPage() {
  const contracts = useContracts();
  const create = useCreateContract();
  const activate = useActivateContract();
  const [creating, setCreating] = useState(false);
  const [activating, setActivating] = useState<Contract | null>(null);
  const [tenant, setTenant] = useState<TenantOption | null>(null);
  const [form, setForm] = useState({ monthlyAmount: "", currency: "", termStart: "", termEnd: "", msaUrl: "" });
  useEffect(() => {
    if (creating) {
      setTenant(null);
      setForm({ monthlyAmount: "", currency: "", termStart: "", termEnd: "", msaUrl: "" });
    }
  }, [creating]);

  return (
    <div className="space-y-4">
      <SubscriptionsNav current="contracts" />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Contracts</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Drafts do nothing until activated; an active contract sets the tenant&apos;s monthly amount for its term.</p>
        </div>
        <PermissionButton permission="revenue.subscriptions.write" onClick={() => setCreating(true)} className="rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          New contract
        </PermissionButton>
      </header>
      {contracts.isError ? <ConsoleApiErrorPanel error={contracts.error} onRetry={() => void contracts.refetch()} title="Unable to load contracts" /> : null}
      <ul className="space-y-3">
        {(contracts.data ?? []).map((row) => (
          <li key={row.id} data-testid="contract" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-white p-4 text-sm">
            <span className="flex flex-wrap items-center gap-2">
              {row.tenant ? <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} /> : null}
              {money(row.monthlyAmount, row.currency ?? "")} / month · {new Date(row.termStart).toLocaleDateString()} – {new Date(row.termEnd).toLocaleDateString()}
              <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-xs font-semibold">{words(row.status)}</span>
            </span>
            {row.status === "DRAFT" ? (
              <PermissionButton permission="revenue.subscriptions.write" onClick={() => setActivating(row)} className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50">
                Activate
              </PermissionButton>
            ) : null}
          </li>
        ))}
        {!contracts.isLoading && !contracts.isError && (contracts.data ?? []).length === 0 ? <li className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">No contracts yet.</li> : null}
      </ul>
      <ActionDialog
        open={creating}
        title="New contract"
        confirmLabel="Create draft"
        validate={() => (!tenant ? "Choose a tenant." : !/^\d+(\.\d{1,2})?$/.test(form.monthlyAmount) ? "Enter the monthly amount, e.g. 1500.00." : !/^[A-Z]{3}$/.test(form.currency) ? "Enter the contract currency as a 3-letter ISO code." : !form.termStart || !form.termEnd ? "Set the term." : null)}
        onSubmit={async () => create.mutateAsync({ tenantId: tenant!.id, monthlyAmount: form.monthlyAmount, currency: form.currency, termStart: form.termStart, termEnd: form.termEnd, ...(form.msaUrl ? { msaUrl: form.msaUrl } : {}) })}
        onClose={() => setCreating(false)}
      >
        <TenantField tenant={tenant} onChange={setTenant} />
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
            Monthly amount
            <input value={form.monthlyAmount} onChange={(event) => setForm({ ...form, monthlyAmount: event.target.value })} className={field} inputMode="decimal" />
          </label>
          <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
            Currency
            <input value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value.toUpperCase() })} className={field} maxLength={3} />
          </label>
          <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
            Term start
            <input type="date" value={form.termStart} onChange={(event) => setForm({ ...form, termStart: event.target.value })} className={field} />
          </label>
          <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
            Term end
            <input type="date" value={form.termEnd} onChange={(event) => setForm({ ...form, termEnd: event.target.value })} className={field} />
          </label>
        </div>
        <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
          MSA link (optional)
          <input value={form.msaUrl} onChange={(event) => setForm({ ...form, msaUrl: event.target.value })} className={field} />
        </label>
      </ActionDialog>
      <ActionDialog
        open={activating !== null}
        title="Activate this contract?"
        description={activating ? `${activating.tenant?.name ?? activating.tenantId}: ${money(activating.monthlyAmount, activating.currency ?? "")} per month replaces the list price in MRR for the term.` : undefined}
        confirmLabel="Activate"
        onSubmit={async () => activate.mutateAsync({ id: activating!.id })}
        onClose={() => setActivating(null)}
      />
    </div>
  );
}

/** Pricing overrides: a percentage off one tenant's list price, ACTIVE at once (fresh MFA + reason). */
export function OverridesPage() {
  const overrides = useOverrides();
  const create = useCreateOverride();
  const [creating, setCreating] = useState(false);
  const [tenant, setTenant] = useState<TenantOption | null>(null);
  const [discount, setDiscount] = useState("");
  const [validTo, setValidTo] = useState("");
  useEffect(() => {
    if (creating) {
      setTenant(null);
      setDiscount("");
      setValidTo("");
    }
  }, [creating]);

  return (
    <div className="space-y-4">
      <SubscriptionsNav current="overrides" />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Pricing overrides</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">10% or more needs a sales manager; more than 25% needs the CFO.</p>
        </div>
        <PermissionButton permission="revenue.subscriptions.override" onClick={() => setCreating(true)} className="rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          New override
        </PermissionButton>
      </header>
      {overrides.isError ? <ConsoleApiErrorPanel error={overrides.error} onRetry={() => void overrides.refetch()} title="Unable to load pricing overrides" /> : null}
      <section className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-[var(--color-surface-50)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            <tr>
              <th className="px-3 py-2">Tenant</th>
              <th className="px-3 py-2">Discount</th>
              <th className="px-3 py-2">Valid</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {(overrides.data ?? []).map((row) => (
              <tr key={row.id} data-testid="override-row">
                <td className="px-3 py-2">{row.tenant ? <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} /> : row.tenantId}</td>
                <td className="px-3 py-2 font-mono text-xs">{row.discountPercent ?? "—"}%</td>
                <td className="px-3 py-2 text-xs">
                  {new Date(row.validFrom).toLocaleDateString()} – {row.validTo ? new Date(row.validTo).toLocaleDateString() : "open"}
                </td>
                <td className="px-3 py-2 text-xs">{words(row.status)}</td>
              </tr>
            ))}
            {!overrides.isLoading && !overrides.isError && (overrides.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-sm text-[var(--color-text-muted)]">
                  No pricing overrides.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
      <ActionDialog
        open={creating}
        title="New pricing override"
        description="Takes effect at once in the tenant's MRR."
        confirmLabel="Create override"
        dangerous
        validate={() => (!tenant ? "Choose a tenant." : !(Number(discount) > 0 && Number(discount) <= 100) ? "Enter a discount between 0 and 100 percent." : null)}
        onSubmit={async (reason) => create.mutateAsync({ tenantId: tenant!.id, discountPercent: Number(discount), ...(validTo ? { validTo } : {}), reason })}
        onClose={() => setCreating(false)}
      >
        <TenantField tenant={tenant} onChange={setTenant} />
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
            Discount (%)
            <input value={discount} onChange={(event) => setDiscount(event.target.value)} className={field} inputMode="decimal" />
          </label>
          <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
            Valid until (optional)
            <input type="date" value={validTo} onChange={(event) => setValidTo(event.target.value)} className={field} />
          </label>
        </div>
      </ActionDialog>
    </div>
  );
}
