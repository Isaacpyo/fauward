import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { consoleApi } from "@/lib/console-api";

// gtm.trials (WP-4.14): TrialsPage, ExpiringPage, ExtensionsPage, TrialDetailPage. Approving a tenant's request (or
// extending proactively) moves Subscription.trialEnd, writes TRIAL_EXTENDED, sets Stripe trial_end when Stripe manages
// the subscription, and tells the tenant admins. Over 7 days needs a sales manager, over 30 a sales director.

type Activation = {
  score: number;
  firstShipmentCreated: boolean;
  teamInvited: boolean;
  paymentMethodConnected: boolean;
  webhookConfigured: boolean;
  customDomainSet: boolean;
  interventionStatus: string;
  scoredAt: string;
};
type TrialRow = {
  tenant: { id: string; name: string; slug: string | null; status: string };
  plan: string | null;
  subscriptionStatus: string | null;
  trialEnd: string | null;
  daysLeft: number | null;
  activation: Activation | null;
  pendingRequest: { id: string; requestedDays: number; createdAt: string } | null;
};
type StripeSync = "MIRRORED" | "NOT_CONFIGURED" | "NO_STRIPE_SUBSCRIPTION" | "FAILED";
type ExtensionRequest = {
  id: string;
  tenantId: string;
  requestedDays: number;
  status: "PENDING" | "APPROVED" | "DENIED";
  source: "TENANT" | "CONSOLE";
  reason: string | null;
  decidedAt: string | null;
  decisionReason: string | null;
  previousTrialEnd: string | null;
  newTrialEnd: string | null;
  stripeSync: StripeSync | null;
  createdAt: string;
};
type ExtensionRow = ExtensionRequest & { tenant: { id: string; name: string; slug: string | null }; currentTrialEnd: string | null; currentDaysLeft: number | null; subscriptionStatus: string | null };
type Thresholds = { managerOver: number; directorOver: number; consoleMax: number; tenantMax: number };
type TrialDetail = TrialRow & { managedByStripe: boolean; thresholds?: Thresholds; requests: ExtensionRequest[]; events: Array<{ id: string; source: string; occurredAt: string }> };
type DecisionResult = { request: ExtensionRequest; stripeSync: StripeSync | null };

const KEY = ["gtm.trials"] as const;
const label = "block text-xs font-semibold text-[var(--color-text-muted)]";
const primary = "rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50";
const secondary = "rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold";

function day(value: string | null) {
  return value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
}

function syncText(sync: StripeSync | null) {
  if (sync === "MIRRORED") return " Stripe trial end updated.";
  if (sync === "FAILED") return " Stripe could not be updated; set the trial end on the subscription in Stripe.";
  return "";
}

function TrialsNav({ active }: { active: "all" | "expiring" | "extensions" }) {
  const base = "rounded-md px-3 py-1.5 text-xs font-semibold";
  const item = (key: typeof active, to: string, text: string) => (
    <Link to={to} className={`${base} ${active === key ? "bg-[var(--fauward-navy)] text-white" : "border border-[var(--color-border)]"}`}>
      {text}
    </Link>
  );
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Trial sections">
      {item("all", "/gtm/trials", "Trials")}
      {item("expiring", "/gtm/trials/expiring", "Expiring")}
      {item("extensions", "/gtm/trials/extensions", "Extension requests")}
    </nav>
  );
}

function Notice({ message }: { message: string | null }) {
  return message ? (
    <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
      {message}
    </p>
  ) : null;
}

function ActivationCell({ activation }: { activation: Activation | null }) {
  if (!activation) return <span className="text-xs text-[var(--color-text-muted)]">Not scored yet</span>;
  const tone = activation.interventionStatus === "CSM_INTERVENTION" ? "text-red-700" : "text-green-700";
  return (
    <span className={`text-xs font-semibold ${tone}`} title={`Scored ${new Date(activation.scoredAt).toLocaleString()}`}>
      Activation {activation.score}/100{activation.interventionStatus === "CSM_INTERVENTION" ? " · needs CSM" : ""}
    </span>
  );
}

function TrialTable({ rows, empty }: { rows: TrialRow[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-[var(--color-text-muted)]">{empty}</p>;
  return (
    <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white">
      {rows.map((row) => (
        <li key={row.tenant.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-testid="trial-row">
          <span className="flex flex-wrap items-center gap-2">
            <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} />
            <ActivationCell activation={row.activation} />
            {row.pendingRequest ? <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Asked for {row.pendingRequest.requestedDays} days</span> : null}
          </span>
          <span className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
            <span>{row.daysLeft === null ? "No trial end set" : `${row.daysLeft} day${row.daysLeft === 1 ? "" : "s"} left · ends ${day(row.trialEnd)}`}</span>
            <Link to={`/gtm/trials/${encodeURIComponent(row.tenant.id)}`} className="underline">
              Details
            </Link>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function TrialsPage() {
  const [params, setParams] = useSearchParams();
  const lowActivation = params.get("lowActivation") === "true";
  const trials = useQuery({
    queryKey: [...KEY, "list", lowActivation],
    queryFn: async () => {
      const data = (await consoleApi.get<{ data?: TrialRow[]; truncated?: boolean; activationThreshold?: number }>("/trials", { params: lowActivation ? { lowActivation: "true" } : {} })).data;
      return { rows: data.data ?? [], truncated: data.truncated ?? false, threshold: data.activationThreshold ?? null };
    }
  });
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Trials</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Tenants on a trial (demo tenants excluded), soonest end first, with the nightly activation score.</p>
        </div>
        <TrialsNav active="all" />
      </header>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={lowActivation} onChange={(event) => setParams(event.target.checked ? { lowActivation: "true" } : {}, { replace: true })} />
        {trials.data?.threshold ? `Only activation below ${trials.data.threshold}` : "Only low activation"}
      </label>
      {trials.isError ? <ConsoleApiErrorPanel error={trials.error} onRetry={() => void trials.refetch()} title="Unable to load trials" /> : null}
      {trials.data ? <TrialTable rows={trials.data.rows} empty="No tenant is on a trial." /> : null}
      {trials.data?.truncated ? <p className="text-xs text-[var(--color-text-muted)]">The list is cut off; use the filter to narrow it.</p> : null}
    </div>
  );
}

export function TrialsExpiringPage() {
  const expiring = useQuery({
    queryKey: [...KEY, "expiring"],
    queryFn: async () => {
      const data = (await consoleApi.get<{ data?: TrialRow[]; windowDays?: number }>("/trials/expiring")).data;
      return { rows: data.data ?? [], windowDays: data.windowDays ?? null };
    }
  });
  const window = expiring.data?.windowDays;
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Expiring trials</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">{window ? `Trials ending in the next ${window} days.` : "Trials ending soon."}</p>
        </div>
        <TrialsNav active="expiring" />
      </header>
      {expiring.isError ? <ConsoleApiErrorPanel error={expiring.error} onRetry={() => void expiring.refetch()} title="Unable to load expiring trials" /> : null}
      {expiring.data ? <TrialTable rows={expiring.data.rows} empty="No trial ends in this window." /> : null}
    </div>
  );
}

const DECISION_COPY = {
  APPROVE: { title: "Approve the extension", confirm: "Approve", description: "The trial end moves by the requested days and the tenant admins are told." },
  DENY: { title: "Decline the extension", confirm: "Decline", description: "The tenant admins see your reason and can ask again." }
} as const;

function thresholdText(thresholds: Thresholds | null) {
  return thresholds ? `Over ${thresholds.managerOver} days needs a sales manager; over ${thresholds.directorOver} days a sales director.` : "";
}

export function ExtensionsPage() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "PENDING";
  const extensions = useQuery({
    queryKey: [...KEY, "extensions", status],
    queryFn: async () => {
      const data = (await consoleApi.get<{ data?: ExtensionRow[]; thresholds?: Thresholds }>("/trials/extensions", { params: { status } })).data;
      return { rows: data.data ?? [], thresholds: data.thresholds ?? null };
    }
  });
  const decide = useMutation({
    mutationFn: async ({ id, decision, reason }: { id: string; decision: keyof typeof DECISION_COPY; reason: string }) =>
      (await consoleApi.post<DecisionResult>(`/trials/extensions/${encodeURIComponent(id)}/decision`, { decision, reason }, { idempotent: true })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY })
  });
  const [pending, setPending] = useState<{ row: ExtensionRow; decision: keyof typeof DECISION_COPY } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const rows = extensions.data?.rows ?? [];
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Trial extension requests</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Tenant admins ask from the trial banner. {thresholdText(extensions.data?.thresholds ?? null)}</p>
        </div>
        <TrialsNav active="extensions" />
      </header>
      <Notice message={message} />
      <label className={label}>
        Status
        <select aria-label="Request status" value={status} onChange={(event) => setParams({ status: event.target.value }, { replace: true })} className="mt-1 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
          <option value="PENDING">Waiting</option>
          <option value="APPROVED">Approved</option>
          <option value="DENIED">Declined</option>
          <option value="ALL">All</option>
        </select>
      </label>
      {extensions.isError ? <ConsoleApiErrorPanel error={extensions.error} onRetry={() => void extensions.refetch()} title="Unable to load extension requests" /> : null}
      {extensions.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">{status === "PENDING" ? "No request is waiting." : "None."}</p> : null}
      {rows.length > 0 ? (
        <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-testid="extension-row">
              <span>
                <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} />{" "}
                <span className="font-semibold">+{row.requestedDays} days</span>
                <span className="text-xs text-[var(--color-text-muted)]">
                  {" "}
                  · {row.source === "CONSOLE" ? "staff extension" : "tenant request"} · {row.status.toLowerCase()}
                  {row.status === "PENDING" ? ` · ${row.currentDaysLeft ?? "?"} days left now` : ""}
                  {row.newTrialEnd ? ` · new end ${day(row.newTrialEnd)}` : ""}
                  {row.reason ? ` · “${row.reason}”` : ""}
                  {row.decisionReason && row.status !== "PENDING" ? ` · decision: ${row.decisionReason}` : ""}
                  {row.stripeSync === "FAILED" ? " · Stripe not updated" : ""}
                </span>
              </span>
              {row.status === "PENDING" ? (
                <span className="flex gap-2">
                  <PermissionButton permission="gtm.trials.extend" onClick={() => setPending({ row, decision: "APPROVE" })} className={primary}>
                    Approve
                  </PermissionButton>
                  <PermissionButton permission="gtm.trials.extend" onClick={() => setPending({ row, decision: "DENY" })} className={secondary}>
                    Decline
                  </PermissionButton>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <ActionDialog
        open={pending !== null}
        dangerous
        title={pending ? `${DECISION_COPY[pending.decision].title}: ${pending.row.tenant.name} (+${pending.row.requestedDays} days)` : ""}
        description={pending ? DECISION_COPY[pending.decision].description : undefined}
        confirmLabel={pending ? DECISION_COPY[pending.decision].confirm : ""}
        onSubmit={async (reason) => {
          if (!pending) return;
          const result = await decide.mutateAsync({ id: pending.row.id, decision: pending.decision, reason });
          setMessage(
            result.request.status === "APPROVED"
              ? `${pending.row.tenant.name}: trial now ends ${day(result.request.newTrialEnd)}.${syncText(result.stripeSync)}`
              : `${pending.row.tenant.name}: request declined.`
          );
        }}
        onClose={() => setPending(null)}
      />
    </div>
  );
}

const CHECKS: Array<{ key: keyof Activation; text: string }> = [
  { key: "firstShipmentCreated", text: "First shipment" },
  { key: "teamInvited", text: "Team invited" },
  { key: "paymentMethodConnected", text: "Payments taken" },
  { key: "webhookConfigured", text: "Webhook configured" },
  { key: "customDomainSet", text: "Custom domain" }
];

export function TrialDetailPage() {
  const { tenantId = "" } = useParams();
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: [...KEY, "detail", tenantId], queryFn: async () => (await consoleApi.get<TrialDetail>(`/trials/${encodeURIComponent(tenantId)}`)).data });
  const extend = useMutation({
    mutationFn: async ({ days, reason }: { days: number; reason: string }) => (await consoleApi.post<DecisionResult>(`/trials/${encodeURIComponent(tenantId)}/extend`, { days, reason }, { idempotent: true })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY })
  });
  const [extending, setExtending] = useState(false);
  const [days, setDays] = useState("7");
  const [message, setMessage] = useState<string | null>(null);
  const data = detail.data;
  const trialing = data?.subscriptionStatus === "TRIALING";
  const maxDays = data?.thresholds?.consoleMax ?? 0;
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Trial</h1>
          {data ? (
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              <TenantChip tenantId={data.tenant.id} name={data.tenant.name} slug={data.tenant.slug} /> ·{" "}
              {trialing ? `${data.daysLeft ?? "?"} days left · ends ${day(data.trialEnd)}` : `not trialing (${(data.subscriptionStatus ?? "no subscription").toLowerCase()})`}
              {data.managedByStripe ? " · managed by Stripe" : ""}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <TrialsNav active="all" />
          {trialing ? (
            <PermissionButton permission="gtm.trials.extend" onClick={() => setExtending(true)} className={primary}>
              Extend trial
            </PermissionButton>
          ) : null}
        </div>
      </header>
      <Notice message={message} />
      {detail.isError ? <ConsoleApiErrorPanel error={detail.error} onRetry={() => void detail.refetch()} title="Unable to load this trial" /> : null}
      {data ? (
        <section className="rounded-lg border border-[var(--color-border)] bg-white p-4" aria-label="Activation">
          <h2 className="text-sm font-semibold">Activation</h2>
          {data.activation ? (
            <>
              <p className="mt-1 text-sm" data-testid="activation-score">
                {data.activation.score}/100 · scored {new Date(data.activation.scoredAt).toLocaleString()}
              </p>
              <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                {CHECKS.map((check) => (
                  <li key={check.key}>
                    {data.activation?.[check.key] ? "✓" : "✗"} {check.text}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">Not scored yet: the activation job runs nightly for trialing tenants.</p>
          )}
        </section>
      ) : null}
      {data ? (
        <section className="rounded-lg border border-[var(--color-border)] bg-white p-4" aria-label="Extensions">
          <h2 className="text-sm font-semibold">Extensions</h2>
          {data.requests.length === 0 ? <p className="mt-1 text-sm text-[var(--color-text-muted)]">No extension yet.</p> : null}
          <ul className="mt-2 space-y-1 text-sm">
            {data.requests.map((request) => (
              <li key={request.id} data-testid="trial-request">
                {day(request.createdAt)} · +{request.requestedDays} days · {request.source === "CONSOLE" ? "staff" : "tenant"} · {request.status.toLowerCase()}
                {request.previousTrialEnd || request.newTrialEnd ? ` · ${day(request.previousTrialEnd)} → ${day(request.newTrialEnd)}` : ""}
                {request.decisionReason ? ` · ${request.decisionReason}` : ""}
                {request.stripeSync === "FAILED" ? " · Stripe not updated" : ""}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <ActionDialog
        open={extending}
        dangerous
        title={data ? `Extend the trial: ${data.tenant.name}` : "Extend the trial"}
        description={`The trial end moves by these days (from today if it has passed) and the tenant admins are told. ${thresholdText(data?.thresholds ?? null)}`}
        confirmLabel="Extend"
        validate={() => {
          const value = Number(days);
          if (!maxDays) return "The day limit has not loaded yet.";
          return Number.isInteger(value) && value >= 1 && value <= maxDays ? null : `Choose between 1 and ${maxDays} days.`;
        }}
        onSubmit={async (reason) => {
          const result = await extend.mutateAsync({ days: Number(days), reason });
          setMessage(`Trial now ends ${day(result.request.newTrialEnd)}.${syncText(result.stripeSync)}`);
        }}
        onClose={() => setExtending(false)}
      >
        <label className={label}>
          Extra days
          <input aria-label="Extra days" type="number" min={1} max={maxDays || undefined} value={days} onChange={(event) => setDays(event.target.value)} className="mt-1 w-24 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" />
        </label>
      </ActionDialog>
    </div>
  );
}
