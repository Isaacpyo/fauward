import type { PrismaClient } from '@prisma/client';

import { LLMGatewayService } from '../../shared/services/llm-gateway.service.js';
import { TenantHealthSchema } from './control-tower.schema.js';

export const controlTowerService = {
  /** Platform (or one tenant's) operations metrics over the last 7 days; open exceptions and tickets are current counts. */
  async metrics(prisma: PrismaClient, tenantId?: string, now = new Date()) {
    const scope = tenantId ? { tenantId } : {};
    const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const [shipmentVolumeLastWeek, failedDeliveryCount, webhookFailures, activeExceptions, escalatedExceptions, openSupportTickets] = await Promise.all([
      prisma.shipment.count({ where: { ...scope, createdAt: { gte: since } } }),
      prisma.shipment.count({ where: { ...scope, createdAt: { gte: since }, status: 'FAILED_DELIVERY' } }),
      prisma.webhookDelivery.count({ where: { ...scope, deadLetteredAt: { gte: since } } }),
      prisma.exceptionCase.count({ where: { ...scope, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      prisma.exceptionCase.count({ where: { ...scope, escalatedAt: { not: null }, platformResolvedAt: null } }),
      prisma.supportTicket.count({ where: { ...scope, status: { in: ['OPEN', 'IN_PROGRESS'] } } })
    ]);
    return {
      shipmentVolumeLastWeek,
      failedDeliveryRate: shipmentVolumeLastWeek > 0 ? failedDeliveryCount / shipmentVolumeLastWeek : 0,
      webhookFailures,
      activeExceptions,
      escalatedExceptions,
      openSupportTickets
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
