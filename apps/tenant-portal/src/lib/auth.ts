/**
 * Thin helpers for storing and clearing auth tokens in localStorage.
 * Keys are namespaced so multiple tabs of different tenants do not collide.
 */

import type { TenantConfig, User } from "@/types/domain";

const ACCESS_TOKEN_KEY = 'fw_access_token';
const REFRESH_TOKEN_KEY = 'fw_refresh_token';
const TENANT_SLUG_KEY = 'fw_tenant_slug';
const DEV_TEST_SESSION_KEY = 'fw_dev_test_session';

const DEV_TEST_CREDENTIALS = {
  email: 'admin@fauward.com',
  password: '12345678A'
};

const DEV_TEST_SESSION = {
  user: {
    id: 'dev-admin-user',
    full_name: 'Fauward Admin',
    email: DEV_TEST_CREDENTIALS.email,
    role: 'TENANT_ADMIN',
    plan: 'pro'
  } satisfies User,
  tenant: {
    tenant_id: 'tenant_dev',
    name: 'Fauward Demo Tenant',
    logo_url: '',
    domain: 'demo.fauward.com',
    primary_color: '#0D1F3C',
    accent_color: '#D97706',
    locale: 'en-GB',
    rtl: false,
    currency: 'GBP',
    timezone: 'Europe/London',
    onboarding_complete: true,
    support_email: 'support@fauward.com',
    support_phone: '+44 20 7946 0000'
  } satisfies TenantConfig
};

type DevTestSession = typeof DEV_TEST_SESSION;

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
  localStorage.removeItem(DEV_TEST_SESSION_KEY);
}

export function getTenantSlug(): string | null {
  return localStorage.getItem(TENANT_SLUG_KEY);
}

export function matchesDevTestLogin(email: string, password: string) {
  return (
    import.meta.env.DEV &&
    email.trim().toLowerCase() === DEV_TEST_CREDENTIALS.email &&
    password === DEV_TEST_CREDENTIALS.password
  );
}

export function createDevTestSession(): DevTestSession {
  localStorage.setItem(DEV_TEST_SESSION_KEY, JSON.stringify(DEV_TEST_SESSION));
  return DEV_TEST_SESSION;
}

export function getDevTestSession(): DevTestSession | null {
  const raw = localStorage.getItem(DEV_TEST_SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<DevTestSession>;
    if (!parsed.user || !parsed.tenant) {
      return null;
    }
    return parsed as DevTestSession;
  } catch {
    return null;
  }
}

export function hasDevTestSession() {
  return Boolean(getDevTestSession());
}

export function getDevTestSessionSnapshot(): string | null {
  return localStorage.getItem(DEV_TEST_SESSION_KEY);
}
