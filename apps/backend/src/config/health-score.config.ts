// customer.success health score model (WP-3.3). Weights live in code and are served read-only at
// GET /api/internal/success/health-scoring; changing a weight or a factor definition bumps HEALTH_SCORE_VERSION, which
// is stored with every score.

export const HEALTH_SCORE_VERSION = 2;

/** A tenant younger than this has too little history to score; it shows "Not yet scored" (no fallback score). */
export const HEALTH_MIN_TENANT_AGE_DAYS = 14;

export const HEALTH_FACTORS = {
  shipmentTrend: {
    weight: 20,
    label: 'Shipment trend',
    definition: 'Shipments in the last 30 days against the 30 days before: 50% at no change, 100% at double or more, 0% at none. A tenant with shipments now and none before scores 100%; none in either window scores 0%.'
  },
  activeUsers: {
    weight: 20,
    label: 'Active users',
    definition: 'Share of active tenant users who signed in within the last 7 days.'
  },
  support: {
    weight: 15,
    label: 'Support load (tickets to Fauward)',
    definition: 'Open tickets the tenant raised with Fauward (PLATFORM audience): −15 points per open ticket and −25 if the oldest has been open more than 7 days.'
  },
  nps: {
    weight: 10,
    label: 'NPS',
    definition: "The tenant's NPS over responses from the last 90 days, −100…100 mapped to 0…100%. Without responses the factor is left out and the other weights are renormalised."
  },
  payment: {
    weight: 15,
    label: 'Payment health',
    definition: 'Payments to Fauward: 0% while the subscription is PAST_DUE (in dunning); otherwise −34 points per failed Fauward payment in 30 days and per overdue Fauward invoice.'
  },
  featureAdoption: {
    weight: 10,
    label: 'Feature adoption',
    definition: 'Share of six features used in the last 30 days: returns, customs declarations, documents, AI agent runs, API calls (this month) and an active webhook endpoint.'
  },
  onboarding: {
    weight: 10,
    label: 'Onboarding completeness',
    definition: 'Share of the core onboarding steps completed (branding, payment gateway, first shipment, teammate).'
  }
} as const;

export type HealthFactorKey = keyof typeof HEALTH_FACTORS;

/** Bands drive playbook triggers and the `health.score_changed` activity. */
export const HEALTH_BANDS = { atRiskBelow: 45, healthyFrom: 80 } as const;
