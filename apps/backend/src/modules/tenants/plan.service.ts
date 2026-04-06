const PLAN_FEATURES: Record<string, Record<string, boolean | number>> = {
  STARTER: {
    customDomain: false,
    whiteLabel: false,
    smsNotifications: false,
    crmModule: false,
    advancedDocuments: false,
    financeModule: false,
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
    accountingIntegration: true,
    apiAccess: true,
    webhooks: true,
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
    accountingIntegration: true,
    apiAccess: true,
    webhooks: true,
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

export const planService = {
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
