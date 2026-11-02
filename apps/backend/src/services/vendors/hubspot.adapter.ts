import { readVendorEnv, requireVendorEnv, vendorRequest } from './http.js';

// Optional deal import for gtm.pipeline (WP-4.18). The console stays the source of truth for deals linked to a tenant.

const SPEC = { required: ['HUBSPOT_ACCESS_TOKEN'], optional: { HUBSPOT_BASE_URL: 'https://api.hubapi.com' } };

export type HubspotDeal = { id: string; name: string; amount: string | null; stage: string | null; probability: number | null; closeDate: string | null; ownerId: string | null };

type RawDeal = { id: string; properties?: Record<string, string | null | undefined> };

export const hubspotAdapter = {
  vendor: 'hubspot' as const,
  envNames: ['HUBSPOT_ACCESS_TOKEN'],
  isConfigured: () => readVendorEnv(SPEC).configured,
  missingEnv: () => readVendorEnv(SPEC).missing,

  async listDeals(limit = 500): Promise<HubspotDeal[]> {
    const values = requireVendorEnv('hubspot', SPEC);
    const deals: HubspotDeal[] = [];
    let after: string | undefined;
    do {
      const page = await vendorRequest<{ results?: RawDeal[]; paging?: { next?: { after?: string } } }>('hubspot', `${values.HUBSPOT_BASE_URL}/crm/v3/objects/deals`, {
        headers: { Authorization: `Bearer ${values.HUBSPOT_ACCESS_TOKEN}` },
        query: { limit: 100, after, properties: 'dealname,amount,dealstage,closedate,hs_deal_stage_probability,hubspot_owner_id' }
      });
      for (const raw of page.results ?? []) {
        const props = raw.properties ?? {};
        const probability = props.hs_deal_stage_probability ? Number(props.hs_deal_stage_probability) : null;
        deals.push({
          id: raw.id,
          name: props.dealname ?? `HubSpot deal ${raw.id}`,
          amount: props.amount ?? null,
          stage: props.dealstage ?? null,
          probability: probability === null || Number.isNaN(probability) ? null : probability,
          closeDate: props.closedate ?? null,
          ownerId: props.hubspot_owner_id ?? null
        });
      }
      after = page.paging?.next?.after;
    } while (after && deals.length < limit);
    return deals;
  }
};
