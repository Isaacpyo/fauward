import type { ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import type { PlatformActivity, Prisma } from '@prisma/client';
import { z } from 'zod';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { loadConsoleContext, type ConsoleRequestContext } from '../../../middleware/require-console-permission.js';
import { consolePermissionContext } from '../../../services/staff-iam.service.js';
import { ActivityStreamHub } from '../../../services/activity-stream.hub.js';
import { canSeeService, presentActivity, visibleServices, type TenantLabel } from '../../../services/activity-visibility.js';
import { serviceReadPermission } from '@fauward/internal-rbac';

// Console activity read side (D7, WP-2.1). Session-only routes (architecture §4 allowlist): every row is filtered by the
// caller's own service permissions, so the same endpoint serves every role without leaking another service's events.

export const ACTIVITY_HEARTBEAT_MS = 25_000;
const PERMISSION_REFRESH_MS = 60_000;

const listQuery = z.object({
  tenantId: z.string().min(1).optional(),
  service: z.string().min(1).optional(),
  /** WP-3.5 dashboard feed: every visible service of one pillar. */
  pillar: z.enum(['platform', 'revenue', 'customer', 'trust', 'gtm']).optional(),
  severity: z.enum(['INFO', 'ATTENTION', 'CRITICAL']).optional(),
  type: z.string().min(1).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().uuid().optional()
});

const summaryQuery = z.object({ tenantId: z.string().min(1).optional() });
const streamQuery = z.object({ tenantId: z.string().min(1).optional(), service: z.string().min(1).optional() });

const hubs = new WeakMap<FastifyInstance, ActivityStreamHub>();

function hubFor(app: FastifyInstance) {
  let hub = hubs.get(app);
  if (!hub) {
    hub = new ActivityStreamHub({ redis: app.redis, prisma: app.prisma, log: app.log });
    hubs.set(app, hub);
  }
  return hub;
}

async function tenantLabels(app: FastifyInstance, rows: Array<Pick<PlatformActivity, 'tenantId'>>) {
  const ids = [...new Set(rows.flatMap((row) => (row.tenantId ? [row.tenantId] : [])))];
  if (ids.length === 0) return new Map<string, TenantLabel>();
  const tenants = await app.prisma.tenant.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true } });
  return new Map(tenants.map((tenant) => [tenant.id, tenant]));
}

/** Shared by the cross-tenant list and Customer 360's Activity tab. */
export async function listActivity(app: FastifyInstance, context: ConsoleRequestContext, query: z.infer<typeof listQuery>) {
  const visible = query.service ? (canSeeService(context, query.service) ? [query.service] : []) : visibleServices(context);
  const services = query.pillar ? visible.filter((service) => service.startsWith(`${query.pillar}.`)) : visible;
  const where: Prisma.PlatformActivityWhereInput = {
    service: { in: services },
    ...(query.tenantId ? { tenantId: query.tenantId } : {}),
    ...(query.severity ? { severity: query.severity } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.from || query.to ? { occurredAt: { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) } } : {})
  };
  const rows = await app.prisma.platformActivity.findMany({
    where,
    orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
  });
  const hasMore = rows.length > query.limit;
  const page = hasMore ? rows.slice(0, query.limit) : rows;
  const tenants = await tenantLabels(app, page);
  return { data: page.map((row) => presentActivity(row, tenants)), nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null };
}

export { listQuery as activityListQuery };

function sseWrite(response: ServerResponse, chunk: string) {
  if (!response.writableEnded && !response.destroyed) response.write(chunk);
}

/** setTimeout overflows above 2^31-1 ms and would fire at once. */
const MAX_TIMER_MS = 2_147_483_647;

export async function registerConsoleActivityRoutes(app: FastifyInstance) {
  app.get('/api/internal/activity', { preHandler: [authenticatePlatformSession] }, async (request, reply) => {
    const parsed = listQuery.safeParse(request.query ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_QUERY', message: parsed.error.issues[0]?.message });
    const context = await loadConsoleContext(request);
    if (parsed.data.service && !canSeeService(context, parsed.data.service)) {
      return reply.status(403).send({ error: 'Forbidden', permission: serviceReadPermission(parsed.data.service) });
    }
    return reply.send(await listActivity(app, context, parsed.data));
  });

  // "Last activity" per service (ServiceHeader, pillar overviews): the latest occurredAt the caller may see.
  app.get('/api/internal/activity/summary', { preHandler: [authenticatePlatformSession] }, async (request, reply) => {
    const parsed = summaryQuery.safeParse(request.query ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_QUERY', message: parsed.error.issues[0]?.message });
    const context = await loadConsoleContext(request);
    const services = visibleServices(context);
    const scope = { service: { in: services }, ...(parsed.data.tenantId ? { tenantId: parsed.data.tenantId } : {}) };
    const [groups, alerts] = await Promise.all([
      app.prisma.platformActivity.groupBy({ by: ['service'], where: scope, _max: { occurredAt: true }, _count: { _all: true } }),
      // WP-3.1: pillar alert counts = ATTENTION/CRITICAL activity in the last 24 h.
      app.prisma.platformActivity.groupBy({
        by: ['service'],
        where: { ...scope, severity: { in: ['ATTENTION', 'CRITICAL'] }, occurredAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
        _max: { occurredAt: true },
        _count: { _all: true }
      })
    ]);
    const alertsByService = new Map(alerts.map((group) => [group.service, group._count._all]));
    return reply.send({
      services: groups
        .map((group) => ({ service: group.service, lastOccurredAt: group._max.occurredAt?.toISOString() ?? null, count: group._count._all, alerts24h: alertsByService.get(group.service) ?? 0 }))
        .sort((a, b) => a.service.localeCompare(b.service))
    });
  });

  // SSE on the console cookie session. Events are filtered per connection with the caller's permissions (refreshed every
  // minute so a revoked or expired JIT grant stops the flow); a comment heartbeat keeps proxies from timing out; the
  // stream ends when the access token or the session expires and the client reconnects after refreshing.
  app.get('/api/internal/activity/stream', { preHandler: [authenticatePlatformSession] }, async (request, reply) => {
    const parsed = streamQuery.safeParse(request.query ?? {});
    if (!parsed.success) return reply.status(400).send({ error: 'INVALID_QUERY', message: parsed.error.issues[0]?.message });
    const filters = parsed.data;
    let context = await loadConsoleContext(request);
    if (filters.service && !canSeeService(context, filters.service)) {
      return reply.status(403).send({ error: 'Forbidden', permission: serviceReadPermission(filters.service) });
    }
    const platform = request.platform!;
    const tokenExpiresAt = typeof platform.claims.exp === 'number' ? platform.claims.exp * 1000 : Number.POSITIVE_INFINITY;
    const closesAt = Math.min(tokenExpiresAt, platform.session.expiresAt.getTime());

    reply.hijack();
    // The headers Fastify already set (CORS, helmet) go out with the raw head: the console on admin.fauward.com opens
    // this stream cross-origin on api.fauward.com, and EventSource needs Access-Control-Allow-Origin/-Credentials.
    for (const [name, value] of Object.entries(reply.getHeaders())) {
      if (value !== undefined) reply.raw.setHeader(name, value);
    }
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    sseWrite(reply.raw, `retry: 5000\nevent: ready\ndata: ${JSON.stringify({ closesAt: new Date(closesAt).toISOString() })}\n\n`);

    const hub = hubFor(app);
    const unsubscribe = hub.subscribe((row) => {
      if (filters.tenantId && row.tenantId !== filters.tenantId) return;
      if (filters.service && row.service !== filters.service) return;
      if (!canSeeService(context, row.service)) return;
      tenantLabels(app, [row])
        .then((tenants) => sseWrite(reply.raw, `id: ${row.id}\nevent: activity\ndata: ${JSON.stringify(presentActivity(row, tenants))}\n\n`))
        .catch((err: unknown) => request.log.error({ err, activityId: row.id }, 'Failed to stream console activity'));
    });

    const heartbeat = setInterval(() => sseWrite(reply.raw, `: heartbeat ${new Date().toISOString()}\n\n`), ACTIVITY_HEARTBEAT_MS);
    const refresh = setInterval(() => {
      consolePermissionContext(app.prisma, platform.user)
        .then((next) => {
          context = next;
        })
        .catch((err: unknown) => request.log.warn({ err }, 'Failed to refresh activity stream permissions'));
    }, PERMISSION_REFRESH_MS);
    const expiry = setTimeout(() => {
      sseWrite(reply.raw, `event: expired\ndata: {}\n\n`);
      reply.raw.end();
    }, Math.min(MAX_TIMER_MS, Math.max(0, closesAt - Date.now())));

    let closed = false;
    const cleanup = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      clearInterval(refresh);
      clearTimeout(expiry);
      unsubscribe();
    };
    request.raw.on('close', cleanup);
    reply.raw.on('close', cleanup);
  });
}

export { hubFor as activityHubFor };
