import { getSupabaseAdmin } from "../client";

const DEFAULT_PRIMARY = "#0D1F3C";
const DEFAULT_ACCENT = "#D97706";
const DEFAULT_RADIUS = "8px";
const WCAG_AA_CONTRAST = 4.5;

export type TenantBranding = {
  primary: string;
  accent: string;
  radius: string;
  logoUrl: string | null;
};

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: string, b: string): number | null {
  const rgbA = hexToRgb(a);
  const rgbB = hexToRgb(b);
  if (!rgbA || !rgbB) return null;
  const lA = relativeLuminance(rgbA);
  const lB = relativeLuminance(rgbB);
  const [hi, lo] = lA >= lB ? [lA, lB] : [lB, lA];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Accent must remain legible against the primary surface. If the stored accent
 * fails WCAG AA (4.5:1) we fall back to the default accent rather than ship a
 * white-label that becomes invisible. Output shape is unchanged.
 */
function ensureAccentContrast(primary: string, accent: string): string {
  const ratio = contrastRatio(primary, accent);
  if (ratio === null) return DEFAULT_ACCENT;
  return ratio >= WCAG_AA_CONTRAST ? accent : DEFAULT_ACCENT;
}

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
  brandName: string | null;
  displayName: string;
  trackingHeadline: string | null;
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
  brandName?: string | null;
  trackingHeadline?: string | null;
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
  const rawAccent = row.accentColor ?? DEFAULT_ACCENT;
  const accent = ensureAccentContrast(primary, rawAccent);
  const logoUrl = row.logoUrl ?? null;
  const createdAt = row.createdAt ?? row.created_at ?? null;
  const defaultCurrency = row.defaultCurrency ?? "GBP";
  const defaultLanguage = row.defaultLanguage ?? "en-GB";
  const timezone = row.timezone ?? "Europe/London";
  const brandName = row.brandName ?? null;

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    brandName,
    displayName: brandName ?? row.name,
    trackingHeadline: row.trackingHeadline ?? null,
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
    .select("id, slug, name, brandName, trackingHeadline, plan, status, createdAt, primaryColor, accentColor, logoUrl, region, defaultCurrency, defaultLanguage, timezone, isRtl, smsEnabled")
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
