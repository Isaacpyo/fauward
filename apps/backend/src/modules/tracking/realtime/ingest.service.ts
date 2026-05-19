import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import type { IngestInput, IngestPoint, IngestResult, StreamEvent } from './types.js';
import { getNextSeq, getCurrentSeq } from './seq.service.js';
import { getHotState, setHotState, hotStateKey } from './hot-state.repository.js';
import { shouldDropForJitter } from './jitter.service.js';
import { shouldDropForOrder } from './order-filter.service.js';
import { checkAndSetIdempotency, cacheResponse } from './idempotency.service.js';
import { addToTenantStream } from './stream.service.js';
import { evaluateEvent } from '../escalation/engine.service.js';

const MAX_POINTS_PER_CALL = 100;
const DEFAULT_JITTER_THRESHOLD_M = 10;

export async function ingestTrackingPoints(
  app: FastifyInstance,
  input: IngestInput & { tenantId: string; driverId?: string }
): Promise<IngestResult> {
  const { tenantId, shipmentId, idempotencyKey, points, source, sourceRef, driverId } = input;
  const prisma = app.prisma;
  const redis = app.redis;

  if (points.length > MAX_POINTS_PER_CALL) {
    throw app.httpErrors.badRequest(`Max ${MAX_POINTS_PER_CALL} points per call`);
  }

  // 1. Idempotency check
  const idempotency = await checkAndSetIdempotency(redis, `${tenantId}:${shipmentId}:${idempotencyKey}`);
  if (!idempotency.isNew && idempotency.cachedResponse) {
    return JSON.parse(idempotency.cachedResponse) as IngestResult;
  }
  if (!idempotency.isNew) {
    throw app.httpErrors.conflict('Duplicate request in flight');
  }

  // 2. Verify shipment belongs to tenant
  const shipment = await prisma.shipment.findFirst({
    where: { id: shipmentId, tenantId },
    select: {
      id: true,
      trackingNumber: true,
      status: true,
      assignedDriverId: true,
    }
  });
  if (!shipment) {
    throw app.httpErrors.notFound('Shipment not found');
  }

  // 3. Process each point
  let accepted = 0;
  let dropped = 0;
  let latestSeq = await getCurrentSeq(redis, shipmentId);
  const hotState = await getHotState(redis, tenantId, shipmentId);

  for (const point of points) {
    const seq = await getNextSeq(redis, shipmentId);

    // Jitter filter (location only)
    const isLocation = !point.status || point.status === shipment.status;
    if (isLocation && shouldDropForJitter(hotState, point, DEFAULT_JITTER_THRESHOLD_M)) {
      dropped++;
      continue;
    }

    // Order filter
    if (shouldDropForOrder(hotState?.lastSeenAt, point.ts)) {
      dropped++;
      continue;
    }

    // Update hot state
    const stateUpdate = {
      lat: String(point.lat),
      lng: String(point.lng),
      accuracyM: point.accuracy ? String(point.accuracy) : undefined,
      status: point.status ?? shipment.status,
      lastSeenAt: point.ts,
      seq: String(seq),
      driverId: driverId ?? shipment.assignedDriverId ?? undefined,
    };
    await setHotState(redis, tenantId, shipmentId, stateUpdate);

    // Add to stream
    const streamEvent: StreamEvent = {
      shipmentId,
      trackingNumber: shipment.trackingNumber,
      seq,
      eventType: point.status && point.status !== shipment.status ? 'status' : 'location',
      lat: point.lat,
      lng: point.lng,
      accuracyM: point.accuracy,
      status: point.status ?? shipment.status,
      source,
      sourceRef,
      occurredAt: point.ts,
    };
    await addToTenantStream(redis, tenantId, streamEvent);

    // Update shipment last_seen_at
    await prisma.shipment.update({
      where: { id: shipmentId },
      data: { lastSeenAt: new Date(point.ts) }
    });

    // Run escalation engine (fast rules only)
    const flagTriggered = await evaluateEvent(prisma, redis, {
      tenantId,
      shipmentId,
      trackingNumber: shipment.trackingNumber,
      eventType: streamEvent.eventType,
      status: streamEvent.status,
      occurredAt: point.ts,
      source,
    });

    accepted++;
    latestSeq = seq;

    if (flagTriggered) {
      // Update hot state with escalation flag
      await setHotState(redis, tenantId, shipmentId, {
        escalationFlag: 'true',
      });
    }
  }

  const result: IngestResult = { accepted, dropped, latestSeq };
  await cacheResponse(redis, `${tenantId}:${shipmentId}:${idempotencyKey}`, result);
  return result;
}

export async function ingestManualAction(
  app: FastifyInstance,
  input: {
    tenantId: string;
    shipmentId: string;
    action: 'status' | 'flag' | 'unflag';
    status?: string;
    reason?: string;
    idempotencyKey: string;
    actorId?: string;
  }
): Promise<IngestResult> {
  const { tenantId, shipmentId, action, status, reason, idempotencyKey, actorId } = input;
  const prisma = app.prisma;
  const redis = app.redis;

  const idempotency = await checkAndSetIdempotency(redis, `${tenantId}:${shipmentId}:${idempotencyKey}`);
  if (!idempotency.isNew && idempotency.cachedResponse) {
    return JSON.parse(idempotency.cachedResponse) as IngestResult;
  }
  if (!idempotency.isNew) {
    throw app.httpErrors.conflict('Duplicate request in flight');
  }

  const shipment = await prisma.shipment.findFirst({
    where: { id: shipmentId, tenantId },
    select: { id: true, trackingNumber: true, status: true }
  });
  if (!shipment) {
    throw app.httpErrors.notFound('Shipment not found');
  }

  const seq = await getNextSeq(redis, shipmentId);
  const eventType = action === 'status' ? 'status' : action;

  const streamEvent: StreamEvent = {
    shipmentId,
    trackingNumber: shipment.trackingNumber,
    seq,
    eventType,
    status: status ?? shipment.status,
    source: 'manual',
    sourceRef: actorId,
    occurredAt: new Date().toISOString(),
  };

  await addToTenantStream(redis, tenantId, streamEvent);

  const stateUpdate: Record<string, string> = {
    status: streamEvent.status ?? '',
    lastSeenAt: streamEvent.occurredAt,
    seq: String(seq),
  };

  if (action === 'flag') {
    stateUpdate.escalationFlag = 'true';
    await prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        escalationFlag: true,
        escalationReason: reason ?? 'manual',
        escalationFlaggedAt: new Date(),
      }
    });
  } else if (action === 'unflag') {
    stateUpdate.escalationFlag = 'false';
    await prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        escalationFlag: false,
        escalationResolvedAt: new Date(),
        escalationResolvedBy: actorId ?? null,
      }
    });
  }

  await setHotState(redis, tenantId, shipmentId, stateUpdate);

  const result: IngestResult = { accepted: 1, dropped: 0, latestSeq: seq };
  await cacheResponse(redis, `${tenantId}:${shipmentId}:${idempotencyKey}`, result);
  return result;
}
