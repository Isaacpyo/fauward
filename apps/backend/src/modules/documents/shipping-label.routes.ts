import { randomUUID } from 'crypto';

import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';

import { authenticate } from '../../shared/middleware/authenticate.js';
import { requireTenantMatch } from '../../shared/middleware/tenantMatch.js';
import { publishPythonServiceJob } from '../../queues/python-services.js';

// Path #1 flow: Node owns tenant + auth, writes a row into the Python-owned
// `documents` table, and queues `fauward:pdf:generate` for the Python
// pdf_worker to render the shipping label. Status + download are tenant-scoped
// reads against the same `documents` table — no Prisma `GeneratedLabel` rows
// are touched (that path is the LEGACY label.routes.ts flow).

type LabelRow = {
  id: string;
  status: string;
  url: string | null;
  errorMessage: string | null;
};

function labelResponse(row: LabelRow, baseUrl: string) {
  if (row.status === 'COMPLETED') {
    return {
      document_id: row.id,
      job_id: row.id,
      status: 'COMPLETED' as const,
      signed_url: `${baseUrl}/${row.id}/download`
    };
  }
  return {
    document_id: row.id,
    job_id: row.id,
    status: row.status === 'FAILED' ? ('FAILED' as const) : ('QUEUED' as const),
    signed_url: null,
    error: row.status === 'FAILED' ? 'Label generation failed' : undefined
  };
}

export async function registerShippingLabelRoutes(app: FastifyInstance) {
  app.post(
    '/api/v1/shipments/:id/label',
    { preHandler: [authenticate, requireTenantMatch] },
    async (request, reply) => {
      const tenantId = request.tenant?.id;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
      const { id: shipmentId } = request.params as { id: string };
      const { regenerate } = request.query as { regenerate?: string };
      const shouldRegenerate = regenerate === 'true' || regenerate === '1';

      const shipment = await app.prisma.shipment.findFirst({
        where: { id: shipmentId, tenantId },
        select: { id: true }
      });
      if (!shipment) return reply.status(404).send({ error: 'Shipment not found' });

      const baseUrl = `/api/v1/shipments/${shipment.id}/label`;

      // Branch 1: an existing COMPLETED label satisfies a normal click.
      if (!shouldRegenerate) {
        const existingRows = await app.prisma.$queryRaw<LabelRow[]>(Prisma.sql`
          select id, status, url, error_message as "errorMessage"
          from documents
          where tenant_id = ${tenantId}
            and shipment_id = ${shipment.id}
            and type = 'shipping_label'
            and status = 'COMPLETED'
          order by updated_at desc
          limit 1
        `);
        const existing = existingRows[0];
        if (existing) return reply.send(labelResponse(existing, baseUrl));
      }

      // Branch 2 / 3: queue a fresh job. Document row + Redis push mirror the
      // Python `pdf_jobs.queue_pdf_generation` flow so the existing pdf_worker
      // picks it up identically to a /pdf/generate request.
      const jobId = randomUUID();
      await app.prisma.$executeRaw(Prisma.sql`
        insert into documents (id, tenant_id, shipment_id, type, status, metadata, updated_at)
        values (
          ${jobId},
          ${tenantId},
          ${shipment.id},
          'shipping_label',
          'QUEUED',
          ${Prisma.sql`'{"source":"tenant-portal"}'::jsonb`},
          now()
        )
      `);

      await publishPythonServiceJob(app, 'fauward:pdf:generate', {
        jobId,
        tenantId,
        type: 'shipping_label',
        shipmentId: shipment.id,
        options: {}
      });

      request.log.info(
        { jobId, tenantId, shipmentId: shipment.id, regenerate: shouldRegenerate, actorId: request.user?.sub },
        'shipping_label_queued'
      );

      return reply.status(202).send({
        document_id: jobId,
        job_id: jobId,
        status: 'QUEUED' as const,
        signed_url: null
      });
    }
  );

  app.get(
    '/api/v1/shipments/:id/label/:jobId',
    { preHandler: [authenticate, requireTenantMatch] },
    async (request, reply) => {
      const tenantId = request.tenant?.id;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
      const { id: shipmentId, jobId } = request.params as { id: string; jobId: string };

      const rows = await app.prisma.$queryRaw<LabelRow[]>(Prisma.sql`
        select id, status, url, error_message as "errorMessage"
        from documents
        where id = ${jobId}
          and tenant_id = ${tenantId}
          and shipment_id = ${shipmentId}
          and type = 'shipping_label'
        limit 1
      `);
      const row = rows[0];
      if (!row) return reply.status(404).send({ error: 'Label not found' });

      const baseUrl = `/api/v1/shipments/${shipmentId}/label`;
      return reply.send(labelResponse(row, baseUrl));
    }
  );

  app.get(
    '/api/v1/shipments/:id/label/:jobId/download',
    { preHandler: [authenticate, requireTenantMatch] },
    async (request, reply) => {
      const tenantId = request.tenant?.id;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });
      const { id: shipmentId, jobId } = request.params as { id: string; jobId: string };

      const rows = await app.prisma.$queryRaw<Array<{ url: string | null; status: string }>>(Prisma.sql`
        select url, status
        from documents
        where id = ${jobId}
          and tenant_id = ${tenantId}
          and shipment_id = ${shipmentId}
          and type = 'shipping_label'
        limit 1
      `);
      const row = rows[0];
      if (!row || row.status !== 'COMPLETED' || !row.url) {
        return reply.status(404).send({ error: 'Label not ready' });
      }
      return reply.redirect(302, row.url);
    }
  );
}
