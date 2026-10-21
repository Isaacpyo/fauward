import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma, type TaxExemption } from '@prisma/client';
import { z } from 'zod';
import { auditedMutation, staffMutationActor } from './console-mutation.js';
import { postgresExportStorage, exportStorageFor } from './export-storage.js';
import { recordAndPublishActivity } from './platform-activity.service.js';
import { notifyStaff, notifyTenantAdmins } from './platform-notifier.service.js';
import { stripeAdapter } from './vendors/stripe.adapter.js';
import { vendorStatus } from './vendors/index.js';

// revenue.tax (WP-4.7). Tax registrations are Fauward's own (region + tax id, CRUD). Tax exemptions are the tenant's:
// a TENANT_ADMIN or FINANCE user uploads a certificate (stored through the export storage adapter, Postgres by
// default), staff approve / reject / later revoke it. APPROVED sets Tenant.taxExempt — read by PLATFORM invoice
// creation (0 tax plus an exemption note) and mirrored to the Stripe customer's `tax_exempt` when Stripe is configured.

const SERVICE = 'revenue.tax';
export const CERTIFICATE_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const;
export const MAX_CERTIFICATE_BYTES = 5 * 1024 * 1024;
const BILLING_LINK = '/settings?tab=billing';

export class TaxError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

// ── Tenant side ──────────────────────────────────────────────────────────────

export const exemptionUploadBody = z.object({
  fileName: z.string().trim().min(1).max(200),
  contentType: z.enum(CERTIFICATE_TYPES),
  dataBase64: z.string().min(1)
});

function presentForTenant(row: TaxExemption | null, taxExempt: boolean) {
  return {
    taxExempt,
    exemption: row
      ? { id: row.id, status: row.status, fileName: row.fileName, submittedAt: row.createdAt.toISOString(), decidedAt: row.decidedAt?.toISOString() ?? null, decisionReason: row.status === 'REJECTED' || row.status === 'REVOKED' ? row.decisionReason : null }
      : null
  };
}

export async function tenantExemptionStatus(app: Pick<FastifyInstance, 'prisma'>, tenantId: string) {
  const [tenant, latest] = await Promise.all([
    app.prisma.tenant.findUnique({ where: { id: tenantId }, select: { taxExempt: true } }),
    app.prisma.taxExemption.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' } })
  ]);
  return presentForTenant(latest, tenant?.taxExempt ?? false);
}

export async function submitExemption(app: FastifyInstance, request: FastifyRequest, input: { tenantId: string; userId: string; body: z.infer<typeof exemptionUploadBody> }) {
  const bytes = Buffer.from(input.body.dataBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (bytes.byteLength === 0) throw new TaxError(400, 'EMPTY_FILE', 'The certificate file is empty.');
  if (bytes.byteLength > MAX_CERTIFICATE_BYTES) throw new TaxError(413, 'FILE_TOO_LARGE', 'The certificate must be 5 MB or smaller.');
  const pending = await app.prisma.taxExemption.findFirst({ where: { tenantId: input.tenantId, status: 'PENDING' }, select: { id: true } });
  if (pending) throw new TaxError(409, 'ALREADY_PENDING', 'A certificate is already waiting for review.');
  const tenant = await app.prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { id: true, name: true } });
  if (!tenant) throw new TaxError(404, 'TENANT_NOT_FOUND', 'Tenant not found');

  const storage = postgresExportStorage(app.prisma);
  const stored = await storage.put(input.tenantId, bytes);
  const row = await app.prisma.taxExemption.create({
    data: {
      tenantId: input.tenantId,
      certificateUrl: '',
      status: 'PENDING',
      fileName: input.body.fileName,
      contentType: input.body.contentType,
      byteSize: stored.byteSize,
      storageProvider: stored.provider,
      storageKey: stored.key,
      submittedByUserId: input.userId
    }
  });
  const updated = await app.prisma.taxExemption.update({ where: { id: row.id }, data: { certificateUrl: `/api/internal/tax/exemptions/${row.id}/certificate` } });
  await recordAndPublishActivity(app, {
    service: SERVICE,
    type: 'tax.exemption_submitted',
    tenantId: input.tenantId,
    actorType: 'TENANT_USER',
    actorId: input.userId,
    actorLabel: request.user?.email ?? 'Tenant user',
    subjectType: 'tax_exemption',
    subjectId: row.id,
    summary: `${tenant.name} uploaded a tax exemption certificate`,
    severity: 'ATTENTION',
    consoleLink: '/revenue/tax/exemptions',
    dedupeKey: `tax.exemption_submitted:${row.id}`
  });
  await notifyStaff(app, { permission: 'revenue.tax.write', event: 'tax.exemption_submitted', title: `${tenant.name} uploaded a tax exemption certificate`, link: '/revenue/tax/exemptions', severity: 'ATTENTION', tenantId: input.tenantId });
  return presentForTenant(updated, false);
}

// ── Console: exemptions ──────────────────────────────────────────────────────

export const exemptionListQuery = z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'REVOKED', 'ALL']).default('PENDING') });
export const decisionBody = z.object({ decision: z.enum(['APPROVE', 'REJECT', 'REVOKE']), reason: z.string().trim().min(8) });

export async function listExemptions(app: Pick<FastifyInstance, 'prisma'>, query: z.infer<typeof exemptionListQuery>) {
  const rows = await app.prisma.taxExemption.findMany({ where: query.status === 'ALL' ? {} : { status: query.status }, orderBy: { createdAt: 'desc' }, take: 200 });
  const tenantIds = [...new Set(rows.map((row) => row.tenantId))];
  const tenants = tenantIds.length ? await app.prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true, slug: true, taxExempt: true } }) : [];
  const byId = new Map(tenants.map((tenant) => [tenant.id, tenant]));
  return {
    data: rows.map((row) => ({
      id: row.id,
      tenant: byId.get(row.tenantId) ?? { id: row.tenantId, name: row.tenantId, slug: null, taxExempt: false },
      status: row.status,
      fileName: row.fileName,
      contentType: row.contentType,
      byteSize: row.byteSize,
      certificateUrl: row.storageKey ? `/tax/exemptions/${row.id}/certificate` : null,
      submittedAt: row.createdAt.toISOString(),
      decidedBy: row.decidedBy,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      decisionReason: row.decisionReason,
      revokedAt: row.revokedAt?.toISOString() ?? null
    }))
  };
}

export async function certificateBytes(app: Pick<FastifyInstance, 'prisma'>, id: string) {
  const row = await app.prisma.taxExemption.findUnique({ where: { id } });
  if (!row || !row.storageKey) return null;
  const storage = exportStorageFor(app.prisma, row.storageProvider);
  const bytes = storage ? await storage.get(row.tenantId, row.storageKey) : null;
  return bytes ? { bytes, contentType: row.contentType ?? 'application/octet-stream', fileName: row.fileName ?? `certificate-${row.id}` } : null;
}

type Mirror = { status: 'MIRRORED' | 'FAILED' | 'NOT_CONFIGURED' | 'NO_STRIPE_CUSTOMER'; error: string | null };

/** Stripe customer `tax_exempt`, when Stripe is configured and the tenant has a Stripe customer. Never fails the decision. */
async function mirrorToStripe(app: Pick<FastifyInstance, 'prisma' | 'log'>, tenantId: string, exempt: boolean, key: string): Promise<Mirror> {
  if (!stripeAdapter.isConfigured()) return { status: 'NOT_CONFIGURED', error: null };
  const subscription = await app.prisma.subscription.findUnique({ where: { tenantId }, select: { stripeCustomerId: true } });
  if (!subscription?.stripeCustomerId) return { status: 'NO_STRIPE_CUSTOMER', error: null };
  try {
    await stripeAdapter.setCustomerTaxExempt(subscription.stripeCustomerId, exempt, key);
    return { status: 'MIRRORED', error: null };
  } catch (error) {
    app.log.error({ err: error, tenantId }, 'Stripe tax_exempt mirror failed');
    return { status: 'FAILED', error: error instanceof Error ? error.message : 'Stripe error' };
  }
}

export async function decideExemption(app: FastifyInstance, request: FastifyRequest, id: string, body: z.infer<typeof decisionBody>) {
  const row = await app.prisma.taxExemption.findUnique({ where: { id } });
  if (!row) throw new TaxError(404, 'EXEMPTION_NOT_FOUND', 'Tax exemption not found');
  const expected = body.decision === 'REVOKE' ? 'APPROVED' : 'PENDING';
  if (row.status !== expected) throw new TaxError(409, 'INVALID_STATE', `Cannot ${body.decision.toLowerCase()} an exemption that is ${row.status.toLowerCase()}.`);
  const staffId = request.platform!.user.id;
  const now = new Date();
  const status = body.decision === 'APPROVE' ? 'APPROVED' : body.decision === 'REJECT' ? 'REJECTED' : 'REVOKED';
  const exempt = body.decision === 'APPROVE';
  const tenant = await app.prisma.tenant.findUnique({ where: { id: row.tenantId }, select: { id: true, name: true } });
  if (!tenant) throw new TaxError(404, 'TENANT_NOT_FOUND', 'Tenant not found');

  const updated = await auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    const claimed = await tx.taxExemption.updateMany({
      where: { id, tenantId: row.tenantId, status: expected },
      data:
        body.decision === 'REVOKE'
          ? { status, revokedBy: staffId, revokedAt: now, decisionReason: body.reason }
          : { status, decidedBy: staffId, decidedAt: now, decisionReason: body.reason, ...(exempt ? { approvedBy: staffId, approvedAt: now } : {}) }
    });
    if (claimed.count !== 1) throw new TaxError(409, 'INVALID_STATE', 'The exemption changed; reload and try again.');
    if (body.decision !== 'REJECT') {
      await tx.tenant.update({ where: { id: row.tenantId }, data: { taxExempt: exempt, taxExemptionCertificateUrl: exempt ? row.certificateUrl : null } });
    }
    return {
      result: await tx.taxExemption.findUniqueOrThrow({ where: { id } }),
      audit: { action: `TAX_EXEMPTION_${status}`, targetTenantId: row.tenantId, reason: body.reason, metadata: { exemptionId: id, from: row.status, to: status } },
      activity: { type: `tax.exemption_${status.toLowerCase()}`, tenantId: row.tenantId, subjectType: 'tax_exemption', subjectId: id, summary: `${tenant.name}: tax exemption ${status.toLowerCase()}`, consoleLink: '/revenue/tax/exemptions' }
    };
  });

  const mirror = body.decision === 'REJECT' ? null : await mirrorToStripe(app, row.tenantId, exempt, `tax-exempt:${id}:${status}`);
  const copy: Record<string, { title: string; body: string }> = {
    APPROVED: { title: 'Your tax exemption is approved', body: 'New invoices from Fauward carry no tax while the exemption stands.' },
    REJECTED: { title: 'Your tax exemption certificate was not accepted', body: `Reason: ${body.reason}. You can upload a new certificate in Settings → Billing.` },
    REVOKED: { title: 'Your tax exemption has ended', body: `Reason: ${body.reason}. New invoices from Fauward include tax again.` }
  };
  await notifyTenantAdmins(app, { tenantId: row.tenantId, event: `tax.exemption_${status.toLowerCase()}`, title: copy[status].title, body: copy[status].body, link: BILLING_LINK });
  return { exemption: { id: updated.id, status: updated.status, decidedAt: updated.decidedAt?.toISOString() ?? null, revokedAt: updated.revokedAt?.toISOString() ?? null }, stripeMirror: mirror };
}

// ── Console: registrations ───────────────────────────────────────────────────

export const registrationBody = z.object({
  region: z.string().trim().min(2).max(60),
  taxId: z.string().trim().min(2).max(60),
  filingFrequency: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']),
  status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE')
});
export const registrationPatchBody = registrationBody.partial().refine((body) => Object.keys(body).length > 0, 'Nothing to change');

function duplicate(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export async function listRegistrations(app: Pick<FastifyInstance, 'prisma'>) {
  const rows = await app.prisma.taxRegistration.findMany({ orderBy: [{ region: 'asc' }, { taxId: 'asc' }] });
  return { data: rows.map((row) => ({ id: row.id, region: row.region, taxId: row.taxId, filingFrequency: row.filingFrequency, status: row.status, updatedAt: row.updatedAt.toISOString() })) };
}

export async function createRegistration(app: FastifyInstance, request: FastifyRequest, body: z.infer<typeof registrationBody>) {
  try {
    return await auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
      const row = await tx.taxRegistration.create({ data: body });
      return {
        result: row,
        audit: { action: 'TAX_REGISTRATION_CREATED', metadata: { registrationId: row.id, region: row.region, taxId: row.taxId } },
        activity: { type: 'tax.registration_created', subjectType: 'tax_registration', subjectId: row.id, summary: `Tax registration added: ${row.region} ${row.taxId}`, consoleLink: '/revenue/tax/registrations' }
      };
    });
  } catch (error) {
    if (duplicate(error)) throw new TaxError(409, 'DUPLICATE_REGISTRATION', 'That region already has this tax id.');
    throw error;
  }
}

export async function patchRegistration(app: FastifyInstance, request: FastifyRequest, id: string, body: z.infer<typeof registrationPatchBody>) {
  const before = await app.prisma.taxRegistration.findUnique({ where: { id } });
  if (!before) throw new TaxError(404, 'REGISTRATION_NOT_FOUND', 'Tax registration not found');
  try {
    return await auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
      const row = await tx.taxRegistration.update({ where: { id }, data: body });
      return {
        result: row,
        audit: { action: 'TAX_REGISTRATION_UPDATED', metadata: { registrationId: id, changes: body } },
        activity: { type: 'tax.registration_updated', subjectType: 'tax_registration', subjectId: id, summary: `Tax registration ${row.region} ${row.taxId}: ${Object.keys(body).join(', ')}`, consoleLink: '/revenue/tax/registrations' }
      };
    });
  } catch (error) {
    if (duplicate(error)) throw new TaxError(409, 'DUPLICATE_REGISTRATION', 'That region already has this tax id.');
    throw error;
  }
}

export async function deleteRegistration(app: FastifyInstance, request: FastifyRequest, id: string) {
  const before = await app.prisma.taxRegistration.findUnique({ where: { id } });
  if (!before) throw new TaxError(404, 'REGISTRATION_NOT_FOUND', 'Tax registration not found');
  return auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    await tx.taxRegistration.delete({ where: { id } });
    return {
      result: { id },
      audit: { action: 'TAX_REGISTRATION_DELETED', metadata: { registrationId: id, region: before.region, taxId: before.taxId } },
      activity: { type: 'tax.registration_deleted', subjectType: 'tax_registration', subjectId: id, summary: `Tax registration removed: ${before.region} ${before.taxId}`, severity: 'ATTENTION' }
    };
  });
}

export async function taxOverview(app: Pick<FastifyInstance, 'prisma'>) {
  const [registrations, pending, exemptTenants] = await Promise.all([
    listRegistrations(app),
    listExemptions(app, { status: 'PENDING' }),
    app.prisma.tenant.count({ where: { taxExempt: true } })
  ]);
  return {
    registrations: registrations.data,
    pendingExemptions: pending.data,
    exemptTenants,
    vendors: { stripeTax: vendorStatus('stripe-tax'), anrok: vendorStatus('anrok'), stripe: vendorStatus('stripe') }
  };
}

/** Invoice note for an exempt tenant, naming when its certificate was approved. */
export async function exemptionInvoiceNote(app: Pick<FastifyInstance, 'prisma'>, tenantId: string) {
  const approved = await app.prisma.taxExemption.findFirst({ where: { tenantId, status: 'APPROVED' }, orderBy: { decidedAt: 'desc' }, select: { decidedAt: true, approvedAt: true } });
  const date = approved?.decidedAt ?? approved?.approvedAt;
  return `Tax exempt${date ? `: exemption certificate approved ${date.toISOString().slice(0, 10)}` : ''}. No tax charged.`;
}
