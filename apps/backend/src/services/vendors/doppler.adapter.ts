import { readVendorEnv, requireVendorEnv, vendorRequest } from './http.js';

// Optional secret source for trust.secrets (WP-4.12). Only secret NAMES are requested (the names endpoint never
// returns values), so a Doppler-held secret shows as configured without its value entering the API.

const SPEC = { required: ['DOPPLER_API_TOKEN', 'DOPPLER_PROJECT', 'DOPPLER_CONFIG'], optional: { DOPPLER_BASE_URL: 'https://api.doppler.com/v3' } };

export const dopplerAdapter = {
  vendor: 'doppler' as const,
  envNames: ['DOPPLER_API_TOKEN', 'DOPPLER_PROJECT', 'DOPPLER_CONFIG'],
  isConfigured: () => readVendorEnv(SPEC).configured,
  missingEnv: () => readVendorEnv(SPEC).missing,

  async listSecretNames(): Promise<string[]> {
    const values = requireVendorEnv('doppler', SPEC);
    const result = await vendorRequest<{ names?: string[] }>('doppler', `${values.DOPPLER_BASE_URL}/configs/config/secrets/names`, {
      headers: { Authorization: `Bearer ${values.DOPPLER_API_TOKEN}` },
      query: { project: values.DOPPLER_PROJECT, config: values.DOPPLER_CONFIG }
    });
    return result.names ?? [];
  }
};
