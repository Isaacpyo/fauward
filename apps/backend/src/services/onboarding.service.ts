import type { FastifyInstance, FastifyBaseLogger } from 'fastify';
import type { Prisma, PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import { config } from '../config/index.js';
import { recordActivity, publishActivity, SYSTEM_ACTOR } from './platform-activity.service.js';
import { notifyTenantAdmins } from './platform-notifier.service.js';

// customer.onboarding (L7, WP-2.17). `Tenant.onboardingSteps` maps a step to the ISO time it was reached, stamped only
// by the event that proves it (first shipment, gateway verified, teammate signed in, branding saved, domain verified,
// invoice paid). The tenant checklist, the console funnel and the stuck list all read it; nobody can mark a step by
// clicking.

export const ONBOARDING_STEPS = ['BRANDING_SET', 'GATEWAY_VERIFIED', 'FIRST_SHIPMENT', 'TEAMMATE_JOINED', 'DOMAIN_VERIFIED', 'FIRST_PAID_INVOICE'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
/** Onboarding is complete when these are done; a custom domain and a paid invoice are tracked but optional. */
export const CORE_STEPS: readonly OnboardingStep[] = ['BRANDING_SET', 'GATEWAY_VERIFIED', 'FIRST_SHIPMENT', 'TEAMMATE_JOINED'];

export const STEP_LABELS: Record<OnboardingStep, string> = {
  BRANDING_SET: 'Brand your workspace',
  GATEWAY_VERIFIED: 'Connect and verify a payment method',
  FIRST_SHIPMENT: 'Create your first shipment',
  TEAMMATE_JOINED: 'A teammate accepts an invite and signs in',
  DOMAIN_VERIFIED: 'Verify a custom domain',
  FIRST_PAID_INVOICE: 'Get your first invoice paid'
};

/** Where the tenant does each step for real (tenant portal paths). */
export const STEP_ACTIONS: Record<OnboardingStep, string> = {
  BRANDING_SET: '/settings?tab=branding',
  GATEWAY_VERIFIED: '/settings?tab=integrations',
  FIRST_SHIPMENT: '/shipments/create',
  TEAMMATE_JOINED: '/team',
  DOMAIN_VERIFIED: '/settings?tab=domain',
  FIRST_PAID_INVOICE: '/finance?tab=invoices'
};

export const NUDGE_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

/** Stamps from the JSON column; legacy boolean flags (set by clicks before WP-2.17) are ignored. */
export function stepStamps(value: unknown): Partial<Record<OnboardingStep, string>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  const stamps: Partial<Record<OnboardingStep, string>> = {};
  for (const step of ONBOARDING_STEPS) {
    const stamp = record[step];
    if (typeof stamp === 'string' && !Number.isNaN(Date.parse(stamp))) stamps[step] = stamp;
  }
  return stamps;
}

export function nextOpenStep(stamps: Partial<Record<OnboardingStep, string>>): OnboardingStep | null {
  return ONBOARDING_STEPS.find((step) => !stamps[step]) ?? null;
}

type StepDeps = { prisma: Pick<PrismaClient, 'tenant' | 'platformActivity'>; redis?: Pick<Redis, 'publish'>; log?: Pick<FastifyBaseLogger, 'error'> };

/**
 * Stamps a step once (idempotent) and records `onboarding.step_completed`; the step that completes the core set also
 * stamps `onboardingCompletedAt` and records `onboarding.completed`. Never throws: onboarding must not fail the action
 * that proved the step.
 */
export async function markOnboardingStep(deps: StepDeps, tenantId: string, step: OnboardingStep, at = new Date()) {
  try {
    const tenant = await deps.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, onboardingSteps: true, onboardingCompletedAt: true } });
    if (!tenant) return { stamped: false };
    const stamps = stepStamps(tenant.onboardingSteps);
    if (stamps[step]) return { stamped: false };
    const raw = tenant.onboardingSteps && typeof tenant.onboardingSteps === 'object' && !Array.isArray(tenant.onboardingSteps) ? (tenant.onboardingSteps as Prisma.JsonObject) : {};
    const next = { ...raw, [step]: at.toISOString() };
    const completes = !tenant.onboardingCompletedAt && CORE_STEPS.every((core) => core === step || stamps[core]);
    await deps.prisma.tenant.update({ where: { id: tenantId }, data: { onboardingSteps: next, ...(completes ? { onboardingCompletedAt: at } : {}) } });
    const log = deps.log ?? { error: () => undefined };
    const stepped = await recordActivity(deps.prisma, {
      service: 'customer.onboarding',
      type: 'onboarding.step_completed',
      tenantId,
      ...SYSTEM_ACTOR,
      subjectType: 'tenant',
      subjectId: tenantId,
      summary: `${tenant.name}: ${STEP_LABELS[step]}`,
      consoleLink: '/customer/onboarding',
      metadata: { step },
      dedupeKey: `onboarding.step_completed:${tenantId}:${step}`,
      occurredAt: at
    });
    publishActivity(deps.redis, stepped, log);
    if (completes) {
      const completed = await recordActivity(deps.prisma, {
        service: 'customer.onboarding',
        type: 'onboarding.completed',
        tenantId,
        ...SYSTEM_ACTOR,
        subjectType: 'tenant',
        subjectId: tenantId,
        summary: `${tenant.name} finished onboarding`,
        consoleLink: '/customer/onboarding',
        dedupeKey: `onboarding.completed:${tenantId}`,
        occurredAt: at
      });
      publishActivity(deps.redis, completed, log);
    }
    return { stamped: true, completed: completes };
  } catch (err) {
    deps.log?.error({ err, tenantId, step }, 'Failed to stamp onboarding step');
    return { stamped: false };
  }
}

/** The one checklist (tenant portal onboarding page and dashboard). */
export async function onboardingChecklist(prisma: Pick<PrismaClient, 'tenant'>, tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { onboardingSteps: true, onboardingCompletedAt: true, createdAt: true } });
  if (!tenant) return null;
  const stamps = stepStamps(tenant.onboardingSteps);
  return {
    completedAt: tenant.onboardingCompletedAt?.toISOString() ?? null,
    signedUpAt: tenant.createdAt.toISOString(),
    steps: ONBOARDING_STEPS.map((step) => ({ step, label: STEP_LABELS[step], required: CORE_STEPS.includes(step), doneAt: stamps[step] ?? null, actionPath: STEP_ACTIONS[step] })),
    nextStep: nextOpenStep(stamps)
  };
}

const FUNNEL_STATUSES = ['TRIALING', 'ACTIVE', 'SUSPENDED'] as const;

export function cohortRange(cohort: string | undefined, now = new Date()) {
  if (cohort) {
    const [year, month] = cohort.split('-').map(Number);
    return { gte: new Date(Date.UTC(year, month - 1, 1)), lt: new Date(Date.UTC(year, month, 1)) };
  }
  return { gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000), lt: now };
}

/** Account created → each step: tenants that reached it, and conversion from the previous stage. */
export async function onboardingFunnel(app: FastifyInstance, cohort?: string) {
  const range = cohortRange(cohort);
  const tenants = await app.prisma.tenant.findMany({ where: { createdAt: range, status: { in: [...FUNNEL_STATUSES] } }, select: { onboardingSteps: true, onboardingCompletedAt: true } });
  const stamps = tenants.map((tenant) => stepStamps(tenant.onboardingSteps));
  let previous = tenants.length;
  const steps = ONBOARDING_STEPS.map((step) => {
    const count = stamps.filter((row) => row[step]).length;
    const conversion = previous > 0 ? count / previous : null;
    previous = count;
    return { step, label: STEP_LABELS[step], required: CORE_STEPS.includes(step), count, conversionFromPrevious: conversion };
  });
  return { cohort: cohort ?? null, accountsCreated: tenants.length, completed: tenants.filter((tenant) => tenant.onboardingCompletedAt).length, steps };
}

/** Tenants that have not reached `stuckAt` (or, without it, any core step) `stuckDays` after signing up. */
export async function stuckTenants(app: FastifyInstance, input: { stuckAt?: OnboardingStep; stuckDays: number }, now = new Date()) {
  const cutoff = new Date(now.getTime() - input.stuckDays * 24 * 60 * 60 * 1000);
  const tenants = await app.prisma.tenant.findMany({
    where: { createdAt: { lte: cutoff }, onboardingCompletedAt: null, status: { in: [...FUNNEL_STATUSES] } },
    select: { id: true, name: true, slug: true, plan: true, createdAt: true, onboardingSteps: true, onboardingNudgedAt: true },
    orderBy: { createdAt: 'asc' },
    take: 500
  });
  return tenants
    .map((tenant) => ({ tenant, stamps: stepStamps(tenant.onboardingSteps) }))
    .filter(({ stamps }) => (input.stuckAt ? !stamps[input.stuckAt] : CORE_STEPS.some((step) => !stamps[step])))
    .map(({ tenant, stamps }) => ({
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      plan: tenant.plan,
      signedUpAt: tenant.createdAt.toISOString(),
      daysSinceSignup: Math.floor((now.getTime() - tenant.createdAt.getTime()) / (24 * 60 * 60 * 1000)),
      stepsDone: ONBOARDING_STEPS.filter((step) => stamps[step]),
      nextStep: nextOpenStep(stamps),
      lastNudgedAt: tenant.onboardingNudgedAt?.toISOString() ?? null,
      canNudge: !tenant.onboardingNudgedAt || now.getTime() - tenant.onboardingNudgedAt.getTime() >= NUDGE_INTERVAL_MS
    }));
}

export class NudgeError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

/** One nudge per tenant per 7 days: in-app + `onboarding_nudge` email to its admins, naming the next step. */
export async function nudgeTenant(app: FastifyInstance, tenantId: string, actor: { actorType: 'STAFF'; actorId: string | null; actorLabel: string }, now = new Date()) {
  const tenant = await app.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, onboardingSteps: true, onboardingCompletedAt: true, onboardingNudgedAt: true } });
  if (!tenant) throw new NudgeError(404, 'NOT_FOUND', 'Tenant not found');
  if (tenant.onboardingCompletedAt) throw new NudgeError(409, 'ONBOARDING_COMPLETE', 'This tenant has finished onboarding');
  const claimed = await app.prisma.tenant.updateMany({
    where: { id: tenantId, OR: [{ onboardingNudgedAt: null }, { onboardingNudgedAt: { lte: new Date(now.getTime() - NUDGE_INTERVAL_MS) } }] },
    data: { onboardingNudgedAt: now }
  });
  if (claimed.count !== 1) throw new NudgeError(429, 'NUDGED_RECENTLY', 'This tenant was nudged in the last 7 days');
  const step = nextOpenStep(stepStamps(tenant.onboardingSteps)) ?? 'BRANDING_SET';
  const link = `${config.tenantPortalUrl}${STEP_ACTIONS[step]}`;
  await notifyTenantAdmins(app, {
    tenantId,
    event: 'onboarding.nudged',
    title: 'Finish setting up your workspace',
    body: `Next step: ${STEP_LABELS[step]}.`,
    link: STEP_ACTIONS[step],
    email: { template: 'onboarding_nudge', data: { step: STEP_LABELS[step], link } }
  });
  const activity = await recordActivity(app.prisma, {
    service: 'customer.onboarding',
    type: 'onboarding.nudged',
    tenantId,
    ...actor,
    subjectType: 'tenant',
    subjectId: tenantId,
    summary: `${tenant.name} nudged: ${STEP_LABELS[step]}`,
    consoleLink: '/customer/onboarding/stuck'
  });
  publishActivity(app.redis, activity, app.log);
  return { nudgedAt: now.toISOString(), step };
}
