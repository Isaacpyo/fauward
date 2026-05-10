import type { FastifyInstance } from 'fastify';
import { Prisma, type ShipmentStatus } from '@prisma/client';

import { notificationQueue } from '../../queues/queues.js';
import { dedupNotification, type ToolHandler } from './agent.handlers.js';
import { toolSchemas, type ToolName } from './agent.tools.js';

const ACTIVE_SHIPMENT_STATUSES: ShipmentStatus[] = [
  'PENDING',
  'PROCESSING',
  'PICKED_UP',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'FAILED_DELIVERY',
  'EXCEPTION'
];

const TERMINAL_SHIPMENT_STATUSES: ShipmentStatus[] = ['DELIVERED', 'RETURNED', 'CANCELLED'];

export function buildToolHandlers(app: FastifyInstance): Record<ToolName, ToolHandler> {
  return {
    assign_shipment: async (rawInput, ctx) => {
      const input = toolSchemas.assign_shipment.parse(rawInput);
      const [shipment, driver] = await Promise.all([
        app.prisma.shipment.findFirst({
          where: { id: input.shipmentId, tenantId: ctx.tenantId },
          select: {
            id: true,
            tenantId: true,
            trackingNumber: true,
            status: true,
            assignedDriverId: true
          }
        }),
        app.prisma.driver.findFirst({
          where: { id: input.driverId, tenantId: ctx.tenantId },
          include: { user: true, vehicle: true }
        })
      ]);

      if (!shipment) throw new Error('Shipment not found');
      if (!driver) throw new Error('Driver not found');
      if (!driver.isAvailable) throw new Error('Driver is not available');
      if (TERMINAL_SHIPMENT_STATUSES.includes(shipment.status)) {
        throw new Error(`Cannot assign terminal shipment with status ${shipment.status}`);
      }

      if (shipment.assignedDriverId === driver.id) {
        return {
          skipped: true,
          reason: 'shipment already assigned to this driver',
          shipmentId: shipment.id,
          driverId: driver.id
        };
      }

      const updated = await app.prisma.$transaction(async (tx) => {
        const nextStatus: ShipmentStatus = shipment.status === 'PENDING' ? 'PROCESSING' : shipment.status;
        const updatedShipment = await tx.shipment.update({
          where: { id: shipment.id },
          data: {
            assignedDriverId: driver.id,
            status: nextStatus
          },
          select: {
            id: true,
            trackingNumber: true,
            status: true,
            assignedDriverId: true,
            updatedAt: true
          }
        });

        await tx.shipmentEvent.create({
          data: {
            tenantId: ctx.tenantId,
            shipmentId: shipment.id,
            status: nextStatus,
            source: 'FAUWARD_AGENT',
            actorType: 'FAUWARD_AGENT',
            notes: `Assigned to driver ${driver.id}. Reason: ${input.reason}`
          }
        });

        await tx.auditLog.create({
          data: {
            tenantId: ctx.tenantId,
            actorType: 'FAUWARD_AGENT',
            action: 'AGENT_ASSIGN_SHIPMENT',
            resourceType: 'shipment',
            resourceId: shipment.id,
            beforeState: toJsonValue({
              assignedDriverId: shipment.assignedDriverId,
              status: shipment.status
            }),
            afterState: toJsonValue({
              assignedDriverId: driver.id,
              status: nextStatus
            }),
            metadata: toJsonValue({ runId: ctx.runId, reason: input.reason })
          }
        });

        await tx.outboxEvent.create({
          data: {
            aggregateType: 'shipment',
            aggregateId: shipment.id,
            eventType: 'shipment.driver.assigned',
            payload: toJsonValue({
              tenantId: ctx.tenantId,
              shipmentId: shipment.id,
              trackingNumber: shipment.trackingNumber,
              driverId: driver.id,
              runId: ctx.runId
            })
          }
        });

        return updatedShipment;
      });

      return {
        shipmentId: updated.id,
        trackingNumber: updated.trackingNumber,
        status: updated.status,
        driverId: updated.assignedDriverId,
        assignedAt: updated.updatedAt.toISOString()
      };
    },

    get_available_drivers: async (rawInput, ctx) => {
      const input = toolSchemas.get_available_drivers.parse(rawInput);
      assertTenant(input.tenantId, ctx.tenantId);

      const drivers = await app.prisma.driver.findMany({
        where: { tenantId: ctx.tenantId, isAvailable: true },
        include: {
          user: true,
          vehicle: true,
          _count: {
            select: {
              shipments: {
                where: { status: { in: ACTIVE_SHIPMENT_STATUSES } }
              }
            }
          }
        },
        orderBy: { createdAt: 'asc' },
        take: 100
      });

      return {
        tenantId: ctx.tenantId,
        originPostcode: input.originPostcode || null,
        drivers: drivers.map((driver) => ({
          driverId: driver.id,
          userId: driver.userId,
          name: [driver.user.firstName, driver.user.lastName].filter(Boolean).join(' ') || driver.user.email,
          email: driver.user.email,
          phone: driver.user.phone,
          isAvailable: driver.isAvailable,
          currentLocation:
            driver.currentLat && driver.currentLng
              ? {
                  lat: Number(driver.currentLat),
                  lng: Number(driver.currentLng),
                  lastLocationAt: driver.lastLocationAt?.toISOString() ?? null
                }
              : null,
          vehicle: driver.vehicle
            ? {
                id: driver.vehicle.id,
                registration: driver.vehicle.registration,
                type: driver.vehicle.type,
                capacityKg: numberOrNull(driver.vehicle.capacityKg),
                capacityM3: numberOrNull(driver.vehicle.capacityM3)
              }
            : null,
          activeJobCount: driver._count.shipments
        }))
      };
    },

    get_shipment_details: async (rawInput, ctx) => {
      const input = toolSchemas.get_shipment_details.parse(rawInput);
      const shipment = await app.prisma.shipment.findFirst({
        where: { id: input.shipmentId, tenantId: ctx.tenantId },
        include: {
          items: true,
          events: { orderBy: { timestamp: 'desc' }, take: 25 },
          driver: { include: { user: true, vehicle: true } },
          organisation: true,
          documents: true,
          podAssets: true
        }
      });

      if (!shipment) throw new Error('Shipment not found');

      return {
        shipmentId: shipment.id,
        trackingNumber: shipment.trackingNumber,
        status: shipment.status,
        tenantId: shipment.tenantId,
        assignedDriverId: shipment.assignedDriverId,
        originAddress: shipment.originAddress,
        destinationAddress: shipment.destinationAddress,
        originPostcode: getPostcode(shipment.originAddress),
        destinationPostcode: getPostcode(shipment.destinationAddress),
        serviceTier: shipment.serviceTier,
        estimatedDelivery: shipment.estimatedDelivery?.toISOString() ?? null,
        actualDelivery: shipment.actualDelivery?.toISOString() ?? null,
        weightKg: numberOrNull(shipment.weightKg),
        price: numberOrNull(shipment.price),
        currency: shipment.currency,
        notes: shipment.notes,
        specialInstructions: shipment.specialInstructions,
        driver: shipment.driver
          ? {
              id: shipment.driver.id,
              name:
                [shipment.driver.user.firstName, shipment.driver.user.lastName].filter(Boolean).join(' ') ||
                shipment.driver.user.email,
              vehicleId: shipment.driver.vehicleId
            }
          : null,
        organisation: shipment.organisation
          ? {
              id: shipment.organisation.id,
              name: shipment.organisation.name
            }
          : null,
        events: shipment.events.map((event) => ({
          id: event.id,
          status: event.status,
          source: event.source,
          notes: event.notes,
          timestamp: event.timestamp.toISOString()
        })),
        itemCount: shipment.items.length,
        documentCount: shipment.documents.length,
        podAssetCount: shipment.podAssets.length
      };
    },

    reroute_shipment: async (rawInput, ctx) => {
      const input = toolSchemas.reroute_shipment.parse(rawInput);
      const [shipment, driver] = await Promise.all([
        app.prisma.shipment.findFirst({
          where: { id: input.shipmentId, tenantId: ctx.tenantId },
          select: {
            id: true,
            trackingNumber: true,
            status: true,
            assignedDriverId: true,
            notes: true
          }
        }),
        app.prisma.driver.findFirst({
          where: { id: input.newDriverId, tenantId: ctx.tenantId },
          select: { id: true, isAvailable: true }
        })
      ]);

      if (!shipment) throw new Error('Shipment not found');
      if (!driver) throw new Error('Driver not found');
      if (!driver.isAvailable) throw new Error('Driver is not available');
      if (TERMINAL_SHIPMENT_STATUSES.includes(shipment.status)) {
        throw new Error(`Cannot reroute terminal shipment with status ${shipment.status}`);
      }

      const updated = await app.prisma.$transaction(async (tx) => {
        const updatedShipment = await tx.shipment.update({
          where: { id: shipment.id },
          data: {
            assignedDriverId: driver.id,
            notes: appendNote(shipment.notes, `Agent reroute: ${input.reason}`)
          },
          select: {
            id: true,
            trackingNumber: true,
            status: true,
            assignedDriverId: true,
            updatedAt: true
          }
        });

        await tx.shipmentEvent.create({
          data: {
            tenantId: ctx.tenantId,
            shipmentId: shipment.id,
            status: shipment.status,
            source: 'FAUWARD_AGENT',
            actorType: 'FAUWARD_AGENT',
            notes: `Rerouted to driver ${driver.id}. Reason: ${input.reason}`
          }
        });

        await tx.auditLog.create({
          data: {
            tenantId: ctx.tenantId,
            actorType: 'FAUWARD_AGENT',
            action: 'AGENT_REROUTE_SHIPMENT',
            resourceType: 'shipment',
            resourceId: shipment.id,
            beforeState: toJsonValue({ assignedDriverId: shipment.assignedDriverId }),
            afterState: toJsonValue({ assignedDriverId: driver.id }),
            metadata: toJsonValue({ runId: ctx.runId, reason: input.reason })
          }
        });

        await tx.outboxEvent.create({
          data: {
            aggregateType: 'shipment',
            aggregateId: shipment.id,
            eventType: 'shipment.rerouted',
            payload: toJsonValue({
              tenantId: ctx.tenantId,
              shipmentId: shipment.id,
              trackingNumber: shipment.trackingNumber,
              previousDriverId: shipment.assignedDriverId,
              newDriverId: driver.id,
              runId: ctx.runId
            })
          }
        });

        return updatedShipment;
      });

      return {
        shipmentId: updated.id,
        trackingNumber: updated.trackingNumber,
        status: updated.status,
        driverId: updated.assignedDriverId,
        reroutedAt: updated.updatedAt.toISOString()
      };
    },

    send_customer_notification: async (rawInput, ctx) => {
      const input = toolSchemas.send_customer_notification.parse(rawInput);
      const shipment = await app.prisma.shipment.findFirst({
        where: { id: input.shipmentId, tenantId: ctx.tenantId },
        select: {
          id: true,
          trackingNumber: true,
          customerId: true,
          status: true
        }
      });

      if (!shipment) throw new Error('Shipment not found');

      const shouldSend = dedupNotification(shipment.id, input.templateKey, input.channel, ctx.runId);
      if (!shouldSend) {
        return {
          queued: false,
          deduped: true,
          shipmentId: shipment.id,
          templateKey: input.templateKey,
          channel: input.channel
        };
      }

      const customer = shipment.customerId
        ? await app.prisma.user.findFirst({
            where: { id: shipment.customerId, tenantId: ctx.tenantId },
            select: { id: true, email: true, phone: true }
          })
        : null;

      if (!customer) {
        return {
          queued: false,
          reason: 'shipment has no customer user',
          shipmentId: shipment.id,
          templateKey: input.templateKey,
          channel: input.channel
        };
      }

      if (input.channel === 'email') {
        if (!customer.email) {
          return {
            queued: false,
            reason: 'customer has no email address',
            shipmentId: shipment.id,
            templateKey: input.templateKey,
            channel: input.channel
          };
        }

        await notificationQueue.add('email', {
          tenantId: ctx.tenantId,
          userId: customer.id,
          channel: 'EMAIL',
          event: input.templateKey,
          to: customer.email,
          template: input.templateKey,
          data: {
            trackingNumber: shipment.trackingNumber,
            status: shipment.status,
            customMessage: input.customMessage || undefined
          }
        });

        return {
          queued: true,
          shipmentId: shipment.id,
          templateKey: input.templateKey,
          channel: input.channel,
          recipientUserId: customer.id
        };
      }

      if (!customer.phone) {
        return {
          queued: false,
          reason: 'customer has no phone number',
          shipmentId: shipment.id,
          templateKey: input.templateKey,
          channel: input.channel
        };
      }

      await notificationQueue.add('sms', {
        tenantId: ctx.tenantId,
        userId: customer.id,
        channel: 'SMS',
        event: input.templateKey,
        to: customer.phone,
        message:
          input.customMessage ||
          `Shipment ${shipment.trackingNumber} update: ${input.templateKey.replaceAll('_', ' ')}.`
      });

      return {
        queued: true,
        shipmentId: shipment.id,
        templateKey: input.templateKey,
        channel: input.channel,
        recipientUserId: customer.id
      };
    },

    get_carrier_rates: async (rawInput, ctx) => {
      const input = toolSchemas.get_carrier_rates.parse(rawInput);
      assertTenant(input.tenantId, ctx.tenantId);

      const now = new Date();
      const rateCards = await app.prisma.rateCard.findMany({
        where: {
          tenantId: ctx.tenantId,
          isActive: true,
          AND: [
            { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }] },
            { OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] }
          ]
        },
        orderBy: [{ basePrice: 'asc' }, { pricePerKg: 'asc' }],
        take: 10
      });

      return {
        tenantId: ctx.tenantId,
        originPostcode: input.originPostcode,
        destPostcode: input.destPostcode,
        weightKg: input.weightKg,
        currency: rateCards[0]?.currency ?? 'GBP',
        options: rateCards.map((rateCard) => {
          const basePrice = Number(rateCard.basePrice);
          const perKg = Number(rateCard.pricePerKg);
          const rawTotal = basePrice + perKg * input.weightKg;
          const minAdjusted = rateCard.minCharge ? Math.max(rawTotal, Number(rateCard.minCharge)) : rawTotal;
          const total = rateCard.maxCharge ? Math.min(minAdjusted, Number(rateCard.maxCharge)) : minAdjusted;

          return {
            carrier: rateCard.name ?? 'Fauward Network',
            rateCardId: rateCard.id,
            serviceTier: rateCard.serviceTier ?? 'STANDARD',
            basePrice,
            pricePerKg: perKg,
            estimatedTotal: roundMoney(total),
            currency: rateCard.currency,
            estimatedDeliveryHours: estimateDeliveryHours(rateCard.serviceTier)
          };
        })
      };
    },

    flag_sla_risk: async (rawInput, ctx) => {
      const input = toolSchemas.flag_sla_risk.parse(rawInput);
      const shipment = await app.prisma.shipment.findFirst({
        where: { id: input.shipmentId, tenantId: ctx.tenantId },
        select: { id: true, trackingNumber: true, status: true, estimatedDelivery: true }
      });

      if (!shipment) throw new Error('Shipment not found');

      await app.prisma.$transaction(async (tx) => {
        await tx.shipmentEvent.create({
          data: {
            tenantId: ctx.tenantId,
            shipmentId: shipment.id,
            status: shipment.status,
            source: 'FAUWARD_AGENT',
            actorType: 'FAUWARD_AGENT',
            notes: `SLA risk ${input.riskLevel}: ${input.reason}`
          }
        });

        await tx.auditLog.create({
          data: {
            tenantId: ctx.tenantId,
            actorType: 'FAUWARD_AGENT',
            action: 'AGENT_FLAG_SLA_RISK',
            resourceType: 'shipment',
            resourceId: shipment.id,
            metadata: toJsonValue({
              runId: ctx.runId,
              riskLevel: input.riskLevel,
              estimatedDelayMinutes: input.estimatedDelayMinutes ?? null,
              reason: input.reason,
              estimatedDelivery: shipment.estimatedDelivery?.toISOString() ?? null
            })
          }
        });
      });

      return {
        flagged: true,
        shipmentId: shipment.id,
        trackingNumber: shipment.trackingNumber,
        riskLevel: input.riskLevel,
        estimatedDelayMinutes: input.estimatedDelayMinutes ?? null
      };
    },

    // ─── Scoped analytics handlers ───────────────────────────────────────────

    get_failed_shipments_count: async (rawInput, ctx) => {
      const input = toolSchemas.get_failed_shipments_count.parse(rawInput);
      assertTenant(input.tenantId, ctx.tenantId);

      const { dateFrom, dateTo } = getDateRange(input.dateFrom, input.dateTo);

      const count = await app.prisma.shipment.count({
        where: {
          tenantId: ctx.tenantId,
          status: 'FAILED_DELIVERY',
          createdAt: { gte: dateFrom, lte: dateTo }
        }
      });

      return {
        tenantId: ctx.tenantId,
        dateFrom: dateFrom.toISOString(),
        dateTo: dateTo.toISOString(),
        failedDeliveriesCount: count
      };
    },

    get_delay_reasons: async (rawInput, ctx) => {
      const input = toolSchemas.get_delay_reasons.parse(rawInput);
      assertTenant(input.tenantId, ctx.tenantId);

      const { dateFrom, dateTo } = getDateRange(input.dateFrom, input.dateTo);

      const events = await app.prisma.shipmentEvent.findMany({
        where: {
          tenantId: ctx.tenantId,
          status: { in: ['FAILED_DELIVERY', 'EXCEPTION'] },
          timestamp: { gte: dateFrom, lte: dateTo }
        },
        select: { notes: true },
        take: 500
      });

      const reasons: Record<string, number> = {};
      for (const event of events) {
        const reason = event.notes?.split(':')[0]?.trim() ?? 'Unknown';
        reasons[reason] = (reasons[reason] ?? 0) + 1;
      }

      return {
        tenantId: ctx.tenantId,
        dateFrom: dateFrom.toISOString(),
        dateTo: dateTo.toISOString(),
        totalExceptionEvents: events.length,
        reasonBreakdown: Object.entries(reasons)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([reason, count]) => ({ reason, count }))
      };
    },

    get_sla_breach_rate: async (rawInput, ctx) => {
      const input = toolSchemas.get_sla_breach_rate.parse(rawInput);
      assertTenant(input.tenantId, ctx.tenantId);

      const { dateFrom, dateTo } = getDateRange(input.dateFrom, input.dateTo);

      const shipments = await app.prisma.shipment.findMany({
        where: {
          tenantId: ctx.tenantId,
          createdAt: { gte: dateFrom, lte: dateTo }
        },
        select: {
          id: true,
          status: true,
          estimatedDelivery: true,
          actualDelivery: true
        }
      });

      const deliveredLate = shipments.filter(
        (s) =>
          s.actualDelivery &&
          s.estimatedDelivery &&
          s.actualDelivery.getTime() > s.estimatedDelivery.getTime()
      );
      const overdueOpen = shipments.filter(
        (s) =>
          !s.actualDelivery &&
          s.estimatedDelivery &&
          s.estimatedDelivery.getTime() < Date.now() &&
          !TERMINAL_SHIPMENT_STATUSES.includes(s.status)
      );

      const totalBreaches = deliveredLate.length + overdueOpen.length;
      const breachRate =
        shipments.length > 0 ? roundMoney(totalBreaches / shipments.length) : null;

      return {
        tenantId: ctx.tenantId,
        dateFrom: dateFrom.toISOString(),
        dateTo: dateTo.toISOString(),
        totalShipments: shipments.length,
        lateDeliveries: deliveredLate.length,
        overdueOpen: overdueOpen.length,
        totalBreaches,
        breachRate,
        breachRatePercent: breachRate !== null ? roundMoney(breachRate * 100) : null
      };
    },

    get_driver_performance: async (rawInput, ctx) => {
      const input = toolSchemas.get_driver_performance.parse(rawInput);
      assertTenant(input.tenantId, ctx.tenantId);

      const { dateFrom, dateTo } = getDateRange(input.dateFrom, input.dateTo);

      const drivers = await app.prisma.driver.findMany({
        where: { tenantId: ctx.tenantId },
        select: {
          id: true,
          user: { select: { firstName: true, lastName: true, email: true } },
          shipments: {
            where: {
              tenantId: ctx.tenantId,
              createdAt: { gte: dateFrom, lte: dateTo }
            },
            select: {
              status: true,
              estimatedDelivery: true,
              actualDelivery: true
            }
          }
        }
      });

      const rows = drivers
        .map((driver) => {
          const total = driver.shipments.length;
          const delivered = driver.shipments.filter((s) => s.status === 'DELIVERED').length;
          const onTime = driver.shipments.filter(
            (s) =>
              s.status === 'DELIVERED' &&
              s.actualDelivery &&
              s.estimatedDelivery &&
              s.actualDelivery.getTime() <= s.estimatedDelivery.getTime()
          ).length;

          return {
            driverId: driver.id,
            name:
              [driver.user.firstName, driver.user.lastName].filter(Boolean).join(' ') ||
              driver.user.email,
            totalJobs: total,
            deliveredCount: delivered,
            onTimeCount: onTime,
            onTimeRate: delivered > 0 ? roundMoney(onTime / delivered) : null
          };
        })
        .filter((d) => d.totalJobs > 0)
        .sort((a, b) => b.totalJobs - a.totalJobs);

      return {
        tenantId: ctx.tenantId,
        dateFrom: dateFrom.toISOString(),
        dateTo: dateTo.toISOString(),
        drivers: rows
      };
    },

    get_carrier_performance: async (rawInput, ctx) => {
      const input = toolSchemas.get_carrier_performance.parse(rawInput);
      assertTenant(input.tenantId, ctx.tenantId);

      const { dateFrom, dateTo } = getDateRange(input.dateFrom, input.dateTo);

      // Uses active rate cards as the carrier catalogue.
      // Direct carrier-shipment assignment tracking is a Phase 2 addition.
      const rateCards = await app.prisma.rateCard.findMany({
        where: { tenantId: ctx.tenantId, isActive: true },
        select: {
          id: true,
          name: true,
          serviceTier: true,
          currency: true
        },
        orderBy: { name: 'asc' }
      });

      return {
        tenantId: ctx.tenantId,
        dateFrom: dateFrom.toISOString(),
        dateTo: dateTo.toISOString(),
        note: 'Per-carrier shipment volume tracking requires Phase 2 carrier-shipment linkage.',
        carriers: rateCards.map((rc) => ({
          carrier: rc.name ?? 'Fauward Network',
          rateCardId: rc.id,
          serviceTier: rc.serviceTier ?? 'STANDARD',
          currency: rc.currency
        }))
      };
    },

    get_shipments_by_status: async (rawInput, ctx) => {
      const input = toolSchemas.get_shipments_by_status.parse(rawInput);
      assertTenant(input.tenantId, ctx.tenantId);

      const { dateFrom, dateTo } = getDateRange(input.dateFrom, input.dateTo);

      const shipments = await app.prisma.shipment.findMany({
        where: {
          tenantId: ctx.tenantId,
          createdAt: { gte: dateFrom, lte: dateTo }
        },
        select: { status: true }
      });

      const byStatus = shipments.reduce<Record<string, number>>((acc, s) => {
        acc[s.status] = (acc[s.status] ?? 0) + 1;
        return acc;
      }, {});

      return {
        tenantId: ctx.tenantId,
        dateFrom: dateFrom.toISOString(),
        dateTo: dateTo.toISOString(),
        total: shipments.length,
        byStatus
      };
    },

    get_weekly_operations_summary: async (rawInput, ctx) => {
      const input = toolSchemas.get_weekly_operations_summary.parse(rawInput);
      assertTenant(input.tenantId, ctx.tenantId);

      const { dateFrom, dateTo } = getDateRange(input.dateFrom, input.dateTo);

      const shipments = await app.prisma.shipment.findMany({
        where: {
          tenantId: ctx.tenantId,
          createdAt: { gte: dateFrom, lte: dateTo }
        },
        select: {
          status: true,
          estimatedDelivery: true,
          actualDelivery: true
        }
      });

      const byStatus = shipments.reduce<Record<string, number>>((acc, s) => {
        acc[s.status] = (acc[s.status] ?? 0) + 1;
        return acc;
      }, {});

      const delivered = shipments.filter((s) => s.status === 'DELIVERED').length;
      const failed = shipments.filter((s) => s.status === 'FAILED_DELIVERY').length;
      const lateDeliveries = shipments.filter(
        (s) =>
          s.actualDelivery &&
          s.estimatedDelivery &&
          s.actualDelivery.getTime() > s.estimatedDelivery.getTime()
      ).length;
      const overdueOpen = shipments.filter(
        (s) =>
          !s.actualDelivery &&
          s.estimatedDelivery &&
          s.estimatedDelivery.getTime() < Date.now() &&
          !TERMINAL_SHIPMENT_STATUSES.includes(s.status)
      ).length;

      const totalBreaches = lateDeliveries + overdueOpen;
      const breachRate = shipments.length > 0 ? roundMoney(totalBreaches / shipments.length) : null;
      const deliverySuccessRate =
        shipments.length > 0 ? roundMoney(delivered / shipments.length) : null;

      // Top delay reasons from exception events
      const exceptionEvents = await app.prisma.shipmentEvent.findMany({
        where: {
          tenantId: ctx.tenantId,
          status: { in: ['FAILED_DELIVERY', 'EXCEPTION'] },
          timestamp: { gte: dateFrom, lte: dateTo }
        },
        select: { notes: true },
        take: 200
      });

      const reasons: Record<string, number> = {};
      for (const event of exceptionEvents) {
        const reason = event.notes?.split(':')[0]?.trim() ?? 'Unknown';
        reasons[reason] = (reasons[reason] ?? 0) + 1;
      }
      const topDelayReasons = Object.entries(reasons)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([reason, count]) => ({ reason, count }));

      return {
        tenantId: ctx.tenantId,
        dateFrom: dateFrom.toISOString(),
        dateTo: dateTo.toISOString(),
        totalShipments: shipments.length,
        delivered,
        failed,
        deliverySuccessRate,
        lateDeliveries,
        overdueOpen,
        slaBreachRate: breachRate,
        slaBreachRatePercent: breachRate !== null ? roundMoney(breachRate * 100) : null,
        topDelayReasons,
        shipmentsByStatus: byStatus
      };
    }
  };
}

function assertTenant(inputTenantId: string, contextTenantId: string) {
  if (inputTenantId !== contextTenantId) {
    throw new Error('Tool tenantId does not match agent run tenantId');
  }
}

function getDateRange(
  dateFrom: string | null | undefined,
  dateTo: string | null | undefined
): { dateFrom: Date; dateTo: Date } {
  const to = parseDate(dateTo) ?? new Date();
  const from = parseDate(dateFrom) ?? new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { dateFrom: from, dateTo: to };
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function getPostcode(address: unknown): string | null {
  if (!address || typeof address !== 'object') return null;
  const payload = address as Record<string, unknown>;
  const value = payload.postcode ?? payload.postCode ?? payload.postalCode ?? payload.zip;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function appendNote(existing: string | null, note: string): string {
  return [existing, note].filter(Boolean).join('\n');
}

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function estimateDeliveryHours(serviceTier: string | null): number {
  const tier = (serviceTier ?? 'STANDARD').toUpperCase();
  if (tier.includes('SAME')) return 8;
  if (tier.includes('EXPRESS') || tier.includes('NEXT')) return 24;
  if (tier.includes('ECONOMY')) return 96;
  return 72;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}
