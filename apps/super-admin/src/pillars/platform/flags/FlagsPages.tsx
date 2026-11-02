import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { DataTree } from "@/components/service-kit/DataTree";
import { DegradedBanner } from "@/components/service-kit/DegradedBanner";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { TenantPicker, type TenantOption } from "@/components/service-kit/TenantPicker";
import { mirrorLabel, useCreateOverride, useFlag, useFlagAudit, useFlags, useReleases, useRevokeOverride, type FlagOverride, type MirrorStatus, type VendorStatus } from "@/pillars/platform/flags/api";

// platform.flags (WP-4.1): FlagsListPage, FlagDetailPage (overrides + LD mirror), FlagAuditPage, ReleasesPage.

function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function LaunchDarklyBanner({ status }: { status: VendorStatus | undefined }) {
  if (!status || status.configured) return null;
  return (
    <DegradedBanner variant="vendor-unconfigured" fixedBy={status.missing.join(", ")}>
      LaunchDarkly is not configured, so overrides are not mirrored. Native overrides are the source of truth and take effect immediately.
    </DegradedBanner>
  );
}

function mirrorMessage(mirror: MirrorStatus) {
  if (mirror.status === "MIRRORED") return " and mirrored to LaunchDarkly";
  if (mirror.status === "FAILED") return `; the LaunchDarkly mirror failed (${mirror.error ?? "vendor error"})`;
  return "";
}

function FlagsNav({ active }: { active: "flags" | "releases" }) {
  const base = "rounded-md px-3 py-1.5 text-xs font-semibold";
  return (
    <nav className="flex gap-2" aria-label="Flags sections">
      <Link to="/platform/flags" className={`${base} ${active === "flags" ? "bg-[var(--fauward-navy)] text-white" : "border border-[var(--color-border)]"}`}>
        Flags
      </Link>
      <Link to="/platform/releases" className={`${base} ${active === "releases" ? "bg-[var(--fauward-navy)] text-white" : "border border-[var(--color-border)]"}`}>
        Releases
      </Link>
    </nav>
  );
}

export function FlagsListPage() {
  const flags = useFlags();
  const rows = flags.data?.data ?? [];
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Feature flags</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Plan features from the plan catalogue and registered runtime flags. Per-tenant overrides change a tenant&apos;s entitlements immediately.</p>
        </div>
        <FlagsNav active="flags" />
      </header>
      <LaunchDarklyBanner status={flags.data?.launchDarkly} />
      {flags.isError ? <ConsoleApiErrorPanel error={flags.error} onRetry={() => void flags.refetch()} title="Unable to load flags" /> : null}
      {flags.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading flags…</p> : null}
      {flags.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No flags are defined.</p> : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-muted)]">
                <th className="px-3 py-2">Flag</th>
                <th className="px-3 py-2">Kind</th>
                <th className="px-3 py-2">Included in plans</th>
                <th className="px-3 py-2 text-right">Active overrides</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((flag) => (
                <tr key={flag.key} data-testid="flag-row">
                  <td className="px-3 py-2">
                    <Link to={`/platform/flags/${encodeURIComponent(flag.key)}`} className="font-mono text-xs font-semibold text-[var(--fauward-navy)] hover:underline">
                      {flag.key}
                    </Link>
                    {flag.description ? <p className="text-xs text-[var(--color-text-muted)]">{flag.description}</p> : null}
                  </td>
                  <td className="px-3 py-2 text-xs">{flag.kind === "plan-feature" ? "Plan feature" : "Runtime"}</td>
                  <td className="px-3 py-2 text-xs">{flag.plans.length ? flag.plans.join(", ") : "No plan"}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">
                    {flag.activeOverrides === 0 ? "None" : `${flag.activeOverrides} (${flag.enabledOverrides} on, ${flag.disabledOverrides} off)`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function overrideState(row: FlagOverride) {
  if (row.revokedAt) return "Revoked";
  if (!row.active) return "Expired";
  return "Active";
}

function AddOverrideDialog({ flagKey, open, onClose, onDone }: { flagKey: string; open: boolean; onClose: () => void; onDone: (message: string) => void }) {
  const create = useCreateOverride();
  const [tenant, setTenant] = useState<TenantOption | null>(null);
  const [enabled, setEnabled] = useState("true");
  const [expiresOn, setExpiresOn] = useState("");
  return (
    <ActionDialog
      open={open}
      dangerous
      title={`Override ${flagKey} for one tenant`}
      description="The tenant's entitlements change as soon as this is saved."
      confirmLabel="Save override"
      validate={() => (tenant ? null : "Choose a tenant.")}
      onSubmit={async (reason) => {
        if (!tenant) return;
        const result = await create.mutateAsync({ key: flagKey, tenantId: tenant.id, enabled: enabled === "true", expiresAt: expiresOn ? new Date(`${expiresOn}T23:59:59Z`).toISOString() : null, reason });
        onDone(`${flagKey} ${enabled === "true" ? "enabled" : "disabled"} for ${tenant.name}${mirrorMessage(result.mirror)}.`);
        setTenant(null);
        setExpiresOn("");
      }}
      onClose={onClose}
    >
      {tenant ? (
        <p className="text-sm">
          Tenant: <TenantChip tenantId={tenant.id} name={tenant.name} slug={tenant.slug} />{" "}
          <button type="button" className="text-xs underline" onClick={() => setTenant(null)}>
            change
          </button>
        </p>
      ) : (
        <TenantPicker onSelect={setTenant} />
      )}
      <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
        Value
        <select value={enabled} onChange={(event) => setEnabled(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
          <option value="true">Enabled</option>
          <option value="false">Disabled</option>
        </select>
      </label>
      <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
        Expires on (optional, UTC)
        <input type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" />
      </label>
    </ActionDialog>
  );
}

export function FlagDetailPage() {
  const { key = "" } = useParams();
  const detail = useFlag(key);
  const revoke = useRevokeOverride();
  const [adding, setAdding] = useState(false);
  const [revoking, setRevoking] = useState<FlagOverride | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const rows = detail.data?.overrides ?? [];
  const failed = rows.filter((row) => row.active && row.mirror?.status === "FAILED");

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/platform/flags" className="text-xs font-semibold text-[var(--color-text-muted)] hover:underline">
            Feature flags
          </Link>
          <h1 className="font-mono text-xl font-bold text-[var(--color-text-primary)]">{key}</h1>
          {detail.data ? (
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {detail.data.flag.kind === "plan-feature" ? `Plan feature · included in ${detail.data.flag.plans.length ? detail.data.flag.plans.join(", ") : "no plan"}` : "Runtime flag"} ·{" "}
              <Link to={`/platform/flags/${encodeURIComponent(key)}/audit`} className="underline">
                Audit trail
              </Link>
            </p>
          ) : null}
        </div>
        {detail.data?.flag.kind === "plan-feature" ? (
          <PermissionButton permission="platform.flags.write" onClick={() => setAdding(true)} className="rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            Add override
          </PermissionButton>
        ) : null}
      </header>
      {message ? (
        <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {message}
        </p>
      ) : null}
      <LaunchDarklyBanner status={detail.data?.launchDarkly} />
      {failed.length > 0 ? (
        <DegradedBanner variant="vendor-error" fixedBy="LaunchDarkly">
          {failed.length} active override{failed.length === 1 ? "" : "s"} could not be mirrored to LaunchDarkly. The native overrides are in force; LaunchDarkly evaluations for {failed.length === 1 ? "that tenant" : "those tenants"} may differ.
        </DegradedBanner>
      ) : null}
      {detail.isError ? <ConsoleApiErrorPanel error={detail.error} onRetry={() => void detail.refetch()} title="Unable to load the flag" /> : null}
      {detail.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading overrides…</p> : null}
      {detail.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No tenant has an override for this flag; every tenant gets its plan&apos;s value.</p> : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-muted)]">
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2">Value</th>
                <th className="px-3 py-2">State</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Expires</th>
                <th className="px-3 py-2">Set by</th>
                <th className="px-3 py-2">LaunchDarkly</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((row) => (
                <tr key={row.id} data-testid="override-row" className="align-top">
                  <td className="px-3 py-2">
                    <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} />
                  </td>
                  <td className="px-3 py-2 text-xs font-semibold">{row.enabled ? "Enabled" : "Disabled"}</td>
                  <td className="px-3 py-2 text-xs">{overrideState(row)}</td>
                  <td className="px-3 py-2 text-xs">{row.reason}</td>
                  <td className="px-3 py-2 text-xs">{row.expiresAt ? when(row.expiresAt) : "Never"}</td>
                  <td className="px-3 py-2 text-xs">
                    {row.createdBy.email ?? row.createdBy.id}
                    <p className="text-[var(--color-text-muted)]">{when(row.createdAt)}</p>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {mirrorLabel(row.mirror)}
                    {row.mirror?.status === "FAILED" && row.mirror.error ? <p className="text-red-700">{row.mirror.error}</p> : null}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {row.active ? (
                      <PermissionButton permission="platform.flags.write" onClick={() => setRevoking(row)} className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold disabled:opacity-50">
                        Revoke
                      </PermissionButton>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <AddOverrideDialog flagKey={key} open={adding} onClose={() => setAdding(false)} onDone={setMessage} />
      <ActionDialog
        open={revoking !== null}
        dangerous
        title={revoking ? `Revoke ${key} override for ${revoking.tenant.name}` : "Revoke override"}
        description="The tenant goes back to its plan's value immediately."
        confirmLabel="Revoke"
        onSubmit={async (reason) => {
          if (!revoking) return;
          const result = await revoke.mutateAsync({ key, id: revoking.id, reason });
          setMessage(`Override for ${revoking.tenant.name} revoked${mirrorMessage(result.mirror)}.`);
        }}
        onClose={() => setRevoking(null)}
      />
    </div>
  );
}

export function FlagAuditPage() {
  const { key = "" } = useParams();
  const audit = useFlagAudit(key);
  const rows = audit.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <div className="space-y-4">
      <header>
        <Link to={`/platform/flags/${encodeURIComponent(key)}`} className="text-xs font-semibold text-[var(--color-text-muted)] hover:underline">
          {key}
        </Link>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Audit trail</h1>
      </header>
      {audit.isError ? <ConsoleApiErrorPanel error={audit.error} onRetry={() => void audit.refetch()} title="Unable to load the audit trail" /> : null}
      {audit.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading…</p> : null}
      {audit.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No override has been set or revoked for this flag.</p> : null}
      {rows.length > 0 ? (
        <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white">
          {rows.map((row) => (
            <li key={row.id} data-testid="flag-audit-row" className="space-y-1 px-3 py-2 text-sm">
              <p>
                <span className="font-semibold">{row.action === "TENANT_FEATURE_OVERRIDE" ? "Override set" : "Override revoked"}</span>
                {row.tenant ? (
                  <>
                    {" "}
                    for <TenantChip tenantId={row.tenant.id} name={row.tenant.name ?? row.tenant.id} slug={row.tenant.slug} />
                  </>
                ) : null}{" "}
                by {row.actorEmail ?? row.actorId} · {when(row.createdAt)}
              </p>
              {row.reason ? <p className="text-xs text-[var(--color-text-muted)]">{row.reason}</p> : null}
              <DataTree value={row.metadata} />
            </li>
          ))}
        </ul>
      ) : null}
      {audit.hasNextPage ? (
        <button type="button" onClick={() => void audit.fetchNextPage()} disabled={audit.isFetchingNextPage} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
          {audit.isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </div>
  );
}

const CONSOLE_COMMIT = String(import.meta.env.VITE_GIT_COMMIT ?? "");
const CONSOLE_BUILD_TIME = String(import.meta.env.VITE_BUILD_TIME ?? "");

export function ReleasesPage() {
  const releases = useReleases();
  const data = releases.data;
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Releases</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">What is deployed now, and the release history when GitHub is connected.</p>
        </div>
        <FlagsNav active="releases" />
      </header>
      {releases.isError ? <ConsoleApiErrorPanel error={releases.error} onRetry={() => void releases.refetch()} title="Unable to load releases" /> : null}
      {releases.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading…</p> : null}
      {data ? (
        <section className="grid gap-3 md:grid-cols-2" aria-label="Deployed versions">
          <div className="rounded-lg border border-[var(--color-border)] bg-white p-4 text-sm" data-testid="backend-version">
            <h2 className="text-xs font-semibold uppercase text-[var(--color-text-muted)]">Backend</h2>
            <p className="mt-1">Version: {data.backend.version ?? "APP_VERSION not set"}</p>
            <p className="font-mono text-xs">Commit: {data.backend.commit ?? "GIT_COMMIT not set"}</p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-white p-4 text-sm" data-testid="console-version">
            <h2 className="text-xs font-semibold uppercase text-[var(--color-text-muted)]">Console</h2>
            <p className="font-mono text-xs">Commit: {CONSOLE_COMMIT || "not set at build time"}</p>
            <p className="text-xs">Built: {CONSOLE_BUILD_TIME ? new Date(CONSOLE_BUILD_TIME).toLocaleString() : "unknown"}</p>
          </div>
        </section>
      ) : null}
      {data?.github ? (
        <DegradedBanner variant="vendor-unconfigured" fixedBy={data.github.missing.join(", ")}>
          GitHub is not connected, so only the deployed versions are shown.
        </DegradedBanner>
      ) : null}
      {data?.source === "github" && data.releases.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">The repository has no releases.</p> : null}
      {data?.source === "github" && data.releases.length > 0 ? (
        <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white">
          {data.releases.map((release) => (
            <li key={release.id} data-testid="release-row" className="px-3 py-2 text-sm">
              <a href={release.url} target="_blank" rel="noreferrer" className="font-semibold text-[var(--fauward-navy)] hover:underline">
                {release.name || release.tagName}
              </a>{" "}
              <span className="font-mono text-xs">{release.tagName}</span>
              {release.prerelease ? <span className="ml-2 text-xs text-amber-700">pre-release</span> : null}
              <p className="text-xs text-[var(--color-text-muted)]">{when(release.publishedAt)}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
