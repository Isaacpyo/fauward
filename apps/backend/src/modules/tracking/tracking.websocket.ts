import type { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import jwt from 'jsonwebtoken';

import { config } from '../../config/index.js';

let io: Server | null = null;

function roomName(tenantId: string, trackingNumber: string) {
  return `${tenantId}:${trackingNumber}`;
}

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
    let authTenantId: string | null = null;

    const tokenFromHeader = extractBearerToken(
      typeof socket.handshake.headers.authorization === 'string'
        ? socket.handshake.headers.authorization
        : undefined
    );

    if (tokenFromHeader) {
      try {
        const payload = jwt.verify(tokenFromHeader, config.jwt.accessSecret) as {
          tenantId?: string;
        };
        authTenantId = payload.tenantId ?? null;
      } catch {
        authTenantId = null;
      }
    }

    socket.on('message', async (message: { type?: string; trackingNumber?: string }) => {
      if (message?.type !== 'subscribe' || !message.trackingNumber) return;
      const trackingNumber = message.trackingNumber.trim().toUpperCase();
      if (!trackingNumber) return;

      const shipment = await app.prisma.shipment.findUnique({
        where: { trackingNumber },
        select: { tenantId: true }
      });
      if (!shipment) {
        socket.emit('message', { type: 'error', code: 'NOT_FOUND' });
        return;
      }

      if (authTenantId && authTenantId !== shipment.tenantId) {
        socket.emit('message', { type: 'error', code: 'FORBIDDEN' });
        return;
      }

      socket.join(roomName(shipment.tenantId, trackingNumber));
      socket.emit('message', { type: 'subscribed', trackingNumber });
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
  io.to(roomName(payload.tenantId, payload.trackingNumber)).emit('message', {
    type: 'status_update',
    data: {
      status: payload.status,
      location: payload.location,
      timestamp: payload.timestamp
    }
  });
}
