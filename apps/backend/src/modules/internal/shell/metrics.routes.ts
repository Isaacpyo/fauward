import type { FastifyInstance } from 'fastify';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { consoleUserHas } from '../../../middleware/require-console-permission.js';
import { mrrForSubscription, sumMrr } from '../../../services/revenue/mrr.service.js';

// GET /api/internal/metrics/overview (moved from /api/v1/platform/metrics in WP-1.1). Session-only: counts are visible to
// every staff member; money fields are only computed and returned for callers with revenue.analytics.read.

export async function registerConsoleMetricsRoutes(app: FastifyInstance) {
  app.get('/api/internal/metrics/overview', { preHandler: [authenticatePlatformSession] }, async (request, reply) => {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const [activeTenantCount, shipmentsToday] = await Promise.all([
      app.prisma.tenant.count({ where: { status: 'ACTIVE' } }),
      app.prisma.shipment.count({ where: { createdAt: { gte: startOfDay } } })
    ]);

    if (!(await consoleUserHas(request, 'revenue.analytics.read'))) {
      return reply.send({ activeTenantCount, shipmentsToday, mrr: null });
    }

    const tenants = await app.prisma.tenant.findMany({
      where: { status: { notIn: ['DEMO', 'CANCELLED'] } },
      select: { id: true, status: true, plan: true, subscription: { select: { plan: true, billingCycle: true, status: true } } }
    });
    const contributions = await Promise.all(tenants.map((tenant) => mrrForSubscription(app.prisma, tenant, tenant.subscription)));
    return reply.send({ activeTenantCount, shipmentsToday, mrr: sumMrr(contributions) });
  });
}
