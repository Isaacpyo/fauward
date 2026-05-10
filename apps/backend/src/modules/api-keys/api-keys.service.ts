import { randomBytes, createHash } from 'crypto';
import type { PrismaClient } from '@prisma/client';

export function generateApiKey() {
  const raw = `fw_${randomBytes(24).toString('hex')}`;
  const prefix = raw.slice(0, 8);
  const hash = createHash('sha256').update(raw).digest('hex');
  return { raw, prefix, hash };
}

export const apiKeyService = {
  async create(
    prisma: PrismaClient,
    tenantId: string,
    data: { name?: string; scopes?: string[]; isSandbox?: boolean } = {}
  ) {
    const { raw, prefix, hash } = generateApiKey();
    const key = await prisma.apiKey.create({
      data: {
        tenantId,
        name: data.name?.trim() || null,
        keyHash: hash,
        keyPrefix: prefix,
        scopes: data.scopes?.length ? data.scopes : ['shipments:read', 'rates:read'],
        isSandbox: data.isSandbox ?? false,
        rateLimit: 500,
        isActive: true
      }
    });
    return { key: raw, record: key };
  },
  async list(prisma: PrismaClient, tenantId: string) {
    return prisma.apiKey.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' }
    });
  },
  async revoke(prisma: PrismaClient, tenantId: string, id: string) {
    return prisma.apiKey.update({
      where: { id, tenantId },
      data: { isActive: false }
    });
  },
  async usage(prisma: PrismaClient, tenantId: string) {
    const dayKey = (value: Date) => value.toISOString().slice(0, 10);
    const [keys, usageRecords] = await Promise.all([
      prisma.apiKey.findMany({
        where: { tenantId },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          scopes: true,
          isSandbox: true,
          lastUsedAt: true,
          monthlyRequestCount: true,
          isActive: true
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.usageRecord.findMany({
        where: { tenantId },
        orderBy: { updatedAt: 'desc' },
        take: 12
      })
    ]);

    const apiUsageEvents = (prisma as any).apiUsageRecord?.findMany
      ? await (prisma as any).apiUsageRecord.findMany({
          where: { tenantId },
          include: { apiKey: { select: { id: true, name: true, keyPrefix: true } } },
          orderBy: { timestamp: 'desc' },
          take: 5_000
        })
      : [];

    const grouped = new Map<string, {
      keyId: string;
      keyName: string | null;
      endpoint: string;
      method: string;
      date: string;
      requestCount: number;
      errorCount: number;
      totalLatencyMs: number;
    }>();

    for (const event of apiUsageEvents) {
      const date = dayKey(event.timestamp);
      const key = `${event.apiKeyId}:${event.endpoint}:${event.method}:${date}`;
      const current = grouped.get(key) ?? {
        keyId: event.apiKeyId,
        keyName: event.apiKey?.name ?? event.apiKey?.keyPrefix ?? null,
        endpoint: event.endpoint,
        method: event.method,
        date,
        requestCount: 0,
        errorCount: 0,
        totalLatencyMs: 0
      };
      current.requestCount += 1;
      if (event.statusCode >= 400) current.errorCount += 1;
      current.totalLatencyMs += event.latencyMs;
      grouped.set(key, current);
    }

    return {
      keys,
      usageRecords,
      breakdown: Array.from(grouped.values())
        .map((row) => ({
          keyId: row.keyId,
          keyName: row.keyName,
          endpoint: row.endpoint,
          method: row.method,
          date: row.date,
          requestCount: row.requestCount,
          errorCount: row.errorCount,
          avgLatencyMs: row.requestCount > 0 ? Math.round(row.totalLatencyMs / row.requestCount) : 0
        }))
        .sort((a, b) => b.date.localeCompare(a.date) || a.endpoint.localeCompare(b.endpoint)),
      totalMonthlyRequests: keys.reduce((sum, key) => sum + key.monthlyRequestCount, 0)
    };
  }
};
