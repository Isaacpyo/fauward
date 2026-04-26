"use client";

import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { fetchConversations, fetchMessages, formatRelayTime } from "./client";
import type { RelayConversation, RelayMessage, RelaySource } from "./types";

export type RelayNotificationItem = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  isRead: boolean;
};

type RelayNotificationInput = {
  mode: "tenant" | "super";
  tenantId?: string;
  storageKey: string;
  enabled?: boolean;
};

function conversationTitle(conversation: RelayConversation) {
  return conversation.subject || conversation.customer_name || conversation.customer_email || "Relay conversation";
}

function sourceLabel(source: RelaySource) {
  return source === "marketing" ? "Website" : "Tenant portal";
}

function getLastReadAt(storageKey: string) {
  if (typeof window === "undefined") return 0;
  return Number(window.localStorage.getItem(storageKey) ?? "0");
}

function setLastReadAt(storageKey: string, value: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, String(value));
}

async function fetchRelayNotificationItems(input: RelayNotificationInput): Promise<RelayNotificationItem[]> {
  const conversations = await fetchConversations({
    mode: input.mode,
    tenantId: input.tenantId,
    status: undefined,
    sourceApp: undefined,
    search: undefined,
  });

  const recentConversations = conversations
    .filter((conversation) => conversation.status !== "closed")
    .slice(0, 12);

  const rows = await Promise.all(
    recentConversations.map(async (conversation) => {
      let latestMessage: RelayMessage | null = null;
      try {
        const messages = await fetchMessages(conversation.id, input.mode === "tenant" ? input.tenantId : undefined);
        latestMessage = messages[messages.length - 1] ?? null;
      } catch {
        latestMessage = null;
      }

      const createdAt = latestMessage?.created_at ?? conversation.last_message_at ?? conversation.created_at ?? new Date().toISOString();
      const isOwnLatestMessage =
        (input.mode === "tenant" && latestMessage?.sender_type === "customer") ||
        (input.mode === "super" && latestMessage?.sender_type === "admin");
      const senderLabel =
        latestMessage?.sender_type === "admin"
          ? "Fauward team"
          : latestMessage?.sender_type === "customer"
            ? conversation.customer_name || conversation.customer_email || "Customer"
            : "Relay";

      return {
        id: conversation.id,
        title: conversationTitle(conversation),
        body: latestMessage?.body
          ? `${senderLabel}: ${latestMessage.body}`
          : `${sourceLabel(conversation.source_app)} conversation updated ${formatRelayTime(createdAt)}`,
        createdAt,
        isRead: isOwnLatestMessage || new Date(createdAt).getTime() <= getLastReadAt(input.storageKey),
      };
    })
  );

  return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function useRelayNotifications(input: RelayNotificationInput) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["relay-notifications", input.mode, input.tenantId, input.storageKey],
    queryFn: () => fetchRelayNotificationItems(input),
    enabled: input.enabled ?? (input.mode === "super" || Boolean(input.tenantId)),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const items = query.data ?? [];
  const unreadCount = useMemo(() => items.filter((item) => !item.isRead).length, [items]);

  function markRead(id?: string) {
    const targetItems = id ? items.filter((item) => item.id === id) : items;
    const latest = targetItems.reduce((max, item) => Math.max(max, new Date(item.createdAt).getTime()), Date.now());
    setLastReadAt(input.storageKey, latest);
    void queryClient.invalidateQueries({ queryKey: ["relay-notifications"] });
  }

  return {
    items,
    unreadCount,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    markRead,
  };
}
