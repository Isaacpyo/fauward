import type { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';

function monthStamp(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
}

function randomSegment(length = 6) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

type TrackingPrisma = Pick<PrismaClient, 'shipment'>;

export async function generateTrackingNumber(prisma: TrackingPrisma, tenantSlug: string): Promise<string> {
  const slug = (tenantSlug || 'TENANT').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12) || 'TENANT';

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = `${slug}-${monthStamp()}-${randomSegment(6)}`;
    const exists = await prisma.shipment.findUnique({
      where: { trackingNumber: candidate },
      select: { id: true }
    });
    if (!exists) {
      return candidate;
    }
  }

  throw new Error('Unable to generate unique tracking number after 5 attempts');
}
