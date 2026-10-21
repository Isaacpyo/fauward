import { readVendorEnv, requireVendorEnv, vendorRequest } from './http.js';

// Optional sanctions/PEP screening for trust.kyc (WP-4.10). Without it the monthly rescreen creates PENDING
// screenings that staff clear or match by hand.

const SPEC = { required: ['COMPLYADVANTAGE_API_KEY'], optional: { COMPLYADVANTAGE_BASE_URL: 'https://api.complyadvantage.com' } };

export const complyAdvantageAdapter = {
  vendor: 'complyadvantage' as const,
  envNames: ['COMPLYADVANTAGE_API_KEY', 'COMPLYADVANTAGE_WEBHOOK_SECRET'],
  isConfigured: () => readVendorEnv(SPEC).configured,
  missingEnv: () => readVendorEnv(SPEC).missing,
  webhookSecret: () => process.env.COMPLYADVANTAGE_WEBHOOK_SECRET?.trim() || null,

  async createSearch(input: { searchTerm: string; referenceId: string }) {
    const values = requireVendorEnv('complyadvantage', SPEC);
    const result = await vendorRequest<{ content?: { data?: { id?: number | string; match_status?: string; total_hits?: number } } }>(
      'complyadvantage',
      `${values.COMPLYADVANTAGE_BASE_URL}/searches`,
      {
        method: 'POST',
        headers: { Authorization: `Token ${values.COMPLYADVANTAGE_API_KEY}` },
        body: { search_term: input.searchTerm, client_ref: input.referenceId, filters: { types: ['sanction', 'pep'] }, fuzziness: 0.6 }
      }
    );
    const data = result.content?.data;
    return { searchId: data?.id === undefined ? null : String(data.id), matchStatus: data?.match_status ?? 'unknown', totalHits: data?.total_hits ?? 0 };
  }
};
