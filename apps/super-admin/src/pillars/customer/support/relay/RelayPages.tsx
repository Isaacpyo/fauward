import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePermission } from "@fauward/internal-rbac";

import { ConsoleApiErrorPanel } from "@/components/service-kit/ConsoleApiErrorPanel";
import { PermissionButton } from "@/components/service-kit/PermissionButton";
import { TenantChip } from "@/components/service-kit/TenantChip";
import { consoleApi } from "@/lib/console-api";
import { apiErrorMessage } from "@/lib/console-api-error";

// L2 / L20 (WP-4.R): the console's Relay inbox. Everything goes through /api/internal/relay/* with the console cookie
// session (no tenant token, nothing in localStorage). Staff replies send at once; AI drafts wait here until a staff
// member edits and approves them; a tenant conversation can become a PLATFORM support ticket. The list refreshes every
// 15 seconds (the console has no Supabase realtime key).

type Conversation = {
  id: string;
  source: "marketing" | "tenant_portal";
  tenant: { id: string; name: string; slug: string | null } | null;
  customerName: string | null;
  customerEmail: string | null;
  subject: string | null;
  status: "open" | "assigned" | "closed";
  aiStatus: string | null;
  assignedTo: string | null;
  lastMessageAt: string | null;
  createdAt: string | null;
  pendingDrafts?: boolean;
};
type Message = { id: string; senderType: "customer" | "admin" | "system"; senderId: string | null; body: string; isDraft: boolean; approvedBy: string | null; approvedAt: string | null; createdAt: string | null };
type ConversationDetail = Conversation & { messages: Message[]; ticket: { id: string; ticketNumber: string; status: string } | null };
type Feedback = { id: string; conversation_id: string; tenant_id: string | null; source_app: string; customer_name: string | null; customer_email: string | null; rating: number; comment: string | null; created_at: string };

const KEY = ["customer.support", "relay"] as const;
const label = "block text-xs font-semibold text-[var(--color-text-muted)]";
const primary = "rounded-md bg-[var(--fauward-navy)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50";
const secondary = "rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold disabled:opacity-50";
const REFRESH_MS = 15_000;

function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function who(conversation: Conversation) {
  return conversation.customerName ?? conversation.customerEmail ?? (conversation.source === "marketing" ? "Website visitor" : "Tenant user");
}

function RelayNav({ active }: { active: "inbox" | "feedback" }) {
  const base = "rounded-md px-3 py-1.5 text-xs font-semibold";
  const item = (key: typeof active, to: string, text: string) => (
    <Link to={to} className={`${base} ${active === key ? "bg-[var(--fauward-navy)] text-white" : "border border-[var(--color-border)]"}`}>
      {text}
    </Link>
  );
  return (
    <nav className="flex flex-wrap gap-2" aria-label="Relay sections">
      {item("inbox", "/customer/support/relay", "Inbox")}
      {item("feedback", "/customer/support/relay/feedback", "Feedback")}
      <Link to="/customer/support" className={`${base} border border-[var(--color-border)]`}>
        Ticket queue
      </Link>
    </nav>
  );
}

export function RelayInboxPage() {
  const [params, setParams] = useSearchParams();
  const status = params.get("status") ?? "";
  const source = params.get("source") ?? "";
  const conversations = useQuery({
    queryKey: [...KEY, "list", status, source],
    queryFn: async () => (await consoleApi.get<{ data?: Conversation[] }>("/relay/conversations", { params: { ...(status ? { status } : {}), ...(source ? { source } : {}) } })).data.data ?? [],
    refetchInterval: REFRESH_MS
  });
  function filter(key: "status" | "source", value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Relay</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Messages from tenants and website visitors. AI drafts wait for a staff member to approve them.</p>
        </div>
        <RelayNav active="inbox" />
      </header>
      <div className="flex flex-wrap gap-3">
        <label className={label}>
          Status
          <select aria-label="Status" value={status} onChange={(event) => filter("status", event.target.value)} className="mt-1 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="assigned">Assigned</option>
            <option value="closed">Closed</option>
          </select>
        </label>
        <label className={label}>
          From
          <select aria-label="From" value={source} onChange={(event) => filter("source", event.target.value)} className="mt-1 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm">
            <option value="">Everyone</option>
            <option value="tenant_portal">Tenants</option>
            <option value="marketing">Website visitors</option>
          </select>
        </label>
      </div>
      {conversations.isError ? <ConsoleApiErrorPanel error={conversations.error} onRetry={() => void conversations.refetch()} title="Unable to load Relay" /> : null}
      {conversations.data && conversations.data.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No conversation.</p> : null}
      {conversations.data && conversations.data.length > 0 ? (
        <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white">
          {conversations.data.map((conversation) => (
            <li key={conversation.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" data-testid="relay-conversation">
              <span className="flex flex-wrap items-center gap-2">
                <Link to={`/customer/support/relay/${encodeURIComponent(conversation.id)}`} className="font-semibold underline">
                  {conversation.subject ?? who(conversation)}
                </Link>
                {conversation.tenant ? <TenantChip tenantId={conversation.tenant.id} name={conversation.tenant.name} slug={conversation.tenant.slug} /> : <span className="text-xs text-[var(--color-text-muted)]">{who(conversation)}</span>}
                {conversation.pendingDrafts ? <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">Draft to approve</span> : null}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">
                {conversation.status} · {when(conversation.lastMessageAt)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function DraftCard({ message, onApprove, pending }: { message: Message; onApprove: (body: string) => void; pending: boolean }) {
  const [text, setText] = useState(message.body);
  const canWrite = usePermission("customer.support.write") === true;
  return (
    <div className="rounded-md border border-amber-300 bg-amber-50 p-3" data-testid="relay-draft">
      <p className="text-xs font-semibold text-amber-900">Draft, not visible to the customer until approved</p>
      <textarea aria-label="Draft reply" rows={3} value={text} readOnly={!canWrite} onChange={(event) => setText(event.target.value)} className="mt-2 w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm" />
      <PermissionButton permission="customer.support.write" disabled={pending || !text.trim()} className={`${primary} mt-2`} onClick={() => onApprove(text.trim())}>
        Approve and send
      </PermissionButton>
    </div>
  );
}

export function RelayConversationPage() {
  const { id = "" } = useParams();
  const queryClient = useQueryClient();
  const canWrite = usePermission("customer.support.write") === true;
  const detail = useQuery({
    queryKey: [...KEY, "conversation", id],
    queryFn: async () => (await consoleApi.get<ConversationDetail>(`/relay/conversations/${encodeURIComponent(id)}`)).data,
    refetchInterval: REFRESH_MS
  });
  const [reply, setReply] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setMessage(null);
    setError(null);
  }, [id]);
  const refresh = () => queryClient.invalidateQueries({ queryKey: KEY });
  const action = useMutation({
    mutationFn: async (task: () => Promise<unknown>) => task(),
    onSuccess: () => void refresh()
  });

  async function run(task: () => Promise<unknown>, done: string) {
    setError(null);
    setMessage(null);
    try {
      await action.mutateAsync(task);
      setMessage(done);
    } catch (caught) {
      setError(apiErrorMessage(caught, "Relay could not be updated."));
    }
  }

  const data = detail.data;
  const path = `/relay/conversations/${encodeURIComponent(id)}`;
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">{data ? data.subject ?? `Conversation with ${who(data)}` : "Relay conversation"}</h1>
          {data ? (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--color-text-muted)]">
              {data.tenant ? <TenantChip tenantId={data.tenant.id} name={data.tenant.name} slug={data.tenant.slug} /> : who(data)}
              <span>
                {data.status}
                {data.aiStatus ? ` · AI ${data.aiStatus.replace("_", " ")}` : ""}
              </span>
              {data.ticket ? (
                <Link to={`/customer/support/tickets/${encodeURIComponent(data.ticket.id)}`} className="underline">
                  Ticket {data.ticket.ticketNumber}
                </Link>
              ) : null}
            </p>
          ) : null}
        </div>
        <RelayNav active="inbox" />
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
      {detail.isError ? <ConsoleApiErrorPanel error={detail.error} onRetry={() => void detail.refetch()} title="Unable to load this conversation" /> : null}
      {data ? (
        <div className="flex flex-wrap gap-2">
          {data.status !== "closed" ? (
            <>
              <PermissionButton permission="customer.support.write" disabled={action.isPending} className={secondary} onClick={() => void run(() => consoleApi.patch(path, { assignToMe: true }), "Assigned to you.")}>
                Assign to me
              </PermissionButton>
              <PermissionButton permission="customer.support.write" disabled={action.isPending} className={secondary} onClick={() => void run(() => consoleApi.patch(path, { status: "closed" }), "Conversation closed.")}>
                Close
              </PermissionButton>
            </>
          ) : (
            <PermissionButton permission="customer.support.write" disabled={action.isPending} className={secondary} onClick={() => void run(() => consoleApi.patch(path, { status: "open" }), "Conversation reopened.")}>
              Reopen
            </PermissionButton>
          )}
          {data.tenant && !data.ticket ? (
            <PermissionButton permission="customer.support.write" disabled={action.isPending} className={secondary} onClick={() => void run(() => consoleApi.post(`${path}/convert-to-ticket`, {}), "Converted to a support ticket.")}>
              Convert to ticket
            </PermissionButton>
          ) : null}
        </div>
      ) : null}
      {data ? (
        <ol className="space-y-2" aria-label="Messages">
          {data.messages.map((item) =>
            item.isDraft ? (
              <li key={item.id}>
                <DraftCard message={item} pending={action.isPending} onApprove={(body) => void run(() => consoleApi.post(`/relay/messages/${encodeURIComponent(item.id)}/approve-and-send`, body === item.body ? {} : { body }), "Draft approved and sent.")} />
              </li>
            ) : (
              <li key={item.id} className={`rounded-md border border-[var(--color-border)] p-3 text-sm ${item.senderType === "customer" ? "bg-white" : "bg-[var(--color-surface-50)]"}`} data-testid="relay-message">
                <p className="text-xs text-[var(--color-text-muted)]">
                  {item.senderType === "customer" ? who(data) : item.senderType === "system" ? "System" : "Fauward"} · {when(item.createdAt)}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{item.body}</p>
              </li>
            )
          )}
        </ol>
      ) : null}
      {data && data.status !== "closed" ? (
        <section className="space-y-2 rounded-lg border border-[var(--color-border)] bg-white p-4" aria-label="Write a reply">
          <label className={label}>
            Reply (sent at once)
            <textarea aria-label="Reply text" rows={3} value={reply} readOnly={!canWrite} onChange={(event) => setReply(event.target.value)} className="mt-1 w-full rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-normal" />
          </label>
          <PermissionButton
            permission="customer.support.write"
            disabled={action.isPending || !reply.trim()}
            className={primary}
            onClick={() =>
              void run(async () => {
                await consoleApi.post(`${path}/messages`, { body: reply.trim() });
                setReply("");
              }, "Reply sent.")
            }
          >
            Send reply
          </PermissionButton>
        </section>
      ) : null}
    </div>
  );
}

export function RelayFeedbackPage() {
  const feedback = useQuery({ queryKey: [...KEY, "feedback"], queryFn: async () => (await consoleApi.get<{ data?: Feedback[] }>("/relay/feedback")).data.data ?? [] });
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--color-text-primary)]">Relay feedback</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Ratings left after a conversation was closed.</p>
        </div>
        <RelayNav active="feedback" />
      </header>
      {feedback.isError ? <ConsoleApiErrorPanel error={feedback.error} onRetry={() => void feedback.refetch()} title="Unable to load feedback" /> : null}
      {feedback.data && feedback.data.length === 0 ? <p className="text-sm text-[var(--color-text-muted)]">No feedback yet.</p> : null}
      {feedback.data && feedback.data.length > 0 ? (
        <ul className="divide-y divide-[var(--color-border)] rounded-lg border border-[var(--color-border)] bg-white">
          {feedback.data.map((row) => (
            <li key={row.id} className="px-3 py-2 text-sm" data-testid="relay-feedback">
              <span className="font-semibold">{row.rating}/5</span> · {row.customer_name ?? row.customer_email ?? "Anonymous"} · {when(row.created_at)}
              {row.comment ? <p className="mt-1 text-[var(--color-text-muted)]">{row.comment}</p> : null}
              <Link to={`/customer/support/relay/${encodeURIComponent(row.conversation_id)}`} className="text-xs underline">
                Conversation
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
