import type { FastifyInstance } from 'fastify';
import { authenticatePlatformSession } from '../../middleware/authenticate-platform-session.js';
import { requirePlatformCsrf } from '../../middleware/require-platform-csrf.js';
import { requireInternalPermission } from '../../middleware/require-internal-permission.js';
import { verifyPlatformAuditChain } from '../../services/platform-audit.service.js';
import { writeAudit } from '@fauward/internal-audit';
import type { PlatformAuditClient } from '@fauward/internal-audit';

function jsonToCsv(rows: Array<Record<string, unknown>>) {
  const headers = ['id', 'createdAt', 'actorEmail', 'actorRole', 'action', 'targetType', 'targetId', 'reason', 'hash'];
  const escape = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  return [headers.join(','), ...rows.map((row) => headers.map((header) => escape(row[header])).join(','))].join('\n');
}

export async function registerInternalAuditRoutes(app: FastifyInstance) {
  app.get('/api/internal/audit/entries', { preHandler: [authenticatePlatformSession, requireInternalPermission('trust.audit.read')] }, async (request, reply) => {
    const query = request.query as { actor?: string; action?: string; targetType?: string; targetId?: string; from?: string; to?: string; q?: string; page?: string; limit?: string };
    const limit = Math.min(100, Math.max(1, Number(query.limit ?? 50)));
    const page = Math.max(1, Number(query.page ?? 1));
    const where = {
      actorEmail: query.actor ? { contains: query.actor, mode: 'insensitive' as const } : undefined,
      action: query.action ? { contains: query.action, mode: 'insensitive' as const } : undefined,
      targetType: query.targetType || undefined,
      targetId: query.targetId ? { contains: query.targetId, mode: 'insensitive' as const } : undefined,
      createdAt: query.from || query.to ? { gte: query.from ? new Date(query.from) : undefined, lte: query.to ? new Date(query.to) : undefined } : undefined,
      OR: query.q
        ? [
            { actorEmail: { contains: query.q, mode: 'insensitive' as const } },
            { action: { contains: query.q, mode: 'insensitive' as const } },
            { targetId: { contains: query.q, mode: 'insensitive' as const } },
            { reason: { contains: query.q, mode: 'insensitive' as const } }
          ]
        : undefined
    };
    const [data, total] = await Promise.all([
      app.prisma.platformAuditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      app.prisma.platformAuditLog.count({ where })
    ]);
    reply.send({ data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  });

  app.get('/api/internal/audit/entries/:id', { preHandler: [authenticatePlatformSession, requireInternalPermission('trust.audit.read')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const entry = await app.prisma.platformAuditLog.findUnique({ where: { id } });
    if (!entry) return reply.status(404).send({ error: 'Audit entry not found' });
    reply.send(entry);
  });

  app.post('/api/internal/audit/export', { preHandler: [authenticatePlatformSession, requirePlatformCsrf, requireInternalPermission('trust.audit.export')] }, async (request, reply) => {
    const body = request.body as { from?: string; to?: string; format?: 'csv' | 'json'; reason?: string };
    const rows = await app.prisma.platformAuditLog.findMany({
      where: { createdAt: body.from || body.to ? { gte: body.from ? new Date(body.from) : undefined, lte: body.to ? new Date(body.to) : undefined } : undefined },
      orderBy: { createdAt: 'asc' },
      take: 10_000
    });
    await writeAudit(app.prisma as unknown as PlatformAuditClient, {
      actor_id: request.platform!.user.id,
      actor_email: request.platform!.user.email,
      actor_role: request.platform!.user.role,
      action: 'audit.export',
      target_type: 'audit_log',
      target_id: `${body.from ?? 'begin'}:${body.to ?? 'now'}`,
      before: null,
      after: { rows: rows.length, format: body.format ?? 'json' },
      reason: body.reason ?? null,
      ip_address: request.ip,
      session_id: request.platform!.session.id,
      jit_session_id: null,
      user_agent: typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null
    });
    const content = body.format === 'csv' ? jsonToCsv(rows as unknown as Array<Record<string, unknown>>) : JSON.stringify(rows, null, 2);
    reply.send({ url: `data:${body.format === 'csv' ? 'text/csv' : 'application/json'};base64,${Buffer.from(content).toString('base64')}`, format: body.format ?? 'json', rows: rows.length });
  });

  app.post('/api/internal/audit/verify', { preHandler: [authenticatePlatformSession, requirePlatformCsrf, requireInternalPermission('trust.audit.read')] }, async (_request, reply) => {
    const result = await verifyPlatformAuditChain(app.prisma);
    reply.send({ ...result, verifiedAt: new Date().toISOString() });
  });
}
