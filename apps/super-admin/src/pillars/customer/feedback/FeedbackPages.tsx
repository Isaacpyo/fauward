import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import { ActionDialog } from "@/components/service-kit/ActionDialog";
import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { useMe } from "@/lib/use-me";
import { FEEDBACK_STATUSES, type FeedbackStatus, useCommentFeedback, useFeedback, useFeedbackItem, useUpdateFeedback, words } from "./api";

const field = "mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm";
const TYPES = [
  { id: "", label: "All types" },
  { id: "FEATURE_REQUEST", label: "Feature requests" },
  { id: "BUG", label: "Bugs" },
  { id: "GENERAL", label: "General" }
];

function FeedbackNav({ current }: { current: "board" | "nps" }) {
  return (
    <nav aria-label="Feedback" className="flex gap-4 border-b border-[var(--color-border)] pb-2 text-sm">
      <Link to="/customer/feedback" aria-current={current === "board" ? "page" : undefined} className={current === "board" ? "font-semibold text-[var(--fauward-navy)]" : "text-[var(--color-text-muted)]"}>
        Board
      </Link>
      <Link to="/customer/feedback/nps" aria-current={current === "nps" ? "page" : undefined} className={current === "nps" ? "font-semibold text-[var(--fauward-navy)]" : "text-[var(--color-text-muted)]"}>
        NPS
      </Link>
    </nav>
  );
}

/** Feature requests, bugs and general feedback by status (NPS answers live on the NPS page). */
export function FeedbackBoardPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const type = params.get("type") ?? "";
  const featureKey = params.get("featureKey") ?? undefined;
  const query = useFeedback({ ...(type ? { type } : {}), ...(featureKey ? { featureKey } : {}) });
  const items = (query.data?.data ?? []).filter((item) => item.type !== "NPS");

  return (
    <div className="space-y-4">
      <FeedbackNav current="board" />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Feedback board</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Moving an item to another status tells the person who raised it.</p>
        </div>
        <select aria-label="Type" value={type} onChange={(event) => setParams(event.target.value ? { type: event.target.value } : {}, { replace: true })} className="rounded-md border border-[var(--color-border)] px-2 py-1.5 text-sm">
          {TYPES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </header>
      {featureKey ? (
        <p className="text-sm">
          Feature <span className="font-mono">{featureKey}</span> ·{" "}
          <button type="button" className="font-semibold text-[var(--fauward-navy)] hover:underline" onClick={() => setParams(type ? { type } : {}, { replace: true })}>
            Show all
          </button>
        </p>
      ) : null}
      {query.isError ? <ConsoleApiErrorPanel error={query.error} onRetry={() => void query.refetch()} title="Unable to load feedback" /> : null}
      {!query.isError ? (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {FEEDBACK_STATUSES.map((status) => {
            const column = items.filter((item) => item.status === status);
            return (
              <section key={status} aria-label={words(status)} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-50)] p-2">
                <h2 className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                  {words(status)} ({column.length})
                </h2>
                <ul className="space-y-2">
                  {column.map((item) => (
                    <li key={item.id} data-testid="feedback-card" onClick={() => navigate(`/customer/feedback/${item.id}`)} className="cursor-pointer rounded-md border border-[var(--color-border)] bg-white p-2 text-sm hover:border-[var(--fauward-navy)]">
                      <p className="font-semibold">{item.title ?? words(item.type)}</p>
                      <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                        {words(item.type)}
                        {item.featureKey ? ` · ${item.featureKey}` : ""}
                      </p>
                      {item.tenant ? (
                        <span className="mt-1 inline-block" onClick={(event) => event.stopPropagation()}>
                          <TenantChip tenantId={item.tenant.id} name={item.tenant.name} slug={item.tenant.slug} />
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      ) : null}
      {!query.isLoading && !query.isError && items.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No feedback yet.</p> : null}
    </div>
  );
}

export function FeedbackDetailPage() {
  const { id = "" } = useParams();
  const detail = useFeedbackItem(id);
  const update = useUpdateFeedback();
  const comment = useCommentFeedback();
  const me = useMe();
  const [nextStatus, setNextStatus] = useState<FeedbackStatus | null>(null);
  const [message, setMessage] = useState("");
  const [note, setNote] = useState("");
  const [visible, setVisible] = useState(true);

  if (detail.isLoading) return <p className="text-sm text-[var(--color-text-muted)]">Loading feedback…</p>;
  if (detail.isError) return <ConsoleApiErrorPanel error={detail.error} onRetry={() => void detail.refetch()} title="Unable to load the feedback" />;
  if (!detail.data) return null;
  const { item, comments } = detail.data;
  const myId = me.data?.user.id;

  return (
    <div className="space-y-4">
      <FeedbackNav current="board" />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/customer/feedback" className="text-xs font-semibold text-[var(--fauward-navy)] hover:underline">
            ← Feedback board
          </Link>
          <h1 className="mt-1 text-xl font-bold text-[var(--color-text-primary)]">{item.title ?? words(item.type)}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--color-text-muted)]" data-testid="feedback-meta">
            {item.tenant ? <TenantChip tenantId={item.tenant.id} name={item.tenant.name} slug={item.tenant.slug} /> : null}
            {words(item.type)} · {words(item.status)} · from {item.requester?.name ?? item.requester?.email ?? "a tenant user"} via {words(item.source)}
            {item.featureKey ? ` · feature ${item.featureKey}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-semibold text-[var(--color-text-muted)]">
            Move to
            <select
              aria-label="Move to status"
              value=""
              onChange={(event) => {
                setMessage("");
                setNextStatus(event.target.value as FeedbackStatus);
              }}
              className="ml-2 rounded-md border border-[var(--color-border)] px-2 py-1.5 text-sm"
            >
              <option value="">Choose…</option>
              {FEEDBACK_STATUSES.filter((status) => status !== item.status).map((status) => (
                <option key={status} value={status}>
                  {words(status)}
                </option>
              ))}
            </select>
          </label>
          {myId && item.assignedPlatformUserId !== myId ? (
            <PermissionButton permission="customer.feedback.write" onClick={() => update.mutate({ id: item.id, assignedPlatformUserId: myId })} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50">
              Assign to me
            </PermissionButton>
          ) : null}
        </div>
      </header>
      {update.isError ? <ConsoleApiErrorPanel error={update.error} title="The change was not saved" /> : null}

      <section className="rounded-lg border border-[var(--color-border)] bg-white p-4 text-sm">
        {item.score !== null ? <p className="mb-2 text-lg font-bold">NPS {item.score}</p> : null}
        <p className="whitespace-pre-wrap" data-testid="feedback-body">
          {item.body ?? "No details given."}
        </p>
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">Raised {new Date(item.createdAt).toLocaleString()}</p>
      </section>

      <section className="space-y-2 rounded-lg border border-[var(--color-border)] bg-white p-4 text-sm">
        <h2 className="font-semibold">Comments</h2>
        <ul className="space-y-2" data-testid="feedback-comments">
          {comments.map((row) => (
            <li key={row.id} className={`rounded-md border p-2 ${row.visibleToTenant ? "border-[var(--color-border)]" : "border-amber-200 bg-amber-50"}`}>
              <p className="whitespace-pre-wrap">{row.body}</p>
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                {new Date(row.createdAt).toLocaleString()} · {row.visibleToTenant ? "visible to the tenant" : "internal"}
              </p>
            </li>
          ))}
          {comments.length === 0 ? <li className="text-[var(--color-text-muted)]">No comments yet.</li> : null}
        </ul>
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            comment.mutate({ id: item.id, body: note.trim(), visibleToTenant: visible }, { onSuccess: () => setNote("") });
          }}
        >
          <textarea aria-label="Comment" value={note} onChange={(event) => setNote(event.target.value)} rows={3} className={field} />
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} /> Visible to the tenant
          </label>
          {comment.isError ? <ConsoleApiErrorPanel error={comment.error} title="The comment was not saved" /> : null}
          <PermissionButton permission="customer.feedback.write" type="submit" disabled={!note.trim() || comment.isPending} className="rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            {comment.isPending ? "Saving…" : "Add comment"}
          </PermissionButton>
        </form>
      </section>

      <ActionDialog
        open={nextStatus !== null}
        title={nextStatus ? `Move to ${words(nextStatus)}?` : ""}
        description="The person who raised this is notified in the portal and by email."
        confirmLabel="Move"
        onSubmit={async () => update.mutateAsync({ id: item.id, status: nextStatus!, ...(message.trim() ? { message: message.trim() } : {}) })}
        onClose={() => setNextStatus(null)}
      >
        <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
          Message to the requester (optional)
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={3} className={field} />
        </label>
      </ActionDialog>
    </div>
  );
}

/** NPS over the last twelve months: overall and by month (promoters 9-10, passives 7-8, detractors 0-6). */
export function NpsPage() {
  const query = useFeedback({ type: "NPS" });
  const nps = query.data?.nps;
  const answers = query.data?.data ?? [];
  return (
    <div className="space-y-4">
      <FeedbackNav current="nps" />
      <header>
        <h1 className="text-xl font-bold text-[var(--color-text-primary)]">NPS</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">From the in-app survey; each answer also feeds that tenant&apos;s health score.</p>
      </header>
      {query.isError ? <ConsoleApiErrorPanel error={query.error} onRetry={() => void query.refetch()} title="Unable to load NPS" /> : null}
      {nps ? (
        <>
          <section className="grid gap-3 sm:grid-cols-4" data-testid="nps-overall">
            {[
              ["NPS", nps.overall.nps === null ? "—" : String(nps.overall.nps)],
              ["Promoters", String(nps.overall.promoters)],
              ["Passives", String(nps.overall.passives)],
              ["Detractors", String(nps.overall.detractors)]
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-[var(--color-border)] bg-white p-4">
                <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
                <p className="mt-1 text-2xl font-bold">{value}</p>
              </div>
            ))}
          </section>
          <section className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--color-surface-50)] text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                <tr>
                  <th className="px-3 py-2">Month</th>
                  <th className="px-3 py-2">NPS</th>
                  <th className="px-3 py-2">Responses</th>
                  <th className="px-3 py-2">Promoters / passives / detractors</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {nps.byMonth.map((row) => (
                  <tr key={row.month} data-testid="nps-month">
                    <td className="px-3 py-2">{row.month}</td>
                    <td className="px-3 py-2 font-semibold">{row.nps ?? "—"}</td>
                    <td className="px-3 py-2">{row.responses}</td>
                    <td className="px-3 py-2 text-xs">
                      {row.promoters} / {row.passives} / {row.detractors}
                    </td>
                  </tr>
                ))}
                {nps.byMonth.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-8 text-center text-sm text-[var(--color-text-muted)]">
                      No NPS answers yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </section>
          <section className="rounded-lg border border-[var(--color-border)] bg-white p-4 text-sm">
            <h2 className="font-semibold">Latest answers</h2>
            <ul className="mt-2 space-y-1">
              {answers.slice(0, 50).map((row) => (
                <li key={row.id} className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-semibold">{row.score}</span>
                  {row.tenant ? <TenantChip tenantId={row.tenant.id} name={row.tenant.name} slug={row.tenant.slug} /> : null}
                  <span className="text-[var(--color-text-muted)]">{row.body ?? ""}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}
