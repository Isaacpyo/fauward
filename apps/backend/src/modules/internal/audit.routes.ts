import type { FastifyInstance } from 'fastify';
import type { PlatformAuditLog, Prisma } from '@prisma/client';
import { z } from 'zod';
import { authenticatePlatformSession } from '../../middleware/authenticate-platform-session.js';
import { requirePlatformCsrf } from '../../middleware/require-platform-csrf.js';
import { consoleUserHas, requireConsolePermission } from '../../middleware/require-console-permission.js';
import { dangerous } from '../../middleware/dangerous.js';
import { AUDIT_CHAIN_VERIFY_JOB, auditChainVerifyJob } from '../../services/audit-chain.service.js';
import { runScheduledJob } from '../../queues/scheduled-job-runner.js';
import { recordAndPublishActivity, staffActor } from '../../services/platform-activity.service.js';
import { writeInternalAudit } from './internal-audit.js';

// trust.audit (WP-1.9): server-filtered, cursor-paginated platform audit log; export is a dangerous action and is itself
// audited. Chain verification (WP-5.1) runs as the trust.audit-chain-verify job: nightly, or on demand from the integrity
// page; every run is a ScheduledJobRun.

export const AUDIT_EXPORT_MAX_ROWS = 10_000;

type VerificationRunRow = { id: string; status: string; triggeredBy: string; startedAt: Date; finishedAt: Date | null; durationMs: number | null; error: string | null; result: Prisma.JsonValue | null };

function presentVerificationRun(run: VerificationRunRow) {
  return {
    id: run.id,
    status: run.status,
    triggeredBy: run.triggeredBy,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    durationMs: run.durationMs,
    error: run.error,
    result: run.result ?? null
  };
}

const filterShape = {
  actor: z.string().trim().min(1).optional(),
  action: z.string().trim().min(1).optional(),
  targetType: z.string().trim().min(1).optional(),
  targetId: z.string().trim().min(1).optional(),
  tenantId: z.string().trim().min(1).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  q: z.string().trim().min(1).optional()
};

const listQuery = z.object({
  ...filterShape,
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).optional()
});

const exportBody = z.object({
  ...filterShape,
  format: z.enum(['csv', 'json']).default('json'),
  reason: z.string().trim().min(1)
});

export type AuditFilters = { [K in keyof typeof filterShape]?: string };

// L17 (WP-2.16): search over tenants' own AuditLog. A tenant is required unless the caller may export audit data.
const tenantEventsQuery = z.object({
  tenantId: z.string().trim().min(1).optional(),
  action: z.string().trim().min(1).optional(),
  actorType: z.enum(['USER', 'API_KEY', 'IMPERSONATOR', 'SYSTEM']).optional(),
  resourceType: z.string().trim().min(1).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().min(1).optional()
});

export function tenantEventsWhere(filters: z.infer<typeof tenantEventsQuery>): Prisma.AuditLogWhereInput {
  return {
    ...(filters.tenantId ? { tenantId: filters.tenantId } : {}),
    ...(filters.action ? { action: insensitive(filters.action) } : {}),
    ...(filters.actorType ? { actorType: filters.actorType } : {}),
    ...(filters.resourceType ? { resourceType: filters.resourceType } : {}),
    ...(filters.from || filters.to ? { timestamp: { ...(filters.from ? { gte: new Date(filters.from) } : {}), ...(filters.to ? { lte: new Date(filters.to) } : {}) } } : {})
  };
}

const insensitive = (value: string) => ({ contains: value, mode: 'insensitive' as const });

/** Every filter narrows the set (AND); actor and free text each match any of their columns (OR within). */
export function auditWhere(filters: AuditFilters): Prisma.PlatformAuditLogWhereInput {
  const and: Prisma.PlatformAuditLogWhereInput[] = [];
  if (filters.actor) and.push({ OR: [{ actorEmail: insensitive(filters.actor) }, { actorId: filters.actor }] });
  if (filters.action) and.push({ action: insensitive(filters.action) });
  if (filters.targetType) and.push({ targetType: filters.targetType });
  if (filters.targetId) and.push({ OR: [{ targetId: insensitive(filters.targetId) }, { targetUserId: filters.targetId }] });
  if (filters.tenantId) and.push({ targetTenantId: filters.tenantId });
  if (filters.from || filters.to) {
    and.push({ createdAt: { ...(filters.from ? { gte: new Date(filters.from) } : {}), ...(filters.to ? { lte: new Date(filters.to) } : {}) } });
  }
  if (filters.q) {
    and.push({
      OR: [{ actorEmail: insensitive(filters.q) }, { action: insensitive(filters.q) }, { targetId: insensitive(filters.q) }, { targetTenantId: filters.q }, { reason: insensitive(filters.q) }]
    });
  }
  return and.length > 0 ? { AND: and } : {};
}

function pickFilters(input: AuditFilters): AuditFilters {
  return Object.fromEntries(Object.keys(filterShape).flatMap((key) => (input[key as keyof AuditFilters] ? [[key, input[key as keyof AuditFilters]]] : [])));
}

const CSV_HEADERS = ['id', 'seq', 'hashVersion', 'createdAt', 'actorType', 'actorId', 'actorEmail', 'actorRole', 'action', 'targetType', 'targetId', 'targetTenantId', 'targetUserId', 'reason', 'previousHash', 'hash'] as const;

export function auditRowsToCsv(rows: PlatformAuditLog[]) {
  const escape = (value: unknown) => `"${(value instanceof Date ? value.toISOString() : String(value ?? '')).replaceAll('"', '""')}"`;
  return [CSV_HEADERS.join(','), ...rows.map((row) => CSV_HEADERS.map((header) => escape(row[header])).join(','))].join('\n');
}

export async function registerInternalAuditRoutes(app: FastifyInstance) {
  app.get('/api/internal/audit/entries', { preHandler: [authenticatePlatformSession, requireConsolePermission('trust.audit.read')] }, async (request, reply) => {
    const parsed = listQuery.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_QUERY', message: parsed.error.issues[0]?.message });
    const query = parsed.data;
    const where = auditWhere(query);
    const [rows, total] = await Promise.all([
      app.prisma.platformAuditLog.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
      }),
      app.prisma.platformAuditLog.count({ where })
    ]);
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    // Tenant names for TenantChip; tenants are looked up by the ids on this page only.
    const tenantIds = [...new Set(page.flatMap((row) => (row.targetTenantId ? [row.targetTenantId] : [])))];
    const tenants = tenantIds.length > 0 ? await app.prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true, slug: true } }) : [];
    const byId = new Map(tenants.map((tenant) => [tenant.id, tenant]));
    const data = page.map((row) => ({ ...row, targetTenant: row.targetTenantId ? byId.get(row.targetTenantId) ?? null : null }));
    return reply.send({ data, total, nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null });
  });

  app.get('/api/internal/audit/tenant-events', { preHandler: [authenticatePlatformSession, requireConsolePermission('trust.audit.read')] }, async (request, reply) => {
    const parsed = tenantEventsQuery.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_QUERY', message: parsed.error.issues[0]?.message });
    const query = parsed.data;
    if (!query.tenantId && !(await consoleUserHas(request, 'trust.audit.export'))) {
      return reply.status(400).send({ error: 'TENANT_REQUIRED', message: 'Choose a tenant. Searching every tenant needs trust.audit.export.' });
    }
    const where = tenantEventsWhere(query);
    const rows = await app.prisma.auditLog.findMany({
      where,
      orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        tenantId: true,
        actorId: true,
        actorType: true,
        action: true,
        resourceType: true,
        resourceId: true,
        timestamp: true,
        metadata: true,
        actor: { select: { email: true } },
        tenant: { select: { id: true, name: true, slug: true } }
      }
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    return reply.send({
      data: page.map((row) => ({ ...row, timestamp: row.timestamp.toISOString(), actorLabel: row.actorType === 'IMPERSONATOR' ? 'Fauward staff (via impersonation)' : row.actor?.email ?? row.actorType })),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null
    });
  });

  app.get('/api/internal/audit/entries/:id', { preHandler: [authenticatePlatformSession, requireConsolePermission('trust.audit.read')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const entry = await app.prisma.platformAuditLog.findUnique({ where: { id } });
    if (!entry) return reply.status(404).send({ error: 'NOT_FOUND', message: 'Audit entry not found' });
    return reply.send(entry);
  });

  app.post('/api/internal/audit/export', { preHandler: dangerous('trust.audit.export') }, async (request, reply) => {
    const parsed = exportBody.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_BODY', message: parsed.error.issues[0]?.message });
    const body = parsed.data;
    const filters = pickFilters(body);
    const rows = await app.prisma.platformAuditLog.findMany({
      where: auditWhere(filters),
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: AUDIT_EXPORT_MAX_ROWS + 1
    });
    const truncated = rows.length > AUDIT_EXPORT_MAX_ROWS;
    const exported = truncated ? rows.slice(0, AUDIT_EXPORT_MAX_ROWS) : rows;
    // Written after the read, so the export never contains its own row.
    const range = `${filters.from ?? 'begin'}:${filters.to ?? 'now'}`;
    await writeInternalAudit(request, 'audit.export', 'audit_log', range, null, { filters, format: body.format, rows: exported.length, truncated }, body.reason);
    await recordAndPublishActivity(
      { prisma: app.prisma, redis: app.redis, log: app.log },
      {
        service: 'trust.audit',
        type: 'audit.exported',
        tenantId: filters.tenantId ?? null,
        ...staffActor(request),
        subjectType: 'audit_log',
        subjectId: range,
        summary: `${request.platform!.user.email} exported ${exported.length} audit entries as ${body.format.toUpperCase()}`,
        severity: 'ATTENTION',
        consoleLink: '/trust/audit',
        metadata: { filters, format: body.format, rows: exported.length, truncated }
      }
    );
    const content = body.format === 'csv' ? auditRowsToCsv(exported) : JSON.stringify(exported, null, 2);
    const mime = body.format === 'csv' ? 'text/csv' : 'application/json';
    return reply.send({ url: `data:${mime};base64,${Buffer.from(content).toString('base64')}`, format: body.format, rows: exported.length, truncated, maxRows: AUDIT_EXPORT_MAX_ROWS });
  });

  app.get('/api/internal/audit/verification', { preHandler: [authenticatePlatformSession, requireConsolePermission('trust.audit.read')] }, async (_request, reply) => {
    const last = await app.prisma.scheduledJobRun.findFirst({ where: { jobName: AUDIT_CHAIN_VERIFY_JOB }, orderBy: [{ startedAt: 'desc' }, { id: 'desc' }] });
    return reply.send({ data: last ? presentVerificationRun(last) : null, schedule: auditChainVerifyJob.pattern });
  });

  app.post('/api/internal/audit/verify', { preHandler: [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission('trust.audit.export')] }, async (request, reply) => {
    const { runId } = await runScheduledJob(app, auditChainVerifyJob, { triggeredBy: request.platform!.user.id, reason: 'Verified from the audit integrity page' });
    const run = runId ? await app.prisma.scheduledJobRun.findUnique({ where: { id: runId } }) : null;
    if (!run) return reply.status(503).send({ error: 'VERIFICATION_NOT_RECORDED', message: 'The verification ran but its run record could not be written.' });
    return reply.send({ data: presentVerificationRun(run) });
  });
}
