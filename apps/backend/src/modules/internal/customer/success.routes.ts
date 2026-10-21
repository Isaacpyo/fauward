import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ZodError } from 'zod';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { requirePlatformCsrf } from '../../../middleware/require-platform-csrf.js';
import { scheduledJobsQueue } from '../../../queues/queues.js';
import { auditedMutation, staffMutationActor } from '../../../services/console-mutation.js';
import { healthScoringModel } from '../../../services/health-score.service.js';
import {
  SuccessError,
  atRisk,
  createPlaybook,
  deletePlaybook,
  expansionCandidates,
  getPlaybook,
  listPlaybooks,
  listRuns,
  manualRun,
  patchPlaybook,
  playbookBody,
  playbookPatchBody,
  runBody,
  successOverview
} from '../../../services/customer-success.service.js';

// customer.success (WP-4.8): overview, at-risk, expansion, the scoring model (WP-3.3) and a manual scoring run,
// playbook CRUD, manual runs and run history. Triggered runs come from the customer.playbook-executor job.

const read = [authenticatePlatformSession, requireConsolePermission('customer.success.read')];
const write = [authenticatePlatformSession, requirePlatformCsrf, requireConsolePermission('customer.success.write')];

function invalid(reply: FastifyReply, error: ZodError) {
  return reply.status(400).send({ error: 'INVALID_BODY', message: error.issues[0]?.message });
}

function sendError(reply: FastifyReply, error: unknown) {
  if (error instanceof SuccessError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  throw error;
}

export async function registerConsoleSuccessRoutes(app: FastifyInstance) {
  app.get('/api/internal/success/overview', { preHandler: read }, async (_request, reply) => reply.send(await successOverview(app)));
  app.get('/api/internal/success/at-risk', { preHandler: read }, async (_request, reply) => reply.send(await atRisk(app)));
  app.get('/api/internal/success/expansion', { preHandler: read }, async (_request, reply) => reply.send(await expansionCandidates(app)));

  // WP-3.3: the model from health-score.config.ts (weights, factor definitions, version), read-only.
  app.get('/api/internal/success/health-scoring', { preHandler: read }, async (_request, reply) => reply.send(healthScoringModel()));

  app.post('/api/internal/success/health-scoring/run', { preHandler: write }, async (request, reply) => {
    const job = await scheduledJobsQueue.add(
      'customer.health-scoring',
      // WP-3.8: the run row records who started it.
      { triggeredBy: request.platform!.user.id, reason: 'Manual health scoring run from the CS console' },
      { jobId: `customer.health-scoring.manual.${Date.now()}` }
    );
    await auditedMutation(app, 'customer.success', staffMutationActor(request), async () => ({
      result: null,
      audit: { action: 'CS_HEALTH_SCORING_QUEUED', metadata: { jobId: String(job.id ?? '') } },
      activity: { type: 'health.scoring_queued', subjectType: 'job', subjectId: String(job.id ?? 'customer.health-scoring'), summary: 'Health scoring run queued from the CS console', consoleLink: '/platform/jobs/customer.health-scoring' }
    }));
    return reply.status(202).send({ queued: true, jobId: job.id, name: job.name });
  });

  app.get('/api/internal/success/playbooks', { preHandler: read }, async (_request, reply) => reply.send(await listPlaybooks(app)));

  app.get('/api/internal/success/playbooks/:id', { preHandler: read }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const playbook = await getPlaybook(app, id);
    if (!playbook) return reply.status(404).send({ error: 'PLAYBOOK_NOT_FOUND', message: 'Playbook not found' });
    return reply.send(playbook);
  });

  app.post('/api/internal/success/playbooks', { preHandler: write }, async (request, reply) => {
    const parsed = playbookBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    return reply.status(201).send(await createPlaybook(app, request, parsed.data));
  });

  app.patch('/api/internal/success/playbooks/:id', { preHandler: write }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = playbookPatchBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.send(await patchPlaybook(app, request, id, parsed.data));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.delete('/api/internal/success/playbooks/:id', { preHandler: write }, async (request, reply) => {
    const { id } = request.params as { id: string };
    try {
      return reply.send(await deletePlaybook(app, request, id));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.post('/api/internal/success/playbooks/:id/run', { preHandler: write }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = runBody.safeParse(request.body ?? {});
    if (!parsed.success) return invalid(reply, parsed.error);
    try {
      return reply.status(201).send(await manualRun(app, request, id, parsed.data.tenantId));
    } catch (error) {
      return sendError(reply, error);
    }
  });

  app.get('/api/internal/success/playbooks/:id/runs', { preHandler: read }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return reply.send(await listRuns(app, id));
  });
}
