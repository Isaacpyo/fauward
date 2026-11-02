import { Prisma, type PrismaClient } from '@prisma/client';
import { config } from '../../config/index.js';
import { planService } from '../../modules/tenants/plan.service.js';
import { MRR_SUBSCRIPTION_STATUSES } from '../console-metrics.service.js';
import { convertCurrency, mrrForSubscription } from './mrr.service.js';

// revenue.analytics (WP-3.2): MRR movement, signup cohorts, MRR by plan and a run-rate projection, all from
// SubscriptionEvent history. Each tenant's MRR timeline is rebuilt from its events: the MRR the event recorded when it
// has one (plan changes), otherwise the plan's list price while the status bills (ACTIVE/PAST_DUE) and 0 otherwise.
// History written by the 0051 backfill is "reconstructed" and flagged in every response.

const ZERO = new Prisma.Decimal(0);
const BILLING = new Set(MRR_SUBSCRIPTION_STATUSES);

export type AnalyticsDb = Pick<PrismaClient, 'subscriptionEvent' | 'subscription' | 'tenant' | 'currencyRate' | 'pricingOverride' | 'customContract'>;

type EventRow = {
  tenantId: string;
  type: string;
  fromPlan: string | null;
  toPlan: string | null;
  toStatus: string | null;
  mrrBefore: Prisma.Decimal | null;
  mrrAfter: Prisma.Decimal | null;
  currency: string;
  source: string;
  occurredAt: Date;
};

export type TimelinePoint = { at: Date; mrr: Prisma.Decimal; reconstructed: boolean };
type TenantTimeline = { tenantId: string; signedUpAt: Date; points: TimelinePoint[] };

export type Coverage = { dataSince: string | null; reconstructedBefore: string | null; baseCurrency: string; unconvertedEvents: number };

export const monthOf = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
const monthStart = (month: string) => {
  const [year, index] = month.split('-').map(Number);
  return new Date(Date.UTC(year, index - 1, 1));
};
const nextMonth = (month: string) => {
  const start = monthStart(month);
  return monthOf(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1)));
};
export function monthsBetween(from: string, to: string) {
  const months: string[] = [];
  for (let month = from; month <= to; month = nextMonth(month)) months.push(month);
  return months;
}
/** MRR at the end of `month` (the last point before the next month starts). */
function mrrAtMonthEnd(points: TimelinePoint[], month: string) {
  const end = monthStart(nextMonth(month));
  let value = ZERO;
  for (const point of points) {
    if (point.at < end) value = point.mrr;
    else break;
  }
  return value;
}

function listMrr(plan: string | null, billingCycle: string) {
  const price = plan ? planService.getPrice(plan) : null;
  if (!price) return null;
  const annual = billingCycle.toUpperCase() === 'ANNUAL' || billingCycle.toUpperCase() === 'YEARLY';
  return { amount: annual ? new Prisma.Decimal(price.annual).div(12) : new Prisma.Decimal(price.monthly), currency: price.currency };
}

/**
 * Rebuilds every non-DEMO tenant's MRR timeline (base currency). A backfilled CREATED event (always TRIALING) with no
 * later status change takes the subscription's current status: the backfill could not know when trials converted, so
 * those subscriptions read as billing since they were created — flagged as reconstructed.
 */
export async function buildTimelines(db: AnalyticsDb, baseCurrency = config.billing.baseCurrency) {
  const [events, subscriptions, tenants] = await Promise.all([
    db.subscriptionEvent.findMany({
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      select: { tenantId: true, type: true, fromPlan: true, toPlan: true, toStatus: true, mrrBefore: true, mrrAfter: true, currency: true, source: true, occurredAt: true }
    }),
    db.subscription.findMany({ select: { tenantId: true, status: true, billingCycle: true, plan: true } }),
    db.tenant.findMany({ where: { status: { not: 'DEMO' } }, select: { id: true, createdAt: true } })
  ]);
  const subscriptionByTenant = new Map(subscriptions.map((row) => [row.tenantId, row]));
  const tenantById = new Map(tenants.map((row) => [row.id, row]));
  const byTenant = new Map<string, EventRow[]>();
  for (const event of events) {
    if (!tenantById.has(event.tenantId)) continue;
    byTenant.set(event.tenantId, [...(byTenant.get(event.tenantId) ?? []), event]);
  }

  const rates = new Map<string, Prisma.Decimal | null>();
  let unconvertedEvents = 0;
  const toBase = async (amount: Prisma.Decimal, currency: string) => {
    if (currency === baseCurrency) return amount;
    if (!rates.has(currency)) rates.set(currency, await convertCurrency(db, new Prisma.Decimal(1), currency, baseCurrency));
    const rate = rates.get(currency) ?? null;
    return rate ? amount.mul(rate) : null;
  };

  const timelines: TenantTimeline[] = [];
  for (const [tenantId, rows] of byTenant) {
    const subscription = subscriptionByTenant.get(tenantId);
    const cycle = subscription?.billingCycle ?? 'MONTHLY';
    let plan: string | null = null;
    let status: string | null = null;
    const points: TimelinePoint[] = [];
    for (let index = 0; index < rows.length; index += 1) {
      const event = rows[index];
      plan = event.toPlan ?? plan;
      status = event.type === 'CANCELLED' ? 'CANCELLED' : event.toStatus ?? status;
      const backfilled = event.source === 'BACKFILL';
      if (backfilled && event.type === 'CREATED' && !rows.slice(index + 1).some((later) => later.toStatus !== null || later.type === 'CANCELLED')) {
        status = subscription?.status ?? status;
      }
      let mrr: Prisma.Decimal | null;
      if (event.mrrAfter !== null) {
        mrr = await toBase(new Prisma.Decimal(event.mrrAfter), event.currency);
      } else if (status && BILLING.has(status)) {
        const list = listMrr(plan, cycle);
        mrr = list ? await toBase(list.amount, list.currency) : ZERO;
      } else {
        mrr = ZERO;
      }
      if (mrr === null) {
        unconvertedEvents += 1;
        continue;
      }
      points.push({ at: event.occurredAt, mrr: mrr.toDecimalPlaces(2), reconstructed: backfilled });
    }
    timelines.push({ tenantId, signedUpAt: tenantById.get(tenantId)!.createdAt, points });
  }

  const live = events.filter((event) => event.source !== 'BACKFILL').map((event) => event.occurredAt);
  const hasBackfill = events.some((event) => event.source === 'BACKFILL');
  const coverage: Coverage = {
    dataSince: events[0]?.occurredAt.toISOString() ?? null,
    reconstructedBefore: hasBackfill ? (live[0] ?? new Date()).toISOString() : null,
    baseCurrency,
    unconvertedEvents
  };
  return { timelines, coverage };
}

export type MovementRow = { month: string; new: string; expansion: string; contraction: string; churn: string; reactivation: string; net: string; reconstructed: boolean };

/** Classifies every MRR change: 0→x new (or reactivation after an earlier paid period), x→0 churn, up expansion, down contraction. */
export function mrrMovement(timelines: TenantTimeline[], from: string, to: string): MovementRow[] {
  const buckets = new Map(monthsBetween(from, to).map((month) => [month, { new: ZERO, expansion: ZERO, contraction: ZERO, churn: ZERO, reactivation: ZERO, reconstructed: false }]));
  for (const timeline of timelines) {
    let previous = ZERO;
    let everPaid = false;
    for (const point of timeline.points) {
      const delta = point.mrr.sub(previous);
      const bucket = buckets.get(monthOf(point.at));
      if (bucket && !delta.isZero()) {
        if (previous.isZero()) {
          if (everPaid) bucket.reactivation = bucket.reactivation.add(delta);
          else bucket.new = bucket.new.add(delta);
        } else if (point.mrr.isZero()) bucket.churn = bucket.churn.add(delta);
        else if (delta.gt(0)) bucket.expansion = bucket.expansion.add(delta);
        else bucket.contraction = bucket.contraction.add(delta);
        if (point.reconstructed) bucket.reconstructed = true;
      }
      if (point.mrr.gt(0)) everPaid = true;
      previous = point.mrr;
    }
  }
  return [...buckets.entries()].map(([month, bucket]) => {
    const net = bucket.new.add(bucket.expansion).add(bucket.contraction).add(bucket.churn).add(bucket.reactivation);
    return {
      month,
      new: bucket.new.toFixed(2),
      expansion: bucket.expansion.toFixed(2),
      contraction: bucket.contraction.toFixed(2),
      churn: bucket.churn.toFixed(2),
      reactivation: bucket.reactivation.toFixed(2),
      net: net.toFixed(2),
      reconstructed: bucket.reconstructed
    };
  });
}

export type CohortRow = {
  cohort: string;
  signups: number;
  /** Tenants of the cohort that ever paid: the base for both retention rates. */
  paying: number;
  startingMrr: string;
  months: Array<{ month: string; offset: number; payingTenants: number; logoRetention: number | null; mrr: string; revenueRetention: number | null }>;
};

/** Signup-month cohorts: paying tenants and MRR at each month end against the cohort's paying base and first paid MRR. */
export function signupCohorts(timelines: TenantTimeline[], from: string, to: string): CohortRow[] {
  const cohorts = new Map<string, TenantTimeline[]>();
  for (const timeline of timelines) {
    const cohort = monthOf(timeline.signedUpAt);
    if (cohort < from || cohort > to) continue;
    cohorts.set(cohort, [...(cohorts.get(cohort) ?? []), timeline]);
  }
  return [...cohorts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cohort, members]) => {
      const paying = members.filter((member) => member.points.some((point) => point.mrr.gt(0)));
      const startingMrr = paying.reduce((sum, member) => sum.add(member.points.find((point) => point.mrr.gt(0))!.mrr), ZERO);
      const months = monthsBetween(cohort, to).map((month, offset) => {
        const values = paying.map((member) => mrrAtMonthEnd(member.points, month));
        const payingTenants = values.filter((value) => value.gt(0)).length;
        const mrr = values.reduce((sum, value) => sum.add(value), ZERO);
        return {
          month,
          offset,
          payingTenants,
          logoRetention: paying.length === 0 ? null : Math.round((payingTenants / paying.length) * 1000) / 1000,
          mrr: mrr.toFixed(2),
          revenueRetention: startingMrr.isZero() ? null : Number(mrr.div(startingMrr).toDecimalPlaces(3).toString())
        };
      });
      return { cohort, signups: members.length, paying: paying.length, startingMrr: startingMrr.toFixed(2), months };
    });
}

/** Current MRR and tenant count per plan and billing cycle (billing subscriptions, DEMO excluded). */
export async function mrrByPlan(db: AnalyticsDb, now = new Date(), baseCurrency = config.billing.baseCurrency) {
  const subscriptions = await db.subscription.findMany({
    where: { status: { in: MRR_SUBSCRIPTION_STATUSES }, tenant: { status: { not: 'DEMO' } } },
    select: { plan: true, billingCycle: true, status: true, tenant: { select: { id: true, status: true, plan: true } } }
  });
  const groups = new Map<string, { plan: string; billingCycle: string; tenants: number; mrr: Prisma.Decimal; unconverted: number }>();
  for (const subscription of subscriptions) {
    const contribution = await mrrForSubscription(db, subscription.tenant, subscription, { now, baseCurrency });
    const key = `${subscription.plan}|${subscription.billingCycle.toUpperCase()}`;
    const group = groups.get(key) ?? { plan: subscription.plan, billingCycle: subscription.billingCycle.toUpperCase(), tenants: 0, mrr: ZERO, unconverted: 0 };
    group.tenants += 1;
    if (contribution.currency === baseCurrency) group.mrr = group.mrr.add(contribution.amount);
    else group.unconverted += 1;
    groups.set(key, group);
  }
  const rows = [...groups.values()].sort((a, b) => b.mrr.comparedTo(a.mrr) || a.plan.localeCompare(b.plan));
  const total = rows.reduce((sum, row) => sum.add(row.mrr), ZERO);
  return { rows: rows.map((row) => ({ ...row, mrr: row.mrr.toFixed(2) })), total: total.toFixed(2), currency: baseCurrency };
}

export const FORECAST_METHOD =
  'Run-rate projection: current MRR plus, for each future month, the average net MRR movement of the last 3 complete months. Not a forecast of pipeline, seasonality or churn risk.';

/** `months` future month-end projections from the trailing 3-month average net movement. */
export function runRateForecast(currentMrr: string, movement: MovementRow[], months: number, now = new Date()) {
  const current = monthOf(now);
  const complete = movement.filter((row) => row.month < current).slice(-3);
  const averageNet = complete.length === 0 ? ZERO : complete.reduce((sum, row) => sum.add(row.net), ZERO).div(complete.length);
  const points: Array<{ month: string; mrr: string }> = [];
  let month = current;
  let value = new Prisma.Decimal(currentMrr);
  for (let index = 0; index < months; index += 1) {
    month = nextMonth(month);
    value = Prisma.Decimal.max(ZERO, value.add(averageNet));
    points.push({ month, mrr: value.toFixed(2) });
  }
  return {
    label: 'projection' as const,
    method: FORECAST_METHOD,
    basis: { months: complete.map((row) => ({ month: row.month, net: row.net })), averageNet: averageNet.toFixed(2), startingMrr: new Prisma.Decimal(currentMrr).toFixed(2) },
    points
  };
}
