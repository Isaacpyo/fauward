import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requireConsolePermission } from '../../../middleware/require-console-permission.js';
import { dangerous } from '../../../middleware/dangerous.js';
import { FeatureOverrideError, consoleOverrideActor } from '../../../services/feature-override.service.js';
import { createOverrideWithMirror, findFlag, flagCatalogue, isOverrideActive, mirrorStatusByOverride, revokeOverrideWithMirror } from '../../../services/feature-flags.service.js';
import { vendorStatus } from '../../../services/vendors/index.js';
import { githubAdapter } from '../../../services/vendors/github.adapter.js';
import { reasonOf } from '../request-meta.js';

// platform.flags (WP-4.1): flag catalogue (planService feature keys + config/flags.ts runtime flags), native per-tenant
// overrides with an optional LaunchDarkly mirror, the flag's audit trail, and releases (GitHub or local build info).

const read = [authenticatePlatformSession, requireConsolePermission('platform.flags.read')];

const overrideBody = z.object({
  tenantId: z.string().min(1, 'tenantId is required'),
  enabled: z.boolean({ required_error: 'enabled must be true or false', invalid_type_error: 'enabled must be true or false' }),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  reason: z.string()
});
const auditQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().uuid().optional() });

function sendOverrideError(reply: FastifyReply, error: unknown) {
  if (error instanceof FeatureOverrideError) return reply.status(error.statusCode).send({ error: error.code, message: error.message });
  throw error;
}

export async function registerConsoleFlagRoutes(app: FastifyInstance) {
  app.get('/api/internal/flags', { preHandler: read }, async (_request, reply) => {
    const now = new Date();
    const active = await app.prisma.tenantFeatureOverride.groupBy({
      by: ['featureKey', 'enabled'],
      where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      _count: { _all: true }
    });
    const counts = new Map<string, { enabled: number; disabled: number }>();
    for (const row of active) {
      const entry = counts.get(row.featureKey) ?? { enabled: 0, disabled: 0 };
      if (row.enabled) entry.enabled += row._count._all;
      else entry.disabled += row._count._all;
      counts.set(row.featureKey, entry);
    }
    return reply.send({
      data: flagCatalogue().map((flag) => {
        const entry = counts.get(flag.key) ?? { enabled: 0, disabled: 0 };
        return { ...flag, activeOverrides: entry.enabled + entry.disabled, enabledOverrides: entry.enabled, disabledOverrides: entry.disabled };
      }),
      launchDarkly: vendorStatus('launchdarkly') ?? { vendor: 'launchdarkly', configured: true, missing: [] }
    });
  });

  app.get('/api/internal/flags/:key', { preHandler: read }, async (request, reply) => {
    const { key } = request.params as { key: string };
    const flag = findFlag(key);
    if (!flag) return reply.status(404).send({ error: 'FLAG_NOT_FOUND', message: `No flag named ${key}` });
    const rows = await app.prisma.tenantFeatureOverride.findMany({
      where: { featureKey: key },
      include: { tenant: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    const actorIds = [...new Set(rows.flatMap((row) => [row.createdByPlatformUserId, row.revokedByPlatformUserId]).filter((id): id is string => Boolean(id)))];
    const [actors, mirrors] = await Promise.all([
      actorIds.length ? app.prisma.platformUser.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true, name: true } }) : Promise.resolve([]),
      mirrorStatusByOverride(app.prisma, rows.map((row) => row.id))
    ]);
    const actorById = new Map(actors.map((actor) => [actor.id, actor]));
    const now = new Date();
    return reply.send({
      flag,
      launchDarkly: vendorStatus('launchdarkly') ?? { vendor: 'launchdarkly', configured: true, missing: [] },
      overrides: rows.map((row) => ({
        id: row.id,
        tenant: row.tenant,
        enabled: row.enabled,
        reason: row.reason,
        expiresAt: row.expiresAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        createdBy: actorById.get(row.createdByPlatformUserId) ?? { id: row.createdByPlatformUserId, email: null, name: null },
        revokedAt: row.revokedAt?.toISOString() ?? null,
        revokedBy: row.revokedByPlatformUserId ? actorById.get(row.revokedByPlatformUserId) ?? { id: row.revokedByPlatformUserId, email: null, name: null } : null,
        active: isOverrideActive(row, now),
        mirror: mirrors.get(row.id) ?? null
      }))
    });
  });

  app.post('/api/internal/flags/:key/overrides', { preHandler: dangerous('platform.flags.write') }, async (request, reply) => {
    const { key } = request.params as { key: string };
    const flag = findFlag(key);
    if (!flag) return reply.status(404).send({ error: 'FLAG_NOT_FOUND', message: `No flag named ${key}` });
    if (flag.kind !== 'plan-feature') return reply.status(400).send({ error: 'RUNTIME_FLAG', message: 'Runtime flags have no per-tenant override; change them where they are evaluated.' });
    const parsed = overrideBody.safeParse(request.body ?? {});
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const code = issue?.path[0] === 'tenantId' ? 'TENANT_REQUIRED' : issue?.path[0] === 'enabled' ? 'ENABLED_REQUIRED' : issue?.path[0] === 'expiresAt' ? 'INVALID_EXPIRY' : 'INVALID_BODY';
      return reply.status(400).send({ error: code, message: issue?.message });
    }
    try {
      const result = await createOverrideWithMirror(app, {
        tenantId: parsed.data.tenantId,
        featureKey: key,
        enabled: parsed.data.enabled,
        reason: reasonOf(request) ?? '',
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
        actor: consoleOverrideActor(request)
      });
      return reply.status(201).send(result);
    } catch (error) {
      return sendOverrideError(reply, error);
    }
  });

  app.delete('/api/internal/flags/:key/overrides/:id', { preHandler: dangerous('platform.flags.write') }, async (request, reply) => {
    const { key, id } = request.params as { key: string; id: string };
    const existing = await app.prisma.tenantFeatureOverride.findFirst({ where: { id, featureKey: key }, select: { tenantId: true } });
    if (!existing) return reply.status(404).send({ error: 'OVERRIDE_NOT_FOUND', message: 'Feature override not found' });
    try {
      const result = await revokeOverrideWithMirror(app, { tenantId: existing.tenantId, overrideId: id, featureKey: key, reason: reasonOf(request) ?? '', actor: consoleOverrideActor(request) });
      return reply.send(result);
    } catch (error) {
      return sendOverrideError(reply, error);
    }
  });

  app.get('/api/internal/flags/:key/audit', { preHandler: read }, async (request, reply) => {
    const { key } = request.params as { key: string };
    if (!findFlag(key)) return reply.status(404).send({ error: 'FLAG_NOT_FOUND', message: `No flag named ${key}` });
    const parsed = auditQuery.safeParse(request.query ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_QUERY', message: parsed.error.issues[0]?.message });
    const rows = await app.prisma.platformAuditLog.findMany({
      where: { action: { in: ['TENANT_FEATURE_OVERRIDE', 'TENANT_FEATURE_OVERRIDE_REVOKED'] }, metadata: { path: ['featureKey'], equals: key } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: parsed.data.limit + 1,
      ...(parsed.data.cursor ? { cursor: { id: parsed.data.cursor }, skip: 1 } : {})
    });
    const hasMore = rows.length > parsed.data.limit;
    const page = hasMore ? rows.slice(0, parsed.data.limit) : rows;
    const tenantIds = [...new Set(page.map((row) => row.targetTenantId).filter((id): id is string => Boolean(id)))];
    const tenants = tenantIds.length ? await app.prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, name: true, slug: true } }) : [];
    const tenantById = new Map(tenants.map((tenant) => [tenant.id, tenant]));
    return reply.send({
      data: page.map((row) => ({
        id: row.id,
        action: row.action,
        actorEmail: row.actorEmail,
        actorId: row.actorId,
        tenant: row.targetTenantId ? tenantById.get(row.targetTenantId) ?? { id: row.targetTenantId, name: null, slug: null } : null,
        reason: row.reason,
        metadata: row.metadata,
        createdAt: row.createdAt.toISOString()
      })),
      nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null
    });
  });

  app.get('/api/internal/releases', { preHandler: read }, async (_request, reply) => {
    const backend = { version: process.env.APP_VERSION?.trim() || null, commit: process.env.GIT_COMMIT?.trim() || null };
    if (!githubAdapter.isConfigured()) {
      return reply.send({ source: 'local', backend, releases: [], github: vendorStatus('github') });
    }
    const releases = await githubAdapter.listReleases(20);
    return reply.send({ source: 'github', backend, releases, github: null });
  });
}
