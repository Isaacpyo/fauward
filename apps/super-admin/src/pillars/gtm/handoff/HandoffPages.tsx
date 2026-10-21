import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePermission } from "@fauward/internal-rbac";

import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { consoleApi } from "@/lib/console-api";
import { apiErrorMessage } from "@/lib/console-api-error";

// gtm.handoff (WP-4.17): HandoffQueuePage, HandoffDetailPage, WonPage, HandoffTemplatePage. A trial → paid conversion
// opens one handoff per tenant; sales fill in the notes and pass it to CS, a CSM is assigned (and notified), accepts it,
// ticks the checklist and completes it. The template is code-defined (config/handoff-template.ts).

type Status = "PENDING_SALES" | "PENDING_CS" | "ACCEPTED" | "COMPLETED";
type TemplateField = { key: string; label: string; requiredForCs: boolean };
type Template = { id: string; name: string; fields: TemplateField[]; checklist: Array<{ key: string; label: string }> };
type ChecklistItem = { key: string; label: string; done: boolean; doneAt: string | null; doneBy: string | null };
type Person = { id: string; name: string | null; email: string | null };
type Handoff = {
  id: string;
  tenant: { id: string; name: string; slug: string | null; plan: string | null };
  status: Status;
  csm: Person | null;
  deal: { id: string; name: string; amount: string; ownerEmail: string | null; closeDate: string | null } | null;
  checklistDone: number;
  checklistTotal: number;
  document: { template: string; fields: Record<string, string>; checklist: ChecklistItem[] };
  assignedAt: string | null;
  acceptedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};
type Change = { fields?: Record<string, string>; checklist?: Array<{ key: string; done: boolean }>; assignCsmId?: string | null; status?: Status };

const KEY = ["gtm.handoff"] as const;
const label = "block text-xs font-semibold text-[var(--color-text-muted)]";
const primary = "rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50";
const secondary = "rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50";

const STATUS_TEXT: Record<Status, string> = { PENDING_SALES: "Waiting for sales", PENDING_CS: "Waiting for CS", ACCEPTED: "Accepted by CS", COMPLETED: "Completed" };
const STATUS_TONE: Record<Status, string> = { PENDING_SALES: "bg-amber-100 text-amber-900", PENDING_CS: "bg-blue-100 text-blue-900", ACCEPTED: "bg-indigo-100 text-indigo-900", COMPLETED: "bg-green-100 text-green-900" };

function day(value: string | null) {
  return value ? new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—";
}

function personName(person: Person | null) {
  return person ? person.name ?? person.email ?? person.id : "Unassigned";
}

function StatusPill({ status }: { status: Status }) {
  return <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[status]}`}>{STATUS_TEXT[status]}</span>;
}

function HandoffNav({ active }: { active: "queue" | "won" | "template" }) {
  const base = "rounded-md px-3 py-1.5 text-xs font-semibold";
  const item = (key: typeof active, to: string, text: string) => (
    <Link to={to} className={`${base} ${active === key ? "bg-[var(--fauward-navy)] text-white" : "border border-[var(--color-border)]"}`}>
      {text}
    </Link>
  );
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Handoff sections">
      {item("queue", "/gtm/handoff", "Queue")}
      {item("won", "/gtm/handoff/won", "Recent conversions")}
      {item("template", "/gtm/handoff/templates", "Template")}
    </nav>
  );
}

function HandoffTable({ rows, empty }: { rows: Handoff[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-[var(--color-text-muted)]">{empty}</p>;
  return (
    <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-testid="handoff-row">
          <span className="flex flex-wrap items-center gap-2">
            <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} />
            <StatusPill status={row.status} />
            {row.deal ? <span className="text-xs text-[var(--color-text-muted)]">Deal {row.deal.name} · {row.deal.amount}</span> : null}
          </span>
          <span className="flex items-center gap-3 text-xs text-[var(--color-text-muted)]">
            <span>
              CSM: {personName(row.csm)} · checklist {row.checklistDone}/{row.checklistTotal} · converted {day(row.createdAt)}
            </span>
            <Link to={`/gtm/handoff/${encodeURIComponent(row.id)}`} className="underline">
              Open
            </Link>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function HandoffQueuePage() {
  const [params, setParams] = useSearchParams();
  const stage = params.get("stage") ?? "ALL";
  const queue = useQuery({
    queryKey: [...KEY, "queue", stage],
    queryFn: async () => (await consoleApi.get<{ data?: Handoff[] }>("/handoff/queue", { params: { stage } })).data.data ?? []
  });
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Sales handoff queue</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Open handoffs from trial → paid conversions, oldest first.</p>
        </div>
        <HandoffNav active="queue" />
      </header>
      <label className={label}>
        Stage
        <select aria-label="Stage" value={stage} onChange={(event) => setParams({ stage: event.target.value }, { replace: true })} className="mt-1 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
          <option value="ALL">All open</option>
          <option value="SALES">Waiting for sales</option>
          <option value="CS">With CS</option>
        </select>
      </label>
      {queue.isError ? <ConsoleApiErrorPanel error={queue.error} onRetry={() => void queue.refetch()} title="Unable to load the handoff queue" /> : null}
      {queue.data ? <HandoffTable rows={queue.data} empty="No open handoff." /> : null}
    </div>
  );
}

export function WonPage() {
  const [days, setDays] = useState(90);
  const won = useQuery({
    queryKey: [...KEY, "won", days],
    queryFn: async () => (await consoleApi.get<{ data?: Handoff[] }>("/handoff/won", { params: { days } })).data.data ?? []
  });
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Recent conversions</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Tenants that moved from trial to paid, with the won deal when one is linked.</p>
        </div>
        <HandoffNav active="won" />
      </header>
      <label className={label}>
        Window
        <select aria-label="Window" value={days} onChange={(event) => setDays(Number(event.target.value))} className="mt-1 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
          <option value={365}>Last 12 months</option>
        </select>
      </label>
      {won.isError ? <ConsoleApiErrorPanel error={won.error} onRetry={() => void won.refetch()} title="Unable to load conversions" /> : null}
      {won.data ? <HandoffTable rows={won.data} empty="No conversion in this window." /> : null}
    </div>
  );
}

export function HandoffTemplatePage() {
  const template = useQuery({ queryKey: [...KEY, "template"], queryFn: async () => (await consoleApi.get<{ data?: Template[] }>("/handoff/templates")).data.data ?? [] });
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Handoff template</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Defined in code (config/handoff-template.ts); every new handoff starts from it.</p>
        </div>
        <HandoffNav active="template" />
      </header>
      {template.isError ? <ConsoleApiErrorPanel error={template.error} onRetry={() => void template.refetch()} title="Unable to load the template" /> : null}
      {template.data?.map((item) => (
        <section key={item.id} className="rounded-lg border border-[var(--color-border)] bg-white p-4" aria-label={item.name}>
          <h2 className="text-sm font-semibold">{item.name}</h2>
          <h3 className="mt-3 text-xs font-semibold text-[var(--color-text-muted)]">Sales notes</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {item.fields.map((field) => (
              <li key={field.key}>
                {field.label}
                {field.requiredForCs ? " (required before passing to CS)" : ""}
              </li>
            ))}
          </ul>
          <h3 className="mt-3 text-xs font-semibold text-[var(--color-text-muted)]">CS checklist</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {item.checklist.map((entry) => (
              <li key={entry.key}>{entry.label}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

const NEXT_STEP: Partial<Record<Status, { status: Status; text: string }>> = {
  PENDING_SALES: { status: "PENDING_CS", text: "Pass to CS" },
  PENDING_CS: { status: "ACCEPTED", text: "Accept" },
  ACCEPTED: { status: "COMPLETED", text: "Complete" }
};

export function HandoffDetailPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: [...KEY, "detail", id], queryFn: async () => (await consoleApi.get<Handoff>(`/handoff/${encodeURIComponent(id)}`)).data });
  const template = useQuery({ queryKey: [...KEY, "template"], queryFn: async () => (await consoleApi.get<{ data?: Template[] }>("/handoff/templates")).data.data ?? [] });
  const assignees = useQuery({ queryKey: [...KEY, "assignees"], queryFn: async () => (await consoleApi.get<{ data?: Person[] }>("/handoff/assignees")).data.data ?? [] });
  const [fields, setFields] = useState<Record<string, string>>({});
  const [csmId, setCsmId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const canWrite = usePermission("gtm.handoff.write") === true;
  const data = detail.data;

  useEffect(() => {
    if (!data) return;
    setFields(data.document.fields);
    setCsmId(data.csm?.id ?? "");
  }, [data]);

  const save = useMutation({
    mutationFn: async (change: Change) => (await consoleApi.patch<Handoff>(`/handoff/${encodeURIComponent(id)}`, change)).data,
    onSuccess: (updated) => {
      queryClient.setQueryData([...KEY, "detail", id], updated);
      void queryClient.invalidateQueries({ queryKey: [...KEY, "queue"] });
      void queryClient.invalidateQueries({ queryKey: [...KEY, "won"] });
    }
  });

  async function run(change: Change, done: string) {
    setError(null);
    setMessage(null);
    try {
      await save.mutateAsync(change);
      setMessage(done);
    } catch (caught) {
      setError(apiErrorMessage(caught, "The handoff could not be saved."));
    }
  }

  const fieldDefs = template.data?.[0]?.fields ?? [];
  const notesEditable = data?.status === "PENDING_SALES" || data?.status === "PENDING_CS";
  const notesChanged = data ? fieldDefs.some((field) => (fields[field.key] ?? "") !== (data.document.fields[field.key] ?? "")) : false;
  const next = data ? NEXT_STEP[data.status] : undefined;
  const closed = data?.status === "COMPLETED";

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Handoff</h1>
          {data ? (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <TenantChip tenantId={data.tenant.id} name={data.tenant.name} slug={data.tenant.slug} />
              <StatusPill status={data.status} />
              <span>
                {data.tenant.plan ?? ""} · converted {day(data.createdAt)}
                {data.acceptedAt ? ` · accepted ${day(data.acceptedAt)}` : ""}
                {data.completedAt ? ` · completed ${day(data.completedAt)}` : ""}
              </span>
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <HandoffNav active="queue" />
          {next ? (
            <PermissionButton permission="gtm.handoff.write" disabled={save.isPending || notesChanged} title={notesChanged ? "Save the notes first" : undefined} onClick={() => void run({ status: next.status }, `${STATUS_TEXT[next.status]}.`)} className={primary}>
              {next.text}
            </PermissionButton>
          ) : null}
        </div>
      </header>
      {message ? (
        <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {detail.isError ? <ConsoleApiErrorPanel error={detail.error} onRetry={() => void detail.refetch()} title="Unable to load this handoff" /> : null}
      {data?.deal ? (
        <section className="rounded-lg border border-[var(--color-border)] bg-white p-4 text-sm" aria-label="Won deal">
          <h2 className="font-semibold">Won deal</h2>
          <p className="mt-1">
            {data.deal.name} · {data.deal.amount}
            {data.deal.ownerEmail ? ` · owner ${data.deal.ownerEmail}` : ""}
            {data.deal.closeDate ? ` · closed ${day(data.deal.closeDate)}` : ""}
          </p>
        </section>
      ) : null}
      {data ? (
        <section className="space-y-3 rounded-lg border border-[var(--color-border)] bg-white p-4" aria-label="Sales notes">
          <h2 className="text-sm font-semibold">Sales notes</h2>
          {fieldDefs.map((field) => (
            <label key={field.key} className={label}>
              {field.label}
              {field.requiredForCs ? " *" : ""}
              <textarea
                aria-label={field.label}
                value={fields[field.key] ?? ""}
                readOnly={!notesEditable || !canWrite}
                onChange={(event) => setFields((current) => ({ ...current, [field.key]: event.target.value }))}
                rows={3}
                className="mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-normal text-[var(--color-text-primary)]"
              />
            </label>
          ))}
          {notesEditable ? (
            <PermissionButton permission="gtm.handoff.write" disabled={save.isPending || !notesChanged} onClick={() => void run({ fields }, "Notes saved.")} className={secondary}>
              Save notes
            </PermissionButton>
          ) : (
            <p className="text-xs text-[var(--color-text-muted)]">The notes are locked once CS has accepted the handoff.</p>
          )}
        </section>
      ) : null}
      {data ? (
        <section className="space-y-2 rounded-lg border border-[var(--color-border)] bg-white p-4" aria-label="Customer success manager">
          <h2 className="text-sm font-semibold">CSM</h2>
          <p className="text-sm">{personName(data.csm)}</p>
          {!closed ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className={label}>
                Assign
                <select aria-label="CSM to assign" value={csmId} onChange={(event) => setCsmId(event.target.value)} className="mt-1 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
                  <option value="">Choose a CSM</option>
                  {(assignees.data ?? []).map((person) => (
                    <option key={person.id} value={person.id}>
                      {personName(person)}
                    </option>
                  ))}
                </select>
              </label>
              <PermissionButton permission="gtm.handoff.write" disabled={save.isPending || !csmId || csmId === data.csm?.id} onClick={() => void run({ assignCsmId: csmId }, "CSM assigned and notified.")} className={secondary}>
                Assign
              </PermissionButton>
            </div>
          ) : null}
          {assignees.isSuccess && assignees.data.length === 0 ? <p className="text-xs text-[var(--color-text-muted)]">No active staff member has customer success access.</p> : null}
        </section>
      ) : null}
      {data ? (
        <section className="space-y-2 rounded-lg border border-[var(--color-border)] bg-white p-4" aria-label="Checklist">
          <h2 className="text-sm font-semibold">
            CS checklist ({data.checklistDone}/{data.checklistTotal})
          </h2>
          {data.status !== "ACCEPTED" && !closed ? <p className="text-xs text-[var(--color-text-muted)]">The checklist opens once a CSM has accepted the handoff.</p> : null}
          <ul className="space-y-1 text-sm">
            {data.document.checklist.map((item) => (
              <li key={item.key}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    aria-label={item.label}
                    checked={item.done}
                    disabled={!canWrite || data.status !== "ACCEPTED" || save.isPending}
                    onChange={(event) => void run({ checklist: [{ key: item.key, done: event.target.checked }] }, "Checklist saved.")}
                  />
                  {item.label}
                  {item.doneAt ? <span className="text-xs text-[var(--color-text-muted)]">· {day(item.doneAt)}</span> : null}
                </label>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
