export type TenantTheme = {
  primaryColor: string;
  accentColor: string;
  brandName: string;
  logoUrl?: string;
  isRtl: boolean;
};

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