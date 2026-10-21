import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { usePermission } from "@fauward/internal-rbac";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { DegradedBanner } from "@/components/service-kit/DegradedBanner";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { TenantPicker, type TenantOption } from "@/components/service-kit/TenantPicker";
import { apiErrorMessage } from "@/lib/console-api-error";
import {
  IMPACT_LEVELS,
  OPEN_STATUSES,
  SEVERITIES,
  personLabel,
  statusLabel,
  useActiveIncidents,
  useAddImpact,
  useDeclareIncident,
  useDeleteRunbook,
  useIncident,
  useIncidents,
  usePatchIncident,
  usePostUpdate,
  useResolveIncident,
  useResponders,
  useRunbook,
  useRunbooks,
  useSaveRunbook,
  type IncidentDetail,
  type OpenStatus,
  type Severity
} from "@/pillars/platform/incidents/api";

// platform.incidents (WP-4.2): IncidentsListPage, IncidentDetailPage, RunbooksPage, RunbookEditorPage and the TopBar
// active-incident pill. Tenant escalations (WP-2.11) are EscalationsPage in this folder.

const input = "mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm";
const label = "block text-xs font-semibold text-[var(--color-text-muted)]";
const primary = "rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50";
const secondary = "rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50";

function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

const SEVERITY_TONE: Record<string, string> = {
  SEV1: "bg-red-600 text-white",
  SEV2: "bg-red-100 text-red-800",
  SEV3: "bg-amber-100 text-amber-900",
  SEV4: "bg-slate-100 text-slate-700"
};

function SeverityBadge({ severity }: { severity: string | null }) {
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${SEVERITY_TONE[severity ?? ""] ?? "bg-slate-100 text-slate-700"}`}>{severity ?? "Unrated"}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === "RESOLVED" ? "bg-green-100 text-green-800" : status === "MONITORING" ? "bg-blue-100 text-blue-800" : "bg-red-50 text-red-800";
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${tone}`}>{statusLabel(status)}</span>;
}

function IncidentsNav({ active }: { active: "incidents" | "runbooks" | "escalations" }) {
  const base = "rounded-md px-3 py-1.5 text-xs font-semibold";
  const item = (key: typeof active, to: string, text: string) => (
    <Link to={to} className={`${base} ${active === key ? "bg-[var(--fauward-navy)] text-white" : "border border-[var(--color-border)]"}`}>
      {text}
    </Link>
  );
  return (
    <nav className="flex gap-2" aria-label="Incident sections">
      {item("incidents", "/platform/incidents", "Incidents")}
      {item("runbooks", "/platform/incidents/runbooks", "Runbooks")}
      {item("escalations", "/platform/incidents/escalations", "Tenant escalations")}
    </nav>
  );
}

function Notice({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
      {message}
    </p>
  );
}

function splitServices(value: string) {
  return [...new Set(value.split(",").map((item) => item.trim()).filter(Boolean))];
}

// ── TopBar pill ──────────────────────────────────────────────────────────────

/** Red pill in the TopBar while any incident is open; links to the incident (one) or the active list (several). */
export function ActiveIncidentPill() {
  const allowed = usePermission("platform.incidents.read") === true;
  const active = useActiveIncidents(allowed);
  const total = active.data?.total ?? 0;
  if (!allowed || total === 0) return null;
  const first = active.data?.data[0];
  const to = total === 1 && first ? `/platform/incidents/${encodeURIComponent(first.id)}` : "/platform/incidents?status=ACTIVE";
  const text = total === 1 && first ? `${first.severity ?? "Incident"} · ${first.title}` : `${total} active incidents`;
  return (
    <Link to={to} data-testid="active-incident-pill" title="Open incidents" className="hidden max-w-[16rem] items-center gap-1.5 truncate rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700 md:inline-flex">
      <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-white" aria-hidden />
      <span className="truncate">{text}</span>
    </Link>
  );
}

// ── List ─────────────────────────────────────────────────────────────────────

function DeclareDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (id: string, title: string) => void }) {
  const declare = useDeclareIncident();
  const responders = useResponders();
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState<Severity>("SEV3");
  const [services, setServices] = useState("");
  const [commander, setCommander] = useState("");
  const [description, setDescription] = useState("");
  useEffect(() => {
    if (open) {
      setTitle("");
      setSeverity("SEV3");
      setServices("");
      setCommander("");
      setDescription("");
    }
  }, [open]);
  return (
    <ActionDialog
      open={open}
      title="Declare an incident"
      description="SEV1 and SEV2 notify every console user who can read incidents (bell and email)."
      confirmLabel="Declare incident"
      validate={() => (title.trim().length >= 3 ? null : "Give the incident a title (at least 3 characters).")}
      onSubmit={async () => {
        const created = await declare.mutateAsync({ title: title.trim(), severity, services: splitServices(services), commanderPlatformUserId: commander || null, ...(description.trim() ? { description: description.trim() } : {}) });
        onDone(created.id, created.title);
      }}
      onClose={onClose}
    >
      <label className={label}>
        Title
        <input value={title} onChange={(event) => setTitle(event.target.value)} className={input} />
      </label>
      <label className={label}>
        Severity
        <select value={severity} onChange={(event) => setSeverity(event.target.value as Severity)} className={input}>
          {SEVERITIES.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
      <label className={label}>
        Affected services (comma separated)
        <input value={services} onChange={(event) => setServices(event.target.value)} placeholder="labels, tracking" className={input} />
      </label>
      <label className={label}>
        Commander
        <select value={commander} onChange={(event) => setCommander(event.target.value)} className={input}>
          <option value="">Unassigned</option>
          {(responders.data ?? []).map((person) => (
            <option key={person.id} value={person.id}>
              {personLabel(person)}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        What is happening (internal, optional)
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} className={input} />
      </label>
    </ActionDialog>
  );
}

export function IncidentsListPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const status = params.get("status") ?? "ACTIVE";
  const severity = params.get("severity") ?? "";
  const incidents = useIncidents({ status, severity });
  const [declaring, setDeclaring] = useState(false);
  const rows = incidents.data?.data ?? [];
  const pagerDuty = incidents.data?.pagerDuty;

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Incidents</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Declare, run and resolve Fauward incidents. Public updates reach the impacted tenants&apos; announcement banner.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <IncidentsNav active="incidents" />
          <PermissionButton permission="platform.incidents.write" onClick={() => setDeclaring(true)} className={primary}>
            Declare incident
          </PermissionButton>
        </div>
      </header>
      {pagerDuty && !pagerDuty.configured ? (
        <DegradedBanner variant="vendor-unconfigured" fixedBy={pagerDuty.missing.join(", ")}>
          PagerDuty is not connected, so pages do not open incidents here automatically. Incidents declared in the console work as normal.
        </DegradedBanner>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <label className={label}>
          Status
          <select aria-label="Status filter" value={status} onChange={(event) => setFilter("status", event.target.value)} className={input}>
            <option value="ACTIVE">Active</option>
            <option value="RESOLVED">Resolved</option>
            <option value="ALL">All</option>
          </select>
        </label>
        <label className={label}>
          Severity
          <select aria-label="Severity filter" value={severity} onChange={(event) => setFilter("severity", event.target.value)} className={input}>
            <option value="">Any</option>
            {SEVERITIES.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
      </div>
      {incidents.isError ? <ConsoleApiErrorPanel error={incidents.error} onRetry={() => void incidents.refetch()} title="Unable to load incidents" /> : null}
      {incidents.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading incidents…</p> : null}
      {incidents.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">{status === "ACTIVE" ? "No incident is open." : "No incidents match these filters."}</p> : null}
      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-muted)]">
                <th className="px-3 py-2">Incident</th>
                <th className="px-3 py-2">Severity</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Commander</th>
                <th className="px-3 py-2 text-right">Tenants</th>
                <th className="px-3 py-2">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {rows.map((row) => (
                <tr key={row.id} data-testid="incident-row">
                  <td className="px-3 py-2">
                    <Link to={`/platform/incidents/${encodeURIComponent(row.id)}`} className="font-semibold text-[var(--fauward-navy)] hover:underline">
                      {row.title}
                    </Link>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {row.services.length ? row.services.join(", ") : "No services tagged"}
                      {row.vendor === "pagerduty" ? " · from PagerDuty" : ""}
                    </p>
                  </td>
                  <td className="px-3 py-2">
                    <SeverityBadge severity={row.severity} />
                  </td>
                  <td className="px-3 py-2">
                    <StatusBadge status={row.status} />
                  </td>
                  <td className="px-3 py-2 text-xs">{personLabel(row.commander)}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums">{row.impactCount ?? 0}</td>
                  <td className="px-3 py-2 text-xs">{when(row.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <DeclareDialog open={declaring} onClose={() => setDeclaring(false)} onDone={(id) => navigate(`/platform/incidents/${encodeURIComponent(id)}`)} />
    </div>
  );
}

// ── Detail ───────────────────────────────────────────────────────────────────

function UpdateForm({ incident, onDone }: { incident: IncidentDetail; onDone: (message: string) => void }) {
  const post = usePostUpdate(incident.id);
  const canWrite = usePermission("platform.incidents.write") === true;
  const [body, setBody] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [status, setStatus] = useState<OpenStatus | "">("");
  const [audience, setAudience] = useState<"IMPACTED" | "ALL">(incident.impacts.length > 0 ? "IMPACTED" : "ALL");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setAudience(incident.impacts.length > 0 ? "IMPACTED" : "ALL"), [incident.impacts.length]);

  async function submit() {
    setError(null);
    try {
      const result = await post.mutateAsync({ body: body.trim(), isPublic, ...(status ? { status } : {}), ...(isPublic ? { audience } : {}) });
      setBody("");
      setStatus("");
      setIsPublic(false);
      const reach = result.announcement ? ` Shown on ${result.announcement.targetAll ? "every tenant's" : `${result.announcement.tenantIds.length} tenant(s)'`} banner.` : "";
      const notified = result.notified.tenants > 0 ? ` ${result.notified.inApp} tenant admin(s) notified.` : "";
      onDone(`Update posted.${reach}${notified}`);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "The update was not posted."));
    }
  }

  return (
    <section className="space-y-2 rounded-lg border border-[var(--color-border)] bg-white p-4">
      <h2 className="text-sm font-semibold">Post an update</h2>
      <label className={label}>
        Update
        <textarea value={body} onChange={(event) => setBody(event.target.value)} rows={3} className={input} />
      </label>
      <div className="flex flex-wrap items-end gap-3">
        <label className={label}>
          New status (optional)
          <select value={status} onChange={(event) => setStatus(event.target.value as OpenStatus | "")} className={input}>
            <option value="">Keep {statusLabel(incident.status)}</option>
            {OPEN_STATUSES.map((item) => (
              <option key={item} value={item}>
                {statusLabel(item)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs font-semibold">
          <input type="checkbox" checked={isPublic} onChange={(event) => setIsPublic(event.target.checked)} />
          Public (tenant banner)
        </label>
        {isPublic ? (
          <label className={label}>
            Audience
            <select value={audience} onChange={(event) => setAudience(event.target.value as "IMPACTED" | "ALL")} className={input}>
              <option value="IMPACTED" disabled={incident.impacts.length === 0}>
                Impacted tenants ({incident.impacts.length})
              </option>
              <option value="ALL">All tenants</option>
            </select>
          </label>
        ) : null}
      </div>
      {isPublic && (incident.severity === "SEV1" || incident.severity === "SEV2") ? <p className="text-xs text-[var(--color-text-muted)]">{incident.severity}: tenant admins also get an in-app notification and the incident email.</p> : null}
      {error ? (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <PermissionButton permission="platform.incidents.write" disabled={!canWrite || post.isPending || body.trim().length === 0} onClick={() => void submit()} className={primary}>
        {post.isPending ? "Posting…" : isPublic ? "Post public update" : "Post internal update"}
      </PermissionButton>
    </section>
  );
}

function ManageDialog({ incident, open, onClose, onDone }: { incident: IncidentDetail; open: boolean; onClose: () => void; onDone: (message: string) => void }) {
  const patch = usePatchIncident(incident.id);
  const responders = useResponders();
  const [status, setStatus] = useState<OpenStatus>("INVESTIGATING");
  const [severity, setSeverity] = useState<Severity>("SEV3");
  const [commander, setCommander] = useState("");
  const [services, setServices] = useState("");
  useEffect(() => {
    if (!open) return;
    setStatus(incident.status === "RESOLVED" ? "MONITORING" : incident.status);
    setSeverity(incident.severity ?? "SEV3");
    setCommander(incident.commander?.id ?? "");
    setServices(incident.services.join(", "));
  }, [open, incident]);
  return (
    <ActionDialog
      open={open}
      title="Update status, severity and commander"
      description="Changes are written to the incident timeline. Raising to SEV1/SEV2 notifies incident readers."
      confirmLabel="Save changes"
      onSubmit={async () => {
        await patch.mutateAsync({ status, severity, commanderPlatformUserId: commander || null, services: splitServices(services) });
        onDone("Incident updated.");
      }}
      onClose={onClose}
    >
      <label className={label}>
        Status
        <select value={status} onChange={(event) => setStatus(event.target.value as OpenStatus)} className={input}>
          {OPEN_STATUSES.map((item) => (
            <option key={item} value={item}>
              {statusLabel(item)}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Severity
        <select value={severity} onChange={(event) => setSeverity(event.target.value as Severity)} className={input}>
          {SEVERITIES.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </label>
      <label className={label}>
        Commander
        <select value={commander} onChange={(event) => setCommander(event.target.value)} className={input}>
          <option value="">Unassigned</option>
          {(responders.data ?? []).map((person) => (
            <option key={person.id} value={person.id}>
              {personLabel(person)}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Affected services (comma separated)
        <input value={services} onChange={(event) => setServices(event.target.value)} className={input} />
      </label>
    </ActionDialog>
  );
}

function ImpactDialog({ incident, open, onClose, onDone }: { incident: IncidentDetail; open: boolean; onClose: () => void; onDone: (message: string) => void }) {
  const add = useAddImpact(incident.id);
  const [tenant, setTenant] = useState<TenantOption | null>(null);
  const [level, setLevel] = useState<string>("AFFECTED");
  const [notes, setNotes] = useState("");
  useEffect(() => {
    if (open) {
      setTenant(null);
      setLevel("AFFECTED");
      setNotes("");
    }
  }, [open]);
  return (
    <ActionDialog
      open={open}
      title="Tag an impacted tenant"
      description="Impacted tenants receive the incident's public updates. A tenant tagged after an update went out is added to its banner."
      confirmLabel="Tag tenant"
      validate={() => (tenant ? null : "Choose a tenant.")}
      onSubmit={async () => {
        if (!tenant) return;
        const result = await add.mutateAsync({ tenantId: tenant.id, impactLevel: level, ...(notes.trim() ? { notes: notes.trim() } : {}) });
        onDone(`${tenant.name} tagged as ${level.toLowerCase()}.${result.announcementExtended ? " The live announcement now reaches it too." : ""}`);
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
      <label className={label}>
        Impact
        <select value={level} onChange={(event) => setLevel(event.target.value)} className={input}>
          {IMPACT_LEVELS.map((item) => (
            <option key={item} value={item}>
              {statusLabel(item)}
            </option>
          ))}
        </select>
      </label>
      <label className={label}>
        Notes (optional)
        <input value={notes} onChange={(event) => setNotes(event.target.value)} className={input} />
      </label>
    </ActionDialog>
  );
}

function ResolveDialog({ incident, open, onClose, onDone }: { incident: IncidentDetail; open: boolean; onClose: () => void; onDone: (message: string) => void }) {
  const resolve = useResolveIncident(incident.id);
  const [postmortem, setPostmortem] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (open) {
      setPostmortem(incident.postmortemUrl ?? "");
      setMessage("");
    }
  }, [open, incident.postmortemUrl]);
  return (
    <ActionDialog
      open={open}
      title={`Resolve ${incident.title}`}
      description={incident.announcement ? "The tenant announcement expires now; a final public note replaces its text first." : "No public update was posted, so tenants see nothing."}
      confirmLabel="Resolve incident"
      validate={() => (postmortem.trim() && !/^https?:\/\//.test(postmortem.trim()) ? "The postmortem link must be an http(s) URL." : null)}
      onSubmit={async () => {
        const result = await resolve.mutateAsync({ ...(postmortem.trim() ? { postmortemUrl: postmortem.trim() } : {}), ...(message.trim() ? { publicMessage: message.trim() } : {}) });
        onDone(`Incident resolved.${result.announcement ? " The tenant announcement has expired." : ""}`);
      }}
      onClose={onClose}
    >
      <label className={label}>
        Postmortem link (optional)
        <input value={postmortem} onChange={(event) => setPostmortem(event.target.value)} placeholder="https://" className={input} />
      </label>
      {incident.announcement ? (
        <label className={label}>
          Final public note (optional)
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={2} className={input} />
        </label>
      ) : null}
    </ActionDialog>
  );
}

function RunbookLinks({ incident, onDone }: { incident: IncidentDetail; onDone: (message: string) => void }) {
  const patch = usePatchIncident(incident.id);
  const all = useRunbooks();
  const [choice, setChoice] = useState("");
  const [error, setError] = useState<string | null>(null);
  const linkedIds = incident.runbooks.linked.map((item) => item.id);
  const resolved = incident.status === "RESOLVED";

  async function setLinks(ids: string[], message: string) {
    setError(null);
    try {
      await patch.mutateAsync({ runbookIds: ids });
      onDone(message);
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "The runbook links were not saved."));
    }
  }

  const options = (all.data ?? []).filter((item) => !linkedIds.includes(item.id));
  return (
    <section className="space-y-2 rounded-lg border border-[var(--color-border)] bg-white p-4" data-testid="incident-runbooks">
      <h2 className="text-sm font-semibold">Runbooks</h2>
      {incident.runbooks.linked.length === 0 ? <p className="text-xs text-[var(--color-text-muted)]">No runbook linked.</p> : null}
      <ul className="space-y-1 text-sm">
        {incident.runbooks.linked.map((runbook) => (
          <li key={runbook.id} className="flex items-center justify-between gap-2">
            <Link to={`/platform/incidents/runbooks/${encodeURIComponent(runbook.id)}`} className="text-[var(--fauward-navy)] hover:underline">
              {runbook.title}
            </Link>
            {!resolved ? (
              <PermissionButton permission="platform.incidents.write" className="text-xs underline" onClick={() => void setLinks(linkedIds.filter((id) => id !== runbook.id), `Unlinked ${runbook.title}.`)}>
                Unlink
              </PermissionButton>
            ) : null}
          </li>
        ))}
      </ul>
      {incident.runbooks.suggested.length > 0 && !resolved ? (
        <div className="text-xs text-[var(--color-text-muted)]">
          Suggested for {incident.services.join(", ")}:{" "}
          {incident.runbooks.suggested.map((runbook) => (
            <PermissionButton key={runbook.id} permission="platform.incidents.write" className="mr-2 underline" onClick={() => void setLinks([...linkedIds, runbook.id], `Linked ${runbook.title}.`)}>
              {runbook.title}
            </PermissionButton>
          ))}
        </div>
      ) : null}
      {!resolved && options.length > 0 ? (
        <div className="flex items-end gap-2">
          <label className={label}>
            Link a runbook
            <select value={choice} onChange={(event) => setChoice(event.target.value)} className={input}>
              <option value="">Choose…</option>
              {options.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <PermissionButton permission="platform.incidents.write" disabled={!choice || patch.isPending} className={secondary} onClick={() => void setLinks([...linkedIds, choice], "Runbook linked.").then(() => setChoice(""))}>
            Link
          </PermissionButton>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </section>
  );
}

export function IncidentDetailPage() {
  const { id = "" } = useParams();
  const detail = useIncident(id);
  const [message, setMessage] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"manage" | "impact" | "resolve" | null>(null);
  const incident = detail.data;
  const resolved = incident?.status === "RESOLVED";

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/platform/incidents" className="text-xs font-semibold text-[var(--color-text-muted)] hover:underline">
            Incidents
          </Link>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{incident?.title ?? "Incident"}</h1>
          {incident ? (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <SeverityBadge severity={incident.severity} />
              <StatusBadge status={incident.status} />
              <span>Commander: {personLabel(incident.commander)}</span>
              <span>· Started {when(incident.startedAt)}</span>
              {incident.resolvedAt ? <span>· Resolved {when(incident.resolvedAt)}</span> : null}
              {incident.vendor === "pagerduty" ? <span>· PagerDuty {incident.vendorId}</span> : null}
            </p>
          ) : null}
        </div>
        {incident && !resolved ? (
          <div className="flex flex-wrap gap-2">
            <PermissionButton permission="platform.incidents.write" onClick={() => setDialog("manage")} className={secondary}>
              Status, severity, commander
            </PermissionButton>
            <PermissionButton permission="platform.incidents.write" onClick={() => setDialog("impact")} className={secondary}>
              Tag tenant
            </PermissionButton>
            <PermissionButton permission="platform.incidents.write" onClick={() => setDialog("resolve")} className={primary}>
              Resolve
            </PermissionButton>
          </div>
        ) : null}
      </header>
      <Notice message={message} />
      {detail.isError ? <ConsoleApiErrorPanel error={detail.error} onRetry={() => void detail.refetch()} title="Unable to load the incident" /> : null}
      {detail.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading incident…</p> : null}
      {incident ? (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {!resolved ? <UpdateForm incident={incident} onDone={setMessage} /> : null}
            <section className="space-y-2 rounded-lg border border-[var(--color-border)] bg-white p-4">
              <h2 className="text-sm font-semibold">Timeline</h2>
              {incident.updates.length === 0 ? <p className="text-xs text-[var(--color-text-muted)]">No updates yet.</p> : null}
              <ol className="space-y-2">
                {incident.updates.map((update) => (
                  <li key={update.id} data-testid="incident-update" className="border-l-2 border-[var(--color-border)] pl-3 text-sm">
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {when(update.createdAt)} · {personLabel(update.author)} · {statusLabel(update.status)}
                      {update.isPublic ? <span className="ml-1 rounded bg-blue-100 px-1 text-[10px] font-semibold text-blue-800">Public</span> : null}
                    </p>
                    <p className="whitespace-pre-wrap">{update.body}</p>
                  </li>
                ))}
              </ol>
            </section>
          </div>
          <div className="space-y-4">
            <section className="space-y-2 rounded-lg border border-[var(--color-border)] bg-white p-4" data-testid="incident-impacts">
              <h2 className="text-sm font-semibold">Impacted tenants ({incident.impacts.length})</h2>
              {incident.impacts.length === 0 ? <p className="text-xs text-[var(--color-text-muted)]">No tenant tagged. Public updates go to all tenants until you tag some.</p> : null}
              <ul className="space-y-1">
                {incident.impacts.map((impact) => (
                  <li key={impact.id} className="flex items-center justify-between gap-2 text-xs">
                    <TenantChip tenantId={impact.tenant.id} name={impact.tenant.name} slug={impact.tenant.slug} />
                    <span>{statusLabel(impact.impactLevel)}</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="space-y-1 rounded-lg border border-[var(--color-border)] bg-white p-4 text-sm" data-testid="incident-announcement">
              <h2 className="text-sm font-semibold">Tenant announcement</h2>
              {incident.announcement ? (
                <>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {incident.announcement.state === "ACTIVE" ? "Live" : statusLabel(incident.announcement.state)} · {incident.announcement.targetAll ? "all tenants" : `${incident.announcement.tenantIds.length} tenant(s)`}
                    {incident.announcement.dismissible ? "" : " · not dismissible"}
                  </p>
                  <p className="whitespace-pre-wrap">{incident.announcement.body}</p>
                </>
              ) : (
                <p className="text-xs text-[var(--color-text-muted)]">No public update yet; tenants see nothing.</p>
              )}
            </section>
            <section className="space-y-1 rounded-lg border border-[var(--color-border)] bg-white p-4 text-sm">
              <h2 className="text-sm font-semibold">Postmortem</h2>
              {incident.postmortemUrl ? (
                <a href={incident.postmortemUrl} target="_blank" rel="noreferrer" className="break-all text-[var(--fauward-navy)] underline">
                  {incident.postmortemUrl}
                </a>
              ) : (
                <p className="text-xs text-[var(--color-text-muted)]">{resolved ? "No postmortem linked." : "Add the postmortem link when resolving."}</p>
              )}
              {resolved ? <PostmortemEditor incidentId={incident.id} current={incident.postmortemUrl} onDone={setMessage} /> : null}
            </section>
            <RunbookLinks incident={incident} onDone={setMessage} />
          </div>
        </div>
      ) : null}
      {incident ? (
        <>
          <ManageDialog incident={incident} open={dialog === "manage"} onClose={() => setDialog(null)} onDone={setMessage} />
          <ImpactDialog incident={incident} open={dialog === "impact"} onClose={() => setDialog(null)} onDone={setMessage} />
          <ResolveDialog incident={incident} open={dialog === "resolve"} onClose={() => setDialog(null)} onDone={setMessage} />
        </>
      ) : null}
    </div>
  );
}

function PostmortemEditor({ incidentId, current, onDone }: { incidentId: string; current: string | null; onDone: (message: string) => void }) {
  const patch = usePatchIncident(incidentId);
  const [value, setValue] = useState(current ?? "");
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-end gap-2">
      <label className={`${label} flex-1`}>
        Postmortem link
        <input value={value} onChange={(event) => setValue(event.target.value)} placeholder="https://" className={input} />
      </label>
      <PermissionButton
        permission="platform.incidents.write"
        disabled={patch.isPending || value.trim() === (current ?? "")}
        className={secondary}
        onClick={() => {
          setError(null);
          patch
            .mutateAsync({ postmortemUrl: value.trim() || null })
            .then(() => onDone("Postmortem link saved."))
            .catch((err: unknown) => setError(apiErrorMessage(err, "The link was not saved.")));
        }}
      >
        Save
      </PermissionButton>
      {error ? (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ── Runbooks ─────────────────────────────────────────────────────────────────

export function RunbooksPage() {
  const runbooks = useRunbooks();
  const canWrite = usePermission("platform.incidents.write") === true;
  const rows = runbooks.data ?? [];
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Runbooks</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Response procedures. Runbooks tagged with a service are suggested on incidents that affect it.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <IncidentsNav active="runbooks" />
          {canWrite ? (
            <Link to="/platform/incidents/runbooks/new" className={primary}>
              New runbook
            </Link>
          ) : (
            <PermissionButton permission="platform.incidents.write" className={primary}>
              New runbook
            </PermissionButton>
          )}
        </div>
      </header>
      {runbooks.isError ? <ConsoleApiErrorPanel error={runbooks.error} onRetry={() => void runbooks.refetch()} title="Unable to load runbooks" /> : null}
      {runbooks.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading runbooks…</p> : null}
      {runbooks.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No runbooks yet.</p> : null}
      {rows.length > 0 ? (
        <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white">
          {rows.map((runbook) => (
            <li key={runbook.id} data-testid="runbook-row" className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div>
                <Link to={`/platform/incidents/runbooks/${encodeURIComponent(runbook.id)}`} className="font-semibold text-[var(--fauward-navy)] hover:underline">
                  {runbook.title}
                </Link>
                <p className="font-mono text-xs text-[var(--color-text-muted)]">{runbook.slug}</p>
              </div>
              <span className="text-xs text-[var(--color-text-muted)]">{runbook.service ?? "Any service"} · edited {when(runbook.updatedAt)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function RunbookEditorPage() {
  const { id = "new" } = useParams();
  const isNew = id === "new";
  const navigate = useNavigate();
  const existing = useRunbook(isNew ? "" : id);
  const save = useSaveRunbook(isNew ? null : id);
  const remove = useDeleteRunbook();
  const canWrite = usePermission("platform.incidents.write") === true;
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [service, setService] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!existing.data) return;
    setTitle(existing.data.title);
    setSlug(existing.data.slug);
    setService(existing.data.service ?? "");
    setBody(existing.data.body);
  }, [existing.data]);

  async function submit() {
    setError(null);
    try {
      const saved = await save.mutateAsync({ title: title.trim(), ...(slug.trim() ? { slug: slug.trim() } : {}), body, service: service.trim() || null });
      if (isNew) navigate(`/platform/incidents/runbooks/${encodeURIComponent(saved.id)}`, { replace: true });
      else setMessage("Runbook saved.");
    } catch (err: unknown) {
      setError(apiErrorMessage(err, "The runbook was not saved."));
    }
  }

  return (
    <div className="space-y-4">
      <header>
        <Link to="/platform/incidents/runbooks" className="text-xs font-semibold text-[var(--color-text-muted)] hover:underline">
          Runbooks
        </Link>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{isNew ? "New runbook" : existing.data?.title ?? "Runbook"}</h1>
      </header>
      <Notice message={message} />
      {existing.isError ? <ConsoleApiErrorPanel error={existing.error} onRetry={() => void existing.refetch()} title="Unable to load the runbook" /> : null}
      {!isNew && existing.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading runbook…</p> : null}
      {isNew || existing.data ? (
        <form
          className="space-y-3 rounded-lg border border-[var(--color-border)] bg-white p-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className={label}>
            Title
            <input value={title} onChange={(event) => setTitle(event.target.value)} disabled={!canWrite} className={input} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>
              Slug {isNew ? "(optional, from the title)" : ""}
              <input value={slug} onChange={(event) => setSlug(event.target.value)} disabled={!canWrite} className={`${input} font-mono`} />
            </label>
            <label className={label}>
              Service (optional)
              <input value={service} onChange={(event) => setService(event.target.value)} disabled={!canWrite} placeholder="labels" className={input} />
            </label>
          </div>
          <label className={label}>
            Steps (Markdown)
            <textarea value={body} onChange={(event) => setBody(event.target.value)} disabled={!canWrite} rows={14} className={`${input} font-mono`} />
          </label>
          {error ? (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
          <div className="flex justify-between gap-2">
            <PermissionButton permission="platform.incidents.write" type="submit" disabled={save.isPending || title.trim().length < 3 || body.trim().length === 0} className={primary}>
              {save.isPending ? "Saving…" : isNew ? "Create runbook" : "Save runbook"}
            </PermissionButton>
            {!isNew ? (
              <PermissionButton permission="platform.incidents.write" onClick={() => setDeleting(true)} className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700">
                Delete
              </PermissionButton>
            ) : null}
          </div>
        </form>
      ) : null}
      {existing.data && existing.data.linkedIncidents.length > 0 ? (
        <section className="rounded-lg border border-[var(--color-border)] bg-white p-4 text-sm">
          <h2 className="text-sm font-semibold">Linked incidents</h2>
          <ul className="mt-1 space-y-1">
            {existing.data.linkedIncidents.map((incident) => (
              <li key={incident.id}>
                <Link to={`/platform/incidents/${encodeURIComponent(incident.id)}`} className="text-[var(--fauward-navy)] hover:underline">
                  {incident.title}
                </Link>{" "}
                <span className="text-xs text-[var(--color-text-muted)]">
                  {incident.severity ?? "Unrated"} · {statusLabel(incident.status)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <ActionDialog
        open={deleting}
        title="Delete this runbook?"
        description="It is unlinked from every incident that uses it."
        confirmLabel="Delete runbook"
        onSubmit={async () => {
          await remove.mutateAsync(id);
          navigate("/platform/incidents/runbooks", { replace: true });
        }}
        onClose={() => setDeleting(false)}
      />
    </div>
  );
}
