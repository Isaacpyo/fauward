import { readVendorEnv, requireVendorEnv, vendorRequest } from './http.js';
import { VendorError } from './vendor-error.js';

// Optional e-signature for gtm.contracts (WP-4.19). An envelope always carries the generated quote document and at
// least one signer (the old handler sent an empty envelope). Without DocuSign the quote is marked SENT and the signed
// PDF is uploaded by hand.

const SPEC = { required: ['DOCUSIGN_ACCESS_TOKEN', 'DOCUSIGN_ACCOUNT_ID'], optional: { DOCUSIGN_BASE_URL: 'https://demo.docusign.net/restapi' } };

export type EnvelopeInput = {
  emailSubject: string;
  document: { name: string; fileExtension: string; base64: string };
  signers: Array<{ name: string; email: string }>;
  metadata?: Record<string, string>;
};

export const docusignAdapter = {
  vendor: 'docusign' as const,
  envNames: ['DOCUSIGN_ACCESS_TOKEN', 'DOCUSIGN_ACCOUNT_ID', 'DOCUSIGN_WEBHOOK_SECRET'],
  isConfigured: () => readVendorEnv(SPEC).configured,
  missingEnv: () => readVendorEnv(SPEC).missing,
  webhookSecret: () => process.env.DOCUSIGN_WEBHOOK_SECRET?.trim() || null,

  async createEnvelope(input: EnvelopeInput) {
    if (!input.document.base64) throw new VendorError('docusign', 'An envelope needs a document');
    if (input.signers.length === 0) throw new VendorError('docusign', 'An envelope needs at least one signer');
    const values = requireVendorEnv('docusign', SPEC);
    const result = await vendorRequest<{ envelopeId?: string; status?: string }>(
      'docusign',
      `${values.DOCUSIGN_BASE_URL}/v2.1/accounts/${encodeURIComponent(values.DOCUSIGN_ACCOUNT_ID)}/envelopes`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${values.DOCUSIGN_ACCESS_TOKEN}` },
        body: {
          emailSubject: input.emailSubject,
          status: 'sent',
          documents: [{ documentId: '1', name: input.document.name, fileExtension: input.document.fileExtension, documentBase64: input.document.base64 }],
          recipients: {
            signers: input.signers.map((signer, index) => ({
              recipientId: String(index + 1),
              routingOrder: String(index + 1),
              name: signer.name,
              email: signer.email,
              tabs: { signHereTabs: [{ documentId: '1', pageNumber: '1', xPosition: '72', yPosition: '700' }] }
            }))
          },
          ...(input.metadata ? { customFields: { textCustomFields: Object.entries(input.metadata).map(([name, value]) => ({ name, value, show: 'false' })) } } : {})
        }
      }
    );
    if (!result.envelopeId) throw new VendorError('docusign', 'DocuSign returned no envelope id');
    return { envelopeId: result.envelopeId, status: result.status ?? 'sent' };
  }
};
