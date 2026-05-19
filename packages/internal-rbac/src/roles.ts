import { PERMISSIONS, READ_ONLY_PERMISSIONS, type Permission } from './permissions.js';

export enum Role {
  PLATFORM_ENGINEER = 'PLATFORM_ENGINEER',
  SRE = 'SRE',
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',
  FINANCE_ANALYST = 'FINANCE_ANALYST',
  FINANCE_ADMIN = 'FINANCE_ADMIN',
  REVOPS = 'REVOPS',
  SUPPORT_AGENT = 'SUPPORT_AGENT',
  SUPPORT_LEAD = 'SUPPORT_LEAD',
  CSM = 'CSM',
  CS_DIRECTOR = 'CS_DIRECTOR',
  TRUST_ANALYST = 'TRUST_ANALYST',
  LEGAL_COUNSEL = 'LEGAL_COUNSEL',
  SECURITY_ENGINEER = 'SECURITY_ENGINEER',
  COMPLIANCE_ADMIN = 'COMPLIANCE_ADMIN',
  SALES_REP = 'SALES_REP',
  SALES_MANAGER = 'SALES_MANAGER',
  SALES_DIRECTOR = 'SALES_DIRECTOR',
  CFO = 'CFO',
  MARKETING_OPS = 'MARKETING_OPS',
  PARTNER_OPS = 'PARTNER_OPS',
  EXECUTIVE = 'EXECUTIVE',
  ROOT = 'ROOT'
}

const platformRead: Permission[] = [
  'platform.tenants.read',
  'platform.flags.read',
  'platform.queues.read',
  'platform.incidents.read',
  'platform.health.read',
  'platform.jobs.read',
  'platform.integrations.read',
  'platform.database.read'
];

const platformWrite: Permission[] = [
  ...platformRead,
  'platform.tenants.write',
  'platform.tenants.suspend',
  'platform.impersonation.start',
  'platform.impersonation.mutate',
  'platform.flags.write',
  'platform.queues.replay',
  'platform.incidents.write',
  'platform.jobs.trigger',
  'platform.integrations.write'
];

const revenueRead: Permission[] = [
  'revenue.invoices.read',
  'revenue.dunning.read',
  'revenue.subscriptions.read',
  'revenue.disputes.read',
  'revenue.tax.read',
  'revenue.recognition.read',
  'revenue.commissions.read',
  'revenue.analytics.read'
];

const revenueWrite: Permission[] = [
  ...revenueRead,
  'revenue.invoices.write',
  'revenue.invoices.refund',
  'revenue.dunning.write',
  'revenue.subscriptions.write',
  'revenue.disputes.write',
  'revenue.tax.write',
  'revenue.recognition.write'
];

const customerRead: Permission[] = [
  'customer.support.read',
  'customer.360.read',
  'customer.success.read',
  'customer.feedback.read',
  'customer.kb.read',
  'customer.comms.read',
  'customer.qbr.read',
  'customer.onboarding.read'
];

const customerWrite: Permission[] = [
  ...customerRead,
  'customer.support.write',
  'customer.success.write',
  'customer.feedback.write',
  'customer.kb.write',
  'customer.comms.send',
  'customer.qbr.write'
];

const trustRead: Permission[] = [
  'trust.iam.read',
  'trust.audit.read',
  'trust.compliance.dsar.read',
  'trust.compliance.legal-hold.read',
  'trust.safety.read',
  'trust.kyc.read',
  'trust.secrets.read',
  'trust.security.read'
];

const trustWrite: Permission[] = [
  ...trustRead,
  'trust.iam.write',
  'trust.jit.request',
  'trust.jit.approve',
  'trust.audit.export',
  'trust.compliance.dsar.write',
  'trust.compliance.legal-hold.write',
  'trust.safety.suspend',
  'trust.kyc.approve',
  'trust.secrets.write',
  'trust.security.write'
];

const gtmRead: Permission[] = [
  'gtm.pipeline.read',
  'gtm.trials.read',
  'gtm.demos.read',
  'gtm.contracts.read',
  'gtm.partners.read',
  'gtm.attribution.read',
  'gtm.pricing.read',
  'gtm.handoff.read'
];

const gtmWrite: Permission[] = [
  ...gtmRead,
  'gtm.pipeline.write',
  'gtm.trials.extend',
  'gtm.demos.write',
  'gtm.contracts.write',
  'gtm.partners.write',
  'gtm.pricing.write',
  'gtm.handoff.write'
];

function unique(permissions: Permission[]): Permission[] {
  return Array.from(new Set(permissions));
}

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  [Role.PLATFORM_ENGINEER]: unique([...platformWrite, 'trust.security.read']),
  [Role.SRE]: unique([...platformWrite, 'trust.security.read', 'trust.audit.read']),
  [Role.PLATFORM_ADMIN]: unique([...platformWrite, 'platform.tenants.delete', 'trust.audit.read']),
  [Role.FINANCE_ANALYST]: unique([...revenueRead, 'platform.health.read', 'platform.queues.read']),
  [Role.FINANCE_ADMIN]: unique([...revenueWrite, 'revenue.invoices.refund.large', 'revenue.subscriptions.override', 'revenue.commissions.payout', 'platform.health.read', 'platform.queues.read']),
  [Role.REVOPS]: unique([...revenueWrite, 'revenue.subscriptions.override', 'revenue.analytics.read', ...gtmRead]),
  [Role.SUPPORT_AGENT]: unique(['platform.tenants.read', 'platform.impersonation.start', ...customerRead, 'customer.support.write', 'customer.comms.send']),
  [Role.SUPPORT_LEAD]: unique(['platform.tenants.read', 'platform.impersonation.start', ...customerWrite]),
  [Role.CSM]: unique(['platform.tenants.read', ...customerRead, 'customer.success.write', 'customer.qbr.write', 'customer.onboarding.read']),
  [Role.CS_DIRECTOR]: unique(['platform.tenants.read', ...customerWrite, 'revenue.analytics.read']),
  [Role.TRUST_ANALYST]: unique([...trustRead, 'trust.jit.request', 'trust.safety.suspend']),
  [Role.LEGAL_COUNSEL]: unique(['trust.audit.read', 'trust.audit.export', 'trust.compliance.dsar.read', 'trust.compliance.legal-hold.read', 'trust.compliance.legal-hold.write']),
  [Role.SECURITY_ENGINEER]: unique([...trustRead, 'trust.secrets.write', 'trust.security.write', 'trust.jit.request', 'trust.jit.approve', 'platform.health.read', 'platform.integrations.read']),
  [Role.COMPLIANCE_ADMIN]: unique([...trustWrite, 'trust.iam.write']),
  [Role.SALES_REP]: unique(['gtm.pipeline.read', 'gtm.pipeline.write', 'gtm.trials.read', 'gtm.trials.extend', 'gtm.demos.read', 'gtm.demos.write', 'gtm.contracts.read']),
  [Role.SALES_MANAGER]: unique([...gtmWrite, 'gtm.contracts.discount.large']),
  [Role.SALES_DIRECTOR]: unique([...gtmWrite, 'revenue.subscriptions.read']),
  [Role.CFO]: unique(['revenue.subscriptions.read', 'revenue.subscriptions.override', 'revenue.commissions.read', 'revenue.commissions.payout', 'gtm.contracts.read', 'gtm.contracts.discount.large']),
  [Role.MARKETING_OPS]: unique(['gtm.attribution.read', 'gtm.pricing.read', 'gtm.pricing.write', 'gtm.trials.read', 'gtm.handoff.read', 'gtm.handoff.write']),
  [Role.PARTNER_OPS]: unique(['gtm.partners.read', 'gtm.partners.write', 'gtm.pipeline.read', 'gtm.contracts.read', 'gtm.handoff.read', 'gtm.handoff.write']),
  [Role.EXECUTIVE]: unique(READ_ONLY_PERMISSIONS),
  [Role.ROOT]: [...PERMISSIONS]
};

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function permissionsForRoles(roles: readonly Role[]): Permission[] {
  return unique(roles.flatMap((role) => ROLE_PERMISSIONS[role] ?? []));
}
