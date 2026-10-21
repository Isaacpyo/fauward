// Vendor webhook receivers. Each verifies its own signature, so the IP-block hook (WP-5.4) and the admin host guard
// (WP-5.5) let them through: a vendor's delivery IPs are not ours to block, and they post to the API host.
export const VENDOR_WEBHOOK_PATHS = [
  '/api/internal/contracts/webhooks/docusign',
  '/api/internal/incidents/webhooks/pagerduty',
  '/api/internal/kyc/webhooks/persona',
  '/api/internal/kyc/webhooks/complyadvantage',
  '/api/v1/payments/webhook/stripe'
] as const;

export function requestPath(url: string | undefined) {
  return (url ?? '').split('?')[0];
}

export function isVendorWebhookPath(url: string | undefined) {
  return (VENDOR_WEBHOOK_PATHS as readonly string[]).includes(requestPath(url));
}
