import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

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

function buildTrackingNumber(tenantName: string, createdAt: Date): string {
  const now = createdAt;
  const tenantPrefix = (tenantName.replace(/[^A-Za-z]/g, '') || 'XX')
    .toUpperCase()
    .slice(0, 2)
    .padEnd(2, 'X');
  const yy = String(now.getUTCFullYear()).slice(-2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const seg1 = randomFrom(DIGITS, 2);
  const seg2 = randomFrom(ALPHANUM, 4);
  const seg3 = randomFrom(DIGITS, 5);
  return `${tenantPrefix}${yy}${mm}-${seg1}-${seg2}-${seg3}`;
}

async function generateUnique(tenantName: string, createdAt: Date, usedSet: Set<string>): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = buildTrackingNumber(tenantName, createdAt);
    if (!usedSet.has(candidate)) {
      // Also check DB for safety
      const exists = await prisma.shipment.findUnique({
        where: { trackingNumber: candidate },
        select: { id: true }
      });
      if (!exists) {
        usedSet.add(candidate);
        return candidate;
      }
    }
  }
  throw new Error(`Could not generate unique tracking number for tenant ${tenantName}`);
}

async function main() {
  // Find all shipments with old FWD-XXXX format, grouped by tenant
  const oldShipments = await prisma.shipment.findMany({
    where: { trackingNumber: { startsWith: 'FWD-' } },
    select: {
      id: true,
      trackingNumber: true,
      createdAt: true,
      tenantId: true,
      tenant: { select: { name: true } }
    },
    orderBy: { createdAt: 'asc' }
  });

  if (oldShipments.length === 0) {
    console.log('No old-format tracking numbers found.');
    return;
  }

  console.log(`Found ${oldShipments.length} shipment(s) with old FWD- format.`);

  const usedThisRun = new Set<string>();
  const updates: Array<{ id: string; oldTn: string; newTn: string }> = [];

  for (const s of oldShipments) {
    const tenantName = s.tenant?.name ?? 'XX';
    const newTn = await generateUnique(tenantName, s.createdAt, usedThisRun);
    updates.push({ id: s.id, oldTn: s.trackingNumber, newTn });
  }

  console.log('\nPlanned updates:');
  for (const u of updates) {
    console.log(`  ${u.oldTn}  →  ${u.newTn}`);
  }

  // Apply updates — each in its own update to preserve unique constraint
  for (const u of updates) {
    await prisma.shipment.update({
      where: { id: u.id },
      data: { trackingNumber: u.newTn }
    });

    // Update any TrackingEvents and TrackingSnapshot that reference the old number
    await prisma.trackingEvent.updateMany({
      where: { trackingNumber: u.oldTn },
      data: { trackingNumber: u.newTn }
    });

    await prisma.trackingSnapshot.updateMany({
      where: { trackingNumber: u.oldTn },
      data: { trackingNumber: u.newTn }
    });
  }

  console.log(`\nDone — ${updates.length} tracking number(s) updated.`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
