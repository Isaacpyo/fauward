"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Send, X, Package, CircleUserRound } from "lucide-react";

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
const openChatEventName = "fauward:open-relay-chat";
const defaultBrandColor = "#0f766e";

// Show "Chat with an associate" after this many customer messages
const ASSOCIATE_PROMPT_AFTER = 2;

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
  const [trackingDraft, setTrackingDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [requestingAssociate, setRequestingAssociate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const threadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const openChat = () => setOpen(true);
    window.addEventListener(openChatEventName, openChat);
    return () => window.removeEventListener(openChatEventName, openChat);
  }, []);

  // AI is processing when ai_status is 'ai_handling' — driven by realtime conversation update
  const isAiTyping = conversation?.ai_status === "ai_handling";

  const visibleMessages = useMemo(
    () => messages.filter((m) => !(m.sender_type === "system" && m.body === "...")),
    [messages],
  );

  const customerMessageCount = useMemo(
    () => messages.filter((m) => m.sender_type === "customer").length,
    [messages],
  );

  const isHandedOff = conversation?.ai_status === "human_needed";
  const isClosed = conversation?.status === "closed";

  const showAssociateButton =
    !!conversationId &&
    customerMessageCount >= ASSOCIATE_PROMPT_AFTER &&
    !isHandedOff &&
    !isClosed &&
    !requestingAssociate;

  // ── Session restore ──────────────────────────────────────────────────────
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

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!conversationId || !accessToken) return;
    fetchMessages(conversationId, undefined, accessToken).then(setMessages).catch(() => undefined);
    fetchConversation(conversationId, undefined, accessToken).then(setConversation).catch(() => undefined);
  }, [accessToken, conversationId]);

  // ── Polling (10s baseline; 2s when AI is typing) ──────────────────────────
  useEffect(() => {
    if (!conversationId || !accessToken) return;
    const interval = isAiTyping ? 2_000 : 10_000;
    const timer = window.setInterval(() => {
      fetchConversation(conversationId, undefined, accessToken).then(setConversation).catch(() => undefined);
      fetchMessages(conversationId, undefined, accessToken).then(setMessages).catch(() => undefined);
    }, interval);
    return () => window.clearInterval(timer);
  }, [accessToken, conversationId, isAiTyping]);

  // ── Supabase realtime ─────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!conversationId || !supabase) return;

    const channel = supabase
      .channel(`relay-widget-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "relay_messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const next = payload.new as RelayMessage;
          setMessages((cur) => (cur.some((m) => m.id === next.id) ? cur : [...cur, next]));
          if (!open && next.sender_type !== "customer") setUnread((v) => v + 1);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "relay_conversations", filter: `id=eq.${conversationId}` },
        (payload) => setConversation(payload.new as RelayConversation),
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [conversationId, open]);

  useEffect(() => { if (open) setUnread(0); }, [open]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [visibleMessages.length, isAiTyping, open]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function parseMessageBody(body: string): { type: "text"; text: string } | { type: "tracking_input"; message: string; placeholder: string } {
    if (body.startsWith("{")) {
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        if (parsed.type === "tracking_input" && typeof parsed.message === "string") {
          return {
            type: "tracking_input",
            message: parsed.message,
            placeholder: typeof parsed.placeholder === "string" ? parsed.placeholder : "Enter tracking number",
          };
        }
      } catch { /* fall through */ }
    }
    return { type: "text", text: body };
  }

  // ── Handlers ──────────────────────────────────────────────────────────────
  async function handleTrackingSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const tn = trackingDraft.trim();
    if (!tn || sending || !conversationId) return;
    setSending(true);
    setError(null);
    try {
      const msg = await sendMessage(conversationId, {
        sender_type: "customer",
        sender_id: email.trim() || undefined,
        access_token: accessToken,
        body: tn,
      });
      setMessages((cur) => (cur.some((m) => m.id === msg.id) ? cur : [...cur, msg]));
      setTrackingDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send");
    } finally {
      setSending(false);
    }
  }

  async function handleRequestAssociate() {
    if (!conversationId || sending) return;
    setRequestingAssociate(true);
    try {
      const msg = await sendMessage(conversationId, {
        sender_type: "customer",
        sender_id: email.trim() || undefined,
        access_token: accessToken,
        body: "I'd like to speak with a human support agent please.",
      });
      setMessages((cur) => (cur.some((m) => m.id === msg.id) ? cur : [...cur, msg]));
    } catch {
      setRequestingAssociate(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;

    setSending(true);
    setError(null);
    try {
      if (!conversationId) {
        if (!name.trim() || !email.trim()) { setError("Name and email are required"); return; }
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
        fetchConversation(created.conversation_id, undefined, created.access_token).then(setConversation).catch(() => undefined);
      } else {
        const msg = await sendMessage(conversationId, {
          sender_type: "customer",
          sender_id: email.trim() || undefined,
          access_token: accessToken,
          body,
        });
        setMessages((cur) => (cur.some((m) => m.id === msg.id) ? cur : [...cur, msg]));
      }
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send message");
    } finally {
      setSending(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed bottom-5 right-5 z-50 font-sans">
      {open ? (
        <section className="flex h-[540px] w-[360px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">

          {/* Header */}
          <header className="flex h-14 shrink-0 items-center justify-between px-4 text-white" style={{ backgroundColor: brandColor }}>
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                <MessageCircle size={15} />
              </div>
              <div>
                <p className="text-sm font-semibold leading-tight">Fauward Relay</p>
                <p className="text-[11px] text-white/75">
                  {isHandedOff ? "Connecting you with an associate…" : greeting}
                </p>
              </div>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/80 hover:bg-white/10"
            >
              <X size={16} />
            </button>
          </header>

          {/* Message thread */}
          <div ref={threadRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-gray-50 px-4 py-4">
            {visibleMessages.length === 0 ? (
              <div className="rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-500">
                {conversationId ? "No messages yet." : "Send us a message and we'll reply here."}
              </div>
            ) : null}

            {visibleMessages.map((message) => {
              const mine = message.sender_type === "customer";
              const parsed = parseMessageBody(message.body);

              // Tracking number input card
              if (!mine && parsed.type === "tracking_input") {
                return (
                  <div key={message.id} className="flex justify-start">
                    <div className="w-full max-w-[88%] rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                      <div className="mb-2 flex items-center gap-1.5 text-sm text-gray-700">
                        <Package size={13} className="shrink-0 text-gray-400" />
                        <span>{parsed.message}</span>
                      </div>
                      <form onSubmit={handleTrackingSubmit} className="flex gap-2">
                        <input
                          value={trackingDraft}
                          onChange={(e) => setTrackingDraft(e.target.value)}
                          placeholder={parsed.placeholder}
                          className="h-9 flex-1 rounded-lg border border-gray-300 px-3 font-mono text-sm uppercase tracking-wide outline-none focus:border-gray-400"
                          autoFocus
                          autoComplete="off"
                          spellCheck={false}
                        />
                        <button
                          type="submit"
                          disabled={sending || !trackingDraft.trim()}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-white disabled:opacity-50"
                          style={{ backgroundColor: brandColor }}
                        >
                          <Send size={13} />
                        </button>
                      </form>
                      <p className="mt-1.5 text-[10px] text-gray-400">{formatRelayTime(message.created_at)}</p>
                    </div>
                  </div>
                );
              }

              // Regular message bubble
              return (
                <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
                      mine
                        ? "rounded-br-sm text-white"
                        : "rounded-bl-sm border border-gray-200 bg-white text-gray-800"
                    }`}
                    style={mine ? { backgroundColor: brandColor } : undefined}
                  >
                    <p className="whitespace-pre-wrap break-words leading-relaxed">
                      {parsed.type === "text" ? parsed.text : message.body}
                    </p>
                    <p className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-gray-400"}`}>
                      {formatRelayTime(message.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}

            {/* Typing indicator */}
            {isAiTyping && (
              <div className="flex justify-start">
                <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-sm border border-gray-200 bg-white px-3.5 py-3 shadow-sm">
                  <span
                    className="h-2 w-2 rounded-full bg-gray-400"
                    style={{ animation: "fw-bounce 1.2s ease-in-out infinite", animationDelay: "0ms" }}
                  />
                  <span
                    className="h-2 w-2 rounded-full bg-gray-400"
                    style={{ animation: "fw-bounce 1.2s ease-in-out infinite", animationDelay: "200ms" }}
                  />
                  <span
                    className="h-2 w-2 rounded-full bg-gray-400"
                    style={{ animation: "fw-bounce 1.2s ease-in-out infinite", animationDelay: "400ms" }}
                  />
                  <span className="ml-1 text-[11px] text-gray-400">Fauward Relay is typing…</span>
                </div>
              </div>
            )}

            {/* Handoff confirmation */}
            {isHandedOff && !isAiTyping && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <CircleUserRound size={13} className="shrink-0" />
                  <span>An associate will be with you shortly.</span>
                </div>
              </div>
            )}
          </div>

          {/* Bottom bar */}
          <div className="shrink-0 border-t border-gray-200 bg-white px-3 pb-3 pt-2.5">
            {isClosed && conversationId ? (
              <FeedbackForm
                conversationId={conversationId}
                submittedBy={email.trim() || undefined}
                accessToken={accessToken ?? undefined}
                compact
              />
            ) : (
              <>
                {/* Chat with associate */}
                {showAssociateButton && (
                  <button
                    type="button"
                    onClick={handleRequestAssociate}
                    className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-1.5 text-xs text-gray-500 transition-colors hover:border-gray-300 hover:bg-gray-50"
                  >
                    <CircleUserRound size={12} />
                    Chat with an associate
                  </button>
                )}

                <form onSubmit={handleSubmit}>
                  {!conversationId ? (
                    <div className="mb-2.5 grid gap-2">
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Name"
                        className="h-9 rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-gray-400"
                        required
                      />
                      <input
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email"
                        type="email"
                        className="h-9 rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-gray-400"
                        required
                      />
                      <input
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="Subject (optional)"
                        className="h-9 rounded-lg border border-gray-300 px-3 text-sm outline-none focus:border-gray-400"
                      />
                    </div>
                  ) : null}
                  {error ? <p className="mb-2 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700">{error}</p> : null}
                  <div className="flex items-end gap-2">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="Write a message…"
                      rows={2}
                      className="min-h-[40px] flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-400"
                      required
                    />
                    <button
                      type="submit"
                      disabled={sending || !draft.trim()}
                      aria-label="Send"
                      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ backgroundColor: brandColor }}
                    >
                      <Send size={16} />
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open chat"
          className="relative inline-flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl transition hover:scale-[1.04] active:scale-[0.98]"
          style={{ backgroundColor: brandColor }}
        >
          <MessageCircle size={24} />
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[11px] font-semibold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </button>
      )}

      {/* Keyframe for typing dots — injected once */}
      <style>{`
        @keyframes fw-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.5; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
