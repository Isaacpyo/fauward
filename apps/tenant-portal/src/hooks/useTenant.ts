import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { getDevTestSession, getDevTestSessionSnapshot } from "@/lib/auth";
import { useAppStore } from "@/stores/useAppStore";
import { useTenantStore } from "@/stores/useTenantStore";
import { applyTenantConfig } from "@/theme/tenant";
import type { TenantConfig } from "@/types/domain";

const fallbackTenant: TenantConfig = {
  tenant_id: "tenant_demo",
  name: "Fauward Demo Tenant",
  logo_url: "",
  domain: "demo.fauward.com",
  primary_color: "#0D1F3C",
  accent_color: "#D97706",
  locale: "en-GB",
  rtl: false,
  currency: "GBP",
  timezone: "Europe/London",
  onboarding_complete: false,
  support_email: "support@fauward.com",
  support_phone: "+44 20 7946 0000"
};

async function fetchTenantConfig(): Promise<TenantConfig> {
  const response = await api.get<TenantConfig>("/tenant/config");
  const data = response.data as unknown;
  if (
    typeof data !== "object" ||
    data === null ||
    typeof (data as TenantConfig).tenant_id !== "string" ||
    typeof (data as TenantConfig).primary_color !== "string"
  ) {
    throw new Error("Invalid tenant config payload");
  }
  return data as TenantConfig;
}

export function useTenant() {
  const setTenant = useTenantStore((state) => state.setTenant);
  const setAppTenant = useAppStore((state) => state.setTenant);
  const tenant = useTenantStore((state) => state.tenant);
  const devSessionSnapshot = getDevTestSessionSnapshot();
  const devSession = useMemo(() => getDevTestSession(), [devSessionSnapshot]);

  const query = useQuery({
    queryKey: ["tenant-config"],
    queryFn: fetchTenantConfig,
    staleTime: 5 * 60_000,
    retry: 2
  });

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
      return;
    }

    if (query.isError && !tenant && !devSession?.tenant) {
      setTenant(fallbackTenant);
      setAppTenant(fallbackTenant);
      applyTenantConfig(fallbackTenant);
    }
  }, [devSession, query.data, query.isError, setAppTenant, setTenant, tenant]);

  useEffect(() => {
    if (!query.isLoading || query.data || tenant || devSession?.tenant) {
      return;
    }

    const timer = window.setTimeout(() => {
      setTenant(fallbackTenant);
      setAppTenant(fallbackTenant);
      applyTenantConfig(fallbackTenant);
    }, 1500);

    return () => window.clearTimeout(timer);
  }, [devSession, query.data, query.isLoading, setAppTenant, setTenant, tenant]);

  return { ...query, tenant: query.data ?? tenant ?? devSession?.tenant ?? null };
}
