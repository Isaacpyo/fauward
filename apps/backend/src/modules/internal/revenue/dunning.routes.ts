import type { FastifyInstance, FastifyReply } from 'fastify';
import { Prisma } from '@prisma/client';
import { z, type ZodError } from 'zod';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { requirePlatformCsrf } from '../../../middleware/require-platform-csrf.js';
import { dangerous } from '../../../middleware/dangerous.js';
import { auditedMutation, staffMutationActor } from '../../../services/console-mutation.js';
import {
  DunningError,
  addStep,
  createSequence,
  deleteSequence,
  deleteStep,
  dunningOverview,
  getSequence,
  listSequences,
  patchSequence,
  patchStep,
  retryEnrollment,
  sequenceBody,
  sequencePatchBody,
  setEnrollmentState,
  stepBody,
  stepPatchBody,
  tenantDunningTimeline
} from '../../../services/dunning.service.js';
import { SaveOfferError, approveSaveOffer, presentSaveOffer } from '../../../services/save-offer.service.js';
import { writePlatformAuditLog } from '../../../services/platform-audit.service.js';
import { platformAuditActor, reasonOf } from '../request-meta.js';

// revenue.dunning (WP-4.5): overview, per-tenant timeline, enrolment actions (retry/pause/resume/cancel — dangerous),
// the sequence editor and save offers (create → approve with a code → tenant redeems, WP-2.7). Every query here is
// Fauward billing (PLATFORM) and names the tenant it touches.

const read = [authenticatePlatformSession, requireConsolePermission('revenue.dunning.read')];
const write = [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission('revenue.dunning.write')];

// Money is a 2-decimal string; a plain number from an older client is converted, never stored as a float.
const money = z.preprocess((value) => (typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : value), z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Amount like 25.00'));
const saveOfferBody = z.object({
  tenantId: z.string().min(1),
  discount: money.refine((value) => Number(value) > 0, 'The discount must be more than 0'),
  expiresAt: z.string().datetime({ offset: true }).optional(),
  reason: z.string().trim().min(3).max(500)
});

function invalid(reply: FastifyReply, error: ZodError) {
  return reply.status(400).send({ error: 'INVALID_BODY', message: error.issues[0]?.message });
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof DunningError || error instanceof SaveOfferError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  throw error;
}

export async function registerConsoleDunningRoutes(app: FastifyInstance) {
  app.get('/api/internal/dunning/overview', { preHandler: read }, async (_request, reply) => reply.send(await dunningOverview(app)));

  app.get('/api/internal/dunning/tenants/:tenantId/timeline', { preHandler: read }, async (request, reply) => {
    const { tenantId } = request.params as { tenantId: string };
    const timeline = await tenantDunningTimeline(app, tenantId);
    if (!timeline) return reply.status(404).send({ error: 'TENANT_NOT_FOUND', message: 'Tenant not found' });
    return reply.send(timeline);
  });

  app.post('/api/internal/dunning/enrollments/:id/retry', { preHandler: dangerous('revenue.dunning.write') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return reply.send(await retryEnrollment(app, request, id, reasonOf(request) ?? ''));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  for (const action of ['pause', 'resume', 'cancel'] as const) {
    app.post(`/api/internal/dunning/enrollments/:id/${action}`, { preHandler: dangerous('revenue.dunning.write') }, async (request, reply) => {
      const { id } = request.params as { id: string };
      try {
        return reply.send(await setEnrollmentState(app, request, id, action, reasonOf(request) ?? ''));
      } catch (error) {
        return sendError(reply, error);
      }
    });
  }

  // ── Sequences ──────────────────────────────────────────────────────────────
  app.get('/api/internal/dunning/sequences', { preHandler: read }, async (_request, reply) => reply.send(await listSequences(app)));

  app.get('/api/internal/dunning/sequences/:id', { preHandler: read }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const sequence = await getSequence(app, id);
    if (!sequence) return reply.status(404).send({ error: 'SEQUENCE_NOT_FOUND', message: 'Sequence not found' });
    return reply.send(sequence);
  });

  app.post('/api/internal/dunning/sequences', { preHandler: write }, async (request, reply) => {
    const parsed = sequenceBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.status(201).send(await createSequence(app, request, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.patch('/api/internal/dunning/sequences/:id', { preHandler: write }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = sequencePatchBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.send(await patchSequence(app, request, id, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.delete('/api/internal/dunning/sequences/:id', { preHandler: write }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return reply.send(await deleteSequence(app, request, id));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/api/internal/dunning/sequences/:id/steps', { preHandler: write }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = stepBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.status(201).send(await addStep(app, request, id, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.patch('/api/internal/dunning/sequences/:id/steps/:stepId', { preHandler: write }, async (request, reply) => {
    const { id, stepId } = request.params as { id: string; stepId: string };
    const parsed = stepPatchBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.send(await patchStep(app, request, id, stepId, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.delete('/api/internal/dunning/sequences/:id/steps/:stepId', { preHandler: write }, async (request, reply) => {
    const { id, stepId } = request.params as { id: string; stepId: string };
    try {
      return reply.send(await deleteStep(app, request, id, stepId));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  // ── Save offers (WP-2.7 backend) ───────────────────────────────────────────
  app.get('/api/internal/dunning/save-offers', { preHandler: read }, async (_request, reply) => {
    const rows = await app.prisma.saveOffer.findMany({ orderBy: { createdAt: 'desc' }, take: 200 });
    const tenantIds = [...new Set(rows.map((row) => row.tenantId))];
    const tenants = tenantIds.length ? await app.prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true, slug: true } }) : [];
    const byId = new Map(tenants.map((tenant) => [tenant.id, tenant]));
    return reply.send({ data: rows.map((row) => ({ ...presentSaveOffer(row), tenant: byId.get(row.tenantId) ?? { id: row.tenantId, name: row.tenantId, slug: null } })) });
  });

  app.post('/api/internal/dunning/save-offers', { preHandler: write }, async (request, reply) => {
    const parsed = saveOfferBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    const tenant = await app.prisma.tenant.findUnique({ where: { id: parsed.data.tenantId }, select: { id: true, name: true } });
    if (!tenant) return reply.status(404).send({ error: 'TENANT_NOT_FOUND', message: 'Tenant not found' });
    const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : new Date(Date.now() + 14 * 86_400_000);
    if (expiresAt <= new Date()) return reply.status(400).send({ error: 'INVALID_BODY', message: 'The expiry must be in the future' });
    const offer = await auditedMutation(app, 'revenue.dunning', staffMutationActor(request), async (tx) => {
      // Created PENDING; a second, dangerous step approves it and generates the code the tenant redeems.
      const row = await tx.saveOffer.create({ data: { tenantId: tenant.id, discount: new Prisma.Decimal(parsed.data.discount), expiresAt, status: 'PENDING', reason: parsed.data.reason } });
      return {
        result: row,
        audit: { action: 'SAVE_OFFER_CREATED', targetTenantId: tenant.id, reason: parsed.data.reason, metadata: { saveOfferId: row.id, discount: row.discount.toFixed(2), expiresAt: expiresAt.toISOString() } },
        activity: { type: 'save_offer.created', tenantId: tenant.id, subjectType: 'save_offer', subjectId: row.id, summary: `Save offer of ${row.discount.toFixed(2)} GBP proposed for ${tenant.name}`, consoleLink: '/revenue/dunning/save-offers' }
      };
    });
    return reply.status(201).send(presentSaveOffer(offer));
  });

  app.post('/api/internal/dunning/save-offers/:id/approve', { preHandler: dangerous('revenue.dunning.write') }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      const offer = await approveSaveOffer(app, request, { id, reason: reasonOf(request) ?? '' });
      await writePlatformAuditLog(app.prisma, { ...platformAuditActor(request), actorType: 'PLATFORM_USER', action: 'SAVE_OFFER_APPROVED', targetTenantId: offer.tenantId, reason: reasonOf(request), metadata: { saveOfferId: offer.id, discount: offer.discount } });
      return reply.send({ offer });
    } catch (error) {
      return sendError(reply, error);
    }
  });
}
