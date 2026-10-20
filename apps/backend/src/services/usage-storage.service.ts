import type { Prisma } from '@prisma/client';

// L19 (WP-2.18): storage usage. Every stored document or proof-of-delivery file adds its size to this month's
// UsageRecord.storageBytes; health scoring and the console read it (WP-3.3).

type UsageDb = Pick<Prisma.TransactionClient, 'usageRecord'>;

export function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Size of a `data:` URL's payload (POD signatures/photos sent inline), or null for anything else. */
export function dataUrlBytes(value: string): number | null {
  const match = /^data:[^;,]*(;base64)?,(.*)$/s.exec(value);
  if (!match) return null;
  const payload = match[2];
  if (!match[1]) return Buffer.byteLength(decodeURIComponent(payload));
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

export async function recordStorageBytes(db: UsageDb, tenantId: string, bytes: number, at = new Date()) {
  if (!Number.isFinite(bytes) || bytes <= 0) return;
  const month = monthKey(at);
  const amount = BigInt(Math.round(bytes));
  await db.usageRecord.upsert({
    where: { tenantId_month: { tenantId, month } },
    create: { tenantId, month, storageBytes: amount },
    update: { storageBytes: { increment: amount } }
  });
}
