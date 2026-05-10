import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();
const TENANT_ID = '07fa9a89-37a7-4177-99ba-8f52bb42d883';
const TENANT_NAME = 'Quick Ship';

function generateTrackingNumber(tenantName) {
  const now = new Date();
  const DIGITS = '0123456789';
  const ALPHANUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const rand = (chars, n) => {
    const b = randomBytes(n);
    return Array.from({ length: n }, (_, i) => chars[b[i] % chars.length]).join('');
  };
  const prefix = (tenantName.replace(/[^A-Za-z]/g, '') || 'XX').toUpperCase().slice(0, 2).padEnd(2, 'X');
  const yy = String(now.getUTCFullYear()).slice(-2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${prefix}${yy}${mm}-${rand(DIGITS,2)}-${rand(ALPHANUM,4)}-${rand(DIGITS,5)}`;
}

async function main() {
  // 1. Driver user
  const user = await prisma.user.create({
    data: {
      tenantId: TENANT_ID,
      email: 'test.driver@quickship.dev',
      firstName: 'Test',
      lastName: 'Driver',
      role: 'TENANT_DRIVER',
      isActive: true
    }
  });

  // 2. Driver record
  const driver = await prisma.driver.create({
    data: {
      tenantId: TENANT_ID,
      userId: user.id,
      isAvailable: true
    }
  });

  // Generate tracking number in unified format: QU2605-XX-XXXX-XXXXX
  const trackingNumber = generateTrackingNumber(TENANT_NAME);

  // 3. Pending shipment
  const shipment = await prisma.shipment.create({
    data: {
      tenantId: TENANT_ID,
      trackingNumber,
      status: 'PENDING',
      originAddress: {
        line1: '10 Downing Street',
        city: 'London',
        postcode: 'SW1A 1AA',
        country: 'GB'
      },
      destinationAddress: {
        line1: '1 Piccadilly Gardens',
        city: 'Manchester',
        postcode: 'M1 1AE',
        country: 'GB'
      },
      weightKg: 2.5,
      serviceTier: 'STANDARD',
      estimatedDelivery: new Date(Date.now() + 4 * 60 * 60 * 1000)
    }
  });

  console.log('✓ Driver user:', user.id);
  console.log('✓ Driver:     ', driver.id);
  console.log('✓ Shipment:   ', shipment.id);
  console.log('');
  console.log('Paste this into your curl command:');
  console.log(JSON.stringify({
    eventId: 'test-005',
    type: 'shipment_created',
    tenantId: TENANT_ID,
    shipmentId: shipment.id,
    payload: {
      originPostcode: 'SW1A 1AA',
      destPostcode: 'M1 1AE',
      weightKg: 2.5
    }
  }, null, 2));
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
