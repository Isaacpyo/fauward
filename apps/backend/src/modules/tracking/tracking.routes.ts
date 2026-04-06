import type { FastifyInstance } from 'fastify';
import { config } from '../../config/index.js';

function normalizeHost(host: string) {
  return host.split(':')[0].toLowerCase();
}

function extractSlugFromHost(host: string, platformDomain: string) {
  const normalized = normalizeHost(host);
  const suffix = `.${platformDomain.toLowerCase()}`;
  if (!normalized.endsWith(suffix)) return null;
  const slug = normalized.slice(0, -suffix.length);
  if (!slug || slug === 'api' || slug === 'admin') return null;
  return slug;
}

function asAddress(address: unknown) {
  if (!address || typeof address !== 'object') return '';
  return Object.values(address as Record<string, unknown>)
    .filter(Boolean)
    .join(', ');
}

export async function registerTrackingRoutes(app: FastifyInstance) {
  app.get('/api/v1/tracking/:trackingNumber', async (request, reply) => {
    const { trackingNumber } = request.params as { trackingNumber: string };
    const query = request.query as { tenant?: string };

    let tenantId: string | undefined;

    if (typeof query.tenant === 'string' && query.tenant.trim()) {
      const tenant = await app.prisma.tenant.findUnique({ where: { slug: query.tenant.trim() } });
      tenantId = tenant?.id;
    }

    if (!tenantId) {
      const host = typeof request.headers.host === 'string' ? request.headers.host : '';
      const slug = extractSlugFromHost(host, config.platformDomain);
      if (slug) {
        const tenant = await app.prisma.tenant.findUnique({ where: { slug } });
        tenantId = tenant?.id;
      }
    }

    const shipment = await app.prisma.shipment.findFirst({
      where: {
        trackingNumber: trackingNumber.toUpperCase(),
        tenantId
      },
      include: {
        events: { orderBy: { timestamp: 'asc' } }
      }
    });

    if (!shipment) {
      return reply.status(404).send({ error: 'Shipment not found' });
    }

    return reply.send({
      tracking_number: shipment.trackingNumber,
      status: shipment.status,
      events: shipment.events.map((event) => ({
        id: event.id,
        timestamp: event.timestamp,
        status: event.status,
        location: typeof event.location === 'object' ? JSON.stringify(event.location) : undefined,
        description: event.notes ?? `Status updated to ${event.status}`,
        note: event.notes ?? null
      })),
      estimated_delivery_date: shipment.estimatedDelivery,
      origin_city: asAddress(shipment.originAddress),
      destination_city: asAddress(shipment.destinationAddress),
      service_tier: shipment.serviceTier,
      delivered_at: shipment.actualDelivery ?? undefined
    });
  });
}
