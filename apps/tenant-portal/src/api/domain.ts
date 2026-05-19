import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

export type DomainStatus = "NONE" | "PENDING_DNS" | "VERIFYING" | "ACTIVE" | "FAILED";

export type DomainInstructions = {
  type: string;
  name: string;
  host: string;
  value: string;
  ttl: number;
  reason?: string;
};

export type DomainStatusResponse = {
  status: DomainStatus;
  domain: string | null;
  instructions: DomainInstructions | null;
  records?: DomainInstructions[];
  error: string | null;
  verifiedAt: string | null;
  lastCheckAt: string | null;
};

export function useDomainStatus() {
  return useQuery({
    queryKey: ["tenant", "domain", "status"],
    queryFn: async () => {
      const response = await api.get<DomainStatusResponse>("/v1/tenant/domain/status");
      return response.data;
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "PENDING_DNS" || status === "VERIFYING" ? 10_000 : false;
    }
  });
}

export function useSetDomain() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (domain: string) => {
      await api.patch("/v1/tenant/domain", { domain });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tenant", "domain"] })
  });
}

export function useRemoveDomain() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.delete("/v1/tenant/domain");
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tenant", "domain"] })
  });
}
