import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { consoleApi } from "@/lib/console-api";

// platform.flags (WP-4.1): flag catalogue, native per-tenant overrides (LaunchDarkly mirror optional), flag audit,
// releases.

export type VendorStatus = { vendor: string; configured: boolean; missing: string[] };

export type Flag = {
  key: string;
  kind: "plan-feature" | "runtime";
  description: string | null;
  owner: string | null;
  plans: string[];
  activeOverrides: number;
  enabledOverrides: number;
  disabledOverrides: number;
};

export type MirrorStatus = { vendor: "launchdarkly"; status: "MIRRORED" | "FAILED" | "NOT_CONFIGURED"; error: string | null; at: string | null };

export type Actor = { id: string; email: string | null; name: string | null };

export type FlagOverride = {
  id: string;
  tenant: { id: string; name: string; slug: string };
  enabled: boolean;
  reason: string;
  expiresAt: string | null;
  createdAt: string;
  createdBy: Actor;
  revokedAt: string | null;
  revokedBy: Actor | null;
  active: boolean;
  mirror: MirrorStatus | null;
};

export type FlagDetail = { flag: Omit<Flag, "activeOverrides" | "enabledOverrides" | "disabledOverrides">; launchDarkly: VendorStatus; overrides: FlagOverride[] };

export type FlagAuditEntry = {
  id: string;
  action: string;
  actorEmail: string | null;
  actorId: string;
  tenant: { id: string; name: string | null; slug: string | null } | null;
  reason: string | null;
  metadata: unknown;
  createdAt: string;
};

export type Release = { id: number; tagName: string; name: string | null; publishedAt: string | null; url: string; draft: boolean; prerelease: boolean; body: string | null };

export type Releases = { source: "github" | "local"; backend: { version: string | null; commit: string | null }; releases: Release[]; github: VendorStatus | null };

const KEY = ["platform.flags"] as const;

export function useFlags() {
  return useQuery({ queryKey: [...KEY, "list"], queryFn: async () => (await consoleApi.get<{ data: Flag[]; launchDarkly: VendorStatus }>("/flags")).data });
}

export function useFlag(key: string) {
  return useQuery({ queryKey: [...KEY, "detail", key], queryFn: async () => (await consoleApi.get<FlagDetail>(`/flags/${encodeURIComponent(key)}`)).data, enabled: Boolean(key) });
}

export function useFlagAudit(key: string) {
  return useInfiniteQuery({
    queryKey: [...KEY, "audit", key],
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      (await consoleApi.get<{ data: FlagAuditEntry[]; nextCursor: string | null }>(`/flags/${encodeURIComponent(key)}/audit`, { params: { limit: 50, ...(pageParam ? { cursor: pageParam } : {}) } })).data,
    getNextPageParam: (last) => last.nextCursor
  });
}

export function useReleases() {
  return useQuery({ queryKey: [...KEY, "releases"], queryFn: async () => (await consoleApi.get<Releases>("/releases")).data });
}

export type CreateOverrideInput = { key: string; tenantId: string; enabled: boolean; expiresAt: string | null; reason: string };

export function useCreateOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, ...body }: CreateOverrideInput) =>
      (await consoleApi.post<{ override: { id: string }; mirror: MirrorStatus }>(`/flags/${encodeURIComponent(key)}/overrides`, body, { idempotent: true })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY })
  });
}

export function useRevokeOverride() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, id, reason }: { key: string; id: string; reason: string }) =>
      (await consoleApi.delete<{ override: { id: string }; mirror: MirrorStatus }>(`/flags/${encodeURIComponent(key)}/overrides/${encodeURIComponent(id)}`, { data: { reason }, idempotent: true })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY })
  });
}

export function mirrorLabel(mirror: MirrorStatus | null) {
  if (!mirror || mirror.status === "NOT_CONFIGURED") return "Native only";
  return mirror.status === "MIRRORED" ? "Mirrored to LaunchDarkly" : "LaunchDarkly mirror failed";
}
