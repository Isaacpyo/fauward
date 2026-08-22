import { createHash, randomUUID } from 'crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Prisma, Shipment, UserRole } from '@prisma/client';

import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { enqueueAgentEvent } from '../agent/agent.queue.js';

const INTERNAL_FIELD_ROLES: UserRole[] = ['TENANT_ADMIN', 'TENANT_MANAGER', 'TENANT_STAFF', 'TENANT_DRIVER'];

type RouteStopRow = Awaited<ReturnType<FastifyInstance['prisma']['routeStop']['findMany']>>[number];
type ShipmentRow = Awaited<ReturnType<FastifyInstance['prisma']['shipment']['findMany']>>[number];

type EnrichedStopRow = RouteStopRow & {
  route: {
    id: string;
    date: Date;
    status: string;
    createdAt: Date;
  };
  driver: null | {
    id: string;
    user: {
      email: string;
      firstName: string | null;
      lastName: string | null;
    };
    vehicle: null | {
      registration: string | null;
      model: string | null;
    };
  };
  shipment: ShipmentRow & {
    items: Array<{ id: string }>;
  };
};

type FieldMutation = {
  mutationId?: string;
  eventId?: string;
  eventType?: string;
  type?: string;
  shipmentId?: string;
  stopId?: string;
  workflowStage?: string;
  occurredAt?: string;
  idempotencyKey?: string;
  payload?: Record<string, unknown>;
};

function dayRange(dateStr?: string) {
  const base = dateStr ? new Date(`${dateStr}T00:00:00.000Z`) : new Date();
  const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function getTenantId(request: FastifyRequest, reply: FastifyReply): string | null {
  const tenantId = request.tenant?.id;
  if (!tenantId) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asAddressString(value: unknown) {
  const json = asRecord(value);
  if (!json) return 'Address unavailable';

  const parts = [json.line1, json.line2, json.city, json.state, json.postcode, json.country]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.trim());

  return parts.length > 0 ? parts.join(', ') : 'Address unavailable';
}

function cityFromAddress(value: unknown) {
  const json = asRecord(value);
  return typeof json?.city === 'string' && json.city.trim() ? json.city.trim() : null;
}

function workflowStageFromShipmentStatus(status: string): 'pickup' | 'delivery' {
  switch (status) {
    case 'PENDING':
    case 'PROCESSING':
      return 'pickup';
    default:
      return 'delivery';
  }
}

function workflowStageFromStopType(type: string) {
  switch (type.toUpperCase()) {
    case 'PICKUP':
      return 'pickup';
    case 'DELIVERY':
      return 'delivery';
    case 'RETURN':
      return 'return_initiation';
    case 'RETURN_RECEIPT':
      return 'return_receipt';
    case 'WAREHOUSE':
      return 'warehouse_intake';
    case 'DISPATCH':
      return 'dispatch_handoff';
    case 'LINEHAUL':
    case 'TRANSFER':
      return 'linehaul';
    default:
      return 'delivery';
  }
}

function stopStatusFromRow(stop: { arrivedAt: Date | null; completedAt: Date | null }, shipmentStatus: string) {
  if (stop.completedAt) {
    if (shipmentStatus === 'FAILED_DELIVERY') return 'failed';
    if (shipmentStatus === 'EXCEPTION') return 'exception';
    return 'completed';
  }

  if (stop.arrivedAt) {
    return 'in_progress';
  }

  if (shipmentStatus === 'FAILED_DELIVERY') return 'failed';
  if (shipmentStatus === 'EXCEPTION') return 'exception';
  return 'assigned';
}

function priorityFromStage(stage: string) {
  if (stage === 'delivery' || stage === 'return_initiation') return 'critical';
  if (stage === 'pickup' || stage === 'dispatch_handoff') return 'high';
  return 'normal';
}

function podRequirementsFromStage(stage: string) {
  if (stage === 'delivery') {
    return { otp: true, signature: true, photo: true, recipientName: true };
  }

  if (stage === 'return_initiation') {
    return { otp: false, signature: true, photo: true, recipientName: true };
  }

  return undefined;
}

function buildVerificationCodes(shipment: { id: string; trackingNumber: string; itemCount?: number | null }) {
  const tracking = shipment.trackingNumber;
  const codes = [
    {
      id: `track-${shipment.id}`,
      target: 'shipment',
      label: 'Shipment reference',
      value: tracking,
      codeType: 'barcode'
    },
    {
      id: `label-${shipment.id}`,
      target: 'label',
      label: 'Shipment label',
      value: `${tracking}-LBL`,
      codeType: 'qr'
    }
  ];

  if ((shipment.itemCount ?? 0) > 0) {
    codes.push({
      id: `package-${shipment.id}`,
      target: 'package',
      label: 'Package code',
      value: `${tracking}-PKG-1`,
      codeType: 'barcode'
    });
  }

  return codes;
}

function mapShipmentStatusForStage(stage: string, stopState: 'in_progress' | 'completed' | 'exception') {
  if (stopState === 'exception') {
    return stage === 'delivery' ? 'FAILED_DELIVERY' : 'EXCEPTION';
  }

  if (stopState === 'in_progress') {
    if (stage === 'pickup') return 'PICKED_UP';
    if (stage === 'delivery') return 'OUT_FOR_DELIVERY';
    return 'IN_TRANSIT';
  }

  switch (stage) {
    case 'pickup':
      return 'PICKED_UP';
    case 'linehaul':
    case 'dispatch_handoff':
      return 'IN_TRANSIT';
    case 'delivery':
      return 'DELIVERED';
    case 'return_initiation':
    case 'return_receipt':
      return 'RETURNED';
    default:
      return 'PROCESSING';
  }
}

function buildRouteLabel(routeId: string, cities: string[]) {
  if (cities.length === 0) return `Route ${routeId.slice(0, 8)}`;
  return cities.length === 1 ? `${cities[0]} field route` : `${cities[0]} / ${cities[cities.length - 1]} field route`;
}

function buildRouteArea(cities: string[]) {
  if (cities.length === 0) return 'Assigned operations';
  return Array.from(new Set(cities)).slice(0, 3).join(' / ');
}

function bodyHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value ?? {})).digest('hex');
}

async function resolveMutationKey(app: FastifyInstance, tenantId: string, idempotencyKey: string, requestBody: unknown) {
  const existing = await app.prisma.idempotencyKey.findUnique({
    where: { tenantId_key: { tenantId, key: idempotencyKey } }
  });

  if (existing?.response && existing.statusCode) {
    return { type: 'duplicate' as const };
  }

  if (!existing) {
    await app.prisma.idempotencyKey.create({
      data: {
        tenantId,
        key: idempotencyKey,
        requestHash: bodyHash(requestBody),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      }
    });
  }

  return { type: 'new' as const };
}

async function storeMutationKeyResult(app: FastifyInstance, tenantId: string, idempotencyKey: string, response: unknown) {
  await app.prisma.idempotencyKey.update({
    where: { tenantId_key: { tenantId, key: idempotencyKey } },
    data: {
      statusCode: 200,
      response: response as Prisma.InputJsonValue,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }
  });
}

async function publishFieldEvent(
  app: FastifyInstance,
  input: { aggregateId: string; eventType: string; payload: Record<string, unknown> },
) {
  await app.prisma.outboxEvent.create({
    data: {
      aggregateType: 'FIELD_MUTATION',
      aggregateId: input.aggregateId,
      eventType: input.eventType,
      payload: input.payload as Prisma.InputJsonValue
    }
  });
}

async function loadShipmentsMap(app: FastifyInstance, tenantId: string, shipmentIds: string[]) {
  const uniqueIds = Array.from(new Set(shipmentIds));
  const shipments = await app.prisma.shipment.findMany({
    where: { tenantId, id: { in: uniqueIds } },
    include: {
      items: { select: { id: true } }
    }
  });

  return new Map(shipments.map((shipment) => [shipment.id, shipment]));
}

async function listVisibleStops(app: FastifyInstance, tenantId: string, userId: string, role: string): Promise<EnrichedStopRow[]> {
  const { start, end } = dayRange();
  const driver = await app.prisma.driver.findFirst({ where: { tenantId, userId } });

  const where: Prisma.RouteStopWhereInput =
    role === 'TENANT_DRIVER' && driver
      ? {
          driverId: driver.id,
          route: {
            tenantId,
            date: { gte: start, lt: end }
          }
        }
      : {
          route: {
            tenantId,
            date: { gte: start, lt: end }
          }
        };

  const stops = await app.prisma.routeStop.findMany({
    where,
    include: {
      route: true,
      driver: {
        include: {
          user: true,
          vehicle: true
        }
      }
    },
    orderBy: [{ routeId: 'asc' }, { stopOrder: 'asc' }]
  });

  const shipmentsById = await loadShipmentsMap(app, tenantId, stops.map((stop) => stop.shipmentId));

  return stops
    .map((stop) => {
      const shipment = shipmentsById.get(stop.shipmentId);
      return shipment ? ({ ...stop, shipment } as EnrichedStopRow) : null;
    })
    .filter((stop): stop is EnrichedStopRow => Boolean(stop));
}

async function loadStop(app: FastifyInstance, tenantId: string, stopId: string): Promise<EnrichedStopRow | null> {
  const stop = await app.prisma.routeStop.findFirst({
    where: { id: stopId, route: { tenantId } },
    include: {
      route: true,
      driver: {
        include: {
          user: true,
          vehicle: true
        }
      }
    }
  });

  if (!stop) {
    return null;
  }

  const shipment = await app.prisma.shipment.findFirst({
    where: { id: stop.shipmentId, tenantId },
    include: {
      items: { select: { id: true } }
    }
  });

  return shipment ? ({ ...stop, shipment } as EnrichedStopRow) : null;
}

function buildFieldStop(row: EnrichedStopRow) {
  const stage = workflowStageFromStopType(row.type);
  const shipmentAddress = row.type.toUpperCase() === 'PICKUP' ? row.shipment.originAddress : row.shipment.destinationAddress;
  const shipmentStatus = row.shipment.status;
  const stopStatus = stopStatusFromRow(row, shipmentStatus);
  const contactName = (asRecord(shipmentAddress)?.name as string | undefined) ?? undefined;
  const contactPhone = (asRecord(shipmentAddress)?.phone as string | undefined) ?? undefined;

  return {
    id: row.id,
    routeId: row.routeId,
    shipmentId: row.shipmentId,
    sequence: row.stopOrder,
    type:
      stage === 'linehaul'
        ? 'transfer'
        : stage === 'warehouse_intake'
          ? 'hub'
          : stage === 'dispatch_handoff'
            ? 'dispatch'
            : stage === 'return_initiation' || stage === 'return_receipt'
              ? 'return'
              : row.type.toLowerCase(),
    workflowStage: stage,
    title:
      stage === 'pickup'
        ? 'Pickup shipment'
        : stage === 'delivery'
          ? 'Complete delivery'
          : stage === 'return_initiation'
            ? 'Collect return'
            : stage === 'return_receipt'
              ? 'Receive return'
              : `Process ${stage.replace(/_/g, ' ')}`,
    address: asAddressString(shipmentAddress),
    contactName,
    contactPhone,
    instructions: row.shipment.specialInstructions ?? undefined,
    etaLabel: row.estimatedAt ? row.estimatedAt.toISOString().slice(11, 16) : '--:--',
    packageCount: row.shipment.items.length,
    podRequirements: podRequirementsFromStage(stage),
    verificationCodes: buildVerificationCodes({
      id: row.shipment.id,
      trackingNumber: row.shipment.trackingNumber,
      itemCount: row.shipment.items.length
    }),
    status: stopStatus,
    updatedAt: (row.completedAt ?? row.arrivedAt ?? row.shipment.updatedAt).toISOString()
  };
}

function buildFieldJob(row: EnrichedStopRow) {
  const stop = buildFieldStop(row);

  return {
    id: `job-${row.id}`,
    shipmentId: row.shipmentId,
    trackingNumber: row.shipment.trackingNumber,
    type: stop.type,
    workflowStage: stop.workflowStage,
    status: stop.status,
    priority: priorityFromStage(stop.workflowStage),
    routeId: row.routeId,
    stopId: row.id,
    address: stop.address,
    contactName: stop.contactName,
    contactPhone: stop.contactPhone,
    instructions: stop.instructions,
    timeWindowStart: stop.etaLabel,
    timeWindowEnd: stop.etaLabel,
    updatedAt: stop.updatedAt
  };
}

async function createShipmentEvent(
  app: FastifyInstance,
  input: {
    tenantId: string;
    shipmentId: string;
    status: string;
    actorId?: string;
    actorType?: string;
    source: string;
    notes?: string;
    location?: Record<string, unknown>;
    timestamp?: string;
  },
) {
  return app.prisma.shipmentEvent.create({
    data: {
      tenantId: input.tenantId,
      shipmentId: input.shipmentId,
      status: input.status,
      actorId: input.actorId,
      actorType: input.actorType,
      source: input.source,
      notes: input.notes,
      location: input.location as Prisma.InputJsonValue | undefined,
      timestamp: input.timestamp ? new Date(input.timestamp) : undefined
    }
  });
}

async function processMutation(app: FastifyInstance, request: FastifyRequest, tenantId: string, mutation: FieldMutation) {
  const userId = request.user?.sub;
  const actorType = request.user?.role ?? 'TENANT_STAFF';
  const payload = asRecord(mutation.payload) ?? {};
  const stopId = mutation.stopId ?? (typeof payload.stopId === 'string' ? payload.stopId : undefined);
  const shipmentId = mutation.shipmentId ?? (typeof payload.shipmentId === 'string' ? payload.shipmentId : undefined);
  const mutationId = mutation.mutationId ?? mutation.eventId ?? randomUUID();

  if (mutation.type === 'location_update') {
    const lat = typeof payload.lat === 'number' ? payload.lat : undefined;
    const lng = typeof payload.lng === 'number' ? payload.lng : undefined;
    const accuracy = typeof payload.accuracy === 'number' ? payload.accuracy : undefined;

    if (lat === undefined || lng === undefined) {
      return { mutationId, state: 'failed' as const };
    }

    const driver = userId ? await app.prisma.driver.findFirst({ where: { tenantId, userId } }) : null;
    if (driver) {
      await app.prisma.driver.update({
        where: { id: driver.id },
        data: {
          currentLat: lat,
          currentLng: lng,
          lastLocationAt: new Date()
        }
      });
    }

    if (shipmentId) {
      await createShipmentEvent(app, {
        tenantId,
        shipmentId,
        status: 'IN_TRANSIT',
        actorId: userId,
        actorType,
        source: 'FAUWARD_GO',
        location: { lat, lng, accuracy },
        timestamp: mutation.occurredAt
      });
    }

    await publishFieldEvent(app, {
      aggregateId: stopId ?? shipmentId ?? mutationId,
      eventType: mutation.eventType ?? 'field.location.updated',
      payload: {
        tenantId,
        actorId: userId,
        shipmentId,
        stopId,
        workflowStage: mutation.workflowStage,
        occurredAt: mutation.occurredAt,
        payload
      }
    });

    return { mutationId, state: 'synced' as const };
  }

  const stop = stopId ? await loadStop(app, tenantId, stopId) : null;
  const shipment =
    stop?.shipment ??
    (shipmentId
      ? await app.prisma.shipment.findFirst({
          where: { id: shipmentId, tenantId },
          include: { items: { select: { id: true } } }
        })
      : null);

  if (!shipment) {
    return { mutationId, state: 'failed' as const };
  }

  const stage = mutation.workflowStage ?? (stop ? workflowStageFromStopType(stop.type) : 'delivery');

  if (mutation.type === 'status_update' || mutation.type === 'exception_submit') {
    const requestedStatus =
      typeof payload.status === 'string' ? payload.status : mutation.type === 'exception_submit' ? 'exception' : 'completed';
    const stopState =
      requestedStatus === 'in_progress'
        ? 'in_progress'
        : requestedStatus === 'exception' || requestedStatus === 'failed'
          ? 'exception'
          : 'completed';
    const nextShipmentStatus = mapShipmentStatusForStage(stage, stopState);

    if (stop) {
      await app.prisma.routeStop.update({
        where: { id: stop.id },
        data: {
          arrivedAt: stopState === 'in_progress' ? new Date() : stop.arrivedAt,
          completedAt: stopState !== 'in_progress' ? new Date() : stop.completedAt
        }
      });
    }

    await app.prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        status: nextShipmentStatus as Shipment['status'],
        actualDelivery: nextShipmentStatus === 'DELIVERED' ? new Date() : shipment.actualDelivery,
        notes:
          stopState === 'exception'
            ? [shipment.notes, typeof payload.reason === 'string' ? `Exception: ${payload.reason}` : null]
                .filter(Boolean)
                .join('\n')
            : shipment.notes
      }
    });

    const shipmentEvent = await createShipmentEvent(app, {
      tenantId,
      shipmentId: shipment.id,
      status: nextShipmentStatus,
      actorId: userId,
      actorType,
      source: 'FAUWARD_GO',
      notes:
        stopState === 'exception'
          ? [typeof payload.reason === 'string' ? payload.reason : null, typeof payload.notes === 'string' ? payload.notes : null]
              .filter(Boolean)
              .join(' | ')
          : `Field stop ${stopState.replace('_', ' ')}`,
      timestamp: mutation.occurredAt
    });

    if (nextShipmentStatus === 'FAILED_DELIVERY') {
      void enqueueAgentEvent(app, {
        eventId: `failed-delivery-${shipment.id}-${shipmentEvent.id}`,
        type: 'failed_delivery',
        tenantId,
        shipmentId: shipment.id,
        payload: {
          newStatus: nextShipmentStatus,
          previousStatus: shipment.status,
          reason: typeof payload.reason === 'string' ? payload.reason : undefined,
          source: 'FAUWARD_GO'
        }
      });
    }

    await publishFieldEvent(app, {
      aggregateId: stop?.id ?? shipment.id,
      eventType: mutation.eventType ?? 'field.stop.status_changed',
      payload: {
        tenantId,
        actorId: userId,
        shipmentId: shipment.id,
        stopId: stop?.id,
        workflowStage: stage,
        occurredAt: mutation.occurredAt,
        payload
      }
    });

    return { mutationId, state: 'synced' as const };
  }

  if (mutation.type === 'verification_submit') {
    await createShipmentEvent(app, {
      tenantId,
      shipmentId: shipment.id,
      status: shipment.status,
      actorId: userId,
      actorType,
      source: 'FAUWARD_GO',
      notes: `Verification ${String(payload.target ?? 'shipment')}: ${String(payload.result ?? 'unknown')}`,
      timestamp: mutation.occurredAt
    });

    await publishFieldEvent(app, {
      aggregateId: stop?.id ?? shipment.id,
      eventType: mutation.eventType ?? 'field.scan.verified',
      payload: {
        tenantId,
        actorId: userId,
        shipmentId: shipment.id,
        stopId: stop?.id,
        workflowStage: stage,
        occurredAt: mutation.occurredAt,
        payload
      }
    });

    return { mutationId, state: 'synced' as const };
  }

  if (mutation.type === 'pod_upload') {
    const photoRefs = Array.isArray(payload.photoRefs) ? payload.photoRefs.filter((item): item is string => typeof item === 'string') : [];
    const signatureRef = typeof payload.signatureRef === 'string' ? payload.signatureRef : undefined;
    const recipientName = typeof payload.recipientName === 'string' ? payload.recipientName : undefined;
    const otpCode = typeof payload.otpCode === 'string' ? payload.otpCode : undefined;
    const notes = typeof payload.notes === 'string' ? payload.notes : undefined;
    const nextShipmentStatus = mapShipmentStatusForStage(stage, 'completed');

    if (photoRefs.length > 0 || signatureRef) {
      await app.prisma.podAsset.createMany({
        data: [
          ...photoRefs.map((photoRef) => ({
            tenantId,
            shipmentId: shipment.id,
            type: 'PHOTO',
            fileUrl: photoRef,
            capturedBy: userId
          })),
          ...(signatureRef
            ? [
                {
                  tenantId,
                  shipmentId: shipment.id,
                  type: 'SIGNATURE',
                  fileUrl: signatureRef,
                  capturedBy: userId
                }
              ]
            : [])
        ]
      });
    }

    await app.prisma.shipment.update({
      where: { id: shipment.id },
      data: {
        status: nextShipmentStatus as Shipment['status'],
        actualDelivery: nextShipmentStatus === 'DELIVERED' ? new Date() : shipment.actualDelivery,
        notes: [shipment.notes, recipientName ? `Recipient: ${recipientName}` : null, otpCode ? `OTP: ${otpCode}` : null, notes]
          .filter(Boolean)
          .join('\n')
      }
    });

    if (stop) {
      await app.prisma.routeStop.update({
        where: { id: stop.id },
        data: { completedAt: stop.completedAt ?? new Date() }
      });
    }

    await createShipmentEvent(app, {
      tenantId,
      shipmentId: shipment.id,
      status: nextShipmentStatus,
      actorId: userId,
      actorType,
      source: 'FAUWARD_GO',
      notes: notes ?? 'Proof submitted',
      timestamp: mutation.occurredAt
    });

    const codRaw = payload.codCollection;
    if (codRaw && typeof codRaw === 'object') {
      const cod = codRaw as { amount?: unknown; currency?: unknown; method?: unknown };
      const codAmount = typeof cod.amount === 'number' ? cod.amount : Number(cod.amount);
      const codCurrency = typeof cod.currency === 'string' ? cod.currency.toUpperCase() : '';
      const codMethod = typeof cod.method === 'string' ? cod.method : '';
      if (codAmount > 0 && codCurrency && ['CASH', 'CARD_TERMINAL', 'BANK_TRANSFER'].includes(codMethod)) {
        const codEvent = await app.prisma.shipmentEvent.create({
          data: {
            tenantId,
            shipmentId: shipment.id,
            status: 'COD_COLLECTED',
            actorId: userId,
            actorType,
            source: 'FAUWARD_GO',
            notes: JSON.stringify({ amount: codAmount, currency: codCurrency, method: codMethod, collectedBy: userId })
          }
        });

        const existingPayment = await app.prisma.payment.findFirst({ where: { tenantId, shipmentId: shipment.id } });
        const paymentRow = existingPayment
          ? await app.prisma.payment.update({
              where: { id: existingPayment.id },
              data: {
                status: 'COMPLETED',
                amount: codAmount,
                currency: codCurrency,
                method: 'CASH',
                gatewayRef: `cod:${codEvent.id}`
              }
            })
          : await app.prisma.payment.create({
              data: {
                tenantId,
                shipmentId: shipment.id,
                customerId: shipment.customerId,
                amount: codAmount,
                currency: codCurrency,
                method: 'CASH',
                status: 'COMPLETED',
                gatewayRef: `cod:${codEvent.id}`
              }
            });

        await app.prisma.auditLog.create({
          data: {
            tenantId,
            actorId: userId,
            action: 'COD_COLLECTED',
            resourceType: 'PAYMENT',
            resourceId: paymentRow.id,
            metadata: {
              shipmentId: shipment.id,
              amount: codAmount,
              currency: codCurrency,
              method: codMethod,
              shipmentEventId: codEvent.id,
              source: 'FAUWARD_GO'
            } as never
          }
        });
      }
    }

    await publishFieldEvent(app, {
      aggregateId: stop?.id ?? shipment.id,
      eventType: mutation.eventType ?? 'field.proof.submitted',
      payload: {
        tenantId,
        actorId: userId,
        shipmentId: shipment.id,
        stopId: stop?.id,
        workflowStage: stage,
        occurredAt: mutation.occurredAt,
        payload
      }
    });

    return { mutationId, state: 'synced' as const };
  }

  return { mutationId, state: 'failed' as const };
}

export async function registerFieldRoutes(app: FastifyInstance) {
  const guard = { preHandler: [authenticate, requireRole(INTERNAL_FIELD_ROLES)] };

  app.get('/api/v1/field/jobs', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    const userId = request.user?.sub;
    const role = request.user?.role;

    if (!tenantId) return;
    if (!userId || !role) return reply.status(401).send({ error: 'Unauthorized' });

    const rows = await listVisibleStops(app, tenantId, userId, role);
    const routeStopJobs = rows.map(buildFieldJob);

    // Also include directly assigned shipments (no RouteStop needed)
    const driver = await app.prisma.driver.findFirst({ where: { tenantId, userId } });
    const assignedWhere: Prisma.ShipmentWhereInput = role === 'TENANT_DRIVER' && driver
      ? { tenantId, assignedDriverId: driver.id, status: { notIn: ['DELIVERED', 'CANCELLED', 'RETURNED', 'FAILED_DELIVERY'] } }
      : { tenantId, assignedDriverId: { not: null }, status: { notIn: ['DELIVERED', 'CANCELLED', 'RETURNED', 'FAILED_DELIVERY'] } };

    const assignedShipments = await app.prisma.shipment.findMany({
      where: assignedWhere,
      select: {
        id: true,
        trackingNumber: true,
        status: true,
        destinationAddress: true,
        originAddress: true,
        specialInstructions: true,
        updatedAt: true,
        createdAt: true,
        items: { select: { id: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    // Deduplicate: skip shipments already covered by a RouteStop job
    const routeStopShipmentIds = new Set(rows.map((row) => row.shipmentId));
    const directJobs = assignedShipments
      .filter((s) => !routeStopShipmentIds.has(s.id))
      .map((s) => {
        const stage = workflowStageFromShipmentStatus(s.status);
        const addr = stage === 'pickup' ? s.originAddress : s.destinationAddress;
        const jobStatus =
          s.status === 'FAILED_DELIVERY' ? 'failed'
          : s.status === 'EXCEPTION' ? 'exception'
          : s.status === 'DELIVERED' ? 'completed'
          : 'assigned';
        return {
          id: `job-direct-${s.id}`,
          shipmentId: s.id,
          trackingNumber: s.trackingNumber ?? undefined,
          type: stage,
          workflowStage: stage,
          status: jobStatus,
          priority: 'normal',
          routeId: undefined,
          stopId: undefined,
          address: asAddressString(addr),
          contactName: (asRecord(addr)?.name as string | undefined) ?? undefined,
          contactPhone: (asRecord(addr)?.phone as string | undefined) ?? undefined,
          instructions: s.specialInstructions ?? undefined,
          timeWindowStart: undefined,
          timeWindowEnd: undefined,
          updatedAt: s.updatedAt.toISOString()
        };
      });

    reply.send({ jobs: [...routeStopJobs, ...directJobs] });
  });

  app.get('/api/v1/field/routes', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    const userId = request.user?.sub;
    const role = request.user?.role;

    if (!tenantId) return;
    if (!userId || !role) return reply.status(401).send({ error: 'Unauthorized' });

    const rows = await listVisibleStops(app, tenantId, userId, role);
    const grouped = new Map<string, EnrichedStopRow[]>();

    rows.forEach((row) => {
      const existing = grouped.get(row.routeId) ?? [];
      existing.push(row);
      grouped.set(row.routeId, existing);
    });

    const routes = Array.from(grouped.entries()).map(([routeId, group]) => {
      const cities = group
        .map((row) => cityFromAddress(row.type.toUpperCase() === 'PICKUP' ? row.shipment.originAddress : row.shipment.destinationAddress))
        .filter((item): item is string => Boolean(item));

      return {
        id: routeId,
        label: buildRouteLabel(routeId, cities),
        area: buildRouteArea(cities),
        vehicleLabel: group[0]?.driver?.vehicle?.registration ?? group[0]?.driver?.vehicle?.model ?? 'Assigned vehicle',
        assignedAt: group[0]?.route.createdAt.toISOString() ?? new Date().toISOString(),
        shiftWindow: `${group[0]?.route.date.toISOString().slice(0, 10) ?? 'Today'} field shift`
      };
    });

    // Add a virtual route for directly assigned shipments if no real routes exist
    if (routes.length === 0) {
      const driver = await app.prisma.driver.findFirst({
        where: { tenantId, userId },
        include: { vehicle: true }
      });
      const assignedCount = await app.prisma.shipment.count({
        where: {
          tenantId,
          assignedDriverId: driver?.id ?? 'none',
          status: { notIn: ['DELIVERED', 'CANCELLED', 'RETURNED', 'FAILED_DELIVERY'] }
        }
      });
      if (assignedCount > 0) {
        routes.push({
          id: 'direct-assignments',
          label: 'Direct assignments',
          area: 'Assigned shipments',
          vehicleLabel: driver?.vehicle?.registration ?? driver?.vehicle?.model ?? 'Assigned vehicle',
          assignedAt: new Date().toISOString(),
          shiftWindow: 'Active shift'
        });
      }
    }

    reply.send({ routes });
  });

  app.get('/api/v1/field/stops/:id', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;

    const { id } = request.params as { id: string };
    const row = await loadStop(app, tenantId, id);

    if (!row) {
      return reply.status(404).send({ error: 'Stop not found' });
    }

    reply.send({ stop: buildFieldStop(row) });
  });

  app.post('/api/v1/field/storage/sign', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;

    const { contentType = 'image/jpeg' } = (request.body ?? {}) as { contentType?: string };
    const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
    const objectPath = `${tenantId}/${randomUUID()}.${ext}`;

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return reply.status(503).send({ error: 'Storage not configured' });
    }

    const res = await fetch(`${supabaseUrl}/storage/v1/object/upload/sign/pod-assets/${objectPath}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      request.log.error({ status: res.status }, 'Supabase storage sign failed');
      return reply.status(502).send({ error: 'Could not create upload URL' });
    }

    const data = (await res.json()) as { signedURL?: string; token?: string };
    const signedURL = data.signedURL ?? '';

    return reply.send({
      uploadUrl: signedURL.startsWith('http') ? signedURL : `${supabaseUrl}${signedURL}`,
      publicUrl: `${supabaseUrl}/storage/v1/object/public/pod-assets/${objectPath}`,
    });
  });

  app.post('/api/v1/field/sync/batch', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;

    const body = (request.body ?? {}) as { mutations?: FieldMutation[] };
    const mutations = Array.isArray(body.mutations) ? body.mutations : [];
    const results: Array<{ mutationId: string; state: 'synced' | 'failed' }> = [];

    for (const mutation of mutations) {
      const mutationId = mutation.mutationId ?? mutation.eventId ?? randomUUID();
      const idempotencyKey =
        typeof mutation.idempotencyKey === 'string' && mutation.idempotencyKey.trim() ? mutation.idempotencyKey : undefined;

      try {
        if (idempotencyKey) {
          const resolution = await resolveMutationKey(app, tenantId, idempotencyKey, mutation);
          if (resolution.type === 'duplicate') {
            results.push({ mutationId, state: 'synced' });
            continue;
          }
        }

        const result = await processMutation(app, request, tenantId, { ...mutation, mutationId });
        results.push({ mutationId, state: result.state });

        if (idempotencyKey && result.state === 'synced') {
          await storeMutationKeyResult(app, tenantId, idempotencyKey, result);
        }
      } catch (error) {
        request.log.error({ error, mutationId }, 'Field batch mutation failed');
        results.push({ mutationId, state: 'failed' });
      }
    }

    reply.send({ results });
  });

  app.get(
    '/api/v1/field/ops/overview',
    { preHandler: [authenticate, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER', 'TENANT_STAFF'])] },
    async (request, reply) => {
      const tenantId = getTenantId(request, reply);
      if (!tenantId) return;

      const { start, end } = dayRange();

      const TERMINAL_STATUSES = ['DELIVERED', 'CANCELLED', 'RETURNED'] as const;

      const [routes, rawStops, drivers, recentEvents, assignedShipments] = await Promise.all([
        app.prisma.route.findMany({
          where: { tenantId, date: { gte: start, lt: end } },
          include: { stops: true },
          orderBy: { date: 'asc' }
        }),
        app.prisma.routeStop.findMany({
          where: { route: { tenantId, date: { gte: start, lt: end } } },
          include: {
            route: true,
            driver: {
              include: {
                user: true,
                vehicle: true
              }
            }
          },
          orderBy: [{ routeId: 'asc' }, { stopOrder: 'asc' }]
        }),
        app.prisma.driver.findMany({
          where: { tenantId },
          include: {
            user: true,
            vehicle: true
          }
        }),
        app.prisma.shipmentEvent.findMany({
          where: { tenantId, source: { in: ['FAUWARD_GO', 'DRIVER_APP', 'GPS'] } },
          include: {
            shipment: {
              select: {
                id: true,
                trackingNumber: true
              }
            }
          },
          orderBy: { timestamp: 'desc' },
          take: 10
        }),
        // Directly assigned shipments that haven't been routed yet
        app.prisma.shipment.findMany({
          where: {
            tenantId,
            assignedDriverId: { not: null },
            routeId: null,
            status: { notIn: [...TERMINAL_STATUSES] }
          },
          include: {
            driver: { include: { user: true, vehicle: true } }
          },
          orderBy: { createdAt: 'desc' },
          take: 50
        })
      ]);

      const shipmentsById = await loadShipmentsMap(app, tenantId, rawStops.map((stop) => stop.shipmentId));
      const routeStops = rawStops
        .map((stop) => {
          const shipment = shipmentsById.get(stop.shipmentId);
          return shipment ? ({ ...stop, shipment } as EnrichedStopRow) : null;
        })
        .filter((stop): stop is EnrichedStopRow => Boolean(stop));

      // Build pseudo-stop rows from directly assigned shipments
      const assignedStopRows = assignedShipments.map((s, i) => ({
        id: `assigned-${s.id}`,
        routeId: 'direct-assignment',
        shipmentId: s.id,
        trackingNumber: s.trackingNumber,
        stopOrder: i + 1,
        type: 'DELIVERY',
        workflowStage: 'DIRECT_ASSIGNMENT',
        shipmentStatus: s.status as string,
        address: asAddressString(s.destinationAddress),
        driverName: s.driver
          ? [s.driver.user.firstName, s.driver.user.lastName].filter(Boolean).join(' ') || s.driver.user.email
          : null,
        estimatedAt: null,
        arrivedAt: null,
        completedAt: null
      }));

      const openStops = routeStops.filter((stop) => !stop.completedAt).length + assignedStopRows.length;
      const deliveredToday = recentEvents.filter((event) => event.status === 'DELIVERED').length;
      const exceptionsToday = recentEvents.filter((event) => event.status === 'EXCEPTION' || event.status === 'FAILED_DELIVERY').length;

      reply.send({
        kpis: {
          activeRoutes: routes.filter((route) => route.status !== 'COMPLETED').length,
          totalStops: routeStops.length + assignedShipments.length,
          openStops,
          deliveredToday,
          exceptionsToday,
          activeDrivers: drivers.filter((driver) => driver.lastLocationAt && Date.now() - driver.lastLocationAt.getTime() < 15 * 60 * 1000).length
        },
        routes: routes.map((route) => ({
          id: route.id,
          date: route.date,
          status: route.status,
          stopCount: route.stops.length,
          completedStops: route.stops.filter((stop) => stop.completedAt).length
        })),
        stops: [
          ...routeStops.slice(0, 12).map((stop) => ({
            id: stop.id,
            routeId: stop.routeId,
            shipmentId: stop.shipmentId,
            trackingNumber: stop.shipment.trackingNumber,
            stopOrder: stop.stopOrder,
            type: stop.type,
            workflowStage: workflowStageFromStopType(stop.type),
            shipmentStatus: stop.shipment.status,
            address: asAddressString(stop.type.toUpperCase() === 'PICKUP' ? stop.shipment.originAddress : stop.shipment.destinationAddress),
            driverName:
              stop.driver ? [stop.driver.user.firstName, stop.driver.user.lastName].filter(Boolean).join(' ') || stop.driver.user.email : null,
            estimatedAt: stop.estimatedAt,
            arrivedAt: stop.arrivedAt,
            completedAt: stop.completedAt
          })),
          ...assignedStopRows
        ],
        driverLocations: drivers
          .filter((driver) => driver.currentLat && driver.currentLng)
          .map((driver) => ({
            driverId: driver.id,
            driverName: [driver.user.firstName, driver.user.lastName].filter(Boolean).join(' ') || driver.user.email,
            vehicleLabel: driver.vehicle?.registration ?? driver.vehicle?.model ?? 'Assigned vehicle',
            lat: Number(driver.currentLat),
            lng: Number(driver.currentLng),
            lastUpdated: driver.lastLocationAt
          })),
        recentEvents: recentEvents.map((event) => ({
          id: event.id,
          shipmentId: event.shipmentId,
          trackingNumber: event.shipment.trackingNumber,
          status: event.status,
          source: event.source,
          notes: event.notes,
          timestamp: event.timestamp
        }))
      });
    }
  );

  app.get(
    '/api/v1/field/ops/assigned-tasks',
    { preHandler: [authenticate, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER', 'TENANT_STAFF'])] },
    async (request, reply) => {
      const tenantId = getTenantId(request, reply);
      if (!tenantId) return;

      const shipments = await app.prisma.shipment.findMany({
        where: {
          tenantId,
          assignedDriverId: { not: null },
          status: { notIn: ['DELIVERED', 'CANCELLED', 'RETURNED'] }
        },
        select: {
          id: true,
          trackingNumber: true,
          status: true,
          assignedDriverId: true,
          destinationAddress: true,
          createdAt: true,
          driver: {
            select: {
              id: true,
              user: { select: { firstName: true, lastName: true, email: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 50
      });

      reply.send({
        tasks: shipments.map((s) => {
          const dest = s.destinationAddress as Record<string, unknown>;
          const addressParts = [dest.line1, dest.city, dest.postcode ?? dest.state].filter(Boolean);
          const driverName = s.driver
            ? [s.driver.user.firstName, s.driver.user.lastName].filter(Boolean).join(' ') || s.driver.user.email
            : null;
          return {
            id: s.id,
            trackingNumber: s.trackingNumber,
            status: s.status,
            driverName,
            deliveryAddress: addressParts.join(', ') || 'Address not set',
            assignedAt: s.createdAt.toISOString()
          };
        })
      });
    }
  );
}
