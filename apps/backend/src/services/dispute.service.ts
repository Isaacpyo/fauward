import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma, type PaymentDispute } from '@prisma/client';
import { z } from 'zod';
import { stripeService } from '../modules/payments/stripe.service.js';
import { auditedMutation, staffMutationActor } from './console-mutation.js';
import { notifyStaff } from './platform-notifier.service.js';
import { stripeAdapter } from './vendors/stripe.adapter.js';
import { vendorStatus } from './vendors/index.js';

// revenue.disputes (WP-4.6). Disputes only originate at Stripe: `charge.dispute.created/updated/closed` upsert one
// PaymentDispute per Stripe dispute (idempotent), matched to the disputed Payment (either ledger kind) and so to a
// tenant. Staff submit evidence through Stripe (`disputes.update`, submit: true, idempotency key) and keep internal
// notes (activity). Suspending the tenant is never automatic: it is a separate staff decision through D3.

const SERVICE = 'revenue.disputes';
const STRIPE_ACTOR = { kind: 'system' as const, id: 'stripe', label: 'Stripe' };
export const OPEN_DISPUTE_STATUSES = ['warning_needs_response', 'needs_response', 'warning_under_review', 'under_review'] as const;
const NEEDS_RESPONSE = ['warning_needs_response', 'needs_response'];
export const DEADLINE_WARNING_HOURS = 72;

export class DisputeError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

const link = (id: string) => `/revenue/disputes/${encodeURIComponent(id)}`;

/** The Payment a dispute is about, by its charge or PaymentIntent (gatewayRef), in either ledger. */
async function matchPayment(app: Pick<FastifyInstance, 'prisma'>, refs: string[]) {
  if (refs.length === 0) return null;
  for (const kind of ['PLATFORM', 'TENANT_CUSTOMER'] as const) {
    const payment = await app.prisma.payment.findFirst({ where: { kind, gatewayRef: { in: refs } }, select: { id: true, tenantId: true, kind: true } });
    if (payment) return payment;
  }
  return null;
}

/** Webhook producer: one row per Stripe dispute; a redelivered event changes nothing it has not already applied. */
export async function upsertDisputeFromStripe(app: Pick<FastifyInstance, 'prisma' | 'redis' | 'log'>, event: { id: string; type: string; created?: number; data: { object: Record<string, unknown> } }) {
  const parsed = stripeService.parseDispute(event.data.object);
  if (!parsed.stripeDisputeId) return null;
  const eventAt = event.created ? new Date(event.created * 1000) : new Date();
  const existing = await app.prisma.paymentDispute.findUnique({ where: { stripeDisputeId: parsed.stripeDisputeId } });
  // A redelivered event (same Stripe event id) was applied already: write nothing.
  if (existing && event.id && (await app.prisma.platformActivity.findUnique({ where: { dedupeKey: `stripe:${event.id}` }, select: { id: true } }))) return existing;
  // Out-of-order delivery: an older event never overwrites a newer one.
  if (existing?.lastEventAt && existing.lastEventAt > eventAt) return existing;
  const payment = existing?.paymentId ? null : await matchPayment(app, [parsed.chargeId, parsed.paymentIntentId].filter((value): value is string => Boolean(value)));
  const tenantId = existing?.tenantId ?? payment?.tenantId ?? parsed.tenantId ?? null;
  const fields = { status: parsed.status, reason: parsed.reason, amount: new Prisma.Decimal(parsed.amount), currency: parsed.currency, evidenceDueBy: parsed.evidenceDueBy, lastEventAt: eventAt };
  const created = !existing;
  const statusChanged = existing && existing.status !== parsed.status;
  return auditedMutation(app, SERVICE, STRIPE_ACTOR, async (tx) => {
    const row = existing
      ? await tx.paymentDispute.update({ where: { id: existing.id }, data: { ...fields, ...(tenantId && !existing.tenantId ? { tenantId } : {}) } })
      : await tx.paymentDispute.create({
          data: { ...fields, stripeDisputeId: parsed.stripeDisputeId!, stripeChargeId: parsed.chargeId, tenantId, paymentId: payment?.id ?? null, paymentKind: payment?.kind ?? null }
        });
    const closed = parsed.status === 'won' || parsed.status === 'lost';
    return {
      result: row,
      audit: { action: created ? 'DISPUTE_OPENED' : 'DISPUTE_UPDATED', targetTenantId: tenantId, metadata: { disputeId: row.id, stripeDisputeId: row.stripeDisputeId, stripeEventId: event.id, status: row.status, amount: row.amount.toFixed(2), currency: row.currency } },
      activity: {
        type: created ? 'dispute.created' : closed ? 'dispute.closed' : 'dispute.updated',
        tenantId,
        subjectType: 'payment_dispute',
        subjectId: row.id,
        summary: created ? `Chargeback opened: ${row.amount.toFixed(2)} ${row.currency} (${row.reason})` : `Dispute ${row.stripeDisputeId}: ${statusChanged ? `${existing?.status} → ` : ''}${row.status}`,
        severity: created || parsed.status === 'lost' ? 'ATTENTION' : 'INFO',
        consoleLink: link(row.id),
        dedupeKey: `stripe:${event.id}`
      }
    };
  });
}

/** Hourly: an open dispute whose evidence is due within 72 h gets one ATTENTION activity and a bell entry. */
export async function sweepDisputeDeadlines(app: Pick<FastifyInstance, 'prisma' | 'redis' | 'log'>, now = new Date()) {
  const horizon = new Date(now.getTime() + DEADLINE_WARNING_HOURS * 3_600_000);
  const due = await app.prisma.paymentDispute.findMany({ where: { status: { in: NEEDS_RESPONSE }, submittedAt: null, deadlineNotifiedAt: null, evidenceDueBy: { gt: now, lte: horizon } } });
  for (const dispute of due) {
    const claimed = await app.prisma.paymentDispute.updateMany({ where: { id: dispute.id, deadlineNotifiedAt: null }, data: { deadlineNotifiedAt: now } });
    if (claimed.count !== 1) continue;
    const hours = Math.max(1, Math.round((dispute.evidenceDueBy!.getTime() - now.getTime()) / 3_600_000));
    await auditedMutation(app, SERVICE, { kind: 'system', id: 'revenue.dispute-deadline-sweep', label: 'Dispute deadlines' }, async () => ({
      result: null,
      audit: { action: 'DISPUTE_DEADLINE_WARNING', targetTenantId: dispute.tenantId, metadata: { disputeId: dispute.id, evidenceDueBy: dispute.evidenceDueBy!.toISOString() } },
      activity: { type: 'dispute.evidence_due', tenantId: dispute.tenantId, subjectType: 'payment_dispute', subjectId: dispute.id, summary: `Evidence due in ${hours} h for dispute ${dispute.stripeDisputeId} (${dispute.amount.toFixed(2)} ${dispute.currency})`, severity: 'ATTENTION', consoleLink: link(dispute.id), dedupeKey: `dispute.evidence_due:${dispute.id}` }
    }));
    await notifyStaff(app as FastifyInstance, { permission: 'revenue.disputes.write', event: 'dispute.evidence_due', title: `Dispute evidence due in ${hours} h`, body: `${dispute.amount.toFixed(2)} ${dispute.currency} · ${dispute.reason}`, link: link(dispute.id), severity: 'ATTENTION', tenantId: dispute.tenantId });
  }
  return { warned: due.length };
}

// ── Reads ────────────────────────────────────────────────────────────────────

export const disputeListQuery = z.object({
  status: z.enum(['OPEN', 'CLOSED', 'ALL']).default('OPEN'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().min(1).optional()
});

function present(row: PaymentDispute, tenant: { id: string; name: string; slug: string } | null, now = new Date()) {
  const hoursLeft = row.evidenceDueBy ? Math.round((row.evidenceDueBy.getTime() - now.getTime()) / 3_600_000) : null;
  return {
    id: row.id,
    stripeDisputeId: row.stripeDisputeId,
    stripeChargeId: row.stripeChargeId,
    tenant,
    paymentId: row.paymentId,
    paymentKind: row.paymentKind,
    amount: row.amount.toFixed(2),
    currency: row.currency,
    reason: row.reason,
    status: row.status,
    needsResponse: NEEDS_RESPONSE.includes(row.status) && !row.submittedAt,
    evidenceDueBy: row.evidenceDueBy?.toISOString() ?? null,
    hoursLeft,
    dueSoon: hoursLeft !== null && hoursLeft >= 0 && hoursLeft <= DEADLINE_WARNING_HOURS && NEEDS_RESPONSE.includes(row.status) && !row.submittedAt,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

async function tenantsOf(app: Pick<FastifyInstance, 'prisma'>, rows: PaymentDispute[]) {
  const ids = [...new Set(rows.map((row) => row.tenantId).filter((id): id is string => Boolean(id)))];
  const tenants = ids.length ? await app.prisma.tenant.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true } }) : [];
  return new Map(tenants.map((tenant) => [tenant.id, tenant]));
}

export async function listDisputes(app: Pick<FastifyInstance, 'prisma'>, query: z.infer<typeof disputeListQuery>) {
  const where: Prisma.PaymentDisputeWhereInput = query.status === 'OPEN' ? { status: { in: [...OPEN_DISPUTE_STATUSES] } } : query.status === 'CLOSED' ? { status: { notIn: [...OPEN_DISPUTE_STATUSES] } } : {};
  const rows = await app.prisma.paymentDispute.findMany({
    where,
    orderBy: [{ evidenceDueBy: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }, { id: 'asc' }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
  });
  const page = rows.slice(0, query.limit);
  const tenants = await tenantsOf(app, page);
  return {
    data: page.map((row) => present(row, row.tenantId ? tenants.get(row.tenantId) ?? null : null)),
    nextCursor: rows.length > query.limit ? page[page.length - 1]?.id ?? null : null,
    stripe: vendorStatus('stripe')
  };
}

export async function getDispute(app: Pick<FastifyInstance, 'prisma'>, id: string) {
  const row = await app.prisma.paymentDispute.findUnique({ where: { id } });
  if (!row) return null;
  const [tenants, payment, notes] = await Promise.all([
    tenantsOf(app, [row]),
    row.paymentId && row.tenantId && row.paymentKind
      ? app.prisma.payment.findFirst({ where: { id: row.paymentId, tenantId: row.tenantId, kind: row.paymentKind === 'PLATFORM' ? 'PLATFORM' : 'TENANT_CUSTOMER' }, select: { id: true, amount: true, currency: true, status: true, invoiceId: true, gatewayRef: true, createdAt: true } })
      : Promise.resolve(null),
    app.prisma.platformActivity.findMany({ where: { service: SERVICE, subjectId: id, type: 'dispute.note_added' }, orderBy: { occurredAt: 'desc' }, take: 100 })
  ]);
  return {
    ...present(row, row.tenantId ? tenants.get(row.tenantId) ?? null : null),
    evidence: row.evidence,
    payment: payment ? { ...payment, amount: payment.amount.toFixed(2), createdAt: payment.createdAt.toISOString() } : null,
    notes: notes.map((note) => ({ id: note.id, body: (note.metadata as { body?: string } | null)?.body ?? note.summary, author: note.actorLabel, at: note.occurredAt.toISOString() })),
    stripe: vendorStatus('stripe')
  };
}

// ── Staff actions ────────────────────────────────────────────────────────────

/** Stripe's evidence fields that take text (files need uploads, not offered here). */
export const EVIDENCE_FIELDS = ['product_description', 'customer_name', 'customer_email_address', 'billing_address', 'service_date', 'access_activity_log', 'cancellation_policy_disclosure', 'refund_policy_disclosure', 'uncategorized_text'] as const;

export const evidenceBody = z.object({
  reason: z.string().trim().min(8),
  evidence: z.record(z.enum(EVIDENCE_FIELDS), z.string().trim().min(1).max(20_000)).refine((value) => Object.keys(value).length > 0, 'Add at least one evidence field')
});

export const noteBody = z.object({ body: z.string().trim().min(1).max(5000) });

export async function submitEvidence(app: FastifyInstance, request: FastifyRequest, id: string, body: z.infer<typeof evidenceBody>) {
  const dispute = await app.prisma.paymentDispute.findUnique({ where: { id } });
  if (!dispute) throw new DisputeError(404, 'DISPUTE_NOT_FOUND', 'Dispute not found');
  if (!NEEDS_RESPONSE.includes(dispute.status)) throw new DisputeError(409, 'NOT_RESPONDABLE', `Stripe no longer takes evidence for a dispute that is ${dispute.status}.`);
  if (!stripeAdapter.isConfigured()) throw new DisputeError(409, 'STRIPE_NOT_CONFIGURED', 'Stripe is not configured, so evidence cannot be submitted from the console.');
  const header = request.headers['idempotency-key'];
  const idempotencyKey = typeof header === 'string' && header.trim() ? `dispute-evidence:${header.trim()}` : `dispute-evidence:${dispute.id}:${Date.now()}`;
  const result = await stripeAdapter.submitDisputeEvidence(dispute.stripeDisputeId, body.evidence, idempotencyKey);
  const now = new Date();
  return auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    const row = await tx.paymentDispute.update({ where: { id }, data: { evidence: body.evidence, submittedAt: now, status: result.status } });
    return {
      result: { id: row.id, status: row.status, submittedAt: now.toISOString(), idempotencyKey },
      audit: { action: 'DISPUTE_EVIDENCE_SUBMITTED', targetTenantId: dispute.tenantId, reason: body.reason, metadata: { disputeId: id, stripeDisputeId: dispute.stripeDisputeId, fields: Object.keys(body.evidence), idempotencyKey } },
      activity: { type: 'dispute.evidence_submitted', tenantId: dispute.tenantId, subjectType: 'payment_dispute', subjectId: id, summary: `Evidence submitted to Stripe for dispute ${dispute.stripeDisputeId}`, consoleLink: link(id) }
    };
  });
}

export async function addNote(app: FastifyInstance, request: FastifyRequest, id: string, body: z.infer<typeof noteBody>) {
  const dispute = await app.prisma.paymentDispute.findUnique({ where: { id } });
  if (!dispute) throw new DisputeError(404, 'DISPUTE_NOT_FOUND', 'Dispute not found');
  return auditedMutation(app, SERVICE, staffMutationActor(request), async () => ({
    result: { disputeId: id, body: body.body },
    audit: { action: 'DISPUTE_NOTE_ADDED', targetTenantId: dispute.tenantId, metadata: { disputeId: id } },
    activity: { type: 'dispute.note_added', tenantId: dispute.tenantId, subjectType: 'payment_dispute', subjectId: id, summary: `Note on dispute ${dispute.stripeDisputeId}: ${body.body.slice(0, 120)}`, consoleLink: link(id), metadata: { body: body.body } }
  }));
}

export function disputesVendor() {
  return vendorStatus('stripe');
}
