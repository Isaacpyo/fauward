import { getSupabaseAdmin } from "@fauward/tenant-db";

export type WidgetDomainRecord = {
  id: string;
  tenantId: string;
  host: string;
  verifiedAt: string | null;
};

type WidgetDomainRow = {
  id: string;
  tenant_id: string;
  host: string;
  verified_at: string | null;
};

type TenantDomainRow = {
  id: string;
  slug: string;
  customDomain: string | null;
};

export class WidgetDomainConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WidgetDomainConflictError";
  }
}

function normalizeWidgetDomain(row: WidgetDomainRow): WidgetDomainRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    host: row.host,
    verifiedAt: row.verified_at,
  };
}

export async function getWidgetDomain(host: string): Promise<WidgetDomainRecord | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("tenant_widget_domains")
    .select("id, tenant_id, host, verified_at")
    .eq("host", host)
    .maybeSingle();

  if (error || !data) return null;
  return normalizeWidgetDomain(data as WidgetDomainRow);
}

export async function assertWidgetDomainAvailable(host: string, tenantId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const existingWidgetDomain = await getWidgetDomain(host);
  if (existingWidgetDomain && existingWidgetDomain.tenantId !== tenantId) {
    throw new WidgetDomainConflictError("This widget domain is already owned by another tenant");
  }

  const { data } = await admin
    .from("tenants")
    .select("id, slug, customDomain")
    .eq("customDomain", host)
    .maybeSingle();

  const portalTenant = data as TenantDomainRow | null;
  if (portalTenant) {
    throw new WidgetDomainConflictError("This host is already configured as a portal domain");
  }
}

export async function createWidgetDomain(tenantId: string, host: string): Promise<WidgetDomainRecord> {
  const existing = await getWidgetDomain(host);
  if (existing) return existing;

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("tenant_widget_domains")
    .insert({ tenant_id: tenantId, host })
    .select("id, tenant_id, host, verified_at")
    .single();

  if (error || !data) {
    throw new Error(`Failed to persist widget domain: ${error?.message ?? "unknown error"}`);
  }

  return normalizeWidgetDomain(data as WidgetDomainRow);
}

export async function markWidgetDomainVerified(host: string, tenantId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("tenant_widget_domains")
    .update({ verified_at: new Date().toISOString() })
    .eq("host", host)
    .eq("tenant_id", tenantId);

  if (error) {
    throw new Error(`Failed to mark widget domain verified: ${error.message}`);
  }
}

export async function deleteWidgetDomain(host: string, tenantId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("tenant_widget_domains")
    .delete()
    .eq("host", host)
    .eq("tenant_id", tenantId);

  if (error) {
    throw new Error(`Failed to delete widget domain: ${error.message}`);
  }
}
