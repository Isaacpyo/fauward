type VendorName =
  | 'zendesk'
  | 'pagerduty'
  | 'launchdarkly'
  | 'doppler'
  | 'persona'
  | 'complyadvantage'
  | 'docusign'
  | 'hubspot'
  | 'posthog'
  | 'anrok'
  | 'slack'
  | 'github';

type VendorConfig = {
  baseUrl?: string;
  token?: string;
  account?: string;
  webhookSecret?: string;
};

const vendorEnv: Record<VendorName, { baseUrl?: string; token?: string; account?: string; webhookSecret?: string }> = {
  zendesk: { baseUrl: 'ZENDESK_BASE_URL', token: 'ZENDESK_API_TOKEN', account: 'ZENDESK_ACCOUNT_EMAIL' },
  pagerduty: { baseUrl: 'PAGERDUTY_BASE_URL', token: 'PAGERDUTY_API_TOKEN', webhookSecret: 'PAGERDUTY_WEBHOOK_SECRET' },
  launchdarkly: { baseUrl: 'LAUNCHDARKLY_BASE_URL', token: 'LAUNCHDARKLY_API_TOKEN' },
  doppler: { baseUrl: 'DOPPLER_BASE_URL', token: 'DOPPLER_API_TOKEN' },
  persona: { baseUrl: 'PERSONA_BASE_URL', token: 'PERSONA_API_KEY', webhookSecret: 'PERSONA_WEBHOOK_SECRET' },
  complyadvantage: { baseUrl: 'COMPLYADVANTAGE_BASE_URL', token: 'COMPLYADVANTAGE_API_KEY', webhookSecret: 'COMPLYADVANTAGE_WEBHOOK_SECRET' },
  docusign: { baseUrl: 'DOCUSIGN_BASE_URL', token: 'DOCUSIGN_ACCESS_TOKEN', account: 'DOCUSIGN_ACCOUNT_ID', webhookSecret: 'DOCUSIGN_WEBHOOK_SECRET' },
  hubspot: { baseUrl: 'HUBSPOT_BASE_URL', token: 'HUBSPOT_ACCESS_TOKEN' },
  posthog: { baseUrl: 'POSTHOG_BASE_URL', token: 'POSTHOG_API_KEY' },
  anrok: { baseUrl: 'ANROK_BASE_URL', token: 'ANROK_API_KEY' },
  slack: { baseUrl: 'SLACK_WEBHOOK_URL', token: 'SLACK_BOT_TOKEN' },
  github: { baseUrl: 'GITHUB_API_BASE_URL', token: 'GITHUB_TOKEN' }
};

const defaultBaseUrls: Partial<Record<VendorName, string>> = {
  zendesk: 'https://fauward.zendesk.com/api/v2',
  pagerduty: 'https://api.pagerduty.com',
  launchdarkly: 'https://app.launchdarkly.com/api/v2',
  doppler: 'https://api.doppler.com/v3',
  persona: 'https://withpersona.com/api/v1',
  complyadvantage: 'https://api.complyadvantage.com',
  docusign: 'https://demo.docusign.net/restapi',
  hubspot: 'https://api.hubapi.com',
  posthog: 'https://app.posthog.com/api',
  anrok: 'https://api.anrok.com',
  github: 'https://api.github.com'
};

export type VendorUnavailable = {
  configured: false;
  vendor: VendorName;
  missing: string[];
};

export type VendorReady = VendorConfig & {
  configured: true;
  vendor: VendorName;
  baseUrl: string;
  token: string;
};

export function vendorConfig(vendor: VendorName): VendorReady | VendorUnavailable {
  const keys = vendorEnv[vendor];
  const token = keys.token ? process.env[keys.token] : undefined;
  const baseUrl = (keys.baseUrl ? process.env[keys.baseUrl] : undefined) ?? defaultBaseUrls[vendor];
  const missing = [token ? null : keys.token, baseUrl ? null : keys.baseUrl].filter(Boolean) as string[];

  if (missing.length > 0 || !token || !baseUrl) {
    return { configured: false, vendor, missing };
  }

  return {
    configured: true,
    vendor,
    baseUrl,
    token,
    account: keys.account ? process.env[keys.account] : undefined,
    webhookSecret: keys.webhookSecret ? process.env[keys.webhookSecret] : undefined
  };
}

export function vendorUnavailable(vendor: VendorName) {
  const config = vendorConfig(vendor);
  return config.configured ? null : { vendor, configured: false, missing: config.missing };
}

export async function vendorJson<T>(vendor: VendorName, path: string, init: RequestInit = {}): Promise<T> {
  const config = vendorConfig(vendor);
  if (!config.configured) {
    throw new Error(`${vendor} is not configured. Missing ${config.missing.join(', ')}`);
  }

  const headers = new Headers(init.headers);
  headers.set('Authorization', vendor === 'doppler' ? `Bearer ${config.token}` : `Bearer ${config.token}`);
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');

  const response = await fetch(`${config.baseUrl}${path}`, { ...init, headers });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${vendor} request failed with ${response.status}: ${body.slice(0, 300)}`);
  }
  return (await response.json()) as T;
}

export function constantTimeEquals(left: string | undefined, right: string | undefined) {
  if (!left || !right || left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i += 1) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}
