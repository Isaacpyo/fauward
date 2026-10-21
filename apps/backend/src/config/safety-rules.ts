// Automatic trust & safety rules (WP-2.4). The code that enforces each rule reads its numbers from here, and the console
// Rules page (GET /api/internal/safety/rules) lists the same objects — so the page always shows what actually runs.

export const STRIPE_RADAR_RULE = {
  id: 'stripe-radar-warning',
  name: 'Stripe Radar early fraud warning',
  events: ['radar.early_fraud_warning.created', 'review.opened'] as const,
  severity: 'HIGH' as const,
  effect: 'Creates a FRAUD signal for the tenant named in the Stripe metadata and alerts trust.safety.read staff. Suspension is a staff decision.'
};

export const FAILED_LOGIN_SPIKE_RULE = {
  id: 'staff-failed-login-spike',
  name: 'Console failed-login spike',
  windowMinutes: 10,
  maxFailuresPerAccount: 5,
  maxFailuresPerIp: 5,
  ipBlockMinutes: 60,
  effect: 'More failed console logins than allowed in the window opens a HIGH security anomaly per account and blocks the IP for an hour.'
};

export const DUNNING_SUSPEND_RULE = {
  id: 'dunning-suspend',
  name: 'Dunning suspension',
  effect: 'A failed Fauward invoice follows the default dunning sequence (revenue.dunning); only its SUSPEND step suspends the tenant (DUNNING cause, default day 14). Paying the invoice recovers the enrolment and lifts that cause.'
};

export type SafetyRule = { id: string; name: string; effect: string; parameters: Record<string, string | number | readonly string[]> };

export function safetyRules(): SafetyRule[] {
  return [
    { id: STRIPE_RADAR_RULE.id, name: STRIPE_RADAR_RULE.name, effect: STRIPE_RADAR_RULE.effect, parameters: { events: STRIPE_RADAR_RULE.events, severity: STRIPE_RADAR_RULE.severity } },
    {
      id: FAILED_LOGIN_SPIKE_RULE.id,
      name: FAILED_LOGIN_SPIKE_RULE.name,
      effect: FAILED_LOGIN_SPIKE_RULE.effect,
      parameters: {
        windowMinutes: FAILED_LOGIN_SPIKE_RULE.windowMinutes,
        maxFailuresPerAccount: FAILED_LOGIN_SPIKE_RULE.maxFailuresPerAccount,
        maxFailuresPerIp: FAILED_LOGIN_SPIKE_RULE.maxFailuresPerIp,
        ipBlockMinutes: FAILED_LOGIN_SPIKE_RULE.ipBlockMinutes
      }
    },
    { id: DUNNING_SUSPEND_RULE.id, name: DUNNING_SUSPEND_RULE.name, effect: DUNNING_SUSPEND_RULE.effect, parameters: { sequence: 'revenue.dunning default sequence' } }
  ];
}
