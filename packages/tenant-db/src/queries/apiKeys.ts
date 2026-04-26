import crypto from "crypto";
import { getSupabaseAdmin } from "../client.js";

export type ApiKey = {
  id: string;
  tenant_id: string;
  key_hash: string;
  label: string | null;
  scopes: string[];
  status: string;
  created_at: string;
};

/**
 * Creates a new API key for a tenant.
 * Returns the raw key ONCE — it is never stored in plaintext.
 */
export async function createApiKey(
  tenantId: string,
  label?: string,
  scopes: string[] = ["widget:write"],
): Promise<{ rawKey: string; apiKey: ApiKey }> {
  const admin = getSupabaseAdmin();
  const rawKey = `fw_${crypto.randomBytes(32).toString("hex")}`;
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  const { data, error } = await admin
    .from("tenant_api_keys")
    .insert({ tenant_id: tenantId, key_hash: keyHash, label: label ?? null, scopes })
    .select()
    .single();

  if (error || !data) throw new Error(`createApiKey: ${error?.message}`);
  return { rawKey, apiKey: data as ApiKey };
}

/**
 * Validates a raw API key submitted in a request header.
 * Returns the tenant_id if valid, null otherwise.
 */
export async function validateApiKey(rawKey: string): Promise<{ tenantId: string; scopes: string[] } | null> {
  const admin = getSupabaseAdmin();
  const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");

  const { data, error } = await admin
    .from("tenant_api_keys")
    .select("tenant_id, scopes, status")
    .eq("key_hash", keyHash)
    .eq("status", "active")
    .single();

  if (error || !data) return null;
  return { tenantId: data.tenant_id as string, scopes: data.scopes as string[] };
}

export async function listApiKeys(tenantId: string): Promise<Omit<ApiKey, "key_hash">[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("tenant_api_keys")
    .select("id, tenant_id, label, scopes, status, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listApiKeys: ${error.message}`);
  return (data ?? []) as Omit<ApiKey, "key_hash">[];
}

export async function revokeApiKey(keyId: string, tenantId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  await admin
    .from("tenant_api_keys")
    .update({ status: "revoked" })
    .eq("id", keyId)
    .eq("tenant_id", tenantId);
}
