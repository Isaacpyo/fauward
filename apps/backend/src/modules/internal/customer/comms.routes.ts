import type { FastifyInstance } from 'fastify';
import type { NotificationLog } from '@prisma/client';
import { z } from 'zod';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { requireFreshMfa } from '../../../middleware/require-fresh-platform-mfa.js';
import { writePlatformAuditLog } from '../../../services/platform-audit.service.js';
import { redactPlatformLogValue } from '../../../services/platform-redaction.service.js';
import { platformAuditActor } from '../request-meta.js';

// customer.comms delivery log (moved from GET /api/v1/platform/logs in WP-1.1). Redacted by default; the unredacted
// view needs fresh MFA and a reason, and is audited (D2 mapping of logs:view_sensitive).

const query = z.object({
  tenantId: z.string().min(1).optional(),
  status: z.enum(['QUEUED', 'SENT', 'FAILED', 'SKIPPED', 'QUOTA_EXCEEDED']).optional(),
  channel: z.enum(['EMAIL', 'SMS']).optional(),
  sensitive: z.enum(['true', 'false']).optional(),
  reason: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(100),
  cursor: z.string().min(1).optional()
});

type LogRow = NotificationLog & { tenant: { id: string; name: string; slug: string } | null };

/** Explicit fields: only the recipient, provider reference and error text are personal data, redacted unless sensitive. */
function presentLog(log: LogRow, sensitive: boolean) {
  const redact = (value: string | null) => (value === null || sensitive ? value : String(redactPlatformLogValue(value)));
  return {
    id: log.id,
    createdAt: log.createdAt.toISOString(),
    updatedAt: log.updatedAt.toISOString(),
    sentAt: log.sentAt?.toISOString() ?? null,
    tenantId: log.tenantId,
    tenant: log.tenant,
    audience: log.tenantId ? 'TENANT' : 'STAFF',
    userId: log.userId,
    platformUserId: log.platformUserId,
    channel: log.channel,
    event: log.event,
    template: log.template,
    status: log.status,
    provider: log.provider,
    attempts: log.attempts,
    recipient: redact(log.recipient),
    providerRef: sensitive ? log.providerRef : null,
    error: redact(log.error)
  };
}

export async function registerConsoleCommsRoutes(app: FastifyInstance) {
  app.get('/api/internal/comms/delivery-log', { preHandler: [authenticatePlatformSession, requireConsolePermission('customer.comms.read')] }, async (request, reply) => {
    const parsed = query.safeParse(request.query);
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_QUERY', message: parsed.error.issues[0]?.message });
    const { tenantId, status, channel, limit, cursor } = parsed.data;
    const sensitive = parsed.data.sensitive === 'true';
    if (sensitive) {
      const mfa = await requireFreshMfa(request, reply);
      if (mfa !== undefined) return mfa;
      const reason = parsed.data.reason?.trim() ?? '';
      if (reason.length < 8) return reply.status(400).send({ error: 'REASON_REQUIRED', message: 'A reason of at least 8 characters is required to view unredacted logs.' });
      await writePlatformAuditLog(app.prisma, {
        ...platformAuditActor(request),
        actorType: 'PLATFORM_USER',
        action: 'SENSITIVE_LOG_VIEW',
        targetTenantId: tenantId ?? null,
        reason,
        metadata: { status: status ?? null }
      });
    }
    const rows = await app.prisma.notificationLog.findMany({
      where: { ...(tenantId ? { tenantId } : {}), ...(status ? { status } : {}), ...(channel ? { channel } : {}) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: { tenant: { select: { id: true, name: true, slug: true } } }
    });
    const hasMore = rows.length > limit;
    const logs = hasMore ? rows.slice(0, limit) : rows;
    return reply.send({ logs: logs.map((log) => presentLog(log, sensitive)), redacted: !sensitive, nextCursor: hasMore ? logs[logs.length - 1]?.id ?? null : null });
  });
}
