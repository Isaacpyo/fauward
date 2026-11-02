import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma, type DunningEnrollment, type DunningStep } from '@prisma/client';
import { z } from 'zod';
import { auditedMutation, staffMutationActor } from './console-mutation.js';
import { recordAndPublishActivity, SYSTEM_ACTOR } from './platform-activity.service.js';
import { notifyTenantAdmins } from './platform-notifier.service.js';
import { suspendTenant, type SuspensionActor } from './tenant-suspension.service.js';
import { stripeAdapter } from './vendors/stripe.adapter.js';
import { vendorStatus } from './vendors/index.js';
import { sendEmail } from '../modules/notifications/notifications.service.js';
import type { EMAIL_TEMPLATES } from '../modules/notifications/email-templates.js';

// revenue.dunning (WP-4.5). A failed Fauward invoice (Stripe `invoice.payment_failed`, or a PLATFORM invoice that went
// OVERDUE without Stripe) gets one DunningEnrollment on the default sequence. The hourly `revenue.dunning-advance` job
// runs each due step exactly once: a step is claimed by moving `currentStep` forward with a conditional update, and only
// the claimer performs it. Steps email (and notify in-app) the tenant's admins, retry the payment, or suspend through
// D3 (source DUNNING, sourceRef = the invoice) — the only billing suspension trigger. A paid invoice recovers the
// enrolment and lifts that suspension.

export const DEFAULT_SEQUENCE_ID = 'dunning-default';
export const STEP_ACTIONS = ['EMAIL', 'EMAIL_IN_APP', 'RETRY_PAYMENT', 'SUSPEND'] as const;
export type StepAction = (typeof STEP_ACTIONS)[number];
export const STEP_TEMPLATES = ['billing_payment_failed', 'billing_final_warning'] as const;
export const ENROLLMENT_STATUSES = ['ACTIVE', 'PAUSED', 'RECOVERED', 'EXHAUSTED', 'CANCELLED'] as const;

const DAY_MS = 86_400_000;
const SERVICE = 'revenue.dunning';
const SYSTEM = { kind: 'system' as const, id: 'revenue.dunning-advance', label: 'Dunning' };
const SUSPENSION_ACTOR: SuspensionActor = { type: 'SYSTEM', label: 'Dunning sequence' };
const BILLING_LINK = '/settings?tab=billing';

const DEFAULT_STEPS: Array<{ dayOffset: number; action: StepAction; template: string }> = [
  { dayOffset: 0, action: 'EMAIL', template: 'billing_payment_failed' },
  { dayOffset: 3, action: 'EMAIL', template: 'billing_payment_failed' },
  { dayOffset: 7, action: 'EMAIL_IN_APP', template: 'billing_final_warning' },
  { dayOffset: 14, action: 'SUSPEND', template: 'tenant_suspended' }
];

export class DunningError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

type App = Pick<FastifyInstance, 'prisma' | 'redis' | 'log'>;

function orderSteps(steps: DunningStep[]) {
  return [...steps].sort((a, b) => a.dayOffset - b.dayOffset || a.createdAt.getTime() - b.createdAt.getTime());
}

function dueAt(enrollment: Pick<DunningEnrollment, 'createdAt'>, step: Pick<DunningStep, 'dayOffset'> | undefined) {
  return step ? new Date(enrollment.createdAt.getTime() + step.dayOffset * DAY_MS) : null;
}

/** The default sequence, created with the standard steps the first time it is needed (db-push databases). */
export async function ensureDefaultSequence(app: Pick<FastifyInstance, 'prisma'>) {
  const existing = await app.prisma.dunningSequence.findFirst({ where: { isDefault: true }, include: { dunningSteps: true } });
  if (existing) return existing;
  try {
    await app.prisma.$transaction(async (tx) => {
      await tx.dunningSequence.create({ data: { id: DEFAULT_SEQUENCE_ID, name: 'Default dunning', steps: [], isDefault: true } });
      await tx.dunningStep.createMany({ data: DEFAULT_STEPS.map((step) => ({ sequenceId: DEFAULT_SEQUENCE_ID, ...step })) });
    });
  } catch (error) {
    // A concurrent caller created it first.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
  }
  return app.prisma.dunningSequence.findFirstOrThrow({ where: { isDefault: true }, include: { dunningSteps: true } });
}

// ── Enrolment ────────────────────────────────────────────────────────────────

/** Idempotent: a redelivered webhook or a second sweep finds the enrolment for the invoice and returns it. */
export async function enrollInvoice(app: App, input: { tenantId: string; invoiceId: string; source: 'STRIPE' | 'PLATFORM'; trigger: string }) {
  const existing = await app.prisma.dunningEnrollment.findUnique({ where: { invoiceId: input.invoiceId } });
  if (existing) return { enrollment: existing, created: false };
  const sequence = await ensureDefaultSequence(app);
  const first = orderSteps(sequence.dunningSteps)[0];
  const now = new Date();
  try {
    const enrollment = await auditedMutation(app, SERVICE, SYSTEM, async (tx) => {
      const row = await tx.dunningEnrollment.create({
        data: { tenantId: input.tenantId, invoiceId: input.invoiceId, source: input.source, sequenceId: sequence.id, nextActionAt: first ? new Date(now.getTime() + first.dayOffset * DAY_MS) : now, status: first ? 'ACTIVE' : 'EXHAUSTED', createdAt: now }
      });
      await tx.dunningEvent.create({ data: { tenantId: input.tenantId, invoiceId: input.invoiceId, eventType: 'enrolled', metadata: { enrollmentId: row.id, sequenceId: sequence.id, trigger: input.trigger } } });
      return {
        result: row,
        audit: { action: 'DUNNING_ENROLLED', targetTenantId: input.tenantId, metadata: { enrollmentId: row.id, invoiceId: input.invoiceId, sequenceId: sequence.id, source: input.source } },
        activity: { type: 'dunning.enrolled', tenantId: input.tenantId, subjectType: 'dunning_enrollment', subjectId: row.id, summary: `Dunning started for invoice ${input.invoiceId} (${sequence.name})`, severity: 'ATTENTION', consoleLink: `/revenue/dunning/tenants/${input.tenantId}`, dedupeKey: `dunning.enrolled:${input.invoiceId}` }
      };
    });
    return { enrollment, created: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { enrollment: await app.prisma.dunningEnrollment.findUniqueOrThrow({ where: { invoiceId: input.invoiceId } }), created: false };
    }
    throw error;
  }
}

/** A paid invoice (Stripe `invoice.paid` or a recorded PLATFORM payment) ends its enrolment as RECOVERED. */
export async function recoverEnrollment(app: App, input: { tenantId: string; invoiceRefs: string[]; via: string }) {
  const rows = await app.prisma.dunningEnrollment.findMany({ where: { tenantId: input.tenantId, invoiceId: { in: input.invoiceRefs }, status: { in: ['ACTIVE', 'PAUSED', 'EXHAUSTED'] } } });
  for (const row of rows) {
    const claimed = await app.prisma.dunningEnrollment.updateMany({ where: { id: row.id, tenantId: input.tenantId, status: row.status }, data: { status: 'RECOVERED', endedAt: new Date(), endedReason: `Paid (${input.via})` } });
    if (claimed.count !== 1) continue;
    await app.prisma.dunningEvent.create({ data: { tenantId: input.tenantId, invoiceId: row.invoiceId, eventType: 'recovered', metadata: { enrollmentId: row.id, via: input.via } } });
    await recordAndPublishActivity(app, {
      service: SERVICE,
      type: 'dunning.recovered',
      tenantId: input.tenantId,
      ...SYSTEM_ACTOR,
      subjectType: 'dunning_enrollment',
      subjectId: row.id,
      summary: `Invoice ${row.invoiceId} paid: dunning recovered`,
      consoleLink: `/revenue/dunning/tenants/${input.tenantId}`,
      dedupeKey: `dunning.recovered:${row.id}`
    });
  }
  return rows.length;
}

// ── Steps ────────────────────────────────────────────────────────────────────

async function emailAdmins(app: App, tenantId: string, template: keyof typeof EMAIL_TEMPLATES, data: Record<string, unknown>) {
  const admins = await app.prisma.user.findMany({ where: { tenantId, role: 'TENANT_ADMIN', isActive: true }, select: { id: true, email: true } });
  let queued = 0;
  for (const admin of admins) {
    try {
      await sendEmail(app as FastifyInstance, { tenantId, userId: admin.id, to: admin.email, template, data });
      queued += 1;
    } catch (err) {
      app.log.error({ err, tenantId, template }, 'Failed to enqueue dunning email');
    }
  }
  return queued;
}

function templateOf(step: Pick<DunningStep, 'template'>): keyof typeof EMAIL_TEMPLATES {
  return (STEP_TEMPLATES as readonly string[]).includes(step.template) ? (step.template as (typeof STEP_TEMPLATES)[number]) : 'billing_payment_failed';
}

/** Stripe `invoices.pay` when the invoice is Stripe's and Stripe is configured; otherwise the "update your card" email. */
async function retryPayment(app: App, enrollment: DunningEnrollment, idempotencyKey: string) {
  if (enrollment.source === 'STRIPE' && stripeAdapter.isConfigured()) {
    await stripeAdapter.payInvoice(enrollment.invoiceId, idempotencyKey);
    return { channel: 'stripe' as const, idempotencyKey };
  }
  const emails = await emailAdmins(app, enrollment.tenantId, 'billing_payment_failed', { invoiceRef: enrollment.invoiceId, link: BILLING_LINK });
  return { channel: 'email' as const, emails };
}

async function performStep(app: App, enrollment: DunningEnrollment, step: DunningStep, index: number): Promise<Prisma.InputJsonObject> {
  const data = { invoiceRef: enrollment.invoiceId, link: BILLING_LINK };
  switch (step.action as StepAction) {
    case 'EMAIL':
      return { emails: await emailAdmins(app, enrollment.tenantId, templateOf(step), data) };
    case 'EMAIL_IN_APP': {
      const result = await notifyTenantAdmins(app as FastifyInstance, {
        tenantId: enrollment.tenantId,
        event: 'billing.payment_failed',
        title: 'Your Fauward payment is overdue',
        body: 'Update your payment method in Settings → Billing to keep your workspace active.',
        link: BILLING_LINK,
        email: { template: templateOf(step), data }
      });
      return { inApp: result.inApp, emails: result.emailsQueued };
    }
    case 'RETRY_PAYMENT':
      return await retryPayment(app, enrollment, `dunning:${enrollment.id}:step:${index}`);
    case 'SUSPEND': {
      const result = await suspendTenant(app as FastifyInstance, {
        tenantId: enrollment.tenantId,
        source: 'DUNNING',
        category: 'BILLING',
        reason: `Dunning: invoice ${enrollment.invoiceId} unpaid after ${step.dayOffset} days`,
        actor: SUSPENSION_ACTOR,
        sourceRef: enrollment.invoiceId
      });
      return { suspensionId: result.record.id, tenantStatus: result.tenant.status };
    }
    default:
      return { skipped: `Unknown action ${step.action}` };
  }
}

/**
 * Runs every step of one enrolment that is due at `now`. Each step is claimed with a conditional update on
 * `currentStep`, so a re-run or a concurrent runner never performs it twice (ACC-DUN-2).
 */
export async function advanceEnrollment(app: App, enrollmentId: string, now = new Date()) {
  let performed = 0;
  for (;;) {
    const enrollment = await app.prisma.dunningEnrollment.findUnique({ where: { id: enrollmentId }, include: { sequence: { include: { dunningSteps: true } } } });
    if (!enrollment || enrollment.status !== 'ACTIVE') return performed;
    const steps = orderSteps(enrollment.sequence.dunningSteps);
    const index = enrollment.currentStep;
    const step = steps[index];
    const due = dueAt(enrollment, step);
    if (!step || !due || due > now) return performed;
    const next = steps[index + 1];
    const claim = await app.prisma.$transaction(async (tx) => {
      const claimed = await tx.dunningEnrollment.updateMany({
        where: { id: enrollment.id, tenantId: enrollment.tenantId, status: 'ACTIVE', currentStep: index },
        data: { currentStep: index + 1, nextActionAt: dueAt(enrollment, next) ?? now, ...(next ? {} : { status: 'EXHAUSTED', endedAt: now, endedReason: 'All steps ran' }) }
      });
      if (claimed.count !== 1) return null;
      return tx.dunningEvent.create({ data: { tenantId: enrollment.tenantId, invoiceId: enrollment.invoiceId, eventType: 'step_executed', attempt: index + 1, metadata: { enrollmentId: enrollment.id, stepId: step.id, action: step.action, dayOffset: step.dayOffset, outcome: 'RUNNING' } } });
    });
    if (!claim) return performed;
    let outcome: Prisma.InputJsonObject;
    try {
      outcome = { outcome: 'DONE', ...(await performStep(app, enrollment, step, index)) };
    } catch (error) {
      app.log.error({ err: error, enrollmentId: enrollment.id, stepId: step.id }, 'Dunning step failed');
      outcome = { outcome: 'FAILED', error: error instanceof Error ? error.message.slice(0, 500) : 'Step failed' };
    }
    await app.prisma.dunningEvent.update({ where: { id: claim.id }, data: { metadata: { enrollmentId: enrollment.id, stepId: step.id, action: step.action, dayOffset: step.dayOffset, ...outcome } } });
    await recordAndPublishActivity(app, {
      service: SERVICE,
      type: 'dunning.step_executed',
      tenantId: enrollment.tenantId,
      ...SYSTEM_ACTOR,
      actorLabel: 'Dunning',
      subjectType: 'dunning_enrollment',
      subjectId: enrollment.id,
      summary: `Dunning day ${step.dayOffset}: ${step.action.toLowerCase().replace(/_/g, ' ')} for invoice ${enrollment.invoiceId}${outcome.outcome === 'FAILED' ? ' (failed)' : ''}`,
      severity: step.action === 'SUSPEND' || outcome.outcome === 'FAILED' ? 'ATTENTION' : 'INFO',
      consoleLink: `/revenue/dunning/tenants/${enrollment.tenantId}`,
      dedupeKey: `dunning.step:${enrollment.id}:${index}`
    });
    performed += 1;
  }
}

/** The hourly job: enrol overdue PLATFORM invoices (vendor-free path), recover paid ones, run due steps. */
export async function runDunningAdvance(app: App, now = new Date()) {
  const overdue = await app.prisma.invoice.findMany({ where: { kind: 'PLATFORM', status: 'OVERDUE' }, select: { id: true, tenantId: true, stripeInvoiceId: true }, take: 500 });
  let enrolled = 0;
  for (const invoice of overdue) {
    const ref = invoice.stripeInvoiceId ?? invoice.id;
    const result = await enrollInvoice(app, { tenantId: invoice.tenantId, invoiceId: ref, source: invoice.stripeInvoiceId ? 'STRIPE' : 'PLATFORM', trigger: 'invoice.overdue' });
    if (!result.created) continue;
    enrolled += 1;
    // Day 0 runs now, as for a Stripe failure.
    await advanceEnrollment(app, result.enrollment.id);
  }

  const open = await app.prisma.dunningEnrollment.findMany({ where: { source: 'PLATFORM', status: { in: ['ACTIVE', 'PAUSED', 'EXHAUSTED'] } }, select: { tenantId: true, invoiceId: true } });
  let recovered = 0;
  if (open.length) {
    const paid = await app.prisma.invoice.findMany({ where: { kind: 'PLATFORM', id: { in: open.map((row) => row.invoiceId) }, status: 'PAID' }, select: { id: true, tenantId: true } });
    for (const invoice of paid) recovered += await recoverEnrollment(app, { tenantId: invoice.tenantId, invoiceRefs: [invoice.id], via: 'invoice marked paid' });
  }

  const due = await app.prisma.dunningEnrollment.findMany({ where: { status: 'ACTIVE', nextActionAt: { lte: now } }, select: { id: true }, orderBy: { nextActionAt: 'asc' }, take: 500 });
  let steps = 0;
  for (const row of due) steps += await advanceEnrollment(app, row.id, now);
  return { enrolled, recovered, enrollmentsDue: due.length, stepsRun: steps };
}

// ── Staff actions on an enrolment ───────────────────────────────────────────

async function loadEnrollment(app: Pick<FastifyInstance, 'prisma'>, id: string) {
  const row = await app.prisma.dunningEnrollment.findUnique({ where: { id } });
  if (!row) throw new DunningError(404, 'ENROLLMENT_NOT_FOUND', 'Dunning enrolment not found');
  return row;
}

export async function retryEnrollment(app: FastifyInstance, request: FastifyRequest, id: string, reason: string) {
  const enrollment = await loadEnrollment(app, id);
  if (enrollment.status === 'RECOVERED' || enrollment.status === 'CANCELLED') throw new DunningError(409, 'ENROLLMENT_CLOSED', `This enrolment is ${enrollment.status.toLowerCase()}.`);
  const header = request.headers['idempotency-key'];
  const idempotencyKey = typeof header === 'string' && header.trim() ? `dunning-retry:${header.trim()}` : `dunning-retry:${enrollment.id}:${Date.now()}`;
  const result = await retryPayment(app, enrollment, idempotencyKey);
  await auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    const event = await tx.dunningEvent.create({ data: { tenantId: enrollment.tenantId, invoiceId: enrollment.invoiceId, eventType: 'retry_requested', actorId: request.platform!.user.id, metadata: { enrollmentId: enrollment.id, ...result } } });
    return {
      result: event,
      audit: { action: 'DUNNING_RETRY', targetTenantId: enrollment.tenantId, reason, metadata: { enrollmentId: enrollment.id, invoiceId: enrollment.invoiceId, ...result } },
      activity: { type: 'dunning.retry_requested', tenantId: enrollment.tenantId, subjectType: 'dunning_enrollment', subjectId: enrollment.id, summary: result.channel === 'stripe' ? `Payment retried in Stripe for invoice ${enrollment.invoiceId}` : `"Update your card" email sent for invoice ${enrollment.invoiceId}`, consoleLink: `/revenue/dunning/tenants/${enrollment.tenantId}` }
    };
  });
  return { enrollmentId: enrollment.id, ...result };
}

export async function setEnrollmentState(app: FastifyInstance, request: FastifyRequest, id: string, action: 'pause' | 'resume' | 'cancel', reason: string) {
  const enrollment = await loadEnrollment(app, id);
  const allowed: Record<typeof action, string[]> = { pause: ['ACTIVE'], resume: ['PAUSED'], cancel: ['ACTIVE', 'PAUSED', 'EXHAUSTED'] };
  if (!allowed[action].includes(enrollment.status)) throw new DunningError(409, 'INVALID_STATE', `Cannot ${action} an enrolment that is ${enrollment.status.toLowerCase()}.`);
  const now = new Date();
  const data: Prisma.DunningEnrollmentUpdateManyMutationInput =
    action === 'pause' ? { status: 'PAUSED', pausedAt: now } : action === 'resume' ? { status: 'ACTIVE', pausedAt: null, nextActionAt: now } : { status: 'CANCELLED', endedAt: now, endedReason: reason };
  return auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    const claimed = await tx.dunningEnrollment.updateMany({ where: { id, tenantId: enrollment.tenantId, status: enrollment.status }, data });
    if (claimed.count !== 1) throw new DunningError(409, 'INVALID_STATE', 'The enrolment changed; reload and try again.');
    await tx.dunningEvent.create({ data: { tenantId: enrollment.tenantId, invoiceId: enrollment.invoiceId, eventType: { pause: 'enrollment_paused', resume: 'enrollment_resumed', cancel: 'enrollment_cancelled' }[action], actorId: request.platform!.user.id, metadata: { enrollmentId: id, reason } } });
    const updated = await tx.dunningEnrollment.findUniqueOrThrow({ where: { id } });
    return {
      result: updated,
      audit: { action: `DUNNING_${action.toUpperCase()}`, targetTenantId: enrollment.tenantId, reason, metadata: { enrollmentId: id, from: enrollment.status, to: updated.status } },
      activity: { type: `dunning.${action === 'pause' ? 'paused' : action === 'resume' ? 'resumed' : 'cancelled'}`, tenantId: enrollment.tenantId, subjectType: 'dunning_enrollment', subjectId: id, summary: `Dunning ${action === 'pause' ? 'paused' : action === 'resume' ? 'resumed' : 'cancelled'} for invoice ${enrollment.invoiceId}`, consoleLink: `/revenue/dunning/tenants/${enrollment.tenantId}` }
    };
  });
}

// ── Reads ────────────────────────────────────────────────────────────────────

function presentEnrollment(row: DunningEnrollment & { sequence: { name: string; dunningSteps: DunningStep[] } }, tenant?: { id: string; name: string; slug: string | null } | null) {
  const steps = orderSteps(row.sequence.dunningSteps);
  const next = steps[row.currentStep];
  return {
    id: row.id,
    tenant: tenant ?? { id: row.tenantId, name: row.tenantId, slug: null },
    invoiceId: row.invoiceId,
    source: row.source,
    sequence: { id: row.sequenceId, name: row.sequence.name },
    status: row.status,
    stepsDone: Math.min(row.currentStep, steps.length),
    stepsTotal: steps.length,
    nextStep: row.status === 'ACTIVE' && next ? { action: next.action, dayOffset: next.dayOffset, dueAt: dueAt(row, next)!.toISOString() } : null,
    pausedAt: row.pausedAt?.toISOString() ?? null,
    endedAt: row.endedAt?.toISOString() ?? null,
    endedReason: row.endedReason,
    createdAt: row.createdAt.toISOString()
  };
}

export async function dunningOverview(app: Pick<FastifyInstance, 'prisma'>) {
  const since = new Date(Date.now() - 30 * DAY_MS);
  const [failedEvents, failedPayments, overdueInvoices, enrollments] = await Promise.all([
    app.prisma.dunningEvent.findMany({ where: { eventType: 'payment_failed', createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 100 }),
    app.prisma.payment.findMany({ where: { kind: 'PLATFORM', status: 'FAILED', updatedAt: { gte: since } }, select: { id: true, tenantId: true, invoiceId: true, amount: true, currency: true, updatedAt: true }, orderBy: { updatedAt: 'desc' }, take: 100 }),
    app.prisma.invoice.findMany({ where: { kind: 'PLATFORM', status: 'OVERDUE' }, select: { id: true, tenantId: true, invoiceNumber: true, total: true, currency: true, dueDate: true, stripeInvoiceId: true }, orderBy: { dueDate: 'asc' }, take: 100 }),
    app.prisma.dunningEnrollment.findMany({ where: { status: { in: ['ACTIVE', 'PAUSED', 'EXHAUSTED'] } }, include: { sequence: { include: { dunningSteps: true } } }, orderBy: { nextActionAt: 'asc' }, take: 200 })
  ]);
  const tenantIds = [...new Set([...failedEvents.map((row) => row.tenantId), ...failedPayments.map((row) => row.tenantId), ...overdueInvoices.map((row) => row.tenantId), ...enrollments.map((row) => row.tenantId)])];
  const tenants = tenantIds.length ? await app.prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true, slug: true, status: true } }) : [];
  const byId = new Map(tenants.map((tenant) => [tenant.id, tenant]));
  const tenantOf = (id: string) => byId.get(id) ?? { id, name: id, slug: null, status: null };
  return {
    stripe: vendorStatus('stripe'),
    failedPayments: [
      ...failedEvents.map((row) => ({ id: row.id, source: 'STRIPE', tenant: tenantOf(row.tenantId), invoiceRef: (row.metadata as { invoiceRef?: string } | null)?.invoiceRef ?? row.invoiceId, attempt: row.attempt, amount: null, currency: null, at: row.createdAt.toISOString() })),
      ...failedPayments.map((row) => ({ id: row.id, source: 'PLATFORM', tenant: tenantOf(row.tenantId), invoiceRef: row.invoiceId, attempt: null, amount: row.amount.toFixed(2), currency: row.currency, at: row.updatedAt.toISOString() }))
    ].sort((a, b) => b.at.localeCompare(a.at)),
    overdueInvoices: overdueInvoices.map((row) => ({ id: row.id, tenant: tenantOf(row.tenantId), invoiceNumber: row.invoiceNumber, total: row.total.toFixed(2), currency: row.currency, dueDate: row.dueDate?.toISOString() ?? null, stripeInvoiceId: row.stripeInvoiceId })),
    enrollments: enrollments.map((row) => presentEnrollment(row, tenantOf(row.tenantId)))
  };
}

export async function tenantDunningTimeline(app: Pick<FastifyInstance, 'prisma'>, tenantId: string) {
  const [tenant, enrollments, events, saveOffers] = await Promise.all([
    app.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true, slug: true, status: true } }),
    app.prisma.dunningEnrollment.findMany({ where: { tenantId }, include: { sequence: { include: { dunningSteps: true } } }, orderBy: { createdAt: 'desc' } }),
    app.prisma.dunningEvent.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 200 }),
    app.prisma.saveOffer.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 50 })
  ]);
  if (!tenant) return null;
  return {
    tenant,
    enrollments: enrollments.map((row) => ({
      ...presentEnrollment(row, tenant),
      steps: orderSteps(row.sequence.dunningSteps).map((step, index) => ({ id: step.id, dayOffset: step.dayOffset, action: step.action, template: step.template, dueAt: dueAt(row, step)!.toISOString(), done: index < row.currentStep }))
    })),
    events: events.map((row) => ({ id: row.id, eventType: row.eventType, invoiceId: row.invoiceId, attempt: row.attempt, actorId: row.actorId, metadata: row.metadata, createdAt: row.createdAt.toISOString() })),
    saveOffers: saveOffers.map((row) => ({ id: row.id, discount: row.discount.toFixed(2), status: row.status, code: row.code, expiresAt: row.expiresAt.toISOString(), redeemedAt: row.redeemedAt?.toISOString() ?? null }))
  };
}

// ── Sequence editor ──────────────────────────────────────────────────────────

export const sequenceBody = z.object({ name: z.string().trim().min(2).max(120), isDefault: z.boolean().optional(), active: z.boolean().optional() });
export const sequencePatchBody = sequenceBody.partial().refine((body) => Object.keys(body).length > 0, 'Nothing to change');
export const stepBody = z.object({ dayOffset: z.number().int().min(0).max(120), action: z.enum(STEP_ACTIONS), template: z.string().trim().min(1).max(80).optional() });
export const stepPatchBody = stepBody.partial().refine((body) => Object.keys(body).length > 0, 'Nothing to change');

function presentSequence(row: { id: string; name: string; active: boolean; isDefault: boolean; createdAt: Date; updatedAt: Date; dunningSteps: DunningStep[] }, counts?: Map<string, number>) {
  return {
    id: row.id,
    name: row.name,
    active: row.active,
    isDefault: row.isDefault,
    activeEnrollments: counts?.get(row.id) ?? 0,
    steps: orderSteps(row.dunningSteps).map((step) => ({ id: step.id, dayOffset: step.dayOffset, action: step.action, template: step.template })),
    updatedAt: row.updatedAt.toISOString()
  };
}

export async function listSequences(app: Pick<FastifyInstance, 'prisma'>) {
  await ensureDefaultSequence(app);
  const [rows, counts] = await Promise.all([
    app.prisma.dunningSequence.findMany({ include: { dunningSteps: true }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }),
    app.prisma.dunningEnrollment.groupBy({ by: ['sequenceId'], where: { status: { in: ['ACTIVE', 'PAUSED'] } }, _count: { _all: true } })
  ]);
  const map = new Map(counts.map((row) => [row.sequenceId, row._count._all]));
  return { data: rows.map((row) => presentSequence(row, map)), actions: STEP_ACTIONS, templates: STEP_TEMPLATES };
}

export async function getSequence(app: Pick<FastifyInstance, 'prisma'>, id: string) {
  const row = await app.prisma.dunningSequence.findUnique({ where: { id }, include: { dunningSteps: true } });
  return row ? presentSequence(row) : null;
}

function validateStep(step: { action?: string; template?: string }) {
  if (step.template && step.action && step.action !== 'SUSPEND' && step.action !== 'RETRY_PAYMENT' && !(STEP_TEMPLATES as readonly string[]).includes(step.template)) {
    throw new DunningError(400, 'UNKNOWN_TEMPLATE', `Email steps use one of: ${STEP_TEMPLATES.join(', ')}`);
  }
}

function defaultTemplate(action: StepAction) {
  return action === 'SUSPEND' ? 'tenant_suspended' : action === 'EMAIL_IN_APP' ? 'billing_final_warning' : 'billing_payment_failed';
}

export async function createSequence(app: FastifyInstance, request: FastifyRequest, body: z.infer<typeof sequenceBody>) {
  return auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    if (body.isDefault) await tx.dunningSequence.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
    const row = await tx.dunningSequence.create({ data: { name: body.name, steps: [], isDefault: body.isDefault ?? false, active: body.active ?? true }, include: { dunningSteps: true } });
    return {
      result: presentSequence(row),
      audit: { action: 'DUNNING_SEQUENCE_CREATED', metadata: { sequenceId: row.id, name: row.name, isDefault: row.isDefault } },
      activity: { type: 'dunning.sequence_created', subjectType: 'dunning_sequence', subjectId: row.id, summary: `Dunning sequence created: ${row.name}`, consoleLink: `/revenue/dunning/sequences/${row.id}` }
    };
  });
}

export async function patchSequence(app: FastifyInstance, request: FastifyRequest, id: string, body: z.infer<typeof sequencePatchBody>) {
  const before = await app.prisma.dunningSequence.findUnique({ where: { id } });
  if (!before) throw new DunningError(404, 'SEQUENCE_NOT_FOUND', 'Sequence not found');
  if (body.isDefault === false && before.isDefault) throw new DunningError(409, 'DEFAULT_REQUIRED', 'Make another sequence the default instead; exactly one is the default.');
  if (body.active === false && (body.isDefault ?? before.isDefault)) throw new DunningError(409, 'DEFAULT_REQUIRED', 'The default sequence cannot be deactivated.');
  return auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    if (body.isDefault) await tx.dunningSequence.updateMany({ where: { isDefault: true, id: { not: id } }, data: { isDefault: false } });
    const row = await tx.dunningSequence.update({ where: { id }, data: body, include: { dunningSteps: true } });
    return {
      result: presentSequence(row),
      audit: { action: 'DUNNING_SEQUENCE_UPDATED', metadata: { sequenceId: id, changes: body } },
      activity: { type: 'dunning.sequence_updated', subjectType: 'dunning_sequence', subjectId: id, summary: `Dunning sequence ${row.name}: ${Object.keys(body).join(', ')}`, consoleLink: `/revenue/dunning/sequences/${id}` }
    };
  });
}

export async function deleteSequence(app: FastifyInstance, request: FastifyRequest, id: string) {
  const before = await app.prisma.dunningSequence.findUnique({ where: { id } });
  if (!before) throw new DunningError(404, 'SEQUENCE_NOT_FOUND', 'Sequence not found');
  if (before.isDefault) throw new DunningError(409, 'DEFAULT_REQUIRED', 'The default sequence cannot be deleted.');
  const used = await app.prisma.dunningEnrollment.count({ where: { sequenceId: id } });
  if (used > 0) throw new DunningError(409, 'SEQUENCE_IN_USE', `${used} enrolment(s) used this sequence; deactivate it instead.`);
  return auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    await tx.dunningSequence.delete({ where: { id } });
    return {
      result: { id },
      audit: { action: 'DUNNING_SEQUENCE_DELETED', metadata: { sequenceId: id, name: before.name } },
      activity: { type: 'dunning.sequence_deleted', subjectType: 'dunning_sequence', subjectId: id, summary: `Dunning sequence deleted: ${before.name}`, severity: 'ATTENTION' }
    };
  });
}

/** Running enrolments follow steps by position, so adding, removing or re-timing a step would shift them. */
async function assertNoRunningEnrollments(app: Pick<FastifyInstance, 'prisma'>, sequenceId: string) {
  const running = await app.prisma.dunningEnrollment.count({ where: { sequenceId, status: { in: ['ACTIVE', 'PAUSED'] } } });
  if (running > 0) throw new DunningError(409, 'SEQUENCE_IN_USE', `${running} running enrolment(s) follow this sequence; create a new sequence (and make it the default) to change its timing.`);
}

export async function addStep(app: FastifyInstance, request: FastifyRequest, sequenceId: string, body: z.infer<typeof stepBody>) {
  const sequence = await app.prisma.dunningSequence.findUnique({ where: { id: sequenceId } });
  if (!sequence) throw new DunningError(404, 'SEQUENCE_NOT_FOUND', 'Sequence not found');
  validateStep(body);
  await assertNoRunningEnrollments(app, sequenceId);
  return auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    const step = await tx.dunningStep.create({ data: { sequenceId, dayOffset: body.dayOffset, action: body.action, template: body.template ?? defaultTemplate(body.action) } });
    const row = await tx.dunningSequence.findUniqueOrThrow({ where: { id: sequenceId }, include: { dunningSteps: true } });
    return {
      result: presentSequence(row),
      audit: { action: 'DUNNING_STEP_ADDED', metadata: { sequenceId, stepId: step.id, dayOffset: step.dayOffset, action: step.action } },
      activity: { type: 'dunning.sequence_updated', subjectType: 'dunning_sequence', subjectId: sequenceId, summary: `${sequence.name}: day ${step.dayOffset} ${step.action.toLowerCase()} added`, consoleLink: `/revenue/dunning/sequences/${sequenceId}` }
    };
  });
}

export async function patchStep(app: FastifyInstance, request: FastifyRequest, sequenceId: string, stepId: string, body: z.infer<typeof stepPatchBody>) {
  const step = await app.prisma.dunningStep.findFirst({ where: { id: stepId, sequenceId } });
  if (!step) throw new DunningError(404, 'STEP_NOT_FOUND', 'Step not found');
  validateStep({ action: body.action ?? step.action, template: body.template ?? (body.action ? defaultTemplate(body.action) : step.template) });
  if (body.dayOffset !== undefined && body.dayOffset !== step.dayOffset) await assertNoRunningEnrollments(app, sequenceId);
  return auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    await tx.dunningStep.update({ where: { id: stepId }, data: { ...body, ...(body.action && !body.template ? { template: defaultTemplate(body.action) } : {}) } });
    const row = await tx.dunningSequence.findUniqueOrThrow({ where: { id: sequenceId }, include: { dunningSteps: true } });
    return {
      result: presentSequence(row),
      audit: { action: 'DUNNING_STEP_UPDATED', metadata: { sequenceId, stepId, changes: body } },
      activity: { type: 'dunning.sequence_updated', subjectType: 'dunning_sequence', subjectId: sequenceId, summary: `${row.name}: step edited`, consoleLink: `/revenue/dunning/sequences/${sequenceId}` }
    };
  });
}

export async function deleteStep(app: FastifyInstance, request: FastifyRequest, sequenceId: string, stepId: string) {
  const step = await app.prisma.dunningStep.findFirst({ where: { id: stepId, sequenceId } });
  if (!step) throw new DunningError(404, 'STEP_NOT_FOUND', 'Step not found');
  await assertNoRunningEnrollments(app, sequenceId);
  return auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    await tx.dunningStep.delete({ where: { id: stepId } });
    const row = await tx.dunningSequence.findUniqueOrThrow({ where: { id: sequenceId }, include: { dunningSteps: true } });
    return {
      result: presentSequence(row),
      audit: { action: 'DUNNING_STEP_DELETED', metadata: { sequenceId, stepId, dayOffset: step.dayOffset, action: step.action } },
      activity: { type: 'dunning.sequence_updated', subjectType: 'dunning_sequence', subjectId: sequenceId, summary: `${row.name}: day ${step.dayOffset} ${step.action.toLowerCase()} removed`, consoleLink: `/revenue/dunning/sequences/${sequenceId}` }
    };
  });
}
