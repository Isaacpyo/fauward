import { useQuery } from "@tanstack/react-query";

import { consoleApi } from "./console-api";

export type MeResponse = {
  user: { id: string; email: string; name: string | null; role: string | null; permissions: string[]; mfaEnabled: boolean; mfaVerifiedAt: string | null };
  mfa: { enabled: boolean; verifiedAt: string | null; pending: boolean };
  roles: string[];
  permissions: string[];
  jit: Array<{ permission: string; expiresAt: string | null }>;
};

export const ME_QUERY_KEY = ["console", "auth", "me"] as const;

/** Effective session (permissions ∪ JIT), refreshed on focus, every 60 s and after IAM/JIT mutations (D2). */
export function useMe(enabled = true) {
  return useQuery({
    queryKey: ME_QUERY_KEY,
    queryFn: async () => (await consoleApi.get<MeResponse>("/auth/me", { skipAuthRedirect: true })).data,
    enabled,
    retry: false,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000
  });
}
