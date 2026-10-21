import type { BlockList } from 'node:net';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { isVendorWebhookPath, requestPath } from '../config/vendor-webhooks.js';
import { clientIp } from '../shared/client-ip.js';
import {
  IpBlockCache,
  IpBlockHitRecorder,
  isBypassed,
  loadActiveIpBlocks,
  matchIpBlock,
  parseBypassCidrs,
  subscribeIpBlockChanges
} from '../services/ip-block-enforcement.service.js';

// trust.security (WP-5.4, S20): an active block answers 403 IP_BLOCKED on its scope — CONSOLE = /api/internal/*,
// TENANT_API = everything else, ALL = both. Health probes and signature-verified vendor webhooks are never blocked,
// nor is any address in IP_BLOCK_BYPASS_CIDRS. If the block list cannot be read the request goes through (logged):
// an unreachable database must not lock everyone out of the console that would fix it.

const EXEMPT_PATHS = new Set(['/live', '/ready', '/health']);

type Options = { cache: IpBlockCache; hits: Pick<IpBlockHitRecorder, 'record'>; bypass: BlockList; now?: () => number };

export function enforceIpBlocks(options: Options) {
  const now = options.now ?? Date.now;
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const path = requestPath(request.url);
    if (EXEMPT_PATHS.has(path) || isVendorWebhookPath(path)) return;
    const ip = clientIp(request);
    if (isBypassed(options.bypass, ip)) return;
    let blocks;
    try {
      blocks = await options.cache.get();
    } catch (err) {
      request.log.error({ err }, 'IP block list unavailable; request not checked');
      return;
    }
    const block = matchIpBlock(blocks, ip, path.startsWith('/api/internal/') ? 'CONSOLE' : 'TENANT_API', now());
    if (!block) return;
    options.hits.record(block.id);
    return reply.status(403).send({ error: 'IP_BLOCKED', message: 'Requests from this address are blocked.' });
  };
}

/** app.ts: one cache and hit recorder per process, invalidated by Redis pub/sub; hits are flushed on close. */
export function registerIpBlockEnforcement(app: FastifyInstance, bypassCidrs: string) {
  const { list } = parseBypassCidrs(bypassCidrs);
  const cache = new IpBlockCache(loadActiveIpBlocks(app.prisma));
  const hits = new IpBlockHitRecorder(app.prisma, app.log);
  const unsubscribe = subscribeIpBlockChanges(app.redis, cache, app.log);
  app.addHook('onRequest', enforceIpBlocks({ cache, hits, bypass: list }));
  app.addHook('onClose', async () => {
    await hits.flush().catch((err: unknown) => app.log.error({ err }, 'Failed to record IP block hits'));
    await unsubscribe();
  });
}
