import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma, type KYCReview, type SanctionsScreening } from '@prisma/client';
import { z } from 'zod';
import { auditedMutation, staffMutationActor } from './console-mutation.js';
import { exportStorageFor, postgresExportStorage } from './export-storage.js';
import { recordAndPublishActivity, SYSTEM_ACTOR } from './platform-activity.service.js';
import { notifyStaff, notifyTenantAdmins } from './platform-notifier.service.js';
import { staffPermissionContextForPlatformUser } from './staff-iam.service.js';
import { complyAdvantageAdapter } from './vendors/complyadvantage.adapter.js';
import { personaAdapter } from './vendors/persona.adapter.js';
import { vendorStatus } from './vendors/index.js';

// trust.kyc (WP-4.10). The vendor-free path is a manual queue: staff open a review for a tenant (the tenant is asked
// for documents), evidence is attached by staff or uploaded by the tenant, and a decision (APPROVED / REJECTED, with a
// reason) sets Tenant.kycStatus. Persona, when configured, can back a review with an inquiry. Sanctions screenings
// (monthly rescreen, manual, ComplyAdvantage webhook) are decided CLEAR or MATCH by staff; a MATCH raises a LEGAL safety
// signal for a suspension decision — never a suspension by itself. ENTERPRISE needs kycStatus APPROVED.

const SERVICE = 'trust.kyc';
export const KYC_STATUSES = ['PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED'] as const;
export const EVIDENCE_TYPES = ['application/pdf', 'image/png', 'image/jpeg'] as const;
const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
const OPEN_SCREENING = ['PENDING'];

export class KycError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

/** The KYC consumer (D-ENT): ENTERPRISE (override, plan change, contract) only for tenants whose KYC is approved. */
export async function assertKycForEnterprise(db: Pick<FastifyInstance['prisma'], 'tenant'>, tenantId: string) {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { kycStatus: true } });
  if (tenant?.kycStatus !== 'APPROVED') throw new KycError(409, 'KYC_REQUIRED', 'ENTERPRISE needs an approved KYC review for this tenant (Trust → KYC).', { kycStatus: tenant?.kycStatus ?? null });
}

type Evidence = { id: string; source: 'STAFF' | 'TENANT'; fileName: string; contentType: string; byteSize: number; storageProvider: string; storageKey: string; note: string | null; by: string; at: string };

function evidenceOf(row: Pick<KYCReview, 'evidence'>): Evidence[] {
  return Array.isArray(row.evidence) ? (row.evidence as unknown as Evidence[]) : [];
}

function presentReview(row: KYCReview, tenant?: { id: string; name: string; slug: string; kycStatus: string } | null) {
  return {
    id: row.id,
    tenant: tenant ?? { id: row.tenantId, name: row.tenantId, slug: null, kycStatus: null },
    provider: row.provider,
    inquiryId: row.inquiryId,
    status: row.status,
    requestNote: row.requestNote,
    evidence: evidenceOf(row).map(({ storageKey: _key, storageProvider: _provider, ...item }) => item),
    decisionReason: row.decisionReason,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    reviewedBy: row.reviewedBy,
    createdAt: row.createdAt.toISOString()
  };
}

function presentScreening(row: SanctionsScreening, tenant?: { id: string; name: string; slug: string } | null) {
  return {
    id: row.id,
    tenant: tenant ?? { id: row.tenantId, name: row.tenantId, slug: null },
    provider: row.provider,
    source: row.source,
    status: row.status,
    matchType: row.matchType,
    riskLevel: row.riskLevel,
    decisionReason: row.decisionReason,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    reviewedBy: row.reviewedBy,
    createdAt: row.createdAt.toISOString()
  };
}

async function tenantMap(app: Pick<FastifyInstance, 'prisma'>, ids: string[]) {
  const unique = [...new Set(ids)];
  const rows = unique.length ? await app.prisma.tenant.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, slug: true, kycStatus: true } }) : [];
  return new Map(rows.map((row) => [row.id, row]));
}

// ── Reviews ──────────────────────────────────────────────────────────────────

export const reviewListQuery = z.object({ status: z.enum(['OPEN', 'APPROVED', 'REJECTED', 'ALL']).default('OPEN') });
export const openReviewBody = z.object({ tenantId: z.string().min(1), provider: z.enum(['manual', 'persona']).default('manual'), note: z.string().trim().max(2000).optional() });
export const evidenceBody = z.object({ fileName: z.string().trim().min(1).max(200), contentType: z.enum(EVIDENCE_TYPES), dataBase64: z.string().min(1), note: z.string().trim().max(1000).optional() });
export const reviewDecisionBody = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), reason: z.string().trim().min(8) });

export async function listReviews(app: Pick<FastifyInstance, 'prisma'>, query: z.infer<typeof reviewListQuery>) {
  const rows = await app.prisma.kYCReview.findMany({ where: query.status === 'ALL' ? {} : { status: query.status }, orderBy: { createdAt: query.status === 'OPEN' ? 'asc' : 'desc' }, take: 200 });
  const tenants = await tenantMap(app, rows.map((row) => row.tenantId));
  return { data: rows.map((row) => presentReview(row, tenants.get(row.tenantId) ?? null)), persona: vendorStatus('persona') };
}

export async function getReview(app: Pick<FastifyInstance, 'prisma'>, id: string) {
  const row = await app.prisma.kYCReview.findUnique({ where: { id } });
  if (!row) return null;
  const tenants = await tenantMap(app, [row.tenantId]);
  const screenings = await app.prisma.sanctionsScreening.findMany({ where: { tenantId: row.tenantId }, orderBy: { createdAt: 'desc' }, take: 20 });
  return { ...presentReview(row, tenants.get(row.tenantId) ?? null), screenings: screenings.map((item) => presentScreening(item)) };
}

export async function openReview(app: FastifyInstance, request: FastifyRequest, body: z.infer<typeof openReviewBody>) {
  const tenant = await app.prisma.tenant.findUnique({ where: { id: body.tenantId }, select: { id: true, name: true } });
  if (!tenant) throw new KycError(404, 'TENANT_NOT_FOUND', 'Tenant not found');
  const open = await app.prisma.kYCReview.findFirst({ where: { tenantId: tenant.id, status: 'OPEN' }, select: { id: true } });
  if (open) throw new KycError(409, 'REVIEW_OPEN', 'This tenant already has an open review.', { reviewId: open.id });
  let inquiry: { inquiryId: string | null; status: string | null } | null = null;
  if (body.provider === 'persona') {
    if (!personaAdapter.isConfigured()) throw new KycError(409, 'VENDOR_NOT_CONFIGURED', 'Persona is not configured; open a manual review.', { missing: personaAdapter.missingEnv() });
    inquiry = await personaAdapter.createInquiry({ referenceId: tenant.id, name: tenant.name });
  }
  const review = await auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    const row = await tx.kYCReview.create({
      data: { tenantId: tenant.id, provider: body.provider, inquiryId: inquiry?.inquiryId ?? null, status: 'OPEN', requestNote: body.note ?? null, openedBy: request.platform!.user.id, evidence: [], ...(inquiry ? { payload: inquiry as Prisma.InputJsonObject } : {}) }
    });
    await tx.tenant.update({ where: { id: tenant.id }, data: { kycStatus: 'IN_REVIEW' } });
    return {
      result: row,
      audit: { action: 'KYC_REVIEW_OPENED', targetTenantId: tenant.id, metadata: { reviewId: row.id, provider: body.provider, inquiryId: row.inquiryId } },
      activity: { type: 'kyc.review_opened', tenantId: tenant.id, subjectType: 'kyc_review', subjectId: row.id, summary: `KYC review opened for ${tenant.name} (${body.provider})`, consoleLink: `/trust/kyc/${row.id}` }
    };
  });
  await notifyTenantAdmins(app, {
    tenantId: tenant.id,
    event: 'kyc.documents_requested',
    title: 'Fauward needs to verify your business',
    body: body.note ?? 'Upload your company registration and proof of address in Settings → Verification.',
    link: '/settings?tab=verification'
  });
  return presentReview(review);
}

async function storeEvidence(app: FastifyInstance, review: KYCReview, input: z.infer<typeof evidenceBody>, source: Evidence['source'], by: string) {
  const bytes = Buffer.from(input.dataBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (bytes.byteLength === 0) throw new KycError(400, 'EMPTY_FILE', 'The file is empty.');
  if (bytes.byteLength > MAX_EVIDENCE_BYTES) throw new KycError(413, 'FILE_TOO_LARGE', 'Files must be 10 MB or smaller.');
  const stored = await postgresExportStorage(app.prisma).put(review.tenantId, bytes);
  const item: Evidence = { id: randomUUID(), source, fileName: input.fileName, contentType: input.contentType, byteSize: stored.byteSize, storageProvider: stored.provider, storageKey: stored.key, note: input.note ?? null, by, at: new Date().toISOString() };
  return item;
}

export async function attachStaffEvidence(app: FastifyInstance, request: FastifyRequest, id: string, body: z.infer<typeof evidenceBody>) {
  const review = await app.prisma.kYCReview.findUnique({ where: { id } });
  if (!review) throw new KycError(404, 'REVIEW_NOT_FOUND', 'KYC review not found');
  if (review.status !== 'OPEN') throw new KycError(409, 'REVIEW_CLOSED', 'Evidence can only be added to an open review.');
  const item = await storeEvidence(app, review, body, 'STAFF', request.platform!.user.id);
  const updated = await auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    const row = await tx.kYCReview.update({ where: { id }, data: { evidence: [...evidenceOf(review), item] as unknown as Prisma.InputJsonArray } });
    return {
      result: row,
      audit: { action: 'KYC_EVIDENCE_ADDED', targetTenantId: review.tenantId, metadata: { reviewId: id, evidenceId: item.id, fileName: item.fileName, source: 'STAFF' } },
      activity: { type: 'kyc.evidence_added', tenantId: review.tenantId, subjectType: 'kyc_review', subjectId: id, summary: `Evidence added to the KYC review: ${item.fileName}`, consoleLink: `/trust/kyc/${id}` }
    };
  });
  return presentReview(updated);
}

/** Tenant side: TENANT_ADMIN uploads a document to its open review (ACC-KYC-4). */
export async function attachTenantDocument(app: FastifyInstance, input: { tenantId: string; userId: string; userEmail: string | null; body: z.infer<typeof evidenceBody> }) {
  const review = await app.prisma.kYCReview.findFirst({ where: { tenantId: input.tenantId, status: 'OPEN' } });
  if (!review) throw new KycError(409, 'NO_OPEN_REVIEW', 'Fauward has not asked for verification documents.');
  const item = await storeEvidence(app, review, input.body, 'TENANT', input.userId);
  const claimed = await app.prisma.kYCReview.updateMany({ where: { id: review.id, tenantId: input.tenantId, status: 'OPEN', updatedAt: review.updatedAt }, data: { evidence: [...evidenceOf(review), item] as unknown as Prisma.InputJsonArray } });
  if (claimed.count !== 1) throw new KycError(409, 'REVIEW_CHANGED', 'The review changed; try the upload again.');
  await recordAndPublishActivity(app, {
    service: SERVICE,
    type: 'kyc.document_uploaded',
    tenantId: input.tenantId,
    actorType: 'TENANT_USER',
    actorId: input.userId,
    actorLabel: input.userEmail ?? 'Tenant admin',
    subjectType: 'kyc_review',
    subjectId: review.id,
    summary: `Tenant uploaded a verification document: ${item.fileName}`,
    severity: 'ATTENTION',
    consoleLink: `/trust/kyc/${review.id}`,
    dedupeKey: `kyc.document_uploaded:${item.id}`
  });
  await notifyStaff(app, { permission: 'trust.kyc.approve', event: 'kyc.document_uploaded', title: 'A tenant uploaded KYC documents', body: item.fileName, link: `/trust/kyc/${review.id}`, tenantId: input.tenantId });
  return tenantVerification(app, input.tenantId);
}

export async function tenantVerification(app: Pick<FastifyInstance, 'prisma'>, tenantId: string) {
  const [tenant, review] = await Promise.all([
    app.prisma.tenant.findUnique({ where: { id: tenantId }, select: { kycStatus: true } }),
    app.prisma.kYCReview.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' } })
  ]);
  return {
    kycStatus: tenant?.kycStatus ?? 'PENDING',
    review: review
      ? { id: review.id, status: review.status, requestNote: review.requestNote, documents: evidenceOf(review).filter((item) => item.source === 'TENANT').map((item) => ({ id: item.id, fileName: item.fileName, at: item.at })), decisionReason: review.status === 'REJECTED' ? review.decisionReason : null }
      : null
  };
}

export async function evidenceFile(app: Pick<FastifyInstance, 'prisma'>, reviewId: string, evidenceId: string) {
  const review = await app.prisma.kYCReview.findUnique({ where: { id: reviewId } });
  const item = review ? evidenceOf(review).find((entry) => entry.id === evidenceId) : null;
  if (!review || !item) return null;
  const storage = exportStorageFor(app.prisma, item.storageProvider);
  const bytes = storage ? await storage.get(review.tenantId, item.storageKey) : null;
  return bytes ? { bytes, contentType: item.contentType, fileName: item.fileName } : null;
}

export async function decideReview(app: FastifyInstance, request: FastifyRequest, id: string, body: z.infer<typeof reviewDecisionBody>) {
  const review = await app.prisma.kYCReview.findUnique({ where: { id } });
  if (!review) throw new KycError(404, 'REVIEW_NOT_FOUND', 'KYC review not found');
  if (review.status !== 'OPEN') throw new KycError(409, 'REVIEW_CLOSED', `This review is already ${review.status.toLowerCase()}.`);
  if (body.decision === 'APPROVED') {
    // A PEP or sanctions match still open needs senior compliance sign-off.
    const pep = await app.prisma.sanctionsScreening.findFirst({ where: { tenantId: review.tenantId, OR: [{ matchType: 'PEP', status: { in: ['MATCH', 'PENDING'] } }, { status: 'MATCH' }] }, select: { id: true } });
    if (pep) {
      const context = await staffPermissionContextForPlatformUser(app.prisma, request.platform!.user);
      if (!context.roles.includes('COMPLIANCE_ADMIN') && !context.roles.includes('ROOT')) throw new KycError(403, 'SENIOR_APPROVAL_REQUIRED', 'A PEP or sanctions match needs a COMPLIANCE_ADMIN to approve.', { requiredRole: 'COMPLIANCE_ADMIN' });
    }
  }
  const tenant = await app.prisma.tenant.findUnique({ where: { id: review.tenantId }, select: { name: true } });
  const now = new Date();
  const updated = await auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    const claimed = await tx.kYCReview.updateMany({ where: { id, tenantId: review.tenantId, status: 'OPEN' }, data: { status: body.decision, decision: body.decision, decisionReason: body.reason, decidedAt: now, reviewedBy: request.platform!.user.id } });
    if (claimed.count !== 1) throw new KycError(409, 'REVIEW_CLOSED', 'The review was decided by someone else.');
    await tx.tenant.update({ where: { id: review.tenantId }, data: { kycStatus: body.decision } });
    return {
      result: await tx.kYCReview.findUniqueOrThrow({ where: { id } }),
      audit: { action: `KYC_REVIEW_${body.decision}`, targetTenantId: review.tenantId, reason: body.reason, metadata: { reviewId: id, evidence: evidenceOf(review).length } },
      activity: { type: `kyc.review_${body.decision.toLowerCase()}`, tenantId: review.tenantId, subjectType: 'kyc_review', subjectId: id, summary: `KYC ${body.decision.toLowerCase()} for ${tenant?.name ?? review.tenantId}`, severity: body.decision === 'REJECTED' ? 'ATTENTION' : 'INFO', consoleLink: `/trust/kyc/${id}` }
    };
  });
  await notifyTenantAdmins(app, {
    tenantId: review.tenantId,
    event: `kyc.${body.decision.toLowerCase()}`,
    title: body.decision === 'APPROVED' ? 'Your business verification is approved' : 'Your business verification was not approved',
    body: body.decision === 'APPROVED' ? 'Thank you — no further documents are needed.' : `Reason: ${body.reason}`,
    link: '/settings?tab=verification'
  });
  return presentReview(updated);
}

// ── Screenings ───────────────────────────────────────────────────────────────

export const screeningListQuery = z.object({ status: z.enum(['PENDING', 'CLEAR', 'MATCH', 'ALL']).default('PENDING'), matchType: z.string().trim().max(40).optional() });
export const screeningDecisionBody = z.object({ decision: z.enum(['CLEAR', 'MATCH']), reason: z.string().trim().min(8), matchType: z.enum(['SANCTIONS', 'PEP', 'ADVERSE_MEDIA']).optional() });
export const screenBody = z.object({ tenantId: z.string().min(1) });

export async function listScreenings(app: Pick<FastifyInstance, 'prisma'>, query: z.infer<typeof screeningListQuery>) {
  const rows = await app.prisma.sanctionsScreening.findMany({ where: { ...(query.status === 'ALL' ? {} : { status: query.status }), ...(query.matchType ? { matchType: query.matchType } : {}) }, orderBy: { createdAt: 'desc' }, take: 200 });
  const tenants = await tenantMap(app, rows.map((row) => row.tenantId));
  return { data: rows.map((row) => presentScreening(row, tenants.get(row.tenantId) ?? null)), complyAdvantage: vendorStatus('complyadvantage') };
}

/** A screening for one tenant: ComplyAdvantage search when configured, else a PENDING row staff decide by hand. */
export async function createScreening(app: Pick<FastifyInstance, 'prisma' | 'log'>, tenantId: string, source: 'MANUAL' | 'MONTHLY_RESCREEN') {
  const tenant = await app.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } });
  if (!tenant) throw new KycError(404, 'TENANT_NOT_FOUND', 'Tenant not found');
  let provider = 'manual';
  let payload: Prisma.InputJsonObject = { searchTerm: tenant.name };
  if (complyAdvantageAdapter.isConfigured()) {
    try {
      const search = await complyAdvantageAdapter.createSearch({ searchTerm: tenant.name, referenceId: tenant.id });
      provider = 'complyadvantage';
      payload = { searchTerm: tenant.name, search: search as Prisma.InputJsonObject };
    } catch (error) {
      app.log.error({ err: error, tenantId }, 'ComplyAdvantage search failed; the screening stays for manual review');
      payload = { searchTerm: tenant.name, vendorError: error instanceof Error ? error.message : 'vendor error' };
    }
  }
  return app.prisma.sanctionsScreening.create({ data: { tenantId: tenant.id, provider, status: 'PENDING', source, payload } });
}

export async function manualScreen(app: FastifyInstance, request: FastifyRequest, tenantId: string) {
  const row = await createScreening(app, tenantId, 'MANUAL');
  await auditedMutation(app, SERVICE, staffMutationActor(request), async () => ({
    result: null,
    audit: { action: 'KYC_SCREENING_STARTED', targetTenantId: tenantId, metadata: { screeningId: row.id, provider: row.provider } },
    activity: { type: 'kyc.screening_started', tenantId, subjectType: 'sanctions_screening', subjectId: row.id, summary: `Sanctions screening started (${row.provider})`, consoleLink: '/trust/kyc/sanctions' }
  }));
  return presentScreening(row);
}

/** `trust.kyc-rescreen-monthly`: one PENDING screening per active tenant per month (re-run safe). */
export async function monthlyRescreen(app: Pick<FastifyInstance, 'prisma' | 'log'>, now = new Date()) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const tenants = await app.prisma.tenant.findMany({ where: { status: 'ACTIVE' }, select: { id: true, name: true } });
  const done = new Set((await app.prisma.sanctionsScreening.findMany({ where: { source: 'MONTHLY_RESCREEN', createdAt: { gte: monthStart } }, select: { tenantId: true } })).map((row) => row.tenantId));
  const due = tenants.filter((tenant) => !done.has(tenant.id));
  if (!complyAdvantageAdapter.isConfigured()) {
    // Vendor-free: one PENDING row per tenant for staff to clear or match.
    await app.prisma.sanctionsScreening.createMany({ data: due.map((tenant) => ({ tenantId: tenant.id, provider: 'manual', status: 'PENDING', source: 'MONTHLY_RESCREEN', payload: { searchTerm: tenant.name } })) });
    return { tenants: tenants.length, created: due.length, provider: 'manual' };
  }
  for (const tenant of due) await createScreening(app, tenant.id, 'MONTHLY_RESCREEN');
  return { tenants: tenants.length, created: due.length, provider: 'complyadvantage' };
}

export async function decideScreening(app: FastifyInstance, request: FastifyRequest, id: string, body: z.infer<typeof screeningDecisionBody>) {
  const screening = await app.prisma.sanctionsScreening.findUnique({ where: { id } });
  if (!screening) throw new KycError(404, 'SCREENING_NOT_FOUND', 'Screening not found');
  if (!OPEN_SCREENING.includes(screening.status)) throw new KycError(409, 'SCREENING_DECIDED', `This screening is already ${screening.status.toLowerCase()}.`);
  const tenant = await app.prisma.tenant.findUnique({ where: { id: screening.tenantId }, select: { id: true, name: true } });
  const now = new Date();
  const result = await auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    const claimed = await tx.sanctionsScreening.updateMany({ where: { id, tenantId: screening.tenantId, status: { in: OPEN_SCREENING } }, data: { status: body.decision, decisionReason: body.reason, decidedAt: now, reviewedBy: request.platform!.user.id, ...(body.matchType ? { matchType: body.matchType } : {}) } });
    if (claimed.count !== 1) throw new KycError(409, 'SCREENING_DECIDED', 'The screening was decided by someone else.');
    // A match goes to Trust & Safety as a LEGAL signal; suspending is a separate decision there (D3).
    const signal =
      body.decision === 'MATCH'
        ? await tx.fraudSignal.create({ data: { tenantId: screening.tenantId, source: 'kyc_screening', signalType: `sanctions_${(body.matchType ?? screening.matchType ?? 'SANCTIONS').toLowerCase()}`, category: 'LEGAL', severity: 'HIGH', payload: { screeningId: id, reason: body.reason, matchType: body.matchType ?? screening.matchType } } })
        : null;
    return {
      result: { screening: await tx.sanctionsScreening.findUniqueOrThrow({ where: { id } }), signalId: signal?.id ?? null },
      audit: { action: `KYC_SCREENING_${body.decision}`, targetTenantId: screening.tenantId, reason: body.reason, metadata: { screeningId: id, matchType: body.matchType ?? screening.matchType, signalId: signal?.id ?? null } },
      activity: { type: body.decision === 'MATCH' ? 'kyc.screening_match' : 'kyc.screening_clear', tenantId: screening.tenantId, subjectType: 'sanctions_screening', subjectId: id, summary: `${tenant?.name ?? screening.tenantId}: screening ${body.decision === 'MATCH' ? 'MATCH — a LEGAL signal is open for a decision' : 'clear'}`, severity: body.decision === 'MATCH' ? 'CRITICAL' : 'INFO', consoleLink: body.decision === 'MATCH' ? '/trust/safety/signals' : '/trust/kyc/sanctions' }
    };
  });
  if (result.signalId) {
    await notifyStaff(app, { permission: 'trust.safety.suspend', event: 'kyc.screening_match', title: `Sanctions/PEP match for ${tenant?.name ?? screening.tenantId}`, body: 'A LEGAL safety signal is open for a suspension decision.', link: `/trust/safety/signals?signal=${result.signalId}`, severity: 'CRITICAL', tenantId: screening.tenantId });
  }
  return { screening: presentScreening(result.screening), signalId: result.signalId };
}

// ── Vendor webhooks (HMAC-verified in the routes) ───────────────────────────

export async function applyPersonaWebhook(app: Pick<FastifyInstance, 'prisma' | 'redis' | 'log'>, input: { inquiryId: string | null; tenantId: string | null; status: string; payload: Prisma.InputJsonObject }) {
  const review = input.inquiryId ? await app.prisma.kYCReview.findFirst({ where: { inquiryId: input.inquiryId } }) : null;
  if (!review) return { matched: false };
  // Persona's verdict is evidence for staff; the decision stays manual (ACC-KYC-5 updates the review, never the tenant).
  await app.prisma.kYCReview.update({ where: { id: review.id }, data: { payload: input.payload } });
  await recordAndPublishActivity(app, { service: SERVICE, type: 'kyc.inquiry_updated', tenantId: review.tenantId, ...SYSTEM_ACTOR, actorLabel: 'Persona', subjectType: 'kyc_review', subjectId: review.id, summary: `Persona inquiry ${input.inquiryId}: ${input.status}`, consoleLink: `/trust/kyc/${review.id}` });
  return { matched: true, reviewId: review.id };
}

export async function applyComplyAdvantageWebhook(app: Pick<FastifyInstance, 'prisma'>, input: { tenantId: string; matchType: string | null; riskLevel: string | null; payload: Prisma.InputJsonObject }) {
  const tenant = await app.prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { id: true } });
  if (!tenant) return null;
  // A vendor hit is a PENDING screening for staff to decide (CLEAR or MATCH).
  return app.prisma.sanctionsScreening.create({ data: { tenantId: tenant.id, provider: 'complyadvantage', status: 'PENDING', source: 'WEBHOOK', matchType: input.matchType, riskLevel: input.riskLevel, payload: input.payload } });
}
