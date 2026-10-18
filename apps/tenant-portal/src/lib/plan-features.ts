import type { User } from "@/types/domain";

export type Plan = User["plan"];

export type FeatureKey =
  | "dashboard"
  | "shipments"
  | "fauwardGo"
  | "routes"
  | "dispatch"
  | "crm"
  | "finance"
  | "analytics"
  | "activity"
  | "messaging"
  | "returns"
  | "support"
  | "reports"
  | "liveMap"
  | "fleet"
  | "pricing"
  | "team"
  | "settings"
  | "agent"
  | "automation"
  | "advancedPricing"
  | "apiAccess"
  | "webhooks"
  | "customDomain"
  | "auditLogs"
  | "sso"
  | "customEmailDomain"
  | "financeReturns"
  | "financeCod"
  | "financeSettlementsReconciliation";

export const planOrder: Record<Plan, number> = {
  starter: 0,
  pro: 1,
  enterprise: 2
};

export const featureMinimumPlan: Record<FeatureKey, Plan> = {
  dashboard: "starter",
  shipments: "starter",
  fauwardGo: "starter",
  routes: "starter",
  dispatch: "starter",
  crm: "starter",
  finance: "starter",
  activity: "starter",
  messaging: "pro",
  returns: "starter",
  support: "starter",
  liveMap: "starter",
  pricing: "starter",
  team: "starter",
  settings: "starter",
  analytics: "pro",
  reports: "pro",
  fleet: "pro",
  agent: "pro",
  automation: "pro",
  advancedPricing: "pro",
  apiAccess: "pro",
  webhooks: "pro",
  customDomain: "pro",
  auditLogs: "enterprise",
  sso: "enterprise",
  customEmailDomain: "enterprise",
  financeReturns: "pro",
  financeCod: "pro",
  financeSettlementsReconciliation: "enterprise"
};

export function normalizePlan(plan: string | undefined | null): Plan {
  const normalized = plan?.toLowerCase();
  if (normalized === "enterprise" || normalized === "pro" || normalized === "starter") {
    return normalized;
  }
  return "starter";
}

export function hasPlanAccess(currentPlan: string | undefined | null, minimumPlan: Plan) {
  const plan = normalizePlan(currentPlan);
  return planOrder[plan] >= planOrder[minimumPlan];
}

export function hasFeatureAccess(currentPlan: string | undefined | null, feature: FeatureKey) {
  return hasPlanAccess(currentPlan, featureMinimumPlan[feature]);
}

/**
 * Portal features that the backend gates with `requireFeature` (WP-1.4). For these the server's entitlements decide —
 * including per-tenant feature overrides; the minimum-plan table above is only the fallback for UI-only features.
 */
export const BACKEND_FEATURE_KEY: Partial<Record<FeatureKey, string>> = {
  agent: "agent",
  apiAccess: "apiAccess",
  webhooks: "webhooks",
  customDomain: "customDomain",
  auditLogs: "auditLog",
  sso: "sso",
  financeReturns: "financeReturns",
  financeCod: "financeCod",
  financeSettlementsReconciliation: "financeSettlementsReconciliation"
};

export type EntitlementFeatures = Record<string, { enabled: boolean; source: "plan" | "override" }>;

/** Access from the tenant's live entitlements: backend feature keys use the server's answer, others the effective plan. */
export function hasEntitledFeature(features: EntitlementFeatures | null | undefined, effectivePlan: string | undefined | null, feature: FeatureKey) {
  const backendKey = BACKEND_FEATURE_KEY[feature];
  if (backendKey && features && features[backendKey]) return features[backendKey].enabled;
  return hasFeatureAccess(effectivePlan, feature);
}

export function getFeatureMinimumPlan(feature: FeatureKey) {
  return featureMinimumPlan[feature];
}

export function formatPlanLabel(plan: Plan) {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}
