import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { api, ENTITLEMENTS_STALE_EVENT } from "@/lib/api";
import { getAccessToken, getDevTestSession, getDevTestSessionSnapshot, getTenantSlug } from "@/lib/auth";
import { resolvePathTenantSlug } from "@/lib/tenantResolver";
import { useAppStore } from "@/stores/useAppStore";
import { useTenantStore } from "@/stores/useTenantStore";
import { applyTenantConfig } from "@/theme/tenant";
import type { TenantConfig } from "@/types/domain";

async function fetchTenantConfig(): Promise<TenantConfig> {
  const response = await api.get<TenantConfig | Record<string, unknown>>("/v1/tenant/me");
  const data = response.data as unknown;
  const normalized = normalizeTenantConfig(data);
  if (
    typeof normalized.tenant_id !== "string" ||
    typeof normalized.primary_color !== "string"
  ) {
    throw new Error("Invalid tenant config payload");
  }
  return normalized;
}

function normalizeTenantConfig(data: unknown): TenantConfig {
  if (typeof data !== "object" || data === null) {
    throw new Error("Invalid tenant config payload");
  }

  const raw = data as Partial<TenantConfig> & {
    id?: string;
    slug?: string;
    customDomain?: string | null;
    logoUrl?: string | null;
    primaryColor?: string;
    accentColor?: string;
    displayName?: string;
    brandName?: string | null;
    trackingHeadline?: string | null;
    branding?: {
      primary?: string;
      accent?: string;
      logoUrl?: string | null;
    };
    defaultCurrency?: string;
    plan?: string;
    defaultLanguage?: string;
    isRtl?: boolean;
    timezone?: string;
    status?: string;
    suspensionReason?: string | null;
    suspendedAt?: string | null;
    onboardingCompletedAt?: string | null;
    featureFlags?: Record<string, boolean>;
    settings?: {
      currency?: string | null;
      timezone?: string | null;
      notificationEmail?: string | null;
    } | null;
  };

  if (raw.tenant_id && raw.primary_color) {
    return raw as TenantConfig;
  }

  return {
    tenant_id: raw.id ?? "tenant_unknown",
    name: raw.displayName ?? raw.name ?? "Tenant",
    slug: raw.slug,
    logo_url: raw.branding?.logoUrl ?? raw.logoUrl ?? "",
    domain: raw.customDomain ?? (raw.slug ? `${raw.slug}.fauward.com` : ""),
    region: raw.region,
    primary_color: raw.branding?.primary ?? raw.primaryColor ?? "#0D1F3C",
    accent_color: raw.branding?.accent ?? raw.accentColor ?? "#D97706",
    locale: raw.defaultLanguage ?? "en-GB",
    rtl: raw.isRtl ?? false,
    currency: raw.settings?.currency ?? raw.defaultCurrency ?? "GBP",
    timezone: raw.settings?.timezone ?? raw.timezone ?? "Europe/London",
    plan: raw.plan,
    status: raw.status,
    suspensionReason: raw.suspensionReason ?? null,
    suspendedAt: raw.suspendedAt ?? null,
    featureFlags: raw.featureFlags ?? {},
    // Trust the backend's explicit completion timestamp. Billing status
    // (TRIALING vs ACTIVE) is unrelated to whether the operator has set
    // up their workspace — treating them as equivalent traps every new
    // tenant in /onboarding even after they've finished the wizard.
    onboarding_complete: raw.onboardingCompletedAt != null || raw.status === "ACTIVE",
    support_email: raw.settings?.notificationEmail ?? "support@fauward.com",
    brand_name: raw.brandName ?? null,
    tracking_headline: raw.trackingHeadline ?? null
  };
}

export function useTenant() {
  const setTenant = useTenantStore((state) => state.setTenant);
  const setAppTenant = useAppStore((state) => state.setTenant);
  const tenant = useTenantStore((state) => state.tenant);
  // Subscribe to the auth-store user so this hook re-runs the moment login
  // completes. Without this, getAccessToken() is evaluated once at App mount
  // (before the user logs in), the tenant-config query stays disabled, and
  // the tenant store never populates until the user does a hard refresh.
  const authUser = useAppStore((state) => state.user);
  const devSessionSnapshot = getDevTestSessionSnapshot();
  const devSession = useMemo(() => getDevTestSession(), [devSessionSnapshot]);
  const hasToken = Boolean(authUser) || Boolean(getAccessToken());
  const tenantSlug = resolvePathTenantSlug() ?? getTenantSlug();

  const query = useQuery({
    queryKey: ["tenant-config", tenantSlug],
    queryFn: fetchTenantConfig,
    // Plan overrides and feature overrides reach the UI within a minute, on focus, or at once when the backend refuses
    // a feature (ENTITLEMENTS_STALE_EVENT) — WP-1.4/L12.
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    retry: 2,
    enabled: hasToken && !devSession
  });

  const { refetch } = query;
  useEffect(() => {
    const reload = () => void refetch();
    window.addEventListener(ENTITLEMENTS_STALE_EVENT, reload);
    return () => window.removeEventListener(ENTITLEMENTS_STALE_EVENT, reload);
  }, [refetch]);

  useEffect(() => {
    if (devSession?.tenant && !tenant) {
      setTenant(devSession.tenant);
      setAppTenant(devSession.tenant);
      applyTenantConfig(devSession.tenant);
    }
  }, [devSession, setAppTenant, setTenant, tenant]);

  useEffect(() => {
    if (query.data) {
      const resolvedTenant =
        tenant?.onboarding_complete && query.data.onboarding_complete === false
          ? {
              ...query.data,
              onboarding_complete: true,
              name: tenant.name || query.data.name,
              logo_url: tenant.logo_url || query.data.logo_url,
              primary_color: tenant.primary_color || query.data.primary_color,
              accent_color: tenant.accent_color || query.data.accent_color
            }
          : query.data;

      setTenant(resolvedTenant);
      setAppTenant(resolvedTenant);
      applyTenantConfig(resolvedTenant);
    }
  }, [query.data, setAppTenant, setTenant, tenant]);

  // A failed tenant fetch is surfaced (App renders an error with Retry); no stand-in workspace is ever shown.
  return { ...query, tenant: query.data ?? tenant ?? devSession?.tenant ?? null };
}
