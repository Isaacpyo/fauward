import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { DegradedBanner } from "@/components/service-kit/DegradedBanner";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { apiErrorMessage } from "@/lib/console-api-error";
import { useCheckProvider, useIntegrationCredentials, useIntegrations, useProvider, useTenantGateways, type ProviderStatus } from "@/pillars/platform/integrations/api";

// platform.integrations (WP-4.3): IntegrationsListPage, ProviderDetailPage, TenantGatewaysPage, CredentialsPage.
// WebhookFailuresPage (WP-2.13) is in this folder too.

function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

const TONE: Record<string, string> = {
  NOT_CONFIGURED: "bg-slate-100 text-slate-700",
  OK: "bg-green-100 text-green-800",
  DEGRADED: "bg-amber-100 text-amber-900",
  DOWN: "bg-red-100 text-red-800",
  VERIFIED: "bg-green-100 text-green-800",
  UNVERIFIED: "bg-slate-100 text-slate-700",
  FAILED: "bg-red-100 text-red-800",
  DISABLED: "bg-slate-100 text-slate-700"
};

const LABEL: Record<ProviderStatus, string> = { NOT_CONFIGURED: "Not configured", OK: "OK", DEGRADED: "Degraded", DOWN: "Down" };

function Pill({ status, text }: { status: string; text?: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${TONE[status] ?? "bg-slate-100 text-slate-700"}`}>{text ?? LABEL[status as ProviderStatus] ?? status}</span>;
}

function percent(value: number | null) {
  return value === null ? "No data" : `${(value * 100).toFixed(1)}%`;
}

function IntegrationsNav({ active }: { active: "providers" | "gateways" | "webhooks" | "credentials" }) {
  const base = "rounded-md px-3 py-1.5 text-xs font-semibold";
  const item = (key: typeof active, to: string, text: string) => (
    <Link to={to} className={`${base} ${active === key ? "bg-[var(--fauward-navy)] text-white" : "border border-[var(--color-border)]"}`}>
      {text}
    </Link>
  );
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Integration sections">
      {item("providers", "/platform/integrations", "Providers")}
      {item("gateways", "/platform/integrations/tenant-gateways", "Tenant gateways")}
      {item("webhooks", "/platform/integrations/webhooks", "Webhook failures")}
      {item("credentials", "/platform/integrations/credentials", "Credentials")}
    </nav>
  );
}

export function IntegrationsListPage() {
  const integrations = useIntegrations();
  const rows = integrations.data?.data ?? [];
  const configured = rows.filter((row) => row.configured);
  const unconfigured = rows.filter((row) => !row.configured);
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Integration health</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Every {integrations.data?.pollEveryMinutes ?? 5} minutes each configured provider gets one cheap authenticated call. Degraded = it answers but at least 20% of the last 24 hours&apos; sends through it failed.
          </p>
        </div>
        <IntegrationsNav active="providers" />
      </header>
      {integrations.isError ? <ConsoleApiErrorPanel error={integrations.error} onRetry={() => void integrations.refetch()} title="Unable to load integrations" /> : null}
      {integrations.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading providers…</p> : null}
      {integrations.isSuccess && configured.length === 0 ? (
        <DegradedBanner variant="vendor-unconfigured" fixedBy="provider env vars">
          No provider is configured, so nothing is polled. Each row below names the variables that enable it.
        </DegradedBanner>
      ) : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-muted)]">
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Last success</th>
                <th className="px-3 py-2">Checked</th>
                <th className="px-3 py-2 text-right">Error rate 24 h</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {[...configured, ...unconfigured].map((row) => (
                <tr key={row.provider} data-testid="provider-row">
                  <td className="px-3 py-2">
                    <Link to={`/platform/integrations/${encodeURIComponent(row.provider)}`} className="font-semibold text-[var(--fauward-navy)] hover:underline">
                      {row.name}
                    </Link>
                    {!row.configured ? <p className="font-mono text-xs text-[var(--color-text-muted)]">Needs {row.missingEnv.join(", ")}</p> : null}
                    {row.configured && row.lastError && row.status !== "OK" ? <p className="text-xs text-red-700">{row.lastError.message}</p> : null}
                  </td>
                  <td className="px-3 py-2">
                    <Pill status={row.status} text={row.configured && !row.polled ? "Not polled yet" : undefined} />
                  </td>
                  <td className="px-3 py-2 text-xs">{when(row.lastSuccessfulAt)}</td>
                  <td className="px-3 py-2 text-xs">{when(row.checkedAt)}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">{row.configured && row.errorRateSource ? percent(row.errorRate24h) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function ProviderDetailPage() {
  const { provider = "" } = useParams();
  const detail = useProvider(provider);
  const check = useCheckProvider(provider);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const row = detail.data;

  async function runCheck() {
    setMessage(null);
    setError(null);
    try {
      const result = await check.mutateAsync();
      setMessage(`Checked: ${LABEL[result.status as ProviderStatus] ?? result.status}.`);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "The check did not run."));
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/platform/integrations" className="text-xs font-semibold text-[var(--color-text-muted)] hover:underline">
            Integration health
          </Link>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{row?.name ?? provider}</h1>
          {row ? (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <Pill status={row.status} />
              <span>Check: {row.check}</span>
              <span className="font-mono text-xs">{row.envNames.join(", ")}</span>
            </p>
          ) : null}
        </div>
        {row?.configured ? (
          <PermissionButton permission="platform.integrations.write" disabled={check.isPending} onClick={() => void runCheck()} className="rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            {check.isPending ? "Checking…" : "Check now"}
          </PermissionButton>
        ) : null}
      </header>
      {message ? (
        <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {detail.isError ? <ConsoleApiErrorPanel error={detail.error} onRetry={() => void detail.refetch()} title="Unable to load the provider" /> : null}
      {detail.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading…</p> : null}
      {row && !row.configured ? (
        <DegradedBanner variant="vendor-unconfigured" fixedBy={row.missingEnv.join(", ")}>
          {row.name} is not configured, so it is not polled. Set the variables named here on the backend to enable it.
        </DegradedBanner>
      ) : null}
      {row ? (
        <>
          <dl className="grid gap-3 rounded-lg border border-[var(--color-border)] bg-white p-4 text-sm sm:grid-cols-4" data-testid="provider-facts">
            <div>
              <dt className="text-xs font-semibold text-[var(--color-text-muted)]">Last success</dt>
              <dd>{when(row.lastSuccessfulAt)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-[var(--color-text-muted)]">Checked</dt>
              <dd>{when(row.checkedAt)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-[var(--color-text-muted)]">Error rate 24 h</dt>
              <dd>{row.errorRateSource ? `${percent(row.errorRate24h)} (${row.errorRateSource})` : "Not measured for this provider"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold text-[var(--color-text-muted)]">Last verified webhook</dt>
              <dd>{when(row.lastWebhookVerification?.verifiedAt ?? null)}</dd>
            </div>
          </dl>
          <section className="space-y-2 rounded-lg border border-[var(--color-border)] bg-white p-4">
            <h2 className="text-sm font-semibold">Recent errors</h2>
            {row.recentErrors.length === 0 ? <p className="text-xs text-[var(--color-text-muted)]">No failed checks in the recorded history.</p> : null}
            <ul className="space-y-1 text-sm">
              {row.recentErrors.map((entry) => (
                <li key={entry.at} data-testid="provider-error">
                  <span className="text-xs text-[var(--color-text-muted)]">{when(entry.at)}</span> · {entry.error}
                </li>
              ))}
            </ul>
          </section>
          <section className="space-y-2 rounded-lg border border-[var(--color-border)] bg-white p-4">
            <h2 className="text-sm font-semibold">Check history</h2>
            {row.history.length === 0 ? <p className="text-xs text-[var(--color-text-muted)]">{row.configured ? "Not polled yet; the poll runs every 5 minutes." : "Never polled."}</p> : null}
            {row.history.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-[var(--color-text-muted)]">
                    <th className="py-1">When</th>
                    <th className="py-1">Status</th>
                    <th className="py-1 text-right">Latency</th>
                  </tr>
                </thead>
                <tbody>
                  {row.history.map((entry) => (
                    <tr key={entry.at} data-testid="provider-history">
                      <td className="py-1 text-xs">{when(entry.at)}</td>
                      <td className="py-1">
                        <Pill status={entry.status} />
                      </td>
                      <td className="py-1 text-right text-xs tabular-nums">{entry.latencyMs} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

export function TenantGatewaysPage() {
  const [status, setStatus] = useState("");
  const gateways = useTenantGateways(status);
  const rows = gateways.data ?? [];
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Tenant payment gateways</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">The gateways tenants connected for their own customers. State only; keys stay encrypted with the tenant. A failed verification notifies the tenant&apos;s admins.</p>
        </div>
        <IntegrationsNav active="gateways" />
      </header>
      <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
        Status
        <select aria-label="Gateway status" value={status} onChange={(event) => setStatus(event.target.value)} className="mt-1 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
          <option value="">All</option>
          <option value="FAILED">Failed</option>
          <option value="UNVERIFIED">Not tested</option>
          <option value="VERIFIED">Verified</option>
          <option value="DISABLED">Disabled</option>
        </select>
      </label>
      {gateways.isError ? <ConsoleApiErrorPanel error={gateways.error} onRetry={() => void gateways.refetch()} title="Unable to load tenant gateways" /> : null}
      {gateways.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading…</p> : null}
      {gateways.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No tenant gateway matches.</p> : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-muted)]">
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2">Provider</th>
                <th className="px-3 py-2">Mode</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Last verified</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((row) => (
                <tr key={row.id} data-testid="gateway-row">
                  <td className="px-3 py-2">
                    <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {row.provider}
                    {row.enabled ? "" : " (off)"}
                  </td>
                  <td className="px-3 py-2 text-xs">{row.mode}</td>
                  <td className="px-3 py-2">
                    <Pill status={row.status} text={row.status === "UNVERIFIED" ? "Not tested" : undefined} />
                    {row.lastError ? <p className="text-xs text-red-700">{row.lastError}</p> : null}
                  </td>
                  <td className="px-3 py-2 text-xs">{when(row.lastVerifiedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function CredentialsPage() {
  const credentials = useIntegrationCredentials();
  const rows = credentials.data?.data ?? [];
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Integration credentials</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            The integration rows of the{" "}
            <Link to="/trust/secrets" className="underline">
              secret inventory
            </Link>
            : set or not, fingerprint and rotation. Values are never shown.
          </p>
        </div>
        <IntegrationsNav active="credentials" />
      </header>
      {credentials.isError ? <ConsoleApiErrorPanel error={credentials.error} onRetry={() => void credentials.refetch()} title="Unable to load credentials" /> : null}
      {credentials.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading…</p> : null}
      {credentials.isSuccess && rows.length === 0 ? (
        <DegradedBanner variant="not-wired" fixedBy="trust.secret-inventory">
          The secret inventory has not run yet, so no credentials are recorded. It runs when the backend starts and daily.
        </DegradedBanner>
      ) : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-muted)]">
                <th className="px-3 py-2">Credential</th>
                <th className="px-3 py-2">Integration</th>
                <th className="px-3 py-2">Set</th>
                <th className="px-3 py-2">Fingerprint</th>
                <th className="px-3 py-2">Last rotated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((row) => (
                <tr key={row.id} data-testid="credential-row">
                  <td className="px-3 py-2">
                    <Link to={`/trust/secrets/${encodeURIComponent(row.id)}`} className="font-semibold text-[var(--fauward-navy)] hover:underline">
                      {row.name}
                    </Link>
                    <p className="font-mono text-xs text-[var(--color-text-muted)]">{row.envName}</p>
                  </td>
                  <td className="px-3 py-2 text-xs">
                    <Link to={`/platform/integrations/${encodeURIComponent(row.integration ?? "")}`} className="underline">
                      {row.integration}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-xs">{row.configured ? "Yes" : "No"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.fingerprint ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{row.lastRotatedAt ? new Date(row.lastRotatedAt).toLocaleDateString() : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
