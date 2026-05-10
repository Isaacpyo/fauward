import crypto from 'crypto';
import type { Prisma, PrismaClient } from '@prisma/client';

type PlatformAuditInput = {
  actorType: 'PLATFORM_USER' | 'TENANT_USER' | 'SYSTEM';
  actorId: string;
  actorEmail?: string | null;
  action: string;
  targetTenantId?: string | null;
  targetUserId?: string | null;
  impersonationSessionId?: string | null;
  reason?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
};

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(',')}}`;
}

export function computePlatformAuditHash(fields: Record<string, unknown>, previousHash: string | null) {
  return crypto
    .createHash('sha256')
    .update(stableSerialize({ ...fields, previousHash }))
    .digest('hex');
}

export async function writePlatformAuditLog(prisma: PrismaClient, input: PlatformAuditInput) {
  const previous = await prisma.platformAuditLog.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { hash: true }
  });

  const fields = {
    actorType: input.actorType,
    actorId: input.actorId,
    actorEmail: input.actorEmail ?? null,
    action: input.action,
    targetTenantId: input.targetTenantId ?? null,
    targetUserId: input.targetUserId ?? null,
    impersonationSessionId: input.impersonationSessionId ?? null,
    reason: input.reason ?? null,
    metadata: input.metadata ?? {},
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ?? null
  };
  const previousHash = previous?.hash ?? null;
  const hash = computePlatformAuditHash(fields, previousHash);

  return prisma.platformAuditLog.create({
    data: {
      ...fields,
      metadata: fields.metadata,
      previousHash,
      hash
    }
  });
}

export async function verifyPlatformAuditChain(prisma: PrismaClient) {
  const rows = await prisma.platformAuditLog.findMany({ orderBy: { createdAt: 'asc' } });
  let previousHash: string | null = null;

  for (const row of rows) {
    const hash = computePlatformAuditHash(
      {
        actorType: row.actorType,
        actorId: row.actorId,
        actorEmail: row.actorEmail,
        action: row.action,
        targetTenantId: row.targetTenantId,
        targetUserId: row.targetUserId,
        impersonationSessionId: row.impersonationSessionId,
        reason: row.reason,
        metadata: row.metadata,
        ipAddress: row.ipAddress,
        userAgent: row.userAgent
      },
      previousHash
    );

    if (row.previousHash !== previousHash || row.hash !== hash) {
      return { ok: false, failedAt: row.id };
    }
    previousHash = row.hash;
  }

  return { ok: true, checked: rows.length };
}
