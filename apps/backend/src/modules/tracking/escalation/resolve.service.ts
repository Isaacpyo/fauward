import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { getNextSeq } from '../realtime/seq.service.js';
import { setHotState } from '../realtime/hot-state.repository.js';
import { addToTenantStream, addToEscalationsStream } from '../realtime/stream.service.js';
import type { StreamEvent } from '../realtime/types.js';

export async function resolveEscalation(
  prisma: PrismaClient,
  redis: Redis,
  input: {
    tenantId: string;
    shipmentId: string;
    trackingNumber: string;
    note: string;
    resolvedBy?: string;
  }
): Promise<void> {
  const { tenantId, shipmentId, trackingNumber, note, resolvedBy } = input;

  const updated = await prisma.shipment.updateMany({
    where: {
      id: shipmentId,
      tenantId,
      escalationFlag: true,
    },
    data: {
      escalationFlag: false,
      escalationResolvedAt: new Date(),
      escalationResolvedBy: resolvedBy ?? null,
    }
  });

  if (updated.count === 0) {
    throw new Error('Escalation not found or already resolved');
  }

  const seq = await getNextSeq(redis, shipmentId);

  const streamEvent: StreamEvent = {
    shipmentId,
    trackingNumber,
    seq,
    eventType: 'unflag',
    status: undefined,
    source: 'manual',
    sourceRef: resolvedBy,
    occurredAt: new Date().toISOString(),
  };

  await addToTenantStream(redis, tenantId, streamEvent);
  await setHotState(redis, tenantId, shipmentId, {
    escalationFlag: 'false',
    seq: String(seq),
  });

  await addToEscalationsStream(redis, {
    tenantId,
    shipmentId,
    trackingNumber,
    reason: 'resolved',
    flaggedAt: new Date().toISOString(),
  });
}
