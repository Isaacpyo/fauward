import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { hasEntitledFeature, hasPlanAccess, normalizePlan, type EntitlementFeatures, type FeatureKey, type Plan } from "@/lib/plan-features";
import { useAppStore } from "@/stores/useAppStore";

export type TenantEntitlements = {
  tenantId: string;
  billingPlan: string;
  effectivePlan: string;
  planOverride: { id: string; plan: string; reason: string; expiresAt: string | null } | null;
  features: EntitlementFeatures;
  limits: { maxStaff: number; maxShipmentsPm: number; maxOrganisations: number; apiRateLimit: number };
  computedAt: string;
  changesAt: string | null;
};

export const ENTITLEMENTS_QUERY_KEY = ["tenant", "me", "entitlements"] as const;

/** What this workspace may use right now (GET /tenants/me/entitlements). Refreshed every minute and on focus, so a plan or
 * feature override made by Fauward shows up without signing out (WP-1.4). */
export function useEntitlements() {
  const user = useAppStore((state) => state.user);
  return useQuery({
    queryKey: ENTITLEMENTS_QUERY_KEY,
    queryFn: async () => (await api.get<TenantEntitlements>("/v1/tenants/me/entitlements")).data,
    enabled: Boolean(user),
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 30_000
  });
}

/** Plan and feature checks for gating UI. Uses the live entitlements; falls back to the signed-in user's plan until they load. */
export function useFeatureAccess() {
  const user = useAppStore((state) => state.user);
  const { data } = useEntitlements();
  const plan: Plan = normalizePlan(data?.effectivePlan ?? user?.plan);
  return {
    plan,
    entitlements: data ?? null,
    hasFeature: (feature: FeatureKey) => hasEntitledFeature(data?.features, plan, feature),
    hasPlan: (minimumPlan: Plan) => hasPlanAccess(plan, minimumPlan)
  };
}
