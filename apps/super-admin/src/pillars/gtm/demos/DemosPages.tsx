import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { consoleApi } from "@/lib/console-api";

// gtm.demos (WP-4.15): DemosPage, CreateDemoPage, DemoDetailPage, DemoTemplatesPage. A demo is a DEMO tenant seeded from
// a code-defined template; its admin password and share link are shown once (at creation, or when the link is
// replaced). Teardown closes the workspace; the expiry job does the same when the demo runs out.

type Demo = {
  id: string;
  tenant: { id: string; name: string; slug: string | null; status: string | null; closed: boolean };
  template: { id: string; name: string };
  prospectName: string | null;
  status: "ACTIVE" | "EXPIRED" | "TORN_DOWN";
  expiresAt: string;
  adminEmail: string | null;
  shareLinkActive: boolean;
  shareRotatedAt: string | null;
  seedSummary: { organisations?: number; shipments?: number; events?: number } | null;
  createdAt: string;
  endedAt: string | null;
  endReason: string | null;
};
type Template = { id: string; name: string; description: string; plan: string; organisations: number; shipments: number };
type Limits = { maxDays: number; defaultDays: number; sessionHours: number };
type Created = { demo: Demo; credentials: { email: string; password: string }; shareUrl: string };

const KEY = ["gtm.demos"] as const;
const input = "mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm";
const label = "block text-xs font-semibold text-[var(--color-text-muted)]";
const primary = "rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50";
const secondary = "rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold";

function when(value: string | null) {
  return value ? new Date(value).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
}

function statusText(demo: Demo) {
  if (demo.status === "ACTIVE") return `active · expires ${when(demo.expiresAt)}`;
  return `${demo.status === "EXPIRED" ? "expired" : "torn down"} ${when(demo.endedAt)}${demo.endReason ? ` · ${demo.endReason}` : ""}`;
}

function DemosNav({ active }: { active: "list" | "create" | "templates" }) {
  const base = "rounded-md px-3 py-1.5 text-xs font-semibold";
  const item = (key: typeof active, to: string, text: string) => (
    <Link to={to} className={`${base} ${active === key ? "bg-[var(--fauward-navy)] text-white" : "border border-[var(--color-border)]"}`}>
      {text}
    </Link>
  );
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Demo sections">
      {item("list", "/gtm/demos", "Demos")}
      {item("create", "/gtm/demos/create", "New demo")}
      {item("templates", "/gtm/demos/templates", "Templates")}
    </nav>
  );
}

function useTemplates() {
  return useQuery({
    queryKey: [...KEY, "templates"],
    queryFn: async () => {
      const data = (await consoleApi.get<{ data?: Template[]; limits?: Limits }>("/demos/templates")).data;
      return { templates: data.data ?? [], limits: data.limits ?? null };
    }
  });
}

/** Shown once: the admin password and the share link cannot be fetched again. */
function SecretsOnce({ title, email, password, shareUrl }: { title: string; email?: string; password?: string; shareUrl: string }) {
  return (
    <section className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm" data-testid="demo-secrets" aria-label={title}>
      <p className="font-semibold">{title}</p>
      <p className="text-xs text-amber-900">Copy these now: Fauward stores only a hash, so they cannot be shown again.</p>
      {email ? (
        <p>
          Admin sign-in: <code>{email}</code>
        </p>
      ) : null}
      {password ? (
        <p>
          One-time password: <code data-testid="demo-password">{password}</code>
        </p>
      ) : null}
      <p className="break-all">
        Read-only share link: <code data-testid="demo-share-url">{shareUrl}</code>
      </p>
    </section>
  );
}

export function DemosPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "ACTIVE";
  const demos = useQuery({
    queryKey: [...KEY, "list", status],
    queryFn: async () => (await consoleApi.get<{ data?: Demo[] }>("/demos", { params: { status } })).data.data ?? []
  });
  const rows = demos.data ?? [];
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Demo environments</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Seeded demo workspaces for prospects. Demo tenants are left out of MRR, health, the funnel and attribution.</p>
        </div>
        <DemosNav active="list" />
      </header>
      <label className={label}>
        Status
        <select aria-label="Demo status" value={status} onChange={(event) => setParams({ status: event.target.value }, { replace: true })} className="mt-1 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
          <option value="ACTIVE">Active</option>
          <option value="ENDED">Ended</option>
          <option value="ALL">All</option>
        </select>
      </label>
      {demos.isError ? <ConsoleApiErrorPanel error={demos.error} onRetry={() => void demos.refetch()} title="Unable to load demos" /> : null}
      {demos.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">{status === "ACTIVE" ? "No demo is running." : "None."}</p> : null}
      {rows.length > 0 ? (
        <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white">
          {rows.map((demo) => (
            <li key={demo.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-testid="demo-row">
              <span className="flex flex-wrap items-center gap-2">
                <TenantChip tenantId={demo.tenant.id} name={demo.tenant.name} slug={demo.tenant.slug} />
                <span className="text-xs text-[var(--color-text-muted)]">
                  {demo.template.name} · {statusText(demo)}
                </span>
              </span>
              <Link to={`/gtm/demos/${encodeURIComponent(demo.id)}`} className="text-xs underline">
                Details
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function CreateDemoPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const templates = useTemplates();
  const [template, setTemplate] = useState("");
  const [prospectName, setProspectName] = useState("");
  const [days, setDays] = useState("");
  const [open, setOpen] = useState(false);
  const [created, setCreated] = useState<Created | null>(null);
  const create = useMutation({
    mutationFn: async (body: { template: string; prospectName: string; expiresInDays: number }) => (await consoleApi.post<Created>("/demos", body, { idempotent: true })).data,
    onSuccess: (data) => {
      setCreated(data);
      void queryClient.invalidateQueries({ queryKey: KEY });
    }
  });
  const limits = templates.data?.limits ?? null;
  const chosen = template || templates.data?.templates[0]?.id || "";
  const dayValue = days || (limits ? String(limits.defaultDays) : "");
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">New demo</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Creates a DEMO tenant with an admin user and seeded data from the template.</p>
        </div>
        <DemosNav active="create" />
      </header>
      {templates.isError ? <ConsoleApiErrorPanel error={templates.error} onRetry={() => void templates.refetch()} title="Unable to load templates" /> : null}
      {created ? (
        <>
          <SecretsOnce title={`Demo ready: ${created.demo.tenant.name}`} email={created.credentials.email} password={created.credentials.password} shareUrl={created.shareUrl} />
          <button type="button" className={secondary} onClick={() => navigate(`/gtm/demos/${encodeURIComponent(created.demo.id)}`)}>
            Open the demo
          </button>
        </>
      ) : templates.data ? (
        <form
          className="max-w-md space-y-3 rounded-lg border border-[var(--color-border)] bg-white p-4"
          onSubmit={(event) => {
            event.preventDefault();
            setOpen(true);
          }}
        >
          <label className={label}>
            Template
            <select aria-label="Template" value={chosen} onChange={(event) => setTemplate(event.target.value)} className={input}>
              {templates.data.templates.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} — {row.description}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            Prospect name
            <input aria-label="Prospect name" value={prospectName} onChange={(event) => setProspectName(event.target.value)} className={input} />
          </label>
          <label className={label}>
            Runs for (days{limits ? `, up to ${limits.maxDays}` : ""})
            <input aria-label="Runs for (days)" type="number" min={1} max={limits?.maxDays} value={dayValue} onChange={(event) => setDays(event.target.value)} className={input} />
          </label>
          <PermissionButton permission="gtm.demos.write" type="submit" disabled={prospectName.trim().length < 2 || !chosen} className={primary}>
            Create demo
          </PermissionButton>
        </form>
      ) : null}
      <ActionDialog
        open={open}
        title={`Create a demo for ${prospectName.trim()}`}
        description="A DEMO tenant, an admin user and seeded data are created. The password and share link are shown once."
        confirmLabel="Create"
       
        validate={() => {
          const value = Number(dayValue);
          return limits && Number.isInteger(value) && value >= 1 && value <= limits.maxDays ? null : `Choose between 1 and ${limits?.maxDays ?? "?"} days.`;
        }}
        onSubmit={async () => {
          await create.mutateAsync({ template: chosen, prospectName: prospectName.trim(), expiresInDays: Number(dayValue) });
        }}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}

export function DemoTemplatesPage() {
  const templates = useTemplates();
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Demo templates</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Defined in code (`config/demo-templates.ts`); each decides the plan and the seeded data.</p>
        </div>
        <DemosNav active="templates" />
      </header>
      {templates.isError ? <ConsoleApiErrorPanel error={templates.error} onRetry={() => void templates.refetch()} title="Unable to load templates" /> : null}
      <ul className="grid gap-3 sm:grid-cols-3">
        {(templates.data?.templates ?? []).map((row) => (
          <li key={row.id} className="rounded-lg border border-[var(--color-border)] bg-white p-4 text-sm" data-testid="template-card">
            <p className="font-semibold">{row.name}</p>
            <p className="mt-1 text-[var(--color-text-muted)]">{row.description}</p>
            <p className="mt-2 text-xs">
              {row.plan} plan · {row.organisations} customers · {row.shipments} shipments
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function DemoDetailPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const templates = useTemplates();
  const demo = useQuery({ queryKey: [...KEY, "detail", id], queryFn: async () => (await consoleApi.get<Demo>(`/demos/${encodeURIComponent(id)}`)).data });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: KEY });
  const extend = useMutation({ mutationFn: async (days: number) => (await consoleApi.post<Demo>(`/demos/${encodeURIComponent(id)}/extend`, { days })).data, onSuccess: invalidate });
  const rotate = useMutation({ mutationFn: async () => (await consoleApi.post<{ demo: Demo; shareUrl: string }>(`/demos/${encodeURIComponent(id)}/share-link`, {})).data, onSuccess: invalidate });
  const teardown = useMutation({ mutationFn: async (reason: string) => (await consoleApi.delete<{ demo: Demo; usersDeactivated: number }>(`/demos/${encodeURIComponent(id)}`, { data: { reason } })).data, onSuccess: invalidate });
  const [dialog, setDialog] = useState<"extend" | "rotate" | "teardown" | null>(null);
  const [days, setDays] = useState("7");
  const [message, setMessage] = useState<string | null>(null);
  const [newLink, setNewLink] = useState<string | null>(null);
  const data = demo.data;
  const active = data?.status === "ACTIVE";
  const maxDays = templates.data?.limits?.maxDays ?? 0;
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Demo</h1>
          {data ? (
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              <TenantChip tenantId={data.tenant.id} name={data.tenant.name} slug={data.tenant.slug} /> · {data.template.name} · {statusText(data)}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <DemosNav active="list" />
          {active ? (
            <>
              <PermissionButton permission="gtm.demos.write" onClick={() => setDialog("extend")} className={secondary}>
                Extend
              </PermissionButton>
              <PermissionButton permission="gtm.demos.write" onClick={() => setDialog("rotate")} className={secondary}>
                Replace share link
              </PermissionButton>
              <PermissionButton permission="gtm.demos.write" onClick={() => setDialog("teardown")} className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700">
                Tear down
              </PermissionButton>
            </>
          ) : null}
        </div>
      </header>
      {message ? (
        <p role="status" className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          {message}
        </p>
      ) : null}
      {newLink ? <SecretsOnce title="New share link" shareUrl={newLink} /> : null}
      {demo.isError ? <ConsoleApiErrorPanel error={demo.error} onRetry={() => void demo.refetch()} title="Unable to load this demo" /> : null}
      {data ? (
        <dl className="grid gap-2 rounded-lg border border-[var(--color-border)] bg-white p-4 text-sm sm:grid-cols-2">
          <div>
            <dt className={label}>Prospect</dt>
            <dd>{data.prospectName ?? "—"}</dd>
          </div>
          <div>
            <dt className={label}>Admin sign-in</dt>
            <dd>{data.adminEmail ?? "—"}</dd>
          </div>
          <div>
            <dt className={label}>Share link</dt>
            <dd>{data.shareLinkActive ? `active${data.shareRotatedAt ? ` · replaced ${when(data.shareRotatedAt)}` : ""}` : "off"}</dd>
          </div>
          <div>
            <dt className={label}>Seeded</dt>
            <dd data-testid="demo-seed">{data.seedSummary ? `${data.seedSummary.organisations ?? 0} customers · ${data.seedSummary.shipments ?? 0} shipments` : "—"}</dd>
          </div>
          <div>
            <dt className={label}>Created</dt>
            <dd>{when(data.createdAt)}</dd>
          </div>
        </dl>
      ) : null}
      <ActionDialog
        open={dialog === "extend"}
        title="Extend the demo"
        description={maxDays ? `The demo can run at most ${maxDays} days from today.` : undefined}
        confirmLabel="Extend"
       
        validate={() => {
          const value = Number(days);
          return maxDays && Number.isInteger(value) && value >= 1 && value <= maxDays ? null : `Choose between 1 and ${maxDays || "?"} days.`;
        }}
        onSubmit={async () => {
          const result = await extend.mutateAsync(Number(days));
          setMessage(`Demo now expires ${when(result.expiresAt)}.`);
        }}
        onClose={() => setDialog(null)}
      >
        <label className={label}>
          Extra days
          <input aria-label="Extra days" type="number" min={1} max={maxDays || undefined} value={days} onChange={(event) => setDays(event.target.value)} className={input} />
        </label>
      </ActionDialog>
      <ActionDialog
        open={dialog === "rotate"}
        title="Replace the share link"
        description="Anyone using the current link is signed out on their next click. The new link is shown once."
        confirmLabel="Replace link"
       
        onSubmit={async () => {
          const result = await rotate.mutateAsync();
          setNewLink(result.shareUrl);
          setMessage("Share link replaced.");
        }}
        onClose={() => setDialog(null)}
      />
      <ActionDialog
        open={dialog === "teardown"}
        dangerous
        title={data ? `Tear down ${data.tenant.name}` : "Tear down"}
        description="Closes the demo workspace, deactivates its users and turns the share link off. The tenant stays a DEMO tenant."
        confirmLabel="Tear down"
        onSubmit={async (reason) => {
          const result = await teardown.mutateAsync(reason);
          setNewLink(null);
          setMessage(`Demo torn down; ${result.usersDeactivated} user${result.usersDeactivated === 1 ? "" : "s"} deactivated.`);
        }}
        onClose={() => setDialog(null)}
      />
    </div>
  );
}
