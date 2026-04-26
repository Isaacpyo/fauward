import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

/** Public (anon) client — safe for server-side read-only queries */
export function getSupabaseClient(): SupabaseClient {
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_ANON_KEY"),
  );
}

/** Service-role client — bypasses RLS. NEVER expose to the browser. */
export function getSupabaseAdmin(): SupabaseClient {
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

/**
 * Returns a service-role client scoped to a specific tenant schema.
 * Used by widget API routes that write shipments to tenant_{slug}.shipments.
 */
export function getTenantDb(slug: string): SupabaseClient {
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: tenantSchema(slug) },
    },
  );
}

/** Converts a tenant slug to the Postgres schema name. */
export function tenantSchema(slug: string): string {
  return `tenant_${slug.replace(/-/g, "_")}`;
}
