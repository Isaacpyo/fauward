import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { ESCALATION_RULES } from './rules.js';
import { addToEscalationsStream } from '../realtime/stream.service.js';

interface EvaluateEventInput {
  tenantId: string;
  shipmentId: string;
  trackingNumber: string;
  eventType: 'location' | 'status' | 'flag' | 'unflag';
  status?: string;
  occurredAt: string;
  source: string;
}

export async function evaluateEvent(
  prisma: PrismaClient,
  redis: Redis,
  input: EvaluateEventInput
): Promise<boolean> {
  // Fast rules only: status checks, manual flags
  if (input.eventType !== 'status' && input.eventType !== 'flag') {
    return false;
  }

  const shipment = await prisma.shipment.findUnique({
    where: { id: input.shipmentId },
    select: {
      status: true,
      lastSeenAt: true,
      escalationFlag: true,
    }
  });
  if (!shipment || shipment.escalationFlag) return false;

  const ctx = {
    shipmentStatus: shipment.status,
    lastSeenAt: shipment.lastSeenAt,
    eventType: input.eventType,
    eventStatus: input.status,
    now: new Date(),
  };

  for (const rule of ESCALATION_RULES) {
    if (rule.evaluate(ctx)) {
      await flipEscalationFlag(prisma, redis, {
        tenantId: input.tenantId,
        shipmentId: input.shipmentId,
        trackingNumber: input.trackingNumber,
        reason: rule.code,
      });
      return true;
    }
  }

  return false;
}

interface FlipEscalationInput {
  tenantId: string;
  shipmentId: string;
  trackingNumber: string;
  reason: string;
}

export async function flipEscalationFlag(
  prisma: PrismaClient,
  redis: Redis,
  input: FlipEscalationInput
): Promise<void> {
  const { tenantId, shipmentId, trackingNumber, reason } = input;

  // Idempotent update
  const updated = await prisma.shipment.updateMany({
    where: {
      id: shipmentId,
      tenantId,
      escalationFlag: false,
    },
    data: {
      escalationFlag: true,
      escalationReason: reason,
      escalationFlaggedAt: new Date(),
    }
  });

  if (updated.count === 0) return;

  await addToEscalationsStream(redis, {
    tenantId,
    shipmentId,
    trackingNumber,
    reason,
    flaggedAt: new Date().toISOString(),
  });
}
