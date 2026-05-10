import type { PrismaClient } from '@prisma/client';

import { LLMGatewayService } from '../../shared/services/llm-gateway.service.js';
import { TenantHealthSchema } from './control-tower.schema.js';

export const controlTowerService = {
  async metrics(prisma: PrismaClient, tenantId?: string) {
    const where = tenantId ? { tenantId } : {};
    const [shipmentVolumeLastWeek, failedDeliveryCount, webhookFailures, activeExceptions, openSupportTickets] = await Promise.all([
      prisma.shipment.count({ where }),
      prisma.shipment.count({ where: { ...where, status: 'FAILED_DELIVERY' } as any }),
      prisma.webhookDelivery.count({ where: { ...where, deadLetteredAt: { not: null } } as any }),
      (prisma as any).exceptionCase.count({ where: { ...where, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      prisma.supportTicket.count({ where: { ...where, status: { in: ['OPEN', 'IN_PROGRESS'] } } as any })
    ]);
    return {
      shipmentVolumeLastWeek,
      failedDeliveryRate: shipmentVolumeLastWeek > 0 ? failedDeliveryCount / shipmentVolumeLastWeek : 0,
      webhookFailures,
      activeExceptions,
      openSupportTickets,
      slaBreachesLast24h: activeExceptions,
      paymentFailures: 0,
      queueDepth: 0
    };
  },

  async tenantHealth(prisma: PrismaClient, tenantId: string) {
    const metrics = await this.metrics(prisma, tenantId);
    const gateway = new LLMGatewayService(prisma);
    const result = await gateway.run({
      task: 'tenant_health_summary',
      tenantId,
      input: metrics,
      outputSchema: TenantHealthSchema,
      allowAutoAction: false
    });
    return { tenantId, metrics, ...result.result };
  }
};
