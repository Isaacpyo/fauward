import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma, type QBRDeck } from '@prisma/client';
import { z } from 'zod';
import { scheduledJobsQueue } from '../queues/queues.js';
import { runWithTenantContext } from '../context/tenant.context.js';
import { systemContext } from '../shared/middleware/tenant.resolver.js';
import { auditedMutation, staffMutationActor } from './console-mutation.js';
import { notifyTenantAdmins } from './platform-notifier.service.js';
import { invoiceBalance } from './platform-billing.service.js';
import { mrrForSubscription } from './revenue/mrr.service.js';
import { atRisk, expansionCandidates } from './customer-success.service.js';

// customer.qbr (WP-4.9). A deck covers one tenant and one calendar quarter. Staff request it; the
// `customer.qbr-generate` job (on the scheduled-jobs queue, like the DSAR jobs) reads real data into sections — usage,
// shipments & SLA, exceptions, support, billing & MRR, health, AI usage, risks & opportunities — and renders HTML.
// A section without data says so. Requesting the same quarter again reuses the deck (one row per tenant + quarter).

export const QBR_GENERATE_JOB = 'customer.qbr-generate';
const SERVICE = 'customer.qbr';
const NO_DATA = 'No data for this period';

export class QbrError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

// ── Periods ──────────────────────────────────────────────────────────────────

export type Quarter = { key: string; start: Date; end: Date };

export function quarterOf(date: Date): Quarter {
  const year = date.getUTCFullYear();
  const q = Math.floor(date.getUTCMonth() / 3);
  return { key: `${year}-Q${q + 1}`, start: new Date(Date.UTC(year, q * 3, 1)), end: new Date(Date.UTC(year, q * 3 + 3, 1)) };
}

/** The last completed quarter (a QBR reviews a finished period). */
export function lastQuarter(now = new Date()): Quarter {
  const current = quarterOf(now);
  return quarterOf(new Date(current.start.getTime() - 1));
}

export function parseQuarter(key: string): Quarter | null {
  const match = /^(\d{4})-Q([1-4])$/.exec(key);
  if (!match) return null;
  return quarterOf(new Date(Date.UTC(Number(match[1]), (Number(match[2]) - 1) * 3, 1)));
}

function monthsIn(period: Quarter) {
  const months: string[] = [];
  for (let date = new Date(period.start); date < period.end; date = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1))) {
    months.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

// ── Sections ─────────────────────────────────────────────────────────────────

export type QbrSection = { key: string; title: string; empty: boolean; emptyText: string | null; items: Array<{ label: string; value: string }>; notes: string[] };

function section(key: string, title: string, items: QbrSection['items'], notes: string[] = []): QbrSection {
  const empty = items.length === 0 && notes.length === 0;
  return { key, title, empty, emptyText: empty ? NO_DATA : null, items, notes };
}

const n = (value: number) => value.toLocaleString('en-GB');
const pct = (part: number, whole: number) => (whole === 0 ? '—' : `${Math.round((part / whole) * 100)}%`);

export async function buildSections(app: Pick<FastifyInstance, 'prisma'>, tenantId: string, period: Quarter): Promise<QbrSection[]> {
  const inPeriod = { gte: period.start, lt: period.end };
  const months = monthsIn(period);
  const tenant = await app.prisma.tenant.findUniqueOrThrow({ where: { id: tenantId }, include: { subscription: true } });

  // Usage
  const usage = await app.prisma.usageRecord.findMany({ where: { tenantId, month: { in: months } } });
  const totals = usage.reduce((sum, row) => ({ shipments: sum.shipments + row.shipments, apiCalls: sum.apiCalls + row.apiCalls, emails: sum.emails + row.emailsSent, sms: sum.sms + row.smsSent }), { shipments: 0, apiCalls: 0, emails: 0, sms: 0 });
  const usageItems = usage.length
    ? [
        { label: 'Shipments counted for billing', value: n(totals.shipments) },
        { label: 'API calls', value: n(totals.apiCalls) },
        { label: 'Emails sent', value: n(totals.emails) },
        { label: 'SMS sent', value: n(totals.sms) }
      ]
    : [];

  // Shipments & SLA
  const shipmentWhere = { tenantId, createdAt: inPeriod };
  const [created, delivered, failed, withPromise, late] = await Promise.all([
    app.prisma.shipment.count({ where: shipmentWhere }),
    app.prisma.shipment.count({ where: { ...shipmentWhere, status: 'DELIVERED' } }),
    app.prisma.shipment.count({ where: { ...shipmentWhere, status: { in: ['FAILED_DELIVERY', 'RETURNED', 'EXCEPTION'] } } }),
    app.prisma.shipment.count({ where: { ...shipmentWhere, status: 'DELIVERED', estimatedDelivery: { not: null }, actualDelivery: { not: null } } }),
    app.prisma.shipment.count({ where: { ...shipmentWhere, status: 'DELIVERED', estimatedDelivery: { not: null }, actualDelivery: { gt: app.prisma.shipment.fields.estimatedDelivery } } })
  ]);
  const lateCount = late;
  const shipmentItems = created
    ? [
        { label: 'Shipments created', value: n(created) },
        { label: 'Delivered', value: `${n(delivered)} (${pct(delivered, created)})` },
        { label: 'Failed, returned or in exception', value: n(failed) },
        ...(withPromise ? [{ label: 'Delivered on time (against the estimate)', value: `${n(withPromise - lateCount)} of ${n(withPromise)} (${pct(withPromise - lateCount, withPromise)})` }] : [])
      ]
    : [];

  // Exceptions
  const exceptions = await app.prisma.exceptionCase.groupBy({ by: ['type'], where: { tenantId, createdAt: inPeriod }, _count: { _all: true } });
  const resolvedExceptions = await app.prisma.exceptionCase.count({ where: { tenantId, createdAt: inPeriod, resolvedAt: { not: null } } });
  const exceptionTotal = exceptions.reduce((sum, row) => sum + row._count._all, 0);
  const exceptionItems = exceptionTotal
    ? [{ label: 'Exceptions raised', value: `${n(exceptionTotal)} (${n(resolvedExceptions)} resolved)` }, ...exceptions.sort((a, b) => b._count._all - a._count._all).slice(0, 5).map((row) => ({ label: row.type.replace(/_/g, ' ').toLowerCase(), value: n(row._count._all) }))]
    : [];

  // Support
  const [customerTickets, fauwardTickets, resolvedTickets] = await Promise.all([
    app.prisma.supportTicket.count({ where: { tenantId, audience: 'END_CUSTOMER', createdAt: inPeriod } }),
    app.prisma.supportTicket.count({ where: { tenantId, audience: 'PLATFORM', createdAt: inPeriod } }),
    app.prisma.supportTicket.count({ where: { tenantId, createdAt: inPeriod, status: { in: ['RESOLVED', 'CLOSED'] } } })
  ]);
  const supportItems =
    customerTickets + fauwardTickets
      ? [
          { label: 'Tickets from your customers', value: n(customerTickets) },
          { label: 'Requests to Fauward', value: n(fauwardTickets) },
          { label: 'Resolved or closed', value: n(resolvedTickets) }
        ]
      : [];

  // Billing & MRR (Fauward billing the tenant, D4)
  const invoices = await app.prisma.invoice.findMany({ where: { kind: 'PLATFORM', tenantId, createdAt: inPeriod, status: { not: 'VOID' } }, include: { payments: { where: { kind: 'PLATFORM' } }, creditNotes: { where: { kind: 'PLATFORM' } } } });
  const mrr = await mrrForSubscription(app.prisma, tenant, tenant.subscription);
  const billingItems: QbrSection['items'] = [];
  if (invoices.length) {
    const byCurrency = new Map<string, { billed: Prisma.Decimal; outstanding: Prisma.Decimal }>();
    for (const invoice of invoices) {
      const current = byCurrency.get(invoice.currency) ?? { billed: new Prisma.Decimal(0), outstanding: new Prisma.Decimal(0) };
      byCurrency.set(invoice.currency, { billed: current.billed.add(invoice.total), outstanding: current.outstanding.add(invoiceBalance(invoice).outstanding) });
    }
    billingItems.push({ label: 'Fauward invoices', value: n(invoices.length) });
    for (const [currency, sums] of byCurrency) billingItems.push({ label: `Billed (${currency})`, value: `${sums.billed.toFixed(2)} ${currency}, ${sums.outstanding.toFixed(2)} outstanding` });
  }
  if (mrr) billingItems.push({ label: 'Current monthly recurring revenue', value: `${mrr.amount} ${mrr.currency} (${tenant.plan})` });

  // Health
  const scores = await app.prisma.tenantHealthScore.findMany({ where: { tenantId, computedAt: inPeriod }, orderBy: { computedAt: 'asc' } });
  const healthItems = scores.length
    ? [
        { label: 'Health score at the start', value: String(scores[0].score) },
        { label: 'Health score at the end', value: `${scores[scores.length - 1].score} (${scores[scores.length - 1].trend})` },
        { label: 'Lowest in the quarter', value: String(Math.min(...scores.map((row) => row.score))) }
      ]
    : [];

  // AI usage
  const ai = await app.prisma.tenantAiUsage.findMany({ where: { tenantId, month: { in: months } } });
  const aiRequests = ai.reduce((sum, row) => sum + row.requestCount, 0);
  const aiCost = ai.reduce((sum, row) => sum.add(new Prisma.Decimal(row.costUsd)), new Prisma.Decimal(0));
  const features = [...new Set(ai.map((row) => row.feature))];
  const aiItems = aiRequests ? [{ label: 'AI requests', value: n(aiRequests) }, { label: 'AI spend', value: `${aiCost.toFixed(2)} USD` }, { label: 'Features used', value: features.join(', ') }] : [];

  // Risks & opportunities (as of generation)
  const [risk, expansion, openEscalations, dunning] = await Promise.all([
    atRisk(app, new Date(), [tenantId]),
    expansionCandidates(app, new Date(), [tenantId]),
    app.prisma.exceptionCase.count({ where: { tenantId, escalatedAt: { not: null }, platformResolvedAt: null } }),
    app.prisma.dunningEnrollment.count({ where: { tenantId, status: { in: ['ACTIVE', 'PAUSED', 'EXHAUSTED'] } } })
  ]);
  const notes = [
    ...(risk.data.find((row) => row.tenant.id === tenantId)?.reasons.map((reason) => `Risk: ${reason}`) ?? []),
    ...(expansion.data.find((row) => row.tenant.id === tenantId)?.signals.map((signal) => `Opportunity: ${signal.limit} at ${Math.round(signal.ratio * 100)}% of the plan limit`) ?? []),
    ...(openEscalations ? [`Risk: ${openEscalations} escalated exception(s) still open with Fauward`] : []),
    ...(dunning ? ['Risk: a Fauward invoice is in dunning'] : [])
  ];

  return [
    section('usage', 'Usage', usageItems),
    section('shipments', 'Shipments & SLA', shipmentItems),
    section('exceptions', 'Exceptions', exceptionItems),
    section('support', 'Support', supportItems),
    section('billing', 'Billing & MRR', billingItems),
    section('health', 'Health', healthItems),
    section('ai', 'AI usage', aiItems),
    section('risks', 'Risks & opportunities', [], notes)
  ];
}

const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);

export function renderHtml(tenantName: string, periodKey: string, sections: QbrSection[], notes: string | null) {
  const body = sections
    .map((item) => {
      const content = item.empty
        ? `<p class="empty">${escapeHtml(item.emptyText ?? NO_DATA)}</p>`
        : `${item.items.length ? `<table>${item.items.map((row) => `<tr><th>${escapeHtml(row.label)}</th><td>${escapeHtml(row.value)}</td></tr>`).join('')}</table>` : ''}${item.notes.length ? `<ul>${item.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>` : ''}`;
      return `<section><h2>${escapeHtml(item.title)}</h2>${content}</section>`;
    })
    .join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(tenantName)} — QBR ${escapeHtml(periodKey)}</title><style>body{font-family:system-ui,sans-serif;max-width:860px;margin:2rem auto;color:#111}h1{color:#0b2545}section{margin:1.5rem 0}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:.35rem .5rem;border-bottom:1px solid #e5e7eb}th{font-weight:500;color:#4b5563;width:55%}.empty{color:#6b7280;font-style:italic}</style></head><body><h1>${escapeHtml(tenantName)} — Quarterly business review ${escapeHtml(periodKey)}</h1>${notes ? `<p>${escapeHtml(notes)}</p>` : ''}\n${body}</body></html>`;
}

// ── Generation ───────────────────────────────────────────────────────────────

export const generateBody = z.object({ period: z.string().regex(/^\d{4}-Q[1-4]$/, 'Period like 2026-Q3').optional() });

/** Creates or reuses the deck for tenant + quarter and queues the generator (a deck already generating is returned as is). */
export async function requestGeneration(app: FastifyInstance, request: FastifyRequest, tenantId: string, body: z.infer<typeof generateBody>) {
  const period = body.period ? parseQuarter(body.period) : lastQuarter();
  if (!period) throw new QbrError(400, 'INVALID_PERIOD', 'Period like 2026-Q3');
  if (period.end > new Date()) throw new QbrError(400, 'PERIOD_NOT_FINISHED', `${period.key} has not finished yet`);
  const tenant = await app.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } });
  if (!tenant) throw new QbrError(404, 'TENANT_NOT_FOUND', 'Tenant not found');
  const existing = await app.prisma.qBRDeck.findUnique({ where: { tenantId_periodKey: { tenantId, periodKey: period.key } } });
  if (existing?.status === 'GENERATING') return { deck: existing, queued: false };
  if (existing?.status === 'SHARED') throw new QbrError(409, 'ALREADY_SHARED', 'This deck was shared with the tenant; it is not regenerated.');

  const deck = await auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    const row = existing
      ? await tx.qBRDeck.update({ where: { id: existing.id }, data: { status: 'GENERATING', error: null, generatedBy: request.platform!.user.id } })
      : await tx.qBRDeck.create({ data: { tenantId, periodKey: period.key, periodStart: period.start, periodEnd: period.end, status: 'GENERATING', generatedBy: request.platform!.user.id, nextQbrAt: new Date(period.end.getTime() + 92 * 86_400_000) } });
    return {
      result: row,
      audit: { action: existing ? 'QBR_REGENERATE_REQUESTED' : 'QBR_GENERATE_REQUESTED', targetTenantId: tenantId, metadata: { deckId: row.id, period: period.key } },
      activity: { type: 'qbr.generation_requested', tenantId, subjectType: 'qbr_deck', subjectId: row.id, summary: `QBR ${period.key} requested for ${tenant.name}`, consoleLink: `/customer/qbr/decks/${row.id}` }
    };
  });
  const jobId = `${QBR_GENERATE_JOB}.${deck.id}.${deck.updatedAt.getTime()}`;
  await scheduledJobsQueue.add(QBR_GENERATE_JOB, { deckId: deck.id }, { jobId, removeOnComplete: 100, removeOnFail: 100 });
  await app.prisma.qBRDeck.update({ where: { id: deck.id }, data: { jobId } });
  return { deck: { ...deck, jobId }, queued: true };
}

/** The job body: build sections, render HTML, store; a failure is recorded on the deck. */
export async function generateDeck(app: Pick<FastifyInstance, 'prisma' | 'log'>, deckId: string) {
  // Workers have no request context: system context, every query below names the tenant.
  return runWithTenantContext(systemContext(), () => generateDeckInContext(app, deckId));
}

async function generateDeckInContext(app: Pick<FastifyInstance, 'prisma' | 'log'>, deckId: string) {
  const deck = await app.prisma.qBRDeck.findUnique({ where: { id: deckId } });
  if (!deck || deck.status !== 'GENERATING') return { skipped: true };
  const tenant = await app.prisma.tenant.findUnique({ where: { id: deck.tenantId }, select: { name: true } });
  const period = (deck.periodKey && parseQuarter(deck.periodKey)) || { key: deck.periodKey ?? '', start: deck.periodStart, end: deck.periodEnd };
  try {
    const sections = await buildSections(app, deck.tenantId, period);
    const html = renderHtml(tenant?.name ?? deck.tenantId, period.key, sections, deck.notes);
    await app.prisma.qBRDeck.updateMany({ where: { id: deck.id, tenantId: deck.tenantId, status: 'GENERATING' }, data: { status: 'DRAFT', sections: sections as unknown as Prisma.InputJsonArray, html, generatedAt: new Date(), error: null } });
    return { deckId, sections: sections.length, empty: sections.filter((item) => item.empty).length };
  } catch (error) {
    app.log.error({ err: error, deckId }, 'QBR generation failed');
    await app.prisma.qBRDeck.updateMany({ where: { id: deck.id, tenantId: deck.tenantId }, data: { status: 'FAILED', error: error instanceof Error ? error.message.slice(0, 1000) : 'Generation failed' } });
    throw error;
  }
}

// ── Reads and staff actions ──────────────────────────────────────────────────

function presentDeck(row: QBRDeck, tenant?: { id: string; name: string; slug: string } | null) {
  return {
    id: row.id,
    tenant: tenant ?? { id: row.tenantId, name: row.tenantId, slug: null },
    period: row.periodKey,
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd.toISOString(),
    status: row.status,
    notes: row.notes,
    generatedAt: row.generatedAt?.toISOString() ?? null,
    error: row.error,
    sharedAt: row.sharedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString()
  };
}

async function tenantMap(app: Pick<FastifyInstance, 'prisma'>, ids: string[]) {
  const unique = [...new Set(ids)];
  const rows = unique.length ? await app.prisma.tenant.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, slug: true } }) : [];
  return new Map(rows.map((row) => [row.id, row]));
}

export async function qbrOverview(app: Pick<FastifyInstance, 'prisma'>, now = new Date()) {
  const quarter = lastQuarter(now);
  const [decks, active] = await Promise.all([
    app.prisma.qBRDeck.findMany({ orderBy: { updatedAt: 'desc' }, take: 100 }),
    app.prisma.tenant.findMany({ where: { status: 'ACTIVE', createdAt: { lt: quarter.start } }, select: { id: true, name: true, slug: true }, orderBy: { name: 'asc' }, take: 500 })
  ]);
  const covered = new Set((await app.prisma.qBRDeck.findMany({ where: { periodKey: quarter.key }, select: { tenantId: true } })).map((row) => row.tenantId));
  const tenants = await tenantMap(app, decks.map((row) => row.tenantId));
  return { decks: decks.map((row) => presentDeck(row, tenants.get(row.tenantId) ?? null)), due: { period: quarter.key, tenants: active.filter((tenant) => !covered.has(tenant.id)) } };
}

export async function tenantDecks(app: Pick<FastifyInstance, 'prisma'>, tenantId: string) {
  const [tenant, decks] = await Promise.all([app.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, slug: true } }), app.prisma.qBRDeck.findMany({ where: { tenantId }, orderBy: { periodEnd: 'desc' } })]);
  if (!tenant) return null;
  return { tenant, decks: decks.map((row) => presentDeck(row, tenant)), nextPeriod: lastQuarter().key };
}

export async function getDeck(app: Pick<FastifyInstance, 'prisma'>, id: string) {
  const row = await app.prisma.qBRDeck.findUnique({ where: { id } });
  if (!row) return null;
  const tenants = await tenantMap(app, [row.tenantId]);
  return { ...presentDeck(row, tenants.get(row.tenantId) ?? null), sections: (row.sections as unknown as QbrSection[] | null) ?? [], hasHtml: Boolean(row.html) };
}

export const deckPatchBody = z
  .object({ notes: z.string().trim().max(5000).nullable().optional(), status: z.enum(['DRAFT', 'READY']).optional() })
  .refine((body) => body.notes !== undefined || body.status !== undefined, 'Nothing to change');

export async function patchDeck(app: FastifyInstance, request: FastifyRequest, id: string, body: z.infer<typeof deckPatchBody>) {
  const deck = await app.prisma.qBRDeck.findUnique({ where: { id } });
  if (!deck) throw new QbrError(404, 'DECK_NOT_FOUND', 'Deck not found');
  if (deck.status === 'GENERATING' || deck.status === 'FAILED' || deck.status === 'SHARED') throw new QbrError(409, 'INVALID_STATE', `A ${deck.status.toLowerCase()} deck cannot be edited.`);
  const tenant = await app.prisma.tenant.findUnique({ where: { id: deck.tenantId }, select: { name: true } });
  const sections = (deck.sections as unknown as QbrSection[] | null) ?? [];
  const notes = body.notes !== undefined ? body.notes : deck.notes;
  return auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    const row = await tx.qBRDeck.update({ where: { id }, data: { ...(body.notes !== undefined ? { notes: body.notes, html: renderHtml(tenant?.name ?? deck.tenantId, deck.periodKey ?? '', sections, notes) } : {}), ...(body.status ? { status: body.status } : {}) } });
    return {
      result: presentDeck(row),
      audit: { action: 'QBR_DECK_UPDATED', targetTenantId: deck.tenantId, metadata: { deckId: id, fields: Object.keys(body) } },
      activity: { type: 'qbr.updated', tenantId: deck.tenantId, subjectType: 'qbr_deck', subjectId: id, summary: `QBR ${deck.periodKey}: ${Object.keys(body).join(', ')}`, consoleLink: `/customer/qbr/decks/${id}` }
    };
  });
}

export async function shareDeck(app: FastifyInstance, request: FastifyRequest, id: string) {
  const deck = await app.prisma.qBRDeck.findUnique({ where: { id } });
  if (!deck) throw new QbrError(404, 'DECK_NOT_FOUND', 'Deck not found');
  if (deck.status !== 'READY') throw new QbrError(409, 'NOT_READY', 'Mark the deck ready before sharing it.');
  const now = new Date();
  const row = await auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    const updated = await tx.qBRDeck.update({ where: { id }, data: { status: 'SHARED', sharedAt: now, sharedBy: request.platform!.user.id } });
    return {
      result: updated,
      audit: { action: 'QBR_DECK_SHARED', targetTenantId: deck.tenantId, metadata: { deckId: id, period: deck.periodKey } },
      activity: { type: 'qbr.shared', tenantId: deck.tenantId, subjectType: 'qbr_deck', subjectId: id, summary: `QBR ${deck.periodKey} shared with the tenant`, consoleLink: `/customer/qbr/decks/${id}` }
    };
  });
  const notified = await notifyTenantAdmins(app, { tenantId: deck.tenantId, event: 'qbr.shared', title: `Your quarterly business review for ${deck.periodKey} is ready`, body: 'A summary of your usage, deliveries, support and billing for the quarter.', link: `/reports/qbr/${id}` });
  return { deck: presentDeck(row), notified };
}

/** Tenant side: a deck shared with this tenant (TENANT_ADMIN). */
export async function tenantSharedDeck(app: Pick<FastifyInstance, 'prisma'>, tenantId: string, id: string) {
  const row = await app.prisma.qBRDeck.findFirst({ where: { id, tenantId, status: 'SHARED' } });
  if (!row) return null;
  return { id: row.id, period: row.periodKey, periodStart: row.periodStart.toISOString(), periodEnd: row.periodEnd.toISOString(), notes: row.notes, sharedAt: row.sharedAt?.toISOString() ?? null, sections: (row.sections as unknown as QbrSection[] | null) ?? [] };
}

export async function deckHtml(app: Pick<FastifyInstance, 'prisma'>, id: string) {
  const row = await app.prisma.qBRDeck.findUnique({ where: { id }, select: { html: true, periodKey: true, tenantId: true } });
  return row?.html ? row : null;
}
