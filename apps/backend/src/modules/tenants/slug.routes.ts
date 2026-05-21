import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { requireRole } from '../../shared/middleware/requireRole.js';
import { requireTenantMatch } from '../../shared/middleware/tenantMatch.js';
import { isReservedSlug } from './reserved-slugs.js';
import { isValidSlugFormat } from './slug.util.js';

const SLUG_HISTORY_RETENTION_DAYS = 365;

const updateSlugSchema = z.object({
  newSlug: z.string().min(2).max(40)
});

function slugHistoryExpiresAt() {
  return new Date(Date.now() + SLUG_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

export async function registerTenantSlugRoutes(app: FastifyInstance) {
  app.patch(
    '/api/v1/tenant/slug',
    { preHandler: [app.authenticate, requireTenantMatch, requireRole(['TENANT_ADMIN'])] },
    async (request, reply) => {
      const tenant = request.tenant;
      if (!tenant) return reply.status(400).send({ error: 'TENANT_CONTEXT_REQUIRED' });

      const { newSlug } = updateSlugSchema.parse(request.body);
      const normalizedSlug = newSlug.trim().toLowerCase();

      if (!isValidSlugFormat(normalizedSlug)) {
        return reply.status(400).send({ error: 'INVALID_SLUG' });
      }
      if (isReservedSlug(normalizedSlug)) {
        return reply.status(409).send({ error: 'RESERVED_SLUG' });
      }
      if (normalizedSlug === tenant.slug) {
        return reply.send({ tenant, oldSlug: tenant.slug, redirectUrl: `/t/${tenant.slug}/settings` });
      }

      const active = await app.prisma.tenant.findUnique({
        where: { slug: normalizedSlug },
        select: { id: true }
      });
      if (active) {
        return reply.status(409).send({ error: 'TAKEN' });
      }

      const historical = await app.prisma.tenantSlugHistory.findUnique({
        where: { oldSlug: normalizedSlug },
        select: { tenantId: true }
      });
      if (historical && historical.tenantId !== tenant.id) {
        return reply.status(409).send({ error: 'RECENTLY_USED' });
      }

      const oldSlug = tenant.slug;
      const expiresAt = slugHistoryExpiresAt();

      const updated = await app.prisma.$transaction(async (tx) => {
        await tx.tenantSlugHistory.upsert({
          where: { oldSlug },
          create: { tenantId: tenant.id, oldSlug, expiresAt },
          update: { tenantId: tenant.id, expiresAt }
        });

        await tx.tenantSlugHistory.deleteMany({
          where: { tenantId: tenant.id, oldSlug: normalizedSlug }
        });

        const nextTenant = await tx.tenant.update({
          where: { id: tenant.id },
          data: { slug: normalizedSlug }
        });

        await tx.outboxEvent.create({
          data: {
            aggregateType: 'tenant',
            aggregateId: tenant.id,
            eventType: 'tenant.slug.changed',
            payload: { tenantId: tenant.id, oldSlug, newSlug: normalizedSlug }
          }
        });

        return nextTenant;
      });

      return reply.send({
        tenant: { ...updated, displayName: updated.name },
        oldSlug,
        redirectUrl: `/t/${updated.slug}/settings`
      });
    }
  );
}
