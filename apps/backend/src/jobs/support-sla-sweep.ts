import type { FastifyInstance } from 'fastify';
import { runWithTenantContext } from '../context/tenant.context.js';
import { systemContext } from '../shared/middleware/tenant.resolver.js';
import { slaBreach } from '../config/support-sla.js';
import { recordAndPublishActivity, SYSTEM_ACTOR } from '../services/platform-activity.service.js';
import { notifyStaff } from '../services/platform-notifier.service.js';

type SweepApp = Pick<FastifyInstance, 'prisma' | 'redis' | 'log'> & FastifyInstance;

/**
 * customer.support-sla-sweep (every 15 min, WP-2.3): an open PLATFORM ticket that misses its SLA gets slaBreachedAt
 * once (guarded update), an ATTENTION activity and a notification to its assignee — or to customer.support.write
 * holders when unassigned. A ticket is reported once however many sweeps see it (ACC-SUP-7).
 */
export async function sweepSupportSla(app: SweepApp, now = new Date()) {
  return runWithTenantContext(systemContext(), async () => {
    const candidates = await app.prisma.supportTicket.findMany({
      where: { audience: 'PLATFORM', status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER'] }, slaBreachedAt: null },
      include: { tenant: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
      take: 500
    });
    let breached = 0;
    for (const ticket of candidates) {
      const breach = slaBreach(ticket, now);
      if (!breach) continue;
      const claimed = await app.prisma.supportTicket.updateMany({ where: { id: ticket.id, slaBreachedAt: null }, data: { slaBreachedAt: now } });
      if (claimed.count !== 1) continue;
      breached += 1;
      const what = breach === 'FIRST_RESPONSE' ? 'first response' : 'resolution';
      await recordAndPublishActivity(
        { prisma: app.prisma, redis: app.redis, log: app.log },
        {
          service: 'customer.support',
          type: 'ticket.sla_breached',
          tenantId: ticket.tenantId,
          ...SYSTEM_ACTOR,
          subjectType: 'support_ticket',
          subjectId: ticket.id,
          summary: `${ticket.ticketNumber} (${ticket.tenant.name}) missed its ${what} target`,
          severity: 'ATTENTION',
          consoleLink: `/customer/support/tickets/${ticket.id}`,
          dedupeKey: `ticket.sla_breached:${ticket.id}`,
          metadata: { breach, priority: ticket.priority }
        }
      );
      const notice = {
        event: 'ticket.sla_breached',
        title: `SLA missed on ${ticket.ticketNumber}`,
        body: `${ticket.tenant.name}: ${ticket.subject} (${what} target, ${ticket.priority})`,
        link: `/customer/support/tickets/${ticket.id}`,
        severity: 'ATTENTION' as const,
        tenantId: ticket.tenantId
      };
      await notifyStaff(app, ticket.assignedPlatformUserId ? { ...notice, platformUserIds: [ticket.assignedPlatformUserId] } : { ...notice, permission: 'customer.support.write' });
    }
    return { checked: candidates.length, breached };
  });
}
