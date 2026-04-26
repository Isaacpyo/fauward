"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";

import {
  createConversation,
  fetchConversation,
  fetchMessages,
  formatRelayTime,
  getSupabaseBrowserClient,
  sendMessage,
} from "./client";
import { FeedbackForm } from "./FeedbackForm";
import type { RelayConversation, RelayMessage, RelayWidgetProps } from "./types";

const storageKey = "fw_relay_conversation_id";
const tokenStorageKey = "fw_relay_access_token";
const defaultBrandColor = "#0f766e";

export function RelayWidget({
  tenantId,
  brandColor = defaultBrandColor,
  greeting = "Hi, how can we help?",
}: RelayWidgetProps) {
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<RelayMessage[]>([]);
  const [conversation, setConversation] = useState<RelayConversation | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const threadRef = useRef<HTMLDivElement | null>(null);

  const typing = useMemo(
    () => messages.some((message) => message.sender_type === "system" && message.body === "..."),
    [messages],
  );
  const visibleMessages = useMemo(
    () => messages.filter((message) => !(message.sender_type === "system" && message.body === "...")),
    [messages],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedId = window.sessionStorage.getItem(storageKey);
    const storedToken = window.sessionStorage.getItem(tokenStorageKey);
    if (storedId && storedToken) {
      setConversationId(storedId);
      setAccessToken(storedToken);
    } else {
      window.sessionStorage.removeItem(storageKey);
      window.sessionStorage.removeItem(tokenStorageKey);
    }
  }, []);

  useEffect(() => {
    if (!conversationId || !accessToken) return;
    fetchMessages(conversationId, undefined, accessToken)
      .then(setMessages)
      .catch(() => undefined);
    fetchConversation(conversationId, undefined, accessToken)
      .then(setConversation)
      .catch(() => undefined);
  }, [accessToken, conversationId]);

  useEffect(() => {
    if (!conversationId || !accessToken) return;
    const timer = window.setInterval(() => {
      fetchConversation(conversationId, undefined, accessToken)
        .then(setConversation)
        .catch(() => undefined);
      fetchMessages(conversationId, undefined, accessToken)
        .then(setMessages)
        .catch(() => undefined);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [accessToken, conversationId]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!conversationId || !supabase) return;

    const channel = supabase
      .channel(`relay-widget-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "relay_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const next = payload.new as RelayMessage;
          setMessages((current) => (current.some((item) => item.id === next.id) ? current : [...current, next]));
          if (!open && next.sender_type !== "customer") {
            setUnread((value) => value + 1);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "relay_conversations",
          filter: `id=eq.${conversationId}`,
        },
        (payload) => {
          setConversation(payload.new as RelayConversation);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, open]);

  useEffect(() => {
    if (open) setUnread(0);
  }, [open]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [visibleMessages.length, typing, open]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    setError(null);
    try {
      if (!conversationId) {
        if (!name.trim() || !email.trim()) {
          setError("Name and email are required");
          return;
        }
        const created = await createConversation({
          source_app: "marketing",
          tenant_id: tenantId,
          customer_name: name.trim(),
          customer_email: email.trim(),
          subject: subject.trim() || "Website enquiry",
          first_message: body,
        });
        setConversationId(created.conversation_id);
        setAccessToken(created.access_token ?? null);
        window.sessionStorage.setItem(storageKey, created.conversation_id);
        if (created.access_token) window.sessionStorage.setItem(tokenStorageKey, created.access_token);
        setMessages([]);
        fetchConversation(created.conversation_id, undefined, created.access_token)
          .then(setConversation)
          .catch(() => undefined);
      } else {
        const message = await sendMessage(conversationId, {
          sender_type: "customer",
          sender_id: email.trim() || undefined,
          access_token: accessToken,
          body,
        });
        setMessages((current) => (current.some((item) => item.id === message.id) ? current : [...current, message]));
      }
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send message");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 font-sans">
      {open ? (
        <section className="flex h-[520px] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-2xl">
          <header className="flex h-14 shrink-0 items-center justify-between px-4 text-white" style={{ backgroundColor: brandColor }}>
            <div>
              <p className="text-sm font-semibold leading-tight">Fauward Relay</p>
              <p className="text-xs text-white/80">{greeting}</p>
            </div>
            <button
              type="button"
              aria-label="Close messaging"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-white/90 hover:bg-white/10"
            >
              <X size={18} />
            </button>
          </header>

          <div ref={threadRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gray-50 px-4 py-4">
            {visibleMessages.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-600">
                {conversationId ? "No messages yet." : "Send us a message and the Fauward team will reply here."}
              </div>
            ) : null}
            {visibleMessages.map((message) => {
              const mine = message.sender_type === "customer";
              return (
                <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[78%] rounded-lg px-3 py-2 text-sm shadow-sm ${
                      mine ? "text-white" : "border border-gray-200 bg-white text-gray-800"
                    }`}
                    style={mine ? { backgroundColor: brandColor } : undefined}
                  >
                    <p className="whitespace-pre-wrap break-words">{message.body}</p>
                    <p className={`mt-1 text-[10px] ${mine ? "text-white/75" : "text-gray-400"}`}>
                      {formatRelayTime(message.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
            {typing ? <p className="text-xs text-gray-500">Fauward is typing...</p> : null}
          </div>

          <div className="shrink-0 border-t border-gray-200 bg-white p-3">
            {conversation?.status === "closed" && conversationId ? (
              <FeedbackForm conversationId={conversationId} submittedBy={email.trim() || undefined} accessToken={accessToken ?? undefined} compact />
            ) : (
          <form onSubmit={handleSubmit}>
            {!conversationId ? (
              <div className="mb-3 grid gap-2">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Name"
                  className="h-10 rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-gray-500"
                  required
                />
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Email"
                  type="email"
                  className="h-10 rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-gray-500"
                  required
                />
                <input
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="Subject"
                  className="h-10 rounded-md border border-gray-300 px-3 text-sm outline-none focus:border-gray-500"
                />
              </div>
            ) : null}
            {error ? <p className="mb-2 rounded-md bg-red-50 px-2 py-1 text-xs text-red-700">{error}</p> : null}
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Write a message"
                rows={2}
                className="min-h-[44px] flex-1 resize-none rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-500"
                required
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                aria-label="Send message"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-white disabled:cursor-not-allowed disabled:opacity-50"
                style={{ backgroundColor: brandColor }}
              >
                <Send size={17} />
              </button>
            </div>
          </form>
            )}
          </div>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open messaging"
          className="relative inline-flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl transition hover:scale-[1.03]"
          style={{ backgroundColor: brandColor }}
        >
          <MessageCircle size={24} />
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
      )}
    </div>
  );
}
