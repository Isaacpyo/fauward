import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { usePermission } from "@fauward/internal-rbac";

import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { MoneyCell } from "@/components/service-kit/MoneyCell";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { toConsoleApiError } from "@/lib/console-api-error";
import { type FeatureOverride, type TenantDetail, useTenantDetail, useTenantUsers, useUpdateInternalNotes } from "./api";
import {
  CloseTenantDialog,
  FeatureOverrideDialog,
  LimitsDialog,
  PlanOverrideDialog,
  RevokeFeatureOverrideDialog,
  RevokePlanOverrideDialog,
  SuspendTenantDialog,
  UnsuspendTenantDialog
} from "./components/TenantDialogs";
import { statusTone } from "./TenantsListPage";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "plan", label: "Plan & entitlements" },
  { id: "users", label: "Users" },
  { id: "usage", label: "Usage" },
  { id: "suspensions", label: "Suspensions" },
  { id: "impersonation", label: "Impersonation" }
] as const;
type TabId = (typeof TABS)[number]["id"];
type Dialog = "suspend" | "unsuspend" | "override" | "revoke-override" | "feature" | "limits" | "close" | null;

const card = "rounded-lg border border-[var(--color-border)] bg-white p-4";
const actionButton = "rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50";

function when(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "—";
}

function limitText(value: number) {
  return value === -1 ? "Unlimited" : String(value);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold text-[var(--color-text-muted)]">{label}</dt>
      <dd className="mt-0.5 text-sm text-[var(--color-text-primary)]">{children}</dd>
    </div>
  );
}

function InternalNotes({ detail }: { detail: TenantDetail }) {
  const canEdit = usePermission(["platform.tenants.write", "customer.success.write"]) === true;
  const update = useUpdateInternalNotes();
  const [value, setValue] = useState(detail.identity.internalNotes ?? "");
  useEffect(() => setValue(detail.identity.internalNotes ?? ""), [detail.identity.internalNotes]);
  const dirty = value !== (detail.identity.internalNotes ?? "");
  return (
    <section className={card}>
      <h2 className="text-sm font-semibold">Internal notes</h2>
      <p className="text-xs text-[var(--color-text-muted)]">Staff only; never shown to the tenant.</p>
      <textarea aria-label="Internal notes" value={value} disabled={!canEdit} onChange={(event) => setValue(event.target.value)} rows={4} className="mt-2 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm disabled:bg-[var(--color-surface-50)]" />
      {update.isError ? <p className="text-xs text-red-700">{toConsoleApiError(update.error).message}</p> : null}
      <button
        type="button"
        disabled={!canEdit || !dirty || update.isPending}
        title={canEdit ? undefined : "Requires platform.tenants.write or customer.success.write"}
        onClick={() => update.mutate({ tenantId: detail.identity.id, internalNotes: value })}
        className={`${actionButton} mt-2`}
      >
        {update.isPending ? "Saving…" : "Save notes"}
      </button>
    </section>
  );
}

function OverviewTab({ detail }: { detail: TenantDetail }) {
  const identity = detail.identity;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={card}>
        <h2 className="text-sm font-semibold">Identity</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Slug">
            <span className="font-mono">{identity.slug}</span>
          </Field>
          <Field label="Custom domain">{identity.customDomain ? `${identity.customDomain} (${identity.customDomainStatus})` : "None"}</Field>
          <Field label="Region">
            {detail.region.current}
            {detail.region.pendingRequest ? (
              <Link to="/platform/tenants/region-requests" className="ml-2 text-xs font-semibold text-amber-700 hover:underline">
                Pending move to {detail.region.pendingRequest.requestedRegion}
              </Link>
            ) : null}
          </Field>
          <Field label="KYC">{identity.kycStatus}</Field>
          <Field label="Created">{when(identity.createdAt)}</Field>
          <Field label="Currency / timezone">
            {identity.defaultCurrency} · {identity.timezone}
          </Field>
          {identity.closedAt ? (
            <>
              <Field label="Closed">{when(identity.closedAt)}</Field>
              <Field label="Data kept until">{when(identity.purgeAfter)}</Field>
            </>
          ) : null}
        </dl>
      </section>
      <section className={card}>
        <h2 className="text-sm font-semibold">Commercial</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3">
          <Field label="MRR contribution">
            <MoneyCell amount={detail.mrrContribution.amount} currency={detail.mrrContribution.currency} />
            {detail.mrrContribution.note ? <span className="block text-xs text-[var(--color-text-muted)]">{detail.mrrContribution.note}</span> : null}
          </Field>
          <Field label="Health">{detail.healthScore ? `${detail.healthScore.score} (${detail.healthScore.trend})` : "Not yet scored"}</Field>
          <Field label="Subscription">
            {detail.subscription ? `${detail.subscription.plan} · ${detail.subscription.billingCycle.toLowerCase()} · ${detail.subscription.status}` : "No subscription"}
          </Field>
          <Field label="Renews / ends">{detail.subscription ? `${when(detail.subscription.currentPeriodEnd)}${detail.subscription.cancelAtPeriodEnd ? " (cancels at period end)" : ""}` : "—"}</Field>
          <Field label="Staff">
            {detail.staff.count} active · last sign-in {when(detail.staff.lastLoginAt)}
          </Field>
          <Field label="Admins">{detail.staff.admins.map((admin) => admin.email).join(", ") || "None"}</Field>
        </dl>
      </section>
      <InternalNotes detail={detail} />
    </div>
  );
}

function PlanTab({ detail, onDialog, onRevokeFeature }: { detail: TenantDetail; onDialog: (dialog: Dialog) => void; onRevokeFeature: (override: FeatureOverride) => void }) {
  const features = Object.entries(detail.entitlements.features).sort(([a], [b]) => a.localeCompare(b));
  const activeOverrides = detail.featureOverrides.filter((row) => !row.revokedAt && (!row.expiresAt || new Date(row.expiresAt) > new Date()));
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className={card}>
        <h2 className="text-sm font-semibold">Plan</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Billing plan">{detail.plan.billingPlan}</Field>
          <Field label="Effective plan">
            <span data-testid="effective-plan">{detail.plan.effectivePlan}</span>
          </Field>
        </dl>
        {detail.plan.planOverride ? (
          <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
            Override to <strong>{detail.plan.planOverride.plan}</strong> {detail.plan.planOverride.expiresAt ? `until ${when(detail.plan.planOverride.expiresAt)}` : "with no expiry"} — {detail.plan.planOverride.reason}
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <PermissionButton permission="revenue.subscriptions.override" disabled={Boolean(detail.identity.closedAt)} onClick={() => onDialog("override")} className={actionButton}>
            Override plan
          </PermissionButton>
          {detail.plan.planOverride ? (
            <PermissionButton permission="revenue.subscriptions.override" onClick={() => onDialog("revoke-override")} className={actionButton}>
              Revoke override
            </PermissionButton>
          ) : null}
        </div>
      </section>
      <section className={card}>
        <h2 className="text-sm font-semibold">Limits</h2>
        <p className="text-xs text-[var(--color-text-muted)]">{detail.entitlements.limitsSource === "tenant" ? "Set by Fauward staff." : "From the effective plan."}</p>
        <dl className="mt-3 grid grid-cols-2 gap-3">
          <Field label="Staff seats">{limitText(detail.entitlements.limits.maxStaff)}</Field>
          <Field label="Shipments per month">{limitText(detail.entitlements.limits.maxShipmentsPm)}</Field>
          <Field label="Organisations">{limitText(detail.entitlements.limits.maxOrganisations)}</Field>
          <Field label="API requests / min">{limitText(detail.entitlements.limits.apiRateLimit)}</Field>
        </dl>
        <PermissionButton permission="platform.tenants.write" disabled={Boolean(detail.identity.closedAt)} onClick={() => onDialog("limits")} className={`${actionButton} mt-3`}>
          Change limits
        </PermissionButton>
      </section>
      <section className={`${card} lg:col-span-2`}>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Features</h2>
          <PermissionButton permission="platform.flags.write" disabled={Boolean(detail.identity.closedAt)} onClick={() => onDialog("feature")} className={actionButton}>
            Add feature override
          </PermissionButton>
        </div>
        <table className="mt-3 min-w-full text-sm">
          <thead className="text-left text-xs text-[var(--color-text-muted)]">
            <tr>
              <th className="py-1">Feature</th>
              <th className="py-1">Enabled</th>
              <th className="py-1">Source</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {features.map(([key, value]) => {
              const override = activeOverrides.find((row) => row.featureKey === key);
              return (
                <tr key={key} data-testid={`feature-${key}`}>
                  <td className="py-1 font-mono text-xs">{key}</td>
                  <td className="py-1">{value.enabled ? "On" : "Off"}</td>
                  <td className="py-1 text-xs">{value.source === "override" ? `Override${value.expiresAt ? ` until ${when(value.expiresAt)}` : ""}` : "Plan"}</td>
                  <td className="py-1 text-right">
                    {override ? (
                      <PermissionButton permission="platform.flags.write" onClick={() => onRevokeFeature(override)} className={actionButton}>
                        Revoke
                      </PermissionButton>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function UsersTab({ tenantId }: { tenantId: string }) {
  const users = useTenantUsers(tenantId);
  if (users.isError) return <ConsoleApiErrorPanel error={users.error} onRetry={() => void users.refetch()} />;
  if (users.isLoading) return <p className="text-sm text-[var(--color-text-muted)]">Loading users…</p>;
  const rows = users.data ?? [];
  return (
    <section className={card}>
      <table className="min-w-full text-sm">
        <thead className="text-left text-xs text-[var(--color-text-muted)]">
          <tr>
            <th className="py-1">User</th>
            <th className="py-1">Role</th>
            <th className="py-1">Status</th>
            <th className="py-1">MFA</th>
            <th className="py-1">Last sign-in</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {rows.map((user) => (
            <tr key={user.id}>
              <td className="py-1">
                {[user.firstName, user.lastName].filter(Boolean).join(" ") || "—"}
                <span className="block font-mono text-xs text-[var(--color-text-muted)]">{user.email}</span>
              </td>
              <td className="py-1 text-xs">{user.role}</td>
              <td className="py-1 text-xs">{user.isActive ? "Active" : "Inactive"}</td>
              <td className="py-1 text-xs">{user.mfaEnabled ? "On" : "Off"}</td>
              <td className="py-1 text-xs">{when(user.lastLogin)}</td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-4 text-center text-sm text-[var(--color-text-muted)]">
                This tenant has no users yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}

function UsageTab({ detail }: { detail: TenantDetail }) {
  return (
    <section className={card}>
      <p className="text-xs text-[var(--color-text-muted)]">Current month and the six before it. Shipment limit: {limitText(detail.entitlements.limits.maxShipmentsPm)} per month.</p>
      <table className="mt-2 min-w-full text-sm">
        <thead className="text-left text-xs text-[var(--color-text-muted)]">
          <tr>
            <th className="py-1">Month</th>
            <th className="py-1 text-right">Shipments</th>
            <th className="py-1 text-right">API calls</th>
            <th className="py-1 text-right">SMS</th>
            <th className="py-1 text-right">Emails</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {detail.usage.map((row) => (
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
  );
}

function SuspensionsTab({ detail, onDialog }: { detail: TenantDetail; onDialog: (dialog: Dialog) => void }) {
  return (
    <section className={card}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{detail.suspensions.active.length} active cause(s)</h2>
        <div className="flex gap-2">
          <PermissionButton permission="platform.tenants.suspend" disabled={Boolean(detail.identity.closedAt)} onClick={() => onDialog("suspend")} className={actionButton}>
            Suspend
          </PermissionButton>
          <PermissionButton permission="platform.tenants.suspend" disabled={detail.suspensions.active.length === 0} onClick={() => onDialog("unsuspend")} className={actionButton}>
            Lift a suspension
          </PermissionButton>
        </div>
      </div>
      <table className="mt-3 min-w-full text-sm">
        <thead className="text-left text-xs text-[var(--color-text-muted)]">
          <tr>
            <th className="py-1">Source · category</th>
            <th className="py-1">Internal reason</th>
            <th className="py-1">Shown to tenant</th>
            <th className="py-1">Since</th>
            <th className="py-1">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {detail.suspensions.history.map((record) => (
            <tr key={record.id}>
              <td className="py-1 text-xs font-semibold">
                {record.source} · {record.category}
              </td>
              <td className="py-1 text-xs">{record.reason}</td>
              <td className="py-1 text-xs">{record.publicReason ?? "—"}</td>
              <td className="py-1 text-xs">{when(record.createdAt)}</td>
              <td className="py-1 text-xs">{record.status === "ACTIVE" ? "Active" : `Lifted (${record.liftedVia ?? "?"}) ${when(record.liftedAt)}`}</td>
            </tr>
          ))}
          {detail.suspensions.history.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-4 text-center text-sm text-[var(--color-text-muted)]">
                This tenant has never been suspended.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}

function ImpersonationTab({ detail }: { detail: TenantDetail }) {
  const navigate = useNavigate();
  return (
    <section className={card}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Last 10 staff sessions</h2>
        <PermissionButton
          permission="platform.impersonation.start"
          disabled={Boolean(detail.identity.closedAt)}
          onClick={() => navigate(`/platform/impersonation?tenantId=${encodeURIComponent(detail.identity.id)}`)}
          className={actionButton}
        >
          Start a session
        </PermissionButton>
      </div>
      <table className="mt-3 min-w-full text-sm">
        <thead className="text-left text-xs text-[var(--color-text-muted)]">
          <tr>
            <th className="py-1">Staff</th>
            <th className="py-1">Scope</th>
            <th className="py-1">Reason</th>
            <th className="py-1">Started</th>
            <th className="py-1">Ended</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--color-border)]">
          {detail.impersonationSessions.map((session) => (
            <tr key={session.id}>
              <td className="py-1 text-xs">{session.staff.name ?? session.staff.email}</td>
              <td className="py-1 text-xs">{session.scopes.includes("write") ? "Write" : "Read-only"}</td>
              <td className="py-1 text-xs">{session.reason}</td>
              <td className="py-1 text-xs">{when(session.createdAt)}</td>
              <td className="py-1 text-xs">{session.endedAt ? `${when(session.endedAt)} (${session.endedReason ?? "ended"})` : new Date(session.expiresAt) > new Date() ? "Active" : `Expired ${when(session.expiresAt)}`}</td>
            </tr>
          ))}
          {detail.impersonationSessions.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-4 text-center text-sm text-[var(--color-text-muted)]">
                No staff has opened this tenant's portal.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}

export function TenantDetailPage() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((item) => item.id === params.get("tab"))?.id ?? "overview") as TabId;
  const detail = useTenantDetail(id);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [revokingFeature, setRevokingFeature] = useState<FeatureOverride | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (detail.isError) {
    const error = toConsoleApiError(detail.error);
    if (error.status === 404) {
      return (
        <div className={card}>
          <h1 className="text-lg font-semibold">Tenant not found</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">No tenant has the id {id}.</p>
          <Link to="/platform/tenants" className="mt-3 inline-block text-sm font-semibold text-[var(--fauward-navy)] hover:underline">
            Back to tenants
          </Link>
        </div>
      );
    }
    return <ConsoleApiErrorPanel error={detail.error} onRetry={() => void detail.refetch()} title="Unable to load the tenant" />;
  }
  if (!detail.data) return <p className="text-sm text-[var(--color-text-muted)]">Loading tenant…</p>;

  const data = detail.data;
  const tenant = { id: data.identity.id, name: data.identity.name, slug: data.identity.slug };
  const closed = Boolean(data.identity.closedAt);

  return (
    <div className="space-y-4">
      <header className={card}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link to="/platform/tenants" className="text-xs font-semibold text-[var(--color-text-muted)] hover:underline">
              Tenants
            </Link>
            <h1 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-bold text-[var(--color-text-primary)]">
              {data.identity.name}
              <span data-testid="tenant-status" className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusTone(data.identity.status)}`}>
                {data.identity.status}
              </span>
            </h1>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">
              <span className="font-mono">{data.identity.slug}</span> · effective plan {data.plan.effectivePlan}
              {data.plan.effectivePlan !== data.plan.billingPlan ? ` (billing ${data.plan.billingPlan})` : ""} · <TenantChip tenantId={tenant.id} name="Customer 360" />
            </p>
            {data.identity.status === "SUSPENDED" && data.identity.suspensionReason ? <p className="mt-1 text-xs text-red-700">Tenant sees: {data.identity.suspensionReason}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <PermissionButton permission="platform.tenants.suspend" disabled={closed || data.identity.status === "SUSPENDED"} onClick={() => setDialog("suspend")} className={actionButton}>
              Suspend
            </PermissionButton>
            <PermissionButton permission="platform.tenants.suspend" disabled={data.suspensions.active.length === 0} onClick={() => setDialog("unsuspend")} className={actionButton}>
              Unsuspend
            </PermissionButton>
            <PermissionButton permission="revenue.subscriptions.override" disabled={closed} onClick={() => setDialog("override")} className={actionButton}>
              Override plan
            </PermissionButton>
            <PermissionButton permission="platform.tenants.close" disabled={closed} onClick={() => setDialog("close")} className={`${actionButton} border-red-300 text-red-700`}>
              Close tenant
            </PermissionButton>
          </div>
        </div>
      </header>

      {notice ? (
        <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {notice}
        </p>
      ) : null}

      <nav className="flex flex-wrap gap-1 border-b border-[var(--color-border)]" aria-label="Tenant sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setParams({ tab: item.id }, { replace: true })}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === item.id ? "border-[var(--fauward-navy)] text-[var(--fauward-navy)]" : "border-transparent text-[var(--color-text-muted)]"}`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === "overview" ? <OverviewTab detail={data} /> : null}
      {tab === "plan" ? <PlanTab detail={data} onDialog={setDialog} onRevokeFeature={setRevokingFeature} /> : null}
      {tab === "users" ? <UsersTab tenantId={tenant.id} /> : null}
      {tab === "usage" ? <UsageTab detail={data} /> : null}
      {tab === "suspensions" ? <SuspensionsTab detail={data} onDialog={setDialog} /> : null}
      {tab === "impersonation" ? <ImpersonationTab detail={data} /> : null}

      <SuspendTenantDialog tenant={tenant} open={dialog === "suspend"} onClose={() => setDialog(null)} onDone={(result) => setNotice(`${tenant.name} is ${result.tenant.status.toLowerCase()}. Tenant admins have been notified.`)} />
      <UnsuspendTenantDialog tenant={tenant} active={data.suspensions.active} open={dialog === "unsuspend"} onClose={() => setDialog(null)} onDone={setNotice} />
      <PlanOverrideDialog tenant={tenant} billingPlan={data.plan.billingPlan} open={dialog === "override"} onClose={() => setDialog(null)} onDone={setNotice} />
      <RevokePlanOverrideDialog tenant={tenant} override={data.plan.planOverride} open={dialog === "revoke-override"} onClose={() => setDialog(null)} onDone={setNotice} />
      <FeatureOverrideDialog tenant={tenant} featureKeys={Object.keys(data.entitlements.features).sort()} open={dialog === "feature"} onClose={() => setDialog(null)} onDone={setNotice} />
      <RevokeFeatureOverrideDialog tenant={tenant} override={revokingFeature} open={revokingFeature !== null} onClose={() => setRevokingFeature(null)} onDone={setNotice} />
      <LimitsDialog tenant={tenant} detail={data} open={dialog === "limits"} onClose={() => setDialog(null)} onDone={setNotice} />
      <CloseTenantDialog
        tenant={tenant}
        open={dialog === "close"}
        onClose={() => setDialog(null)}
        onDone={(result) =>
          setNotice(`${tenant.name} is closed; data is kept until ${new Date(result.tenant.purgeAfter).toLocaleDateString()}. ${result.stripe.status === "CANCEL_AT_PERIOD_END" ? "The Stripe subscription cancels at period end." : result.stripe.message ?? ""}`)
        }
      />
    </div>
  );
}
