"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { RelayConversation, RelayFeedback, RelayMessage } from "./types";

type EnvRecord = Record<string, string | undefined>;

let supabaseClient: SupabaseClient | null = null;

function readEnv(): EnvRecord {
  const viteEnv = typeof import.meta !== "undefined" ? ((import.meta as unknown as { env?: EnvRecord }).env ?? {}) : {};
  const processLike = (globalThis as unknown as { process?: { env?: EnvRecord } }).process;
  const nextEnv = processLike?.env ?? {};
  return { ...nextEnv, ...viteEnv };
}

export function getAuthToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("fw_access_token") ?? window.localStorage.getItem("fw_sa_access_token");
}

function getApiBase() {
  const env = readEnv();
  if (env.VITE_RELAY_API_BASE || env.NEXT_PUBLIC_RELAY_API_BASE) {
    return env.VITE_RELAY_API_BASE ?? env.NEXT_PUBLIC_RELAY_API_BASE ?? "/api/relay";
  }
  return getAuthToken() ? "/api/v1/relay" : "/api/relay";
}

export function getCurrentUserUuid() {
  const token = getAuthToken();
  const payload = token?.split(".")[1];
  if (!payload) return null;
  const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=");
  try {
    const parsed = JSON.parse(window.atob(padded.replaceAll("-", "+").replaceAll("_", "/"))) as { sub?: unknown };
    const sub = typeof parsed.sub === "string" ? parsed.sub : "";
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sub) ? sub : null;
  } catch {
    return null;
  }
}

export function getSupabaseBrowserClient() {
  if (supabaseClient) return supabaseClient;
  const env = readEnv();
  const url = env.VITE_SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY ?? env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  supabaseClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return supabaseClient;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("content-type", "application/json");
  const token = getAuthToken();
  if (token) headers.set("authorization", `Bearer ${token}`);

  const response = await fetch(`${getApiBase()}${path}`, {
    ...options,
    headers,
  });
  const data = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data && typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : "Relay request failed";
    throw new Error(message);
  }
  return data as T;
}

export function fetchConversations(params: {
  mode: "tenant" | "super";
  tenantId?: string;
  status?: string;
  sourceApp?: string;
  search?: string;
}) {
  const query = new URLSearchParams();
  if (params.mode === "tenant" && params.tenantId) query.set("tenant_id", params.tenantId);
  if (params.status) query.set("status", params.status);
  if (params.sourceApp) query.set("source_app", params.sourceApp);
  if (params.search) query.set("search", params.search);
  const suffix = query.toString() ? `?${query}` : "";
  return request<RelayConversation[]>(`/conversations${suffix}`);
}

export function fetchMessages(conversationId: string, tenantId?: string, accessToken?: string) {
  const query = new URLSearchParams();
  if (tenantId) query.set("tenant_id", tenantId);
  if (accessToken) query.set("access_token", accessToken);
  const suffix = query.toString() ? `?${query}` : "";
  return request<RelayMessage[]>(`/conversations/${conversationId}/messages${suffix}`);
}

export function fetchConversation(conversationId: string, tenantId?: string, accessToken?: string) {
  const query = new URLSearchParams();
  if (tenantId) query.set("tenant_id", tenantId);
  if (accessToken) query.set("access_token", accessToken);
  const suffix = query.toString() ? `?${query}` : "";
  return request<RelayConversation>(`/conversations/${conversationId}${suffix}`);
}

export function createConversation(input: {
  source_app: "marketing" | "tenant_portal";
  tenant_id?: string;
  customer_name?: string;
  customer_email?: string;
  subject?: string;
  first_message: string;
}) {
  return request<{ conversation_id: string; access_token?: string }>("/conversations", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function sendMessage(
  conversationId: string,
  input: {
    sender_type: "customer" | "admin" | "system";
    sender_id?: string | null;
    tenant_id?: string | null;
    access_token?: string | null;
    body: string;
  },
) {
  return request<RelayMessage>(`/conversations/${conversationId}/messages`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateConversation(
  conversationId: string,
  input: {
    status?: "open" | "assigned" | "closed";
    assigned_admin_id?: string | null;
  },
) {
  return request<RelayConversation>(`/conversations/${conversationId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function submitFeedback(input: {
  conversation_id: string;
  rating: number;
  comment?: string;
  submitted_by?: string;
  tenant_id?: string;
  access_token?: string;
}) {
  return request<RelayFeedback>("/feedback", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function fetchFeedback() {
  return request<RelayFeedback[]>("/feedback");
}

export function formatRelayTime(value: string | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
