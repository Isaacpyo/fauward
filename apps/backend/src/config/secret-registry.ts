// trust.secrets (WP-4.12): the credentials Fauward's backend depends on. The `trust.secret-inventory` job (boot +
// daily) reads each env var, stores only whether it is set and a fingerprint, and detects rotations; nothing here or in
// the job ever returns or logs a value. `rotateEveryDays` is the default policy — staff can change it per secret.
// `integration` ties a credential to a platform.integrations provider (its Credentials view).

export type SecretDefinition = {
  name: string;
  envName: string;
  /** Team that owns rotation (staff can also name an owner in the console). */
  owner: string;
  rotateEveryDays: number | null;
  usedBy: string[];
  integration?: string;
};

export const SECRET_REGISTRY: readonly SecretDefinition[] = [
  { name: 'Tenant access-token signing key', envName: 'JWT_ACCESS_SECRET', owner: 'Platform', rotateEveryDays: 180, usedBy: ['Tenant portal and API sign-in', 'Relay'] },
  { name: 'Tenant refresh-token signing key', envName: 'JWT_REFRESH_SECRET', owner: 'Platform', rotateEveryDays: 180, usedBy: ['Tenant portal sessions'] },
  { name: 'Console session signing key', envName: 'PLATFORM_SESSION_SECRET', owner: 'Platform', rotateEveryDays: 180, usedBy: ['Console sign-in'] },
  { name: 'Console refresh signing key', envName: 'PLATFORM_REFRESH_SECRET', owner: 'Platform', rotateEveryDays: 180, usedBy: ['Console sessions'] },
  { name: 'Field encryption keys', envName: 'FIELD_ENCRYPTION_KEYS', owner: 'Security', rotateEveryDays: 365, usedBy: ['MFA secrets', 'Tenant payment gateway keys'] },
  { name: 'Monitoring API key', envName: 'MONITORING_API_KEY', owner: 'SRE', rotateEveryDays: 90, usedBy: ['Status dashboard', 'Python services', 'Uptime Kuma'] },
  { name: 'Agent service token', envName: 'AGENT_SERVICE_TOKEN', owner: 'Platform', rotateEveryDays: 90, usedBy: ['AI agent service'] },
  { name: 'ROOT hardware-key assertion', envName: 'DEV_HARDWARE_KEY_ASSERTION', owner: 'Security', rotateEveryDays: 90, usedBy: ['ROOT role grants'] },
  { name: 'Stripe secret key', envName: 'STRIPE_SECRET_KEY', owner: 'Finance', rotateEveryDays: 365, usedBy: ['Fauward billing', 'Refunds', 'Disputes'], integration: 'stripe' },
  { name: 'Stripe webhook signing secret', envName: 'STRIPE_WEBHOOK_SECRET', owner: 'Finance', rotateEveryDays: 365, usedBy: ['Stripe webhooks'], integration: 'stripe' },
  { name: 'SendGrid API key', envName: 'SENDGRID_API_KEY', owner: 'Platform', rotateEveryDays: 365, usedBy: ['Transactional email'], integration: 'sendgrid' },
  { name: 'Twilio auth token', envName: 'TWILIO_AUTH_TOKEN', owner: 'Platform', rotateEveryDays: 365, usedBy: ['SMS notifications'], integration: 'twilio' },
  { name: 'Vercel API token', envName: 'VERCEL_API_TOKEN', owner: 'Platform', rotateEveryDays: 180, usedBy: ['Tenant custom domains'], integration: 'vercel' },
  { name: 'PagerDuty API token', envName: 'PAGERDUTY_API_TOKEN', owner: 'SRE', rotateEveryDays: 365, usedBy: ['On-call lookups'], integration: 'pagerduty' },
  { name: 'PagerDuty webhook secret', envName: 'PAGERDUTY_WEBHOOK_SECRET', owner: 'SRE', rotateEveryDays: 365, usedBy: ['Incident webhooks'], integration: 'pagerduty' },
  { name: 'LaunchDarkly API token', envName: 'LAUNCHDARKLY_API_TOKEN', owner: 'Platform', rotateEveryDays: 365, usedBy: ['Feature flag mirror'], integration: 'launchdarkly' },
  { name: 'GitHub token', envName: 'GITHUB_TOKEN', owner: 'Platform', rotateEveryDays: 90, usedBy: ['Releases'], integration: 'github' },
  { name: 'Doppler API token', envName: 'DOPPLER_API_TOKEN', owner: 'Security', rotateEveryDays: 180, usedBy: ['Secret inventory'], integration: 'doppler' },
  { name: 'Persona API key', envName: 'PERSONA_API_KEY', owner: 'Trust', rotateEveryDays: 365, usedBy: ['KYC inquiries'], integration: 'persona' },
  { name: 'Persona webhook secret', envName: 'PERSONA_WEBHOOK_SECRET', owner: 'Trust', rotateEveryDays: 365, usedBy: ['KYC webhooks'], integration: 'persona' },
  { name: 'ComplyAdvantage API key', envName: 'COMPLYADVANTAGE_API_KEY', owner: 'Trust', rotateEveryDays: 365, usedBy: ['Sanctions screening'], integration: 'complyadvantage' },
  { name: 'ComplyAdvantage webhook secret', envName: 'COMPLYADVANTAGE_WEBHOOK_SECRET', owner: 'Trust', rotateEveryDays: 365, usedBy: ['Sanctions webhooks'], integration: 'complyadvantage' },
  { name: 'DocuSign access token', envName: 'DOCUSIGN_ACCESS_TOKEN', owner: 'Sales', rotateEveryDays: 30, usedBy: ['Contract envelopes'], integration: 'docusign' },
  { name: 'DocuSign webhook secret', envName: 'DOCUSIGN_WEBHOOK_SECRET', owner: 'Sales', rotateEveryDays: 365, usedBy: ['Contract webhooks'], integration: 'docusign' },
  { name: 'HubSpot access token', envName: 'HUBSPOT_ACCESS_TOKEN', owner: 'Sales', rotateEveryDays: 180, usedBy: ['Pipeline import'], integration: 'hubspot' },
  { name: 'Anrok API key', envName: 'ANROK_API_KEY', owner: 'Finance', rotateEveryDays: 365, usedBy: ['Tax rate lookup'], integration: 'anrok' },
  { name: 'DeepSeek API key', envName: 'DEEPSEEK_API_KEY', owner: 'Platform', rotateEveryDays: 180, usedBy: ['AI assistant'], integration: 'deepseek' }
];

export function findSecretDefinition(envName: string) {
  return SECRET_REGISTRY.find((entry) => entry.envName === envName) ?? null;
}
