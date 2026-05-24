import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type NextFetchInit = RequestInit & {
  next?: {
    revalidate?: number;
    tags?: string[];
  };
};

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

const noStoreFetch: typeof fetch = (input, init) => {
  const nextInit = init as NextFetchInit | undefined;
  const uncachedInit: NextFetchInit = {
    ...(init ?? {}),
    cache: "no-store",
    next: {
      ...(nextInit?.next ?? {}),
      revalidate: 0,
    },
  };

  return fetch(input, uncachedInit);
};

const uncachedSupabaseOptions = {
  global: {
    fetch: noStoreFetch,
  },
};

/** Public (anon) client — safe for server-side read-only queries */
export function getSupabaseClient(): SupabaseClient {
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_ANON_KEY"),
    uncachedSupabaseOptions,
  );
}

/** Service-role client — bypasses RLS. NEVER expose to the browser. */
export function getSupabaseAdmin(): SupabaseClient {
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { autoRefreshToken: false, persistSession: false },
      ...uncachedSupabaseOptions,
    },
  );
}

/**
 * Returns a service-role client scoped to a specific tenant schema.
 * Used by widget API routes that write shipments to tenant_{slug}.shipments.
 */
export function getTenantDb(slug: string): SupabaseClient<any, string> {
  return createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: tenantSchema(slug) },
      ...uncachedSupabaseOptions,
    },
  );
}

/** Converts a tenant slug to the Postgres schema name. */
export function tenantSchema(slug: string): string {
  return `tenant_${slug.replace(/-/g, "_")}`;
}
