import type { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';

// gtm.demos (WP-4.15): share-link tokens are stored as sha256; a DEMO-mode access token carries the first characters of
// that hash, so rotating the link (or ending the demo) ends every session opened with the old one on its next request.

const FINGERPRINT_LENGTH = 16;

export function hashShareToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function shareFingerprint(hash: string) {
  return hash.slice(0, FINGERPRINT_LENGTH);
}

/** Per-request check for DEMO-mode tokens: the demo must still be active and its share link unchanged. */
export async function demoSessionValid(prisma: PrismaClient, input: { tenantId: string; demoEnvironmentId?: string; demoTokenFingerprint?: string }, now = new Date()) {
  if (!input.demoEnvironmentId || !input.demoTokenFingerprint) return false;
  const row = await prisma.demoEnvironment.findFirst({ where: { id: input.demoEnvironmentId, tenantId: input.tenantId }, select: { status: true, expiresAt: true, shareTokenHash: true } });
  return Boolean(row && row.status === 'ACTIVE' && row.expiresAt > now && row.shareTokenHash && shareFingerprint(row.shareTokenHash) === input.demoTokenFingerprint);
}
