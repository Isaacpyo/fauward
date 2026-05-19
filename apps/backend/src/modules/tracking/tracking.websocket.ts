import type { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';

import { config } from '../../config/index.js';
import { readRange } from './realtime/stream.service.js';
import { shipmentRoom, tenantRoom, escalationsRoom, parseRoomName } from './ws/room-names.js';
import { canJoinRoom } from './ws/connect-authz.js';
import type { AuthzContext } from './ws/connect-authz.js';

let io: Server | null = null;

function extractBearerToken(raw?: string) {
  if (!raw) return null;
  if (!raw.startsWith('Bearer ')) return null;
  return raw.slice('Bearer '.length).trim();
}

export async function setupTrackingWebsocket(app: FastifyInstance) {
  if (io) return io;

  io = new Server(app.server, {
    path: '/tracking',
    cors: { origin: true, credentials: true }
  });

  try {
    const pub = new Redis(config.redisUrl);
    const sub = new Redis(config.redisUrl);
    io.adapter(createAdapter(pub, sub));
  } catch {
    app.log.warn('Tracking websocket Redis adapter unavailable; using in-memory adapter');
  }

  io.on('connection', (socket) => {
    let authCtx: AuthzContext = {};

    const tokenFromHeader = extractBearerToken(
      typeof socket.handshake.headers.authorization === 'string'
        ? socket.handshake.headers.authorization
        : undefined
    );

    if (tokenFromHeader) {
      try {
        const payload = jwt.verify(tokenFromHeader, config.jwt.accessSecret) as {
          tenantId?: string;
          role?: string;
        };
        authCtx = {
          tenantId: payload.tenantId,
          role: payload.role,
        };
      } catch {
        // invalid token
      }
    }

    const impersonating = socket.handshake.query?.impersonating as string | undefined;
    if (authCtx.role === 'SUPER_ADMIN' && impersonating) {
      authCtx.impersonatingTenantId = impersonating;
    }

    socket.on('message', async (message: { type?: string; room?: string; trackingNumber?: string; lastSeq?: number }) => {
      if (message?.type === 'subscribe' && message.trackingNumber && !message.room) {
        const trackingNumber = message.trackingNumber.trim().toUpperCase();
        const shipment = await app.prisma.shipment.findUnique({
          where: { trackingNumber },
          select: { tenantId: true }
        });
        if (!shipment) {
          socket.emit('message', { type: 'error', code: 'NOT_FOUND' });
          return;
        }
        if (authCtx.tenantId && authCtx.tenantId !== shipment.tenantId) {
          socket.emit('message', { type: 'error', code: 'FORBIDDEN' });
          return;
        }
        socket.join(shipmentRoom(shipment.tenantId, trackingNumber));
        socket.emit('message', { type: 'subscribed', trackingNumber });
        return;
      }

      if (message?.type === 'subscribe' && message.room) {
        const room = message.room;
        if (!canJoinRoom(authCtx, room)) {
          socket.emit('message', { type: 'error', code: 'FORBIDDEN' });
          return;
        }
        socket.join(room);
        socket.emit('message', { type: 'subscribed', room });
        return;
      }

      if (message?.type === 'resubscribe' && message.room && message.lastSeq !== undefined) {
        const room = message.room;
        if (!canJoinRoom(authCtx, room)) {
          socket.emit('message', { type: 'error', code: 'FORBIDDEN' });
          return;
        }
        socket.join(room);

        const parsed = parseRoomName(room);
        if (parsed?.type === 'shipment' || parsed?.type === 'tenant') {
          const tenantId = parsed.tenantId!;
          const startSeq = message.lastSeq + 1;
          const events = await readRange(
            app.redis,
            tenantId,
            `${startSeq}-0`,
            '+',
            1000
          );

          if (events.length >= 1000) {
            socket.emit('message', { type: 'resync', room });
            return;
          }

          for (const ev of events) {
            socket.emit('message', { type: 'event', room, data: ev.fields });
          }
        }

        socket.emit('message', { type: 'subscribed', room });
        return;
      }
    });
  });

  return io;
}

export function emitTrackingStatusUpdate(payload: {
  tenantId: string;
  trackingNumber: string;
  status: string;
  location?: unknown;
  timestamp: string;
}) {
  if (!io) return;
  io.to(shipmentRoom(payload.tenantId, payload.trackingNumber)).emit('message', {
    type: 'status_update',
    data: {
      status: payload.status,
      location: payload.location,
      timestamp: payload.timestamp
    }
  });
}

export function emitTrackingRealtimeUpdate(payload: {
  tenantId: string;
  trackingNumber: string;
  eventType: string;
  seq: bigint;
  data: Record<string, unknown>;
}) {
  if (!io) return;
  const room = shipmentRoom(payload.tenantId, payload.trackingNumber);
  const tenantRm = tenantRoom(payload.tenantId);
  const message = {
    type: 'event',
    eventType: payload.eventType,
    seq: String(payload.seq),
    data: payload.data,
  };
  io.to(room).emit('message', message);
  io.to(tenantRm).emit('message', message);
}

export function emitEscalationUpdate(payload: {
  tenantId: string;
  shipmentId: string;
  trackingNumber: string;
  reason: string;
  flaggedAt: string;
}) {
  if (!io) return;
  io.to(escalationsRoom()).emit('message', {
    type: 'escalation',
    data: payload,
  });
}
