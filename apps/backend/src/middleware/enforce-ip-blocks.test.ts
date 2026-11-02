import Fastify, { type FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { HAS_TEST_DB, createTestPrisma, uniqueSuffix } from '../test-support/test-db.js';
import {
  IpBlockCache,
  IpBlockHitRecorder,
  loadActiveIpBlocks,
  parseBypassCidrs,
  publishIpBlocksChanged,
  subscribeIpBlockChanges,
  type CachedIpBlock
} from '../services/ip-block-enforcement.service.js';
import { enforceIpBlocks } from './enforce-ip-blocks.js';

// trust.security (WP-5.4, S20): IP blocks are enforced on their scope, stop at expiry without a restart, follow
// changes at once (Redis pub/sub) and never apply to IP_BLOCK_BYPASS_CIDRS.

const noLog = { error: vi.fn(), warn: vi.fn() };

function harness(blocks: CachedIpBlock[], options: { bypass?: string; now?: () => number } = {}) {
  const load = vi.fn(async () => blocks.map((block) => ({ ...block })));
  const cache = new IpBlockCache(load, 60_000, options.now);
  const hits = { record: vi.fn() };
  const app = Fastify();
  app.addHook('onRequest', enforceIpBlocks({ cache, hits, bypass: parseBypassCidrs(options.bypass).list, now: options.now }));
  for (const url of ['/api/internal/tenants', '/api/v1/shipments', '/live', '/ready', '/health', '/api/v1/payments/webhook/stripe', '/api/internal/incidents/webhooks/pagerduty']) {
    app.all(url, async () => ({ ok: true }));
  }
  const from = (ip: string, url: string, method: 'GET' | 'POST' = 'GET') => app.inject({ method, url, headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` } }).then((response) => response.statusCode);
  return { app, load, cache, hits, from };
}

describe('enforceIpBlocks (WP-5.4)', () => {
  it('ACC-IP-1 a blocked IP gets 403 IP_BLOCKED on its scope only; health probes and vendor webhooks stay open', async () => {
    const { app, hits, from } = harness([
      { id: 'b_console', ipAddress: '203.0.113.1', scope: 'CONSOLE', expiresAt: null },
      { id: 'b_tenant', ipAddress: '203.0.113.2', scope: 'TENANT_API', expiresAt: null },
      { id: 'b_all', ipAddress: '203.0.113.3', scope: 'ALL', expiresAt: null }
    ]);
    expect(await from('203.0.113.1', '/api/internal/tenants')).toBe(403);
    expect(await from('203.0.113.1', '/api/v1/shipments')).toBe(200);
    expect(await from('203.0.113.2', '/api/internal/tenants')).toBe(200);
    expect(await from('203.0.113.2', '/api/v1/shipments')).toBe(403);
    expect(await from('203.0.113.3', '/api/internal/tenants')).toBe(403);
    expect(await from('203.0.113.3', '/api/v1/shipments')).toBe(403);
    for (const open of ['/live', '/ready', '/health']) expect(await from('203.0.113.3', open)).toBe(200);
    expect(await from('203.0.113.3', '/api/v1/payments/webhook/stripe', 'POST')).toBe(200);
    expect(await from('203.0.113.3', '/api/internal/incidents/webhooks/pagerduty', 'POST')).toBe(200);
    expect(await from('198.51.100.9', '/api/internal/tenants')).toBe(200);
    // IPv4-mapped IPv6 and Cloudflare's header resolve to the same address.
    expect((await app.inject({ method: 'GET', url: '/api/internal/tenants', headers: { 'cf-connecting-ip': '::ffff:203.0.113.3' } })).json()).toMatchObject({ error: 'IP_BLOCKED' });
    expect(hits.record).toHaveBeenCalledWith('b_all');
    expect(hits.record).toHaveBeenCalledTimes(5);
  });

  it('ACC-IP-2 an expired block stops applying without a restart or reload; a change reloads at once', async () => {
    let clock = Date.UTC(2026, 9, 21, 12, 0, 0);
    const blocks: CachedIpBlock[] = [{ id: 'b_soon', ipAddress: '203.0.113.20', scope: 'ALL', expiresAt: clock + 1_000 }];
    const { load, cache, from } = harness(blocks, { now: () => clock });
    expect(await from('203.0.113.20', '/api/v1/shipments')).toBe(403);
    clock += 2_000;
    expect(await from('203.0.113.20', '/api/v1/shipments')).toBe(200);
    expect(load).toHaveBeenCalledTimes(1);

    blocks.push({ id: 'b_new', ipAddress: '203.0.113.21', scope: 'ALL', expiresAt: null });
    expect(await from('203.0.113.21', '/api/v1/shipments')).toBe(200);
    cache.invalidate();
    expect(await from('203.0.113.21', '/api/v1/shipments')).toBe(403);
    clock += 61_000;
    await from('203.0.113.21', '/api/v1/shipments');
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('ACC-IP-3 an address inside IP_BLOCK_BYPASS_CIDRS is never blocked; invalid entries fail at boot', async () => {
    const { from } = harness([{ id: 'b_office', ipAddress: '10.1.2.3', scope: 'ALL', expiresAt: null }, { id: 'b_v6', ipAddress: '2001:db8::5', scope: 'ALL', expiresAt: null }], { bypass: '10.1.0.0/16, 2001:db8::/32' });
    expect(await from('10.1.2.3', '/api/internal/tenants')).toBe(200);
    expect(await from('2001:db8::5', '/api/v1/shipments')).toBe(200);
    expect(() => parseBypassCidrs('10.0.0.0/33')).toThrow(/invalid prefix/);
    expect(() => parseBypassCidrs('office-vpn')).toThrow(/not an IP address/);
    expect(parseBypassCidrs('').count).toBe(0);
  });

  it('a block list that cannot be read lets the request through (an unreachable database must not lock staff out)', async () => {
    const load = vi.fn(async (): Promise<CachedIpBlock[]> => Promise.reject(new Error('database unavailable')));
    const app = Fastify();
    app.addHook('onRequest', enforceIpBlocks({ cache: new IpBlockCache(load), hits: { record: vi.fn() }, bypass: parseBypassCidrs('').list }));
    app.get('/api/internal/tenants', async () => ({ ok: true }));
    expect((await app.inject({ method: 'GET', url: '/api/internal/tenants' })).statusCode).toBe(200);
    expect(load).toHaveBeenCalled();
  });
});

describe.runIf(HAS_TEST_DB)('IP block enforcement (WP-5.4, real Postgres)', () => {
  let prisma: PrismaClient;
  let app: FastifyInstance;
  let hits: IpBlockHitRecorder;
  const octet = () => Math.floor(Math.random() * 200) + 20;
  const active = `192.0.2.${octet()}`;
  const expired = `198.18.${octet()}.${octet()}`;

  beforeAll(async () => {
    prisma = createTestPrisma();
    await prisma.ipBlock.deleteMany({ where: { ipAddress: { in: [active, expired] } } });
    await prisma.ipBlock.create({ data: { ipAddress: active, scope: 'ALL', reason: `ACC-IP real ${uniqueSuffix()}`, createdBy: 'test' } });
    await prisma.ipBlock.create({ data: { ipAddress: expired, scope: 'ALL', reason: `ACC-IP expired ${uniqueSuffix()}`, createdBy: 'test', expiresAt: new Date(Date.now() - 60_000) } });
    hits = new IpBlockHitRecorder(prisma, noLog, 60_000);
    app = Fastify();
    app.addHook('onRequest', enforceIpBlocks({ cache: new IpBlockCache(loadActiveIpBlocks(prisma)), hits, bypass: parseBypassCidrs('').list }));
    app.get('/api/v1/shipments', async () => ({ ok: true }));
  });

  afterAll(async () => {
    await prisma?.ipBlock.deleteMany({ where: { ipAddress: { in: [active, expired] } } });
    await app?.close();
    await prisma?.$disconnect();
  });

  it('ACC-IP-1 blocks from Postgres apply, an expired row does not, and hits are counted asynchronously in one write', async () => {
    const request = (ip: string) => app.inject({ method: 'GET', url: '/api/v1/shipments', headers: { 'x-forwarded-for': ip } }).then((response) => response.statusCode);
    expect(await request(active)).toBe(403);
    expect(await request(active)).toBe(403);
    expect(await request(expired)).toBe(200);
    await hits.flush();
    const row = await prisma.ipBlock.findUniqueOrThrow({ where: { ipAddress: active } });
    expect(row.hitCount).toBe(2);
    expect(row.lastHitAt).toBeInstanceOf(Date);
  });
});

describe.runIf(process.env.TEST_REDIS_URL)('IP block change announcements (WP-5.4, real Redis)', () => {
  it('ACC-IP-2 a published change invalidates every subscribed cache', async () => {
    const redis = new Redis(process.env.TEST_REDIS_URL!);
    const cache = new IpBlockCache(async () => []);
    const invalidate = vi.spyOn(cache, 'invalidate');
    const unsubscribe = subscribeIpBlockChanges(redis, cache, noLog);
    try {
      await new Promise((resolve) => setTimeout(resolve, 300));
      publishIpBlocksChanged(redis, noLog);
      await vi.waitFor(() => expect(invalidate).toHaveBeenCalled(), { timeout: 5_000 });
    } finally {
      await unsubscribe();
      await redis.quit();
    }
  });
});
