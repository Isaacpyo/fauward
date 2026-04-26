import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getSupabaseAdmin, tenantSchema } from "./client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadTemplate(): string {
  // Resolve relative to the package root regardless of where it's called from
  const migrationPath = join(
    __dirname,
    "../../../../supabase/migrations/0002_tenant_schema_template.sql",
  );
  return readFileSync(migrationPath, "utf-8");
}

/**
 * Provisions a fresh Postgres schema for a new tenant.
 * Call this once during tenant onboarding (after inserting into public.tenants).
 *
 * The migration template uses the literal string "TENANT_SLUG" as a placeholder
 * which we replace with the real slug at runtime.
 */
export async function createTenantSchema(slug: string): Promise<void> {
  const schema = tenantSchema(slug);
  const sql = loadTemplate().replaceAll("TENANT_SLUG", slug);

  const admin = getSupabaseAdmin();

  // Supabase doesn't expose raw SQL execution on the client, so we use rpc.
  // This requires a helper function deployed to Supabase:
  //   create or replace function public.exec_sql(query text)
  //   returns void language plpgsql security definer as $$ begin execute query; end; $$;
  const { error } = await admin.rpc("exec_sql", { query: sql });

  if (error) {
    throw new Error(`Failed to create tenant schema "${schema}": ${error.message}`);
  }
}

/**
 * Helper SQL to deploy the exec_sql RPC once to your Supabase project.
 * Run this manually via the Supabase SQL editor before calling createTenantSchema.
 */
export const EXEC_SQL_HELPER = `
create or replace function public.exec_sql(query text)
returns void
language plpgsql
security definer
as $$
begin
  execute query;
end;
$$;
`.trim();
