import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma, type ActivitySeverity, type IncidentRecord, type IncidentRunbook, type PlatformAnnouncement } from '@prisma/client';
import { z } from 'zod';
import { publishActivity, recordActivity, staffActor, type ActivityInput } from './platform-activity.service.js';
import { writePlatformAuditLog } from './platform-audit.service.js';
import { notifyStaff, notifyTenantAdmins } from './platform-notifier.service.js';
import { announcementState, audienceTenantWhere } from './announcement.service.js';
import { platformAuditActor } from '../modules/internal/request-meta.js';

// platform.incidents (WP-4.2). Native incidents are the source of truth: staff declare them (severity SEV1–SEV4,
// services, commander), move them INVESTIGATING → IDENTIFIED → MONITORING → RESOLVED, tag impacted tenants and post
// updates. A public update creates or updates one PlatformAnnouncement of type INCIDENT for the impacted tenants (or all
// tenants), which the tenant portal's AnnouncementBanner shows; resolving expires it. PagerDuty, when its webhook secret
// is set, is an optional producer that upserts incidents by vendorId. Console requests run in system context, so every
// per-tenant query names the tenant.

export const OPEN_STATUSES = ['INVESTIGATING', 'IDENTIFIED', 'MONITORING'] as const;
export const INCIDENT_STATUSES = [...OPEN_STATUSES, 'RESOLVED'] as const;
export const SEVERITIES = ['SEV1', 'SEV2', 'SEV3', 'SEV4'] as const;
export const IMPACT_LEVELS = ['AFFECTED', 'DEGRADED', 'OUTAGE'] as const;
const HIGH_SEVERITIES: readonly string[] = ['SEV1', 'SEV2'];

export type Severity = (typeof SEVERITIES)[number];

const service = z.string().trim().min(1).max(60);
const platformUserId = z.string().min(1).nullable();
const url = z.string().trim().url().max(500);
const slug = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug: lowercase letters, digits and hyphens');

export const incidentListQuery = z.object({
  status: z.enum(['ACTIVE', 'RESOLVED', 'ALL', ...INCIDENT_STATUSES]).default('ALL'),
  severity: z.enum(SEVERITIES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export const incidentCreateBody = z.object({
  title: z.string().trim().min(3).max(200),
  severity: z.enum(SEVERITIES),
  services: z.array(service).max(20).default([]),
  commanderPlatformUserId: platformUserId.optional(),
  description: z.string().trim().min(1).max(5000).optional(),
  startedAt: z.string().datetime({ offset: true }).optional()
});

export const incidentPatchBody = z
  .object({
    title: z.string().trim().min(3).max(200).optional(),
    status: z.enum(OPEN_STATUSES).optional(),
    severity: z.enum(SEVERITIES).optional(),
    services: z.array(service).max(20).optional(),
    commanderPlatformUserId: platformUserId.optional(),
    runbookIds: z.array(z.string().min(1)).max(50).optional(),
    postmortemUrl: url.nullable().optional()
  })
  .refine((body) => Object.keys(body).length > 0, 'Nothing to change');

export const incidentUpdateBody = z.object({
  body: z.string().trim().min(1).max(5000),
  isPublic: z.boolean().default(false),
  status: z.enum(OPEN_STATUSES).optional(),
  /** Who a public update reaches; defaults to the impacted tenants when there are any, else every tenant. */
  audience: z.enum(['IMPACTED', 'ALL']).optional()
});

export const incidentImpactBody = z.object({
  tenantId: z.string().min(1, 'tenantId is required'),
  impactLevel: z.enum(IMPACT_LEVELS).default('AFFECTED'),
  notes: z.string().trim().max(2000).optional()
});

export const incidentResolveBody = z.object({
  postmortemUrl: url.nullable().optional(),
  /** Final public note; it replaces the announcement text just before the announcement expires. */
  publicMessage: z.string().trim().min(1).max(5000).optional()
});

export const runbookCreateBody = z.object({
  title: z.string().trim().min(3).max(200),
  slug: slug.optional(),
  body: z.string().trim().min(1).max(50_000),
  service: service.nullable().optional()
});

export const runbookPatchBody = z
  .object({ title: z.string().trim().min(3).max(200).optional(), slug: slug.optional(), body: z.string().trim().min(1).max(50_000).optional(), service: service.nullable().optional() })
  .refine((body) => Object.keys(body).length > 0, 'Nothing to change');

export class IncidentError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

type Person = { id: string; email: string | null; name: string | null };
type Db = Prisma.TransactionClient;
type AuditSpec = { action: string; targetTenantId?: string | null; reason?: string | null; metadata: Prisma.InputJsonObject };
type Actor = { kind: 'staff'; request: FastifyRequest } | { kind: 'pagerduty' };

const consoleLink = (id: string) => `/platform/incidents/${encodeURIComponent(id)}`;
const isHigh = (severity: string | null | undefined) => Boolean(severity && HIGH_SEVERITIES.includes(severity));

function auditActor(actor: Actor) {
  if (actor.kind === 'staff') return { ...platformAuditActor(actor.request), actorType: 'PLATFORM_USER' as const };
  return { actorType: 'SYSTEM' as const, actorId: 'pagerduty', actorEmail: null, ipAddress: null, userAgent: null };
}

function activityActor(actor: Actor): Pick<ActivityInput, 'actorType' | 'actorId' | 'actorLabel'> {
  return actor.kind === 'staff' ? staffActor(actor.request) : { actorType: 'SYSTEM', actorId: null, actorLabel: 'PagerDuty' };
}

/**
 * Runs the change, its PlatformAuditLog row and its PlatformActivity row in one transaction, then publishes the activity
 * to the console stream after commit.
 */
async function audited<T>(
  app: FastifyInstance,
  actor: Actor,
  change: (tx: Db) => Promise<{ result: T; audit: AuditSpec; activity: Omit<ActivityInput, 'service' | 'actorType' | 'actorId' | 'actorLabel'> }>
): Promise<T> {
  const { result, activity } = await app.prisma.$transaction(async (tx) => {
    const out = await change(tx);
    await writePlatformAuditLog(tx, { ...auditActor(actor), action: out.audit.action, targetTenantId: out.audit.targetTenantId ?? null, reason: out.audit.reason ?? null, metadata: out.audit.metadata });
    const row = await recordActivity(tx, { service: 'platform.incidents', ...activityActor(actor), ...out.activity });
    return { result: out.result, activity: row };
  });
  publishActivity(app.redis, activity, app.log);
  return result;
}

async function people(app: FastifyInstance, ids: Array<string | null | undefined>) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id) && id !== 'pagerduty'))];
  const rows = unique.length ? await app.prisma.platformUser.findMany({ where: { id: { in: unique } }, select: { id: true, email: true, name: true } }) : [];
  return new Map<string, Person>(rows.map((row) => [row.id, row]));
}

function person(map: Map<string, Person>, id: string | null) {
  if (!id) return null;
  if (id === 'pagerduty') return { id, email: null, name: 'PagerDuty' };
  return map.get(id) ?? { id, email: null, name: null };
}

async function requireActiveCommander(app: FastifyInstance, id: string | null | undefined) {
  if (!id) return;
  const user = await app.prisma.platformUser.findUnique({ where: { id }, select: { status: true } });
  if (!user || user.status !== 'ACTIVE') throw new IncidentError(400, 'INVALID_COMMANDER', 'The commander must be an active console user');
}

function presentIncident(row: IncidentRecord & { _count?: { impacts: number } }, map: Map<string, Person>) {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    severity: row.severity,
    vendor: row.vendor,
    vendorId: row.vendorId,
    services: row.serviceTags,
    commander: person(map, row.commanderPlatformUserId),
    createdBy: person(map, row.createdByPlatformUserId),
    publicSummary: row.publicSummary,
    postmortemUrl: row.postmortemUrl,
    announcementId: row.announcementId,
    runbookIds: row.runbookIds,
    impactCount: row._count?.impacts ?? null,
    startedAt: (row.startedAt ?? row.createdAt).toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function presentRunbook(row: IncidentRunbook) {
  return { id: row.id, title: row.title, slug: row.slug, body: row.body, service: row.service, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

function presentAnnouncement(row: PlatformAnnouncement | null) {
  if (!row) return null;
  return { id: row.id, type: row.type, title: row.title, body: row.body, targetAll: row.targetAll, tenantIds: row.tenantIds, dismissible: row.dismissible, expiresAt: row.expiresAt?.toISOString() ?? null, state: announcementState(row) };
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function listIncidents(app: FastifyInstance, query: z.infer<typeof incidentListQuery>) {
  const where: Prisma.IncidentRecordWhereInput = {
    ...(query.status === 'ACTIVE' ? { resolvedAt: null, status: { in: [...OPEN_STATUSES] } } : query.status === 'RESOLVED' ? { status: 'RESOLVED' } : query.status === 'ALL' ? {} : { status: query.status }),
    ...(query.severity ? { severity: query.severity } : {})
  };
  const [rows, total] = await Promise.all([
    app.prisma.incidentRecord.findMany({
      where,
      include: { _count: { select: { impacts: true } } },
      // Active first, then the most severe, then the newest.
      orderBy: [{ resolvedAt: { sort: 'desc', nulls: 'first' } }, { severity: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: query.limit
    }),
    app.prisma.incidentRecord.count({ where })
  ]);
  const map = await people(app, rows.map((row) => row.commanderPlatformUserId));
  return { data: rows.map((row) => presentIncident(row, map)), total };
}

export async function getIncident(app: FastifyInstance, id: string) {
  const row = await app.prisma.incidentRecord.findUnique({ where: { id }, include: { impacts: { orderBy: { createdAt: 'asc' } }, updates: { orderBy: { createdAt: 'desc' } } } });
  if (!row) return null;
  const tenantIds = row.impacts.map((impact) => impact.tenantId);
  const [tenants, map, linked, suggested, announcement] = await Promise.all([
    tenantIds.length ? app.prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true, slug: true } }) : Promise.resolve([]),
    people(app, [row.commanderPlatformUserId, row.createdByPlatformUserId, ...row.updates.map((update) => update.authorId)]),
    row.runbookIds.length ? app.prisma.incidentRunbook.findMany({ where: { id: { in: row.runbookIds } }, orderBy: { title: 'asc' } }) : Promise.resolve([]),
    row.serviceTags.length ? app.prisma.incidentRunbook.findMany({ where: { service: { in: row.serviceTags }, id: { notIn: row.runbookIds } }, orderBy: { title: 'asc' }, take: 20 }) : Promise.resolve([]),
    row.announcementId ? app.prisma.platformAnnouncement.findUnique({ where: { id: row.announcementId } }) : Promise.resolve(null)
  ]);
  const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]));
  return {
    ...presentIncident({ ...row, _count: { impacts: row.impacts.length } }, map),
    impacts: row.impacts.map((impact) => ({
      id: impact.id,
      tenant: tenantById.get(impact.tenantId) ?? { id: impact.tenantId, name: impact.tenantId, slug: null },
      impactLevel: impact.impactLevel,
      notes: impact.notes,
      createdAt: impact.createdAt.toISOString()
    })),
    updates: row.updates.map((update) => ({ id: update.id, status: update.status, body: update.body, isPublic: update.isPublic, author: person(map, update.authorId), createdAt: update.createdAt.toISOString() })),
    runbooks: { linked: linked.map(presentRunbook), suggested: suggested.map(presentRunbook) },
    announcement: presentAnnouncement(announcement)
  };
}

/** Active console users who can run an incident (hold platform.incidents.write through an unexpired role). */
export async function listResponders(app: FastifyInstance) {
  const now = new Date();
  const staff = await app.prisma.staffUser.findMany({
    where: {
      status: 'ACTIVE',
      platformUserId: { not: null },
      platformUser: { status: 'ACTIVE' },
      roleAssignments: { some: { role: { permissions: { has: 'platform.incidents.write' } }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }
    },
    select: { platformUser: { select: { id: true, email: true, name: true } } },
    orderBy: { name: 'asc' }
  });
  return staff.flatMap((row) => (row.platformUser ? [row.platformUser] : []));
}

// ── Mutations ────────────────────────────────────────────────────────────────

async function notifyHighSeverity(app: FastifyInstance, incident: Pick<IncidentRecord, 'id' | 'title' | 'severity'>, excludePlatformUserId: string | null) {
  await notifyStaff(app, {
    permission: 'platform.incidents.read',
    event: 'incident.declared',
    title: `${incident.severity} incident: ${incident.title}`,
    body: 'A high-severity incident is open. Open it to see the commander, impacted tenants and updates.',
    link: consoleLink(incident.id),
    severity: 'CRITICAL',
    email: true,
    ...(excludePlatformUserId ? { excludePlatformUserIds: [excludePlatformUserId] } : {})
  });
}

export async function createIncident(app: FastifyInstance, request: FastifyRequest, body: z.infer<typeof incidentCreateBody>) {
  const staffId = request.platform!.user.id;
  await requireActiveCommander(app, body.commanderPlatformUserId);
  const incident = await audited(app, { kind: 'staff', request }, async (tx) => {
    const created = await tx.incidentRecord.create({
      data: {
        vendor: 'native',
        title: body.title,
        status: 'INVESTIGATING',
        severity: body.severity,
        serviceTags: body.services,
        commanderPlatformUserId: body.commanderPlatformUserId ?? null,
        createdByPlatformUserId: staffId,
        startedAt: body.startedAt ? new Date(body.startedAt) : new Date()
      }
    });
    if (body.description) await tx.incidentUpdate.create({ data: { incidentId: created.id, status: created.status, body: body.description, isPublic: false, authorId: staffId } });
    return {
      result: created,
      audit: { action: 'INCIDENT_CREATED', metadata: { incidentId: created.id, severity: body.severity, services: body.services, commanderPlatformUserId: created.commanderPlatformUserId } },
      activity: {
        type: 'incident.created',
        subjectType: 'incident',
        subjectId: created.id,
        summary: `${body.severity} incident declared: ${body.title}`,
        severity: isHigh(body.severity) ? 'CRITICAL' : 'ATTENTION',
        consoleLink: consoleLink(created.id),
        dedupeKey: `incident.created:${created.id}`
      }
    };
  });
  if (isHigh(incident.severity)) await notifyHighSeverity(app, incident, null);
  if (incident.commanderPlatformUserId && incident.commanderPlatformUserId !== staffId) await notifyCommander(app, incident);
  return incident;
}

async function notifyCommander(app: FastifyInstance, incident: Pick<IncidentRecord, 'id' | 'title' | 'severity' | 'commanderPlatformUserId'>) {
  if (!incident.commanderPlatformUserId) return;
  await notifyStaff(app, {
    platformUserIds: [incident.commanderPlatformUserId],
    event: 'incident.commander_assigned',
    title: `You are incident commander: ${incident.title}`,
    body: `${incident.severity ?? 'Unrated'} incident`,
    link: consoleLink(incident.id),
    severity: isHigh(incident.severity) ? 'CRITICAL' : 'ATTENTION'
  });
}

async function findIncident(app: FastifyInstance, id: string) {
  const incident = await app.prisma.incidentRecord.findUnique({ where: { id } });
  if (!incident) throw new IncidentError(404, 'INCIDENT_NOT_FOUND', 'Incident not found');
  return incident;
}

export async function patchIncident(app: FastifyInstance, request: FastifyRequest, id: string, body: z.infer<typeof incidentPatchBody>) {
  const before = await findIncident(app, id);
  const resolved = before.status === 'RESOLVED';
  if (resolved && Object.keys(body).some((key) => key !== 'postmortemUrl')) throw new IncidentError(409, 'INCIDENT_RESOLVED', 'A resolved incident only takes its postmortem link.');
  if (body.commanderPlatformUserId !== undefined) await requireActiveCommander(app, body.commanderPlatformUserId);
  if (body.runbookIds?.length) {
    const found = await app.prisma.incidentRunbook.count({ where: { id: { in: body.runbookIds } } });
    if (found !== new Set(body.runbookIds).size) throw new IncidentError(400, 'UNKNOWN_RUNBOOK', 'One or more runbooks do not exist');
  }
  const data: Prisma.IncidentRecordUpdateInput = {
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.status !== undefined ? { status: body.status } : {}),
    ...(body.severity !== undefined ? { severity: body.severity } : {}),
    ...(body.services !== undefined ? { serviceTags: body.services } : {}),
    ...(body.commanderPlatformUserId !== undefined ? { commanderPlatformUserId: body.commanderPlatformUserId } : {}),
    ...(body.runbookIds !== undefined ? { runbookIds: [...new Set(body.runbookIds)] } : {}),
    ...(body.postmortemUrl !== undefined ? { postmortemUrl: body.postmortemUrl } : {})
  };
  const changes: Record<string, { from: Prisma.InputJsonValue | null; to: Prisma.InputJsonValue | null }> = {};
  const track = (field: string, from: string | string[] | null, to: string | string[] | null | undefined) => {
    if (to !== undefined && JSON.stringify(from) !== JSON.stringify(to)) changes[field] = { from, to };
  };
  track('title', before.title, body.title);
  track('status', before.status, body.status);
  track('severity', before.severity, body.severity);
  track('services', before.serviceTags, body.services);
  track('commanderPlatformUserId', before.commanderPlatformUserId, body.commanderPlatformUserId);
  track('runbookIds', before.runbookIds, body.runbookIds);
  track('postmortemUrl', before.postmortemUrl, body.postmortemUrl);
  const staffId = request.platform!.user.id;
  const escalated = changes.severity !== undefined && isHigh(body.severity) && !isHigh(before.severity);

  const after = await audited(app, { kind: 'staff', request }, async (tx) => {
    const updated = await tx.incidentRecord.update({ where: { id }, data });
    const timeline = [
      changes.status ? `Status ${before.status} → ${updated.status}` : null,
      changes.severity ? `Severity ${before.severity ?? 'unrated'} → ${updated.severity}` : null,
      changes.commanderPlatformUserId ? (updated.commanderPlatformUserId ? 'Commander changed' : 'Commander cleared') : null
    ].filter((line): line is string => Boolean(line));
    if (timeline.length > 0) await tx.incidentUpdate.create({ data: { incidentId: id, status: updated.status, body: timeline.join(' · '), isPublic: false, authorId: staffId } });
    return {
      result: updated,
      audit: { action: 'INCIDENT_UPDATED', metadata: { incidentId: id, changes } },
      activity: {
        type: 'incident.updated',
        subjectType: 'incident',
        subjectId: id,
        summary: `${updated.title}: ${Object.keys(changes).join(', ') || 'no change'}`,
        severity: escalated ? 'CRITICAL' : 'INFO',
        consoleLink: consoleLink(id)
      }
    };
  });
  if (escalated) await notifyHighSeverity(app, after, staffId);
  if (changes.commanderPlatformUserId && after.commanderPlatformUserId && after.commanderPlatformUserId !== staffId) await notifyCommander(app, after);
  return after;
}

/** Tenants a public update reaches: the impacted ones, or every tenant that can see the portal. */
async function targetTenantIds(app: FastifyInstance, announcement: Pick<PlatformAnnouncement, 'targetAll' | 'tenantIds'>) {
  if (!announcement.targetAll) return announcement.tenantIds;
  const tenants = await app.prisma.tenant.findMany({ where: audienceTenantWhere({ targetAll: true, tenantIds: [], planTiers: [] }), select: { id: true } });
  return tenants.map((tenant) => tenant.id);
}

export async function postIncidentUpdate(app: FastifyInstance, request: FastifyRequest, id: string, body: z.infer<typeof incidentUpdateBody>) {
  const incident = await findIncident(app, id);
  if (incident.status === 'RESOLVED') throw new IncidentError(409, 'INCIDENT_RESOLVED', 'The incident is resolved; reopen it by declaring a new one.');
  const staffId = request.platform!.user.id;
  const impacted = body.isPublic ? (await app.prisma.incidentTenantImpact.findMany({ where: { incidentId: id }, select: { tenantId: true } })).map((row) => row.tenantId) : [];
  const audience = body.isPublic ? body.audience ?? (impacted.length > 0 ? 'IMPACTED' : 'ALL') : null;
  if (audience === 'IMPACTED' && impacted.length === 0) throw new IncidentError(400, 'NO_IMPACTED_TENANTS', 'Tag the impacted tenants first, or send the update to all tenants.');
  const existing = body.isPublic && incident.announcementId ? await app.prisma.platformAnnouncement.findUnique({ where: { id: incident.announcementId } }) : null;

  const outcome = await audited(app, { kind: 'staff', request }, async (tx) => {
    const status = body.status ?? incident.status;
    const update = await tx.incidentUpdate.create({ data: { incidentId: id, status, body: body.body, isPublic: body.isPublic, authorId: staffId } });
    let announcement: PlatformAnnouncement | null = null;
    if (audience) {
      const content = {
        type: 'INCIDENT',
        title: `Service incident: ${incident.title}`,
        body: body.body,
        targetAll: audience === 'ALL',
        tenantIds: audience === 'ALL' ? [] : impacted,
        planTiers: [],
        dismissible: !isHigh(incident.severity),
        expiresAt: null
      };
      announcement =
        existing && !existing.archivedAt
          ? await tx.platformAnnouncement.update({ where: { id: existing.id }, data: content })
          : await tx.platformAnnouncement.create({ data: { ...content, createdBy: staffId } });
    }
    await tx.incidentRecord.update({
      where: { id },
      data: { ...(body.status ? { status: body.status } : {}), ...(announcement ? { announcementId: announcement.id, publicSummary: body.body } : {}) }
    });
    return {
      result: { update, announcement },
      audit: { action: 'INCIDENT_UPDATE_POSTED', metadata: { incidentId: id, updateId: update.id, isPublic: body.isPublic, audience, announcementId: announcement?.id ?? null, status } },
      activity: {
        type: 'incident.update_posted',
        subjectType: 'incident',
        subjectId: id,
        summary: `${incident.title}: ${body.isPublic ? `public update to ${audience === 'ALL' ? 'all tenants' : `${impacted.length} impacted tenant(s)`}` : 'internal update'}`,
        severity: (body.isPublic ? 'ATTENTION' : 'INFO') satisfies ActivitySeverity,
        consoleLink: consoleLink(id)
      }
    };
  });

  let notified = { tenants: 0, inApp: 0, emailsQueued: 0 };
  // SEV1/SEV2 public updates also reach tenant admins by in-app notification and the incident_update email.
  if (outcome.announcement && isHigh(incident.severity)) {
    const tenantIds = await targetTenantIds(app, outcome.announcement);
    for (const tenantId of tenantIds) {
      const result = await notifyTenantAdmins(app, {
        tenantId,
        event: 'incident.update',
        title: `Incident update: ${incident.title}`,
        body: body.body.slice(0, 500),
        email: { template: 'incident_update', data: { title: incident.title, body: body.body } }
      });
      notified = { tenants: notified.tenants + 1, inApp: notified.inApp + result.inApp, emailsQueued: notified.emailsQueued + result.emailsQueued };
    }
  }
  return {
    update: { id: outcome.update.id, status: outcome.update.status, body: outcome.update.body, isPublic: outcome.update.isPublic, createdAt: outcome.update.createdAt.toISOString() },
    announcement: presentAnnouncement(outcome.announcement),
    notified
  };
}

export async function addIncidentImpact(app: FastifyInstance, request: FastifyRequest, id: string, body: z.infer<typeof incidentImpactBody>) {
  const incident = await findIncident(app, id);
  const tenant = await app.prisma.tenant.findUnique({ where: { id: body.tenantId }, select: { id: true, name: true, slug: true } });
  if (!tenant) throw new IncidentError(404, 'TENANT_NOT_FOUND', 'Tenant not found');
  const announcement = incident.announcementId ? await app.prisma.platformAnnouncement.findUnique({ where: { id: incident.announcementId } }) : null;
  // A live, targeted incident announcement also reaches a tenant tagged after it went out.
  const extend = announcement && !announcement.targetAll && !announcement.archivedAt && announcementState(announcement) === 'ACTIVE' && !announcement.tenantIds.includes(tenant.id);
  return audited(app, { kind: 'staff', request }, async (tx) => {
    const impact = await tx.incidentTenantImpact.upsert({
      where: { incidentId_tenantId: { incidentId: id, tenantId: tenant.id } },
      create: { incidentId: id, tenantId: tenant.id, impactLevel: body.impactLevel, notes: body.notes || null },
      update: { impactLevel: body.impactLevel, notes: body.notes || null }
    });
    if (extend && announcement) await tx.platformAnnouncement.update({ where: { id: announcement.id }, data: { tenantIds: { push: tenant.id } } });
    return {
      result: { id: impact.id, tenant, impactLevel: impact.impactLevel, notes: impact.notes, createdAt: impact.createdAt.toISOString(), announcementExtended: Boolean(extend) },
      audit: { action: 'INCIDENT_IMPACT_ADDED', targetTenantId: tenant.id, metadata: { incidentId: id, impactLevel: body.impactLevel, announcementExtended: Boolean(extend) } },
      activity: {
        type: 'incident.impact_added',
        tenantId: tenant.id,
        subjectType: 'incident',
        subjectId: id,
        summary: `${tenant.name} tagged as ${body.impactLevel.toLowerCase()} by ${incident.title}`,
        severity: 'ATTENTION',
        consoleLink: consoleLink(id)
      }
    };
  });
}

export async function resolveIncident(app: FastifyInstance, request: FastifyRequest, id: string, body: z.infer<typeof incidentResolveBody>) {
  const incident = await findIncident(app, id);
  if (incident.status === 'RESOLVED') throw new IncidentError(409, 'ALREADY_RESOLVED', 'The incident is already resolved');
  const staffId = request.platform!.user.id;
  const announcement = incident.announcementId ? await app.prisma.platformAnnouncement.findUnique({ where: { id: incident.announcementId } }) : null;
  const now = new Date();
  return audited(app, { kind: 'staff', request }, async (tx) => {
    const resolved = await tx.incidentRecord.update({
      where: { id },
      data: { status: 'RESOLVED', resolvedAt: now, ...(body.postmortemUrl !== undefined ? { postmortemUrl: body.postmortemUrl } : {}), ...(body.publicMessage && announcement ? { publicSummary: body.publicMessage } : {}) }
    });
    await tx.incidentUpdate.create({ data: { incidentId: id, status: 'RESOLVED', body: body.publicMessage ?? 'Resolved', isPublic: Boolean(body.publicMessage && announcement), authorId: staffId } });
    const expired = announcement ? await tx.platformAnnouncement.update({ where: { id: announcement.id }, data: { expiresAt: now, ...(body.publicMessage ? { body: body.publicMessage } : {}) } }) : null;
    return {
      result: { incident: resolved, announcement: presentAnnouncement(expired) },
      audit: { action: 'INCIDENT_RESOLVED', metadata: { incidentId: id, postmortemUrl: resolved.postmortemUrl, announcementId: expired?.id ?? null } },
      activity: { type: 'incident.resolved', subjectType: 'incident', subjectId: id, summary: `${incident.severity ?? 'Unrated'} incident resolved: ${incident.title}`, severity: 'INFO', consoleLink: consoleLink(id) }
    };
  });
}

// ── Runbooks ─────────────────────────────────────────────────────────────────

function slugify(title: string) {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .replace(/-+$/g, '') || 'runbook'
  );
}

function slugConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export async function listRunbooks(app: FastifyInstance) {
  const rows = await app.prisma.incidentRunbook.findMany({ orderBy: { title: 'asc' } });
  return { data: rows.map(presentRunbook) };
}

export async function getRunbook(app: FastifyInstance, id: string) {
  const row = await app.prisma.incidentRunbook.findUnique({ where: { id } });
  if (!row) return null;
  const incidents = await app.prisma.incidentRecord.findMany({ where: { runbookIds: { has: id } }, select: { id: true, title: true, status: true, severity: true }, orderBy: { createdAt: 'desc' }, take: 20 });
  return { ...presentRunbook(row), linkedIncidents: incidents };
}

export async function createRunbook(app: FastifyInstance, request: FastifyRequest, body: z.infer<typeof runbookCreateBody>) {
  const slugValue = body.slug ?? slugify(body.title);
  try {
    return await audited(app, { kind: 'staff', request }, async (tx) => {
      const row = await tx.incidentRunbook.create({ data: { title: body.title, slug: slugValue, body: body.body, service: body.service ?? null } });
      return {
        result: presentRunbook(row),
        audit: { action: 'INCIDENT_RUNBOOK_CREATED', metadata: { runbookId: row.id, slug: row.slug } },
        activity: { type: 'incident.runbook_created', subjectType: 'incident_runbook', subjectId: row.id, summary: `Runbook created: ${row.title}`, consoleLink: `/platform/incidents/runbooks/${row.id}` }
      };
    });
  } catch (error) {
    if (slugConflict(error)) throw new IncidentError(409, 'SLUG_TAKEN', `A runbook with the slug ${slugValue} already exists`);
    throw error;
  }
}

export async function patchRunbook(app: FastifyInstance, request: FastifyRequest, id: string, body: z.infer<typeof runbookPatchBody>) {
  const before = await app.prisma.incidentRunbook.findUnique({ where: { id } });
  if (!before) throw new IncidentError(404, 'RUNBOOK_NOT_FOUND', 'Runbook not found');
  try {
    return await audited(app, { kind: 'staff', request }, async (tx) => {
      const row = await tx.incidentRunbook.update({
        where: { id },
        data: { ...(body.title !== undefined ? { title: body.title } : {}), ...(body.slug !== undefined ? { slug: body.slug } : {}), ...(body.body !== undefined ? { body: body.body } : {}), ...(body.service !== undefined ? { service: body.service } : {}) }
      });
      return {
        result: presentRunbook(row),
        audit: { action: 'INCIDENT_RUNBOOK_UPDATED', metadata: { runbookId: id, fields: Object.keys(body) } },
        activity: { type: 'incident.runbook_updated', subjectType: 'incident_runbook', subjectId: id, summary: `Runbook edited: ${row.title} (${Object.keys(body).join(', ')})`, consoleLink: `/platform/incidents/runbooks/${id}` }
      };
    });
  } catch (error) {
    if (slugConflict(error)) throw new IncidentError(409, 'SLUG_TAKEN', `A runbook with the slug ${body.slug} already exists`);
    throw error;
  }
}

export async function deleteRunbook(app: FastifyInstance, request: FastifyRequest, id: string) {
  const row = await app.prisma.incidentRunbook.findUnique({ where: { id } });
  if (!row) throw new IncidentError(404, 'RUNBOOK_NOT_FOUND', 'Runbook not found');
  return audited(app, { kind: 'staff', request }, async (tx) => {
    // Unlink it from every incident first, so no incident points at a missing runbook.
    const linked = await tx.incidentRecord.findMany({ where: { runbookIds: { has: id } }, select: { id: true, runbookIds: true } });
    for (const incident of linked) await tx.incidentRecord.update({ where: { id: incident.id }, data: { runbookIds: incident.runbookIds.filter((item) => item !== id) } });
    await tx.incidentRunbook.delete({ where: { id } });
    return {
      result: { id, unlinkedIncidents: linked.length },
      audit: { action: 'INCIDENT_RUNBOOK_DELETED', metadata: { runbookId: id, slug: row.slug, unlinkedIncidents: linked.length } },
      activity: { type: 'incident.runbook_deleted', subjectType: 'incident_runbook', subjectId: id, summary: `Runbook deleted: ${row.title}`, severity: 'ATTENTION' }
    };
  });
}

// ── PagerDuty (optional producer) ────────────────────────────────────────────

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

const PD_STATUS: Record<string, (typeof INCIDENT_STATUSES)[number]> = { triggered: 'INVESTIGATING', acknowledged: 'IDENTIFIED', resolved: 'RESOLVED' };

/** PagerDuty v3 (`event.data`), v2 (`messages[].incident`/`incident`) or a bare incident object → native fields. */
export function parsePagerDutyIncident(body: Record<string, unknown>) {
  const event = record(body.event);
  const firstMessage = Array.isArray(body.messages) ? record(body.messages[0]) : {};
  const incident = Object.keys(record(event.data)).length ? record(event.data) : Object.keys(record(body.incident)).length ? record(body.incident) : Object.keys(record(firstMessage.incident)).length ? record(firstMessage.incident) : body;
  const vendorId = text(incident.id);
  const eventType = text(event.event_type) ?? text(firstMessage.event) ?? '';
  const rawStatus = (text(incident.status) ?? eventType.split('.').pop() ?? '').toLowerCase();
  const priority = text(record(incident.priority).summary);
  const priorityMatch = priority?.match(/^P([1-4])$/i);
  const urgency = text(incident.urgency)?.toLowerCase();
  const severity: Severity | null = priorityMatch ? (`SEV${priorityMatch[1]}` as Severity) : urgency === 'high' ? 'SEV2' : urgency === 'low' ? 'SEV3' : null;
  const serviceName = text(record(incident.service).summary);
  const createdAt = text(incident.created_at);
  return {
    vendorId,
    title: text(incident.title) ?? text(incident.summary) ?? 'PagerDuty incident',
    status: PD_STATUS[rawStatus] ?? null,
    rawStatus: rawStatus || null,
    severity,
    services: serviceName ? [serviceName] : [],
    startedAt: createdAt && !Number.isNaN(Date.parse(createdAt)) ? new Date(createdAt) : null
  };
}

export async function upsertPagerDutyIncident(app: FastifyInstance, parsed: ReturnType<typeof parsePagerDutyIncident> & { vendorId: string }, payload: Prisma.InputJsonObject) {
  const existing = await app.prisma.incidentRecord.findUnique({ where: { vendorId: parsed.vendorId } });
  const status = parsed.status ?? existing?.status ?? 'INVESTIGATING';
  const severity = parsed.severity ?? existing?.severity ?? 'SEV3';
  const now = new Date();
  const becameResolved = status === 'RESOLVED' && existing?.status !== 'RESOLVED';
  const announcement = becameResolved && existing?.announcementId ? await app.prisma.platformAnnouncement.findUnique({ where: { id: existing.announcementId } }) : null;
  const incident = await audited(app, { kind: 'pagerduty' }, async (tx) => {
    const row = existing
      ? await tx.incidentRecord.update({
          where: { id: existing.id },
          data: { title: parsed.title, status, severity, payload, ...(becameResolved ? { resolvedAt: now } : {}), ...(parsed.services.length && existing.serviceTags.length === 0 ? { serviceTags: parsed.services } : {}) }
        })
      : await tx.incidentRecord.create({
          data: { vendor: 'pagerduty', vendorId: parsed.vendorId, title: parsed.title, status, severity, serviceTags: parsed.services, payload, startedAt: parsed.startedAt ?? now, ...(status === 'RESOLVED' ? { resolvedAt: now } : {}) }
        });
    if (!existing || existing.status !== status) await tx.incidentUpdate.create({ data: { incidentId: row.id, status, body: `PagerDuty: ${parsed.rawStatus ?? 'event'}`, isPublic: false, authorId: 'pagerduty' } });
    if (announcement) await tx.platformAnnouncement.update({ where: { id: announcement.id }, data: { expiresAt: now } });
    return {
      result: row,
      audit: { action: existing ? 'INCIDENT_PAGERDUTY_UPDATED' : 'INCIDENT_PAGERDUTY_CREATED', metadata: { incidentId: row.id, vendorId: parsed.vendorId, status, severity } },
      activity: {
        type: existing ? 'incident.updated' : 'incident.created',
        subjectType: 'incident',
        subjectId: row.id,
        summary: existing ? `PagerDuty: ${row.title} is ${status.toLowerCase()}` : `PagerDuty ${severity} incident: ${row.title}`,
        severity: !existing && isHigh(severity) ? 'CRITICAL' : status === 'RESOLVED' ? 'INFO' : 'ATTENTION',
        consoleLink: consoleLink(row.id)
      }
    };
  });
  if (!existing && isHigh(incident.severity) && incident.status !== 'RESOLVED') await notifyHighSeverity(app, incident, null);
  return { incident, created: !existing };
}
