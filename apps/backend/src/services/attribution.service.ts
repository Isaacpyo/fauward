import type { FastifyInstance } from 'fastify';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ACTIVATION_THRESHOLD } from '../config/activation.js';

// gtm.attribution (WP-4.16). Producer: the marketing site keeps a first-touch cookie (`fw_attr`, only after cookie
// consent) and forwards it with the signup; `firstTouchData` turns it into one FIRST_TOUCH MarketingAttribution row for
// the new tenant, written in the signup transaction. A signup without the cookie is recorded as source "unknown"
// (consent declined, or the visit predates tracking). Console reports group signups by first touch and follow them
// through activated (activation score ≥ ACTIVATION_THRESHOLD, or already paying) and paid (Subscription ACTIVE).
// DEMO tenants are never counted.

const FIELD = z.string().trim().max(200).optional();

export const attributionInput = z
  .object({
    utm_source: FIELD,
    utm_medium: FIELD,
    utm_campaign: FIELD,
    utm_term: FIELD,
    utm_content: FIELD,
    referrer: FIELD,
    landingPage: FIELD,
    firstSeen: z.string().datetime().optional()
  })
  .strip();

export type AttributionInput = z.infer<typeof attributionInput>;

const blank = (value: string | undefined) => (value && value.length > 0 ? value : null);

function referrerHost(referrer: string | null) {
  if (!referrer) return null;
  try {
    return new URL(referrer).host.replace(/^www\./, '') || null;
  } catch {
    return null;
  }
}

/** The FIRST_TOUCH row for a signup at `now`; `input` is the forwarded cookie (absent → source "unknown"). */
export function firstTouchData(tenantId: string, input: AttributionInput | undefined, now: Date): Prisma.MarketingAttributionUncheckedCreateInput {
  if (!input) {
    return { tenantId, touchType: 'FIRST_TOUCH', periodStart: now, periodEnd: now, source: 'unknown', weight: '1', payload: { cookie: false } };
  }
  const referrer = blank(input.referrer);
  const source = blank(input.utm_source) ?? referrerHost(referrer) ?? 'direct';
  const medium = blank(input.utm_medium) ?? (input.utm_source ? null : referrer ? 'referral' : 'none');
  const firstSeen = input.firstSeen ? new Date(input.firstSeen) : now;
  return {
    tenantId,
    touchType: 'FIRST_TOUCH',
    periodStart: firstSeen <= now ? firstSeen : now,
    periodEnd: now,
    source: source.toLowerCase(),
    medium: medium?.toLowerCase() ?? null,
    campaign: blank(input.utm_campaign),
    term: blank(input.utm_term),
    content: blank(input.utm_content),
    referrer,
    landingPage: blank(input.landingPage),
    weight: '1',
    payload: { cookie: true }
  };
}

// ── Console reports ─────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_RANGE_DAYS = 90;

export const attributionQuery = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional()
});

type Cohort = Array<{ tenantId: string; source: string; medium: string | null; campaign: string | null; landingPage: string | null; activated: boolean; paid: boolean }>;

function range(query: z.infer<typeof attributionQuery>, now: Date) {
  const to = query.to ? new Date(`${query.to}T23:59:59.999Z`) : now;
  const from = query.from ? new Date(`${query.from}T00:00:00.000Z`) : new Date(to.getTime() - DEFAULT_RANGE_DAYS * DAY_MS);
  return { from, to };
}

/** Every non-DEMO tenant created in the range with its first touch and funnel stage. */
async function cohort(app: Pick<FastifyInstance, 'prisma'>, from: Date, to: Date): Promise<Cohort> {
  const tenants = await app.prisma.tenant.findMany({ where: { createdAt: { gte: from, lte: to }, status: { not: 'DEMO' } }, select: { id: true, subscription: { select: { status: true } } } });
  const ids = tenants.map((tenant) => tenant.id);
  if (ids.length === 0) return [];
  const [touches, activations] = await Promise.all([
    app.prisma.marketingAttribution.findMany({ where: { tenantId: { in: ids }, touchType: 'FIRST_TOUCH' }, select: { tenantId: true, source: true, medium: true, campaign: true, landingPage: true } }),
    app.prisma.trialActivation.findMany({ where: { tenantId: { in: ids } }, select: { tenantId: true, score: true } })
  ]);
  const touchBy = new Map(touches.map((row) => [row.tenantId, row]));
  const scoreBy = new Map(activations.map((row) => [row.tenantId, row.score]));
  return tenants.map((tenant) => {
    const touch = touchBy.get(tenant.id);
    const paid = tenant.subscription?.status === 'ACTIVE';
    return {
      tenantId: tenant.id,
      source: touch?.source ?? 'unknown',
      medium: touch?.medium ?? null,
      campaign: touch?.campaign ?? null,
      landingPage: touch?.landingPage ?? null,
      activated: paid || (scoreBy.get(tenant.id) ?? 0) >= ACTIVATION_THRESHOLD,
      paid
    };
  });
}

type Counts = { signups: number; activated: number; paid: number };

function group(rows: Cohort, key: (row: Cohort[number]) => string | null) {
  const groups = new Map<string, Counts>();
  for (const row of rows) {
    const name = key(row);
    if (name === null) continue;
    const counts = groups.get(name) ?? { signups: 0, activated: 0, paid: 0 };
    counts.signups += 1;
    if (row.activated) counts.activated += 1;
    if (row.paid) counts.paid += 1;
    groups.set(name, counts);
  }
  return [...groups.entries()].map(([name, counts]) => ({ name, ...counts })).sort((a, b) => b.signups - a.signups || a.name.localeCompare(b.name));
}

function totals(rows: Cohort): Counts {
  return { signups: rows.length, activated: rows.filter((row) => row.activated).length, paid: rows.filter((row) => row.paid).length };
}

function meta(from: Date, to: Date) {
  return { from: from.toISOString(), to: to.toISOString(), activationThreshold: ACTIVATION_THRESHOLD };
}

export async function attributionSummary(app: Pick<FastifyInstance, 'prisma'>, query: z.infer<typeof attributionQuery>, now = new Date()) {
  const { from, to } = range(query, now);
  const rows = await cohort(app, from, to);
  return {
    ...meta(from, to),
    totals: totals(rows),
    untracked: rows.filter((row) => row.source === 'unknown').length,
    data: group(rows, (row) => JSON.stringify([row.source, row.medium ?? 'none'])).map(({ name, ...counts }) => {
      const [source, medium] = JSON.parse(name) as [string, string];
      return { source, medium, ...counts };
    })
  };
}

export async function attributionCampaigns(app: Pick<FastifyInstance, 'prisma'>, query: z.infer<typeof attributionQuery>, now = new Date()) {
  const { from, to } = range(query, now);
  const rows = await cohort(app, from, to);
  return { ...meta(from, to), data: group(rows, (row) => row.campaign).map(({ name, ...counts }) => ({ campaign: name, ...counts })) };
}

export async function attributionLandingPages(app: Pick<FastifyInstance, 'prisma'>, query: z.infer<typeof attributionQuery>, now = new Date()) {
  const { from, to } = range(query, now);
  const rows = await cohort(app, from, to);
  return { ...meta(from, to), data: group(rows, (row) => row.landingPage).map(({ name, ...counts }) => ({ landingPage: name, ...counts })) };
}

export async function attributionFunnel(app: Pick<FastifyInstance, 'prisma'>, query: z.infer<typeof attributionQuery>, now = new Date()) {
  const { from, to } = range(query, now);
  const rows = await cohort(app, from, to);
  const overall = totals(rows);
  return {
    ...meta(from, to),
    stages: [
      { stage: 'signup', count: overall.signups },
      { stage: 'activated', count: overall.activated },
      { stage: 'paid', count: overall.paid }
    ],
    bySource: group(rows, (row) => row.source).map(({ name, ...counts }) => ({ source: name, ...counts }))
  };
}
