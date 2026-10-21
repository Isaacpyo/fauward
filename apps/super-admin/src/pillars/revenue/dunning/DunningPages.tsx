import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { DegradedBanner } from "@/components/service-kit/DegradedBanner";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { TenantPicker, type TenantOption } from "@/components/service-kit/TenantPicker";
import { apiErrorMessage } from "@/lib/console-api-error";
import {
  ACTION_LABEL,
  useAddStep,
  useApproveSaveOffer,
  useCreateSaveOffer,
  useCreateSequence,
  useDeleteSequence,
  useDeleteStep,
  useDunningOverview,
  useEnrollmentAction,
  usePatchSequence,
  usePatchStep,
  useSaveOffers,
  useSequence,
  useSequences,
  useTenantTimeline,
  type Enrollment,
  type EnrollmentAction
} from "@/pillars/revenue/dunning/api";

// revenue.dunning (WP-4.5): DunningOverviewPage, TenantDunningPage, SequencesPage, SequenceEditorPage, SaveOffersPage.

const input = "mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm";
const label = "block text-xs font-semibold text-[var(--color-text-muted)]";
const primary = "rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50";
const secondary = "rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold disabled:opacity-50";

function day(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

const STATUS_TONE: Record<string, string> = {
  ACTIVE: "bg-amber-100 text-amber-900",
  PAUSED: "bg-slate-100 text-slate-700",
  RECOVERED: "bg-green-100 text-green-800",
  EXHAUSTED: "bg-red-100 text-red-800",
  CANCELLED: "bg-slate-100 text-slate-700",
  PENDING: "bg-amber-100 text-amber-900",
  APPROVED: "bg-blue-100 text-blue-800",
  REDEEMED: "bg-green-100 text-green-800",
  EXPIRED: "bg-slate-100 text-slate-700"
};

function Pill({ status }: { status: string }) {
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${STATUS_TONE[status] ?? "bg-slate-100 text-slate-700"}`}>{status.charAt(0) + status.slice(1).toLowerCase()}</span>;
}

function Notice({ message }: { message: string | null }) {
  return message ? (
    <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
      {message}
    </p>
  ) : null;
}

function DunningNav({ active }: { active: "overview" | "sequences" | "offers" }) {
  const base = "rounded-md px-3 py-1.5 text-xs font-semibold";
  const item = (key: typeof active, to: string, text: string) => (
    <Link to={to} className={`${base} ${active === key ? "bg-[var(--fauward-navy)] text-white" : "border border-[var(--color-border)]"}`}>
      {text}
    </Link>
  );
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Dunning sections">
      {item("overview", "/revenue/dunning", "Overview")}
      {item("sequences", "/revenue/dunning/sequences", "Sequences")}
      {item("offers", "/revenue/dunning/save-offers", "Save offers")}
    </nav>
  );
}

const ACTION_COPY: Record<EnrollmentAction, { title: string; confirm: string; done: string; description: string }> = {
  retry: { title: "Retry payment", confirm: "Retry", done: "Retry requested.", description: "With Stripe this calls invoices.pay once (idempotent); without Stripe the tenant's admins get the update-your-card email." },
  pause: { title: "Pause dunning", confirm: "Pause", done: "Dunning paused.", description: "No further steps run until it is resumed." },
  resume: { title: "Resume dunning", confirm: "Resume", done: "Dunning resumed; due steps run at the next hourly sweep.", description: "Steps whose day has passed run at the next sweep." },
  cancel: { title: "Cancel dunning", confirm: "Cancel dunning", done: "Dunning cancelled.", description: "The enrolment ends; no further steps run. A suspension it already opened stays until the invoice is paid or staff lift it." }
};

function EnrollmentActions({ enrollment, onDone }: { enrollment: Enrollment; onDone: (message: string) => void }) {
  const run = useEnrollmentAction();
  const [action, setAction] = useState<EnrollmentAction | null>(null);
  const open = enrollment.status === "ACTIVE" || enrollment.status === "PAUSED" || enrollment.status === "EXHAUSTED";
  if (!open) return null;
  const buttons: EnrollmentAction[] = enrollment.status === "ACTIVE" ? ["retry", "pause", "cancel"] : enrollment.status === "PAUSED" ? ["retry", "resume", "cancel"] : ["retry", "cancel"];
  return (
    <div className="flex flex-wrap gap-1">
      {buttons.map((item) => (
        <PermissionButton key={item} permission="revenue.dunning.write" onClick={() => setAction(item)} className={secondary}>
          {ACTION_COPY[item].confirm}
        </PermissionButton>
      ))}
      <ActionDialog
        open={action !== null}
        dangerous
        title={action ? `${ACTION_COPY[action].title}: invoice ${enrollment.invoiceId}` : ""}
        description={action ? ACTION_COPY[action].description : undefined}
        confirmLabel={action ? ACTION_COPY[action].confirm : ""}
        onSubmit={async (reason) => {
          if (!action) return;
          const result = await run.mutateAsync({ id: enrollment.id, action, reason });
          onDone(action === "retry" ? (result.channel === "stripe" ? "Payment retried in Stripe." : "Update-your-card email sent.") : ACTION_COPY[action].done);
        }}
        onClose={() => setAction(null)}
      />
    </div>
  );
}

export function DunningOverviewPage() {
  const overview = useDunningOverview();
  const [message, setMessage] = useState<string | null>(null);
  const data = overview.data;
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Dunning</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Failed Fauward invoices follow the default sequence: emails, then the suspend step. Paying the invoice recovers the tenant automatically.</p>
        </div>
        <DunningNav active="overview" />
      </header>
      <Notice message={message} />
      {data?.stripe && !data.stripe.configured ? (
        <DegradedBanner variant="vendor-unconfigured" fixedBy={data.stripe.missing.join(", ")}>
          Stripe is not configured: overdue Fauward invoices are enrolled by the hourly sweep, retries send the update-your-card email, and staff record payments in Billing.
        </DegradedBanner>
      ) : null}
      {overview.isError ? <ConsoleApiErrorPanel error={overview.error} onRetry={() => void overview.refetch()} title="Unable to load dunning" /> : null}
      {overview.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading dunning…</p> : null}
      {data ? (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Enrolments ({data.enrollments.length})</h2>
            {data.enrollments.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No tenant is in dunning.</p> : null}
            {data.enrollments.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[var(--color-text-muted)]">
                      <th className="px-3 py-2">Tenant</th>
                      <th className="px-3 py-2">Invoice</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Progress</th>
                      <th className="px-3 py-2">Next</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {data.enrollments.map((row) => (
                      <tr key={row.id} data-testid="enrollment-row">
                        <td className="px-3 py-2">
                          <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} />{" "}
                          <Link to={`/revenue/dunning/tenants/${encodeURIComponent(row.tenant.id)}`} className="text-xs underline">
                            timeline
                          </Link>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {row.invoiceId}
                          <span className="ml-1 font-sans text-[var(--color-text-muted)]">({row.source === "STRIPE" ? "Stripe" : "Fauward"})</span>
                        </td>
                        <td className="px-3 py-2">
                          <Pill status={row.status} />
                        </td>
                        <td className="px-3 py-2 text-xs tabular-nums">
                          {row.stepsDone}/{row.stepsTotal} steps · {row.sequence.name}
                        </td>
                        <td className="px-3 py-2 text-xs">{row.nextStep ? `Day ${row.nextStep.dayOffset}: ${ACTION_LABEL[row.nextStep.action] ?? row.nextStep.action} (${day(row.nextStep.dueAt)})` : "—"}</td>
                        <td className="px-3 py-2">
                          <EnrollmentActions enrollment={row} onDone={setMessage} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Failed payments (30 days)</h2>
            {data.failedPayments.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No failed Fauward payments in the last 30 days.</p> : null}
            <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white text-sm">
              {data.failedPayments.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" data-testid="failed-payment-row">
                  <span>
                    <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} /> <span className="font-mono text-xs">{row.invoiceRef ?? "—"}</span>
                    {row.attempt ? <span className="text-xs text-[var(--color-text-muted)]"> · attempt {row.attempt}</span> : null}
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)]">
                    {row.amount ? `${row.amount} ${row.currency} · ` : ""}
                    {when(row.at)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Overdue Fauward invoices</h2>
            {data.overdueInvoices.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No overdue invoices.</p> : null}
            <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white text-sm">
              {data.overdueInvoices.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" data-testid="overdue-invoice-row">
                  <span>
                    <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} />{" "}
                    <Link to={`/revenue/billing/invoices/${encodeURIComponent(row.id)}`} className="text-xs underline">
                      {row.invoiceNumber}
                    </Link>
                  </span>
                  <span className="text-xs">
                    {row.total} {row.currency} · due {day(row.dueDate)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}

export function TenantDunningPage() {
  const { tenantId = "" } = useParams();
  const timeline = useTenantTimeline(tenantId);
  const [message, setMessage] = useState<string | null>(null);
  const data = timeline.data;
  return (
    <div className="space-y-4">
      <header>
        <Link to="/revenue/dunning" className="text-xs font-semibold text-[var(--color-text-muted)] hover:underline">
          Dunning
        </Link>
        <h1 className="flex items-center gap-2 text-xl font-bold text-[var(--color-text-primary)]">
          Dunning timeline {data ? <TenantChip tenantId={data.tenant.id} name={data.tenant.name} slug={data.tenant.slug} /> : null}
        </h1>
      </header>
      <Notice message={message} />
      {timeline.isError ? <ConsoleApiErrorPanel error={timeline.error} onRetry={() => void timeline.refetch()} title="Unable to load the timeline" /> : null}
      {timeline.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading…</p> : null}
      {data && data.enrollments.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">This tenant has never been in dunning.</p> : null}
      {data?.enrollments.map((enrollment) => (
        <section key={enrollment.id} className="space-y-2 rounded-lg border border-[var(--color-border)] bg-white p-4" data-testid="timeline-enrollment">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              <span className="font-mono">{enrollment.invoiceId}</span> · {enrollment.sequence.name} · <Pill status={enrollment.status} />
              {enrollment.endedReason ? <span className="text-xs text-[var(--color-text-muted)]"> · {enrollment.endedReason}</span> : null}
            </p>
            <EnrollmentActions enrollment={enrollment} onDone={setMessage} />
          </div>
          <ol className="grid gap-2 sm:grid-cols-4">
            {enrollment.steps.map((step) => (
              <li key={step.id} data-testid="timeline-step" className={`rounded-md border px-3 py-2 text-xs ${step.done ? "border-green-200 bg-green-50" : "border-[var(--color-border)]"}`}>
                <p className="font-semibold">Day {step.dayOffset}: {ACTION_LABEL[step.action] ?? step.action}</p>
                <p className="text-[var(--color-text-muted)]">{step.done ? "Done" : `Due ${day(step.dueAt)}`}</p>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {data && data.events.length > 0 ? (
        <section className="space-y-2 rounded-lg border border-[var(--color-border)] bg-white p-4">
          <h2 className="text-sm font-semibold">Events</h2>
          <ul className="divide-y divide-[var(--color-border)] text-sm">
            {data.events.map((event) => (
              <li key={event.id} className="py-1.5" data-testid="timeline-event">
                <span className="font-mono text-xs">{event.eventType}</span>
                {event.invoiceId ? <span className="text-xs"> · {event.invoiceId}</span> : null}
                <span className="text-xs text-[var(--color-text-muted)]"> · {when(event.createdAt)}</span>
                {event.metadata && typeof event.metadata.outcome === "string" ? <span className="text-xs"> · {String(event.metadata.action ?? "")} {event.metadata.outcome.toLowerCase()}</span> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export function SequencesPage() {
  const sequences = useSequences();
  const create = useCreateSequence();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const rows = sequences.data?.data ?? [];
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Dunning sequences</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">New failed invoices follow the default sequence. Exactly one sequence is the default.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DunningNav active="sequences" />
          <PermissionButton permission="revenue.dunning.write" onClick={() => setCreating(true)} className={primary}>
            New sequence
          </PermissionButton>
        </div>
      </header>
      {sequences.isError ? <ConsoleApiErrorPanel error={sequences.error} onRetry={() => void sequences.refetch()} title="Unable to load sequences" /> : null}
      {sequences.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading…</p> : null}
      <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-testid="sequence-row">
            <div>
              <Link to={`/revenue/dunning/sequences/${encodeURIComponent(row.id)}`} className="font-semibold text-[var(--fauward-navy)] hover:underline">
                {row.name}
              </Link>
              {row.isDefault ? <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-semibold text-blue-800">Default</span> : null}
              {!row.active ? <span className="ml-2 text-xs text-[var(--color-text-muted)]">inactive</span> : null}
              <p className="text-xs text-[var(--color-text-muted)]">{row.steps.map((step) => `day ${step.dayOffset} ${ACTION_LABEL[step.action] ?? step.action}`).join(" → ") || "No steps"}</p>
            </div>
            <span className="text-xs text-[var(--color-text-muted)]">{row.activeEnrollments} running</span>
          </li>
        ))}
      </ul>
      <ActionDialog
        open={creating}
        title="New dunning sequence"
        description="Add its steps next; make it the default when it is ready."
        confirmLabel="Create"
        validate={() => (name.trim().length >= 2 ? null : "Name the sequence.")}
        onSubmit={async () => {
          const created = await create.mutateAsync({ name: name.trim() });
          setName("");
          navigate(`/revenue/dunning/sequences/${encodeURIComponent(created.id)}`);
        }}
        onClose={() => setCreating(false)}
      >
        <label className={label}>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} className={input} />
        </label>
      </ActionDialog>
    </div>
  );
}

export function SequenceEditorPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const sequence = useSequence(id);
  const meta = useSequences();
  const patch = usePatchSequence(id);
  const remove = useDeleteSequence();
  const addStep = useAddStep(id);
  const patchStep = usePatchStep(id);
  const deleteStep = useDeleteStep(id);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [newDay, setNewDay] = useState("0");
  const [newAction, setNewAction] = useState("EMAIL");
  const [newTemplate, setNewTemplate] = useState("billing_payment_failed");
  const [deleting, setDeleting] = useState(false);
  const row = sequence.data;
  const actions = meta.data?.actions ?? ["EMAIL", "EMAIL_IN_APP", "RETRY_PAYMENT", "SUSPEND"];
  const templates = meta.data?.templates ?? ["billing_payment_failed", "billing_final_warning"];
  useEffect(() => setName(row?.name ?? ""), [row?.name]);

  async function attempt(work: () => Promise<unknown>, done: string) {
    setError(null);
    setMessage(null);
    try {
      await work();
      setMessage(done);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "The change was not saved."));
    }
  }

  const emailAction = newAction === "EMAIL" || newAction === "EMAIL_IN_APP";
  return (
    <div className="space-y-4">
      <header>
        <Link to="/revenue/dunning/sequences" className="text-xs font-semibold text-[var(--color-text-muted)] hover:underline">
          Dunning sequences
        </Link>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{row?.name ?? "Sequence"}</h1>
        {row ? (
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {row.isDefault ? "Default sequence" : "Not the default"} · {row.activeEnrollments} running enrolment(s){row.activeEnrollments > 0 ? " — step timing is locked while they run" : ""}
          </p>
        ) : null}
      </header>
      <Notice message={message} />
      {error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {sequence.isError ? <ConsoleApiErrorPanel error={sequence.error} onRetry={() => void sequence.refetch()} title="Unable to load the sequence" /> : null}
      {row ? (
        <>
          <section className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--color-border)] bg-white p-4">
            <label className={`${label} flex-1`}>
              Name
              <input value={name} onChange={(event) => setName(event.target.value)} className={input} />
            </label>
            <PermissionButton permission="revenue.dunning.write" disabled={name.trim() === row.name || name.trim().length < 2} onClick={() => void attempt(() => patch.mutateAsync({ name: name.trim() }), "Renamed.")} className={secondary}>
              Rename
            </PermissionButton>
            {!row.isDefault ? (
              <PermissionButton permission="revenue.dunning.write" onClick={() => void attempt(() => patch.mutateAsync({ isDefault: true }), "This is now the default sequence.")} className={secondary}>
                Make default
              </PermissionButton>
            ) : null}
            {!row.isDefault ? (
              <PermissionButton permission="revenue.dunning.write" onClick={() => setDeleting(true)} className="rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-700">
                Delete
              </PermissionButton>
            ) : null}
          </section>
          <section className="space-y-2 rounded-lg border border-[var(--color-border)] bg-white p-4">
            <h2 className="text-sm font-semibold">Steps (days after the payment failed)</h2>
            {row.steps.length === 0 ? <p className="text-xs text-[var(--color-text-muted)]">No steps yet.</p> : null}
            <ul className="space-y-1">
              {row.steps.map((step) => (
                <li key={step.id} className="flex flex-wrap items-center justify-between gap-2 text-sm" data-testid="sequence-step">
                  <span>
                    Day {step.dayOffset}: {ACTION_LABEL[step.action] ?? step.action}
                    {step.action === "EMAIL" || step.action === "EMAIL_IN_APP" ? <span className="font-mono text-xs text-[var(--color-text-muted)]"> ({step.template})</span> : null}
                  </span>
                  <span className="flex gap-1">
                    <select
                      aria-label={`Action for day ${step.dayOffset}`}
                      value={step.action}
                      onChange={(event) => void attempt(() => patchStep.mutateAsync({ stepId: step.id, action: event.target.value }), "Step updated.")}
                      className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs"
                    >
                      {actions.map((action) => (
                        <option key={action} value={action}>
                          {ACTION_LABEL[action] ?? action}
                        </option>
                      ))}
                    </select>
                    <PermissionButton permission="revenue.dunning.write" onClick={() => void attempt(() => deleteStep.mutateAsync(step.id), "Step removed.")} className="text-xs underline">
                      Remove
                    </PermissionButton>
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-end gap-2 border-t border-[var(--color-border)] pt-3">
              <label className={label}>
                Day
                <input value={newDay} onChange={(event) => setNewDay(event.target.value)} inputMode="numeric" className={`${input} w-20`} />
              </label>
              <label className={label}>
                Action
                <select aria-label="New step action" value={newAction} onChange={(event) => setNewAction(event.target.value)} className={input}>
                  {actions.map((action) => (
                    <option key={action} value={action}>
                      {ACTION_LABEL[action] ?? action}
                    </option>
                  ))}
                </select>
              </label>
              {emailAction ? (
                <label className={label}>
                  Email
                  <select aria-label="New step email" value={newTemplate} onChange={(event) => setNewTemplate(event.target.value)} className={input}>
                    {templates.map((template) => (
                      <option key={template}>{template}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              <PermissionButton
                permission="revenue.dunning.write"
                disabled={!/^\d{1,3}$/.test(newDay)}
                onClick={() => void attempt(() => addStep.mutateAsync({ dayOffset: Number(newDay), action: newAction, ...(emailAction ? { template: newTemplate } : {}) }), "Step added.")}
                className={primary}
              >
                Add step
              </PermissionButton>
            </div>
          </section>
        </>
      ) : null}
      <ActionDialog
        open={deleting}
        title="Delete this sequence?"
        description="Only a sequence no enrolment ever used can be deleted."
        confirmLabel="Delete"
        onSubmit={async () => {
          await remove.mutateAsync(id);
          navigate("/revenue/dunning/sequences", { replace: true });
        }}
        onClose={() => setDeleting(false)}
      />
    </div>
  );
}

export function SaveOffersPage() {
  const offers = useSaveOffers();
  const create = useCreateSaveOffer();
  const approve = useApproveSaveOffer();
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const [tenant, setTenant] = useState<TenantOption | null>(null);
  const [discount, setDiscount] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [reason, setReason] = useState("");
  const rows = offers.data ?? [];
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Save offers</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">A credit proposed for a tenant at risk. A second person approves it, which generates the code the tenant redeems once in Billing.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <DunningNav active="offers" />
          <PermissionButton permission="revenue.dunning.write" onClick={() => setCreating(true)} className={primary}>
            New offer
          </PermissionButton>
        </div>
      </header>
      <Notice message={message} />
      {offers.isError ? <ConsoleApiErrorPanel error={offers.error} onRetry={() => void offers.refetch()} title="Unable to load save offers" /> : null}
      {offers.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No save offers yet.</p> : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-muted)]">
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2 text-right">Credit</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Expires</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((row) => (
                <tr key={row.id} data-testid="save-offer-row">
                  <td className="px-3 py-2">
                    <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} />
                    {row.reason ? <p className="text-xs text-[var(--color-text-muted)]">{row.reason}</p> : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.discount} GBP</td>
                  <td className="px-3 py-2">
                    <Pill status={row.status} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{row.code ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{day(row.expiresAt)}</td>
                  <td className="px-3 py-2">
                    {row.status === "PENDING" ? (
                      <PermissionButton permission="revenue.dunning.write" onClick={() => setApproving(row.id)} className={secondary}>
                        Approve
                      </PermissionButton>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <ActionDialog
        open={creating}
        title="New save offer"
        description="It starts PENDING; approving it (a dangerous action) generates the code."
        confirmLabel="Create offer"
        validate={() => (!tenant ? "Choose a tenant." : !/^\d{1,8}(\.\d{1,2})?$/.test(discount) || Number(discount) <= 0 ? "Enter the credit in GBP, e.g. 25.00." : reason.trim().length < 3 ? "Say why." : null)}
        onSubmit={async () => {
          if (!tenant) return;
          await create.mutateAsync({ tenantId: tenant.id, discount, reason: reason.trim(), ...(expiresOn ? { expiresAt: new Date(`${expiresOn}T23:59:59Z`).toISOString() } : {}) });
          setMessage(`Offer of ${discount} GBP created for ${tenant.name}; it needs approval.`);
          setTenant(null);
          setDiscount("");
          setReason("");
          setExpiresOn("");
        }}
        onClose={() => setCreating(false)}
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
        <label className={label}>
          Credit (GBP)
          <input value={discount} onChange={(event) => setDiscount(event.target.value)} inputMode="decimal" className={input} />
        </label>
        <label className={label}>
          Expires on (optional, default 14 days)
          <input type="date" value={expiresOn} onChange={(event) => setExpiresOn(event.target.value)} className={input} />
        </label>
        <label className={label}>
          Why
          <input value={reason} onChange={(event) => setReason(event.target.value)} className={input} />
        </label>
      </ActionDialog>
      <ActionDialog
        open={approving !== null}
        dangerous
        title="Approve this save offer"
        description="Generates the code and tells the tenant's admins it is waiting in Billing."
        confirmLabel="Approve"
        onSubmit={async (why) => {
          if (!approving) return;
          const offer = await approve.mutateAsync({ id: approving, reason: why });
          setMessage(`Approved: code ${offer.code}.`);
        }}
        onClose={() => setApproving(null)}
      />
    </div>
  );
}
