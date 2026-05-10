import type { FastifyInstance } from 'fastify';
import { getPublicTrackingView } from './tracking.service.js';

export async function registerPublicTrackingRoutes(app: FastifyInstance) {
  // Public customer tracking — no auth required, tenant resolved from query/host
  app.get(
    '/api/v1/tracking/:trackingNumber',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const { trackingNumber } = request.params as { trackingNumber: string };
      const tenantId = request.tenant?.id;

      if (!tenantId) {
        return reply.status(400).send({ error: 'Tenant context required', code: 'TENANT_REQUIRED' });
      }

      const view = await getPublicTrackingView(app.prisma, trackingNumber.toUpperCase(), tenantId);

      if (!view) {
        // Fall back to legacy ShipmentEvent lookup for shipments not yet migrated
        const shipment = await app.prisma.shipment.findFirst({
          where: { trackingNumber: trackingNumber.toUpperCase(), tenantId },
          include: { events: { orderBy: { timestamp: 'asc' } } }
        });

        if (!shipment) {
          return reply.status(404).send({ error: 'Shipment not found' });
        }

        const tenant = await app.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { name: true, logoUrl: true }
        });

        return reply.send({
          trackingNumber: shipment.trackingNumber,
          tenant: { name: tenant?.name ?? 'Fauward', logoUrl: tenant?.logoUrl ?? null },
          status: shipment.status.replaceAll('_', ' ').toLowerCase(),
          message: `Your shipment is ${shipment.status.replaceAll('_', ' ').toLowerCase()}.`,
          estimatedDeliveryAt: shipment.estimatedDelivery?.toISOString() ?? null,
          deliveredAt: shipment.actualDelivery?.toISOString() ?? null,
          destination: { city: extractCity(shipment.destinationAddress), country: null },
          timeline: shipment.events.map((e) => ({
            title: e.status.replaceAll('_', ' ').toLowerCase(),
            description: e.notes ?? `Status updated to ${e.status.replaceAll('_', ' ').toLowerCase()}`,
            location: extractCity(e.location),
            occurredAt: e.timestamp.toISOString()
          }))
        });
      }

      return reply.send(view);
    }
  );
}

function extractCity(address: unknown): string | undefined {
  if (!address || typeof address !== 'object') return undefined;
  const rec = address as Record<string, unknown>;
  const city = rec.city ?? rec.town ?? rec.locality;
  return typeof city === 'string' && city.trim() ? city.trim() : undefined;
}
