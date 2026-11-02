import { BlockList, isIP } from 'node:net';
import type { FastifyBaseLogger, FastifyInstance } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import { normalizeIp } from '../shared/client-ip.js';

// trust.security (WP-5.4, S20): IP blocks are enforced. Each process keeps the active blocks in memory for at most
// IP_BLOCK_CACHE_TTL_MS; every change (console create/remove, anomaly auto-block) is announced on Redis so every
// process reloads at once. Expiry is checked per request, so an expired block stops applying without a reload.

export const IP_BLOCKS_CHANGED_CHANNEL = 'fauward:trust.security:ip-blocks-changed';
export const IP_BLOCK_CACHE_TTL_MS = 60_000;
export const IP_BLOCK_HIT_FLUSH_MS = 5_000;

export type IpScope = 'ALL' | 'CONSOLE' | 'TENANT_API';
export type CachedIpBlock = { id: string; ipAddress: string; scope: string; expiresAt: number | null };

type Clock = () => number;
type Log = Pick<FastifyBaseLogger, 'error' | 'warn'>;

export class IpBlockCache {
  private entries: CachedIpBlock[] | null = null;
  private loadedAt = 0;
  private inflight: Promise<CachedIpBlock[]> | null = null;

  constructor(
    private readonly load: () => Promise<CachedIpBlock[]>,
    private readonly ttlMs = IP_BLOCK_CACHE_TTL_MS,
    private readonly now: Clock = Date.now
  ) {}

  async get() {
    if (this.entries && this.now() - this.loadedAt < this.ttlMs) return this.entries;
    if (!this.inflight) {
      this.inflight = this.load()
        .then((entries) => {
          this.entries = entries;
          this.loadedAt = this.now();
          return entries;
        })
        .finally(() => {
          this.inflight = null;
        });
    }
    return this.inflight;
  }

  invalidate() {
    this.entries = null;
  }
}

export function loadActiveIpBlocks(prisma: Pick<PrismaClient, 'ipBlock'>, now: Clock = Date.now) {
  return async (): Promise<CachedIpBlock[]> => {
    const rows = await prisma.ipBlock.findMany({
      where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date(now()) } }] },
      select: { id: true, ipAddress: true, scope: true, expiresAt: true }
    });
    return rows.map((row) => ({ id: row.id, ipAddress: normalizeIp(row.ipAddress), scope: row.scope, expiresAt: row.expiresAt?.getTime() ?? null }));
  };
}

/** `IP_BLOCK_BYPASS_CIDRS`: comma-separated addresses or CIDRs (office, VPN) that are never blocked. Invalid → boot error. */
export function parseBypassCidrs(raw: string | undefined) {
  const list = new BlockList();
  const entries = (raw ?? '').split(',').map((value) => value.trim()).filter(Boolean);
  for (const entry of entries) {
    const [address, prefix] = entry.split('/');
    const family = isIP(address);
    if (family === 0) throw new Error(`IP_BLOCK_BYPASS_CIDRS: "${entry}" is not an IP address or CIDR`);
    const type = family === 4 ? 'ipv4' : 'ipv6';
    if (prefix === undefined) {
      list.addAddress(address, type);
      continue;
    }
    const bits = Number(prefix);
    if (!Number.isInteger(bits) || bits < 0 || bits > (family === 4 ? 32 : 128)) throw new Error(`IP_BLOCK_BYPASS_CIDRS: "${entry}" has an invalid prefix length`);
    list.addSubnet(address, bits, type);
  }
  return { list, count: entries.length };
}

export function isBypassed(bypass: BlockList, ip: string) {
  const family = isIP(ip);
  if (family === 0) return false;
  return bypass.check(ip, family === 4 ? 'ipv4' : 'ipv6');
}

/** The block that applies to `ip` on this surface right now, if any. */
export function matchIpBlock(blocks: CachedIpBlock[], ip: string, surface: Exclude<IpScope, 'ALL'>, now: number) {
  return blocks.find((block) => block.ipAddress === ip && (block.scope === 'ALL' || block.scope === surface) && (block.expiresAt === null || block.expiresAt > now)) ?? null;
}

/** Counts hits in memory and writes them at most every IP_BLOCK_HIT_FLUSH_MS, so a flood of blocked requests is one update. */
export class IpBlockHitRecorder {
  private pending = new Map<string, { count: number; lastHitAt: Date }>();
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: Pick<PrismaClient, 'ipBlock'>,
    private readonly log: Log,
    private readonly flushMs = IP_BLOCK_HIT_FLUSH_MS
  ) {}

  record(id: string, at = new Date()) {
    const entry = this.pending.get(id);
    this.pending.set(id, { count: (entry?.count ?? 0) + 1, lastHitAt: at });
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.flush().catch((err: unknown) => this.log.error({ err }, 'Failed to record IP block hits'));
      }, this.flushMs);
      this.timer.unref();
    }
  }

  async flush() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const batch = [...this.pending.entries()];
    this.pending.clear();
    await Promise.all(
      batch.map(([id, hit]) => this.prisma.ipBlock.updateMany({ where: { id }, data: { hitCount: { increment: hit.count }, lastHitAt: hit.lastHitAt } }))
    );
  }
}

/** Tells every process to reload its blocks. Never throws: the 60 s TTL is the fallback. */
export function publishIpBlocksChanged(redis: Pick<Redis, 'publish'> | undefined, log: Log) {
  if (!redis || typeof redis.publish !== 'function') return;
  redis.publish(IP_BLOCKS_CHANGED_CHANNEL, String(Date.now())).catch((err: unknown) => log.warn({ err }, 'Failed to announce an IP block change'));
}

/** Subscribes this process's cache to block changes; returns a closer. Without a duplicable Redis the TTL applies alone. */
export function subscribeIpBlockChanges(redis: Pick<Redis, 'duplicate'> | undefined, cache: IpBlockCache, log: Log) {
  if (!redis || typeof redis.duplicate !== 'function') return async () => undefined;
  const subscriber = redis.duplicate();
  subscriber.on('message', (channel: string) => {
    if (channel === IP_BLOCKS_CHANGED_CHANNEL) cache.invalidate();
  });
  subscriber.on('error', (err: unknown) => log.warn({ err }, 'IP block change subscriber error'));
  subscriber.subscribe(IP_BLOCKS_CHANGED_CHANNEL).catch((err: unknown) => log.error({ err }, 'Failed to subscribe to IP block changes'));
  return async () => {
    await subscriber.quit().catch(() => undefined);
  };
}

/**
 * Anomaly-scan auto-blocks: scope ALL, expire after `ttlMs` (the rule's 24 h), never an address in the bypass list, and never
 * shorten a block staff placed (a permanent block, or one that already lasts longer, is left as it is).
 */
export async function autoBlockIps(app: Pick<FastifyInstance, 'prisma' | 'redis' | 'log'>, ips: string[], input: { reason: string; createdBy: string; bypass: BlockList; ttlMs: number; now?: Date }) {
  const now = input.now ?? new Date();
  const expiresAt = new Date(now.getTime() + input.ttlMs);
  let blocked = 0;
  let skippedBypass = 0;
  for (const raw of ips) {
    const ip = normalizeIp(raw);
    if (isBypassed(input.bypass, ip)) {
      skippedBypass += 1;
      continue;
    }
    const existing = await app.prisma.ipBlock.findUnique({ where: { ipAddress: ip }, select: { id: true, expiresAt: true, createdBy: true } });
    if (!existing) {
      await app.prisma.ipBlock.create({ data: { ipAddress: ip, scope: 'ALL', reason: input.reason, expiresAt, createdBy: input.createdBy } });
      blocked += 1;
      continue;
    }
    const active = !existing.expiresAt || existing.expiresAt > now;
    if (active && existing.createdBy !== input.createdBy) continue;
    if (!active || (existing.expiresAt && existing.expiresAt < expiresAt)) {
      await app.prisma.ipBlock.update({ where: { id: existing.id }, data: { scope: 'ALL', expiresAt, reason: input.reason, createdBy: input.createdBy } });
      blocked += 1;
    }
  }
  if (blocked > 0) publishIpBlocksChanged(app.redis, app.log);
  return { blocked, skippedBypass };
}
