/**
 * Thin helpers for storing and clearing auth tokens in localStorage.
 * Keys are namespaced so multiple tabs of different tenants do not collide.
 */

const ACCESS_TOKEN_KEY = 'fw_access_token';
const REFRESH_TOKEN_KEY = 'fw_refresh_token';
const TENANT_SLUG_KEY = 'fw_tenant_slug';

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(accessToken: string, refreshToken: string, tenantSlug: string) {
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  localStorage.setItem(TENANT_SLUG_KEY, tenantSlug);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(TENANT_SLUG_KEY);
}

export function getTenantSlug(): string | null {
  return localStorage.getItem(TENANT_SLUG_KEY);
}
