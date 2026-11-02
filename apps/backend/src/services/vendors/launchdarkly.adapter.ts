import { readVendorEnv, requireVendorEnv, vendorRequest } from './http.js';
import { VendorError } from './vendor-error.js';

// LaunchDarkly mirror for native TenantFeatureOverride rows (WP-4.1, S9). Only per-tenant targeting on context kind
// `tenant` (semantic patch addTargets/removeTargets) — never turnFlagOn/turnFlagOff, which change every tenant.

const SPEC = {
  required: ['LAUNCHDARKLY_API_TOKEN'],
  optional: { LAUNCHDARKLY_BASE_URL: 'https://app.launchdarkly.com/api/v2', LAUNCHDARKLY_PROJECT_KEY: 'default', LAUNCHDARKLY_ENVIRONMENT_KEY: 'production' }
};

export const TENANT_CONTEXT_KIND = 'tenant';

export type LaunchDarklyInstruction = { kind: 'addTargets' | 'removeTargets'; contextKind: typeof TENANT_CONTEXT_KIND; variationId: string; values: string[] };

type LdFlag = { key: string; name?: string; variations?: Array<{ _id: string; value: unknown }> };

function env() {
  return requireVendorEnv('launchdarkly', SPEC);
}

async function variationIdFor(flagKey: string, enabled: boolean) {
  const values = env();
  const flag = await vendorRequest<LdFlag>('launchdarkly', `${values.LAUNCHDARKLY_BASE_URL}/flags/${encodeURIComponent(values.LAUNCHDARKLY_PROJECT_KEY)}/${encodeURIComponent(flagKey)}`, {
    headers: { Authorization: values.LAUNCHDARKLY_API_TOKEN }
  });
  const variation = flag.variations?.find((item) => item.value === enabled);
  if (!variation) throw new VendorError('launchdarkly', `Flag ${flagKey} has no boolean ${String(enabled)} variation`);
  return variation._id;
}

async function patch(flagKey: string, instructions: LaunchDarklyInstruction[], comment: string) {
  const values = env();
  await vendorRequest<unknown>('launchdarkly', `${values.LAUNCHDARKLY_BASE_URL}/flags/${encodeURIComponent(values.LAUNCHDARKLY_PROJECT_KEY)}/${encodeURIComponent(flagKey)}`, {
    method: 'PATCH',
    headers: { Authorization: values.LAUNCHDARKLY_API_TOKEN, 'Content-Type': 'application/json; domain-model=launchdarkly.semanticpatch' },
    body: { environmentKey: values.LAUNCHDARKLY_ENVIRONMENT_KEY, comment, instructions }
  });
  return instructions;
}

export const launchDarklyAdapter = {
  vendor: 'launchdarkly' as const,
  envNames: ['LAUNCHDARKLY_API_TOKEN', 'LAUNCHDARKLY_PROJECT_KEY', 'LAUNCHDARKLY_ENVIRONMENT_KEY'],
  isConfigured: () => readVendorEnv(SPEC).configured,
  missingEnv: () => readVendorEnv(SPEC).missing,

  async listFlagKeys(): Promise<string[]> {
    const values = env();
    const result = await vendorRequest<{ items?: LdFlag[] }>('launchdarkly', `${values.LAUNCHDARKLY_BASE_URL}/flags/${encodeURIComponent(values.LAUNCHDARKLY_PROJECT_KEY)}`, {
      headers: { Authorization: values.LAUNCHDARKLY_API_TOKEN },
      query: { summary: 'true' }
    });
    return (result.items ?? []).map((flag) => flag.key);
  },

  /** Serves `enabled` to one tenant: removes it from the other variation's targets, then adds it to this one. */
  async setTenantTarget(flagKey: string, tenantId: string, enabled: boolean, comment: string) {
    const [on, off] = await Promise.all([variationIdFor(flagKey, enabled), variationIdFor(flagKey, !enabled)]);
    return patch(
      flagKey,
      [
        { kind: 'removeTargets', contextKind: TENANT_CONTEXT_KIND, variationId: off, values: [tenantId] },
        { kind: 'addTargets', contextKind: TENANT_CONTEXT_KIND, variationId: on, values: [tenantId] }
      ],
      comment
    );
  },

  /** Removes the tenant from both variations' individual targets (the flag's rules apply again). */
  async clearTenantTarget(flagKey: string, tenantId: string, comment: string) {
    const [on, off] = await Promise.all([variationIdFor(flagKey, true), variationIdFor(flagKey, false)]);
    return patch(
      flagKey,
      [
        { kind: 'removeTargets', contextKind: TENANT_CONTEXT_KIND, variationId: on, values: [tenantId] },
        { kind: 'removeTargets', contextKind: TENANT_CONTEXT_KIND, variationId: off, values: [tenantId] }
      ],
      comment
    );
  }
};
