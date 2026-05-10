import type { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';

const DIGITS = '0123456789';
const ALPHANUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

function randomFrom(alphabet: string, length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[bytes[i] % alphabet.length];
  }
  return out;
}

// QU2605-47-B3K9-83721
// ├─┤├──┘ ├┤ ├──┤ ├───┤
// TN YY MM 2d  4an  5d
function buildTrackingNumber(tenantName: string): string {
  const now = new Date();

  // First 2 letters of tenant name (letters only, uppercase, pad with 'X' if short)
  const tenantPrefix = (tenantName.replace(/[^A-Za-z]/g, '') || 'XX')
    .toUpperCase()
    .slice(0, 2)
    .padEnd(2, 'X');

  // Last 2 digits of year + zero-padded month
  const yy = String(now.getUTCFullYear()).slice(-2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');

  const seg1 = randomFrom(DIGITS, 2);       // 2 unique digits
  const seg2 = randomFrom(ALPHANUM, 4);     // 4 alphanumeric
  const seg3 = randomFrom(DIGITS, 5);       // 5 unique digits

  return `${tenantPrefix}${yy}${mm}-${seg1}-${seg2}-${seg3}`;
}

type TrackingPrisma = Pick<PrismaClient, 'shipment'>;

export async function generateTrackingNumber(prisma: TrackingPrisma, tenantName: string): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = buildTrackingNumber(tenantName);
    const exists = await prisma.shipment.findUnique({
      where: { trackingNumber: candidate },
      select: { id: true }
    });
    if (!exists) return candidate;
  }
  throw new Error('Unable to generate unique tracking number after 10 attempts');
}
