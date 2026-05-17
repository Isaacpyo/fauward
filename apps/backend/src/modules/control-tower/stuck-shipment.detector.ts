import type { FastifyInstance } from 'fastify';

import { runWithTenantContext } from '../../context/tenant.context.js';
import { trackingAiService } from '../tracking/tracking.ai.service.js';

const TERMINAL = ['DELIVERED', 'CANCELLED', 'RETURNED'];
const STARTUP_DELAY_MS = 60_000;
const DETECTOR_INTERVAL_MS = 15 * 60 * 1000;

let startupTimer: NodeJS.Timeout | null = null;
let detectorInterval: NodeJS.Timeout | null = null;
let sigtermHookRegistered = false;

export async function detectStuckShipments(app: FastifyInstance, tenantId?: string) {
  const tenants = tenantId
    ? await app.prisma.tenant.findMany({ where: { id: tenantId }, select: { id: true, slug: true, plan: true, region: true } })
    : await app.prisma.tenant.findMany({ select: { id: true, slug: true, plan: true, region: true } });
  const created: unknown[] = [];

  for (const tenant of tenants) {
    await runWithTenantContext({
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      plan: tenant.plan,
      region: tenant.region,
      isSuperAdmin: false
    }, async () => {
      const defaultPolicy = await (app.prisma as any).slaPolicy.findFirst({
        where: { tenantId: tenant.id, isDefault: true },
        orderBy: { createdAt: 'desc' }
      });
      const deliveryWindowHours = defaultPolicy?.deliveryWindowHours ?? 24;
      const cutoff = new Date(Date.now() - deliveryWindowHours * 60 * 60 * 1000);

      const shipments = await app.prisma.shipment.findMany({
        where: { tenantId: tenant.id, status: { notIn: TERMINAL as any } },
        include: { trackingEvents: { orderBy: { occurredAt: 'desc' }, take: 1 } }
      });

      for (const shipment of shipments) {
        const lastEvent = shipment.trackingEvents[0];
        if (!lastEvent || lastEvent.createdAt > cutoff) continue;
        const existing = await (app.prisma as any).exceptionCase.findFirst({
          where: { tenantId: tenant.id, shipmentId: shipment.id, type: 'STUCK', status: { in: ['OPEN', 'IN_PROGRESS'] } }
        });
        if (existing) continue;
        const exception = await (app.prisma as any).exceptionCase.create({
          data: {
            tenantId: tenant.id,
            shipmentId: shipment.id,
            type: 'STUCK',
            severity: 'HIGH',
            status: 'OPEN',
            notes: `No tracking update since ${lastEvent.createdAt.toISOString()}`
          }
        });
        created.push(exception);
        await trackingAiService.diagnoseException(app.prisma, shipment.id, tenant.id);
      }
    });
  }

  return created;
}

export function startStuckShipmentDetector(app: FastifyInstance) {
  if (detectorInterval) return detectorInterval;

  const run = () => {
    void detectStuckShipments(app).catch((err) => app.log.error({ err }, 'stuck shipment detector failed'));
  };

  startupTimer = setTimeout(run, STARTUP_DELAY_MS);
  startupTimer.unref?.();
  detectorInterval = setInterval(run, DETECTOR_INTERVAL_MS);
  detectorInterval.unref?.();

  if (!sigtermHookRegistered) {
    process.on('SIGTERM', stopStuckShipmentDetector);
    sigtermHookRegistered = true;
  }

  app.addHook('onClose', async () => {
    stopStuckShipmentDetector();
  });

  return detectorInterval;
}

export function stopStuckShipmentDetector() {
  if (startupTimer) clearTimeout(startupTimer);
  if (detectorInterval) clearInterval(detectorInterval);
  startupTimer = null;
  detectorInterval = null;
}
