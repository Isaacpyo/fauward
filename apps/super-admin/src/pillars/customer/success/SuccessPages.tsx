import { type ReactNode, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { usePermission } from "@fauward/internal-rbac";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { TenantPicker, type TenantOption } from "@/components/service-kit/TenantPicker";
import { apiErrorMessage } from "@/lib/console-api-error";
import {
  stepLabel,
  triggerLabel,
  useAtRisk,
  useDeletePlaybook,
  useExpansion,
  useOverview,
  usePlaybook,
  usePlaybooks,
  useQueueScoring,
  useRunPlaybook,
  useRuns,
  useSavePlaybook,
  useScoringModel,
  useTogglePlaybook,
  type Step
} from "@/pillars/customer/success/api";

// customer.success (WP-4.8): CsOverviewPage, AtRiskPage, ExpansionPage, ScoringModelPage, PlaybooksPage,
// PlaybookEditorPage, PlaybookRunsPage.

const input = "mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm";
const label = "block text-xs font-semibold text-[var(--color-text-muted)]";
const primary = "rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50";

function SuccessNav({ active }: { active: "overview" | "at-risk" | "expansion" | "playbooks" | "model" }) {
  const base = "rounded-md px-3 py-1.5 text-xs font-semibold";
  const item = (key: typeof active, to: string, text: string) => (
    <Link to={to} className={`${base} ${active === key ? "bg-[var(--fauward-navy)] text-white" : "border border-[var(--color-border)]"}`}>
      {text}
    </Link>
  );
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Customer success sections">
      {item("overview", "/customer/success", "Overview")}
      {item("at-risk", "/customer/success/at-risk", "At risk")}
      {item("expansion", "/customer/success/expansion", "Expansion")}
      {item("playbooks", "/customer/success/playbooks", "Playbooks")}
      {item("model", "/customer/success/health-scoring", "Scoring model")}
    </nav>
  );
}

function Header({ title, text, active, action }: { title: string; text: string; active: Parameters<typeof SuccessNav>[0]["active"]; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{title}</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">{text}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SuccessNav active={active} />
        {action}
      </div>
    </header>
  );
}

function Notice({ message }: { message: string | null }) {
  return message ? (
    <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
      {message}
    </p>
  ) : null;
}

export function CsOverviewPage() {
  const overview = useOverview();
  const data = overview.data;
  return (
    <div className="space-y-4">
      <Header title="Customer success" text="Health from the nightly score: who is at risk, who is moving, who is ready to grow." active="overview" />
      {overview.isError ? <ConsoleApiErrorPanel error={overview.error} onRetry={() => void overview.refetch()} title="Unable to load the overview" /> : null}
      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              ["Scored tenants", data.scoredTenants, "cs-scored"],
              ["At risk", data.distribution.atRisk, "cs-at-risk"],
              ["Watch", data.distribution.watch, "cs-watch"],
              ["Healthy", data.distribution.healthy, "cs-healthy"]
            ].map(([text, value, testId]) => (
              <div key={String(testId)} className="rounded-lg border border-[var(--color-border)] bg-white p-4" data-testid={String(testId)}>
                <p className="text-xs text-[var(--color-text-muted)]">{text}</p>
                <p className="text-2xl font-bold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-[var(--color-text-muted)]">
            {data.lastScoringRun ? `Last scoring run ${new Date(data.lastScoringRun.startedAt).toLocaleString()} (${data.lastScoringRun.status.toLowerCase()}).` : "The nightly scoring job has not run yet."}
          </p>
          <section className="space-y-2">
            <h2 className="text-sm font-semibold">Biggest movers</h2>
            {data.movers.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No tenant&apos;s score changed between its last two runs.</p> : null}
            <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white text-sm">
              {data.movers.map((row) => (
                <li key={row.tenant.id} className="flex items-center justify-between px-3 py-2" data-testid="cs-mover">
                  <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} />
                  <span className={`tabular-nums ${row.change < 0 ? "text-red-700" : "text-green-700"}`}>
                    {row.previous} → {row.score} ({row.change > 0 ? "+" : ""}
                    {row.change})
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

export function AtRiskPage() {
  const atRisk = useAtRisk();
  const rows = atRisk.data?.data ?? [];
  return (
    <div className="space-y-4">
      <Header title="At-risk tenants" text={`Latest score below ${atRisk.data?.threshold ?? "the at-risk band"}, or down two weeks running. Highest ARR first.`} active="at-risk" />
      {atRisk.isError ? <ConsoleApiErrorPanel error={atRisk.error} onRetry={() => void atRisk.refetch()} title="Unable to load at-risk tenants" /> : null}
      {atRisk.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No tenant is at risk.</p> : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-muted)]">
                <th className="px-3 py-2">Tenant</th>
                <th className="px-3 py-2 text-right">Score</th>
                <th className="px-3 py-2">Why</th>
                <th className="px-3 py-2 text-right">ARR</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((row) => (
                <tr key={row.tenant.id} data-testid="at-risk-row">
                  <td className="px-3 py-2">
                    <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{row.score}</td>
                  <td className="px-3 py-2 text-xs">{row.reasons.join("; ")}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">{row.arrCurrency ? `${row.arr} ${row.arrCurrency}` : "No subscription"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

export function ExpansionPage() {
  const expansion = useExpansion();
  const rows = expansion.data?.data ?? [];
  return (
    <div className="space-y-4">
      <Header title="Expansion candidates" text={`Tenants using more than ${Math.round((expansion.data?.threshold ?? 0.8) * 100)}% of a plan limit this month.`} active="expansion" />
      {expansion.isError ? <ConsoleApiErrorPanel error={expansion.error} onRetry={() => void expansion.refetch()} title="Unable to load expansion candidates" /> : null}
      {expansion.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No tenant is near a plan limit.</p> : null}
      <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white text-sm">
        {rows.map((row) => (
          <li key={row.tenant.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" data-testid="expansion-row">
            <span>
              <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} /> <span className="text-xs text-[var(--color-text-muted)]">{row.tenant.plan}</span>
            </span>
            <span className="text-xs">{row.signals.map((signal) => `${signal.limit}: ${signal.used} of ${signal.of} (${Math.round(signal.ratio * 100)}%)`).join(" · ")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ScoringModelPage() {
  const model = useScoringModel();
  const queue = useQueueScoring();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const data = model.data;
  return (
    <div className="space-y-4">
      <Header
        title="Health scoring model"
        text="The nightly score's factors and weights (set in code, version-stamped on every score)."
        active="model"
        action={
          <PermissionButton
            permission="customer.success.write"
            disabled={queue.isPending}
            onClick={() => {
              setError(null);
              queue
                .mutateAsync()
                .then(() => setMessage("Scoring run queued; results appear when the job finishes (see Background jobs)."))
                .catch((err: unknown) => setError(apiErrorMessage(err, "The run was not queued.")));
            }}
            className={primary}
          >
            Run scoring now
          </PermissionButton>
        }
      />
      <Notice message={message} />
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {model.isError ? <ConsoleApiErrorPanel error={model.error} onRetry={() => void model.refetch()} title="Unable to load the model" /> : null}
      {data ? (
        <>
          <p className="text-sm">
            Version {data.version} · at risk below {data.bands.atRiskBelow} · healthy from {data.bands.healthyFrom} · tenants younger than {data.minTenantAgeDays} days are not scored
          </p>
          <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white text-sm">
            {data.factors.map((factor) => (
              <li key={factor.key} className="px-3 py-2" data-testid="scoring-factor">
                <p className="font-semibold">
                  {factor.label} <span className="font-normal tabular-nums text-[var(--color-text-muted)]">· weight {factor.weight}</span>
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">{factor.definition}</p>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

export function PlaybooksPage() {
  const playbooks = usePlaybooks();
  const toggle = useTogglePlaybook();
  const canWrite = usePermission("customer.success.write") === true;
  const rows = playbooks.data?.data ?? [];
  return (
    <div className="space-y-4">
      <Header
        title="Playbooks"
        text="Step lists run for one tenant — by hand, or automatically when their trigger matches (at most once per tenant every 30 days)."
        active="playbooks"
        action={
          canWrite ? (
            <Link to="/customer/success/playbooks/new" className={primary}>
              New playbook
            </Link>
          ) : (
            <PermissionButton permission="customer.success.write" className={primary}>
              New playbook
            </PermissionButton>
          )
        }
      />
      {playbooks.isError ? <ConsoleApiErrorPanel error={playbooks.error} onRetry={() => void playbooks.refetch()} title="Unable to load playbooks" /> : null}
      {playbooks.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No playbooks yet.</p> : null}
      <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-testid="playbook-row">
            <div>
              <Link to={`/customer/success/playbooks/${encodeURIComponent(row.id)}`} className="font-semibold text-[var(--fauward-navy)] hover:underline">
                {row.name}
              </Link>
              {!row.active ? <span className="ml-2 text-xs text-[var(--color-text-muted)]">inactive</span> : null}
              <p className="text-xs text-[var(--color-text-muted)]">
                {triggerLabel(row.trigger, row.triggerValue)} · {row.steps.length} step{row.steps.length === 1 ? "" : "s"}
              </p>
            </div>
            <span className="flex items-center gap-3 text-xs">
              <Link to={`/customer/success/playbooks/${encodeURIComponent(row.id)}/runs`} className="underline">
                {row.runs ?? 0} runs{row.running ? ` (${row.running} in progress)` : ""}
              </Link>
              <PermissionButton permission="customer.success.write" onClick={() => void toggle.mutateAsync({ id: row.id, active: !row.active })} className="underline">
                {row.active ? "Deactivate" : "Activate"}
              </PermissionButton>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const STEP_TYPES: Array<{ type: Step["type"]; text: string }> = [
  { type: "EMAIL_TENANT_ADMINS", text: "Email tenant admins" },
  { type: "CREATE_PLATFORM_TICKET", text: "Open a Fauward ticket" },
  { type: "NOTIFY_STAFF", text: "Notify staff" },
  { type: "WAIT", text: "Wait" }
];

function blankStep(type: Step["type"]): Step {
  if (type === "EMAIL_TENANT_ADMINS") return { type, template: "platform_announcement", subject: "", body: "" };
  if (type === "CREATE_PLATFORM_TICKET") return { type, subject: "", body: "" };
  if (type === "NOTIFY_STAFF") return { type, permission: "customer.success.read", text: "" };
  return { type, days: 3 };
}

function StepEditor({ step, index, templates, onChange, onRemove }: { step: Step; index: number; templates: string[]; onChange: (step: Step) => void; onRemove: () => void }) {
  return (
    <li className="space-y-2 rounded-md border border-[var(--color-border)] p-3" data-testid="playbook-step-editor">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">
          {index + 1}. {STEP_TYPES.find((item) => item.type === step.type)?.text}
        </span>
        <button type="button" onClick={onRemove} className="text-xs underline">
          Remove
        </button>
      </div>
      {step.type === "EMAIL_TENANT_ADMINS" ? (
        <>
          <label className={label}>
            Email template
            <select aria-label={`Step ${index + 1} template`} value={step.template} onChange={(event) => onChange({ ...step, template: event.target.value })} className={input}>
              {templates.map((template) => (
                <option key={template}>{template}</option>
              ))}
            </select>
          </label>
          <label className={label}>
            Subject
            <input aria-label={`Step ${index + 1} subject`} value={step.subject} onChange={(event) => onChange({ ...step, subject: event.target.value })} className={input} />
          </label>
          <label className={label}>
            Message
            <textarea aria-label={`Step ${index + 1} message`} value={step.body} onChange={(event) => onChange({ ...step, body: event.target.value })} rows={3} className={input} />
          </label>
        </>
      ) : null}
      {step.type === "CREATE_PLATFORM_TICKET" ? (
        <>
          <label className={label}>
            Ticket subject
            <input aria-label={`Step ${index + 1} subject`} value={step.subject} onChange={(event) => onChange({ ...step, subject: event.target.value })} className={input} />
          </label>
          <label className={label}>
            First message (the tenant sees it)
            <textarea aria-label={`Step ${index + 1} message`} value={step.body} onChange={(event) => onChange({ ...step, body: event.target.value })} rows={3} className={input} />
          </label>
        </>
      ) : null}
      {step.type === "NOTIFY_STAFF" ? (
        <>
          <label className={label}>
            Staff holding permission
            <input aria-label={`Step ${index + 1} permission`} value={step.permission} onChange={(event) => onChange({ ...step, permission: event.target.value })} className={`${input} font-mono`} />
          </label>
          <label className={label}>
            Text
            <input aria-label={`Step ${index + 1} text`} value={step.text} onChange={(event) => onChange({ ...step, text: event.target.value })} className={input} />
          </label>
        </>
      ) : null}
      {step.type === "WAIT" ? (
        <label className={label}>
          Days
          <input aria-label={`Step ${index + 1} days`} value={String(step.days)} onChange={(event) => onChange({ ...step, days: Number(event.target.value) || 0 })} inputMode="numeric" className={`${input} w-24`} />
        </label>
      ) : null}
    </li>
  );
}

export function PlaybookEditorPage() {
  const { id = "new" } = useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const existing = usePlaybook(id);
  const meta = usePlaybooks();
  const save = useSavePlaybook(isNew ? null : id);
  const remove = useDeletePlaybook();
  const run = useRunPlaybook(id);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [trigger, setTrigger] = useState("MANUAL");
  const [triggerValue, setTriggerValue] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [active, setActive] = useState(true);
  const [addType, setAddType] = useState<Step["type"]>("EMAIL_TENANT_ADMINS");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"run" | "delete" | null>(null);
  const [tenant, setTenant] = useState<TenantOption | null>(null);
  const templates = meta.data?.templates ?? ["platform_announcement", "onboarding_nudge"];

  useEffect(() => {
    if (!existing.data) return;
    setName(existing.data.name);
    setDescription(existing.data.description ?? "");
    setTrigger(existing.data.trigger);
    setTriggerValue(existing.data.triggerValue ? String(existing.data.triggerValue) : "");
    setSteps(existing.data.steps);
    setActive(existing.data.active);
  }, [existing.data]);

  const needsValue = trigger === "HEALTH_BELOW" || trigger === "TRIAL_ENDING";

  async function submit() {
    setError(null);
    setMessage(null);
    try {
      const saved = await save.mutateAsync({ name: name.trim(), description: description.trim() || null, trigger, triggerValue: needsValue ? Number(triggerValue) : null, steps, active });
      if (isNew) navigate(`/customer/success/playbooks/${encodeURIComponent(saved.id)}`, { replace: true });
      else setMessage("Playbook saved.");
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "The playbook was not saved."));
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/customer/success/playbooks" className="text-xs font-semibold text-[var(--color-text-muted)] hover:underline">
            Playbooks
          </Link>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{isNew ? "New playbook" : existing.data?.name ?? "Playbook"}</h1>
        </div>
        {!isNew && existing.data ? (
          <div className="flex gap-2">
            <Link to={`/customer/success/playbooks/${encodeURIComponent(id)}/runs`} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold">
              Runs
            </Link>
            <PermissionButton permission="customer.success.write" disabled={!existing.data.active} title={existing.data.active ? undefined : "Activate the playbook to run it"} onClick={() => setDialog("run")} className={primary}>
              Run for a tenant
            </PermissionButton>
          </div>
        ) : null}
      </header>
      <Notice message={message} />
      {existing.isError ? <ConsoleApiErrorPanel error={existing.error} onRetry={() => void existing.refetch()} title="Unable to load the playbook" /> : null}
      <section className="space-y-3 rounded-lg border border-[var(--color-border)] bg-white p-4">
        <label className={label}>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} className={input} />
        </label>
        <label className={label}>
          Description (optional)
          <input value={description} onChange={(event) => setDescription(event.target.value)} className={input} />
        </label>
        <div className="flex flex-wrap items-end gap-3">
          <label className={label}>
            Trigger
            <select value={trigger} onChange={(event) => setTrigger(event.target.value)} className={input}>
              <option value="MANUAL">Manual only</option>
              <option value="HEALTH_BELOW">Health score below…</option>
              <option value="TRIAL_ENDING">Trial ends within… days</option>
              <option value="PAYMENT_FAILED">Fauward payment failed</option>
            </select>
          </label>
          {needsValue ? (
            <label className={label}>
              {trigger === "HEALTH_BELOW" ? "Score" : "Days"}
              <input aria-label="Trigger value" value={triggerValue} onChange={(event) => setTriggerValue(event.target.value)} inputMode="numeric" className={`${input} w-24`} />
            </label>
          ) : null}
          <label className="flex items-center gap-2 text-xs font-semibold">
            <input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
            Active
          </label>
        </div>
        <h2 className="text-sm font-semibold">Steps</h2>
        <ol className="space-y-2">
          {steps.map((step, index) => (
            <StepEditor
              key={index}
              step={step}
              index={index}
              templates={templates}
              onChange={(next) => setSteps((current) => current.map((item, position) => (position === index ? next : item)))}
              onRemove={() => setSteps((current) => current.filter((_, position) => position !== index))}
            />
          ))}
        </ol>
        <div className="flex items-end gap-2">
          <label className={label}>
            Add a step
            <select aria-label="New step type" value={addType} onChange={(event) => setAddType(event.target.value as Step["type"])} className={input}>
              {STEP_TYPES.map((item) => (
                <option key={item.type} value={item.type}>
                  {item.text}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => setSteps((current) => [...current, blankStep(addType)])} className="rounded-md border border-[var(--color-border)] px-3 py-2 text-xs font-semibold">
            Add
          </button>
        </div>
        {error ? (
          <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <div className="flex justify-between">
          <PermissionButton permission="customer.success.write" disabled={save.isPending || name.trim().length < 3 || steps.length === 0 || (needsValue && !/^\d+$/.test(triggerValue))} onClick={() => void submit()} className={primary}>
            {isNew ? "Create playbook" : "Save playbook"}
          </PermissionButton>
          {!isNew ? (
            <PermissionButton permission="customer.success.write" onClick={() => setDialog("delete")} className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700">
              Delete
            </PermissionButton>
          ) : null}
        </div>
      </section>
      <ActionDialog
        open={dialog === "run"}
        title={`Run ${existing.data?.name ?? "this playbook"} for a tenant`}
        description="Steps up to the first wait run now; the rest follow on schedule."
        confirmLabel="Start run"
        validate={() => (tenant ? null : "Choose a tenant.")}
        onSubmit={async () => {
          if (!tenant) return;
          const result = await run.mutateAsync(tenant.id);
          setMessage(`Run started for ${tenant.name}: ${result.status.toLowerCase()}.`);
          setTenant(null);
        }}
        onClose={() => setDialog(null)}
      >
        {tenant ? (
          <p className="text-sm">
            Tenant: <TenantChip tenantId={tenant.id} name={tenant.name} slug={tenant.slug} />
          </p>
        ) : (
          <TenantPicker onSelect={setTenant} />
        )}
      </ActionDialog>
      <ActionDialog
        open={dialog === "delete"}
        title="Delete this playbook?"
        description="Past runs keep their history. A playbook with a run in progress cannot be deleted; deactivate it instead."
        confirmLabel="Delete"
        onSubmit={async () => {
          await remove.mutateAsync(id);
          navigate("/customer/success/playbooks", { replace: true });
        }}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}

export function PlaybookRunsPage() {
  const { id = "" } = useParams();
  const playbook = usePlaybook(id);
  const runs = useRuns(id);
  const rows = runs.data ?? [];
  return (
    <div className="space-y-4">
      <header>
        <Link to={`/customer/success/playbooks/${encodeURIComponent(id)}`} className="text-xs font-semibold text-[var(--color-text-muted)] hover:underline">
          {playbook.data?.name ?? "Playbook"}
        </Link>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Runs</h1>
      </header>
      {runs.isError ? <ConsoleApiErrorPanel error={runs.error} onRetry={() => void runs.refetch()} title="Unable to load runs" /> : null}
      {runs.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">This playbook has not run yet.</p> : null}
      {rows.map((row) => (
        <section key={row.id} className="space-y-2 rounded-lg border border-[var(--color-border)] bg-white p-4" data-testid="playbook-run">
          <p className="flex flex-wrap items-center gap-2 text-sm">
            <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} />
            <span className="font-semibold">{row.status.toLowerCase()}</span>
            <span className="text-xs text-[var(--color-text-muted)]">
              {row.triggerSource === "MANUAL" ? "started by staff" : `triggered: ${(row.triggerSource ?? "").toLowerCase().replace("_", " ")}`} · {row.startedAt ? new Date(row.startedAt).toLocaleString() : "—"}
              {row.status === "WAITING" && row.nextActionAt ? ` · continues ${new Date(row.nextActionAt).toLocaleString()}` : ""}
            </span>
          </p>
          {row.error ? <p className="text-xs text-red-700">{row.error}</p> : null}
          <ol className="space-y-1 text-xs">
            {row.steps.map((step, index) => (
              <li key={index} data-testid="run-step">
                {index + 1}. {stepLabel(step)} — <span className="font-semibold">{step.status.toLowerCase()}</span>
                {step.result && typeof step.result.ticketNumber === "string" ? <span> ({step.result.ticketNumber})</span> : null}
                {step.result && typeof step.result.error === "string" ? <span className="text-red-700"> ({step.result.error})</span> : null}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}
