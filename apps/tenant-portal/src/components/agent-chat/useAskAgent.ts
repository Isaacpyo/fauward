import { useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";

export type AskStatus = "answered" | "cannot_answer" | "error";

export interface AskToolInvocation {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
}

export interface AskResponse {
  answer: string;
  toolsUsed: AskToolInvocation[];
  status: AskStatus;
  conversationId?: string;
}

export interface AskTurn {
  id: string;
  question: string;
  response?: AskResponse;
  pending: boolean;
  error?: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

interface ServerMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: AskStatus | "proposed" | null;
  toolsUsed: AskToolInvocation[] | null;
  proposedActionIds: string[];
  createdAt: string;
}

const ACTIVE_CONVERSATION_KEY = "fauward.agent.activeConversationId";

// Multi-turn chat persisted server-side. The hook keeps the active conversationId so each
// /ask call continues the same thread; conversations survive reloads and are listable.
export function useAskAgent() {
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(() =>
    typeof window !== "undefined" ? window.localStorage.getItem(ACTIVE_CONVERSATION_KEY) : null
  );
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);

  // Keep the active id in localStorage so reopening the panel resumes the last thread.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (conversationId) window.localStorage.setItem(ACTIVE_CONVERSATION_KEY, conversationId);
    else window.localStorage.removeItem(ACTIVE_CONVERSATION_KEY);
  }, [conversationId]);

  const listConversations = useCallback(async () => {
    try {
      const { data } = await api.get<{ items: ConversationSummary[] }>("/v1/agent/conversations");
      setConversations(data.items);
    } catch {
      // Listing is non-critical; leave the prior list in place.
    }
  }, []);

  const loadConversation = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const { data } = await api.get<{ messages: ServerMessage[] }>(`/v1/agent/conversations/${id}`);
      const hydrated: AskTurn[] = [];
      for (const m of data.messages) {
        if (m.role === "user") {
          hydrated.push({ id: m.id, question: m.content, pending: false });
        } else {
          const last = hydrated[hydrated.length - 1];
          const response: AskResponse = {
            answer: m.content,
            toolsUsed: m.toolsUsed ?? [],
            status: (m.status === "proposed" ? "answered" : (m.status ?? "answered")) as AskStatus
          };
          if (last && !last.response) last.response = response;
          else hydrated.push({ id: m.id, question: "", response, pending: false });
        }
      }
      setTurns(hydrated);
      setConversationId(id);
    } catch {
      // ignore — keep current view
    } finally {
      setLoading(false);
    }
  }, []);

  const newConversation = useCallback(() => {
    setTurns([]);
    setConversationId(null);
  }, []);

  const archive = useCallback(
    async (id: string) => {
      try {
        await api.patch(`/v1/agent/conversations/${id}`, { archived: true });
        if (id === conversationId) newConversation();
        await listConversations();
      } catch {
        // ignore
      }
    },
    [conversationId, newConversation, listConversations]
  );

  const ask = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (!trimmed) return;

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setTurns((prev) => [...prev, { id, question: trimmed, pending: true }]);
      setLoading(true);

      try {
        const { data } = await api.post<AskResponse>("/v1/agent/ask", {
          question: trimmed,
          conversationId: conversationId ?? undefined
        });
        if (data.conversationId) setConversationId(data.conversationId);
        setTurns((prev) =>
          prev.map((t) => (t.id === id ? { ...t, response: data, pending: false } : t))
        );
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Something went wrong. Please try again.";
        setTurns((prev) =>
          prev.map((t) => (t.id === id ? { ...t, error: message, pending: false } : t))
        );
      } finally {
        setLoading(false);
      }
    },
    [conversationId]
  );

  const reset = useCallback(() => setTurns([]), []);

  return {
    turns,
    loading,
    conversationId,
    conversations,
    ask,
    reset,
    listConversations,
    loadConversation,
    newConversation,
    archive
  };
}
