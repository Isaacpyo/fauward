export type Permission =
  | 'platform.tenants.read' | 'platform.tenants.write'
  | 'platform.tenants.suspend' | 'platform.tenants.delete'
  | 'platform.impersonation.start' | 'platform.impersonation.mutate'
  | 'platform.flags.read' | 'platform.flags.write'
  | 'platform.queues.read' | 'platform.queues.replay'
  | 'platform.incidents.read' | 'platform.incidents.write'
  | 'platform.health.read'
  | 'platform.jobs.read' | 'platform.jobs.trigger'
  | 'platform.integrations.read' | 'platform.integrations.write'
  | 'platform.database.read'
  | 'revenue.invoices.read' | 'revenue.invoices.write'
  | 'revenue.invoices.refund' | 'revenue.invoices.refund.large'
  | 'revenue.dunning.read' | 'revenue.dunning.write'
  | 'revenue.subscriptions.read' | 'revenue.subscriptions.write'
  | 'revenue.subscriptions.override'
  | 'revenue.disputes.read' | 'revenue.disputes.write'
  | 'revenue.tax.read' | 'revenue.tax.write'
  | 'revenue.recognition.read' | 'revenue.recognition.write'
  | 'revenue.commissions.read' | 'revenue.commissions.payout'
  | 'revenue.analytics.read'
  | 'customer.support.read' | 'customer.support.write'
  | 'customer.360.read'
  | 'customer.success.read' | 'customer.success.write'
  | 'customer.feedback.read' | 'customer.feedback.write'
  | 'customer.kb.read' | 'customer.kb.write'
  | 'customer.comms.read' | 'customer.comms.send'
  | 'customer.qbr.read' | 'customer.qbr.write'
  | 'customer.onboarding.read'
  | 'trust.iam.read' | 'trust.iam.write' | 'trust.iam.root'
  | 'trust.jit.request' | 'trust.jit.approve'
  | 'trust.audit.read' | 'trust.audit.export'
  | 'trust.compliance.dsar.read' | 'trust.compliance.dsar.write'
  | 'trust.compliance.legal-hold.read' | 'trust.compliance.legal-hold.write'
  | 'trust.safety.read' | 'trust.safety.suspend'
  | 'trust.kyc.read' | 'trust.kyc.approve'
  | 'trust.secrets.read'
  | 'trust.security.read' | 'trust.security.write'
  | 'gtm.pipeline.read' | 'gtm.pipeline.write'
  | 'gtm.trials.read' | 'gtm.trials.extend'
  | 'gtm.demos.read' | 'gtm.demos.write'
  | 'gtm.contracts.read' | 'gtm.contracts.write'
  | 'gtm.contracts.discount.large'
  | 'gtm.partners.read' | 'gtm.partners.write'
  | 'gtm.attribution.read'
  | 'gtm.pricing.read' | 'gtm.pricing.write'
  | 'gtm.handoff.read' | 'gtm.handoff.write';

export const PERMISSIONS = [
  'platform.tenants.read',
  'platform.tenants.write',
  'platform.tenants.suspend',
  'platform.tenants.delete',
  'platform.impersonation.start',
  'platform.impersonation.mutate',
  'platform.flags.read',
  'platform.flags.write',
  'platform.queues.read',
  'platform.queues.replay',
  'platform.incidents.read',
  'platform.incidents.write',
  'platform.health.read',
  'platform.jobs.read',
  'platform.jobs.trigger',
  'platform.integrations.read',
  'platform.integrations.write',
  'platform.database.read',
  'revenue.invoices.read',
  'revenue.invoices.write',
  'revenue.invoices.refund',
  'revenue.invoices.refund.large',
  'revenue.dunning.read',
  'revenue.dunning.write',
  'revenue.subscriptions.read',
  'revenue.subscriptions.write',
  'revenue.subscriptions.override',
  'revenue.disputes.read',
  'revenue.disputes.write',
  'revenue.tax.read',
  'revenue.tax.write',
  'revenue.recognition.read',
  'revenue.recognition.write',
  'revenue.commissions.read',
  'revenue.commissions.payout',
  'revenue.analytics.read',
  'customer.support.read',
  'customer.support.write',
  'customer.360.read',
  'customer.success.read',
  'customer.success.write',
  'customer.feedback.read',
  'customer.feedback.write',
  'customer.kb.read',
  'customer.kb.write',
  'customer.comms.read',
  'customer.comms.send',
  'customer.qbr.read',
  'customer.qbr.write',
  'customer.onboarding.read',
  'trust.iam.read',
  'trust.iam.write',
  'trust.iam.root',
  'trust.jit.request',
  'trust.jit.approve',
  'trust.audit.read',
  'trust.audit.export',
  'trust.compliance.dsar.read',
  'trust.compliance.dsar.write',
  'trust.compliance.legal-hold.read',
  'trust.compliance.legal-hold.write',
  'trust.safety.read',
  'trust.safety.suspend',
  'trust.kyc.read',
  'trust.kyc.approve',
  'trust.secrets.read',
  'trust.security.read',
  'trust.security.write',
  'gtm.pipeline.read',
  'gtm.pipeline.write',
  'gtm.trials.read',
  'gtm.trials.extend',
  'gtm.demos.read',
  'gtm.demos.write',
  'gtm.contracts.read',
  'gtm.contracts.write',
  'gtm.contracts.discount.large',
  'gtm.partners.read',
  'gtm.partners.write',
  'gtm.attribution.read',
  'gtm.pricing.read',
  'gtm.pricing.write',
  'gtm.handoff.read',
  'gtm.handoff.write'
] as const satisfies readonly Permission[];

export const READ_ONLY_PERMISSIONS = PERMISSIONS.filter((permission) => permission.endsWith('.read')) as Permission[];
