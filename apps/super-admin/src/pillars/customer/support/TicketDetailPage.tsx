import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { apiErrorMessage } from "@/lib/console-api-error";
import { useMe } from "@/lib/use-me";
import { usePermission } from "@fauward/internal-rbac";
import { PRIORITIES, STATUSES, type TicketMessage, type TicketPriority, type TicketStatus, label, useMacros, useReply, useTicket, useUpdateTicket } from "./api";

const card = "rounded-lg border border-[var(--color-border)] bg-white p-4";

function MessageBubble({ message }: { message: TicketMessage }) {
  const internal = message.visibility !== "PUBLIC";
  return (
    <li data-testid="ticket-message" data-visibility={message.visibility} className={`rounded-lg border p-3 text-sm ${internal ? "border-amber-200 bg-amber-50" : message.authorType === "STAFF" ? "border-blue-100 bg-blue-50" : "border-[var(--color-border)] bg-white"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--color-text-muted)]">
        <span className="font-semibold text-[var(--color-text-primary)]">
          {message.authorLabel}
          {message.authorType === "STAFF" ? " (Fauward)" : ""}
        </span>
        <span>
          {internal ? <span className="mr-2 font-semibold text-amber-800">{message.visibility === "STAFF_INTERNAL" ? "Internal note — Fauward only" : "Tenant internal note"}</span> : null}
          {new Date(message.createdAt).toLocaleString()}
        </span>
      </div>
      <p className="mt-2 whitespace-pre-wrap">{message.body}</p>
    </li>
  );
}

export function TicketDetailPage() {
  const { id = "" } = useParams();
  const detail = useTicket(id);
  const me = useMe();
  const macros = useMacros();
  const update = useUpdateTicket(id);
  const reply = useReply(id);
  const canWrite = usePermission("customer.support.write") === true;
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);

  if (detail.isLoading) return <p className="text-sm text-[var(--color-text-muted)]">Loading ticket…</p>;
  if (detail.isError) return <ConsoleApiErrorPanel error={detail.error} onRetry={() => void detail.refetch()} title="Unable to load the ticket" />;
  if (!detail.data) return null;
  const { ticket, messages, requester, linkedTicket } = detail.data;
  const myId = me.data?.user.id;
  const closed = ticket.status === "CLOSED";

  const insertMacro = (macroId: string) => {
    const macro = macros.data?.find((item) => item.id === macroId);
    if (!macro) return;
    const text = macro.body.replaceAll("{ticketNumber}", ticket.ticketNumber).replaceAll("{tenantName}", ticket.tenant.name);
    setBody((current) => (current.trim() ? `${current}\n\n${text}` : text));
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr,340px]">
      <div className="min-w-0 space-y-4">
        <header>
          <Link to="/customer/support" className="text-xs font-semibold text-[var(--fauward-navy)] hover:underline">
            ← Support Desk
          </Link>
          <h1 className="mt-1 text-xl font-bold text-[var(--color-text-primary)]">{ticket.subject}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <span className="font-mono">{ticket.ticketNumber}</span>
            <TenantChip tenantId={ticket.tenant.id} name={ticket.tenant.name} slug={ticket.tenant.slug} />
            <span>{label(ticket.category)}</span>
            {ticket.slaBreach ? <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">SLA missed ({ticket.slaBreach === "FIRST_RESPONSE" ? "first response" : "resolution"})</span> : null}
          </p>
        </header>

        <ol className="space-y-2" aria-label="Conversation">
          {messages.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </ol>

        <section className={card} aria-label="Reply">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1" role="radiogroup" aria-label="Reply type">
              <button type="button" role="radio" aria-checked={!internal} onClick={() => setInternal(false)} className={`rounded-md border px-3 py-1 text-xs font-semibold ${!internal ? "border-[var(--fauward-navy)] bg-[var(--fauward-navy)] text-white" : "border-[var(--color-border)]"}`}>
                Reply to tenant
              </button>
              <button type="button" role="radio" aria-checked={internal} onClick={() => setInternal(true)} className={`rounded-md border px-3 py-1 text-xs font-semibold ${internal ? "border-amber-500 bg-amber-100 text-amber-900" : "border-[var(--color-border)]"}`}>
                Internal note
              </button>
            </div>
            <select aria-label="Insert macro" value="" onChange={(event) => insertMacro(event.target.value)} disabled={!macros.data?.length} className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs">
              <option value="">Insert macro…</option>
              {(macros.data ?? []).map((macro) => (
                <option key={macro.id} value={macro.id}>
                  {macro.title}
                </option>
              ))}
            </select>
          </div>
          <textarea
            aria-label="Message"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={5}
            disabled={!canWrite || closed}
            className={`mt-2 w-full rounded-md border px-3 py-2 text-sm ${internal ? "border-amber-300 bg-amber-50" : "border-[var(--color-border)]"}`}
          />
          {internal ? <p className="text-xs text-amber-800">Internal notes are visible to Fauward staff only. The tenant never sees them.</p> : <p className="text-xs text-[var(--color-text-muted)]">The tenant sees this as a reply from Fauward Support and gets an email.</p>}
          {reply.isError ? <p role="alert" className="mt-2 text-sm text-red-700">{apiErrorMessage(reply.error, "The reply was not sent.")}</p> : null}
          {closed ? <p className="mt-2 text-sm text-[var(--color-text-muted)]">This ticket is closed. Reopen it to reply.</p> : null}
          <div className="mt-2 flex justify-end">
            <PermissionButton
              permission="customer.support.write"
              disabled={!body.trim() || reply.isPending || closed}
              onClick={() =>
                reply.mutate(
                  { body: body.trim(), visibility: internal ? "STAFF_INTERNAL" : "PUBLIC" },
                  {
                    onSuccess: () => {
                      setBody("");
                      setInternal(false);
                    }
                  }
                )
              }
              className="rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {reply.isPending ? "Sending…" : internal ? "Add note" : "Send reply"}
            </PermissionButton>
          </div>
        </section>
      </div>

      <aside className="h-fit space-y-4">
        <section className={card} aria-label="Ticket controls">
          <dl className="grid grid-cols-[auto,1fr] items-center gap-x-3 gap-y-2 text-sm">
            <dt className="text-[var(--color-text-muted)]">Status</dt>
            <dd>
              <select aria-label="Status" value={ticket.status} disabled={!canWrite || update.isPending} onChange={(event) => update.mutate({ status: event.target.value as TicketStatus })} className="w-full rounded-md border border-[var(--color-border)] px-2 py-1 text-sm">
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {label(status)}
                  </option>
                ))}
              </select>
            </dd>
            <dt className="text-[var(--color-text-muted)]">Priority</dt>
            <dd>
              <select aria-label="Priority" value={ticket.priority} disabled={!canWrite || update.isPending} onChange={(event) => update.mutate({ priority: event.target.value as TicketPriority })} className="w-full rounded-md border border-[var(--color-border)] px-2 py-1 text-sm">
                {PRIORITIES.map((priority) => (
                  <option key={priority} value={priority}>
                    {label(priority)}
                  </option>
                ))}
              </select>
            </dd>
            <dt className="text-[var(--color-text-muted)]">Assignee</dt>
            <dd className="flex items-center justify-between gap-2">
              <span>{ticket.assignee ? ticket.assignee.name ?? ticket.assignee.email : "Unassigned"}</span>
              {ticket.assignee?.id === myId ? (
                <PermissionButton permission="customer.support.write" disabled={update.isPending} onClick={() => update.mutate({ assignedPlatformUserId: null })} className="text-xs font-semibold text-[var(--fauward-navy)] hover:underline disabled:opacity-50">
                  Unassign
                </PermissionButton>
              ) : (
                <PermissionButton permission="customer.support.write" disabled={update.isPending || !myId} onClick={() => myId && update.mutate({ assignedPlatformUserId: myId })} className="text-xs font-semibold text-[var(--fauward-navy)] hover:underline disabled:opacity-50">
                  Assign to me
                </PermissionButton>
              )}
            </dd>
            <dt className="text-[var(--color-text-muted)]">Requester</dt>
            <dd>{requester ? [requester.firstName, requester.lastName].filter(Boolean).join(" ") || requester.email : "Tenant admins"}</dd>
            <dt className="text-[var(--color-text-muted)]">Opened</dt>
            <dd>{new Date(ticket.createdAt).toLocaleString()}</dd>
            <dt className="text-[var(--color-text-muted)]">First response</dt>
            <dd>{ticket.firstResponseAt ? new Date(ticket.firstResponseAt).toLocaleString() : "Not yet"}</dd>
          </dl>
          {update.isError ? <p role="alert" className="mt-2 text-sm text-red-700">{apiErrorMessage(update.error, "The change was not saved.")}</p> : null}
        </section>

        {linkedTicket ? (
          <section className={card} aria-label="Linked ticket">
            <h2 className="text-sm font-semibold">Escalated from {linkedTicket.ticketNumber}</h2>
            <p className="text-xs text-[var(--color-text-muted)]">{linkedTicket.subject} — the tenant&apos;s own customer ticket, read-only.</p>
            <ol className="mt-2 space-y-2">
              {linkedTicket.messages.map((message) => (
                <MessageBubble key={message.id} message={message} />
              ))}
            </ol>
          </section>
        ) : null}
      </aside>
    </div>
  );
}
