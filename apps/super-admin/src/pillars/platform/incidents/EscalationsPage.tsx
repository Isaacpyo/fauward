import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { consoleApi } from "@/lib/console-api";
import { apiErrorMessage } from "@/lib/console-api-error";
import { useMe } from "@/lib/use-me";

// platform.incidents — tenant escalations (L15, WP-2.11): a tenant escalates an exception case; staff assign, reply
// (the tenant sees it on its Exceptions page and is notified) and resolve. New escalations arrive on the activity
// stream and in the bell (CRITICAL), replacing the old `escalations:all` WebSocket room.

type Escalation = {
  id: string;
  tenant: { id: string; name: string; slug: string };
  shipment: { id: string; trackingNumber: string; status: string } | null;
  type: string;
  severity: string;
  status: string;
  state: "OPEN" | "RESOLVED";
  escalatedAt: string;
  reason: string | null;
  platformAssigneeId: string | null;
  platformResolvedAt: string | null;
  replies: Array<{ id: string; platformUserId: string; authorName: string; body: string; createdAt: string }>;
};
type EscalationList = { data: Escalation[]; total: number; nextCursor: string | null };

const KEY = ["platform.incidents", "escalations"] as const;
const STATUSES = [
  { id: "OPEN", label: "Open" },
  { id: "RESOLVED", label: "Resolved" },
  { id: "ALL", label: "All" }
];

function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function EscalationDetail({ escalation, meId }: { escalation: Escalation; meId: string | undefined }) {
  const queryClient = useQueryClient();
  const [reply, setReply] = useState("");
  const update = useMutation({
    mutationFn: async (body: { platformAssigneeId?: string | null; reply?: string; resolve?: true }) => (await consoleApi.patch<Escalation>(`/operations/escalations/${encodeURIComponent(escalation.id)}`, body)).data,
    onSuccess: async (_data, body) => {
      if (body.reply) setReply("");
      await queryClient.invalidateQueries({ queryKey: KEY });
    }
  });
  const open = escalation.state === "OPEN";
  return (
    <section className="space-y-3 rounded-lg border border-[var(--color-border)] bg-white p-4" data-testid="escalation-detail">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold">
            {escalation.type}
            {escalation.shipment ? ` · ${escalation.shipment.trackingNumber}` : ""}
          </h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            Escalated {when(escalation.escalatedAt)} · severity {escalation.severity} · case {escalation.status}
          </p>
        </div>
        <TenantChip tenantId={escalation.tenant.id} name={escalation.tenant.name} slug={escalation.tenant.slug} />
      </div>
      <p className="rounded-md bg-[var(--color-surface-50)] p-3 text-sm">{escalation.reason}</p>
      <p className="text-sm">
        Assignee: {escalation.platformAssigneeId ? (escalation.platformAssigneeId === meId ? "you" : escalation.platformAssigneeId) : "nobody"}
        {open ? (
          <PermissionButton
            permission="platform.incidents.write"
            disabled={update.isPending || !meId || escalation.platformAssigneeId === meId}
            onClick={() => update.mutate({ platformAssigneeId: meId ?? null })}
            className="ml-3 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold disabled:opacity-50"
          >
            Assign to me
          </PermissionButton>
        ) : null}
      </p>
      <ol className="space-y-2" aria-label="Replies to the tenant">
        {escalation.replies.length === 0 ? <li className="text-sm text-[var(--color-text-muted)]">No reply yet.</li> : null}
        {escalation.replies.map((item) => (
          <li key={item.id} className="rounded-md border border-[var(--color-border)] p-2 text-sm" data-testid="escalation-reply">
            <p className="text-xs text-[var(--color-text-muted)]">
              {item.authorName} · {when(item.createdAt)}
            </p>
            <p className="mt-1 whitespace-pre-wrap">{item.body}</p>
          </li>
        ))}
      </ol>
      {open ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (reply.trim()) update.mutate({ reply: reply.trim() });
          }}
        >
          <label htmlFor="escalation-reply" className="block text-xs font-semibold text-[var(--color-text-muted)]">
            Reply to the tenant (they see it and get an email)
          </label>
          <textarea id="escalation-reply" rows={3} value={reply} onChange={(event) => setReply(event.target.value)} className="w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm" />
          <div className="flex gap-2">
            <PermissionButton permission="platform.incidents.write" type="submit" disabled={update.isPending || reply.trim().length === 0} className="rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
              Send reply
            </PermissionButton>
            <PermissionButton permission="platform.incidents.write" disabled={update.isPending} onClick={() => update.mutate({ resolve: true })} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50">
              Resolve
            </PermissionButton>
          </div>
        </form>
      ) : (
        <p className="text-sm text-[var(--color-text-muted)]">Resolved {when(escalation.platformResolvedAt)}. The tenant can escalate again.</p>
      )}
      {update.isError ? <p className="text-xs text-red-700">{apiErrorMessage(update.error, "The change was not saved.")}</p> : null}
    </section>
  );
}

export function EscalationsPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "OPEN";
  const selectedId = params.get("id");
  const me = useMe();
  const list = useQuery({
    queryKey: [...KEY, "list", status],
    queryFn: async () => (await consoleApi.get<EscalationList>("/operations/escalations", { params: { status, limit: 100 } })).data,
    placeholderData: keepPreviousData,
    refetchInterval: 30_000
  });
  const rows = list.data?.data ?? [];
  const selected = rows.find((row) => row.id === selectedId) ?? null;
  const set = (next: Record<string, string>) => setParams({ status, ...(selectedId ? { id: selectedId } : {}), ...next }, { replace: true });

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Tenant escalations</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Exceptions tenants escalated to Fauward. Replies and resolution go back to the tenant.</p>
        </div>
        <select aria-label="Status" value={status} onChange={(event) => setParams({ status: event.target.value }, { replace: true })} className="rounded-md border border-[var(--color-border)] px-2 py-1.5 text-sm">
          {STATUSES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </header>
      {list.isError ? <ConsoleApiErrorPanel error={list.error} onRetry={() => void list.refetch()} title="Unable to load escalations" /> : null}
      {list.isLoading ? <p className="text-sm text-[var(--color-text-muted)]">Loading escalations…</p> : null}
      {list.isSuccess && rows.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No {status === "ALL" ? "" : status.toLowerCase()} escalations.</p> : null}
      {rows.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white">
            {rows.map((row) => (
              <li key={row.id} data-testid="escalation-row" className={`px-3 py-2 text-sm ${row.id === selectedId ? "bg-[var(--color-surface-50)]" : ""}`}>
                <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} />
                <button type="button" aria-current={row.id === selectedId ? "true" : undefined} onClick={() => set({ id: row.id })} className="mt-1 block w-full text-left">
                  <span className="font-semibold">{row.type}</span>
                  {row.shipment ? ` · ${row.shipment.trackingNumber}` : ""}
                  <span className="block text-xs text-[var(--color-text-muted)]">
                    {when(row.escalatedAt)} · {row.state === "OPEN" ? (row.platformAssigneeId ? "assigned" : "unassigned") : "resolved"} · {row.replies.length} repl{row.replies.length === 1 ? "y" : "ies"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {selected ? <EscalationDetail escalation={selected} meId={me.data?.user.id} /> : <p className="text-sm text-[var(--color-text-muted)]">Select an escalation.</p>}
        </div>
      ) : null}
    </div>
  );
}
