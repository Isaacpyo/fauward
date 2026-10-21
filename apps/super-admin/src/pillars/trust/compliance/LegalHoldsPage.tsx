import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { TenantPicker, type TenantOption } from "@/components/service-kit/TenantPicker";
import { type LegalHold, useCreateHold, useExports, useLegalHolds, useReleaseHold, words } from "./api";
import { ComplianceNav } from "./ComplianceNav";

/** Legal holds: an active hold blocks tenant data deletion and DSAR erasure until it is released (who/when/why kept). */
export function LegalHoldsPage() {
  const [status, setStatus] = useState<"ACTIVE" | "RELEASED" | "">("ACTIVE");
  const holds = useLegalHolds(status || undefined);
  const create = useCreateHold();
  const release = useReleaseHold();
  const [creating, setCreating] = useState(false);
  const [tenant, setTenant] = useState<TenantOption | null>(null);
  const [everyTenant, setEveryTenant] = useState(false);
  const [releasing, setReleasing] = useState<LegalHold | null>(null);
  useEffect(() => {
    if (creating) {
      setTenant(null);
      setEveryTenant(false);
    }
  }, [creating]);

  return (
    <div className="space-y-4">
      <ComplianceNav current="legal-hold" />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Legal holds</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">While a hold is active the tenant cannot be purged and erasure requests cannot run.</p>
        </div>
        <PermissionButton permission="trust.compliance.legal-hold.write" onClick={() => setCreating(true)} className="rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          Place a hold
        </PermissionButton>
      </header>
      <select aria-label="Hold status" value={status} onChange={(event) => setStatus(event.target.value as "ACTIVE" | "RELEASED" | "")} className="rounded-md border border-[var(--color-border)] px-2 py-1.5 text-sm">
        <option value="ACTIVE">Active</option>
        <option value="RELEASED">Released</option>
        <option value="">All</option>
      </select>
      {holds.isError ? <ConsoleApiErrorPanel error={holds.error} onRetry={() => void holds.refetch()} title="Unable to load legal holds" /> : null}
      <ul className="space-y-3">
        {(holds.data ?? []).map((hold) => (
          <li key={hold.id} data-testid="legal-hold" className="rounded-lg border border-[var(--color-border)] bg-white p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                {hold.tenant ? <TenantChip tenantId={hold.tenant.id} name={hold.tenant.name} slug={hold.tenant.slug} /> : <span className="font-semibold" data-testid="hold-global">Every tenant</span>}
                <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-xs font-semibold">{words(hold.status)}</span>
              </span>
              {hold.status === "ACTIVE" ? (
                <PermissionButton permission="trust.compliance.legal-hold.write" onClick={() => setReleasing(hold)} className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50">
                  Release
                </PermissionButton>
              ) : null}
            </div>
            <p className="mt-2">{hold.reason}</p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">Placed {new Date(hold.createdAt).toLocaleString()}</p>
            {hold.releasedAt ? (
              <p className="mt-1 text-xs text-[var(--color-text-muted)]" data-testid="hold-release">
                Released {new Date(hold.releasedAt).toLocaleString()} by {hold.releasedBy ?? "—"}: {hold.releaseReason ?? "no reason recorded"}
              </p>
            ) : null}
          </li>
        ))}
        {!holds.isLoading && !holds.isError && (holds.data ?? []).length === 0 ? <li className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">No legal holds here.</li> : null}
      </ul>

      <ActionDialog
        open={creating}
        title="Place a legal hold"
        description="The reason is recorded with the hold and shown to staff who try to purge or erase this tenant’s data."
        confirmLabel="Place hold"
        dangerous
        validate={() => (!everyTenant && !tenant ? "Choose a tenant." : null)}
        onSubmit={async (reason) => create.mutateAsync(everyTenant ? { appliesToAllTenants: true, reason } : { tenantId: tenant!.id, reason })}
        onClose={() => setCreating(false)}
      >
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={everyTenant} onChange={(event) => setEveryTenant(event.target.checked)} className="mt-0.5" />
          <span>
            Hold every tenant’s data
            <span className="block text-xs text-[var(--color-text-muted)]">Needs an approved JIT ROOT session (trust.iam.root, two approvers). Releasing it needs one too.</span>
          </span>
        </label>
        {everyTenant ? null : tenant ? (
          <p className="text-sm">
            Tenant: <TenantChip tenantId={tenant.id} name={tenant.name} slug={tenant.slug} />{" "}
            <button type="button" className="text-xs font-semibold text-[var(--fauward-navy)] hover:underline" onClick={() => setTenant(null)}>
              Change
            </button>
          </p>
        ) : (
          <TenantPicker label="Tenant" onSelect={setTenant} />
        )}
      </ActionDialog>
      <ActionDialog
        open={releasing !== null}
        title="Release this legal hold"
        description={releasing ? `${releasing.appliesToAllTenants ? "Every tenant" : releasing.tenant?.name ?? "Unknown tenant"}: ${releasing.reason}. Deletion and erasure become possible again.` : undefined}
        confirmLabel="Release"
        dangerous
        onSubmit={async (reason) => release.mutateAsync({ id: releasing!.id, reason })}
        onClose={() => setReleasing(null)}
      />
    </div>
  );
}

/** Every compliance export record: what was gathered, how big, whether the tenant downloaded it. */
export function ExportsPage() {
  const exports = useExports();
  return (
    <div className="space-y-4">
      <ComplianceNav current="exports" />
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Exports</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Bundles gathered for data requests. Erasure purges a request’s bundles.</p>
      </header>
      {exports.isError ? <ConsoleApiErrorPanel error={exports.error} onRetry={() => void exports.refetch()} title="Unable to load exports" /> : null}
      <section className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-[var(--color-surface-50)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
            <tr>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Tenant</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Size</th>
              <th className="px-3 py-2">Delivery</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {(exports.data ?? []).map((row) => (
              <tr key={row.id} data-testid="export-row">
                <td className="whitespace-nowrap px-3 py-2 text-xs">
                  {row.dsarId ? (
                    <Link to={`/trust/compliance/dsar/${row.dsarId}`} className="hover:underline">
                      {new Date(row.createdAt).toLocaleString()}
                    </Link>
                  ) : (
                    new Date(row.createdAt).toLocaleString()
                  )}
                </td>
                <td className="px-3 py-2">{row.tenant ? <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} /> : "—"}</td>
                <td className="px-3 py-2 text-xs">
                  {words(row.status)}
                  {row.error ? <span className="block text-red-700">{row.error}</span> : null}
                </td>
                <td className="px-3 py-2 text-xs">{row.byteSize === null ? "—" : `${row.byteSize} B`}</td>
                <td className="px-3 py-2 text-xs">{row.downloadedAt ? `Downloaded ${new Date(row.downloadedAt).toLocaleString()}` : row.tokenIssued ? "Link issued" : "Not delivered"}</td>
              </tr>
            ))}
            {!exports.isLoading && !exports.isError && (exports.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-sm text-[var(--color-text-muted)]">
                  No exports yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
