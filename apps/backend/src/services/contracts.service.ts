import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma, type ContractApproval, type MsaAgreement, type SalesQuote } from '@prisma/client';
import { z } from 'zod';
import { config } from '../config/index.js';
import { planService } from '../modules/tenants/plan.service.js';
import { auditedMutation, type MutationActor } from './console-mutation.js';
import { exportStorageFor, postgresExportStorage } from './export-storage.js';
import { assertKycForEnterprise, KycError } from './kyc.service.js';
import { SYSTEM_ACTOR, staffActor } from './platform-activity.service.js';
import { notifyStaff } from './platform-notifier.service.js';
import { renderPdf, type PdfLine } from './quote-pdf.js';
import { applyPlanChange } from './subscription.service.js';
import { docusignAdapter } from './vendors/docusign.adapter.js';

// gtm.contracts (WP-4.19). A quote is priced from the plan list price (or an entered price for ENTERPRISE) less its
// discount. Submitting it routes it: a discount above config.cpq.discountApprovalPercent or a term over 24 months
// creates a DRAFT CustomContract and a PENDING ContractApproval that someone holding gtm.contracts.discount.large (not
// the author) decides. An approved quote is sent (DocuSign envelope with the generated PDF and the signer when
// configured, else SENT + PDF download), then accepted (manual signed-PDF upload or DocuSign "completed"): that writes
// the MsaAgreement, makes the CustomContract ACTIVE with the net monthly amount (read by MRR), adds an ACTIVE
// PricingOverride for the discount and moves the tenant to the quoted plan.

const SERVICE = 'gtm.contracts';
const PLANS = ['STARTER', 'PRO', 'ENTERPRISE'] as const;
const EDITABLE = ['DRAFT', 'REJECTED'];
const MAX_SIGNED_PDF_BYTES = 10 * 1024 * 1024;

export class ContractError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {}
  ) {
    super(message);
  }
}

type ContractsApp = FastifyInstance;

const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Use a positive amount with at most two decimals');

const quoteFields = z.object({
  tenantId: z.string().min(1).nullable().optional(),
  dealId: z.string().min(1).nullable().optional(),
  plan: z.enum(PLANS),
  billingCycle: z.enum(['MONTHLY', 'ANNUAL']).default('MONTHLY'),
  termMonths: z.number().int().min(1).max(60),
  discountPercent: z.number().min(0).max(100).default(0),
  listMonthly: money.optional(),
  currency: z.string().regex(/^[A-Z]{3}$/).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  customFeatures: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  signerName: z.string().trim().min(1).max(200).nullable().optional(),
  signerEmail: z.string().trim().email().max(200).nullable().optional()
});

export const createQuoteBody = quoteFields;
export const updateQuoteBody = quoteFields.partial().refine((body) => Object.values(body).some((value) => value !== undefined), 'Nothing to change');
export const listQuotesQuery = z.object({ status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'SENT', 'ACCEPTED']).optional(), tenantId: z.string().min(1).optional() });
export const approvalsQuery = z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'ALL']).default('PENDING') });
export const decisionBody = z.object({ decision: z.enum(['APPROVED', 'REJECTED']), conditions: z.string().trim().max(2000).optional(), reason: z.string().trim().min(8) });
export const acceptBody = z.object({
  fileName: z.string().trim().min(1).max(200),
  contentType: z.literal('application/pdf'),
  dataBase64: z.string().min(1),
  governingLaw: z.string().trim().max(200).optional(),
  reason: z.string().trim().min(8)
});

// ── Pricing ──────────────────────────────────────────────────────────────────

type Pricing = { listMonthly: Prisma.Decimal; netMonthly: Prisma.Decimal; currency: string };

function priceQuote(input: { plan: string; billingCycle: string; discountPercent: number | Prisma.Decimal; listMonthly?: string | null; currency?: string | null }): Pricing {
  const price = planService.getPrice(input.plan);
  let list: Prisma.Decimal;
  let currency: string;
  if (price) {
    list = input.billingCycle === 'ANNUAL' ? new Prisma.Decimal(price.annual).div(12) : new Prisma.Decimal(price.monthly);
    currency = price.currency;
  } else {
    if (!input.listMonthly || !input.currency) throw new ContractError(400, 'PRICE_REQUIRED', `${input.plan} has no list price: enter the monthly price and currency.`);
    list = new Prisma.Decimal(input.listMonthly);
    currency = input.currency;
  }
  const discount = new Prisma.Decimal(input.discountPercent);
  const net = list.mul(new Prisma.Decimal(100).sub(discount)).div(100);
  return { listMonthly: list.toDecimalPlaces(2), netMonthly: net.toDecimalPlaces(2), currency };
}

/** Why a quote needs a large-discount approver (empty when it does not). */
export function approvalReasons(quote: { discountPercent: Prisma.Decimal | number; termMonths: number }) {
  const reasons: string[] = [];
  const limit = config.cpq.discountApprovalPercent;
  if (new Prisma.Decimal(quote.discountPercent).gt(limit)) reasons.push(`Discount above ${limit}%`);
  if (quote.termMonths > config.cpq.maxTermMonthsWithoutApproval) reasons.push(`Term over ${config.cpq.maxTermMonthsWithoutApproval} months`);
  return reasons;
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

function contractTerms(quote: SalesQuote) {
  return {
    sourceQuoteId: quote.id,
    quoteNumber: quote.quoteNumber,
    plan: quote.plan,
    billingCycle: quote.billingCycle,
    monthlyAmount: quote.netMonthly?.toFixed(2) ?? null,
    listMonthly: quote.listMonthly?.toFixed(2) ?? null,
    currency: quote.currency,
    discountPercent: quote.discountPercent.toFixed(2),
    termMonths: quote.termMonths,
    customFeatures: Array.isArray(quote.customFeatures) ? quote.customFeatures : []
  };
}

// ── Presenting ───────────────────────────────────────────────────────────────

async function tenantLabels(app: Pick<FastifyInstance, 'prisma'>, ids: Array<string | null>) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const rows = unique.length ? await app.prisma.tenant.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, slug: true, plan: true, kycStatus: true } }) : [];
  return new Map(rows.map((row) => [row.id, row]));
}

function presentApproval(row: ContractApproval) {
  return {
    id: row.id,
    contractId: row.contractId,
    quoteId: row.quoteId,
    status: row.status,
    reasons: Array.isArray(row.reasons) ? row.reasons.filter((item): item is string => typeof item === 'string') : [],
    requestedBy: row.requestedBy,
    approverId: row.approverId,
    conditions: row.conditions,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString()
  };
}

function presentMsa(row: MsaAgreement) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    quoteId: row.quoteId,
    contractId: row.contractId,
    signedVia: row.signedVia,
    signatureDate: row.signatureDate?.toISOString() ?? null,
    expiryDate: row.expiryDate?.toISOString() ?? null,
    governingLaw: row.governingLaw,
    fileName: row.fileName,
    documentUrl: row.storageKey ? `/contracts/msas/${row.id}/document` : row.documentUrl,
    createdAt: row.createdAt.toISOString()
  };
}

function presentQuote(row: SalesQuote, tenants: Awaited<ReturnType<typeof tenantLabels>>) {
  const tenant = row.tenantId ? tenants.get(row.tenantId) : undefined;
  return {
    id: row.id,
    quoteNumber: row.quoteNumber,
    tenant: row.tenantId ? { id: row.tenantId, name: tenant?.name ?? row.tenantId, slug: tenant?.slug ?? null, plan: tenant?.plan ?? null, kycStatus: tenant?.kycStatus ?? null } : null,
    dealId: row.dealId,
    plan: row.plan,
    billingCycle: row.billingCycle,
    termMonths: row.termMonths,
    discountPercent: row.discountPercent.toFixed(2),
    listMonthly: row.listMonthly?.toFixed(2) ?? null,
    netMonthly: row.netMonthly?.toFixed(2) ?? null,
    currency: row.currency,
    startDate: row.startDate?.toISOString().slice(0, 10) ?? null,
    customFeatures: Array.isArray(row.customFeatures) ? row.customFeatures.filter((item): item is string => typeof item === 'string') : [],
    notes: row.notes,
    signerName: row.signerName,
    signerEmail: row.signerEmail,
    status: row.status,
    contractId: row.contractId,
    docusignEnvelopeId: row.docusignEnvelopeId,
    needsApproval: approvalReasons(row),
    createdBy: row.createdBy,
    approvedBy: row.approvedBy,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    sentAt: row.sentAt?.toISOString() ?? null,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    pdfUrl: `/contracts/quotes/${row.id}/pdf`,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export type PresentedQuote = ReturnType<typeof presentQuote>;

async function presentQuotes(app: Pick<FastifyInstance, 'prisma'>, rows: SalesQuote[]) {
  const tenants = await tenantLabels(app, rows.map((row) => row.tenantId));
  return rows.map((row) => presentQuote(row, tenants));
}

async function quoteOr404(app: Pick<FastifyInstance, 'prisma'>, id: string) {
  const row = await app.prisma.salesQuote.findUnique({ where: { id } });
  if (!row) throw new ContractError(404, 'QUOTE_NOT_FOUND', 'Quote not found');
  return row;
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function listQuotes(app: Pick<FastifyInstance, 'prisma'>, query: z.infer<typeof listQuotesQuery>) {
  const rows = await app.prisma.salesQuote.findMany({
    where: { ...(query.status ? { status: query.status } : {}), ...(query.tenantId ? { tenantId: query.tenantId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: 200
  });
  return { data: await presentQuotes(app, rows), approvalThresholdPercent: config.cpq.discountApprovalPercent, docusign: docusignAdapter.isConfigured() ? { configured: true } : { configured: false, missing: docusignAdapter.missingEnv() } };
}

export async function getQuote(app: Pick<FastifyInstance, 'prisma'>, id: string) {
  const row = await quoteOr404(app, id);
  const [[quote], approvals, msa] = await Promise.all([
    presentQuotes(app, [row]),
    app.prisma.contractApproval.findMany({ where: { quoteId: id }, orderBy: { createdAt: 'desc' } }),
    app.prisma.msaAgreement.findUnique({ where: { quoteId: id } })
  ]);
  return {
    ...quote,
    approvals: approvals.map(presentApproval),
    msa: msa ? presentMsa(msa) : null,
    approvalThresholdPercent: config.cpq.discountApprovalPercent,
    docusign: docusignAdapter.isConfigured() ? { configured: true } : { configured: false, missing: docusignAdapter.missingEnv() }
  };
}

export async function listApprovals(app: Pick<FastifyInstance, 'prisma'>, query: z.infer<typeof approvalsQuery>) {
  const rows = await app.prisma.contractApproval.findMany({ where: query.status === 'ALL' ? {} : { status: query.status }, orderBy: { createdAt: 'asc' }, take: 200 });
  const quoteIds = rows.flatMap((row) => (row.quoteId ? [row.quoteId] : []));
  const quotes = quoteIds.length ? await app.prisma.salesQuote.findMany({ where: { id: { in: quoteIds } } }) : [];
  const presented = new Map((await presentQuotes(app, quotes)).map((quote) => [quote.id, quote]));
  return { data: rows.map((row) => ({ ...presentApproval(row), quote: row.quoteId ? presented.get(row.quoteId) ?? null : null })) };
}

export async function listMsas(app: Pick<FastifyInstance, 'prisma'>, now = new Date()) {
  const rows = await app.prisma.msaAgreement.findMany({ orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }], take: 200 });
  const tenants = await tenantLabels(app, rows.map((row) => row.tenantId));
  return {
    data: rows.map((row) => {
      const tenant = tenants.get(row.tenantId);
      const daysToRenewal = row.expiryDate ? Math.ceil((row.expiryDate.getTime() - now.getTime()) / 86_400_000) : null;
      return { ...presentMsa(row), tenant: { id: row.tenantId, name: tenant?.name ?? row.tenantId, slug: tenant?.slug ?? null }, daysToRenewal };
    })
  };
}

/** Quotes with a discount, grouped by their real status (ACC-CPQ-4). */
export async function discountsView(app: Pick<FastifyInstance, 'prisma'>) {
  const rows = await app.prisma.salesQuote.findMany({ where: { discountPercent: { gt: 0 } }, orderBy: { createdAt: 'desc' }, take: 500 });
  const quotes = await presentQuotes(app, rows);
  const order = ['PENDING_APPROVAL', 'DRAFT', 'APPROVED', 'SENT', 'ACCEPTED', 'REJECTED'];
  const groups = order
    .map((status) => {
      const inGroup = quotes.filter((quote) => quote.status === status);
      const average = inGroup.length ? inGroup.reduce((sum, quote) => sum.add(quote.discountPercent), new Prisma.Decimal(0)).div(inGroup.length).toFixed(2) : null;
      return { status, count: inGroup.length, averageDiscountPercent: average, quotes: inGroup };
    })
    .filter((group) => group.count > 0);
  return { groups, approvalThresholdPercent: config.cpq.discountApprovalPercent };
}

export async function quotePdf(app: Pick<FastifyInstance, 'prisma'>, id: string) {
  const row = await quoteOr404(app, id);
  const tenant = row.tenantId ? await app.prisma.tenant.findUnique({ where: { id: row.tenantId }, select: { name: true } }) : null;
  return { bytes: buildQuotePdf(row, tenant?.name ?? null), fileName: `${row.quoteNumber}.pdf` };
}

export function buildQuotePdf(row: SalesQuote, tenantName: string | null) {
  const features = Array.isArray(row.customFeatures) ? row.customFeatures.filter((item): item is string => typeof item === 'string') : [];
  const lines: PdfLine[] = [
    { text: `Fauward quote ${row.quoteNumber}`, bold: true, size: 16 },
    { text: '' },
    { text: `Customer: ${tenantName ?? 'to be confirmed'}` },
    { text: `Plan: ${row.plan} (${row.billingCycle === 'ANNUAL' ? 'billed annually' : 'billed monthly'})` },
    { text: `Term: ${row.termMonths} months${row.startDate ? ` from ${row.startDate.toISOString().slice(0, 10)}` : ''}` },
    { text: `List price per month: ${row.listMonthly?.toFixed(2) ?? '-'} ${row.currency ?? ''}` },
    { text: `Discount: ${row.discountPercent.toFixed(2)}%` },
    { text: `Price per month: ${row.netMonthly?.toFixed(2) ?? '-'} ${row.currency ?? ''}`, bold: true },
    ...(features.length ? [{ text: '' }, { text: 'Included custom features:', bold: true }, ...features.map((feature) => ({ text: `- ${feature}` }))] : []),
    ...(row.notes ? [{ text: '' }, { text: 'Notes:', bold: true }, { text: row.notes }] : []),
    { text: '' },
    { text: `Signer: ${row.signerName ?? '__________________'}${row.signerEmail ? ` <${row.signerEmail}>` : ''}` },
    { text: '' },
    { text: 'Signature: ______________________________     Date: ______________' }
  ];
  return renderPdf(lines);
}

// ── Changes ──────────────────────────────────────────────────────────────────

async function checkTenant(app: Pick<FastifyInstance, 'prisma'>, tenantId: string | null | undefined) {
  if (!tenantId) return null;
  const tenant = await app.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, status: true } });
  if (!tenant || tenant.status === 'DEMO') throw new ContractError(400, 'TENANT_NOT_FOUND', 'Choose an existing customer tenant.');
  return tenant;
}

function quoteNumber(now: Date) {
  return `Q-${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

export async function createQuote(app: ContractsApp, actor: MutationActor, staffId: string, body: z.infer<typeof createQuoteBody>, now = new Date()) {
  const tenant = await checkTenant(app, body.tenantId);
  const pricing = priceQuote(body);
  const created = await auditedMutation(app, SERVICE, actor, async (tx) => {
    const quote = await tx.salesQuote.create({
      data: {
        tenantId: tenant?.id ?? null,
        dealId: body.dealId ?? null,
        quoteNumber: quoteNumber(now),
        plan: body.plan,
        billingCycle: body.billingCycle,
        termMonths: body.termMonths,
        discountPercent: new Prisma.Decimal(body.discountPercent).toDecimalPlaces(2),
        listMonthly: pricing.listMonthly,
        netMonthly: pricing.netMonthly,
        currency: pricing.currency,
        startDate: body.startDate ? new Date(`${body.startDate}T00:00:00.000Z`) : null,
        customFeatures: body.customFeatures ?? [],
        notes: body.notes ?? null,
        signerName: body.signerName ?? null,
        signerEmail: body.signerEmail ?? null,
        status: 'DRAFT',
        createdBy: staffId
      }
    });
    return {
      result: quote,
      audit: { action: 'QUOTE_CREATED', targetTenantId: quote.tenantId, metadata: { quoteId: quote.id, quoteNumber: quote.quoteNumber, plan: quote.plan, discountPercent: quote.discountPercent.toFixed(2) } },
      activity: { type: 'quote.created', tenantId: quote.tenantId, subjectType: 'sales_quote', subjectId: quote.id, summary: `Quote ${quote.quoteNumber} created (${quote.plan}, ${quote.discountPercent.toFixed(2)}% off)`, consoleLink: `/gtm/contracts/quotes/${quote.id}` }
    };
  });
  return getQuote(app, created.id);
}

export async function updateQuote(app: ContractsApp, actor: MutationActor, id: string, body: z.infer<typeof updateQuoteBody>) {
  const row = await quoteOr404(app, id);
  if (!EDITABLE.includes(row.status)) throw new ContractError(409, 'QUOTE_LOCKED', `A ${row.status.toLowerCase().replace('_', ' ')} quote cannot be edited.`);
  const tenant = body.tenantId !== undefined ? await checkTenant(app, body.tenantId) : undefined;
  const merged = {
    plan: body.plan ?? row.plan,
    billingCycle: body.billingCycle ?? row.billingCycle,
    discountPercent: body.discountPercent ?? Number(row.discountPercent),
    listMonthly: body.listMonthly ?? row.listMonthly?.toFixed(2) ?? null,
    currency: body.currency ?? row.currency
  };
  const pricing = priceQuote(merged);
  const data: Prisma.SalesQuoteUncheckedUpdateManyInput = {
    ...(tenant !== undefined ? { tenantId: tenant?.id ?? null } : {}),
    ...(body.dealId !== undefined ? { dealId: body.dealId } : {}),
    ...(body.plan !== undefined ? { plan: body.plan } : {}),
    ...(body.billingCycle !== undefined ? { billingCycle: body.billingCycle } : {}),
    ...(body.termMonths !== undefined ? { termMonths: body.termMonths } : {}),
    ...(body.discountPercent !== undefined ? { discountPercent: new Prisma.Decimal(body.discountPercent).toDecimalPlaces(2) } : {}),
    ...(body.startDate !== undefined ? { startDate: body.startDate ? new Date(`${body.startDate}T00:00:00.000Z`) : null } : {}),
    ...(body.customFeatures !== undefined ? { customFeatures: body.customFeatures } : {}),
    ...(body.notes !== undefined ? { notes: body.notes } : {}),
    ...(body.signerName !== undefined ? { signerName: body.signerName } : {}),
    ...(body.signerEmail !== undefined ? { signerEmail: body.signerEmail } : {}),
    listMonthly: pricing.listMonthly,
    netMonthly: pricing.netMonthly,
    currency: pricing.currency,
    // Editing a rejected quote starts it again as a draft.
    status: 'DRAFT'
  };
  await auditedMutation(app, SERVICE, actor, async (tx) => {
    const claimed = await tx.salesQuote.updateMany({ where: { id, status: row.status, updatedAt: row.updatedAt }, data });
    if (claimed.count !== 1) throw new ContractError(409, 'QUOTE_CHANGED', 'The quote changed; reload and try again.');
    return {
      result: null,
      audit: { action: 'QUOTE_UPDATED', targetTenantId: row.tenantId, metadata: { quoteId: id, changes: Object.keys(body), from: row.status } },
      activity: { type: 'quote.updated', tenantId: row.tenantId, subjectType: 'sales_quote', subjectId: id, summary: `Quote ${row.quoteNumber} edited`, consoleLink: `/gtm/contracts/quotes/${id}` }
    };
  });
  return getQuote(app, id);
}

export async function submitQuote(app: ContractsApp, actor: MutationActor, staffId: string, id: string, now = new Date()) {
  const row = await quoteOr404(app, id);
  if (row.status !== 'DRAFT') throw new ContractError(409, 'NOT_DRAFT', `Only a draft can be submitted (this quote is ${row.status.toLowerCase().replace('_', ' ')}).`);
  if (!row.tenantId) throw new ContractError(400, 'TENANT_REQUIRED', 'Link the quote to a tenant before submitting it.');
  const reasons = approvalReasons(row);
  const outcome = await auditedMutation(app, SERVICE, actor, async (tx) => {
    let contractId: string | null = row.contractId;
    let approvalId: string | null = null;
    if (reasons.length) {
      const start = row.startDate ?? now;
      const contract = await tx.customContract.create({ data: { tenantId: row.tenantId!, termStart: start, termEnd: addMonths(start, row.termMonths), terms: contractTerms(row), status: 'DRAFT' } });
      contractId = contract.id;
      approvalId = (await tx.contractApproval.create({ data: { contractId: contract.id, quoteId: row.id, requestedBy: staffId, reasons, status: 'PENDING' } })).id;
    }
    const status = reasons.length ? 'PENDING_APPROVAL' : 'APPROVED';
    const claimed = await tx.salesQuote.updateMany({ where: { id, status: 'DRAFT', updatedAt: row.updatedAt }, data: { status, submittedAt: now, contractId } });
    if (claimed.count !== 1) throw new ContractError(409, 'QUOTE_CHANGED', 'The quote changed; reload and try again.');
    return {
      result: { status, approvalId },
      audit: { action: reasons.length ? 'QUOTE_APPROVAL_REQUESTED' : 'QUOTE_APPROVED', targetTenantId: row.tenantId, metadata: { quoteId: id, reasons, contractId, approvalId } },
      activity: {
        type: reasons.length ? 'quote.approval_requested' : 'quote.approved',
        tenantId: row.tenantId,
        subjectType: 'sales_quote',
        subjectId: id,
        summary: reasons.length ? `Quote ${row.quoteNumber} needs approval: ${reasons.join(', ')}` : `Quote ${row.quoteNumber} approved (within the discount limit)`,
        severity: reasons.length ? 'ATTENTION' : 'INFO',
        consoleLink: `/gtm/contracts/quotes/${id}`
      }
    };
  });
  if (outcome.approvalId) {
    await notifyStaff(app, {
      permission: 'gtm.contracts.discount.large',
      excludePlatformUserIds: [row.createdBy, staffId],
      event: 'contracts.approval_requested',
      title: `Quote ${row.quoteNumber} needs your approval (${reasons.join(', ')})`,
      link: '/gtm/contracts/approvals',
      severity: 'ATTENTION',
      tenantId: row.tenantId
    });
  }
  return getQuote(app, id);
}

export async function decideApproval(app: ContractsApp, request: FastifyRequest, approvalId: string, body: z.infer<typeof decisionBody>, now = new Date()) {
  const staffId = request.platform!.user.id;
  const approval = await app.prisma.contractApproval.findUnique({ where: { id: approvalId } });
  if (!approval || !approval.quoteId) throw new ContractError(404, 'APPROVAL_NOT_FOUND', 'Approval not found');
  if (approval.status !== 'PENDING') throw new ContractError(409, 'ALREADY_DECIDED', `This approval was already ${approval.status.toLowerCase()}.`);
  const quote = await quoteOr404(app, approval.quoteId);
  if (quote.createdBy === staffId || approval.requestedBy === staffId) throw new ContractError(403, 'SELF_APPROVAL', 'Someone other than the quote author must decide.');
  const approved = body.decision === 'APPROVED';
  await auditedMutation(app, SERVICE, { kind: 'staff', request }, async (tx) => {
    const claimed = await tx.contractApproval.updateMany({
      where: { id: approvalId, status: 'PENDING' },
      data: { status: body.decision, approverId: staffId, conditions: body.conditions ?? null, decidedAt: now, ...(approved ? { approvedAt: now } : {}) }
    });
    if (claimed.count !== 1) throw new ContractError(409, 'ALREADY_DECIDED', 'This approval was already decided.');
    await tx.salesQuote.updateMany({ where: { id: quote.id, status: 'PENDING_APPROVAL' }, data: { status: approved ? 'APPROVED' : 'REJECTED', ...(approved ? { approvedBy: staffId } : {}) } });
    if (!approved && quote.tenantId) await tx.customContract.updateMany({ where: { id: approval.contractId, tenantId: quote.tenantId, status: 'DRAFT' }, data: { status: 'REJECTED' } });
    return {
      result: null,
      audit: { action: approved ? 'QUOTE_DISCOUNT_APPROVED' : 'QUOTE_DISCOUNT_REJECTED', targetTenantId: quote.tenantId, reason: body.reason, metadata: { quoteId: quote.id, approvalId, discountPercent: quote.discountPercent.toFixed(2), conditions: body.conditions ?? null } },
      activity: { type: approved ? 'quote.approved' : 'quote.rejected', tenantId: quote.tenantId, subjectType: 'sales_quote', subjectId: quote.id, summary: `Quote ${quote.quoteNumber} ${approved ? 'approved' : 'rejected'}${body.conditions ? ` with conditions: ${body.conditions}` : ''}`, consoleLink: `/gtm/contracts/quotes/${quote.id}` }
    };
  });
  await notifyStaff(app, { platformUserIds: [quote.createdBy], event: approved ? 'contracts.quote_approved' : 'contracts.quote_rejected', title: `Quote ${quote.quoteNumber} was ${approved ? 'approved' : 'rejected'}`, body: body.conditions, link: `/gtm/contracts/quotes/${quote.id}`, tenantId: quote.tenantId });
  return getQuote(app, quote.id);
}

export async function sendQuote(app: ContractsApp, actor: MutationActor, id: string, now = new Date()) {
  const row = await quoteOr404(app, id);
  if (row.status !== 'APPROVED') throw new ContractError(409, 'NOT_APPROVED', 'Only an approved quote can be sent.');
  let envelopeId: string | null = null;
  if (docusignAdapter.isConfigured()) {
    if (!row.signerName || !row.signerEmail) throw new ContractError(400, 'SIGNER_REQUIRED', 'Add the signer name and email before sending through DocuSign.');
    const tenant = row.tenantId ? await app.prisma.tenant.findUnique({ where: { id: row.tenantId }, select: { name: true } }) : null;
    const pdf = buildQuotePdf(row, tenant?.name ?? null);
    const envelope = await docusignAdapter.createEnvelope({
      emailSubject: `Fauward quote ${row.quoteNumber} for signature`,
      document: { name: `${row.quoteNumber}.pdf`, fileExtension: 'pdf', base64: pdf.toString('base64') },
      signers: [{ name: row.signerName, email: row.signerEmail }],
      metadata: { quoteId: row.id }
    });
    envelopeId = envelope.envelopeId;
  }
  const delivery = envelopeId ? 'DOCUSIGN' : 'MANUAL';
  await auditedMutation(app, SERVICE, actor, async (tx) => {
    const claimed = await tx.salesQuote.updateMany({ where: { id, status: 'APPROVED' }, data: { status: 'SENT', sentAt: now, docusignEnvelopeId: envelopeId } });
    if (claimed.count !== 1) throw new ContractError(409, 'QUOTE_CHANGED', 'The quote changed; reload and try again.');
    return {
      result: null,
      audit: { action: 'QUOTE_SENT', targetTenantId: row.tenantId, metadata: { quoteId: id, delivery, envelopeId } },
      activity: { type: 'quote.sent', tenantId: row.tenantId, subjectType: 'sales_quote', subjectId: id, summary: `Quote ${row.quoteNumber} sent ${delivery === 'DOCUSIGN' ? 'through DocuSign' : 'as a PDF'}`, consoleLink: `/gtm/contracts/quotes/${id}` }
    };
  });
  return { quote: await getQuote(app, id), delivery };
}

type Acceptance = { signedVia: 'MANUAL' | 'DOCUSIGN'; pdf: { bytes: Buffer; fileName: string } | null; governingLaw?: string | null; reason?: string | null; acceptedBy: string | null };

/**
 * Accepts a sent (or approved) quote: MSA with the signed PDF, CustomContract ACTIVE (the net monthly amount MRR reads),
 * PricingOverride ACTIVE for the discount, quote ACCEPTED; then moves the tenant to the quoted plan.
 */
export async function acceptQuote(app: FastifyInstance, actor: MutationActor, id: string, acceptance: Acceptance, now = new Date()) {
  const row = await quoteOr404(app, id);
  if (row.status !== 'SENT' && row.status !== 'APPROVED') throw new ContractError(409, 'NOT_SENT', `Only an approved or sent quote can be accepted (this one is ${row.status.toLowerCase().replace('_', ' ')}).`);
  if (!row.tenantId) throw new ContractError(400, 'TENANT_REQUIRED', 'Link the quote to a tenant first.');
  const tenantId = row.tenantId;
  if (row.plan === 'ENTERPRISE') {
    try {
      await assertKycForEnterprise(app.prisma, tenantId);
    } catch (error) {
      if (error instanceof KycError) throw new ContractError(error.statusCode, error.code, error.message, error.extra);
      throw error;
    }
  }
  const stored = acceptance.pdf ? await postgresExportStorage(app.prisma).put(tenantId, acceptance.pdf.bytes) : null;
  const start = row.startDate ?? now;
  const end = addMonths(start, row.termMonths);
  const result = await auditedMutation(app, SERVICE, actor, async (tx) => {
    const claimed = await tx.salesQuote.updateMany({
      where: { id, status: row.status, updatedAt: row.updatedAt },
      data: { status: 'ACCEPTED', acceptedAt: now, acceptedBy: acceptance.acceptedBy, ...(stored ? { signedPdfS3Key: stored.key, signedPdfProvider: stored.provider, signedPdfFileName: acceptance.pdf!.fileName } : {}) }
    });
    if (claimed.count !== 1) throw new ContractError(409, 'QUOTE_CHANGED', 'The quote changed; reload and try again.');
    const terms = contractTerms(row);
    let contract;
    if (row.contractId) {
      await tx.customContract.updateMany({ where: { id: row.contractId, tenantId }, data: { status: 'ACTIVE', signedAt: now, termStart: start, termEnd: end, terms } });
      contract = await tx.customContract.findFirstOrThrow({ where: { id: row.contractId, tenantId } });
    } else {
      contract = await tx.customContract.create({ data: { tenantId, termStart: start, termEnd: end, terms, status: 'ACTIVE', signedAt: now } });
    }
    const msa = await tx.msaAgreement.create({
      data: {
        tenantId,
        quoteId: id,
        contractId: contract.id,
        signedVia: acceptance.signedVia,
        signatureDate: now,
        expiryDate: end,
        governingLaw: acceptance.governingLaw ?? null,
        renewalTerms: { termMonths: row.termMonths, renewsOn: end.toISOString() },
        storageProvider: stored?.provider ?? null,
        storageKey: stored?.key ?? null,
        fileName: acceptance.pdf?.fileName ?? null
      }
    });
    await tx.customContract.updateMany({ where: { id: contract.id, tenantId }, data: { msaUrl: `/contracts/msas/${msa.id}/document` } });
    const override = row.discountPercent.gt(0)
      ? await tx.pricingOverride.create({
          data: { tenantId, contractId: contract.id, ruleType: 'discount_percent', ruleValue: { discountPercent: row.discountPercent.toFixed(2), sourceQuoteId: id }, discountPercent: row.discountPercent, validFrom: start, validTo: end, status: 'ACTIVE' }
        })
      : null;
    return {
      result: { contractId: contract.id, msaId: msa.id, overrideId: override?.id ?? null },
      audit: { action: 'QUOTE_ACCEPTED', targetTenantId: tenantId, reason: acceptance.reason ?? null, metadata: { quoteId: id, contractId: contract.id, msaId: msa.id, overrideId: override?.id ?? null, signedVia: acceptance.signedVia, netMonthly: row.netMonthly?.toFixed(2) ?? null } },
      activity: { type: 'quote.accepted', tenantId, subjectType: 'sales_quote', subjectId: id, summary: `Quote ${row.quoteNumber} signed: ${row.plan} at ${row.netMonthly?.toFixed(2) ?? '-'} ${row.currency ?? ''}/month for ${row.termMonths} months`, severity: 'ATTENTION', consoleLink: `/gtm/contracts/quotes/${id}` }
    };
  });
  const tenant = await app.prisma.tenant.findUnique({ where: { id: tenantId }, include: { subscription: true } });
  const currentPlan = tenant?.subscription?.plan ?? tenant?.plan;
  if (tenant && currentPlan !== row.plan) {
    await applyPlanChange(app, {
      tenantId,
      toPlan: row.plan as (typeof PLANS)[number],
      billingCycle: row.billingCycle === 'ANNUAL' ? 'ANNUAL' : 'MONTHLY',
      source: 'CONSOLE',
      actor: actor.kind === 'staff' ? staffActor(actor.request) : { ...SYSTEM_ACTOR, actorLabel: actor.label }
    });
  }
  return { quote: await getQuote(app, id), ...result };
}

export async function acceptWithUpload(app: FastifyInstance, request: FastifyRequest, id: string, body: z.infer<typeof acceptBody>) {
  const bytes = Buffer.from(body.dataBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (bytes.byteLength === 0) throw new ContractError(400, 'EMPTY_FILE', 'The signed PDF is empty.');
  if (bytes.byteLength > MAX_SIGNED_PDF_BYTES) throw new ContractError(413, 'FILE_TOO_LARGE', 'The signed PDF must be 10 MB or smaller.');
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') throw new ContractError(400, 'NOT_A_PDF', 'Upload the signed contract as a PDF.');
  return acceptQuote(app, { kind: 'staff', request }, id, { signedVia: 'MANUAL', pdf: { bytes, fileName: body.fileName }, governingLaw: body.governingLaw ?? null, reason: body.reason, acceptedBy: request.platform!.user.id });
}

const DOCUSIGN_ACTOR: MutationActor = { kind: 'system', id: 'docusign', label: 'DocuSign' };

/** DocuSign Connect "completed" → the accept flow (signed PDF stored when the payload carries it). */
export async function handleDocusignCompleted(app: FastifyInstance, envelopeId: string, pdfBase64: string | null) {
  const quote = await app.prisma.salesQuote.findUnique({ where: { docusignEnvelopeId: envelopeId } });
  if (!quote) return { ignored: true as const, reason: 'quote not found' };
  if (quote.status === 'ACCEPTED') return { ignored: true as const, reason: 'already accepted' };
  const bytes = pdfBase64 ? Buffer.from(pdfBase64, 'base64') : null;
  const accepted = await acceptQuote(app, DOCUSIGN_ACTOR, quote.id, { signedVia: 'DOCUSIGN', pdf: bytes && bytes.byteLength > 0 ? { bytes, fileName: `${quote.quoteNumber}-signed.pdf` } : null, acceptedBy: null });
  return { ignored: false as const, quoteId: quote.id, contractId: accepted.contractId, msaId: accepted.msaId };
}

export async function msaDocument(app: Pick<FastifyInstance, 'prisma'>, id: string) {
  const row = await app.prisma.msaAgreement.findUnique({ where: { id } });
  if (!row?.storageKey) return null;
  const storage = exportStorageFor(app.prisma, row.storageProvider);
  const bytes = storage ? await storage.get(row.tenantId, row.storageKey) : null;
  return bytes ? { bytes, fileName: row.fileName ?? `msa-${row.id}.pdf` } : null;
}
