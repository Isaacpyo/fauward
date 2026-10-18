const PLAN_FEATURES: Record<string, Record<string, boolean | number>> = {
  STARTER: {
    customDomain: false,
    whiteLabel: false,
    smsNotifications: false,
    crmModule: false,
    advancedDocuments: false,
    financeModule: false,
    financeReturns: false,
    financeCod: false,
    financeSettlementsReconciliation: false,
    accountingIntegration: false,
    apiAccess: false,
    webhooks: false,
    carrierIntegrations: false,
    multiBranch: false,
    sso: false,
    maxStaff: 3,
    maxShipmentsPm: 300,
    maxOrganisations: 10,
    apiRateLimit: 0,
    auditLog: false
  },
  PRO: {
    customDomain: true,
    whiteLabel: true,
    smsNotifications: true,
    crmModule: true,
    advancedDocuments: true,
    financeModule: true,
    financeReturns: true,
    financeCod: true,
    financeSettlementsReconciliation: false,
    accountingIntegration: true,
    apiAccess: true,
    webhooks: true,
    agent: true,
    carrierIntegrations: false,
    multiBranch: false,
    sso: false,
    maxStaff: 15,
    maxShipmentsPm: 2000,
    maxOrganisations: -1,
    apiRateLimit: 500,
    auditLog: false
  },
  ENTERPRISE: {
    customDomain: true,
    whiteLabel: true,
    smsNotifications: true,
    crmModule: true,
    advancedDocuments: true,
    financeModule: true,
    financeReturns: true,
    financeCod: true,
    financeSettlementsReconciliation: true,
    accountingIntegration: true,
    apiAccess: true,
    webhooks: true,
    agent: true,
    carrierIntegrations: true,
    multiBranch: true,
    sso: true,
    maxStaff: -1,
    maxShipmentsPm: -1,
    maxOrganisations: -1,
    apiRateLimit: 5000,
    auditLog: true
  }
};

/**
 * List prices Fauward charges per plan (major units, Decimal strings), matching the marketing pricing page. ENTERPRISE
 * has no list price: its revenue comes from a CustomContract. Revenue code reads prices only from here.
 */
export type PlanPrice = { currency: string; monthly: string; annual: string };
const PLAN_PRICES: Record<string, PlanPrice | null> = {
  STARTER: { currency: 'GBP', monthly: '29.00', annual: '288.00' },
  PRO: { currency: 'GBP', monthly: '79.00', annual: '780.00' },
  ENTERPRISE: null
};

export const planService = {
  /** List price for a plan, or null for plans without one (ENTERPRISE, TRIALING). */
  getPrice(plan: string): PlanPrice | null {
    return PLAN_PRICES[plan] ?? null;
  },
  hasFeature(plan: string, feature: string): boolean {
    return !!(PLAN_FEATURES[plan]?.[feature]);
  },
  getLimit(plan: string, limit: string): number {
    return (PLAN_FEATURES[plan]?.[limit] as number) ?? 0;
  },
  getFeatures(plan: string) {
    return PLAN_FEATURES[plan] ?? PLAN_FEATURES.STARTER;
  }
};
