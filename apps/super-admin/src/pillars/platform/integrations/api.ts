import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { consoleApi } from "@/lib/console-api";
import type { Secret } from "@/pillars/trust/secrets/api";

// platform.integrations (WP-4.3): provider health from the 5-minute poll, provider detail, manual check, tenant
// gateways (WP-2.12), credentials (secret inventory, WP-4.12). Webhook failures are in WebhookFailuresPage (WP-2.13).

export type ProviderStatus = "NOT_CONFIGURED" | "OK" | "DEGRADED" | "DOWN";

export type Provider = {
  provider: string;
  name: string;
  check: string;
  configured: boolean;
  missingEnv: string[];
  status: ProviderStatus;
  polled: boolean;
  lastSuccessfulAt: string | null;
  checkedAt: string | null;
  errorRate24h: number | null;
  errorRateSource: string | null;
  lastError: { at: string; message: string } | null;
};

export type HistoryEntry = { at: string; status: ProviderStatus; latencyMs: number; error: string | null; errorRate24h: number | null };

export type ProviderDetail = Provider & { envNames: string[]; history: HistoryEntry[]; recentErrors: HistoryEntry[]; lastWebhookVerification: { verifiedAt?: string } | null };

export type TenantGateway = {
  id: string;
  tenant: { id: string; name: string; slug: string };
  provider: string;
  mode: string;
  enabled: boolean;
  status: string;
  secretConfigured: boolean;
  lastVerifiedAt: string | null;
  lastError: string | null;
  updatedAt: string;
};

const KEY = ["platform.integrations"] as const;

export function useIntegrations() {
  return useQuery({ queryKey: [...KEY, "list"], queryFn: async () => (await consoleApi.get<{ data: Provider[]; pollEveryMinutes: number }>("/integrations")).data, refetchInterval: 60_000 });
}

export function useProvider(key: string) {
  return useQuery({ queryKey: [...KEY, "provider", key], queryFn: async () => (await consoleApi.get<ProviderDetail>(`/integrations/${encodeURIComponent(key)}`)).data, enabled: Boolean(key) });
}

export function useCheckProvider(key: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => (await consoleApi.post<ProviderDetail>(`/integrations/${encodeURIComponent(key)}/check`, {}, { idempotent: true })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY })
  });
}

export function useTenantGateways(status: string) {
  return useQuery({
    queryKey: [...KEY, "tenant-gateways", status],
    queryFn: async () => (await consoleApi.get<{ data: TenantGateway[] }>("/integrations/tenant-gateways", { params: status ? { status } : {} })).data.data
  });
}

export function useIntegrationCredentials() {
  return useQuery({
    queryKey: [...KEY, "credentials"],
    queryFn: async () => (await consoleApi.get<{ data: Secret[]; total: number; lastInventoryRun: { status: string; startedAt: string } | null }>("/integrations/credentials")).data
  });
}
