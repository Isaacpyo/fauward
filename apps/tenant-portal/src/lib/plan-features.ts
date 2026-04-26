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
  | "customEmailDomain";

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
  customEmailDomain: "enterprise"
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

export function getFeatureMinimumPlan(feature: FeatureKey) {
  return featureMinimumPlan[feature];
}

export function formatPlanLabel(plan: Plan) {
  return plan.charAt(0).toUpperCase() + plan.slice(1);
}
