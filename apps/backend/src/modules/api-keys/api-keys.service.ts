import { randomBytes, createHash } from 'crypto';
import type { PrismaClient } from '@prisma/client';

export function generateApiKey() {
  const raw = `fw_${randomBytes(24).toString('hex')}`;
  const prefix = raw.slice(0, 8);
  const hash = createHash('sha256').update(raw).digest('hex');
  return { raw, prefix, hash };
}

export const apiKeyService = {
  async create(prisma: PrismaClient, tenantId: string, name?: string) {
    const { raw, prefix, hash } = generateApiKey();
    const key = await prisma.apiKey.create({
      data: {
        tenantId,
        name: name?.trim() || null,
        keyHash: hash,
        keyPrefix: prefix,
        scopes: [],
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
  }
};