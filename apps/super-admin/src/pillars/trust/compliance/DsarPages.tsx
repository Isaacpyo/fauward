import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { TenantPicker, type TenantOption } from "@/components/service-kit/TenantPicker";
import { DSAR_TYPES, type Dsar, type DsarStep, type DsarType, useCreateDsar, useDsar, useDsarStep, useDsars, words } from "./api";
import { ComplianceNav } from "./ComplianceNav";

const field = "mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm";

const FILTERS = [
  { id: "OPEN", label: "Open" },
  { id: "overdue", label: "Overdue" },
  { id: "DELIVERED", label: "Delivered" },
  { id: "ERASED", label: "Erased" },
  { id: "CLOSED", label: "Closed" },
  { id: "", label: "All" }
];

function dueText(dsar: Dsar) {
  const days = Math.ceil((new Date(dsar.dueAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (dsar.overdue) return `Overdue by ${Math.abs(days)} day(s)`;
  if (["DELIVERED", "ERASED", "CLOSED"].includes(dsar.status)) return `Due ${new Date(dsar.dueAt).toLocaleDateString()}`;
  return `Due in ${days} day(s)`;
}

function NewDsarDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateDsar();
  const [tenant, setTenant] = useState<TenantOption | null>(null);
  const [requestType, setRequestType] = useState<DsarType>("ACCESS");
  const [subjectEmail, setSubjectEmail] = useState("");
  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (open) {
      setTenant(null);
      setRequestType("ACCESS");
      setSubjectEmail("");
      setNotes("");
    }
  }, [open]);
  return (
    <ActionDialog
      open={open}
      title="Log a data request"
      description="For a request received by email or post. Requests filed in the tenant portal appear here on their own."
      confirmLabel="Log request"
      validate={() => (!tenant ? "Choose a tenant." : !/^\S+@\S+\.\S+$/.test(subjectEmail.trim()) ? "Enter the data subject’s email address." : null)}
      onSubmit={async () => create.mutateAsync({ tenantId: tenant!.id, requestType, subjectEmail: subjectEmail.trim(), ...(notes.trim() ? { notes: notes.trim() } : {}) })}
      onClose={onClose}
    >
      {tenant ? (
        <p className="text-sm">
          Tenant: <TenantChip tenantId={tenant.id} name={tenant.name} slug={tenant.slug} />{" "}
          <button type="button" className="text-xs font-semibold text-[var(--fauward-navy)] hover:underline" onClick={() => setTenant(null)}>
            Change
          </button>
        </p>
      ) : (
        <TenantPicker label="Tenant" onSelect={setTenant} />
      )}
      <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
        Request type
        <select value={requestType} onChange={(event) => setRequestType(event.target.value as DsarType)} className={field}>
          {DSAR_TYPES.map((type) => (
            <option key={type} value={type}>
              {words(type)}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
        Data subject email
        <input type="email" value={subjectEmail} onChange={(event) => setSubjectEmail(event.target.value)} className={field} />
      </label>
      <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
        Notes (optional)
        <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className={field} />
      </label>
    </ActionDialog>
  );
}

/** DSAR queue (L4): every tenant's data requests with their legal due date. */
export function DsarQueuePage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filter = params.get("filter") ?? "OPEN";
  const type = params.get("type") ?? "";
  const query = useDsars({ ...(filter === "overdue" ? { overdue: "true" } : filter ? { status: filter } : {}), ...(type ? { type } : {}) });
  const rows = query.data?.pages.flatMap((page) => page.data) ?? [];
  const [creating, setCreating] = useState(false);
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-4">
      <ComplianceNav current="dsar" />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Data requests</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Access, erasure, portability and rectification requests, oldest due first.</p>
        </div>
        <PermissionButton permission="trust.compliance.dsar.write" onClick={() => setCreating(true)} className="rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
          Log a request
        </PermissionButton>
      </header>
      <div className="flex flex-wrap items-center gap-2">
        <nav aria-label="Request status" className="flex flex-wrap gap-1">
          {FILTERS.map((item) => (
            <button
              key={item.id || "all"}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => set("filter", item.id === "OPEN" ? "" : item.id || "ALL")}
              className={`rounded-md border px-3 py-1.5 text-sm ${filter === item.id || (item.id === "" && filter === "ALL") ? "border-[var(--fauward-navy)] bg-[var(--fauward-navy)] text-white" : "border-[var(--color-border)] bg-white"}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <select aria-label="Request type" value={type} onChange={(event) => set("type", event.target.value)} className="rounded-md border border-[var(--color-border)] px-2 py-1.5 text-sm">
          <option value="">All types</option>
          {DSAR_TYPES.map((value) => (
            <option key={value} value={value}>
              {words(value)}
            </option>
          ))}
        </select>
      </div>
      {query.isError ? <ConsoleApiErrorPanel error={query.error} onRetry={() => void query.refetch()} title="Unable to load data requests" /> : null}
      {!query.isError ? (
        <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white">
          {rows.map((dsar) => (
            <li key={dsar.id} data-testid="dsar-row" onClick={() => navigate(`/trust/compliance/dsar/${dsar.id}`)} className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--color-surface-50)]">
              <span className="flex min-w-0 items-center gap-2">
                {dsar.tenant ? <TenantChip tenantId={dsar.tenant.id} name={dsar.tenant.name} slug={dsar.tenant.slug} /> : null}
                <Link to={`/trust/compliance/dsar/${dsar.id}`} onClick={(event) => event.stopPropagation()} className="text-sm font-semibold hover:underline">
                  {words(dsar.requestType)}
                </Link>
                <span className="truncate text-sm text-[var(--color-text-muted)]">{dsar.subjectEmail}</span>
              </span>
              <span className="flex items-center gap-2 text-xs">
                <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 font-semibold">{words(dsar.status)}</span>
                <span className={dsar.overdue ? "font-semibold text-red-700" : "text-[var(--color-text-muted)]"}>{dueText(dsar)}</span>
              </span>
            </li>
          ))}
          {!query.isLoading && rows.length === 0 ? <li className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">No data requests here.</li> : null}
        </ul>
      ) : null}
      {query.hasNextPage ? (
        <button type="button" onClick={() => void query.fetchNextPage()} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold">
          Load more
        </button>
      ) : null}
      <NewDsarDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

type Action = { step: DsarStep; label: string; permission: "trust.compliance.dsar.write" | "trust.compliance.dsar.deliver"; dangerous: boolean; description: string };

function actionsFor(dsar: Dsar): Action[] {
  const erasure = dsar.requestType === "ERASURE";
  const verify: Action = { step: "verify-identity", label: "Verify identity", permission: "trust.compliance.dsar.write", dangerous: false, description: "Confirm the request comes from the data subject (or someone entitled to act for them)." };
  const gather: Action = { step: "gather", label: dsar.status === "DATA_GATHERED" ? "Gather again" : "Gather data", permission: "trust.compliance.dsar.write", dangerous: false, description: "Queues a job that collects every registry model’s rows for this subject into one bundle." };
  const approve: Action = { step: "approve", label: "Approve export", permission: "trust.compliance.dsar.write", dangerous: false, description: "Confirms you reviewed the gathered bundle." };
  const deliver: Action = { step: "deliver", label: dsar.status === "DELIVERED" ? "Send a new link" : "Deliver", permission: "trust.compliance.dsar.deliver", dangerous: true, description: "Sends the tenant’s admins a one-time download link (valid 7 days). Only its hash is stored." };
  const erase: Action = { step: "erase", label: "Erase", permission: "trust.compliance.dsar.deliver", dangerous: true, description: "Queues the erasure job: registry fields are anonymised or removed, financial records are kept. This cannot be undone." };
  const close: Action = { step: "close", label: "Close", permission: "trust.compliance.dsar.write", dangerous: true, description: "Closes the request. Record why." };
  switch (dsar.status) {
    case "RECEIVED":
      return [verify, close];
    case "IDENTITY_VERIFIED":
      return erasure ? [gather, erase, close] : [gather, close];
    case "DATA_GATHERED":
      return erasure ? [erase, gather, close] : [approve, gather, close];
    case "APPROVED":
      return erasure ? [erase, close] : [deliver, close];
    case "DELIVERED":
      return [deliver, close];
    case "ERASED":
      return [close];
    default:
      return [];
  }
}

function formatBytes(value: number | null) {
  if (value === null) return "—";
  return value < 1024 ? `${value} B` : `${(value / 1024).toFixed(1)} KB`;
}

export function DsarDetailPage() {
  const { id = "" } = useParams();
  const detail = useDsar(id);
  const step = useDsarStep();
  const [action, setAction] = useState<Action | null>(null);
  const [notes, setNotes] = useState("");

  if (detail.isLoading) return <p className="text-sm text-[var(--color-text-muted)]">Loading request…</p>;
  if (detail.isError) return <ConsoleApiErrorPanel error={detail.error} onRetry={() => void detail.refetch()} title="Unable to load the request" />;
  if (!detail.data) return null;
  const { dsar, transitions, exports, legalHold, subjectAccount } = detail.data;
  const description = dsar.details && typeof dsar.details.description === "string" ? dsar.details.description : dsar.notes;
  const actions = actionsFor(dsar);

  return (
    <div className="space-y-4">
      <ComplianceNav current="dsar" />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/trust/compliance/dsar" className="text-xs font-semibold text-[var(--fauward-navy)] hover:underline">
            ← Data requests
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-xl font-bold text-[var(--color-text-primary)]">
            {words(dsar.requestType)} request {dsar.tenant ? <TenantChip tenantId={dsar.tenant.id} name={dsar.tenant.name} slug={dsar.tenant.slug} /> : null}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]" data-testid="dsar-status">
            {words(dsar.status)} · <span className={dsar.overdue ? "font-semibold text-red-700" : ""}>{dueText(dsar)}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {actions.map((item) => (
            <PermissionButton
              key={item.step}
              permission={item.permission}
              onClick={() => {
                setNotes("");
                setAction(item);
              }}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${item.step === "erase" ? "bg-red-700 text-white" : item === actions[0] ? "bg-[var(--fauward-navy)] text-white" : "border border-[var(--color-border)]"}`}
            >
              {item.label}
            </PermissionButton>
          ))}
          {["GATHERING", "ERASING"].includes(dsar.status) ? <span className="text-sm text-[var(--color-text-muted)]">{dsar.status === "GATHERING" ? "Gathering data…" : "Erasing…"}</span> : null}
        </div>
      </header>

      {legalHold && dsar.requestType === "ERASURE" && !["ERASED", "CLOSED"].includes(dsar.status) ? (
        <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          An active legal hold blocks erasure for this tenant: {legalHold.reason}{" "}
          <Link to="/trust/compliance/legal-hold" className="font-semibold underline">
            Legal holds
          </Link>
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2 rounded-lg border border-[var(--color-border)] bg-white p-4 text-sm">
          <h2 className="font-semibold">Request</h2>
          <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
            <dt className="text-[var(--color-text-muted)]">Data subject</dt>
            <dd>{dsar.subjectEmail}</dd>
            <dt className="text-[var(--color-text-muted)]">Account</dt>
            <dd>{subjectAccount ? `${subjectAccount.name ?? "Unnamed"} · ${words(subjectAccount.role)} · since ${new Date(subjectAccount.createdAt).toLocaleDateString()}` : "No account with this email in the tenant"}</dd>
            <dt className="text-[var(--color-text-muted)]">Received</dt>
            <dd>{new Date(dsar.receivedAt).toLocaleString()}</dd>
            <dt className="text-[var(--color-text-muted)]">Identity verified</dt>
            <dd>{dsar.identityVerifiedAt ? new Date(dsar.identityVerifiedAt).toLocaleString() : "Not yet"}</dd>
            {dsar.erasureCompletedAt ? (
              <>
                <dt className="text-[var(--color-text-muted)]">Erased</dt>
                <dd>{new Date(dsar.erasureCompletedAt).toLocaleString()}</dd>
              </>
            ) : null}
          </dl>
          {description ? <p className="whitespace-pre-wrap rounded-md bg-[var(--color-surface-50)] p-3">{description}</p> : null}
        </section>

        <section className="space-y-2 rounded-lg border border-[var(--color-border)] bg-white p-4 text-sm">
          <h2 className="font-semibold">Exports</h2>
          {exports.length === 0 ? <p className="text-[var(--color-text-muted)]">Nothing gathered yet.</p> : null}
          <ul className="space-y-2">
            {exports.map((row) => (
              <li key={row.id} data-testid="dsar-export" className="rounded-md border border-[var(--color-border)] p-2 text-xs">
                <p className="font-semibold">
                  {words(row.status)} · {formatBytes(row.byteSize)} · {new Date(row.createdAt).toLocaleString()}
                </p>
                {row.sha256 ? <p className="font-mono text-[var(--color-text-muted)]">sha256 {row.sha256.slice(0, 16)}…</p> : null}
                {row.error ? <p className="text-red-700">{row.error}</p> : null}
                {row.tokenIssued ? <p>Download link issued, expires {row.tokenExpiresAt ? new Date(row.tokenExpiresAt).toLocaleString() : "—"}</p> : null}
                {row.downloadedAt ? <p>Downloaded by the tenant {new Date(row.downloadedAt).toLocaleString()}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-lg border border-[var(--color-border)] bg-white p-4 text-sm">
        <h2 className="font-semibold">History</h2>
        <ol className="mt-2 space-y-1" data-testid="dsar-history">
          {transitions.map((row) => (
            <li key={row.id} className="text-xs">
              <span className="text-[var(--color-text-muted)]">{new Date(row.createdAt).toLocaleString()}</span> · {row.fromStatus ? `${words(row.fromStatus)} → ` : ""}
              <span className="font-semibold">{words(row.toStatus)}</span>
              {row.notes ? ` · ${row.notes}` : ""}
            </li>
          ))}
        </ol>
      </section>

      <ActionDialog
        open={action !== null}
        title={action ? `${action.label}: ${words(dsar.requestType)} request` : ""}
        description={action?.description}
        confirmLabel={action?.label ?? ""}
        dangerous={action?.dangerous ?? false}
        onSubmit={async (reason) => step.mutateAsync({ id: dsar.id, step: action!.step, ...(reason ? { reason } : {}), ...(notes.trim() ? { notes: notes.trim() } : {}) })}
        onClose={() => setAction(null)}
      >
        {action && ["verify-identity", "approve"].includes(action.step) ? (
          <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
            Notes (optional)
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className={field} />
          </label>
        ) : null}
      </ActionDialog>
    </div>
  );
}
