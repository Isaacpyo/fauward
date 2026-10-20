import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { type PlanChangeRequest, money, useCancelSubscription, useDecidePlanChange, usePlanChangeRequests, useSubscriptionDetail, useSubscriptions, words } from "./api";
import { SubscriptionsNav } from "./SubscriptionsNav";

const select = "rounded-md border border-[var(--color-border)] px-2 py-1.5 text-sm";

/** Every tenant subscription with its MRR contribution (contracts and ACTIVE overrides applied). */
export function SubscriptionsListPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filters = { plan: params.get("plan") ?? undefined, status: params.get("status") ?? undefined, cycle: params.get("cycle") ?? undefined };
  const query = useSubscriptions(filters);
  const rows = query.data?.pages.flatMap((page) => page.data) ?? [];
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <SubscriptionsNav current="list" />
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Subscriptions</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">MRR per tenant uses its active contract, or the list price less active pricing overrides.</p>
      </header>
      <div className="flex flex-wrap gap-2">
        <select aria-label="Plan" value={filters.plan ?? ""} onChange={(event) => set("plan", event.target.value)} className={select}>
          <option value="">All plans</option>
          {["TRIALING", "STARTER", "PRO", "ENTERPRISE"].map((plan) => (
            <option key={plan} value={plan}>
              {words(plan)}
            </option>
          ))}
        </select>
        <select aria-label="Status" value={filters.status ?? ""} onChange={(event) => set("status", event.target.value)} className={select}>
          <option value="">All statuses</option>
          {["TRIALING", "ACTIVE", "PAST_DUE", "CANCELLED"].map((status) => (
            <option key={status} value={status}>
              {words(status)}
            </option>
          ))}
        </select>
        <select aria-label="Billing cycle" value={filters.cycle ?? ""} onChange={(event) => set("cycle", event.target.value)} className={select}>
          <option value="">Any cycle</option>
          <option value="MONTHLY">Monthly</option>
          <option value="ANNUAL">Annual</option>
        </select>
      </div>
      {query.isError ? <ConsoleApiErrorPanel error={query.error} onRetry={() => void query.refetch()} title="Unable to load subscriptions" /> : null}
      {!query.isError ? (
        <section className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--color-surface-50)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
              <tr>
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2">Plan</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">MRR</th>
                <th className="px-3 py-2">Billing</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((row) => (
                <tr key={row.id} data-testid="subscription-row" className="cursor-pointer hover:bg-[var(--color-surface-50)]" onClick={() => navigate(`/revenue/subscriptions/${row.tenant.id}`)}>
                  <td className="px-3 py-2">
                    <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {words(row.plan)} · {words(row.billingCycle)}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {words(row.status)}
                    {row.cancelAtPeriodEnd ? " (ends at period end)" : ""}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs" title={row.mrr.note}>
                    {money(row.mrr.amount, row.mrr.currency)}
                    {row.mrr.source === "contract" ? " · contract" : ""}
                  </td>
                  <td className="px-3 py-2 text-xs">{row.managedByStripe ? "Stripe" : "Manual"}</td>
                </tr>
              ))}
              {!query.isLoading && rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-[var(--color-text-muted)]">
                    No subscriptions match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {query.hasNextPage ? (
            <div className="border-t border-[var(--color-border)] p-2 text-center">
              <button type="button" onClick={() => void query.fetchNextPage()} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold">
                Load more
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

/** One tenant's subscription: events with MRR before/after, overrides, contracts, plan change requests (ACC-SUB-3). */
export function SubscriptionDetailPage() {
  const { id = "" } = useParams();
  const detail = useSubscriptionDetail(id);
  const cancel = useCancelSubscription();
  const [cancelling, setCancelling] = useState(false);

  if (detail.isLoading) return <p className="text-sm text-[var(--color-text-muted)]">Loading subscription…</p>;
  if (detail.isError) return <ConsoleApiErrorPanel error={detail.error} onRetry={() => void detail.refetch()} title="Unable to load the subscription" />;
  if (!detail.data) return null;
  const { tenant, subscription, mrr, events, overrides, contracts, planChangeRequests } = detail.data;

  return (
    <div className="space-y-4">
      <SubscriptionsNav current="list" />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/revenue/subscriptions" className="text-xs font-semibold text-[var(--fauward-navy)] hover:underline">
            ← Subscriptions
          </Link>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-bold text-[var(--color-text-primary)]">
            <TenantChip tenantId={tenant.id} name={tenant.name} slug={tenant.slug} />
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]" data-testid="subscription-summary">
            {subscription ? `${words(subscription.plan)} · ${words(subscription.billingCycle)} · ${words(subscription.status)}` : "No subscription"} · MRR {money(mrr.amount, mrr.currency)}
            {mrr.note ? ` (${mrr.note})` : ""}
          </p>
        </div>
        {subscription && !subscription.cancelAtPeriodEnd && subscription.status !== "CANCELLED" ? (
          <PermissionButton permission="revenue.subscriptions.write" onClick={() => setCancelling(true)} className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50">
            Cancel at period end
          </PermissionButton>
        ) : null}
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-[var(--color-border)] bg-white p-4 text-sm">
          <h2 className="font-semibold">Subscription</h2>
          {subscription ? (
            <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-[var(--color-text-muted)]">Billing</dt>
              <dd>{subscription.managedByStripe ? "Stripe" : "Manual (staff-approved changes)"}</dd>
              <dt className="text-[var(--color-text-muted)]">Current period</dt>
              <dd>{subscription.currentPeriodEnd ? `ends ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}` : "—"}</dd>
              <dt className="text-[var(--color-text-muted)]">Trial ends</dt>
              <dd>{subscription.trialEnd ? new Date(subscription.trialEnd).toLocaleDateString() : "—"}</dd>
              <dt className="text-[var(--color-text-muted)]">Cancellation</dt>
              <dd>{subscription.cancelAtPeriodEnd ? "Ends at the period end" : subscription.cancelledAt ? `Cancelled ${new Date(subscription.cancelledAt).toLocaleDateString()}` : "—"}</dd>
            </dl>
          ) : (
            <p className="mt-2 text-[var(--color-text-muted)]">This tenant has no subscription row.</p>
          )}
          <h3 className="mt-4 font-semibold">Pricing overrides</h3>
          <ul className="mt-1 space-y-1 text-xs">
            {overrides.map((row) => (
              <li key={row.id}>
                {row.discountPercent ?? "—"}% · {words(row.status)} · from {new Date(row.validFrom).toLocaleDateString()}
                {row.validTo ? ` to ${new Date(row.validTo).toLocaleDateString()}` : ""}
              </li>
            ))}
            {overrides.length === 0 ? <li className="text-[var(--color-text-muted)]">None</li> : null}
          </ul>
          <h3 className="mt-4 font-semibold">Contracts</h3>
          <ul className="mt-1 space-y-1 text-xs">
            {contracts.map((row) => (
              <li key={row.id}>
                {money(row.monthlyAmount, row.currency ?? "")} / month · {words(row.status)} · {new Date(row.termStart).toLocaleDateString()} – {new Date(row.termEnd).toLocaleDateString()}
              </li>
            ))}
            {contracts.length === 0 ? <li className="text-[var(--color-text-muted)]">None</li> : null}
          </ul>
        </section>

        <section className="rounded-lg border border-[var(--color-border)] bg-white p-4 text-sm">
          <h2 className="font-semibold">History</h2>
          <ol className="mt-2 space-y-1 text-xs" data-testid="subscription-events">
            {events.map((row) => (
              <li key={row.id}>
                <span className="text-[var(--color-text-muted)]">{new Date(row.occurredAt).toLocaleString()}</span> · {words(row.type)}
                {row.fromPlan || row.toPlan ? ` ${row.fromPlan ?? "—"} → ${row.toPlan ?? "—"}` : ""}
                {row.toStatus && row.type !== "PLAN_CHANGED" ? ` (${words(row.toStatus)})` : ""}
                {row.mrrBefore !== null || row.mrrAfter !== null ? ` · MRR ${row.mrrBefore ?? "—"} → ${row.mrrAfter ?? "—"} ${row.currency}` : ""} · {words(row.source)}
              </li>
            ))}
            {events.length === 0 ? <li className="text-[var(--color-text-muted)]">No recorded events.</li> : null}
          </ol>
          <h3 className="mt-4 font-semibold">Plan change requests</h3>
          <ul className="mt-1 space-y-1 text-xs">
            {planChangeRequests.map((row) => (
              <li key={row.id}>
                {words(row.fromPlan)} → {words(row.toPlan)} · {words(row.status)} · {new Date(row.createdAt).toLocaleDateString()}
                {row.decisionReason ? ` · ${row.decisionReason}` : ""}
              </li>
            ))}
            {planChangeRequests.length === 0 ? <li className="text-[var(--color-text-muted)]">None</li> : null}
          </ul>
        </section>
      </div>

      <ActionDialog
        open={cancelling}
        title={`Cancel ${tenant.name}'s subscription at the period end?`}
        description={subscription?.managedByStripe ? "Stripe stops renewing; the tenant keeps access until the period ends and is told now." : "The subscription is marked to end at the period end; the tenant is told now."}
        confirmLabel="Cancel at period end"
        dangerous
        onSubmit={async (reason) => cancel.mutateAsync({ tenantId: tenant.id, reason })}
        onClose={() => setCancelling(false)}
      />
    </div>
  );
}

const FILTERS = [
  { id: "PENDING", label: "Waiting for a decision" },
  { id: "CHECKOUT_PENDING", label: "In Stripe checkout" },
  { id: "APPLIED", label: "Applied" },
  { id: "REJECTED", label: "Rejected" },
  { id: "", label: "All" }
];

/** Plan changes the tenant asked for without Stripe (or for Enterprise): approving applies the plan at once. */
export function PlanChangeRequestsPage() {
  const [status, setStatus] = useState("PENDING");
  const query = usePlanChangeRequests(status || undefined);
  const decide = useDecidePlanChange();
  const [decision, setDecision] = useState<{ request: PlanChangeRequest; decision: "APPROVE" | "REJECT" } | null>(null);
  const rows = query.data ?? [];

  return (
    <div className="space-y-4">
      <SubscriptionsNav current="requests" />
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Plan change requests</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Approving changes the tenant&apos;s plan and entitlements immediately (and the Stripe subscription when Stripe manages it).</p>
      </header>
      <nav aria-label="Request status" className="flex flex-wrap gap-1">
        {FILTERS.map((item) => (
          <button
            key={item.id || "all"}
            type="button"
            aria-pressed={status === item.id}
            onClick={() => setStatus(item.id)}
            className={`rounded-md border px-3 py-1.5 text-sm ${status === item.id ? "border-[var(--fauward-navy)] bg-[var(--fauward-navy)] text-white" : "border-[var(--color-border)] bg-white"}`}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {query.isError ? <ConsoleApiErrorPanel error={query.error} onRetry={() => void query.refetch()} title="Unable to load plan change requests" /> : null}
      {!query.isError ? (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} data-testid="plan-change-request" className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-white p-4">
              <div className="space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  {row.tenant ? <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} /> : <span className="font-mono text-xs">{row.tenantId}</span>}
                  <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-xs font-semibold">{words(row.status)}</span>
                </div>
                <p>
                  {words(row.fromPlan)} → <span className="font-semibold">{words(row.toPlan)}</span> · {words(row.billingCycle)}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Requested {new Date(row.createdAt).toLocaleString()} · {words(row.channel)}
                  {row.decisionReason ? ` · ${row.decisionReason}` : ""}
                </p>
              </div>
              {row.status === "PENDING" ? (
                <div className="flex gap-2">
                  <PermissionButton permission="revenue.subscriptions.write" onClick={() => setDecision({ request: row, decision: "APPROVE" })} className="rounded-md bg-green-700 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                    Approve
                  </PermissionButton>
                  <PermissionButton permission="revenue.subscriptions.write" onClick={() => setDecision({ request: row, decision: "REJECT" })} className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-50">
                    Reject
                  </PermissionButton>
                </div>
              ) : null}
            </li>
          ))}
          {!query.isLoading && rows.length === 0 ? <li className="rounded-lg border border-[var(--color-border)] bg-white px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">No plan change requests here.</li> : null}
        </ul>
      ) : null}
      <ActionDialog
        open={decision !== null}
        title={decision ? `${decision.decision === "APPROVE" ? "Approve" : "Reject"} ${decision.request.tenant?.name ?? "the tenant"}'s move to ${words(decision.request.toPlan)}?` : ""}
        description={decision?.decision === "APPROVE" ? "The plan, its features and limits change as soon as you confirm, and the tenant's admins are told." : "The tenant's admins see your reason."}
        confirmLabel={decision?.decision === "APPROVE" ? "Approve and apply" : "Reject"}
        dangerous
        onSubmit={async (reason) => decide.mutateAsync({ id: decision!.request.id, decision: decision!.decision, reason })}
        onClose={() => setDecision(null)}
      />
    </div>
  );
}
