import { Prisma, type PrismaClient } from '@prisma/client';
import { randomBytes } from 'node:crypto';

import { isReservedSlug } from './reserved-slugs.js';

const SLUG_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])$/;
const MAX_SLUG_LENGTH = 40;
const MAX_COLLISION_ATTEMPTS = 50;

type SlugLookupClient = PrismaClient | Prisma.TransactionClient;

export function deriveSlug(displayName: string): string {
  return displayName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
}

export function isValidSlugFormat(slug: string): boolean {
  return SLUG_REGEX.test(slug);
}

function withNumericSuffix(base: string, suffix: number): string {
  const suffixText = `-${suffix}`;
  return `${base.slice(0, MAX_SLUG_LENGTH - suffixText.length).replace(/-+$/g, '')}${suffixText}`;
}

async function slugExists(prisma: SlugLookupClient, slug: string): Promise<boolean> {
  const [tenant, history] = await Promise.all([
    prisma.tenant.findUnique({ where: { slug }, select: { id: true } }),
    prisma.tenantSlugHistory.findUnique({ where: { oldSlug: slug }, select: { id: true } })
  ]);
  return Boolean(tenant || history);
}

export async function findAvailableSlug(prisma: SlugLookupClient, desired: string): Promise<string> {
  if (!isValidSlugFormat(desired)) {
    throw new Error(`Invalid slug format: "${desired}"`);
  }

  for (let index = 0; index < MAX_COLLISION_ATTEMPTS; index += 1) {
    const candidate = index === 0 ? desired : withNumericSuffix(desired, index + 1);
    if (isReservedSlug(candidate)) continue;
    if (!(await slugExists(prisma, candidate))) return candidate;
  }

  const random = randomBytes(2).toString('hex');
  return `${desired.slice(0, MAX_SLUG_LENGTH - 5).replace(/-+$/g, '')}-${random}`;
}
