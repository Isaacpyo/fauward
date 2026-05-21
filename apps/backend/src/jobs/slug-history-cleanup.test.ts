import type { PrismaClient } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { cleanupExpiredSlugHistory } from './slug-history-cleanup.js';

describe('cleanupExpiredSlugHistory', () => {
  it('deletes expired slug history rows', async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const prisma = {
      tenantSlugHistory: { deleteMany }
    } as unknown as PrismaClient;

    await expect(cleanupExpiredSlugHistory(prisma)).resolves.toEqual({ deleted: 2 });

    expect(deleteMany).toHaveBeenCalledWith({
      where: { expiresAt: { lt: expect.any(Date) } }
    });
  });
});
