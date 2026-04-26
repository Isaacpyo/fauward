/**
 * Thin helpers for storing and clearing auth tokens in localStorage.
 * Keys are namespaced so multiple tabs of different tenants do not collide.
 */

import type { TenantConfig, User } from "@/types/domain";

const ACCESS_TOKEN_KEY = 'fw_access_token';
const REFRESH_TOKEN_KEY = 'fw_refresh_token';
const TENANT_SLUG_KEY = 'fw_tenant_slug';
const DEV_TEST_SESSION_KEY = 'fw_dev_test_session';

const DEV_TEST_PASSWORD = 'Oluwaseun44!';

const DEV_TEST_ACCOUNTS: Record<string, { fullName: string; tenantName: string; slug: string; plan: User['plan'] }> = {
  'temitopeagbola@gmail.com': {
    fullName: 'Temitope Agbola',
    tenantName: 'Temitope Logistics',
    slug: 'temitope',
    plan: 'starter'
  },
  'trenylimited@gmail.com': {
    fullName: 'Treny Limited',
    tenantName: 'Treny Limited',
    slug: 'treny-limited',
    plan: 'pro'
  },
  'fauward@gmail.com': {
    fullName: 'Fauward Admin',
    tenantName: 'Fauward Enterprise',
    slug: 'fauward-enterprise',
    plan: 'enterprise'
  }
};

type DevTestSession = {
  user: User;
  tenant: TenantConfig;
};

function normalizeDevEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (normalized === 'temitopeagbola@gmail') {
    return 'temitopeagbola@gmail.com';
  }
  return normalized;
}

function getDevTestAccount(email: string) {
  return DEV_TEST_ACCOUNTS[normalizeDevEmail(email)];
}

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
    Boolean(getDevTestAccount(email)) &&
    password === DEV_TEST_PASSWORD
  );
}

export function isDevTestEmail(email: string) {
  return import.meta.env.DEV && Boolean(getDevTestAccount(email));
}

export function createDevTestSession(email: string): DevTestSession {
  const normalizedEmail = normalizeDevEmail(email);
  const account = getDevTestAccount(normalizedEmail) ?? DEV_TEST_ACCOUNTS['fauward@gmail.com'];
  const session: DevTestSession = {
    user: {
      id: `dev-admin-${account.slug}`,
      full_name: account.fullName,
      email: normalizedEmail,
      role: 'TENANT_ADMIN',
      plan: account.plan
    },
    tenant: {
      tenant_id: `tenant_${account.slug}`,
      name: account.tenantName,
      logo_url: '',
      domain: `${account.slug}.fauward.com`,
      region: account.plan === 'starter' ? 'africa' : account.plan === 'pro' ? 'africa' : 'europe',
      primary_color: '#0D1F3C',
      accent_color: '#D97706',
      locale: 'en-GB',
      rtl: false,
      currency: 'GBP',
      timezone: 'Europe/London',
      onboarding_complete: true,
      support_email: 'support@fauward.com',
      support_phone: '+44 20 7946 0000'
    }
  };

  localStorage.setItem(DEV_TEST_SESSION_KEY, JSON.stringify(session));
  return session;
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

export function updateDevTestSessionProfile(profile: { firstName: string; lastName: string; phone?: string }) {
  const session = getDevTestSession();
  if (!session) return null;

  const fullName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || session.user.full_name;
  const updatedSession: DevTestSession = {
    ...session,
    user: {
      ...session.user,
      full_name: fullName
    }
  };

  localStorage.setItem(DEV_TEST_SESSION_KEY, JSON.stringify(updatedSession));
  return updatedSession;
}

export function hasDevTestSession() {
  return Boolean(getDevTestSession());
}

export function getDevTestSessionSnapshot(): string | null {
  return localStorage.getItem(DEV_TEST_SESSION_KEY);
}
