import { readVendorEnv, requireVendorEnv, vendorRequest } from './http.js';

// PagerDuty is an optional producer for platform.incidents (WP-4.2): its signed webhook upserts IncidentRecord rows.
// With an API token the TopBar can also show who is on call; without one the native incident commander is shown.

const WEBHOOK_SPEC = { required: ['PAGERDUTY_WEBHOOK_SECRET'] };
const API_SPEC = { required: ['PAGERDUTY_API_TOKEN'], optional: { PAGERDUTY_BASE_URL: 'https://api.pagerduty.com' } };

export const pagerDutyAdapter = {
  vendor: 'pagerduty' as const,
  envNames: ['PAGERDUTY_WEBHOOK_SECRET', 'PAGERDUTY_API_TOKEN'],
  isConfigured: () => readVendorEnv(WEBHOOK_SPEC).configured,
  missingEnv: () => readVendorEnv(WEBHOOK_SPEC).missing,
  webhookSecret: () => readVendorEnv(WEBHOOK_SPEC).values.PAGERDUTY_WEBHOOK_SECRET ?? null,
  isApiConfigured: () => readVendorEnv(API_SPEC).configured,

  async currentOnCall(): Promise<Array<{ name: string; email: string | null; escalationPolicy: string | null }>> {
    const values = requireVendorEnv('pagerduty', API_SPEC);
    const result = await vendorRequest<{ oncalls?: Array<{ user?: { summary?: string; email?: string }; escalation_policy?: { summary?: string }; escalation_level?: number }> }>(
      'pagerduty',
      `${values.PAGERDUTY_BASE_URL}/oncalls`,
      { headers: { Authorization: `Token token=${values.PAGERDUTY_API_TOKEN}`, Accept: 'application/vnd.pagerduty+json;version=2' }, query: { earliest: 'true' } }
    );
    return (result.oncalls ?? [])
      .filter((item) => item.escalation_level === 1)
      .map((item) => ({ name: item.user?.summary ?? 'Unknown', email: item.user?.email ?? null, escalationPolicy: item.escalation_policy?.summary ?? null }));
  }
};
