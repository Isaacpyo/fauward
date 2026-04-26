import { getSupabaseAdmin } from "../client.js";

export type Tenant = {
  id: string;
  slug: string;
  name: string;
  plan: string;
  status: string;
  created_at: string;
  tenant_branding: TenantBranding | null;
};

export type TenantBranding = {
  tenant_id: string;
  logo_url: string | null;
  primary_color: string;
  accent_color: string;
  font_family: string;
  custom_domain: string | null;
};

export type CreateTenantInput = {
  slug: string;
  name: string;
  plan?: string;
  branding?: Partial<Omit<TenantBranding, "tenant_id">>;
  ownerAuthUserId: string;
};

/** Fetch a tenant by slug, including branding. Returns null if not found. */
export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("tenants")
    .select("*, tenant_branding(*)")
    .eq("slug", slug)
    .eq("status", "active")
    .single();

  if (error || !data) return null;
  return data as Tenant;
}

/** Fetch a tenant by ID. */
export async function getTenantById(id: string): Promise<Tenant | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("tenants")
    .select("*, tenant_branding(*)")
    .eq("id", id)
    .single();

  if (error || !data) return null;
  return data as Tenant;
}

/** Check if a slug is already taken. */
export async function isSlugAvailable(slug: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { count } = await admin
    .from("tenants")
    .select("id", { count: "exact", head: true })
    .eq("slug", slug);
  return count === 0;
}

/**
 * Create a new tenant row + branding row + owner membership.
 * Does NOT provision the per-tenant schema — call createTenantSchema() separately.
 */
export async function createTenant(input: CreateTenantInput): Promise<Tenant> {
  const admin = getSupabaseAdmin();

  const { data: tenant, error: tenantErr } = await admin
    .from("tenants")
    .insert({ slug: input.slug, name: input.name, plan: input.plan ?? "starter" })
    .select()
    .single();

  if (tenantErr || !tenant) {
    throw new Error(`Failed to create tenant: ${tenantErr?.message}`);
  }

  // Insert branding row
  await admin.from("tenant_branding").insert({
    tenant_id: tenant.id,
    primary_color: input.branding?.primary_color ?? "#2563eb",
    accent_color: input.branding?.accent_color ?? "#1e40af",
    font_family: input.branding?.font_family ?? "Inter",
    logo_url: input.branding?.logo_url ?? null,
    custom_domain: input.branding?.custom_domain ?? null,
  });

  // Link owner
  await admin.from("tenant_members").insert({
    tenant_id: tenant.id,
    auth_user_id: input.ownerAuthUserId,
    role: "owner",
  });

  return tenant as Tenant;
}
