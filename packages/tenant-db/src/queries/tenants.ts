import { getSupabaseAdmin } from "../client";

const DEFAULT_PRIMARY = "#0D1F3C";
const DEFAULT_ACCENT = "#D97706";
const DEFAULT_RADIUS = "8px";

export type TenantBranding = {
  primary: string;
  accent: string;
  radius: string;
  logoUrl: string | null;
};

export type TenantSettingsSummary = {
  paymentGateway: string;
  paymentGatewayKey: string | null;
  timezone: string | null;
  currency: string | null;
  serviceTierConfig: unknown;
  insuranceConfig: unknown;
  taxConfig: unknown;
  dimensionalDivisor: number | null;
  quoteValidityMinutes: number | null;
  showPriceBreakdownToCustomer: boolean | null;
};

export type Tenant = {
  id: string;
  slug: string;
  name: string;
  displayName: string;
  plan: string;
  status: string;
  createdAt: string | null;
  created_at: string | null;
  primaryColor: string;
  accentColor: string;
  logoUrl: string | null;
  region: string;
  defaultCurrency: string;
  defaultLanguage: string;
  timezone: string;
  isRtl: boolean;
  smsEnabled: boolean;
  branding: TenantBranding;
  settings: TenantSettingsSummary | null;
};

export type TenantBySlugOrHistoryResult =
  | { tenant: Tenant; redirectToSlug?: never }
  | { tenant: Tenant; redirectToSlug: string };

export type CreateTenantInput = {
  slug: string;
  name: string;
  plan?: string;
  branding?: {
    primary_color?: string | null;
    accent_color?: string | null;
    logo_url?: string | null;
  };
  ownerAuthUserId: string;
};

type TenantRow = {
  id: string;
  slug: string;
  name: string;
  plan: string;
  status: string;
  createdAt?: string | null;
  created_at?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  logoUrl?: string | null;
  region?: string | null;
  defaultCurrency?: string | null;
  defaultLanguage?: string | null;
  timezone?: string | null;
  isRtl?: boolean | null;
  smsEnabled?: boolean | null;
};

type TenantSettingsRow = {
  paymentGateway?: string | null;
  paymentGatewayKey?: string | null;
  timezone?: string | null;
  currency?: string | null;
  serviceTierConfig?: unknown;
  insuranceConfig?: unknown;
  taxConfig?: unknown;
  dimensionalDivisor?: number | null;
  quoteValidityMinutes?: number | null;
  showPriceBreakdownToCustomer?: boolean | null;
};

type TenantSlugHistoryRow = {
  tenant_id: string;
  old_slug: string;
  expires_at: string;
};

function normalizeSlug(slug: string) {
  return slug.trim().toLowerCase();
}

function isVisibleTenantStatus(status: string) {
  const normalized = status.toUpperCase();
  return normalized === "ACTIVE" || normalized === "TRIALING";
}

function normalizePlan(plan?: string) {
  const normalized = (plan ?? "starter").toUpperCase();
  if (normalized === "PRO" || normalized === "ENTERPRISE") return normalized;
  return "STARTER";
}

function normalizeTenantSettings(row: TenantSettingsRow | null): TenantSettingsSummary | null {
  if (!row) return null;
  return {
    paymentGateway: row.paymentGateway ?? "STRIPE",
    paymentGatewayKey: row.paymentGatewayKey ?? null,
    timezone: row.timezone ?? null,
    currency: row.currency ?? null,
    serviceTierConfig: row.serviceTierConfig ?? null,
    insuranceConfig: row.insuranceConfig ?? null,
    taxConfig: row.taxConfig ?? null,
    dimensionalDivisor: row.dimensionalDivisor ?? null,
    quoteValidityMinutes: row.quoteValidityMinutes ?? null,
    showPriceBreakdownToCustomer: row.showPriceBreakdownToCustomer ?? null,
  };
}

export function normalizeTenantRow(row: TenantRow, settings: TenantSettingsRow | null = null): Tenant | null {
  if (!isVisibleTenantStatus(row.status)) return null;

  const primary = row.primaryColor ?? DEFAULT_PRIMARY;
  const accent = row.accentColor ?? DEFAULT_ACCENT;
  const logoUrl = row.logoUrl ?? null;
  const createdAt = row.createdAt ?? row.created_at ?? null;
  const defaultCurrency = row.defaultCurrency ?? "GBP";
  const defaultLanguage = row.defaultLanguage ?? "en-GB";
  const timezone = row.timezone ?? "Europe/London";

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    displayName: row.name,
    plan: row.plan,
    status: row.status,
    createdAt,
    created_at: createdAt,
    primaryColor: primary,
    accentColor: accent,
    logoUrl,
    region: row.region ?? "uk_europe",
    defaultCurrency,
    defaultLanguage,
    timezone,
    isRtl: row.isRtl ?? false,
    smsEnabled: row.smsEnabled ?? false,
    branding: {
      primary,
      accent,
      radius: DEFAULT_RADIUS,
      logoUrl,
    },
    settings: normalizeTenantSettings(settings),
  };
}

async function getTenantByColumn(column: "id" | "slug", value: string): Promise<Tenant | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("tenants")
    .select("id, slug, name, plan, status, createdAt, primaryColor, accentColor, logoUrl, region, defaultCurrency, defaultLanguage, timezone, isRtl, smsEnabled")
    .eq(column, value)
    .maybeSingle();

  if (error || !data) return null;

  const tenantRow = data as TenantRow;
  const { data: settings } = await admin
    .from("tenant_settings")
    .select("paymentGateway, paymentGatewayKey, timezone, currency, serviceTierConfig, insuranceConfig, taxConfig, dimensionalDivisor, quoteValidityMinutes, showPriceBreakdownToCustomer")
    .eq("tenantId", tenantRow.id)
    .maybeSingle();

  return normalizeTenantRow(tenantRow, settings as TenantSettingsRow | null);
}

/** Fetch a current tenant by slug, including normalized canonical branding. */
export async function getTenantBySlug(slug: string): Promise<Tenant | null> {
  return getTenantByColumn("slug", normalizeSlug(slug));
}

/** Fetch a tenant by ID. */
export async function getTenantById(id: string): Promise<Tenant | null> {
  return getTenantByColumn("id", id);
}

/**
 * Fetch a tenant by current slug or unexpired slug history.
 * Contract shared with Prisma:
 * - table: tenant_slug_history
 * - columns: tenant_id, old_slug, expires_at
 */
export async function getTenantBySlugOrHistory(slug: string): Promise<TenantBySlugOrHistoryResult | null> {
  const normalizedSlug = normalizeSlug(slug);
  const active = await getTenantBySlug(normalizedSlug);
  if (active) return { tenant: active };

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("tenant_slug_history")
    .select("tenant_id, old_slug, expires_at")
    .eq("old_slug", normalizedSlug)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error || !data) return null;

  const history = data as TenantSlugHistoryRow;
  const tenant = await getTenantById(history.tenant_id);
  if (!tenant) return null;

  return { tenant, redirectToSlug: tenant.slug };
}

/** Check if a slug is not used by a current tenant or slug history. */
export async function isSlugAvailable(slug: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const normalizedSlug = normalizeSlug(slug);

  const [{ count: tenantCount }, { count: historyCount }] = await Promise.all([
    admin
      .from("tenants")
      .select("id", { count: "exact", head: true })
      .eq("slug", normalizedSlug),
    admin
      .from("tenant_slug_history")
      .select("old_slug", { count: "exact", head: true })
      .eq("old_slug", normalizedSlug),
  ]);

  return (tenantCount ?? 0) === 0 && (historyCount ?? 0) === 0;
}

/**
 * Create a new tenant row + owner membership.
 * Backend Prisma signup is canonical for Phase 1; this remains for existing
 * frontend callers and writes the same canonical tenant branding columns.
 */
export async function createTenant(input: CreateTenantInput): Promise<Tenant> {
  const admin = getSupabaseAdmin();

  const { data: tenant, error: tenantErr } = await admin
    .from("tenants")
    .insert({
      slug: normalizeSlug(input.slug),
      name: input.name,
      plan: normalizePlan(input.plan),
      status: "TRIALING",
      primaryColor: input.branding?.primary_color ?? DEFAULT_PRIMARY,
      accentColor: input.branding?.accent_color ?? DEFAULT_ACCENT,
      logoUrl: input.branding?.logo_url ?? null,
    })
    .select("id, slug, name, plan, status, createdAt, primaryColor, accentColor, logoUrl")
    .single();

  if (tenantErr || !tenant) {
    throw new Error(`Failed to create tenant: ${tenantErr?.message}`);
  }

  await admin.from("tenant_members").insert({
    tenant_id: (tenant as TenantRow).id,
    auth_user_id: input.ownerAuthUserId,
    role: "owner",
  });

  const normalized = normalizeTenantRow(tenant as TenantRow);
  if (!normalized) {
    throw new Error("Failed to normalize created tenant");
  }
  return normalized;
}
