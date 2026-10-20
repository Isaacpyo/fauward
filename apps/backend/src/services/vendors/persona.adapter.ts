import { readVendorEnv, requireVendorEnv, vendorRequest } from './http.js';

// Optional KYC provider for trust.kyc (WP-4.10). Without it the manual review queue is the source of truth.

const SPEC = { required: ['PERSONA_API_KEY', 'PERSONA_INQUIRY_TEMPLATE_ID'], optional: { PERSONA_BASE_URL: 'https://withpersona.com/api/v1' } };

export const personaAdapter = {
  vendor: 'persona' as const,
  envNames: ['PERSONA_API_KEY', 'PERSONA_INQUIRY_TEMPLATE_ID', 'PERSONA_WEBHOOK_SECRET'],
  isConfigured: () => readVendorEnv(SPEC).configured,
  missingEnv: () => readVendorEnv(SPEC).missing,
  webhookSecret: () => process.env.PERSONA_WEBHOOK_SECRET?.trim() || null,

  async createInquiry(input: { referenceId: string; name: string }) {
    const values = requireVendorEnv('persona', SPEC);
    const result = await vendorRequest<{ data?: { id?: string; attributes?: { status?: string } } }>('persona', `${values.PERSONA_BASE_URL}/inquiries`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${values.PERSONA_API_KEY}`, 'Persona-Version': '2023-01-05' },
      body: { data: { attributes: { 'inquiry-template-id': values.PERSONA_INQUIRY_TEMPLATE_ID, 'reference-id': input.referenceId, fields: { 'business-name': input.name } } } }
    });
    return { inquiryId: result.data?.id ?? null, status: result.data?.attributes?.status ?? 'created' };
  }
};
