import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma, type SalesHandoff } from '@prisma/client';
import { z } from 'zod';
import { HANDOFF_TEMPLATE, type HandoffChecklistKey, type HandoffFieldKey } from '../config/handoff-template.js';
import { auditedMutation, staffMutationActor } from './console-mutation.js';
import { recordAndPublishActivity, SYSTEM_ACTOR } from './platform-activity.service.js';
import { notifyStaff, platformUsersWithPermission } from './platform-notifier.service.js';

// gtm.handoff (WP-4.17). A trial → paid conversion (a SubscriptionEvent moving a TRIALING or new subscription to
// ACTIVE) creates one SalesHandoff per tenant with the code-defined template, linked to the tenant's won SalesDeal when
// there is one. Sales fills in the fields and passes it to CS (PENDING_SALES → PENDING_CS); a CSM is assigned (and
// notified), accepts it, ticks the checklist and completes it. Every change is audited with tenant activity (C360).

const SERVICE = 'gtm.handoff';
const DAY_MS = 24 * 60 * 60 * 1000;
export const HANDOFF_ASSIGNEE_PERMISSION = 'customer.success.write' as const;
const OPEN_STATUSES = ['PENDING_SALES', 'PENDING_CS', 'ACCEPTED'];

export class HandoffError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

type ChecklistItem = { key: HandoffChecklistKey; label: string; done: boolean; doneAt: string | null; doneBy: string | null };
type HandoffDocument = { template: string; fields: Record<HandoffFieldKey, string>; checklist: ChecklistItem[] };

function emptyDocument(): HandoffDocument {
  return {
    template: HANDOFF_TEMPLATE.id,
    fields: Object.fromEntries(HANDOFF_TEMPLATE.fields.map((field) => [field.key, ''])) as Record<HandoffFieldKey, string>,
    checklist: HANDOFF_TEMPLATE.checklist.map((item) => ({ key: item.key, label: item.label, done: false, doneAt: null, doneBy: null }))
  };
}

/** Reads a stored document, filling anything the template has that the row lacks (older or hand-edited rows). */
function readDocument(value: Prisma.JsonValue): HandoffDocument {
  const base = emptyDocument();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return base;
  const record = value as Record<string, unknown>;
  const fields = record.fields && typeof record.fields === 'object' && !Array.isArray(record.fields) ? (record.fields as Record<string, unknown>) : {};
  for (const field of HANDOFF_TEMPLATE.fields) {
    const text = fields[field.key];
    if (typeof text === 'string') base.fields[field.key] = text;
  }
  const stored = Array.isArray(record.checklist) ? (record.checklist as Array<Record<string, unknown>>) : [];
  base.checklist = base.checklist.map((item) => {
    const match = stored.find((entry) => entry.key === item.key);
    return match ? { ...item, done: match.done === true, doneAt: typeof match.doneAt === 'string' ? match.doneAt : null, doneBy: typeof match.doneBy === 'string' ? match.doneBy : null } : item;
  });
  return base;
}

function toJson(document: HandoffDocument): Prisma.InputJsonObject {
  return { template: document.template, fields: document.fields, checklist: document.checklist };
}

// ── Producer ─────────────────────────────────────────────────────────────────

/** True when a subscription change is the conversion that should create a handoff. */
export function isConversion(fromStatus: string | null | undefined, toStatus: string | null | undefined) {
  return toStatus === 'ACTIVE' && (fromStatus === 'TRIALING' || fromStatus === null || fromStatus === undefined);
}

/**
 * Creates the tenant's handoff for a conversion event; a tenant gets one handoff (a later re-conversion does not add
 * another) and a redelivered event cannot add a second (unique subscriptionEventId). Never throws: a failure is logged
 * so it cannot fail the Stripe webhook that triggered it.
 */
export async function createHandoffForConversion(app: FastifyInstance, input: { tenantId: string; subscriptionEventId: string }) {
  try {
    const tenant = await app.prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { name: true, status: true } });
    if (!tenant || tenant.status === 'DEMO') return null;
    if (await app.prisma.salesHandoff.findFirst({ where: { tenantId: input.tenantId }, select: { id: true } })) return null;
    const deal = await app.prisma.salesDeal.findFirst({ where: { tenantId: input.tenantId, stage: 'WON' }, orderBy: { updatedAt: 'desc' }, select: { id: true } });
    const handoff = await app.prisma.salesHandoff.create({
      data: { tenantId: input.tenantId, dealId: deal?.id ?? null, status: 'PENDING_SALES', document: toJson(emptyDocument()), subscriptionEventId: input.subscriptionEventId }
    });
    await recordAndPublishActivity(app, {
      service: SERVICE,
      type: 'handoff.created',
      tenantId: input.tenantId,
      ...SYSTEM_ACTOR,
      subjectType: 'sales_handoff',
      subjectId: handoff.id,
      summary: `${tenant.name} converted to paid: handoff opened`,
      severity: 'ATTENTION',
      consoleLink: `/gtm/handoff/${handoff.id}`,
      dedupeKey: `handoff.created:${handoff.id}`
    });
    await notifyStaff(app, { permission: 'gtm.handoff.write', event: 'handoff.created', title: `${tenant.name} converted to paid: fill in the handoff`, link: `/gtm/handoff/${handoff.id}`, severity: 'ATTENTION', tenantId: input.tenantId });
    return handoff;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return null;
    app.log.error({ err: error, tenantId: input.tenantId }, 'Could not create the sales handoff for a conversion');
    return null;
  }
}

// ── Reads ────────────────────────────────────────────────────────────────────

async function present(app: Pick<FastifyInstance, 'prisma'>, rows: SalesHandoff[]) {
  const tenantIds = [...new Set(rows.map((row) => row.tenantId))];
  const csmIds = [...new Set(rows.flatMap((row) => (row.assignedCsmId ? [row.assignedCsmId] : [])))];
  const dealIds = [...new Set(rows.flatMap((row) => (row.dealId ? [row.dealId] : [])))];
  const [tenants, csms, deals] = await Promise.all([
    tenantIds.length ? app.prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true, slug: true, plan: true } }) : [],
    csmIds.length ? app.prisma.platformUser.findMany({ where: { id: { in: csmIds } }, select: { id: true, name: true, email: true } }) : [],
    dealIds.length ? app.prisma.salesDeal.findMany({ where: { id: { in: dealIds } }, select: { id: true, name: true, amount: true, ownerEmail: true, closeDate: true } }) : []
  ]);
  const tenantBy = new Map(tenants.map((row) => [row.id, row]));
  const csmBy = new Map(csms.map((row) => [row.id, row]));
  const dealBy = new Map(deals.map((row) => [row.id, row]));
  return rows.map((row) => {
    const document = readDocument(row.document);
    const deal = row.dealId ? dealBy.get(row.dealId) : undefined;
    return {
      id: row.id,
      tenant: tenantBy.get(row.tenantId) ?? { id: row.tenantId, name: row.tenantId, slug: null, plan: null },
      status: row.status,
      csm: row.assignedCsmId ? csmBy.get(row.assignedCsmId) ?? { id: row.assignedCsmId, name: null, email: null } : null,
      deal: deal ? { id: deal.id, name: deal.name, amount: deal.amount.toFixed(2), ownerEmail: deal.ownerEmail, closeDate: deal.closeDate?.toISOString() ?? null } : null,
      checklistDone: document.checklist.filter((item) => item.done).length,
      checklistTotal: document.checklist.length,
      document,
      assignedAt: row.assignedAt?.toISOString() ?? null,
      acceptedAt: row.acceptedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString()
    };
  });
}

export const queueQuery = z.object({ stage: z.enum(['ALL', 'SALES', 'CS']).default('ALL') });
export const wonQuery = z.object({ days: z.coerce.number().int().min(1).max(365).default(90) });

export async function listQueue(app: Pick<FastifyInstance, 'prisma'>, query: z.infer<typeof queueQuery>) {
  const statuses = query.stage === 'SALES' ? ['PENDING_SALES'] : query.stage === 'CS' ? ['PENDING_CS', 'ACCEPTED'] : OPEN_STATUSES;
  const rows = await app.prisma.salesHandoff.findMany({ where: { status: { in: statuses } }, orderBy: { createdAt: 'asc' }, take: 200 });
  return { data: await present(app, rows) };
}

export async function listWon(app: Pick<FastifyInstance, 'prisma'>, query: z.infer<typeof wonQuery>, now = new Date()) {
  const rows = await app.prisma.salesHandoff.findMany({ where: { createdAt: { gte: new Date(now.getTime() - query.days * DAY_MS) } }, orderBy: { createdAt: 'desc' }, take: 200 });
  return { data: await present(app, rows), days: query.days };
}

export async function getHandoff(app: Pick<FastifyInstance, 'prisma'>, id: string) {
  const row = await app.prisma.salesHandoff.findUnique({ where: { id } });
  if (!row) throw new HandoffError(404, 'HANDOFF_NOT_FOUND', 'Handoff not found');
  const [detail] = await present(app, [row]);
  return detail;
}

export function handoffTemplate() {
  return { data: [HANDOFF_TEMPLATE] };
}

export async function listAssignees(app: Pick<FastifyInstance, 'prisma'>) {
  const ids = await platformUsersWithPermission(app, HANDOFF_ASSIGNEE_PERMISSION);
  const users = ids.length ? await app.prisma.platformUser.findMany({ where: { id: { in: ids }, status: 'ACTIVE' }, select: { id: true, name: true, email: true }, orderBy: { name: 'asc' } }) : [];
  return { data: users, permission: HANDOFF_ASSIGNEE_PERMISSION };
}

// ── Changes ──────────────────────────────────────────────────────────────────

const fieldKeys = HANDOFF_TEMPLATE.fields.map((field) => field.key) as [HandoffFieldKey, ...HandoffFieldKey[]];
const checklistKeys = HANDOFF_TEMPLATE.checklist.map((item) => item.key) as [HandoffChecklistKey, ...HandoffChecklistKey[]];

export const updateHandoffBody = z
  .object({
    fields: z.record(z.enum(fieldKeys), z.string().max(4000)).optional(),
    checklist: z.array(z.object({ key: z.enum(checklistKeys), done: z.boolean() })).max(20).optional(),
    assignCsmId: z.string().min(1).nullable().optional(),
    status: z.enum(['PENDING_CS', 'ACCEPTED', 'COMPLETED']).optional()
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), 'Nothing to change');

const NEXT: Record<string, string> = { PENDING_SALES: 'PENDING_CS', PENDING_CS: 'ACCEPTED', ACCEPTED: 'COMPLETED' };

export async function updateHandoff(app: FastifyInstance, request: FastifyRequest, id: string, body: z.infer<typeof updateHandoffBody>, now = new Date()) {
  const row = await app.prisma.salesHandoff.findUnique({ where: { id } });
  if (!row) throw new HandoffError(404, 'HANDOFF_NOT_FOUND', 'Handoff not found');
  if (row.status === 'COMPLETED') throw new HandoffError(409, 'HANDOFF_COMPLETED', 'This handoff is complete.');
  const staffId = request.platform!.user.id;
  const document = readDocument(row.document);
  const changes: string[] = [];

  if (body.fields) {
    if (row.status !== 'PENDING_SALES' && row.status !== 'PENDING_CS') throw new HandoffError(409, 'FIELDS_LOCKED', 'The handoff notes are locked once CS has accepted it.');
    for (const [key, text] of Object.entries(body.fields) as Array<[HandoffFieldKey, string]>) document.fields[key] = text.trim();
    changes.push('notes');
  }
  if (body.checklist) {
    if (row.status !== 'ACCEPTED' && body.status !== 'ACCEPTED') throw new HandoffError(409, 'CHECKLIST_LOCKED', 'The checklist opens once a CSM has accepted the handoff.');
    for (const entry of body.checklist) {
      const item = document.checklist.find((candidate) => candidate.key === entry.key);
      if (item && item.done !== entry.done) Object.assign(item, { done: entry.done, doneAt: entry.done ? now.toISOString() : null, doneBy: entry.done ? staffId : null });
    }
    changes.push('checklist');
  }

  let assignedCsmId = row.assignedCsmId;
  if (body.assignCsmId !== undefined) {
    if (body.assignCsmId !== null) {
      const eligible = await platformUsersWithPermission(app, HANDOFF_ASSIGNEE_PERMISSION);
      if (!eligible.includes(body.assignCsmId)) throw new HandoffError(400, 'NOT_A_CSM', 'Assign someone with customer success access.');
    }
    assignedCsmId = body.assignCsmId;
    changes.push(body.assignCsmId ? 'assigned' : 'unassigned');
  }

  let status = row.status;
  if (body.status && body.status !== row.status) {
    if (NEXT[row.status] !== body.status) throw new HandoffError(409, 'INVALID_TRANSITION', `A ${row.status.toLowerCase().replace('_', ' ')} handoff cannot move to ${body.status.toLowerCase().replace('_', ' ')}.`);
    if (body.status === 'PENDING_CS') {
      const missing = HANDOFF_TEMPLATE.fields.filter((field) => field.requiredForCs && !document.fields[field.key]);
      if (missing.length) throw new HandoffError(400, 'FIELDS_REQUIRED', `Fill in before passing to CS: ${missing.map((field) => field.label).join('; ')}.`);
    }
    if (body.status === 'ACCEPTED' && !assignedCsmId) throw new HandoffError(400, 'CSM_REQUIRED', 'Assign a CSM before accepting.');
    if (body.status === 'COMPLETED' && document.checklist.some((item) => !item.done)) throw new HandoffError(400, 'CHECKLIST_OPEN', 'Tick every checklist item before completing.');
    status = body.status;
    changes.push(`status ${status}`);
  }

  const tenant = await app.prisma.tenant.findUnique({ where: { id: row.tenantId }, select: { name: true } });
  const tenantName = tenant?.name ?? row.tenantId;
  const assignedNow = body.assignCsmId !== undefined && body.assignCsmId !== null && body.assignCsmId !== row.assignedCsmId;

  const updated = await auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    const claimed = await tx.salesHandoff.updateMany({
      where: { id, tenantId: row.tenantId, status: row.status, updatedAt: row.updatedAt },
      data: {
        document: toJson(document),
        status,
        assignedCsmId,
        ...(assignedNow ? { assignedAt: now, assignedBy: staffId } : {}),
        ...(body.assignCsmId === null ? { assignedAt: null, assignedBy: null } : {}),
        ...(status === 'ACCEPTED' && row.status !== 'ACCEPTED' ? { acceptedAt: now } : {}),
        ...(status === 'COMPLETED' ? { completedAt: now, completedBy: staffId } : {})
      }
    });
    if (claimed.count !== 1) throw new HandoffError(409, 'HANDOFF_CHANGED', 'The handoff changed; reload and try again.');
    const action = status !== row.status ? `HANDOFF_${status}` : assignedNow ? 'HANDOFF_ASSIGNED' : 'HANDOFF_UPDATED';
    return {
      result: await tx.salesHandoff.findUniqueOrThrow({ where: { id } }),
      audit: { action, targetTenantId: row.tenantId, metadata: { handoffId: id, changes, from: row.status, to: status, assignedCsmId } },
      activity: { type: `handoff.${status !== row.status ? status.toLowerCase() : assignedNow ? 'assigned' : 'updated'}`, tenantId: row.tenantId, subjectType: 'sales_handoff', subjectId: id, summary: `${tenantName} handoff: ${changes.join(', ')}`, consoleLink: `/gtm/handoff/${id}` }
    };
  });

  if (assignedNow && body.assignCsmId) {
    await notifyStaff(app, { platformUserIds: [body.assignCsmId], event: 'handoff.assigned', title: `You are the CSM for ${tenantName}: review the handoff`, link: `/gtm/handoff/${id}`, severity: 'ATTENTION', tenantId: row.tenantId });
  }
  const [detail] = await present(app, [updated]);
  return detail;
}
