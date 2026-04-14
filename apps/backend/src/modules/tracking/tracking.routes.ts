import type { FastifyInstance } from 'fastify';

function toPublicLocation(input: unknown): string | undefined {
  if (!input || typeof input !== 'object') return undefined;

  const address = input as Record<string, unknown>;
  const cityLike =
    (typeof address.city === 'string' && address.city.trim()) ||
    (typeof address.town === 'string' && address.town.trim()) ||
    (typeof address.locality === 'string' && address.locality.trim()) ||
    '';
  const stateLike =
    (typeof address.state === 'string' && address.state.trim()) ||
    (typeof address.province === 'string' && address.province.trim()) ||
    '';
  const countryLike = typeof address.country === 'string' ? address.country.trim() : '';

  const parts = [cityLike, stateLike, countryLike].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : undefined;
}

export async function registerTrackingRoutes(app: FastifyInstance) {
  app.get('/api/v1/tracking/:trackingNumber', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const { trackingNumber } = request.params as { trackingNumber: string };
    const tenantId = request.tenant?.id;
    if (!tenantId) {
      return reply.status(400).send({ error: 'Tenant context required', code: 'TENANT_REQUIRED' });
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
        location: toPublicLocation(event.location),
        description: `Status updated to ${event.status.replaceAll('_', ' ').toLowerCase()}`
      })),
      estimated_delivery_date: shipment.estimatedDelivery,
      origin_city: toPublicLocation(shipment.originAddress),
      destination_city: toPublicLocation(shipment.destinationAddress),
      service_tier: shipment.serviceTier,
      delivered_at: shipment.actualDelivery ?? undefined
    });
  });
}
