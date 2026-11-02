import type { FastifyInstance } from 'fastify';
import { Prisma, type SalesDeal } from '@prisma/client';
import { z } from 'zod';
import { DEAL_STAGES, DEFAULT_STAGE_PROBABILITY, HUBSPOT_STAGE_MAP, OPEN_DEAL_STAGES, type DealStage } from '../config/pipeline.js';
import { auditedMutation, type MutationActor } from './console-mutation.js';
import { hubspotAdapter, type HubspotDeal } from './vendors/hubspot.adapter.js';
import { vendorStatus } from './vendors/index.js';

// gtm.pipeline (WP-4.18). Deals are created and edited in the console (or imported from HubSpot when configured);
// the forecast is Σ amount × probability by close month over open deals. For a deal linked to a tenant the console is the
// source of truth: the HubSpot import never overwrites it. Every change is audited; a deal linked to a tenant puts its
// activity on that tenant's timeline (C360).

const SERVICE = 'gtm.pipeline';
const LIST_LIMIT = 500;

export class PipelineError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

type PipelineApp = Pick<FastifyInstance, 'prisma' | 'redis' | 'log'>;

const money = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Amount must be a positive number with at most two decimals');
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD date');

export const listDealsQuery = z.object({
  stage: z.enum(DEAL_STAGES).optional(),
  owner: z.string().trim().min(1).max(200).optional(),
  closeMonth: z.string().regex(/^\d{4}-\d{2}$/, 'Use a YYYY-MM month').optional(),
  tenantId: z.string().min(1).optional()
});

export const createDealBody = z.object({
  name: z.string().trim().min(1).max(200),
  stage: z.enum(DEAL_STAGES).default('PROSPECTING'),
  amount: money,
  probability: z.number().min(0).max(100).optional(),
  closeDate: dateOnly.nullable().optional(),
  ownerEmail: z.string().trim().email().max(200).nullable().optional(),
  tenantId: z.string().min(1).nullable().optional(),
  notes: z.string().trim().max(4000).nullable().optional()
});

export const updateDealBody = createDealBody
  .partial()
  .extend({ stage: z.enum(DEAL_STAGES).optional() })
  .refine((body) => Object.values(body).some((value) => value !== undefined), 'Nothing to change');

export const forecastQuery = z.object({ months: z.coerce.number().int().min(1).max(24).default(6) });

function monthKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthRange(month: string) {
  const [year, index] = month.split('-').map(Number);
  return { gte: new Date(Date.UTC(year, index - 1, 1)), lt: new Date(Date.UTC(year, index, 1)) };
}

function toDate(value: string | null | undefined) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

async function tenantsFor(app: Pick<FastifyInstance, 'prisma'>, ids: string[]) {
  const unique = [...new Set(ids)];
  const rows = unique.length ? await app.prisma.tenant.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, slug: true, status: true } }) : [];
  return new Map(rows.map((row) => [row.id, row]));
}

function present(row: SalesDeal, tenants: Map<string, { id: string; name: string; slug: string; status: string }>) {
  const tenant = row.tenantId ? tenants.get(row.tenantId) : undefined;
  return {
    id: row.id,
    name: row.name,
    stage: row.stage,
    amount: row.amount.toFixed(2),
    probability: Number(row.probability),
    weighted: row.amount.mul(row.probability).div(100).toFixed(2),
    closeDate: row.closeDate?.toISOString().slice(0, 10) ?? null,
    ownerEmail: row.ownerEmail,
    tenant: row.tenantId ? { id: row.tenantId, name: tenant?.name ?? row.tenantId, slug: tenant?.slug ?? null } : null,
    notes: row.notes,
    source: row.source,
    hubspotDealId: row.hubspotDealId,
    hubspotSyncedAt: row.hubspotSyncedAt?.toISOString() ?? null,
    wonAt: row.wonAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

export type PresentedDeal = ReturnType<typeof present>;

async function presentAll(app: Pick<FastifyInstance, 'prisma'>, rows: SalesDeal[]) {
  const tenants = await tenantsFor(app, rows.flatMap((row) => (row.tenantId ? [row.tenantId] : [])));
  return rows.map((row) => present(row, tenants));
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function listDeals(app: Pick<FastifyInstance, 'prisma'>, query: z.infer<typeof listDealsQuery>) {
  const where: Prisma.SalesDealWhereInput = {
    ...(query.stage ? { stage: query.stage } : {}),
    ...(query.owner ? { ownerEmail: query.owner } : {}),
    ...(query.closeMonth ? { closeDate: monthRange(query.closeMonth) } : {}),
    ...(query.tenantId ? { tenantId: query.tenantId } : {})
  };
  const [rows, total, byStage, owners] = await Promise.all([
    app.prisma.salesDeal.findMany({ where, orderBy: [{ closeDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }], take: LIST_LIMIT }),
    app.prisma.salesDeal.count({ where }),
    app.prisma.salesDeal.groupBy({ by: ['stage'], where, _count: { _all: true }, _sum: { amount: true } }),
    app.prisma.salesDeal.findMany({ where: { ownerEmail: { not: null } }, distinct: ['ownerEmail'], select: { ownerEmail: true }, orderBy: { ownerEmail: 'asc' } })
  ]);
  return {
    data: await presentAll(app, rows),
    truncated: total > rows.length,
    stages: DEAL_STAGES.map((stage) => {
      const group = byStage.find((row) => row.stage === stage);
      return { stage, count: group?._count._all ?? 0, amount: (group?._sum.amount ?? new Prisma.Decimal(0)).toFixed(2) };
    }),
    owners: owners.flatMap((row) => (row.ownerEmail ? [row.ownerEmail] : [])),
    hubspot: vendorStatus('hubspot') ?? { vendor: 'hubspot', configured: true }
  };
}

export async function getDeal(app: Pick<FastifyInstance, 'prisma'>, id: string) {
  const row = await app.prisma.salesDeal.findUnique({ where: { id } });
  if (!row) throw new PipelineError(404, 'DEAL_NOT_FOUND', 'Deal not found');
  const [deal] = await presentAll(app, [row]);
  return deal;
}

/** Won deals linked to one tenant, newest first (C360 Overview, ACC-PIPE-4). */
export async function tenantDeals(app: Pick<FastifyInstance, 'prisma'>, tenantId: string) {
  const rows = await app.prisma.salesDeal.findMany({ where: { tenantId }, orderBy: [{ wonAt: { sort: 'desc', nulls: 'last' } }, { updatedAt: 'desc' }], take: 20 });
  return { data: await presentAll(app, rows) };
}

/** Σ amount × probability / 100 over open deals, by close month, for `months` months from the current one. */
export async function forecast(app: Pick<FastifyInstance, 'prisma'>, query: z.infer<typeof forecastQuery>, now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + query.months, 1));
  const [open, won, overdue, unscheduled] = await Promise.all([
    app.prisma.salesDeal.findMany({ where: { stage: { in: [...OPEN_DEAL_STAGES] }, closeDate: { gte: start, lt: end } }, select: { amount: true, probability: true, closeDate: true } }),
    app.prisma.salesDeal.findMany({ where: { stage: 'WON', closeDate: { gte: start, lt: end } }, select: { amount: true, closeDate: true } }),
    app.prisma.salesDeal.aggregate({ where: { stage: { in: [...OPEN_DEAL_STAGES] }, closeDate: { lt: start } }, _count: { _all: true }, _sum: { amount: true } }),
    app.prisma.salesDeal.aggregate({ where: { stage: { in: [...OPEN_DEAL_STAGES] }, closeDate: null }, _count: { _all: true }, _sum: { amount: true } })
  ]);
  const months = Array.from({ length: query.months }, (_, index) => monthKey(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + index, 1))));
  const zero = () => new Prisma.Decimal(0);
  const buckets = new Map(months.map((month) => [month, { deals: 0, pipeline: zero(), weighted: zero(), won: zero() }]));
  for (const deal of open) {
    const bucket = buckets.get(monthKey(deal.closeDate!));
    if (!bucket) continue;
    bucket.deals += 1;
    bucket.pipeline = bucket.pipeline.add(deal.amount);
    bucket.weighted = bucket.weighted.add(deal.amount.mul(deal.probability).div(100));
  }
  for (const deal of won) {
    const bucket = buckets.get(monthKey(deal.closeDate!));
    if (bucket) bucket.won = bucket.won.add(deal.amount);
  }
  const rows = months.map((month) => {
    const bucket = buckets.get(month)!;
    return { month, deals: bucket.deals, pipeline: bucket.pipeline.toFixed(2), weighted: bucket.weighted.toFixed(2), won: bucket.won.toFixed(2) };
  });
  const total = rows.reduce((sum, row) => sum.add(row.weighted), zero());
  return {
    months: rows,
    totalWeighted: total.toFixed(2),
    overdue: { deals: overdue._count._all, amount: (overdue._sum.amount ?? zero()).toFixed(2) },
    unscheduled: { deals: unscheduled._count._all, amount: (unscheduled._sum.amount ?? zero()).toFixed(2) }
  };
}

// ── Changes ──────────────────────────────────────────────────────────────────

async function checkTenant(app: Pick<FastifyInstance, 'prisma'>, tenantId: string | null | undefined) {
  if (!tenantId) return null;
  const tenant = await app.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, status: true } });
  if (!tenant || tenant.status === 'DEMO') throw new PipelineError(400, 'TENANT_NOT_FOUND', 'Link the deal to an existing customer tenant.');
  return tenant;
}

function probabilityFor(stage: DealStage, given: number | undefined, current?: Prisma.Decimal) {
  if (stage === 'WON') return new Prisma.Decimal(100);
  if (stage === 'LOST') return new Prisma.Decimal(0);
  if (given !== undefined) return new Prisma.Decimal(given.toFixed(2));
  return current ?? new Prisma.Decimal(DEFAULT_STAGE_PROBABILITY[stage]);
}

export async function createDeal(app: PipelineApp, actor: MutationActor, actorId: string | null, body: z.infer<typeof createDealBody>, now = new Date()) {
  const tenant = await checkTenant(app, body.tenantId);
  const created = await auditedMutation(app, SERVICE, actor, async (tx) => {
    const deal = await tx.salesDeal.create({
      data: {
        name: body.name,
        stage: body.stage,
        amount: new Prisma.Decimal(body.amount),
        probability: probabilityFor(body.stage, body.probability),
        closeDate: toDate(body.closeDate),
        ownerEmail: body.ownerEmail ?? null,
        tenantId: tenant?.id ?? null,
        notes: body.notes ?? null,
        source: 'CONSOLE',
        createdBy: actorId,
        wonAt: body.stage === 'WON' ? now : null
      }
    });
    return {
      result: deal,
      audit: { action: 'DEAL_CREATED', targetTenantId: deal.tenantId, metadata: { dealId: deal.id, name: deal.name, stage: deal.stage, amount: deal.amount.toFixed(2) } },
      activity: { type: 'deal.created', tenantId: deal.tenantId, subjectType: 'sales_deal', subjectId: deal.id, summary: `Deal ${deal.name} created (${deal.stage.toLowerCase()}, ${deal.amount.toFixed(2)})`, consoleLink: `/gtm/pipeline/${deal.id}` }
    };
  });
  return getDeal(app, created.id);
}

export async function updateDeal(app: PipelineApp, actor: MutationActor, id: string, body: z.infer<typeof updateDealBody>, now = new Date()) {
  const row = await app.prisma.salesDeal.findUnique({ where: { id } });
  if (!row) throw new PipelineError(404, 'DEAL_NOT_FOUND', 'Deal not found');
  const tenant = body.tenantId !== undefined ? await checkTenant(app, body.tenantId) : undefined;
  const stage = (body.stage ?? row.stage) as DealStage;
  const stageChanged = body.stage !== undefined && body.stage !== row.stage;
  const data: Prisma.SalesDealUncheckedUpdateManyInput = {
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.amount !== undefined ? { amount: new Prisma.Decimal(body.amount) } : {}),
    ...(body.closeDate !== undefined ? { closeDate: toDate(body.closeDate) } : {}),
    ...(body.ownerEmail !== undefined ? { ownerEmail: body.ownerEmail } : {}),
    ...(body.notes !== undefined ? { notes: body.notes } : {}),
    ...(tenant !== undefined ? { tenantId: tenant?.id ?? null } : {}),
    ...(stageChanged || body.probability !== undefined ? { stage, probability: probabilityFor(stage, body.probability, stageChanged ? undefined : row.probability) } : {}),
    ...(stageChanged ? { wonAt: stage === 'WON' ? now : null } : {})
  };
  const changes = Object.keys(data).filter((key) => key !== 'wonAt');
  const updated = await auditedMutation(app, SERVICE, actor, async (tx) => {
    const claimed = await tx.salesDeal.updateMany({ where: { id, updatedAt: row.updatedAt }, data });
    if (claimed.count !== 1) throw new PipelineError(409, 'DEAL_CHANGED', 'The deal changed; reload and try again.');
    const after = await tx.salesDeal.findUniqueOrThrow({ where: { id } });
    const won = stageChanged && stage === 'WON';
    return {
      result: after,
      audit: { action: stageChanged ? 'DEAL_STAGE_CHANGED' : 'DEAL_UPDATED', targetTenantId: after.tenantId ?? row.tenantId, metadata: { dealId: id, changes, fromStage: row.stage, toStage: after.stage, amount: after.amount.toFixed(2) } },
      activity: {
        type: won ? 'deal.won' : stageChanged ? 'deal.stage_changed' : 'deal.updated',
        tenantId: after.tenantId ?? row.tenantId,
        subjectType: 'sales_deal',
        subjectId: id,
        summary: won ? `Deal ${after.name} won (${after.amount.toFixed(2)})` : `Deal ${after.name}: ${stageChanged ? `${row.stage.toLowerCase()} → ${after.stage.toLowerCase()}` : changes.join(', ')}`,
        severity: won ? 'ATTENTION' : 'INFO',
        consoleLink: `/gtm/pipeline/${id}`
      }
    };
  });
  return getDeal(app, updated.id);
}

// ── HubSpot import ───────────────────────────────────────────────────────────

export type HubspotImportResult = { created: number; updated: number; skippedLinked: number; total: number };

function importFields(deal: HubspotDeal, now: Date) {
  const stage = (deal.stage ? HUBSPOT_STAGE_MAP[deal.stage.toLowerCase()] : undefined) ?? 'PROSPECTING';
  const amount = deal.amount && /^-?\d+(\.\d+)?$/.test(deal.amount) ? new Prisma.Decimal(deal.amount).toDecimalPlaces(2) : new Prisma.Decimal(0);
  const probability = stage === 'WON' ? 100 : stage === 'LOST' ? 0 : deal.probability !== null ? Math.min(100, Math.max(0, deal.probability * 100)) : DEFAULT_STAGE_PROBABILITY[stage];
  const closeDate = deal.closeDate ? new Date(deal.closeDate) : null;
  return {
    name: deal.name.slice(0, 200),
    stage,
    amount: amount.isNegative() ? new Prisma.Decimal(0) : amount,
    probability: new Prisma.Decimal(probability.toFixed(2)),
    closeDate: closeDate && !Number.isNaN(closeDate.getTime()) ? closeDate : null,
    payload: { hubspotStage: deal.stage, hubspotOwnerId: deal.ownerId },
    hubspotSyncedAt: now
  };
}

/**
 * Imports HubSpot deals (only when configured; a vendor failure throws VendorError → 502). New deals are created as
 * HUBSPOT; unlinked imported deals are refreshed; a deal linked to a tenant is never overwritten (console is the source
 * of truth). One audit entry per run.
 */
export async function importHubspotDeals(app: PipelineApp, actor: MutationActor, now = new Date()): Promise<HubspotImportResult> {
  const deals = await hubspotAdapter.listDeals();
  const existing = deals.length
    ? await app.prisma.salesDeal.findMany({ where: { hubspotDealId: { in: deals.map((deal) => deal.id) } }, select: { id: true, hubspotDealId: true, tenantId: true, stage: true } })
    : [];
  const byHubspotId = new Map(existing.map((row) => [row.hubspotDealId!, row]));
  const result: HubspotImportResult = { created: 0, updated: 0, skippedLinked: 0, total: deals.length };
  for (const deal of deals) {
    const fields = importFields(deal, now);
    const current = byHubspotId.get(deal.id);
    if (!current) {
      await app.prisma.salesDeal.create({ data: { ...fields, hubspotDealId: deal.id, source: 'HUBSPOT', wonAt: fields.stage === 'WON' ? now : null } });
      result.created += 1;
    } else if (current.tenantId) {
      result.skippedLinked += 1;
    } else {
      await app.prisma.salesDeal.update({ where: { id: current.id }, data: { ...fields, ...(fields.stage !== current.stage ? { wonAt: fields.stage === 'WON' ? now : null } : {}) } });
      result.updated += 1;
    }
  }
  await auditedMutation(app, SERVICE, actor, async () => ({
    result: null,
    audit: { action: 'HUBSPOT_DEALS_IMPORTED', metadata: result },
    activity: { type: 'deal.hubspot_imported', subjectType: 'hubspot_import', subjectId: now.toISOString(), summary: `HubSpot import: ${result.created} new, ${result.updated} updated, ${result.skippedLinked} linked deals kept` }
  }));
  return result;
}

export const HUBSPOT_IMPORT_ACTOR: MutationActor = { kind: 'system', id: 'gtm.hubspot-import', label: 'HubSpot import job' };

/** gtm.hubspot-import (nightly): skipped when HubSpot is not configured. */
export async function runHubspotImport(app: PipelineApp) {
  if (!hubspotAdapter.isConfigured()) return { skipped: true, missing: hubspotAdapter.missingEnv() };
  return importHubspotDeals(app, HUBSPOT_IMPORT_ACTOR);
}
