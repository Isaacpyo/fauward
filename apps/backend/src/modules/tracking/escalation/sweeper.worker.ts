import type { PrismaClient } from '@prisma/client';
import type { Redis } from 'ioredis';
import { flipEscalationFlag } from './engine.service.js';

const STALE_GPS_MINUTES = 15;
const SWEEP_INTERVAL_MS = 60_000;

interface SweeperOptions {
  prisma: PrismaClient;
  redis: Redis;
  onError?: (err: Error) => void;
  intervalMs?: number;
}

export function startEscalationSweeper(options: SweeperOptions): () => void {
  const { prisma, redis, onError, intervalMs = SWEEP_INTERVAL_MS } = options;
  let running = true;
  let timeoutId: NodeJS.Timeout | null = null;

  async function sweep() {
    if (!running) return;
    try {
      const staleThreshold = new Date(Date.now() - STALE_GPS_MINUTES * 60_000);

      const candidates = await prisma.shipment.findMany({
        where: {
          escalationFlag: false,
          lastSeenAt: { lt: staleThreshold },
          status: { in: ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'PROCESSING', 'PICKED_UP'] },
        },
        select: {
          id: true,
          tenantId: true,
          trackingNumber: true,
          status: true,
          lastSeenAt: true,
          estimatedDelivery: true,
          createdAt: true,
        },
        take: 500,
      });

      for (const shipment of candidates) {
        const diffHours = shipment.lastSeenAt
          ? (Date.now() - shipment.lastSeenAt.getTime()) / 3_600_000
          : Infinity;

        let reason: string | null = null;

        if (shipment.status === 'OUT_FOR_DELIVERY' && diffHours > 4) {
          reason = 'stuck_in_status';
        } else if (shipment.status === 'IN_TRANSIT') {
          // Use estimated delivery as proxy for SLA
          const slaHours = shipment.estimatedDelivery
            ? (shipment.estimatedDelivery.getTime() - shipment.createdAt.getTime()) / 3_600_000
            : 48;
          if (diffHours > slaHours) {
            reason = 'stuck_in_status';
          }
        } else if ((shipment.status === 'PROCESSING' || shipment.status === 'PICKED_UP') && diffHours > 8) {
          reason = 'stuck_in_status';
        }

        if (!reason && !shipment.lastSeenAt) {
          reason = 'stale_gps';
        }
        if (!reason && diffHours * 60 > STALE_GPS_MINUTES) {
          reason = 'stale_gps';
        }

        if (reason) {
          await flipEscalationFlag(prisma, redis, {
            tenantId: shipment.tenantId,
            shipmentId: shipment.id,
            trackingNumber: shipment.trackingNumber,
            reason,
          });
        }
      }
    } catch (err) {
      onError?.(err as Error);
    } finally {
      if (running) {
        timeoutId = setTimeout(sweep, intervalMs);
      }
    }
  }

  timeoutId = setTimeout(sweep, intervalMs);

  return () => {
    running = false;
    if (timeoutId) clearTimeout(timeoutId);
  };
}
