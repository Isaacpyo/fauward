export type TenantTheme = {
  primaryColor: string;
  accentColor: string;
  brandName: string;
  logoUrl?: string;
  isRtl: boolean;
};

export type TenantBrandingConfig = {
  brandName: string;
  logoUrl?: string | null;
  primaryColour: string;
  primaryColor: string;
  accentColour: string;
  accentColor: string;
  fontFamily: string;
};

type TenantBrandingSource = {
  name?: string | null;
  brandName?: string | null;
  logoUrl?: string | null;
  primaryColor?: string | null;
  primaryColour?: string | null;
  accentColor?: string | null;
  accentColour?: string | null;
  fontFamily?: string | null;
};

export function resolveTenantBranding(tenant?: TenantBrandingSource | null): TenantBrandingConfig {
  const primary = tenant?.primaryColour ?? tenant?.primaryColor ?? '#0D1F3C';
  const accent = tenant?.accentColour ?? tenant?.accentColor ?? '#D97706';
  return {
    brandName: tenant?.brandName ?? tenant?.name ?? 'Fauward',
    logoUrl: tenant?.logoUrl ?? null,
    primaryColour: primary,
    primaryColor: primary,
    accentColour: accent,
    accentColor: accent,
    fontFamily: tenant?.fontFamily ?? 'Arial, sans-serif'
  };
}

export function applyTenantTheme(tenant: TenantTheme): void {
  const root = document.documentElement;

  root.style.setProperty('--color-primary-base', tenant.primaryColor);
  root.style.setProperty('--color-primary-light', `color-mix(in srgb, ${tenant.primaryColor} 20%, white)`);
  root.style.setProperty('--color-primary-dark', `color-mix(in srgb, ${tenant.primaryColor} 80%, black)`);

  root.setAttribute('data-brand', tenant.brandName);
  root.setAttribute('dir', tenant.isRtl ? 'rtl' : 'ltr');
  document.title = tenant.brandName;

  if (tenant.logoUrl) {
    root.style.setProperty('--tenant-logo-url', `url("${tenant.logoUrl}")`);
  }
}
