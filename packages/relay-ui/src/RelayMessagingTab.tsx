"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Inbox, MessageSquare, Search, Send, UserCheck, XCircle } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createConversation,
  fetchConversations,
  fetchMessages,
  formatRelayTime,
  getCurrentUserUuid,
  getSupabaseBrowserClient,
  sendMessage,
  updateConversation,
} from "./client";
import { FeedbackForm } from "./FeedbackForm";
import type { RelayConversation, RelayMessage, RelayMessagingTabProps, RelaySource, RelayStatus } from "./types";

const statusStyles: Record<RelayStatus, string> = {
  open: "border-emerald-200 bg-emerald-50 text-emerald-700",
  assigned: "border-amber-200 bg-amber-50 text-amber-700",
  closed: "border-gray-200 bg-gray-100 text-gray-600",
};

function sourceLabel(source: RelaySource) {
  return source === "marketing" ? "Widget" : "Tenant portal";
}

function sourceStyle(source: RelaySource) {
  return source === "marketing"
    ? "border-teal-200 bg-teal-50 text-teal-700"
    : "border-blue-200 bg-blue-50 text-blue-700";
}

function conversationTitle(conversation: RelayConversation) {
  return conversation.subject || conversation.customer_name || conversation.customer_email || "New conversation";
}

const localConversationKey = "fw_relay_local_conversations";
const localMessageKey = "fw_relay_local_messages";

function loadLocalConversations(tenantId?: string): RelayConversation[] {
  if (typeof window === "undefined" || !tenantId) return [];
  try {
    const rows = JSON.parse(window.localStorage.getItem(localConversationKey) ?? "[]") as RelayConversation[];
    return rows.filter((row) => row.tenant_id === tenantId);
  } catch {
    return [];
  }
}

function loadAllLocalConversations(): RelayConversation[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(localConversationKey) ?? "[]") as RelayConversation[];
  } catch {
    return [];
  }
}

function saveLocalConversation(conversation: RelayConversation) {
  if (typeof window === "undefined") return;
  const rows = loadAllLocalConversations().filter((row) => row.id !== conversation.id);
  window.localStorage.setItem(localConversationKey, JSON.stringify([conversation, ...rows]));
}

function loadLocalMessages(conversationId?: string): RelayMessage[] {
  if (typeof window === "undefined" || !conversationId) return [];
  try {
    const rows = JSON.parse(window.localStorage.getItem(localMessageKey) ?? "[]") as RelayMessage[];
    return rows.filter((row) => row.conversation_id === conversationId);
  } catch {
    return [];
  }
}

function saveLocalMessage(message: RelayMessage) {
  if (typeof window === "undefined") return;
  let rows: RelayMessage[] = [];
  try {
    rows = JSON.parse(window.localStorage.getItem(localMessageKey) ?? "[]") as RelayMessage[];
  } catch {
    rows = [];
  }
  window.localStorage.setItem(localMessageKey, JSON.stringify([...rows.filter((row) => row.id !== message.id), message]));
}

function removeLocalConversation(conversationId: string) {
  if (typeof window === "undefined") return;
  const conversations = loadAllLocalConversations().filter((row) => row.id !== conversationId);
  let messages: RelayMessage[] = [];
  try {
    messages = JSON.parse(window.localStorage.getItem(localMessageKey) ?? "[]") as RelayMessage[];
  } catch {
    messages = [];
  }
  window.localStorage.setItem(localConversationKey, JSON.stringify(conversations));
  window.localStorage.setItem(localMessageKey, JSON.stringify(messages.filter((row) => row.conversation_id !== conversationId)));
}

export function RelayMessagingTab({ mode, tenantId, tenantName, tenantEmail }: RelayMessagingTabProps) {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [firstMessage, setFirstMessage] = useState("");
  const [status, setStatus] = useState<RelayStatus | "">("");
  const [sourceApp, setSourceApp] = useState<RelaySource | "">("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const conversationsQuery = useQuery({
    queryKey: ["relay-conversations", mode, tenantId, status, sourceApp, search],
    queryFn: () =>
      fetchConversations({
        mode,
        tenantId,
        status: status || undefined,
        sourceApp: sourceApp || undefined,
        search: search || undefined,
      }),
    enabled: mode === "super" || Boolean(tenantId),
    staleTime: 15_000,
    refetchInterval: 8_000,
  });

  const localConversations = useMemo(() => (mode === "tenant" ? loadLocalConversations(tenantId) : []), [mode, tenantId, conversationsQuery.data]);
  const conversations = conversationsQuery.data?.length ? conversationsQuery.data : localConversations;
  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? conversations[0] ?? null;

  useEffect(() => {
    if (!selectedId && conversations[0]) setSelectedId(conversations[0].id);
  }, [conversations, selectedId]);

  const messagesQuery = useQuery({
    queryKey: ["relay-messages", selected?.id, tenantId],
    queryFn: () => fetchMessages(selected?.id ?? "", mode === "tenant" ? tenantId : undefined),
    enabled: Boolean(selected?.id),
    staleTime: 5_000,
    refetchInterval: 5_000,
  });

  const localMessages = useMemo(() => loadLocalMessages(selected?.id), [selected?.id, messagesQuery.data]);
  const messages = messagesQuery.data?.length ? messagesQuery.data : localMessages;
  const typing = useMemo(
    () => messages.some((message) => message.sender_type === "system" && message.body === "..."),
    [messages],
  );
  const visibleMessages = useMemo(
    () => messages.filter((message) => !(message.sender_type === "system" && message.body === "...")),
    [messages],
  );

  const unreadCount = useMemo(
    () => conversations.filter((conversation) => conversation.status !== "closed").length,
    [conversations],
  );

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const channel = supabase
      .channel(mode === "super" ? "relay-inbox" : `relay-tenant-${tenantId ?? "unknown"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "relay_conversations" },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["relay-conversations"] });
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "relay_messages" },
        (payload) => {
          const next = payload.new as RelayMessage;
          if (next.conversation_id === selected?.id) {
            queryClient.setQueryData<RelayMessage[]>(["relay-messages", selected.id, tenantId], (current = []) =>
              current.some((item) => item.id === next.id) ? current : [...current, next],
            );
          }
          void queryClient.invalidateQueries({ queryKey: ["relay-conversations"] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [mode, queryClient, selected?.id, tenantId]);

  useEffect(() => {
    if (mode !== "tenant" || !tenantId || conversationsQuery.isError) return;
    const localRows = loadLocalConversations(tenantId);
    if (localRows.length === 0) return;

    let cancelled = false;

    async function syncLocalConversations() {
      for (const localConversation of localRows) {
        if (cancelled) return;
        const localConversationMessages = loadLocalMessages(localConversation.id);
        const [firstLocalMessage, ...remainingLocalMessages] = localConversationMessages;
        const firstMessage = firstLocalMessage?.body ?? localConversation.subject ?? "Tenant portal conversation";

        try {
          const result = await createConversation({
            source_app: "tenant_portal",
            tenant_id: tenantId,
            customer_name: localConversation.customer_name ?? tenantName ?? "Tenant user",
            customer_email: localConversation.customer_email ?? tenantEmail,
            subject: localConversation.subject ?? tenantName ?? "Tenant portal conversation",
            first_message: firstMessage,
          });

          for (const message of remainingLocalMessages) {
            await sendMessage(result.conversation_id, {
              sender_type: "customer",
              sender_id: tenantId,
              tenant_id: tenantId,
              body: message.body,
            });
          }

          removeLocalConversation(localConversation.id);
          if (selectedId === localConversation.id) setSelectedId(result.conversation_id);
          void queryClient.invalidateQueries({ queryKey: ["relay-conversations"] });
          setError(null);
        } catch {
          return;
        }
      }
    }

    void syncLocalConversations();

    return () => {
      cancelled = true;
    };
  }, [conversationsQuery.data, conversationsQuery.isError, mode, queryClient, selectedId, tenantEmail, tenantId, tenantName]);

  const sendMutation = useMutation({
    mutationFn: async () => {
      const body = draft.trim();
      if (!selected || !body) throw new Error("Select a conversation and enter a message");
      return sendMessage(selected.id, {
        sender_type: mode === "super" ? "admin" : "customer",
        sender_id: mode === "super" ? "super-admin" : tenantId,
        tenant_id: mode === "tenant" ? tenantId : undefined,
        body,
      });
    },
    onSuccess: (message) => {
      setDraft("");
      queryClient.setQueryData<RelayMessage[]>(["relay-messages", message.conversation_id, tenantId], (current = []) =>
        current.some((item) => item.id === message.id) ? current : [...current, message],
      );
      void queryClient.invalidateQueries({ queryKey: ["relay-conversations"] });
    },
    onError: (err) => {
      if (mode === "tenant" && selected) {
        const now = new Date().toISOString();
        const message: RelayMessage = {
          id: `local-msg-${Date.now()}`,
          conversation_id: selected.id,
          sender_type: "customer",
          sender_id: tenantId ?? null,
          body: draft.trim(),
          read_at: null,
          created_at: now,
        };
        saveLocalMessage(message);
        setDraft("");
        queryClient.setQueryData<RelayMessage[]>(["relay-messages", selected.id, tenantId], (current = []) => [...current, message]);
        setError("Message saved locally. It will sync to Relay when the service is available.");
        return;
      }
      setError(err instanceof Error ? err.message : "Unable to send message");
    },
  });

  const createTenantConversationMutation = useMutation({
    mutationFn: async () => {
      const body = firstMessage.trim();
      if (!tenantId) throw new Error("tenantId is required");
      if (!body) throw new Error("Enter a message");
      return createConversation({
        source_app: "tenant_portal",
        tenant_id: tenantId,
        customer_name: tenantName ?? "Tenant user",
        customer_email: tenantEmail,
        subject: tenantName ?? "Tenant portal conversation",
        first_message: body,
      });
    },
    onSuccess: (result) => {
      setFirstMessage("");
      setSelectedId(result.conversation_id);
      void queryClient.invalidateQueries({ queryKey: ["relay-conversations"] });
    },
    onError: (err) => {
      if (mode === "tenant" && tenantId) {
        const now = new Date().toISOString();
        const conversation: RelayConversation = {
          id: `local-conv-${Date.now()}`,
          tenant_id: tenantId,
          source_app: "tenant_portal",
          customer_name: tenantName ?? "Tenant user",
          customer_email: tenantEmail ?? null,
          subject: tenantName ?? "Tenant portal conversation",
          status: "open",
          assigned_admin_id: null,
          last_message_at: now,
          created_at: now,
        };
        const message: RelayMessage = {
          id: `local-msg-${Date.now()}`,
          conversation_id: conversation.id,
          sender_type: "customer",
          sender_id: tenantId,
          body: firstMessage.trim(),
          read_at: null,
          created_at: now,
        };
        saveLocalConversation(conversation);
        saveLocalMessage(message);
        setFirstMessage("");
        setSelectedId(conversation.id);
        queryClient.setQueryData<RelayConversation[]>(["relay-conversations", mode, tenantId, status, sourceApp, search], (current = []) => [
          conversation,
          ...current,
        ]);
        queryClient.setQueryData<RelayMessage[]>(["relay-messages", conversation.id, tenantId], [message]);
        setError("Message saved locally. It will sync to Relay when the service is available.");
        return;
      }
      setError(err instanceof Error ? err.message : "Unable to create conversation");
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: { status?: RelayStatus; assigned_admin_id?: string | null }) => {
      if (!selected) throw new Error("Select a conversation");
      return updateConversation(selected.id, input);
    },
    onSuccess: (conversation) => {
      queryClient.setQueryData<RelayConversation[]>(
        ["relay-conversations", mode, tenantId, status, sourceApp, search],
        (current = []) => current.map((item) => (item.id === conversation.id ? conversation : item)),
      );
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Unable to update conversation"),
  });

  function handleSend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    sendMutation.mutate();
  }

  function handleCreateTenantConversation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    createTenantConversationMutation.mutate();
  }

  return (
    <section className="flex h-[calc(100vh-7rem)] min-h-[560px] overflow-hidden rounded-lg border border-gray-200 bg-white text-gray-900 shadow-sm">
      <aside className="flex w-[340px] shrink-0 flex-col border-r border-gray-200 bg-gray-50">
        <div className="border-b border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-base font-semibold text-gray-900">{mode === "super" ? "Relay" : "Messaging"}</h1>
              <p className="mt-0.5 text-xs text-gray-500">
                {mode === "super" ? `${unreadCount} active conversations` : "Messages with the Fauward team"}
              </p>
            </div>
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-gray-100 text-gray-600">
              {mode === "super" ? <Inbox size={18} /> : <MessageSquare size={18} />}
            </span>
          </div>

          {mode === "super" ? (
            <div className="mt-4 space-y-2">
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search name or email"
                  className="h-10 w-full rounded-md border border-gray-300 pl-9 pr-3 text-sm outline-none focus:border-gray-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as RelayStatus | "")}
                  className="h-10 rounded-md border border-gray-300 px-2 text-sm outline-none focus:border-gray-500"
                >
                  <option value="">All status</option>
                  <option value="open">Open</option>
                  <option value="assigned">Assigned</option>
                  <option value="closed">Closed</option>
                </select>
                <select
                  value={sourceApp}
                  onChange={(event) => setSourceApp(event.target.value as RelaySource | "")}
                  className="h-10 rounded-md border border-gray-300 px-2 text-sm outline-none focus:border-gray-500"
                >
                  <option value="">All sources</option>
                  <option value="marketing">Widget</option>
                  <option value="tenant_portal">Tenant portal</option>
                </select>
              </div>
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {conversationsQuery.isLoading ? <p className="p-4 text-sm text-gray-500">Loading conversations...</p> : null}
          {conversationsQuery.isError ? (
            <div className="m-4 rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-medium text-red-800">Unable to load conversations</p>
              <p className="mt-1 text-xs text-red-700">
                {conversationsQuery.error instanceof Error ? conversationsQuery.error.message : "Relay request failed"}
              </p>
            </div>
          ) : null}
          {!conversationsQuery.isLoading && conversations.length === 0 ? (
            <div className="p-4">
              <p className="text-sm font-medium text-gray-800">No conversations yet</p>
              <p className="mt-1 text-sm text-gray-500">
                {mode === "tenant" ? "Start a message to contact Fauward support." : "New customer messages will appear here."}
              </p>
            </div>
          ) : null}
          {conversations.map((conversation) => {
            const active = conversation.id === selected?.id;
            return (
              <button
                type="button"
                key={conversation.id}
                onClick={() => setSelectedId(conversation.id)}
                className={`block w-full border-b border-gray-200 px-4 py-3 text-left transition ${
                  active ? "bg-white" : "bg-gray-50 hover:bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-1 text-sm font-semibold text-gray-900">{conversationTitle(conversation)}</p>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusStyles[conversation.status]}`}>
                    {conversation.status}
                  </span>
                </div>
                <p className="mt-1 line-clamp-1 text-xs text-gray-500">
                  {conversation.customer_email || conversation.customer_name || conversation.tenant_id || "Unknown customer"}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${sourceStyle(conversation.source_app)}`}>
                    {sourceLabel(conversation.source_app)}
                  </span>
                  <span className="text-[11px] text-gray-400">{formatRelayTime(conversation.last_message_at)}</span>
                </div>
              </button>
            );
          })}
        </div>

        {mode === "tenant" ? (
          <form onSubmit={handleCreateTenantConversation} className="border-t border-gray-200 bg-white p-3">
            <textarea
              value={firstMessage}
              onChange={(event) => setFirstMessage(event.target.value)}
              placeholder="Start a new conversation"
              rows={2}
              className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
            />
            <button
              type="submit"
              disabled={!tenantId || !firstMessage.trim() || createTenantConversationMutation.isPending}
              className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-gray-900 px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <MessageSquare size={15} />
              New conversation
            </button>
          </form>
        ) : null}
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {selected ? (
          <>
            <header className="flex min-h-16 shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-5">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-gray-900">{conversationTitle(selected)}</h2>
                <p className="mt-0.5 truncate text-xs text-gray-500">
                  {selected.customer_name || "Customer"} {selected.customer_email ? `- ${selected.customer_email}` : ""}
                </p>
              </div>
              {mode === "super" ? (
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => updateMutation.mutate({ status: "assigned", assigned_admin_id: getCurrentUserUuid() })}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-300 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <UserCheck size={14} />
                    Assign
                  </button>
                  <button
                    type="button"
                    onClick={() => updateMutation.mutate({ status: "closed" })}
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-300 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    <XCircle size={14} />
                    Close
                  </button>
                </div>
              ) : null}
            </header>

            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr,260px]">
              <div className="flex min-w-0 flex-col">
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gray-50 px-5 py-4">
                  {messagesQuery.isLoading ? <p className="text-sm text-gray-500">Loading messages...</p> : null}
                  {visibleMessages.map((message) => {
                    const mine = mode === "super" ? message.sender_type === "admin" : message.sender_type === "customer";
                    return (
                      <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div
                          className={`max-w-[72%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                            mine ? "bg-gray-900 text-white" : "border border-gray-200 bg-white text-gray-800"
                          }`}
                        >
                          <p className="whitespace-pre-wrap break-words">{message.body}</p>
                          <p className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-gray-400"}`}>
                            {message.sender_type} - {formatRelayTime(message.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {typing ? <p className="text-xs text-gray-500">Typing...</p> : null}
                </div>

                <div className="border-t border-gray-200 bg-white p-4">
                  {error ? <p className="mb-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{error}</p> : null}
                  {mode === "tenant" && selected.status === "closed" ? (
                    <FeedbackForm
                      conversationId={selected.id}
                      tenantId={tenantId}
                      submittedBy={tenantName ?? tenantId}
                    />
                  ) : (
                <form onSubmit={handleSend}>
                  <div className="flex items-end gap-2">
                    <textarea
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      placeholder={selected.status === "closed" ? "Conversation is closed" : "Write a reply"}
                      rows={2}
                      disabled={selected.status === "closed"}
                      className="min-h-[44px] flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500 disabled:bg-gray-100"
                    />
                    <button
                      type="submit"
                      disabled={!draft.trim() || selected.status === "closed" || sendMutation.isPending}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-gray-900 text-white disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Send reply"
                    >
                      <Send size={17} />
                    </button>
                  </div>
                </form>
                  )}
                </div>
              </div>

              {mode === "super" ? (
                <aside className="hidden border-l border-gray-200 bg-white p-4 lg:block">
                  <h3 className="text-sm font-semibold text-gray-900">Customer</h3>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div>
                      <dt className="text-xs font-medium uppercase text-gray-400">Name</dt>
                      <dd className="mt-1 text-gray-800">{selected.customer_name || "Unknown"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase text-gray-400">Email</dt>
                      <dd className="mt-1 break-words text-gray-800">{selected.customer_email || "Not provided"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase text-gray-400">Tenant</dt>
                      <dd className="mt-1 break-words font-mono text-xs text-gray-800">{selected.tenant_id || "Anonymous"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase text-gray-400">Source</dt>
                      <dd className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${sourceStyle(selected.source_app)}`}>
                        {sourceLabel(selected.source_app)}
                      </dd>
                    </div>
                  </dl>
                </aside>
              ) : null}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-6 text-center">
            <div>
              <Inbox size={28} className="mx-auto text-gray-400" />
              <p className="mt-3 text-sm font-medium text-gray-800">Select a conversation</p>
              <p className="mt-1 text-sm text-gray-500">Messages will appear here.</p>
            </div>
          </div>
        )}
      </main>
    </section>
  );
}
