import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { jwtVerify } from "jose";

import type {
  CreateRelayConversationInput,
  CreateRelayMessageInput,
  ListRelayConversationsInput,
  RelayConversation,
  RelayFeedback,
  RelayMessage,
  RelaySender,
  RelaySource,
  RelayStatus,
  UpdateRelayConversationInput,
} from "./types";

export type {
  CreateRelayConversationInput,
  CreateRelayMessageInput,
  ListRelayConversationsInput,
  RelayConversation,
  RelayFeedback,
  RelayMessage,
  RelaySender,
  RelaySource,
  RelayStatus,
  UpdateRelayConversationInput,
};

type AuthContext = {
  role?: string;
  tenantId?: string;
  userId?: string;
};

const relaySources = new Set<RelaySource>(["marketing", "tenant_portal"]);
const relaySenders = new Set<RelaySender>(["customer", "admin", "system"]);
const relayStatuses = new Set<RelayStatus>(["open", "assigned", "closed"]);

function env(name: string) {
  return process.env[name];
}

function requireEnv(name: string) {
  const value = env(name);
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function getSupabaseUrl() {
  return env("SUPABASE_URL") ?? env("NEXT_PUBLIC_SUPABASE_URL") ?? "";
}

function getServiceRoleKey() {
  return env("SUPABASE_SERVICE_ROLE_KEY") ?? env("SUPABASE_SERVICE_KEY") ?? "";
}

export function getRelayAdminClient(): SupabaseClient {
  const url = getSupabaseUrl() || requireEnv("SUPABASE_URL");
  const key = getServiceRoleKey() || requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function badRequest(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

function forbidden(message = "Forbidden"): Response {
  return Response.json({ error: message }, { status: 403 });
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function generateAccessToken() {
  return randomBytes(32).toString("base64url");
}

function hashAccessToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function safeEqualHash(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function readBearer(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const [type, token] = header.split(" ");
  return type?.toLowerCase() === "bearer" && token ? token : null;
}

function readRelayAccessToken(request: Request, body?: Record<string, unknown>) {
  const url = new URL(request.url);
  return (
    request.headers.get("x-relay-access-token") ??
    url.searchParams.get("access_token") ??
    cleanText(body?.access_token) ??
    null
  );
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split(".");
  if (!payload) return {};
  const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=");
  try {
    return JSON.parse(Buffer.from(padded, "base64url").toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function getAuthContext(request: Request): Promise<AuthContext> {
  const token = readBearer(request);
  if (!token) return {};

  const secret = env("JWT_ACCESS_SECRET");
  let payload: Record<string, unknown>;
  if (secret) {
    try {
      const verified = await jwtVerify(token, new TextEncoder().encode(secret));
      payload = verified.payload;
    } catch {
      return {};
    }
  } else {
    payload = decodeJwtPayload(token);
  }

  return {
    role: typeof payload.role === "string" ? payload.role : undefined,
    tenantId:
      typeof payload.tenantId === "string"
        ? payload.tenantId
        : typeof payload.tenant_id === "string"
          ? payload.tenant_id
          : undefined,
    userId: typeof payload.sub === "string" ? payload.sub : undefined,
  };
}

function isSuperAdmin(auth: AuthContext) {
  return auth.role === "SUPER_ADMIN";
}

function assertSource(value: unknown): RelaySource | null {
  return typeof value === "string" && relaySources.has(value as RelaySource) ? (value as RelaySource) : null;
}

function assertSender(value: unknown): RelaySender | null {
  return typeof value === "string" && relaySenders.has(value as RelaySender) ? (value as RelaySender) : null;
}

function assertStatus(value: unknown): RelayStatus | null {
  return typeof value === "string" && relayStatuses.has(value as RelayStatus) ? (value as RelayStatus) : null;
}

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function readId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function readJsonObject(request: Request) {
  try {
    const body = (await request.json()) as unknown;
    return typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function createRelayConversation(input: CreateRelayConversationInput) {
  const supabase = getRelayAdminClient();
  const { data, error } = await supabase.rpc("relay_create_conversation", {
    p_source_app: input.source_app,
    p_tenant_id: input.tenant_id ?? null,
    p_customer_name: input.customer_name ?? null,
    p_customer_email: input.customer_email ?? null,
    p_subject: input.subject ?? null,
    p_first_message: input.first_message,
    p_sender_id: input.customer_email ?? null,
    p_access_token_hash: input.access_token_hash ?? null,
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return { conversation_id: row?.conversation_id as string };
}

export async function createRelayMessage(conversationId: string, input: CreateRelayMessageInput) {
  const supabase = getRelayAdminClient();
  const { data, error } = await supabase
    .from("relay_messages")
    .insert({
      conversation_id: conversationId,
      sender_type: input.sender_type,
      sender_id: input.sender_id ?? null,
      body: input.body,
    })
    .select("*")
    .single<RelayMessage>();

  if (error) throw error;
  return data;
}

async function getRelayConversation(conversationId: string) {
  const supabase = getRelayAdminClient();
  const { data, error } = await supabase
    .from("relay_conversations")
    .select("*")
    .eq("id", conversationId)
    .single<RelayConversation>();

  if (error) throw error;
  return data;
}

function assertConversationAccess(conversation: RelayConversation, token: string | null) {
  if (!conversation.access_token_hash) return false;
  if (!token) return false;
  return safeEqualHash(hashAccessToken(token), conversation.access_token_hash);
}

export async function getRelayConversationById(conversationId: string) {
  return getRelayConversation(conversationId);
}

export async function listRelayConversations(input: ListRelayConversationsInput) {
  const supabase = getRelayAdminClient();
  let query = supabase
    .from("relay_conversations")
    .select("*")
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (input.tenant_id) query = query.eq("tenant_id", input.tenant_id);
  if (input.status) query = query.eq("status", input.status);
  if (input.source_app) query = query.eq("source_app", input.source_app);
  if (input.search) {
    const escaped = input.search.replaceAll("%", "\\%").replaceAll("_", "\\_");
    query = query.or(`customer_name.ilike.%${escaped}%,customer_email.ilike.%${escaped}%,subject.ilike.%${escaped}%`);
  }

  const { data, error } = await query.returns<RelayConversation[]>();
  if (error) throw error;
  return data ?? [];
}

export async function listRelayMessages(conversationId: string) {
  const supabase = getRelayAdminClient();
  const { data, error } = await supabase
    .from("relay_messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .returns<RelayMessage[]>();

  if (error) throw error;
  return data ?? [];
}

export async function updateRelayConversation(conversationId: string, input: UpdateRelayConversationInput) {
  const supabase = getRelayAdminClient();
  const update: Record<string, string | null> = {};
  if (input.status !== undefined) update.status = input.status;
  if (input.assigned_admin_id !== undefined) update.assigned_admin_id = input.assigned_admin_id;

  const { data, error } = await supabase
    .from("relay_conversations")
    .update(update)
    .eq("id", conversationId)
    .select("*")
    .single<RelayConversation>();

  if (error) throw error;
  return data;
}

export async function createRelayFeedback(input: {
  conversation_id: string;
  rating: number;
  comment?: string | null;
  submitted_by?: string | null;
  tenant_id?: string | null;
}) {
  const supabase = getRelayAdminClient();
  const conversation = await getRelayConversation(input.conversation_id);
  if (conversation.status !== "closed") {
    throw new Error("Feedback can only be submitted for closed conversations");
  }

  const { data, error } = await supabase
    .from("relay_feedback")
    .upsert({
      conversation_id: conversation.id,
      tenant_id: conversation.tenant_id,
      source_app: conversation.source_app,
      customer_name: conversation.customer_name,
      customer_email: conversation.customer_email,
      rating: input.rating,
      comment: input.comment ?? null,
      submitted_by: input.submitted_by ?? conversation.customer_email ?? input.tenant_id ?? null,
    }, { onConflict: "conversation_id" })
    .select("*")
    .single<RelayFeedback>();

  if (error) throw error;
  return data;
}

export async function listRelayFeedback() {
  const supabase = getRelayAdminClient();
  const { data, error } = await supabase
    .from("relay_feedback")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<RelayFeedback[]>();

  if (error) throw error;
  return data ?? [];
}

export async function handleCreateConversation(request: Request) {
  const body = await readJsonObject(request);
  if (!body) return badRequest("Invalid JSON body");
  const auth = await getAuthContext(request);

  const source_app = assertSource(body.source_app);
  const first_message = cleanText(body.first_message);
  if (!source_app) return badRequest("source_app must be marketing or tenant_portal");
  if (!first_message) return badRequest("first_message is required");

  const tenant_id = body.tenant_id == null || body.tenant_id === "" ? null : readId(body.tenant_id);
  if (source_app === "tenant_portal") {
    if (!tenant_id) return badRequest("tenant_id is required for tenant portal conversations");
    if (!isSuperAdmin(auth) && auth.tenantId && auth.tenantId !== tenant_id) return forbidden();
  }
  const accessToken = generateAccessToken();

  const result = await createRelayConversation({
      source_app,
      tenant_id,
      customer_name: cleanText(body.customer_name),
      customer_email: cleanText(body.customer_email),
      subject: cleanText(body.subject),
      first_message,
      access_token_hash: hashAccessToken(accessToken),
    });

  return json({ ...result, access_token: accessToken }, 201);
}

export async function handleCreateMessage(request: Request, conversationId: string) {
  if (!readUuid(conversationId)) return badRequest("Invalid conversation id");
  const body = await readJsonObject(request);
  if (!body) return badRequest("Invalid JSON body");
  const auth = await getAuthContext(request);

  const sender_type = assertSender(body.sender_type);
  const bodyText = cleanText(body.body);
  if (!sender_type) return badRequest("sender_type must be customer, admin, or system");
  if (!bodyText) return badRequest("body is required");

  if ((sender_type === "admin" || sender_type === "system") && !isSuperAdmin(auth)) {
    return forbidden("Admin sender_type requires SUPER_ADMIN");
  }

  const conversation = await getRelayConversation(conversationId);
  if (!isSuperAdmin(auth)) {
    if (conversation.source_app === "tenant_portal") {
      const requestTenantId = readId(body.tenant_id) ?? cleanText(body.sender_id);
      if (auth.tenantId) {
        if (auth.tenantId !== conversation.tenant_id) return forbidden();
      } else if (sender_type !== "customer" || requestTenantId !== conversation.tenant_id) {
        return forbidden();
      }
    } else if (sender_type !== "customer" || !assertConversationAccess(conversation, readRelayAccessToken(request, body))) {
      return forbidden();
    }
  }

  return json(
    await createRelayMessage(conversationId, {
      sender_type,
      sender_id: cleanText(body.sender_id),
      body: bodyText,
    }),
    201,
  );
}

export async function handleListConversations(request: Request) {
  const url = new URL(request.url);
  const auth = await getAuthContext(request);
  const tenant_id = readId(url.searchParams.get("tenant_id"));
  const statusParam = url.searchParams.get("status");
  const sourceParam = url.searchParams.get("source_app");
  const status = (statusParam ? assertStatus(statusParam) : undefined) ?? undefined;
  const source_app = (sourceParam ? assertSource(sourceParam) : undefined) ?? undefined;

  if (statusParam && !status) return badRequest("Invalid status");
  if (sourceParam && !source_app) return badRequest("Invalid source_app");

  if (!isSuperAdmin(auth)) {
    const effectiveTenantId = tenant_id ?? auth.tenantId;
    if (!effectiveTenantId) return forbidden("Tenant context required");
    if (auth.tenantId && effectiveTenantId !== auth.tenantId) return forbidden();
    return json(
      await listRelayConversations({
        tenant_id: effectiveTenantId,
        status,
        source_app,
        search: cleanText(url.searchParams.get("search")) ?? undefined,
      }),
    );
  }

  return json(
    await listRelayConversations({
      tenant_id: tenant_id ?? undefined,
      status,
      source_app,
      search: cleanText(url.searchParams.get("search")) ?? undefined,
    }),
  );
}

export async function handleListMessages(request: Request, conversationId: string) {
  if (!readUuid(conversationId)) return badRequest("Invalid conversation id");
  const auth = await getAuthContext(request);
  const url = new URL(request.url);
  const tenant_id = readId(url.searchParams.get("tenant_id"));
  const conversation = await getRelayConversation(conversationId);

  if (!isSuperAdmin(auth) && auth.tenantId && tenant_id && tenant_id !== auth.tenantId) {
    return forbidden();
  }
  if (!isSuperAdmin(auth) && conversation.source_app === "tenant_portal") {
    const effectiveTenantId = auth.tenantId ?? tenant_id;
    if (!effectiveTenantId || effectiveTenantId !== conversation.tenant_id) return forbidden();
  }
  if (!isSuperAdmin(auth) && conversation.source_app === "marketing" && !assertConversationAccess(conversation, readRelayAccessToken(request))) {
    return forbidden();
  }

  return json(await listRelayMessages(conversationId));
}

export async function handleGetConversation(request: Request, conversationId: string) {
  if (!readUuid(conversationId)) return badRequest("Invalid conversation id");
  const auth = await getAuthContext(request);
  const url = new URL(request.url);
  const tenant_id = readId(url.searchParams.get("tenant_id"));
  const conversation = await getRelayConversation(conversationId);

  if (!isSuperAdmin(auth) && conversation.source_app === "tenant_portal") {
    const effectiveTenantId = auth.tenantId ?? tenant_id;
    if (!effectiveTenantId || effectiveTenantId !== conversation.tenant_id) return forbidden();
  }
  if (!isSuperAdmin(auth) && conversation.source_app === "marketing" && !assertConversationAccess(conversation, readRelayAccessToken(request))) {
    return forbidden();
  }

  return json(conversation);
}

export async function handleUpdateConversation(request: Request, conversationId: string) {
  if (!readUuid(conversationId)) return badRequest("Invalid conversation id");
  const auth = await getAuthContext(request);
  if (!isSuperAdmin(auth)) return forbidden("SUPER_ADMIN role required");

  const body = await readJsonObject(request);
  if (!body) return badRequest("Invalid JSON body");
  const status = (body.status == null ? undefined : assertStatus(body.status)) ?? undefined;
  if (body.status != null && !status) return badRequest("Invalid status");

  const assigned_admin_id =
    body.assigned_admin_id === null || body.assigned_admin_id === "" || body.assigned_admin_id === undefined
      ? body.assigned_admin_id === undefined
        ? undefined
        : null
      : readId(body.assigned_admin_id);

  return json(await updateRelayConversation(conversationId, { status, assigned_admin_id }));
}

export async function handleCreateFeedback(request: Request) {
  const body = await readJsonObject(request);
  if (!body) return badRequest("Invalid JSON body");
  const conversation_id = readUuid(body.conversation_id);
  if (!conversation_id) return badRequest("conversation_id is required");
  const rating = typeof body.rating === "number" ? body.rating : Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return badRequest("rating must be between 1 and 5");

  const auth = await getAuthContext(request);
  const conversation = await getRelayConversation(conversation_id);
  if (conversation.status !== "closed") return badRequest("Feedback can only be submitted for closed conversations");
  const tenant_id = readId(body.tenant_id);
  if (!isSuperAdmin(auth) && conversation.source_app === "tenant_portal") {
    const effectiveTenantId = auth.tenantId ?? tenant_id;
    if (!effectiveTenantId || effectiveTenantId !== conversation.tenant_id) return forbidden();
  }
  if (!isSuperAdmin(auth) && conversation.source_app === "marketing" && !assertConversationAccess(conversation, readRelayAccessToken(request, body))) {
    return forbidden();
  }

  return json(
    await createRelayFeedback({
      conversation_id,
      rating,
      comment: cleanText(body.comment),
      submitted_by: cleanText(body.submitted_by),
      tenant_id,
    }),
    201,
  );
}

export async function handleListFeedback(request: Request) {
  const auth = await getAuthContext(request);
  if (!isSuperAdmin(auth)) return forbidden("SUPER_ADMIN role required");
  return json(await listRelayFeedback());
}
