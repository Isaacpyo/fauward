import type { Permission } from './permissions.js';

/**
 * Read permission of every console service, keyed by manifest id (`<pillar>.<service>`). The console manifest's
 * `requiredPermission` must match (manifest reconciliation test). The backend uses it to show a staff member only the
 * activity of services they can read (D7, WP-2.1).
 */
export const SERVICE_READ_PERMISSIONS = {
  'platform.tenants': 'platform.tenants.read',
  'platform.impersonation': 'platform.impersonation.start',
  'platform.flags': 'platform.flags.read',
  'platform.queues': 'platform.queues.read',
  'platform.incidents': 'platform.incidents.read',
  'platform.health': 'platform.health.read',
  'platform.jobs': 'platform.jobs.read',
  'platform.integrations': 'platform.integrations.read',
  'platform.database': 'platform.database.read',
  'revenue.billing': 'revenue.invoices.read',
  'revenue.dunning': 'revenue.dunning.read',
  'revenue.subscriptions': 'revenue.subscriptions.read',
  'revenue.disputes': 'revenue.disputes.read',
  'revenue.tax': 'revenue.tax.read',
  'revenue.recognition': 'revenue.recognition.read',
  'revenue.commissions': 'revenue.commissions.read',
  'revenue.analytics': 'revenue.analytics.read',
  'customer.support': 'customer.support.read',
  'customer.360': 'customer.360.read',
  'customer.success': 'customer.success.read',
  'customer.feedback': 'customer.feedback.read',
  'customer.kb': 'customer.kb.read',
  'customer.comms': 'customer.comms.read',
  'customer.qbr': 'customer.qbr.read',
  'customer.onboarding': 'customer.onboarding.read',
  'trust.iam': 'trust.iam.read',
  'trust.jit': 'trust.jit.request',
  'trust.audit': 'trust.audit.read',
  'trust.compliance': 'trust.compliance.dsar.read',
  'trust.safety': 'trust.safety.read',
  'trust.kyc': 'trust.kyc.read',
  'trust.secrets': 'trust.secrets.read',
  'trust.security': 'trust.security.read',
  'gtm.pipeline': 'gtm.pipeline.read',
  'gtm.trials': 'gtm.trials.read',
  'gtm.demos': 'gtm.demos.read',
  'gtm.contracts': 'gtm.contracts.read',
  'gtm.partners': 'gtm.partners.read',
  'gtm.attribution': 'gtm.attribution.read',
  'gtm.pricing': 'gtm.pricing.read',
  'gtm.handoff': 'gtm.handoff.read'
} as const satisfies Record<string, Permission>;

export type ConsoleServiceId = keyof typeof SERVICE_READ_PERMISSIONS;

export function isConsoleServiceId(value: string): value is ConsoleServiceId {
  return Object.prototype.hasOwnProperty.call(SERVICE_READ_PERMISSIONS, value);
}

/** The read permission for a service id; unknown ids have none (and are visible to nobody). */
export function serviceReadPermission(service: string): Permission | null {
  return isConsoleServiceId(service) ? SERVICE_READ_PERMISSIONS[service] : null;
}
