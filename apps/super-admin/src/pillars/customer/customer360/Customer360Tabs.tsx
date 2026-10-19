import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { usePermission } from "@fauward/internal-rbac";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { MoneyCell } from "@/components/service-kit/MoneyCell";
import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { consoleApi } from "@/lib/console-api";
import { toConsoleApiError } from "@/lib/console-api-error";
import { severityTone, useActivityFeed } from "@/lib/activity";
import { C360_KEY, useC360, type C360Ai } from "./api";

const card = "rounded-lg border border-[var(--color-border)] bg-white p-4";
const th = "py-1 text-left text-xs font-semibold text-[var(--color-text-muted)]";

function when(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

function limitText(value: number) {
  return value === -1 ? "Unlimited" : String(value);
}

/** Loading / error / data for one tab; a failing endpoint only affects its own tab (ACC-C360-1). */
function TabQuery<T>({ query, label, children }: { query: { isLoading: boolean; isError: boolean; error: unknown; data: T | undefined; refetch: () => unknown }; label: string; children: (data: T) => ReactNode }) {
  if (query.isLoading) return <p className="text-sm text-[var(--color-text-muted)]">Loading {label}…</p>;
  if (query.isError) return <ConsoleApiErrorPanel error={query.error} onRetry={() => void query.refetch()} title={`Unable to load ${label}`} />;
  if (query.data === undefined) return null;
  return <>{children(query.data)}</>;
}

export function OverviewTab({ tenantId }: { tenantId: string }) {
  const summary = useC360(tenantId, "summary");
  return (
    <TabQuery query={summary} label="the overview">
      {(data) => (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={card}>
            <h2 className="text-sm font-semibold">Account</h2>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <dt className="text-[var(--color-text-muted)]">Effective plan</dt>
              <dd>
                {data.plan.effectivePlan}
                {data.plan.effectivePlan !== data.plan.billingPlan ? ` (billing ${data.plan.billingPlan})` : ""}
              </dd>
              <dt className="text-[var(--color-text-muted)]">Subscription</dt>
              <dd>{data.subscription ? `${data.subscription.billingCycle.toLowerCase()} · ${data.subscription.status}` : "None"}</dd>
              <dt className="text-[var(--color-text-muted)]">KYC</dt>
              <dd>{data.kycStatus}</dd>
              <dt className="text-[var(--color-text-muted)]">Active staff</dt>
              <dd>{data.activeStaff}</dd>
              <dt className="text-[var(--color-text-muted)]">Open tickets</dt>
              <dd>{data.openTickets}</dd>
              <dt className="text-[var(--color-text-muted)]">Customer since</dt>
              <dd>{when(data.identity.createdAt)}</dd>
            </dl>
          </section>
          <section className={card}>
            <h2 className="text-sm font-semibold">Suspensions</h2>
            {data.activeSuspensions.length === 0 ? <p className="mt-2 text-sm text-[var(--color-text-muted)]">No active suspension.</p> : null}
            <ul className="mt-2 space-y-1 text-sm">
              {data.activeSuspensions.map((suspension) => (
                <li key={suspension.id}>
                  {suspension.source} · {suspension.category} since {when(suspension.createdAt)}
                </li>
              ))}
            </ul>
            <Link to={`/platform/tenants/${data.identity.id}?tab=suspensions`} className="mt-2 inline-block text-xs font-semibold text-[var(--fauward-navy)] hover:underline">
              Manage on the tenant page
            </Link>
          </section>
        </div>
      )}
    </TabQuery>
  );
}

export function UsageTab({ tenantId }: { tenantId: string }) {
  const usage = useC360(tenantId, "usage");
  return (
    <TabQuery query={usage} label="usage">
      {(data) => (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className={`${card} lg:col-span-2`}>
            <h2 className="text-sm font-semibold">Last 12 months</h2>
            <table className="mt-2 min-w-full text-sm">
              <thead>
                <tr>
                  <th className={th}>Month</th>
                  <th className={`${th} text-right`}>Shipments</th>
                  <th className={`${th} text-right`}>API calls</th>
                  <th className={`${th} text-right`}>SMS</th>
                  <th className={`${th} text-right`}>Emails</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {data.months.map((row) => (
                  <tr key={row.month}>
                    <td className="py-1 font-mono text-xs">{row.month}</td>
                    <td className="py-1 text-right tabular-nums">{row.shipments}</td>
                    <td className="py-1 text-right tabular-nums">{row.apiCalls}</td>
                    <td className="py-1 text-right tabular-nums">{row.smsSent}</td>
                    <td className="py-1 text-right tabular-nums">{row.emailsSent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className={card}>
            <h2 className="text-sm font-semibold">Limits vs usage</h2>
            <p className="text-xs text-[var(--color-text-muted)]">{data.limitsSource === "tenant" ? "Limits set by Fauward staff." : "Limits from the plan."}</p>
            <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <dt className="text-[var(--color-text-muted)]">Shipments this month</dt>
              <dd>
                {data.current.shipmentsThisMonth} / {limitText(data.limits.maxShipmentsPm)}
              </dd>
              <dt className="text-[var(--color-text-muted)]">Staff</dt>
              <dd>
                {data.current.staff} / {limitText(data.limits.maxStaff)}
              </dd>
              <dt className="text-[var(--color-text-muted)]">Shipments all time</dt>
              <dd>{data.shipmentsTotal}</dd>
              <dt className="text-[var(--color-text-muted)]">API calls (30 days)</dt>
              <dd>
                {data.api.callsLast30Days} ({data.api.errorsLast30Days} errors)
              </dd>
              <dt className="text-[var(--color-text-muted)]">API keys</dt>
              <dd>{data.api.keys.filter((key) => key.isActive).length} active</dd>
            </dl>
          </section>
        </div>
      )}
    </TabQuery>
  );
}

export function BillingTab({ tenantId }: { tenantId: string }) {
  const billing = useC360(tenantId, "billing");
  return (
    <TabQuery query={billing} label="billing">
      {(data) => (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={card}>
            <h2 className="text-sm font-semibold">Invoices from Fauward ({data.invoiceCount})</h2>
            {data.invoices.length === 0 ? <p className="mt-2 text-sm text-[var(--color-text-muted)]">Fauward has not invoiced this tenant.</p> : null}
            <ul className="mt-2 divide-y divide-[var(--color-border)] text-sm">
              {data.invoices.map((invoice) => (
                <li key={invoice.id} className="flex justify-between gap-2 py-1">
                  <Link to={`/revenue/billing/invoices/${invoice.id}`} className="font-mono text-xs underline">
                    {invoice.invoiceNumber}
                  </Link>
                  <span className="text-xs">{invoice.status}</span>
                  <MoneyCell amount={invoice.total} currency={invoice.currency} />
                </li>
              ))}
            </ul>
          </section>
          <section className={card}>
            <h2 className="text-sm font-semibold">Subscription and dunning</h2>
            <p className="mt-2 text-sm">{data.subscription ? `${data.subscription.plan} · ${data.subscription.billingCycle.toLowerCase()} · ${data.subscription.status}${data.subscription.cancelAtPeriodEnd ? " · cancels at period end" : ""}` : "No subscription."}</p>
            <h3 className="mt-3 text-xs font-semibold text-[var(--color-text-muted)]">Dunning events</h3>
            {data.dunning.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">None.</p> : null}
            <ul className="text-xs">
              {data.dunning.map((event) => (
                <li key={event.id}>
                  {event.eventType} (attempt {event.attempt}) · {when(event.createdAt)}
                </li>
              ))}
            </ul>
            <h3 className="mt-3 text-xs font-semibold text-[var(--color-text-muted)]">Save offers</h3>
            {data.saveOffers.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">None.</p> : null}
            <ul className="text-xs">
              {data.saveOffers.map((offer) => (
                <li key={offer.id}>
                  {offer.discount}% · {offer.status} · until {when(offer.expiresAt)}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </TabQuery>
  );
}

export function TicketsTab({ tenantId }: { tenantId: string }) {
  const tickets = useC360(tenantId, "tickets");
  return (
    <TabQuery query={tickets} label="tickets">
      {(data) => (
        <section className={card}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">{data.total} ticket(s) with Fauward</h2>
            <Link to={`/customer/support?tenantId=${encodeURIComponent(tenantId)}&view=all`} className="text-xs font-semibold text-[var(--fauward-navy)] hover:underline">
              Open in Support Desk
            </Link>
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            {Object.entries(data.byStatus)
              .map(([status, count]) => `${status}: ${count}`)
              .join(" · ") || "No tickets with Fauward."}
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            The tenant&apos;s own customer desk: {data.endCustomer.open} open of {data.endCustomer.total}.
          </p>
          <ul className="mt-2 divide-y divide-[var(--color-border)] text-sm">
            {data.tickets.map((ticket) => (
              <li key={ticket.id} className="py-1" data-testid="c360-ticket-row">
                <Link to={`/customer/support/tickets/${ticket.id}`} className="font-mono text-xs font-semibold text-[var(--fauward-navy)] hover:underline">
                  {ticket.ticketNumber}
                </Link>{" "}
                · {ticket.subject} · {ticket.status} · {ticket.priority}
              </li>
            ))}
          </ul>
        </section>
      )}
    </TabQuery>
  );
}

export function HealthTab({ tenantId }: { tenantId: string }) {
  const health = useC360(tenantId, "health");
  return (
    <TabQuery query={health} label="health">
      {(data) =>
        data.latest ? (
          <section className={card}>
            <h2 className="text-sm font-semibold">
              Score {data.latest.score} ({data.latest.trend}) · {when(data.latest.computedAt)}
            </h2>
            <pre className="mt-2 overflow-auto rounded bg-[var(--color-surface-50)] p-2 text-xs">{Array.isArray(data.latest.factors) ? data.latest.factors.join("\n") : JSON.stringify(data.latest.factors, null, 2)}</pre>
            <p className="mt-2 text-xs text-[var(--color-text-muted)]">{data.history.length} score(s) in the last 90 days.</p>
          </section>
        ) : (
          <p className={card} data-testid="health-not-scored">
            Not yet scored.
          </p>
        )
      }
    </TabQuery>
  );
}

function limitInput(value: number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

/** L16 (WP-2.10): staff set the tenant's AI budget/request limits; dangerous (reason + fresh MFA); tenant admins are told. */
function AiLimitDialog({ tenantId, data, open, onClose }: { tenantId: string; data: C360Ai; open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [budget, setBudget] = useState("");
  const [flash, setFlash] = useState("");
  const [pro, setPro] = useState("");
  const [features, setFeatures] = useState<string[]>([]);
  useEffect(() => {
    if (!open) return;
    setBudget(data.limit?.monthlyBudgetUsd ?? "");
    setFlash(limitInput(data.limit?.flashRequestLimit));
    setPro(limitInput(data.limit?.proRequestLimit));
    setFeatures(data.limit?.featuresEnabled ?? []);
  }, [open, data.limit]);
  const toLimit = (value: string) => (value.trim() === "" ? null : Number(value.trim()));
  return (
    <ActionDialog
      open={open}
      dangerous
      title="Set AI limit"
      description={`This month: ${data.currentMonth.costUsd} USD over ${data.currentMonth.requests} requests. The gateway refuses runs once a limit is reached; the tenant's admins are told.`}
      confirmLabel="Save AI limit"
      validate={() => {
        if (budget.trim() !== "" && !/^\d{1,10}(\.\d{1,2})?$/.test(budget.trim())) return "Budget must be a USD amount with up to 2 decimals.";
        if ([flash, pro].some((value) => value.trim() !== "" && !/^\d+$/.test(value.trim()))) return "Request limits must be whole numbers.";
        return null;
      }}
      onSubmit={async (reason) => {
        await consoleApi.put(`/tenants/${encodeURIComponent(tenantId)}/ai-limit`, {
          monthlyBudgetUsd: budget.trim() === "" ? null : budget.trim(),
          flashRequestLimit: toLimit(flash),
          proRequestLimit: toLimit(pro),
          featuresEnabled: features,
          reason
        });
        await queryClient.invalidateQueries({ queryKey: [...C360_KEY, "ai", tenantId] });
      }}
      onClose={onClose}
    >
      <div className="grid gap-3 text-sm">
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-[var(--color-text-muted)]">Monthly budget in USD (empty = none)</span>
          <input aria-label="Monthly budget (USD)" value={budget} onChange={(event) => setBudget(event.target.value)} inputMode="decimal" className="rounded-md border border-[var(--color-border)] px-2 py-1" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-[var(--color-text-muted)]">Standard requests per month (empty = none)</span>
          <input aria-label="Standard requests per month" value={flash} onChange={(event) => setFlash(event.target.value)} inputMode="numeric" className="rounded-md border border-[var(--color-border)] px-2 py-1" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-[var(--color-text-muted)]">Advanced requests per month (empty = none)</span>
          <input aria-label="Advanced requests per month" value={pro} onChange={(event) => setPro(event.target.value)} inputMode="numeric" className="rounded-md border border-[var(--color-border)] px-2 py-1" />
        </label>
        <fieldset>
          <legend className="text-xs font-semibold text-[var(--color-text-muted)]">Allowed features (none selected = all)</legend>
          <div className="mt-1 grid max-h-40 grid-cols-2 gap-1 overflow-y-auto text-xs">
            {data.featureKeys.map((key) => (
              <label key={key} className="flex items-center gap-1">
                <input type="checkbox" checked={features.includes(key)} onChange={(event) => setFeatures((previous) => (event.target.checked ? [...previous, key] : previous.filter((item) => item !== key)))} />
                {key}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </ActionDialog>
  );
}

export function AiTab({ tenantId }: { tenantId: string }) {
  const ai = useC360(tenantId, "ai");
  const [editing, setEditing] = useState(false);
  return (
    <TabQuery query={ai} label="AI usage">
      {(data) => (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={card} data-testid="c360-ai-limit">
            <h2 className="text-sm font-semibold">AI limit</h2>
            <p className="mt-1 text-sm">
              This month ({data.currentMonth.month}): {data.currentMonth.costUsd} USD · {data.currentMonth.requests} requests
            </p>
            {data.limit ? (
              <dl className="mt-2 grid grid-cols-2 gap-1 text-xs">
                <dt className="text-[var(--color-text-muted)]">Monthly budget</dt>
                <dd>{data.limit.monthlyBudgetUsd === null ? "None" : `${data.limit.monthlyBudgetUsd} USD`}</dd>
                <dt className="text-[var(--color-text-muted)]">Standard requests</dt>
                <dd>{data.limit.flashRequestLimit ?? "None"}</dd>
                <dt className="text-[var(--color-text-muted)]">Advanced requests</dt>
                <dd>{data.limit.proRequestLimit ?? "None"}</dd>
                <dt className="text-[var(--color-text-muted)]">Features</dt>
                <dd>{data.limit.featuresEnabled.length === 0 ? "All" : data.limit.featuresEnabled.join(", ")}</dd>
                <dt className="text-[var(--color-text-muted)]">Last set</dt>
                <dd>
                  {when(data.limit.updatedAt)}
                  {data.limit.reason ? ` · ${data.limit.reason}` : ""}
                </dd>
              </dl>
            ) : (
              <p className="mt-2 text-xs text-[var(--color-text-muted)]">No AI limit set for this tenant.</p>
            )}
            <PermissionButton permission="platform.tenants.write" onClick={() => setEditing(true)} className="mt-3 rounded-md border border-[var(--color-border)] px-3 py-1 text-xs font-semibold disabled:opacity-50">
              Set AI limit
            </PermissionButton>
            <AiLimitDialog tenantId={tenantId} data={data} open={editing} onClose={() => setEditing(false)} />
          </section>
          <section className={card}>
            <h2 className="text-sm font-semibold">Usage by month and feature</h2>
            {data.usage.length === 0 ? <p className="mt-2 text-sm text-[var(--color-text-muted)]">No AI usage in the last 6 months.</p> : null}
            <ul className="mt-2 text-xs">
              {data.usage.map((row) => (
                <li key={row.id}>
                  {row.month} · {row.feature} · {row.model}: {row.requestCount} requests, {row.tokenCount} tokens, {row.costUsd.toFixed(2)} USD
                </li>
              ))}
            </ul>
          </section>
          <section className={card}>
            <h2 className="text-sm font-semibold">Agent runs ({data.runCount})</h2>
            {data.runs.length === 0 ? <p className="mt-2 text-sm text-[var(--color-text-muted)]">No agent runs yet.</p> : null}
            <ul className="mt-2 text-xs">
              {data.runs.map((run) => (
                <li key={run.id}>
                  {run.agentType} · {run.status} · {when(run.createdAt)}
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </TabQuery>
  );
}

export function AuditTab({ tenantId }: { tenantId: string }) {
  const audit = useC360(tenantId, "audit");
  return (
    <TabQuery query={audit} label="the audit trail">
      {(data) => (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={card}>
            <h2 className="text-sm font-semibold">Tenant audit log</h2>
            <ul className="mt-2 divide-y divide-[var(--color-border)] text-xs">
              {data.tenantAudit.map((row) => (
                <li key={row.id} className="py-1">
                  {when(row.timestamp)} · {row.action} · {row.actorType}
                  {row.resourceType ? ` · ${row.resourceType}` : ""}
                </li>
              ))}
            </ul>
            {data.tenantAudit.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No tenant audit entries.</p> : null}
          </section>
          <section className={card}>
            <h2 className="text-sm font-semibold">Fauward staff actions on this tenant</h2>
            <ul className="mt-2 divide-y divide-[var(--color-border)] text-xs">
              {data.platformAudit.map((row) => (
                <li key={row.id} className="py-1">
                  {when(row.createdAt)} · {row.action} · {row.actorEmail ?? "system"}
                  {row.reason ? ` — ${row.reason}` : ""}
                </li>
              ))}
            </ul>
            {data.platformAudit.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No staff actions recorded.</p> : null}
          </section>
        </div>
      )}
    </TabQuery>
  );
}

export function PeopleTab({ tenantId }: { tenantId: string }) {
  const people = useC360(tenantId, "people");
  return (
    <TabQuery query={people} label="people">
      {(data) => (
        <section className={card}>
          <h2 className="text-sm font-semibold">{data.total} user(s)</h2>
          <table className="mt-2 min-w-full text-sm">
            <thead>
              <tr>
                <th className={th}>User</th>
                <th className={th}>Role</th>
                <th className={th}>Status</th>
                <th className={th}>MFA</th>
                <th className={th}>Last sign-in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {data.users.map((user) => (
                <tr key={user.id}>
                  <td className="py-1">
                    {[user.firstName, user.lastName].filter(Boolean).join(" ") || "—"} <span className="block font-mono text-xs text-[var(--color-text-muted)]">{user.email}</span>
                  </td>
                  <td className="py-1 text-xs">{user.role}</td>
                  <td className="py-1 text-xs">{user.isActive ? "Active" : "Inactive"}</td>
                  <td className="py-1 text-xs">{user.mfaEnabled ? "On" : "Off"}</td>
                  <td className="py-1 text-xs">{when(user.lastLogin)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </TabQuery>
  );
}

function ConfigList({ title, values }: { title: string; values: Record<string, unknown> | null }) {
  return (
    <section className={card}>
      <h2 className="text-sm font-semibold">{title}</h2>
      {values ? (
        <dl className="mt-2 grid grid-cols-2 gap-1 text-xs">
          {Object.entries(values).map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="text-[var(--color-text-muted)]">{key}</dt>
              <dd className="break-all">{Array.isArray(value) ? value.join(", ") || "—" : value === null || value === "" ? "—" : String(value)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-2 text-sm text-[var(--color-text-muted)]">Not set up.</p>
      )}
    </section>
  );
}

/** L9 (WP-2.13): revoke a compromised key at once (dangerous); the tenant's admins are told the reason. */
function RevokeApiKeyButton({ tenantId, keyId, keyPrefix }: { tenantId: string; keyId: string; keyPrefix: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  return (
    <>
      <PermissionButton permission="platform.tenants.write" onClick={() => setOpen(true)} className="ml-2 rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[11px] font-semibold disabled:opacity-50">
        Revoke
      </PermissionButton>
      <ActionDialog
        open={open}
        dangerous
        title={`Revoke API key ${keyPrefix}…`}
        description="The key stops working immediately. The tenant's admins get your reason in-app and by email."
        confirmLabel="Revoke key"
        onSubmit={async (reason) => {
          await consoleApi.post(`/tenants/${encodeURIComponent(tenantId)}/api-keys/${encodeURIComponent(keyId)}/revoke`, { reason });
          await queryClient.invalidateQueries({ queryKey: [...C360_KEY, "config", tenantId] });
        }}
        onClose={() => setOpen(false)}
      />
    </>
  );
}

export function ConfigTab({ tenantId }: { tenantId: string }) {
  const config = useC360(tenantId, "config");
  return (
    <TabQuery query={config} label="configuration">
      {(data) => (
        <div className="grid gap-4 lg:grid-cols-2" data-testid="c360-config">
          <ConfigList title="General" values={data.general} />
          <ConfigList title="Branding" values={data.branding} />
          <ConfigList title="Domains" values={data.domains} />
          <ConfigList title="Notifications" values={data.notifications} />
          <section className={card} data-testid="c360-gateways">
            <h2 className="text-sm font-semibold">Payment gateways</h2>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              Default {data.payments.activeProvider ?? "—"} · {data.payments.currency}
            </p>
            {data.payments.gateways.length === 0 ? <p className="mt-2 text-sm text-[var(--color-text-muted)]">No gateway set up.</p> : null}
            <ul className="mt-2 space-y-1 text-xs">
              {data.payments.gateways.map((gateway) => (
                <li key={gateway.provider}>
                  <span className="font-semibold">{gateway.provider}</span> · {gateway.mode.toLowerCase()} · {gateway.enabled ? gateway.status : "disabled"} · key {gateway.secretConfigured ? "configured (hidden)" : "not configured"}
                  {gateway.lastVerifiedAt ? ` · verified ${when(gateway.lastVerifiedAt)}` : ""}
                  {gateway.lastError ? <span className="block text-red-700">{gateway.lastError}</span> : null}
                </li>
              ))}
            </ul>
          </section>
          <section className={card}>
            <h2 className="text-sm font-semibold">API keys and webhooks</h2>
            <ul className="mt-2 text-xs">
              {data.apiKeys.map((key) => (
                <li key={key.id} data-testid="c360-api-key">
                  <span className="font-mono">{key.keyPrefix}…</span> {key.name ?? ""} · {key.isActive ? "active" : key.revokedByType === "STAFF" ? `revoked by Fauward${key.revokedReason ? `: ${key.revokedReason}` : ""}` : "revoked"} · last used {when(key.lastUsedAt)}
                  {key.isActive ? <RevokeApiKeyButton tenantId={tenantId} keyId={key.id} keyPrefix={key.keyPrefix} /> : null}
                </li>
              ))}
              {data.webhooks.map((hook) => (
                <li key={hook.id}>
                  {hook.url} · {hook.isActive ? "active" : "off"} · {hook.failuresLast30Days} failure(s) in 30 days
                </li>
              ))}
            </ul>
            {data.apiKeys.length === 0 && data.webhooks.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No API keys or webhooks.</p> : null}
          </section>
        </div>
      )}
    </TabQuery>
  );
}

export function NotesTab({ tenantId }: { tenantId: string }) {
  const notes = useC360(tenantId, "notes");
  const canEdit = usePermission(["platform.tenants.write", "customer.success.write"]) === true;
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  useEffect(() => setValue(notes.data?.internalNotes ?? ""), [notes.data?.internalNotes]);
  const save = useMutation({
    mutationFn: async () => (await consoleApi.patch(`/tenants/${encodeURIComponent(tenantId)}/internal-notes`, { internalNotes: value })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...C360_KEY, "notes", tenantId] })
  });
  return (
    <TabQuery query={notes} label="notes">
      {(data) => (
        <section className={card}>
          <textarea aria-label="Internal notes" rows={8} disabled={!canEdit} value={value} onChange={(event) => setValue(event.target.value)} className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm disabled:bg-[var(--color-surface-50)]" />
          {save.isError ? <p className="text-xs text-red-700">{toConsoleApiError(save.error).message}</p> : null}
          {save.isSuccess ? <p role="status" className="text-xs text-green-700">Notes saved.</p> : null}
          <button
            type="button"
            disabled={!canEdit || value === data.internalNotes || save.isPending}
            title={canEdit ? undefined : "Requires platform.tenants.write or customer.success.write"}
            onClick={() => save.mutate()}
            className="mt-2 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : "Save notes"}
          </button>
        </section>
      )}
    </TabQuery>
  );
}

export function ActivityTab({ tenantId }: { tenantId: string }) {
  const feed = useActivityFeed(`/customer360/${encodeURIComponent(tenantId)}/activity`);
  if (feed.isLoading) return <p className="text-sm text-[var(--color-text-muted)]">Loading activity…</p>;
  if (feed.isError) return <ConsoleApiErrorPanel error={feed.error} onRetry={() => void feed.refetch()} title="Unable to load activity" />;
  const rows = feed.data?.pages.flatMap((page) => page.data) ?? [];
  return (
    <section className={card} data-testid="c360-activity">
      {rows.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">No activity recorded for this tenant in the services you can read.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-border)]">
          {rows.map((row) => (
            <li key={row.id} className="flex items-start justify-between gap-3 py-2 text-sm" data-testid="c360-activity-row">
              <div className="min-w-0">
                <p className="font-medium">
                  {row.consoleLink ? (
                    <Link to={row.consoleLink} className="hover:underline">
                      {row.summary}
                    </Link>
                  ) : (
                    row.summary
                  )}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {row.actorLabel} · {row.service} · {row.type}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${severityTone[row.severity]}`}>{row.severity}</span>
                <time className="text-xs text-[var(--color-text-muted)]" dateTime={row.occurredAt}>
                  {when(row.occurredAt)}
                </time>
              </div>
            </li>
          ))}
        </ul>
      )}
      {feed.hasNextPage ? (
        <button
          type="button"
          onClick={() => void feed.fetchNextPage()}
          disabled={feed.isFetchingNextPage}
          className="mt-2 rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          {feed.isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
      ) : null}
    </section>
  );
}
