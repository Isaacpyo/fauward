import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireRole } from '../../shared/middleware/requireRole.js';
import { rateCardCreateSchema } from './pricing.schema.js';

function getTenantId(request: FastifyRequest, reply: FastifyReply): string | null {
  const tenantId = request.tenant?.id;
  if (!tenantId) {
    reply.status(400).send({ error: 'Tenant context required' });
    return null;
  }
  return tenantId;
}

function parseCsvRows(csv: string) {
  return csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(',').map((cell) => cell.trim()));
}

export async function registerPricingRateCardRoutes(app: FastifyInstance) {
  const guard = { preHandler: [authenticate, requireRole(['TENANT_ADMIN', 'TENANT_MANAGER'])] };

  app.get('/rate-cards', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { originZone, destZone, serviceTier, isActive } = request.query as {
      originZone?: string;
      destZone?: string;
      serviceTier?: string;
      isActive?: string;
    };

    const rateCards = await app.prisma.rateCard.findMany({
      where: {
        tenantId,
        originZoneId: originZone,
        destZoneId: destZone,
        serviceTier: serviceTier,
        isActive: isActive === undefined ? undefined : isActive === 'true'
      },
      include: { originZone: true, destZone: true },
      orderBy: { createdAt: 'desc' }
    });

    reply.send({ rateCards });
  });

  app.post('/rate-cards', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const payload = rateCardCreateSchema.parse(request.body);

    const rateCard = await app.prisma.rateCard.create({
      data: {
        tenantId,
        name: payload.name,
        originZoneId: payload.originZoneId,
        destZoneId: payload.destZoneId,
        serviceTier: payload.serviceTier,
        basePrice: payload.baseFee,
        pricePerKg: payload.perKgRate,
        minCharge: payload.minCharge,
        maxCharge: payload.maxCharge,
        currency: payload.currency,
        effectiveFrom: payload.effectiveFrom ? new Date(payload.effectiveFrom) : null,
        effectiveTo: payload.effectiveTo ? new Date(payload.effectiveTo) : null,
        isActive: payload.isActive ?? true
      }
    });
    reply.status(201).send(rateCard);
  });

  app.get('/rate-cards/:id', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { id } = request.params as { id: string };
    const rateCard = await app.prisma.rateCard.findFirst({
      where: { id, tenantId },
      include: { originZone: true, destZone: true }
    });
    if (!rateCard) return reply.status(404).send({ error: 'Rate card not found' });
    reply.send(rateCard);
  });

  app.patch('/rate-cards/:id', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { id } = request.params as { id: string };
    const payload = rateCardCreateSchema.partial().parse(request.body);

    const existing = await app.prisma.rateCard.findFirst({ where: { id, tenantId } });
    if (!existing) return reply.status(404).send({ error: 'Rate card not found' });

    const updated = await app.prisma.rateCard.update({
      where: { id: existing.id },
      data: {
        name: payload.name,
        originZoneId: payload.originZoneId,
        destZoneId: payload.destZoneId,
        serviceTier: payload.serviceTier,
        basePrice: payload.baseFee,
        pricePerKg: payload.perKgRate,
        minCharge: payload.minCharge,
        maxCharge: payload.maxCharge,
        currency: payload.currency,
        effectiveFrom: payload.effectiveFrom ? new Date(payload.effectiveFrom) : undefined,
        effectiveTo: payload.effectiveTo ? new Date(payload.effectiveTo) : undefined,
        isActive: payload.isActive
      }
    });
    reply.send(updated);
  });

  app.delete('/rate-cards/:id', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { id } = request.params as { id: string };
    const existing = await app.prisma.rateCard.findFirst({ where: { id, tenantId } });
    if (!existing) return reply.status(404).send({ error: 'Rate card not found' });
    if (existing.isActive) return reply.status(400).send({ error: 'Deactivate rate card before deleting' });
    await app.prisma.rateCard.delete({ where: { id: existing.id } });
    reply.send({ success: true });
  });

  app.patch('/rate-cards/:id/activate', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { id } = request.params as { id: string };
    const existing = await app.prisma.rateCard.findFirst({ where: { id, tenantId } });
    if (!existing) return reply.status(404).send({ error: 'Rate card not found' });

    await app.prisma.$transaction([
      app.prisma.rateCard.updateMany({
        where: {
          tenantId,
          originZoneId: existing.originZoneId,
          destZoneId: existing.destZoneId,
          serviceTier: existing.serviceTier
        },
        data: { isActive: false }
      }),
      app.prisma.rateCard.update({
        where: { id: existing.id },
        data: { isActive: true }
      })
    ]);

    reply.send({ success: true });
  });

  app.post('/rate-cards/:id/duplicate', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { id } = request.params as { id: string };
    const { name, effectiveFrom } = request.body as { name?: string; effectiveFrom?: string };
    const existing = await app.prisma.rateCard.findFirst({ where: { id, tenantId } });
    if (!existing) return reply.status(404).send({ error: 'Rate card not found' });

    const duplicate = await app.prisma.rateCard.create({
      data: {
        tenantId,
        name: name ?? `${existing.name ?? 'Rate card'} (Copy)`,
        originZoneId: existing.originZoneId,
        destZoneId: existing.destZoneId,
        serviceTier: existing.serviceTier,
        basePrice: existing.basePrice,
        pricePerKg: existing.pricePerKg,
        minCharge: existing.minCharge,
        maxCharge: existing.maxCharge,
        currency: existing.currency,
        effectiveFrom: effectiveFrom ? new Date(effectiveFrom) : existing.effectiveFrom,
        effectiveTo: existing.effectiveTo,
        isActive: false
      }
    });

    reply.status(201).send(duplicate);
  });

  app.get('/rate-cards/matrix', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const [zones, rateCards] = await Promise.all([
      app.prisma.serviceZone.findMany({ where: { tenantId }, orderBy: { name: 'asc' } }),
      app.prisma.rateCard.findMany({ where: { tenantId, isActive: true } })
    ]);

    const matrix: Record<string, Record<string, unknown>> = {};
    for (const origin of zones) {
      matrix[origin.id] = {};
      for (const dest of zones) matrix[origin.id][dest.id] = null;
    }
    for (const rateCard of rateCards) {
      if (!rateCard.originZoneId || !rateCard.destZoneId) continue;
      if (!matrix[rateCard.originZoneId]) matrix[rateCard.originZoneId] = {};
      matrix[rateCard.originZoneId][rateCard.destZoneId] = rateCard;
    }

    reply.send({ zones, matrix });
  });

  app.post('/rate-cards/matrix/import', guard, async (request, reply) => {
    const tenantId = getTenantId(request, reply);
    if (!tenantId) return;
    const { csv, previewOnly = false } = request.body as { csv?: string; previewOnly?: boolean };
    if (!csv) return reply.status(400).send({ error: 'csv is required' });

    const rows = parseCsvRows(csv);
    if (rows.length < 2) return reply.status(400).send({ error: 'CSV must include headers and at least one row' });

    const [header, ...bodyRows] = rows;
    const expected = ['origin_zone', 'dest_zone', 'service_tier', 'base_fee', 'per_kg_rate'];
    if (header.join(',').toLowerCase() !== expected.join(',')) {
      return reply.status(400).send({ error: `Invalid CSV header. Expected: ${expected.join(',')}` });
    }

    const zones = await app.prisma.serviceZone.findMany({ where: { tenantId } });
    const zoneByName = new Map(zones.map((zone) => [zone.name.toLowerCase(), zone.id]));
    const parsed = bodyRows.map((row, index) => ({
      line: index + 2,
      originZoneId: zoneByName.get((row[0] ?? '').toLowerCase()) ?? null,
      destZoneId: zoneByName.get((row[1] ?? '').toLowerCase()) ?? null,
      serviceTier: row[2] ?? 'STANDARD',
      baseFee: Number(row[3]),
      perKgRate: Number(row[4])
    }));

    const invalid = parsed.filter((row) => !row.originZoneId || !row.destZoneId || Number.isNaN(row.baseFee) || Number.isNaN(row.perKgRate));
    if (invalid.length > 0) return reply.status(400).send({ error: 'Invalid rows found', invalid });
    if (previewOnly) return reply.send({ parsed, validCount: parsed.length });

    const created = await app.prisma.$transaction(
      parsed.map((row) =>
        app.prisma.rateCard.create({
          data: {
            tenantId,
            originZoneId: row.originZoneId!,
            destZoneId: row.destZoneId!,
            serviceTier: row.serviceTier,
            basePrice: row.baseFee,
            pricePerKg: row.perKgRate,
            currency: 'GBP',
            isActive: true
          }
        })
      )
    );

    reply.status(201).send({ imported: created.length });
  });
}

