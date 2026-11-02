import { anrokAdapter } from './anrok.adapter.js';
import { complyAdvantageAdapter } from './complyadvantage.adapter.js';
import { docusignAdapter } from './docusign.adapter.js';
import { dopplerAdapter } from './doppler.adapter.js';
import { githubAdapter } from './github.adapter.js';
import { hubspotAdapter } from './hubspot.adapter.js';
import { launchDarklyAdapter } from './launchdarkly.adapter.js';
import { pagerDutyAdapter } from './pagerduty.adapter.js';
import { personaAdapter } from './persona.adapter.js';
import { stripeTaxAdapter } from './stripe-tax.adapter.js';
import { stripeAdapter } from './stripe.adapter.js';
import type { VendorName } from './vendor-error.js';

// D9 (WP-4.0a): the eleven vendor adapters. Each exposes isConfigured()/missingEnv(); a service checks isConfigured()
// and falls back to its native path, so the console works with every vendor env var unset.

export const VENDOR_ADAPTERS = {
  launchdarkly: launchDarklyAdapter,
  github: githubAdapter,
  pagerduty: pagerDutyAdapter,
  stripe: stripeAdapter,
  'stripe-tax': stripeTaxAdapter,
  anrok: anrokAdapter,
  persona: personaAdapter,
  complyadvantage: complyAdvantageAdapter,
  doppler: dopplerAdapter,
  hubspot: hubspotAdapter,
  docusign: docusignAdapter
} as const satisfies Record<VendorName, { vendor: VendorName; isConfigured: () => boolean; missingEnv: () => string[]; envNames: string[] }>;

export type VendorStatus = { vendor: VendorName; configured: false; missing: string[] };

/** What a page needs for DegradedBanner('vendor-unconfigured', …): null when the vendor is configured. */
export function vendorStatus(vendor: VendorName): VendorStatus | null {
  const adapter = VENDOR_ADAPTERS[vendor];
  return adapter.isConfigured() ? null : { vendor, configured: false, missing: adapter.missingEnv() };
}
