import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { consoleApi } from "@/lib/console-api";

// customer.comms — announcements (L8, WP-2.14): publish (now or scheduled, optional email to tenant admins), edit,
// archive, delete before anyone saw it; receipts (viewed / dismissed / CTA clicks) and audience counts per announcement.

type AnnouncementType = "INFO" | "WARNING" | "MAINTENANCE";
type Announcement = {
  id: string;
  type: AnnouncementType;
  title: string;
  body: string;
  targetAll: boolean;
  tenantIds: string[];
  planTiers: string[];
  cta: { label: string; url: string } | null;
  dismissible: boolean;
  publishedAt: string;
  expiresAt: string | null;
  archivedAt: string | null;
  alsoEmail: boolean;
  state: "ACTIVE" | "SCHEDULED" | "EXPIRED" | "ARCHIVED";
  receipts: { viewed: number; dismissed: number; ctaClicked: number };
};

const KEY = ["customer.comms", "announcements"] as const;
const STATUSES = ["active", "scheduled", "expired", "archived", "all"] as const;
const PLANS = ["STARTER", "PRO", "ENTERPRISE"] as const;
const field = "mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm";

type Draft = {
  type: AnnouncementType;
  title: string;
  body: string;
  audience: "all" | "plans" | "tenants";
  planTiers: string[];
  tenantIds: string;
  ctaLabel: string;
  ctaUrl: string;
  dismissible: boolean;
  publishAt: string;
  expiresAt: string;
  alsoEmail: boolean;
};

const emptyDraft: Draft = { type: "INFO", title: "", body: "", audience: "all", planTiers: [], tenantIds: "", ctaLabel: "", ctaUrl: "", dismissible: true, publishAt: "", expiresAt: "", alsoEmail: false };

function draftFrom(row: Announcement): Draft {
  return {
    type: row.type,
    title: row.title,
    body: row.body,
    audience: row.targetAll ? "all" : row.tenantIds.length > 0 ? "tenants" : "plans",
    planTiers: row.planTiers,
    tenantIds: row.tenantIds.join(", "),
    ctaLabel: row.cta?.label ?? "",
    ctaUrl: row.cta?.url ?? "",
    dismissible: row.dismissible,
    publishAt: "",
    expiresAt: row.expiresAt ? row.expiresAt.slice(0, 16) : "",
    alsoEmail: false
  };
}

function targeting(draft: Draft) {
  const tenantIds = draft.audience === "tenants" ? draft.tenantIds.split(",").map((id) => id.trim()).filter(Boolean) : [];
  return { targetAll: draft.audience === "all", tenantIds, planTiers: draft.audience === "plans" ? draft.planTiers : [] };
}

function isoOrNull(local: string) {
  return local ? new Date(local).toISOString() : null;
}

function AudiencePreview({ draft }: { draft: Draft }) {
  const target = targeting(draft);
  const preview = useQuery({
    queryKey: [...KEY, "audience", target],
    queryFn: async () =>
      (await consoleApi.get<{ tenants: number; users: number }>("/announcements/audience-preview", { params: { targetAll: String(target.targetAll), tenantIds: target.tenantIds.join(","), planTiers: target.planTiers.join(",") } })).data,
    placeholderData: keepPreviousData
  });
  if (preview.isError) return <p className="text-xs text-red-700">Audience could not be counted.</p>;
  return <p className="text-xs text-[var(--color-text-muted)]" data-testid="audience-preview">{preview.data ? `Reaches ${preview.data.tenants} tenant(s), ${preview.data.users} user(s).` : "Counting audience…"}</p>;
}

function AnnouncementForm({ draft, setDraft, creating }: { draft: Draft; setDraft: (next: Draft) => void; creating: boolean }) {
  return (
    <div className="space-y-3 text-sm">
      <label className="block">
        <span className="text-xs font-semibold text-[var(--color-text-muted)]">Title</span>
        <input aria-label="Title" className={field} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} maxLength={200} />
      </label>
      <label className="block">
        <span className="text-xs font-semibold text-[var(--color-text-muted)]">Message</span>
        <textarea aria-label="Message" className={field} rows={3} value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} maxLength={2000} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="text-xs font-semibold text-[var(--color-text-muted)]">Type</span>
          <select aria-label="Type" className={field} value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value as AnnouncementType })}>
            <option value="INFO">Info</option>
            <option value="WARNING">Warning</option>
            <option value="MAINTENANCE">Maintenance</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-[var(--color-text-muted)]">Audience</span>
          <select aria-label="Audience" className={field} value={draft.audience} onChange={(event) => setDraft({ ...draft, audience: event.target.value as Draft["audience"] })}>
            <option value="all">All tenants</option>
            <option value="plans">Plans</option>
            <option value="tenants">Specific tenants</option>
          </select>
        </label>
      </div>
      {draft.audience === "plans" ? (
        <fieldset className="flex gap-3">
          {PLANS.map((plan) => (
            <label key={plan} className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={draft.planTiers.includes(plan)} onChange={(event) => setDraft({ ...draft, planTiers: event.target.checked ? [...draft.planTiers, plan] : draft.planTiers.filter((item) => item !== plan) })} />
              {plan}
            </label>
          ))}
        </fieldset>
      ) : null}
      {draft.audience === "tenants" ? <input aria-label="Tenant IDs" placeholder="Tenant IDs, comma separated" className={field} value={draft.tenantIds} onChange={(event) => setDraft({ ...draft, tenantIds: event.target.value })} /> : null}
      <AudiencePreview draft={draft} />
      <div className="grid grid-cols-2 gap-2">
        <input aria-label="Button label" placeholder="Button label (optional)" className={field} value={draft.ctaLabel} onChange={(event) => setDraft({ ...draft, ctaLabel: event.target.value })} />
        <input aria-label="Button link" placeholder="https://…" className={field} value={draft.ctaUrl} onChange={(event) => setDraft({ ...draft, ctaUrl: event.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {creating ? (
          <label className="block">
            <span className="text-xs font-semibold text-[var(--color-text-muted)]">Publish at (empty = now)</span>
            <input aria-label="Publish at" type="datetime-local" className={field} value={draft.publishAt} onChange={(event) => setDraft({ ...draft, publishAt: event.target.value, alsoEmail: event.target.value ? false : draft.alsoEmail })} />
          </label>
        ) : null}
        <label className="block">
          <span className="text-xs font-semibold text-[var(--color-text-muted)]">Expires at (optional)</span>
          <input aria-label="Expires at" type="datetime-local" className={field} value={draft.expiresAt} onChange={(event) => setDraft({ ...draft, expiresAt: event.target.value })} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={draft.dismissible} onChange={(event) => setDraft({ ...draft, dismissible: event.target.checked })} />
        Tenants can dismiss it
      </label>
      {creating ? (
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" disabled={Boolean(draft.publishAt)} checked={draft.alsoEmail} onChange={(event) => setDraft({ ...draft, alsoEmail: event.target.checked })} />
          Also email every targeted tenant admin {draft.publishAt ? "(only when publishing now)" : ""}
        </label>
      ) : null}
    </div>
  );
}

function validate(draft: Draft) {
  if (!draft.title.trim() || !draft.body.trim()) return "Title and message are required.";
  const target = targeting(draft);
  if (!target.targetAll && target.tenantIds.length === 0 && target.planTiers.length === 0) return "Choose an audience.";
  if (Boolean(draft.ctaLabel.trim()) !== Boolean(draft.ctaUrl.trim())) return "A button needs both a label and a link.";
  return null;
}

function payload(draft: Draft) {
  return {
    type: draft.type,
    title: draft.title.trim(),
    body: draft.body.trim(),
    ...targeting(draft),
    cta: draft.ctaLabel.trim() ? { label: draft.ctaLabel.trim(), url: draft.ctaUrl.trim() } : null,
    dismissible: draft.dismissible,
    expiresAt: isoOrNull(draft.expiresAt)
  };
}

export function AnnouncementsPage() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const status = (params.get("status") ?? "active") as (typeof STATUSES)[number];
  const list = useQuery({
    queryKey: [...KEY, "list", status],
    queryFn: async () => (await consoleApi.get<{ data: Announcement[] }>("/announcements", { params: { status } })).data.data,
    placeholderData: keepPreviousData
  });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [archiving, setArchiving] = useState<Announcement | null>(null);
  const [deleting, setDeleting] = useState<Announcement | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  useEffect(() => setDraft(editing ? draftFrom(editing) : emptyDraft), [editing, creating]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: KEY });
  const rows = list.data ?? [];

  return (
    <div className="space-y-4">
      <nav aria-label="Communications" className="flex gap-4 border-b border-[var(--color-border)] pb-2 text-sm">
        <span aria-current="page" className="font-semibold text-[var(--fauward-navy)]">
          Announcements
        </span>
        <Link to="/customer/comms/delivery-log" className="text-[var(--color-text-muted)]">
          Delivery log
        </Link>
      </nav>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Announcements</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Banners in the tenant portal. Receipts show who saw, dismissed or clicked them.</p>
        </div>
        <div className="flex items-center gap-2">
          <select aria-label="Status" value={status} onChange={(event) => setParams({ status: event.target.value }, { replace: true })} className="rounded-md border border-[var(--color-border)] px-2 py-1.5 text-sm">
            {STATUSES.map((item) => (
              <option key={item} value={item}>
                {item[0].toUpperCase() + item.slice(1)}
              </option>
            ))}
          </select>
          <PermissionButton permission="customer.comms.send" onClick={() => setCreating(true)} className="rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
            New announcement
          </PermissionButton>
        </div>
      </header>
      {list.isError ? <ConsoleApiErrorPanel error={list.error} onRetry={() => void list.refetch()} title="Unable to load announcements" /> : null}
      {list.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading announcements…</p> : null}
      {list.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No {status === "all" ? "" : status} announcements.</p> : null}
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.id} data-testid="announcement-row" className="rounded-lg border border-[var(--color-border)] bg-white p-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {row.title} <span className="ml-1 text-xs font-normal text-[var(--color-text-muted)]">{row.type} · {row.state}</span>
                </p>
                <p className="mt-1 whitespace-pre-wrap text-[var(--color-text-muted)]">{row.body}</p>
                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                  {row.targetAll ? "All tenants" : [row.planTiers.length ? `Plans ${row.planTiers.join(", ")}` : null, row.tenantIds.length ? `${row.tenantIds.length} tenant(s)` : null].filter(Boolean).join(" · ")} · published {new Date(row.publishedAt).toLocaleString()}
                  {row.expiresAt ? ` · expires ${new Date(row.expiresAt).toLocaleString()}` : ""}
                  {row.alsoEmail ? " · emailed" : ""}
                </p>
              </div>
              <p className="text-xs" data-testid="announcement-receipts">
                {row.receipts.viewed} viewed · {row.receipts.dismissed} dismissed · {row.receipts.ctaClicked} clicked
              </p>
            </div>
            {row.state !== "ARCHIVED" ? (
              <div className="mt-3 flex gap-2">
                <PermissionButton permission="customer.comms.send" onClick={() => setEditing(row)} className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold disabled:opacity-50">
                  Edit
                </PermissionButton>
                <PermissionButton permission="customer.comms.send" onClick={() => setArchiving(row)} className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold disabled:opacity-50">
                  Archive
                </PermissionButton>
                {row.receipts.viewed === 0 ? (
                  <PermissionButton permission="customer.comms.send" onClick={() => setDeleting(row)} className="rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 disabled:opacity-50">
                    Delete
                  </PermissionButton>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <ActionDialog
        open={creating}
        title="New announcement"
        confirmLabel={draft.publishAt ? "Schedule" : "Publish"}
        validate={() => validate(draft)}
        onSubmit={async () => {
          await consoleApi.post("/announcements", { ...payload(draft), ...(draft.publishAt ? { publishedAt: isoOrNull(draft.publishAt) } : {}), alsoEmail: draft.alsoEmail });
          await refresh();
        }}
        onClose={() => setCreating(false)}
      >
        <AnnouncementForm draft={draft} setDraft={setDraft} creating />
      </ActionDialog>
      <ActionDialog
        open={editing !== null}
        title="Edit announcement"
        description="Tenants see the change within a minute."
        confirmLabel="Save"
        validate={() => validate(draft)}
        onSubmit={async () => {
          if (!editing) return;
          await consoleApi.patch(`/announcements/${encodeURIComponent(editing.id)}`, payload(draft));
          await refresh();
        }}
        onClose={() => setEditing(null)}
      >
        <AnnouncementForm draft={draft} setDraft={setDraft} creating={false} />
      </ActionDialog>
      <ActionDialog
        open={archiving !== null}
        title="Archive announcement"
        description={archiving ? `"${archiving.title}" disappears from tenant portals within a minute. Receipts are kept.` : undefined}
        confirmLabel="Archive"
        onSubmit={async () => {
          if (!archiving) return;
          await consoleApi.post(`/announcements/${encodeURIComponent(archiving.id)}/archive`);
          await refresh();
        }}
        onClose={() => setArchiving(null)}
      />
      <ActionDialog
        open={deleting !== null}
        dangerous
        title="Delete announcement"
        description={deleting ? `"${deleting.title}" has not been seen yet and is removed for good.` : undefined}
        confirmLabel="Delete"
        onSubmit={async (reason) => {
          if (!deleting) return;
          await consoleApi.delete(`/announcements/${encodeURIComponent(deleting.id)}`, { data: { reason } });
          await refresh();
        }}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
