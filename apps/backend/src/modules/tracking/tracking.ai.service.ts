import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';

import { LLMGatewayService } from '../../shared/services/llm-gateway.service.js';

const CustomerSummarySchema = z.object({
  customerMessage: z.string(),
  estimatedAction: z.string().optional(),
  confidence: z.number()
});

const ExceptionDiagnosisSchema = z.object({
  likelyCause: z.string(),
  recommendedAction: z.string(),
  shouldNotifyCustomer: z.boolean(),
  customerUpdate: z.string(),
  escalationPriority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  confidence: z.number()
});

const CUSTOMER_SAFE_STATUS: Record<string, string> = {
  CUSTOMS_HOLD: 'Your shipment is being processed by customs',
  FAILED_DELIVERY: 'We attempted delivery but were unable to complete it',
  EXCEPTION: 'Your shipment needs additional attention from our operations team'
};

function safeSnapshot(snapshot: { currentStatus?: string; customerStatus?: string; currentMessage?: string | null }) {
  const safe = CUSTOMER_SAFE_STATUS[String(snapshot.currentStatus)] ?? snapshot.customerStatus ?? 'Your shipment is being processed';
  return {
    ...snapshot,
    currentStatus: safe,
    customerStatus: safe,
    currentMessage: snapshot.currentMessage ?? safe
  };
}

function exceptionTypeFromCause(cause: string) {
  const upper = cause.toUpperCase();
  if (upper.includes('CUSTOMS')) return 'CUSTOMS_HOLD';
  if (upper.includes('FAILED')) return 'FAILED_DELIVERY';
  if (upper.includes('SLA')) return 'SLA_BREACH';
  return 'STUCK';
}

export const trackingAiService = {
  async getCustomerSummary(prisma: PrismaClient, shipmentId: string, tenantId: string) {
    const snapshot = await prisma.trackingSnapshot.findFirst({ where: { shipmentId, tenantId } });
    if (!snapshot) return null;
    const gateway = new LLMGatewayService(prisma);
    const response = await gateway.run({
      task: 'tracking_customer_summary',
      tenantId,
      input: { snapshot: safeSnapshot(snapshot) },
      outputSchema: CustomerSummarySchema,
      allowAutoAction: false
    });
    const internalCodes = ['CUSTOMS_HOLD', 'FAILED_DELIVERY', 'EXCEPTION'];
    let customerMessage = response.result.customerMessage;
    for (const code of internalCodes) {
      customerMessage = customerMessage.replaceAll(code, CUSTOMER_SAFE_STATUS[code]);
    }
    return { ...response.result, customerMessage };
  },

  async diagnoseException(prisma: PrismaClient, shipmentId: string, tenantId: string) {
    const [snapshot, events, slaPolicy, openCases] = await Promise.all([
      prisma.trackingSnapshot.findFirst({ where: { shipmentId, tenantId } }),
      prisma.trackingEvent.findMany({ where: { shipmentId, tenantId }, orderBy: { occurredAt: 'desc' }, take: 10 }),
      (prisma as any).slaPolicy.findFirst({ where: { tenantId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] }),
      (prisma as any).exceptionCase.findMany({ where: { tenantId, shipmentId, status: { in: ['OPEN', 'IN_PROGRESS'] } } })
    ]);
    if (!snapshot) return null;
    const gateway = new LLMGatewayService(prisma);
    const response = await gateway.run({
      task: 'tracking_exception_analysis',
      tenantId,
      input: { snapshot, events, slaPolicy, openCases },
      outputSchema: ExceptionDiagnosisSchema,
      allowAutoAction: false
    });
    if (response.result.confidence >= 0.85 && response.result.escalationPriority === 'HIGH') {
      await (prisma as any).exceptionCase.create({
        data: {
          tenantId,
          shipmentId,
          type: exceptionTypeFromCause(response.result.likelyCause),
          severity: 'HIGH',
          status: 'OPEN',
          aiDiagnosis: response.result
        }
      });
    }
    return response.result;
  }
};
