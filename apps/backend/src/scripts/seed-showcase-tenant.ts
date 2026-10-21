/**
 * Seeds a fully populated ENTERPRISE showcase tenant ("Harbourline Logistics") for marketing screenshots.
 *
 *   npm run showcase:seed --workspace=apps/backend            # create (fails if it already exists)
 *   npm run showcase:seed --workspace=apps/backend -- --reset # wipe the showcase tenant and rebuild it
 *
 * All data is generated relative to "now", so re-run with --reset right before a screenshot session:
 * drivers only count as live on the map / Fauward Go for ~15 minutes after the seed.
 *
 * Every row is written with the showcase tenantId. A plain PrismaClient is used (no tenant middleware),
 * and the reset path refuses to touch any tenant whose slug is not SHOWCASE_SLUG.
 */
import { Prisma, PrismaClient, type ShipmentStatus, type TrackingStatus } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import { hashPassword } from '../shared/utils/hash.js';

dotenv.config();

const SHOWCASE_SLUG = 'harbourline';
const SHOWCASE_NAME = 'Harbourline Logistics';
const EMAIL_DOMAIN = 'harbourline.example'; // .example never resolves, so no scheduled job can email a real inbox
const ADMIN_EMAIL = `amelia.hart@${EMAIL_DOMAIN}`;
const ADMIN_PASSWORD = process.env.SHOWCASE_PASSWORD ?? 'Showcase2026!';
const reset = process.argv.includes('--reset');
// Inline SVG wordmark so the top bar and tracking page show a brand without hosting an asset.
const LOGO_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="48" viewBox="0 0 220 48">' +
    '<rect x="2" y="6" width="36" height="36" rx="9" fill="#0F3D91"/>' +
    '<path d="M11 32c4-3 8-3 12 0s8 3 12 0" stroke="#F59E0B" stroke-width="3" fill="none" stroke-linecap="round"/>' +
    '<path d="M13 14v12M27 14v12M13 20h14" stroke="#fff" stroke-width="3.2" stroke-linecap="round"/>' +
    '<text x="48" y="31" font-family="Inter,Segoe UI,Arial,sans-serif" font-size="20" font-weight="700" fill="#0F3D91">Harbourline</text>' +
    '</svg>'
).toString('base64')}`;

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Deterministic randomness so every rebuild looks the same
// ---------------------------------------------------------------------------
let seed = 20261018;
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const between = (min: number, max: number) => min + rand() * (max - min);
const int = (min: number, max: number) => Math.floor(between(min, max + 1));
const pick = <T>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
const chance = (p: number) => rand() < p;
const money = (n: number) => n.toFixed(2);

const NOW = new Date();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const after = (d: Date, ms: number) => new Date(d.getTime() + ms);
const startOfTodayUtc = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate()));
const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------
type Place = { city: string; state: string; country: string; postcode: string; lat: number; lng: number; street: string };

const UK_PLACES: Place[] = [
  { city: 'London', state: 'Greater London', country: 'GB', postcode: 'E14 5AB', lat: 51.5055, lng: -0.0235, street: '18 Canary Wharf Quay' },
  { city: 'London', state: 'Greater London', country: 'GB', postcode: 'SE1 9GF', lat: 51.5045, lng: -0.0865, street: '42 Borough High Street' },
  { city: 'London', state: 'Greater London', country: 'GB', postcode: 'NW10 7LQ', lat: 51.5366, lng: -0.2541, street: 'Unit 7, Park Royal Trade Centre' },
  { city: 'London', state: 'Greater London', country: 'GB', postcode: 'N1 9AG', lat: 51.5352, lng: -0.1243, street: '3 Granary Square' },
  { city: 'Manchester', state: 'Greater Manchester', country: 'GB', postcode: 'M1 2HF', lat: 53.4794, lng: -2.2453, street: '55 Piccadilly Plaza' },
  { city: 'Manchester', state: 'Greater Manchester', country: 'GB', postcode: 'M17 1SN', lat: 53.4667, lng: -2.3483, street: 'Trafford Park Logistics Hub' },
  { city: 'Birmingham', state: 'West Midlands', country: 'GB', postcode: 'B5 4BU', lat: 52.4757, lng: -1.8899, street: '12 Digbeth High Street' },
  { city: 'Leeds', state: 'West Yorkshire', country: 'GB', postcode: 'LS1 4DY', lat: 53.7965, lng: -1.5475, street: '27 Wellington Place' },
  { city: 'Liverpool', state: 'Merseyside', country: 'GB', postcode: 'L3 4AF', lat: 53.4048, lng: -2.9916, street: '9 Kings Dock Street' },
  { city: 'Bristol', state: 'Bristol', country: 'GB', postcode: 'BS1 6FL', lat: 51.4495, lng: -2.5908, street: '31 Temple Quay' },
  { city: 'Glasgow', state: 'Scotland', country: 'GB', postcode: 'G2 5QR', lat: 55.8611, lng: -4.2583, street: '140 West George Street' },
  { city: 'Edinburgh', state: 'Scotland', country: 'GB', postcode: 'EH3 8EX', lat: 55.9467, lng: -3.2071, street: '6 Lochrin Square' },
  { city: 'Cardiff', state: 'Wales', country: 'GB', postcode: 'CF10 5AL', lat: 51.4718, lng: -3.1761, street: '2 Callaghan Square' },
  { city: 'Newcastle upon Tyne', state: 'Tyne and Wear', country: 'GB', postcode: 'NE1 3DY', lat: 54.9701, lng: -1.6139, street: '21 Grey Street' },
  { city: 'Nottingham', state: 'Nottinghamshire', country: 'GB', postcode: 'NG1 6FB', lat: 52.9531, lng: -1.1447, street: '8 Castle Boulevard' }
];
const INTL_PLACES: Place[] = [
  { city: 'Rotterdam', state: 'South Holland', country: 'NL', postcode: '3011 AD', lat: 51.9225, lng: 4.4792, street: 'Wilhelminakade 77' },
  { city: 'Paris', state: 'Île-de-France', country: 'FR', postcode: '75011', lat: 48.8589, lng: 2.3794, street: '14 Rue Oberkampf' },
  { city: 'Dublin', state: 'Leinster', country: 'IE', postcode: 'D02 X285', lat: 53.3438, lng: -6.2546, street: '1 Grand Canal Square' },
  { city: 'Lagos', state: 'Lagos', country: 'NG', postcode: '101241', lat: 6.4281, lng: 3.4219, street: '15 Adeola Odeku Street, Victoria Island' },
  { city: 'New York', state: 'NY', country: 'US', postcode: '10013', lat: 40.7209, lng: -74.0007, street: '88 Varick Street' }
];
const HUB_LONDON = UK_PLACES[2];
const HUB_MANCHESTER = UK_PLACES[5];

const ORGANISATIONS = [
  { name: 'Northgate Retail Group', contact: ['Hannah', 'Price'], terms: 30, credit: 25000 },
  { name: 'Brightwater Pharmacy', contact: ['Marcus', 'Bell'], terms: 30, credit: 15000 },
  { name: 'Oakridge Furniture Co.', contact: ['Sophie', 'Turner'], terms: 45, credit: 40000 },
  { name: 'Velo Cycles UK', contact: ['Jamal', 'Reid'], terms: 14, credit: 8000 },
  { name: 'Juniper & Moss Home', contact: ['Chloe', 'Bennett'], terms: 30, credit: 12000 },
  { name: 'Atlas Components Ltd', contact: ['Oliver', 'Grant'], terms: 60, credit: 60000 },
  { name: 'Silverline Electronics', contact: ['Aisha', 'Khan'], terms: 30, credit: 30000 },
  { name: 'Hearth & Field Foods', contact: ['Ben', 'Carter'], terms: 14, credit: 10000 },
  { name: 'Copperleaf Fashion', contact: ['Isla', 'Morgan'], terms: 30, credit: 18000 },
  { name: 'Meridian Medical Supplies', contact: ['Samuel', 'Adeyemi'], terms: 30, credit: 35000 }
] as const;

const STAFF = [
  { first: 'Amelia', last: 'Hart', role: 'TENANT_ADMIN', email: ADMIN_EMAIL },
  { first: 'Daniel', last: 'Okafor', role: 'TENANT_MANAGER' },
  { first: 'Priya', last: 'Shah', role: 'TENANT_FINANCE' },
  { first: 'Tom', last: 'Reilly', role: 'TENANT_STAFF' },
  { first: 'Grace', last: 'Mensah', role: 'TENANT_STAFF' },
  { first: 'Lewis', last: 'Campbell', role: 'TENANT_MANAGER' }
] as const;

const DRIVERS = [
  { first: 'Kwame', last: 'Asante', base: 'London', vehicle: ['LN24 HBL', 'Ford', 'E-Transit', 2024, 'VAN', 1600] },
  { first: 'Zofia', last: 'Nowak', base: 'London', vehicle: ['LN73 KRT', 'Mercedes-Benz', 'eSprinter', 2023, 'VAN', 1500] },
  { first: 'Ryan', last: 'Fletcher', base: 'London', vehicle: ['LD23 PWX', 'Renault', 'Master E-Tech', 2023, 'VAN', 1400] },
  { first: 'Fatima', last: 'Hussain', base: 'London', vehicle: ['LG72 ZMN', 'Volkswagen', 'Crafter', 2022, 'VAN', 1200] },
  { first: 'Ade', last: 'Balogun', base: 'London', vehicle: ['LK24 FRT', 'DAF', 'LF 7.5t', 2024, 'TRUCK', 3500] },
  { first: 'Callum', last: 'Doyle', base: 'Manchester', vehicle: ['MA23 VNX', 'Ford', 'Transit Custom', 2023, 'VAN', 1100] },
  { first: 'Leah', last: 'Robinson', base: 'Manchester', vehicle: ['MX72 CTB', 'Peugeot', 'e-Expert', 2022, 'VAN', 1000] },
  { first: 'Imran', last: 'Malik', base: 'Manchester', vehicle: ['MF24 LGS', 'Iveco', 'Daily 7.2t', 2024, 'TRUCK', 3200] }
] as const;

const ITEM_TYPES = [
  { description: 'Boxed homeware', kg: [2, 12], value: [40, 260] },
  { description: 'Pharmaceutical supplies (ambient)', kg: [1, 6], value: [120, 900] },
  { description: 'Flat-pack furniture', kg: [18, 65], value: [180, 950] },
  { description: 'Bicycle (boxed)', kg: [14, 22], value: [450, 2400] },
  { description: 'Consumer electronics', kg: [1, 9], value: [150, 1800] },
  { description: 'Apparel cartons', kg: [4, 20], value: [90, 600] },
  { description: 'Industrial components', kg: [8, 140], value: [300, 4200] },
  { description: 'Medical consumables', kg: [2, 15], value: [80, 1100] },
  { description: 'Palletised dry goods', kg: [180, 620], value: [600, 3800] }
] as const;

const FUNNEL: ShipmentStatus[] = ['PENDING', 'PROCESSING', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'];

const TRACKING_STATUS: Record<ShipmentStatus, TrackingStatus> = {
  PENDING: 'CREATED',
  PROCESSING: 'LABEL_GENERATED',
  PICKED_UP: 'PICKED_UP',
  IN_TRANSIT: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  FAILED_DELIVERY: 'FAILED_DELIVERY',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED',
  EXCEPTION: 'EXCEPTION'
};
const STATUS_TITLE: Record<ShipmentStatus, string> = {
  PENDING: 'Shipment created',
  PROCESSING: 'Label generated',
  PICKED_UP: 'Collected by driver',
  IN_TRANSIT: 'In transit',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  FAILED_DELIVERY: 'Delivery attempted',
  RETURNED: 'Returned to sender',
  CANCELLED: 'Cancelled',
  EXCEPTION: 'Delayed - action required'
};

function address(place: Place, name: string, contactName: string, phone: string, email: string) {
  return {
    name,
    contactName,
    phone,
    email,
    line1: place.street,
    city: place.city,
    state: place.state,
    postcode: place.postcode,
    country: place.country
  };
}
const eventLocation = (place: Place, jitter = 0.02) => ({
  city: place.city,
  state: place.state,
  country: place.country,
  lat: Number((place.lat + between(-jitter, jitter)).toFixed(6)),
  lng: Number((place.lng + between(-jitter, jitter)).toFixed(6))
});
const ukPhone = () => `+44 7${int(100, 999)} ${int(100000, 999999)}`;

const usedTracking = new Set<string>();
function trackingNumber(createdAt: Date) {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    const yymm = `${String(createdAt.getUTCFullYear()).slice(2)}${String(createdAt.getUTCMonth() + 1).padStart(2, '0')}`;
    const code = Array.from({ length: 4 }, () => pick(letters.split(''))).join('');
    const value = `HA${yymm}-${String(int(10, 99))}-${code}-${String(int(10000, 99999))}`;
    if (!usedTracking.has(value)) {
      usedTracking.add(value);
      return value;
    }
  }
}

// ---------------------------------------------------------------------------
// Reset
// ---------------------------------------------------------------------------
type Delegate = { deleteMany: (args: { where: Record<string, unknown> }) => Promise<unknown> };

async function wipeShowcaseTenant(tenantId: string) {
  const users = await prisma.user.findMany({ where: { tenantId }, select: { id: true } });
  const shipments = await prisma.shipment.findMany({ where: { tenantId }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const shipmentIds = shipments.map((s) => s.id);

  await prisma.$executeRaw`delete from relay_messages where conversation_id in (select id from relay_conversations where tenant_id = ${tenantId})`;
  await prisma.$executeRaw`delete from relay_conversations where tenant_id = ${tenantId}`;
  await prisma.$executeRaw`delete from documents where tenant_id = ${tenantId}`;
  await prisma.$executeRaw`delete from invoice_sequences where tenant_id = ${tenantId}`;

  // Delete every model scoped to this tenant (or to its users/shipments) in repeated passes until FK order resolves.
  const targets: Array<{ name: string; where: Record<string, unknown> }> = [];
  for (const model of Prisma.dmmf.datamodel.models) {
    // Drivers, users and the tenant go last in one transaction: an open portal's Fleet page
    // re-creates a Driver for every driver user, which would otherwise block the user delete.
    if (model.name === 'Tenant' || model.name === 'User' || model.name === 'Driver') continue;
    const fields = new Set(model.fields.filter((f) => f.kind === 'scalar').map((f) => f.name));
    if (fields.has('tenantId')) targets.push({ name: model.name, where: { tenantId } });
    else if (fields.has('shipmentId') && shipmentIds.length) targets.push({ name: model.name, where: { shipmentId: { in: shipmentIds } } });
    else if (fields.has('userId') && userIds.length) targets.push({ name: model.name, where: { userId: { in: userIds } } });
  }

  let pending = targets;
  for (let pass = 0; pass < 12 && pending.length; pass++) {
    const failed: typeof targets = [];
    for (const target of pending) {
      const delegate = (prisma as unknown as Record<string, Delegate>)[target.name.charAt(0).toLowerCase() + target.name.slice(1)];
      if (!delegate?.deleteMany) continue;
      try {
        await delegate.deleteMany({ where: target.where });
      } catch {
        failed.push(target);
      }
    }
    pending = failed;
  }
  if (pending.length) throw new Error(`Could not clear: ${pending.map((p) => p.name).join(', ')}`);
  await prisma.$transaction([
    prisma.driver.deleteMany({ where: { tenantId } }),
    prisma.user.deleteMany({ where: { tenantId } }),
    prisma.tenant.delete({ where: { id: tenantId } })
  ]);
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------
async function main() {
  const existing = await prisma.tenant.findUnique({ where: { slug: SHOWCASE_SLUG } });
  if (existing) {
    if (!reset) throw new Error(`Tenant "${SHOWCASE_SLUG}" already exists. Re-run with --reset to rebuild it.`);
    if (existing.slug !== SHOWCASE_SLUG) throw new Error('Refusing to reset a non-showcase tenant.');
    process.stdout.write('Removing previous showcase tenant...\n');
    await wipeShowcaseTenant(existing.id);
  }

  const passwordHash = await hashPassword(ADMIN_PASSWORD);
  const tenantId = randomUUID();
  const slugUpper = SHOWCASE_SLUG.toUpperCase();

  // --- Tenant, settings, subscription ------------------------------------------------------
  await prisma.tenant.create({
    data: {
      id: tenantId,
      name: SHOWCASE_NAME,
      slug: SHOWCASE_SLUG,
      plan: 'ENTERPRISE',
      status: 'ACTIVE',
      kycStatus: 'APPROVED',
      region: 'uk_europe',
      logoUrl: LOGO_DATA_URI,
      primaryColor: '#0F3D91',
      accentColor: '#F59E0B',
      brandName: 'Harbourline',
      trackingHeadline: 'Track your Harbourline delivery',
      defaultCurrency: 'GBP',
      timezone: 'Europe/London',
      showPoweredBy: false,
      smsEnabled: true,
      maxStaff: 250,
      maxShipmentsPm: 25000,
      maxOrganisations: 500,
      onboardingSteps: { profile: true, branding: true, team: true, pricing: true, payments: true, firstShipment: true },
      onboardingCompletedAt: ago(140 * DAY),
      createdAt: ago(150 * DAY)
    }
  });

  await prisma.tenantSettings.create({
    data: {
      tenantId,
      notificationEmail: `ops@${EMAIL_DOMAIN}`,
      smsEnabled: true,
      showPoweredBy: false,
      emailFromName: 'Harbourline Logistics',
      emailReplyTo: `support@${EMAIL_DOMAIN}`,
      customEmailDomain: 'mail.harbourline.example',
      slaDeliveryHours: 72,
      autoInvoiceOnDelivery: true,
      paymentGateway: 'STRIPE'
    }
  });

  await prisma.subscription.create({
    data: {
      tenantId,
      plan: 'ENTERPRISE',
      billingCycle: 'ANNUAL',
      status: 'ACTIVE',
      currentPeriodStart: ago(140 * DAY),
      currentPeriodEnd: after(NOW, 225 * DAY)
    }
  });

  const branchLondon = await prisma.branch.create({
    data: { tenantId, name: 'London - Park Royal', region: 'London', address: address(HUB_LONDON, 'Harbourline London Hub', 'Daniel Okafor', ukPhone(), `london@${EMAIL_DOMAIN}`) }
  });
  const branchManchester = await prisma.branch.create({
    data: { tenantId, name: 'Manchester - Trafford Park', region: 'North West', address: address(HUB_MANCHESTER, 'Harbourline Manchester Hub', 'Lewis Campbell', ukPhone(), `manchester@${EMAIL_DOMAIN}`) }
  });

  // --- Staff --------------------------------------------------------------------------------
  const staff: Array<{ id: string; email: string }> = [];
  for (const [i, s] of STAFF.entries()) {
    staff.push(
      await prisma.user.create({
        data: {
          tenantId,
          email: 'email' in s ? s.email : `${s.first.toLowerCase()}.${s.last.toLowerCase()}@${EMAIL_DOMAIN}`,
          passwordHash,
          role: s.role,
          firstName: s.first,
          lastName: s.last,
          phone: ukPhone(),
          branchId: i === 5 ? branchManchester.id : branchLondon.id,
          lastLogin: ago(int(5, 600) * 60_000),
          createdAt: ago((140 - i * 9) * DAY)
        }
      })
    );
  }
  const admin = staff[0];
  const manager = staff[1];
  const finance = staff[2];
  const opsStaff = [staff[1], staff[3], staff[4], staff[5]];

  // --- Organisations & customer users -------------------------------------------------------
  const orgs: Array<{ id: string; name: string; customerId: string; place: Place; email: string; contact: string; terms: number }> = [];
  for (const [i, o] of ORGANISATIONS.entries()) {
    const place = UK_PLACES[(i * 3) % UK_PLACES.length];
    const domain = `${o.name.toLowerCase().replace(/[^a-z]+/g, '')}.example`;
    const org = await prisma.organisation.create({
      data: {
        tenantId,
        name: o.name,
        companyNumber: String(int(10000000, 15999999)),
        taxNumber: `GB${int(100000000, 999999999)}`,
        billingEmail: `accounts@${domain}`,
        billingAddress: address(place, o.name, `${o.contact[0]} ${o.contact[1]}`, ukPhone(), `accounts@${domain}`),
        paymentTerms: o.terms,
        creditLimit: money(o.credit),
        createdAt: ago((130 - i * 8) * DAY)
      }
    });
    const customer = await prisma.user.create({
      data: {
        tenantId,
        organisationId: org.id,
        email: `${o.contact[0].toLowerCase()}.${o.contact[1].toLowerCase()}@${domain}`,
        passwordHash,
        role: 'CUSTOMER_ADMIN',
        firstName: o.contact[0],
        lastName: o.contact[1],
        phone: ukPhone(),
        lastLogin: ago(int(1, 96) * HOUR)
      }
    });
    orgs.push({ id: org.id, name: o.name, customerId: customer.id, place, email: customer.email, contact: `${o.contact[0]} ${o.contact[1]}`, terms: o.terms });
  }

  // --- Fleet --------------------------------------------------------------------------------
  const drivers: Array<{ id: string; userId: string; name: string; base: Place; vehicleId: string }> = [];
  for (const [i, d] of DRIVERS.entries()) {
    const [registration, make, model, year, type, capacityKg] = d.vehicle;
    const vehicle = await prisma.vehicle.create({
      data: { tenantId, registration, make, model, year, type, capacityKg: money(capacityKg), capacityM3: type === 'TRUCK' ? '38.00' : '11.50' }
    });
    const user = await prisma.user.create({
      data: {
        tenantId,
        email: `${d.first.toLowerCase()}.${d.last.toLowerCase()}@${EMAIL_DOMAIN}`,
        passwordHash,
        role: 'TENANT_DRIVER',
        firstName: d.first,
        lastName: d.last,
        phone: ukPhone(),
        branchId: d.base === 'London' ? branchLondon.id : branchManchester.id,
        lastLogin: ago(int(2, 40) * 60_000)
      }
    });
    const base = d.base === 'London' ? pick(UK_PLACES.slice(0, 4)) : pick(UK_PLACES.slice(4, 6));
    const driver = await prisma.driver.create({
      data: {
        tenantId,
        userId: user.id,
        vehicleId: vehicle.id,
        licenceNumber: `${d.last.toUpperCase().slice(0, 5).padEnd(5, '9')}${int(100000, 999999)}${d.first[0]}${d.last[0]}9AB`,
        licenceExpiry: after(NOW, int(300, 2400) * DAY),
        isAvailable: i !== 3,
        currentLat: (base.lat + between(-0.03, 0.03)).toFixed(8),
        currentLng: (base.lng + between(-0.04, 0.04)).toFixed(8),
        lastLocationAt: ago(int(10, 240) * 1000)
      }
    });
    // A spare vehicle is added below; the last driver also gets an e-cargo bike for central deliveries.
    drivers.push({ id: driver.id, userId: user.id, name: `${d.first} ${d.last}`, base, vehicleId: vehicle.id });
  }
  await prisma.vehicle.create({ data: { tenantId, registration: 'CARGO-BIKE-01', make: 'Urban Arrow', model: 'Tender 1500', year: 2024, type: 'CARGO_BIKE', capacityKg: '250.00', capacityM3: '1.50' } });
  await prisma.vehicle.create({ data: { tenantId, registration: 'LN21 SPR', make: 'Ford', model: 'Transit', year: 2021, type: 'VAN', capacityKg: '1300.00', capacityM3: '11.00', isActive: false } });

  // --- Pricing ------------------------------------------------------------------------------
  const zones = {
    london: await prisma.serviceZone.create({ data: { tenantId, name: 'Greater London', zoneType: 'REGIONAL', description: 'M25 and inner London postcodes' } }),
    northWest: await prisma.serviceZone.create({ data: { tenantId, name: 'North West', zoneType: 'REGIONAL', description: 'Manchester, Liverpool and surrounding areas' } }),
    mainland: await prisma.serviceZone.create({ data: { tenantId, name: 'UK Mainland', zoneType: 'NATIONAL', description: 'England, Wales and lowland Scotland' } }),
    highlands: await prisma.serviceZone.create({ data: { tenantId, name: 'Highlands & Islands', zoneType: 'NATIONAL', description: 'Remote Scottish postcodes (IV, KW, HS, ZE)' } }),
    europe: await prisma.serviceZone.create({ data: { tenantId, name: 'Europe (EU + IE)', zoneType: 'INTERNATIONAL', description: 'Road freight to EU member states' } }),
    world: await prisma.serviceZone.create({ data: { tenantId, name: 'Rest of World', zoneType: 'INTERNATIONAL', description: 'Air freight, duties paid by receiver' } })
  };
  const rateCards: Array<[string, string, string, string, number, number, number]> = [
    ['London same-day', zones.london.id, zones.london.id, 'EXPRESS', 14.5, 0.85, 14.5],
    ['London next-day', zones.london.id, zones.london.id, 'STANDARD', 7.95, 0.45, 7.95],
    ['London to North West', zones.london.id, zones.northWest.id, 'STANDARD', 11.5, 0.55, 11.5],
    ['North West to London', zones.northWest.id, zones.london.id, 'STANDARD', 11.5, 0.55, 11.5],
    ['UK Mainland economy', zones.mainland.id, zones.mainland.id, 'STANDARD', 9.25, 0.5, 9.25],
    ['UK Mainland overnight', zones.mainland.id, zones.mainland.id, 'OVERNIGHT', 18.75, 0.95, 18.75],
    ['Highlands & Islands', zones.mainland.id, zones.highlands.id, 'STANDARD', 24.0, 1.1, 24.0],
    ['Europe road freight', zones.mainland.id, zones.europe.id, 'STANDARD', 38.0, 1.65, 38.0],
    ['Worldwide air', zones.mainland.id, zones.world.id, 'EXPRESS', 65.0, 4.2, 65.0]
  ];
  for (const [name, originZoneId, destZoneId, serviceTier, basePrice, perKg, minCharge] of rateCards) {
    await prisma.rateCard.create({
      data: { tenantId, name, originZoneId, destZoneId, serviceTier, basePrice: money(basePrice), pricePerKg: perKg.toFixed(4), minCharge: money(minCharge), effectiveFrom: ago(120 * DAY) }
    });
  }
  await prisma.surcharge.createMany({
    data: [
      { tenantId, name: 'Fuel surcharge', description: 'Indexed monthly to UK diesel prices', type: 'PERCENT_OF_BASE', condition: 'FUEL', value: '8.5000' },
      { tenantId, name: 'Remote area delivery', description: 'Highlands, islands and Northern Ireland', type: 'FLAT_FEE', condition: 'REMOTE_AREA', value: '12.0000' },
      { tenantId, name: 'Oversize handling', description: 'Any dimension over 120cm', type: 'FLAT_FEE', condition: 'OVERSIZE', value: '18.0000', threshold: '120.00' },
      { tenantId, name: 'Residential delivery', type: 'FLAT_FEE', condition: 'RESIDENTIAL', value: '2.5000' },
      { tenantId, name: 'Dangerous goods (ADR)', description: 'ADR-certified driver and documentation', type: 'FLAT_FEE', condition: 'DANGEROUS_GOODS', value: '35.0000', isVisibleToCustomer: false },
      {
        tenantId,
        name: 'Peak season',
        description: 'Black Friday to New Year',
        type: 'PERCENT_OF_TOTAL',
        condition: 'PEAK_SEASON',
        value: '5.0000',
        peakFrom: new Date(Date.UTC(NOW.getUTCFullYear(), 10, 20)),
        peakTo: new Date(Date.UTC(NOW.getUTCFullYear(), 11, 31))
      }
    ]
  });
  await prisma.weightDiscountTier.createMany({
    data: [
      { tenantId, name: 'Bulk 25kg+', minWeightKg: '25.00', maxWeightKg: '99.99', discountValue: '5.0000' },
      { tenantId, name: 'Freight 100kg+', minWeightKg: '100.00', maxWeightKg: '499.99', discountValue: '10.0000' },
      { tenantId, name: 'Pallet 500kg+', minWeightKg: '500.00', discountValue: '15.0000' }
    ]
  });
  await prisma.pricingRule.createMany({
    data: [
      { tenantId, name: 'Key account discount', description: 'Contracted rate for Atlas and Meridian', priority: 10, conditions: { customerIds: [orgs[5].customerId, orgs[9].customerId] }, action: 'MULTIPLY', actionValue: '0.9000' },
      { tenantId, name: 'Weekend express premium', description: 'Saturday and Sunday express collections', priority: 20, conditions: { serviceTiers: ['EXPRESS'], daysOfWeek: [0, 6] }, action: 'MULTIPLY', actionValue: '1.1500' },
      { tenantId, name: 'Pallet minimum charge', priority: 30, conditions: { weightMinKg: 180 }, action: 'SET_MIN', actionValue: '95.0000' },
      { tenantId, name: 'Europe handling fee', priority: 40, conditions: { destZoneIds: [zones.europe.id] }, action: 'ADD', actionValue: '6.5000', isEnabled: false }
    ]
  });
  const promoCodes = [
    { code: 'WELCOME10', description: '10% off your first 3 shipments', type: 'PERCENT_OFF', value: '10.00', maxUses: 500, usedCount: 212 },
    { code: 'PEAK25', description: '£25 off orders over £250 during peak', type: 'FIXED_OFF', value: '25.00', minOrderValue: '250.00', maxUses: 200, usedCount: 37, expiresAt: new Date(Date.UTC(NOW.getUTCFullYear(), 11, 31)) },
    { code: 'FREEINSURE', description: 'Free goods-in-transit cover', type: 'FREE_INSURANCE', value: '0.00', usedCount: 64 },
    { code: 'GOEXPRESS', description: 'Free upgrade to express', type: 'FREE_EXPRESS', value: '0.00', maxUses: 100, usedCount: 100, isEnabled: false }
  ] as const;
  for (const p of promoCodes) await prisma.promoCode.create({ data: { tenantId, ...p } });
  await prisma.currencyRate.createMany({
    data: [
      { fromCurrency: 'GBP', toCurrency: 'USD', rate: '1.27000000' },
      { fromCurrency: 'GBP', toCurrency: 'EUR', rate: '1.17000000' },
      { fromCurrency: 'GBP', toCurrency: 'NGN', rate: '1950.00000000' },
      { fromCurrency: 'USD', toCurrency: 'GBP', rate: '0.78740000' },
      { fromCurrency: 'EUR', toCurrency: 'GBP', rate: '0.85470000' }
    ],
    skipDuplicates: true
  });

  await prisma.shippingRule.createMany({
    data: [
      { tenantId, name: 'Non-UK shipments need customs', priority: 10, conditions: [{ field: 'destinationCountry', operator: 'neq', value: 'GB' }], actions: [{ type: 'requireCustomsDeclaration' }] },
      { tenantId, name: 'High-value goods insurance', priority: 20, conditions: [{ field: 'declaredValue', operator: 'gte', value: 1500 }], actions: [{ type: 'addInsurance' }] },
      { tenantId, name: 'Heavy freight review', priority: 30, conditions: [{ field: 'weightKg', operator: 'gt', value: 500 }], actions: [{ type: 'flagForReview' }, { type: 'notifyOperator', value: `ops@${EMAIL_DOMAIN}` }] },
      { tenantId, name: 'Scotland via Manchester hub', priority: 40, isActive: false, conditions: [{ field: 'destinationCountry', operator: 'eq', value: 'GB' }, { field: 'customerTag', operator: 'eq', value: 'scotland' }], actions: [{ type: 'assignRoute', value: 'MAN-SCOT-01' }] }
    ]
  });

  // --- Shipments, items, events, tracking snapshots -----------------------------------------
  type Ship = {
    id: string;
    trackingNumber: string;
    status: ShipmentStatus;
    org: (typeof orgs)[number];
    createdAt: Date;
    deliveredAt?: Date;
    price: number;
    tier: string;
    driver?: (typeof drivers)[number];
    origin: Place;
    dest: Place;
    lastEventAt: Date;
    international: boolean;
  };
  const ships: Ship[] = [];
  const shipmentRows: Prisma.ShipmentCreateManyInput[] = [];
  const itemRows: Prisma.ShipmentItemCreateManyInput[] = [];
  const eventRows: Prisma.ShipmentEventCreateManyInput[] = [];
  const snapshotRows: Prisma.TrackingSnapshotCreateManyInput[] = [];

  function chooseStatus(ageDays: number): ShipmentStatus {
    if (ageDays >= 5) {
      const r = rand();
      if (r < 0.86) return 'DELIVERED';
      if (r < 0.9) return 'CANCELLED';
      if (r < 0.93) return 'RETURNED';
      if (r < 0.96) return 'FAILED_DELIVERY';
      return 'DELIVERED';
    }
    if (ageDays >= 2) return pick<ShipmentStatus>(['DELIVERED', 'DELIVERED', 'DELIVERED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'FAILED_DELIVERY']);
    if (ageDays >= 1) return pick<ShipmentStatus>(['DELIVERED', 'DELIVERED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY', 'PICKED_UP']);
    return pick<ShipmentStatus>(['PENDING', 'PROCESSING', 'PROCESSING', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY']);
  }

  // Volume grows over the window so 30-day growth (and the health score) trends up.
  for (let dayAgo = 60; dayAgo >= 0; dayAgo--) {
    const weekday = new Date(NOW.getTime() - dayAgo * DAY).getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    let count = Math.round((dayAgo > 30 ? 4 : 6) + between(0, 3));
    if (weekend) count = Math.max(1, Math.round(count / 3));
    if (dayAgo === 0) count = 16;
    if (dayAgo === 1) count = 12;

    for (let n = 0; n < count; n++) {
      const todayHours = (NOW.getTime() - startOfTodayUtc.getTime()) / HOUR;
      // Today's bookings always fall after UTC midnight, however early in the day the seed runs.
      const createdAt = dayAgo === 0 ? ago(between(Math.min(0.4, todayHours * 0.2), Math.max(0.02, todayHours - 0.02)) * HOUR) : ago(dayAgo * DAY + between(-8, 8) * HOUR);
      const ageDays = (NOW.getTime() - createdAt.getTime()) / DAY;
      // The first few of yesterday's bookings are always delivered today, so "delivered today" is never empty.
      const deliverToday = dayAgo === 1 && n < 6;
      let status = deliverToday ? 'DELIVERED' : chooseStatus(ageDays);
      const org = pick(orgs);
      const international = !deliverToday && chance(0.12);
      const fromManchester = chance(0.3);
      const origin = fromManchester ? HUB_MANCHESTER : HUB_LONDON;
      let dest = international ? pick(INTL_PLACES) : pick(UK_PLACES.filter((p) => p !== origin));
      const active = !['DELIVERED', 'CANCELLED', 'RETURNED', 'FAILED_DELIVERY', 'PENDING', 'PROCESSING'].includes(status);
      // Active domestic deliveries end near the driver's base so the live map clusters around the hubs.
      if (active && !international) dest = fromManchester ? pick(UK_PLACES.slice(4, 6)) : pick(UK_PLACES.slice(0, 4));
      if (international && status === 'OUT_FOR_DELIVERY') status = 'IN_TRANSIT';

      const itemType = pick(ITEM_TYPES);
      const qty = itemType.kg[0] > 100 ? int(1, 2) : int(1, 6);
      const weight = Number((between(itemType.kg[0], itemType.kg[1]) * qty).toFixed(2));
      const tier = international ? pick(['STANDARD', 'EXPRESS']) : pick(['STANDARD', 'STANDARD', 'STANDARD', 'EXPRESS', 'OVERNIGHT']);
      const tierFactor = tier === 'EXPRESS' ? 1.6 : tier === 'OVERNIGHT' ? 2.1 : 1;
      const base = international ? 38 + weight * 1.65 : 8.5 + weight * 0.55;
      const price = Number(Math.max(international ? 45 : 7.95, base * tierFactor).toFixed(2));
      const driverPool = drivers.filter((d) => (fromManchester ? d.base.city === 'Manchester' : d.base.city === 'London'));
      const driver = ['PENDING', 'PROCESSING', 'CANCELLED'].includes(status) || (international && status !== 'DELIVERED') ? undefined : pick(driverPool);

      // Event chain up to the final status, squeezed so the newest event is in the past.
      const chain: ShipmentStatus[] = (() => {
        if (status === 'CANCELLED') return ['PENDING', 'PROCESSING', 'CANCELLED'];
        if (status === 'FAILED_DELIVERY') return ['PENDING', 'PROCESSING', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'FAILED_DELIVERY'];
        if (status === 'RETURNED') return ['PENDING', 'PROCESSING', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'FAILED_DELIVERY', 'RETURNED'];
        if (status === 'EXCEPTION') return ['PENDING', 'PROCESSING', 'PICKED_UP', 'IN_TRANSIT', 'EXCEPTION'];
        return FUNNEL.slice(0, FUNNEL.indexOf(status) + 1);
      })();
      const slowDelivery = chance(0.07);
      const gaps = chain.slice(1).map((s) => {
        if (s === 'PROCESSING') return between(0.3, 2) * HOUR;
        if (s === 'PICKED_UP') return between(2, 6) * HOUR;
        if (s === 'IN_TRANSIT') return between(2, 10) * HOUR;
        if (s === 'OUT_FOR_DELIVERY') return (international ? between(40, 70) : between(6, tier === 'STANDARD' ? 30 : 12)) * HOUR;
        if (s === 'DELIVERED') return between(0.5, 5) * HOUR + (slowDelivery ? between(50, 70) * HOUR : 0);
        if (s === 'RETURNED') return between(30, 60) * HOUR;
        return between(1, 6) * HOUR;
      });
      const total = gaps.reduce((a, b) => a + b, 0);
      const latest = deliverToday
        ? startOfTodayUtc.getTime() + ((n + 0.5) / 6) * Math.max(60_000, NOW.getTime() - 5 * 60_000 - startOfTodayUtc.getTime())
        : NOW.getTime() - between(4, 50) * 60_000;
      // Forced deliveries are stretched or squeezed so the final event lands exactly at `latest`.
      const scale = deliverToday || createdAt.getTime() + total > latest ? Math.max(0.01, (latest - createdAt.getTime()) / total) : 1;
      let t = createdAt.getTime();
      const times = [createdAt, ...gaps.map((g) => new Date((t += g * scale)))];

      const id = randomUUID();
      const tn = trackingNumber(createdAt);
      const deliveredAt = status === 'DELIVERED' ? times[times.length - 1] : undefined;
      const estimatedDelivery = after(createdAt, (tier === 'OVERNIGHT' ? 24 : tier === 'EXPRESS' ? 36 : international ? 120 : 72) * HOUR);
      const actorFor = (s: ShipmentStatus) => (['PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED_DELIVERY'].includes(s) && driver ? driver.userId : pick(opsStaff).id);

      chain.forEach((s, i) => {
        const fieldEvent = ['PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED_DELIVERY'].includes(s) && driver;
        const place = s === 'PENDING' || s === 'PROCESSING' || s === 'PICKED_UP' ? origin : s === 'IN_TRANSIT' ? (international ? dest : pick([origin, dest])) : dest;
        eventRows.push({
          tenantId,
          shipmentId: id,
          status: s,
          location: eventLocation(place, s === 'OUT_FOR_DELIVERY' ? 0.03 : 0.01),
          notes:
            s === 'DELIVERED'
              ? pick(['Signed for at reception', 'Left with goods-in team', 'Delivered to loading bay 3', 'Signed by recipient'])
              : s === 'FAILED_DELIVERY'
                ? pick(['Recipient unavailable - card left', 'Site closed on arrival', 'Access code not provided'])
                : s === 'EXCEPTION'
                  ? 'Held at depot awaiting address confirmation'
                  : null,
          actorId: actorFor(s),
          actorType: fieldEvent ? 'DRIVER' : 'TENANT_USER',
          source: fieldEvent ? 'FAUWARD_GO' : s === 'PENDING' ? pick(['TENANT_PORTAL', 'API', 'API', 'CUSTOMER_PORTAL']) : 'TENANT_PORTAL',
          timestamp: times[i]
        });
      });

      shipmentRows.push({
        id,
        tenantId,
        branchId: fromManchester ? branchManchester.id : branchLondon.id,
        trackingNumber: tn,
        customerId: org.customerId,
        organisationId: org.id,
        assignedStaffId: pick(opsStaff).id,
        assignedDriverId: driver?.id ?? null,
        vehicleId: driver?.vehicleId ?? null,
        status,
        originAddress: address(origin, `Harbourline for ${org.name}`, org.contact, ukPhone(), org.email),
        destinationAddress: address(dest, pick(['Goods In', 'Receiving Dept', 'Store Manager', 'Warehouse Team', 'Reception']), `${pick(['Laura', 'James', 'Nadia', 'Chris', 'Elena', 'Tunde', 'Megan', 'Raj'])} ${pick(['Walsh', 'Ellis', 'Okoro', 'Hughes', 'Fischer', 'Martin', 'Lopez', 'Singh'])}`, ukPhone(), `goodsin@${dest.city.toLowerCase().replace(/[^a-z]+/g, '')}.example`),
        serviceTier: tier,
        serviceZoneId: international ? (dest.country === 'NL' || dest.country === 'FR' || dest.country === 'IE' ? zones.europe.id : zones.world.id) : zones.mainland.id,
        estimatedDelivery,
        actualDelivery: deliveredAt ?? null,
        price: money(price),
        currency: 'GBP',
        weightKg: weight.toFixed(3),
        insuranceValue: chance(0.3) ? money(between(itemType.value[0], itemType.value[1]) * qty) : null,
        specialInstructions: chance(0.2) ? pick(['Tail-lift required', 'Call 30 minutes before arrival', 'Deliver to rear entrance', 'Fragile - handle with care', 'Book-in slot required']) : null,
        escalationFlag: status === 'EXCEPTION',
        escalationReason: status === 'EXCEPTION' ? 'Address could not be verified' : null,
        createdAt,
        updatedAt: times[times.length - 1]
      });
      itemRows.push({
        tenantId,
        shipmentId: id,
        description: itemType.description,
        quantity: qty,
        weightKg: (weight / qty).toFixed(3),
        lengthCm: between(30, itemType.kg[0] > 100 ? 120 : 80).toFixed(2),
        widthCm: between(20, itemType.kg[0] > 100 ? 100 : 60).toFixed(2),
        heightCm: between(15, itemType.kg[0] > 100 ? 160 : 60).toFixed(2),
        declaredValue: money(between(itemType.value[0], itemType.value[1]) * qty),
        hsCode: international ? pick(['940360', '300490', '871200', '851762', '620342', '848180']) : null
      });
      snapshotRows.push({
        tenantId,
        shipmentId: id,
        trackingNumber: tn,
        currentStatus: TRACKING_STATUS[status],
        operationalStatus: TRACKING_STATUS[status],
        customerStatus: STATUS_TITLE[status],
        currentTitle: STATUS_TITLE[status],
        lastEventAt: times[times.length - 1],
        originName: origin.city,
        destinationName: dest.city,
        estimatedDeliveryAt: estimatedDelivery,
        deliveredAt: deliveredAt ?? null,
        hasException: status === 'EXCEPTION' || status === 'FAILED_DELIVERY',
        assignedDriverId: driver?.id ?? null,
        assignedVehicleId: driver?.vehicleId ?? null,
        podAvailable: status === 'DELIVERED'
      });
      ships.push({ id, trackingNumber: tn, status, org, createdAt, deliveredAt, price, tier, driver, origin, dest, lastEventAt: times[times.length - 1], international });
    }
  }

  // Two shipments that need attention (exception + an unassigned job) for the agent and control tower.
  for (const target of ships.filter((s) => s.status === 'IN_TRANSIT' && !s.international).slice(0, 1)) {
    target.status = 'EXCEPTION';
    const row = shipmentRows.find((r) => r.id === target.id)!;
    row.status = 'EXCEPTION';
    row.escalationFlag = true;
    row.escalationReason = 'Address could not be verified';
    row.escalationFlaggedAt = ago(3 * HOUR);
    const snap = snapshotRows.find((r) => r.shipmentId === target.id)!;
    snap.currentStatus = 'EXCEPTION';
    snap.operationalStatus = 'EXCEPTION';
    snap.customerStatus = STATUS_TITLE.EXCEPTION;
    snap.currentTitle = STATUS_TITLE.EXCEPTION;
    snap.hasException = true;
    eventRows.push({ tenantId, shipmentId: target.id, status: 'EXCEPTION', location: eventLocation(target.dest), notes: 'Held at depot awaiting address confirmation', actorId: manager.id, actorType: 'TENANT_USER', source: 'TENANT_PORTAL', timestamp: ago(3 * HOUR) });
  }

  for (let i = 0; i < shipmentRows.length; i += 200) await prisma.shipment.createMany({ data: shipmentRows.slice(i, i + 200) });
  for (let i = 0; i < itemRows.length; i += 500) await prisma.shipmentItem.createMany({ data: itemRows.slice(i, i + 500) });
  for (let i = 0; i < eventRows.length; i += 500) await prisma.shipmentEvent.createMany({ data: eventRows.slice(i, i + 500) });
  for (let i = 0; i < snapshotRows.length; i += 500) await prisma.trackingSnapshot.createMany({ data: snapshotRows.slice(i, i + 500) });

  // Live drivers sit on top of their current out-for-delivery job.
  for (const d of drivers) {
    const job = ships.find((s) => s.driver?.id === d.id && (s.status === 'OUT_FOR_DELIVERY' || s.status === 'IN_TRANSIT'));
    if (!job) continue;
    const lastEvent = [...eventRows].reverse().find((e) => e.shipmentId === job.id);
    const loc = lastEvent?.location as { lat: number; lng: number } | undefined;
    if (loc) await prisma.driver.update({ where: { id: d.id }, data: { currentLat: loc.lat.toFixed(8), currentLng: loc.lng.toFixed(8) } });
  }

  // Customs declarations are skipped: customs_declarations is shared with the Python service and has
  // NOT NULL columns (tenant_id, declaration_type) the Prisma model doesn't know about.

  // POD documents for delivered shipments (the shipment detail page lists these).
  await prisma.shipmentDocument.createMany({
    data: ships
      .filter((s) => s.status === 'DELIVERED')
      .slice(-25)
      .map((s) => ({ tenantId, shipmentId: s.id, type: 'POD_RECEIPT' as const, fileUrl: `https://files.${EMAIL_DOMAIN}/pod/${s.trackingNumber}.pdf`, fileSize: int(80000, 240000), generatedBy: 'system' }))
  });

  // --- Routes for today (Fauward Go) ---------------------------------------------------------
  for (const d of drivers) {
    const jobs = ships.filter((s) => s.driver?.id === d.id && (s.lastEventAt >= startOfTodayUtc || ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(s.status)));
    if (!jobs.length) continue;
    const route = await prisma.route.create({
      data: { tenantId, driverId: d.id, vehicleId: d.vehicleId, date: startOfTodayUtc, status: 'IN_PROGRESS', startedAt: after(startOfTodayUtc, 7 * HOUR), optimizedAt: after(startOfTodayUtc, 6.5 * HOUR), optimizationScore: { distanceKm: Number(between(38, 96).toFixed(1)), savedMinutes: int(18, 54) } }
    });
    await prisma.routeStop.createMany({
      data: jobs.map((s, i) => {
        const done = s.status === 'DELIVERED' || s.status === 'FAILED_DELIVERY';
        const eta = after(startOfTodayUtc, (8 + i * 0.75) * HOUR);
        return {
          routeId: route.id,
          shipmentId: s.id,
          driverId: d.id,
          stopOrder: i + 1,
          sequence: i + 1,
          type: 'DELIVERY',
          status: done ? 'COMPLETED' : s.status === 'OUT_FOR_DELIVERY' ? 'EN_ROUTE' : 'PENDING',
          estimatedAt: eta,
          arrivedAt: done ? new Date(s.lastEventAt.getTime() - int(4, 12) * 60_000) : null,
          completedAt: done ? s.lastEventAt : null
        };
      })
    });
  }

  // --- Invoices, payments, refunds, credit notes, payouts ------------------------------------
  const invoiceRows: Prisma.InvoiceCreateManyInput[] = [];
  const paymentRows: Prisma.PaymentCreateManyInput[] = [];
  const invoiceCountByYear = new Map<number, number>();
  // Issued (non-draft) invoices must carry the Python invoicing service's issuance columns
  // (invoices_issued_number_required_chk), which Prisma doesn't model; they're filled in after insert.
  const invoiceIssue = new Map<string, { status: string; fiscalYear: number; sequenceNumber: number }>();
  const nextInvoiceNumber = (d: Date) => {
    const y = d.getUTCFullYear();
    const n = (invoiceCountByYear.get(y) ?? 0) + 1;
    invoiceCountByYear.set(y, n);
    return { number: `${slugUpper}-INV-${y}-${String(n).padStart(4, '0')}`, fiscalYear: y, sequenceNumber: n };
  };
  const delivered = ships.filter((s) => s.status === 'DELIVERED').sort((a, b) => a.deliveredAt!.getTime() - b.deliveredAt!.getTime());
  const cardPayments: Array<{ id: string; amount: number; at: Date }> = [];

  for (const s of delivered) {
    const createdAt = after(s.deliveredAt!, int(5, 40) * 60_000 < NOW.getTime() - s.deliveredAt!.getTime() ? int(5, 40) * 60_000 : 0);
    const ageDays = (NOW.getTime() - createdAt.getTime()) / DAY;
    const subtotal = s.price;
    const taxAmount = s.international ? 0 : Number((subtotal * 0.2).toFixed(2));
    const total = Number((subtotal + taxAmount).toFixed(2));
    let status: 'DRAFT' | 'SENT' | 'PAID' | 'PARTIALLY_PAID' | 'VOID';
    if (ageDays > s.org.terms) status = chance(0.95) ? 'PAID' : 'VOID';
    else if (ageDays > 10) status = pick(['PAID', 'PAID', 'PAID', 'SENT', 'SENT', 'PARTIALLY_PAID']);
    else if (ageDays > 1) status = pick(['PAID', 'SENT', 'SENT', 'SENT', 'DRAFT']);
    else status = pick(['SENT', 'DRAFT', 'PAID']);
    const id = randomUUID();
    const sentAt = status === 'DRAFT' ? null : after(createdAt, 10 * 60_000 < NOW.getTime() - createdAt.getTime() ? 10 * 60_000 : 0);
    const paidAt = status === 'PAID' ? new Date(Math.min(NOW.getTime() - 60_000, createdAt.getTime() + between(0.1, Math.min(s.org.terms, Math.max(0.2, ageDays - 0.05))) * DAY)) : null;
    const numbering = nextInvoiceNumber(createdAt);
    invoiceIssue.set(id, { status, fiscalYear: numbering.fiscalYear, sequenceNumber: numbering.sequenceNumber });
    invoiceRows.push({
      id,
      tenantId,
      invoiceNumber: numbering.number,
      customerId: s.org.customerId,
      organisationId: s.org.id,
      shipmentId: s.id,
      lineItems: [
        { description: `${s.tier === 'STANDARD' ? 'Standard' : s.tier === 'EXPRESS' ? 'Express' : 'Overnight'} delivery ${s.origin.city} → ${s.dest.city} (${s.trackingNumber})`, quantity: 1, unitAmount: subtotal, taxRate: s.international ? 0 : 20, amount: subtotal, taxAmount }
      ],
      subtotal: money(subtotal),
      taxRate: s.international ? '0.00' : '20.00',
      taxAmount: money(taxAmount),
      total: money(total),
      currency: 'GBP',
      status,
      paymentTerms: s.org.terms,
      dueDate: after(createdAt, s.org.terms * DAY),
      sentAt,
      paidAt,
      voidedAt: status === 'VOID' ? after(createdAt, 2 * DAY) : null,
      notes: status === 'VOID' ? 'Raised in error - consolidated into monthly statement' : null,
      createdBy: finance.id,
      createdAt
    });
    if (status === 'PAID' || status === 'PARTIALLY_PAID') {
      const method = pick(['CARD', 'CARD', 'CARD', 'MANUAL', 'MANUAL', 'CASH']);
      const amount = status === 'PAID' ? total : Number((total / 2).toFixed(2));
      const paymentId = randomUUID();
      const at = paidAt ?? after(createdAt, Math.min(ageDays - 0.05, 3) * DAY);
      paymentRows.push({
        id: paymentId,
        tenantId,
        invoiceId: id,
        shipmentId: s.id,
        customerId: s.org.customerId,
        amount: money(amount),
        currency: 'GBP',
        method,
        status: 'COMPLETED',
        gatewayRef: method === 'CARD' ? `pi_3Q${randomBytes(8).toString('hex')}` : method === 'MANUAL' ? `BACS-${int(100000, 999999)}` : null,
        idempotencyKey: `showcase-pay-${paymentId}`,
        createdAt: at
      });
      if (method === 'CARD') cardPayments.push({ id: paymentId, amount, at });
    }
  }
  // Cash-on-delivery collections still with drivers (COD remittance view).
  for (const s of ships.filter((x) => x.status === 'OUT_FOR_DELIVERY' && x.driver).slice(0, 5)) {
    const id = randomUUID();
    paymentRows.push({ id, tenantId, shipmentId: s.id, customerId: s.org.customerId, amount: money(s.price * 1.2), currency: 'GBP', method: 'CASH', status: 'PENDING', idempotencyKey: `showcase-cod-${id}`, createdAt: s.createdAt });
  }
  for (let i = 0; i < invoiceRows.length; i += 200) {
    await prisma.invoice.createMany({ data: invoiceRows.slice(i, i + 200).map((r) => ({ ...r, status: 'DRAFT' as const, kind: 'TENANT_CUSTOMER' as const })) });
  }
  const minor = (v: unknown) => Math.round(Number(v) * 100);
  for (let i = 0; i < invoiceRows.length; i += 100) {
    const values = invoiceRows.slice(i, i + 100).map((r) => {
      const issue = invoiceIssue.get(r.id!)!;
      const issued = issue.status !== 'DRAFT';
      const total = minor(r.total);
      const paid = issue.status === 'PAID' ? total : issue.status === 'PARTIALLY_PAID' ? Math.round(total / 2) : 0;
      const hash = issued ? createHash('sha256').update(JSON.stringify({ n: r.invoiceNumber, t: r.total, l: r.lineItems })).digest('hex') : null;
      return Prisma.sql`(${r.id}, ${issue.status}, ${issued ? issue.fiscalYear : null}::int, ${issued ? issue.sequenceNumber : null}::bigint, ${issued ? (r.sentAt ?? r.createdAt) : null}::timestamptz, ${issued ? finance.id : null}, ${hash}, ${minor(r.subtotal)}::bigint, ${minor(r.taxAmount)}::bigint, ${total}::bigint, ${paid}::bigint, ${issue.status === 'VOID' ? 0 : total - paid}::bigint)`;
    });
    await prisma.$executeRaw`
      update invoices as i set
        status = v.status::"InvoiceStatus", "fiscalYear" = v.fy, "sequenceNumber" = v.seq, "issuedAt" = v.issued, "issuedBy" = v.issued_by,
        "contentHashSha256" = v.hash, "subtotalMinor" = v.sub, "taxTotalMinor" = v.tax, "totalMinor" = v.tot, "amountPaidMinor" = v.paid, "amountDueMinor" = v.due
      from (values ${Prisma.join(values)}) as v(id, status, fy, seq, issued, issued_by, hash, sub, tax, tot, paid, due)
      where i.id = v.id and i."tenantId" = ${tenantId}`;
  }
  for (const [fiscalYear, count] of invoiceCountByYear) {
    await prisma.$executeRaw`insert into invoice_sequences (tenant_id, fiscal_year, next_number, prefix, padding, created_at, updated_at)
      values (${tenantId}, ${fiscalYear}, ${count + 1}, 'INV', 6, now(), now())
      on conflict (tenant_id, fiscal_year) do update set next_number = excluded.next_number, updated_at = now()`;
  }
  for (let i = 0; i < paymentRows.length; i += 200) await prisma.payment.createMany({ data: paymentRows.slice(i, i + 200).map((r) => ({ ...r, kind: 'TENANT_CUSTOMER' as const })) });

  // Refunds + credit notes on a handful of paid invoices.
  const paidInvoices = invoiceRows.filter((r) => r.status === 'PAID');
  for (const [i, inv] of paidInvoices.slice(-40).filter((_, idx) => idx % 9 === 0).entries()) {
    const payment = paymentRows.find((p) => p.invoiceId === inv.id);
    if (!payment) continue;
    const amount = Number((Number(inv.total) * (i % 2 === 0 ? 0.25 : 1)).toFixed(2));
    await prisma.refund.create({
      data: { kind: 'TENANT_CUSTOMER', tenantId, paymentId: payment.id!, amount: money(amount), reason: pick(['Damaged in transit', 'Late delivery - SLA credit', 'Duplicate charge']), status: 'COMPLETED', initiatedBy: finance.id, idempotencyKey: `showcase-refund-${payment.id}`, createdAt: after(payment.createdAt as Date, 2 * DAY) }
    });
    await prisma.payment.update({ where: { kind: 'TENANT_CUSTOMER', id: payment.id! }, data: { refundedAmount: money(amount), status: amount >= Number(inv.total) ? 'REFUNDED' : 'COMPLETED' } });
    await prisma.creditNote.create({
      data: { kind: 'TENANT_CUSTOMER', tenantId, invoiceId: inv.id!, customerId: inv.customerId, organisationId: inv.organisationId, creditNumber: `${slugUpper}-CR-${NOW.getUTCFullYear()}-${String(i + 1).padStart(4, '0')}`, amount: money(amount), reason: 'Service credit', appliedTo: inv.invoiceNumber, createdAt: after(payment.createdAt as Date, 2 * DAY) }
    });
  }

  // Weekly Stripe payouts, with card payments matched and a couple of unmatched lines to reconcile.
  for (let week = 6; week >= 1; week--) {
    const from = ago((week + 1) * 7 * DAY);
    const to = ago(week * 7 * DAY);
    const lines = cardPayments.filter((p) => p.at >= from && p.at < to);
    if (!lines.length) continue;
    const fees = lines.map((l) => Number((l.amount * 0.015 + 0.2).toFixed(2)));
    const amount = lines.reduce((sum, l, i) => sum + l.amount - fees[i], 0);
    const payoutId = `po_1Q${randomBytes(7).toString('hex')}`;
    const payout = await prisma.gatewayPayout.create({
      data: { tenantId, provider: 'STRIPE', providerPayoutId: payoutId, arrivalDate: after(to, 2 * DAY), amount: money(amount), currency: 'GBP', status: 'paid', rawPayload: { id: payoutId, object: 'payout' }, createdAt: after(to, 2 * DAY) }
    });
    const payoutLines: Prisma.GatewayPayoutLineCreateManyInput[] = lines.map((l, i) => ({
      tenantId,
      payoutId: payout.id,
      providerTxnId: `txn_1Q${randomBytes(8).toString('hex')}`,
      amount: money(l.amount - fees[i]),
      currency: 'GBP',
      type: 'charge',
      matchedPaymentId: l.id,
      rawPayload: { fee: fees[i] }
    }));
    if (week === 1) {
      payoutLines.push(
        { tenantId, payoutId: payout.id, providerTxnId: `txn_1Q${randomBytes(8).toString('hex')}`, amount: '186.40', currency: 'GBP', type: 'charge', rawPayload: { description: 'Card payment - reference missing' } },
        { tenantId, payoutId: payout.id, providerTxnId: `txn_1Q${randomBytes(8).toString('hex')}`, amount: '-42.00', currency: 'GBP', type: 'adjustment', rawPayload: { description: 'Dispute fee' } }
      );
    }
    await prisma.gatewayPayoutLine.createMany({ data: payoutLines });
  }

  // --- Returns ------------------------------------------------------------------------------
  const returnStatuses = ['REQUESTED', 'REQUESTED', 'APPROVED', 'LABEL_ISSUED', 'PICKED_UP', 'IN_HUB', 'RECEIVED', 'REFUNDED', 'RESOLVED', 'RESOLVED', 'REJECTED'] as const;
  const returnReasons = ['Damaged in transit', 'Wrong item delivered', 'No longer required', 'Arrived after deadline', 'Item faulty on arrival', 'Damaged in transit'];
  const returnCandidates = delivered.filter((s) => s.deliveredAt! < ago(2 * DAY)).slice(-30);
  const returnRows: Prisma.ReturnRequestCreateManyInput[] = [];
  for (const [i, status] of returnStatuses.entries()) {
    const s = returnCandidates[i * 2];
    if (!s) break;
    const item = itemRows.find((r) => r.shipmentId === s.id)!;
    const createdAt = after(s.deliveredAt!, int(1, 3) * DAY);
    const progressed = !['REQUESTED', 'REJECTED'].includes(status);
    returnRows.push(
      {
        tenantId,
        shipmentId: s.id,
        customerId: s.org.customerId,
        organisationId: s.org.id,
        status,
        reason: returnReasons[i % returnReasons.length],
        items: [{ description: item.description, quantity: 1, value: Number(item.declaredValue) / (item.quantity ?? 1) }],
        notes: status === 'REJECTED' ? 'Outside the 14-day returns window' : null,
        handledBy: progressed || status === 'REJECTED' ? pick(opsStaff).id : null,
        approvedAt: progressed ? after(createdAt, 4 * HOUR) : null,
        receivedAt: ['RECEIVED', 'REFUNDED', 'RESOLVED'].includes(status) ? after(createdAt, 2 * DAY) : null,
        refundedAt: status === 'REFUNDED' ? after(createdAt, 3 * DAY) : null,
        resolvedAt: status === 'RESOLVED' ? after(createdAt, 4 * DAY) : null,
        returnFee: i % 3 === 0 ? '9.95' : null,
        paymentStatus: i % 3 === 0 ? (progressed ? 'PAID' : 'INVOICE_SENT') : 'NONE',
        createdAt,
        updatedAt: new Date(Math.min(NOW.getTime() - int(1, 20) * HOUR, after(createdAt, int(0, 4) * DAY).getTime()))
      }
    );
  }
  await prisma.returnRequest.createMany({ data: returnRows });

  // --- Support tickets ----------------------------------------------------------------------
  const tickets = [
    { subject: 'Pallet delivered to wrong loading bay', category: 'DELIVERY_ISSUE', priority: 'HIGH', status: 'OPEN', ageH: 2 },
    { subject: 'Can we add a second collection on Fridays?', category: 'OTHER', priority: 'NORMAL', status: 'OPEN', ageH: 5 },
    { subject: 'Tracking stuck on "In transit" since Tuesday', category: 'TRACKING_ISSUE', priority: 'NORMAL', status: 'IN_PROGRESS', ageH: 20 },
    { subject: 'Invoice total does not match our PO', category: 'BILLING_QUERY', priority: 'NORMAL', status: 'WAITING_CUSTOMER', ageH: 30 },
    { subject: 'Two cartons arrived crushed', category: 'DAMAGED_GOODS', priority: 'URGENT', status: 'IN_PROGRESS', ageH: 8 },
    { subject: 'Update delivery address for tomorrow\'s drop', category: 'WRONG_ADDRESS', priority: 'HIGH', status: 'OPEN', ageH: 1 },
    { subject: 'Return label not received', category: 'RETURN_REQUEST', priority: 'LOW', status: 'RESOLVED', ageH: 70 },
    { subject: 'Card payment declined twice', category: 'PAYMENT_ISSUE', priority: 'HIGH', status: 'RESOLVED', ageH: 96 },
    { subject: 'Need proof of delivery for audit', category: 'DELIVERY_ISSUE', priority: 'NORMAL', status: 'CLOSED', ageH: 200 },
    { subject: 'Driver could not access site - rebook please', category: 'DELIVERY_ISSUE', priority: 'NORMAL', status: 'IN_PROGRESS', ageH: 26 },
    { subject: 'Request for monthly consolidated invoicing', category: 'BILLING_QUERY', priority: 'LOW', status: 'WAITING_CUSTOMER', ageH: 50 },
    { subject: 'Customs paperwork for Lagos shipment', category: 'OTHER', priority: 'HIGH', status: 'OPEN', ageH: 3 }
  ] as const;
  const ticketMonthCount = new Map<string, number>();
  for (const [i, tk] of tickets.entries()) {
    const createdAt = ago(tk.ageH * HOUR);
    const org = orgs[i % orgs.length];
    const ym = `${createdAt.getUTCFullYear()}${String(createdAt.getUTCMonth() + 1).padStart(2, '0')}`;
    const n = (ticketMonthCount.get(ym) ?? 0) + 1;
    ticketMonthCount.set(ym, n);
    const shipment = ships.filter((s) => s.org.id === org.id)[i % 3];
    const assignee = tk.status === 'OPEN' && i % 2 === 1 ? null : pick(opsStaff);
    const ticket = await prisma.supportTicket.create({
      data: {
        tenantId,
        ticketNumber: `${slugUpper}-TKT-${ym}-${String(n).padStart(4, '0')}`,
        customerId: org.customerId,
        shipmentId: shipment?.id,
        subject: tk.subject,
        category: tk.category,
        priority: tk.priority,
        status: tk.status,
        assignedTo: assignee?.id,
        resolvedAt: tk.status === 'RESOLVED' || tk.status === 'CLOSED' ? after(createdAt, 20 * HOUR) : null,
        closedAt: tk.status === 'CLOSED' ? after(createdAt, 48 * HOUR) : null,
        createdAt,
        updatedAt: ago(Math.max(0.2, tk.ageH * 0.4) * HOUR)
      }
    });
    const thread = [
      { authorId: org.customerId, body: `Hi team, ${tk.subject.toLowerCase()}. Reference ${shipment?.trackingNumber ?? 'n/a'}. Can you take a look?`, internal: false },
      ...(assignee ? [{ authorId: assignee.id, body: 'Thanks for flagging this - I\'m looking into it with the driver now and will update you within the hour.', internal: false }] : []),
      ...(assignee && tk.ageH > 4 ? [{ authorId: assignee.id, body: 'Checked the Fauward Go timeline and POD photo; escalating to the depot lead.', internal: true }] : []),
      ...(tk.status === 'RESOLVED' || tk.status === 'CLOSED' ? [{ authorId: org.customerId, body: 'Perfect, that\'s sorted - thank you for the quick turnaround.', internal: false }] : [])
    ];
    await prisma.ticketMessage.createMany({
      data: thread.map((m, idx) => ({ tenantId, ticketId: ticket.id, authorId: m.authorId, body: m.body, visibility: m.internal ? 'TENANT_INTERNAL' : 'PUBLIC', createdAt: after(createdAt, idx * Math.max(0.1, tk.ageH / (thread.length + 1)) * HOUR) }))
    });
  }

  // --- Notifications for the admin -----------------------------------------------------------
  const live = ships.filter((s) => s.status === 'OUT_FOR_DELIVERY');
  const notifications = [
    { type: 'shipment.exception', title: 'Shipment needs attention', body: 'An in-transit shipment was flagged: address could not be verified.', minutes: 12, read: false },
    { type: 'support.ticket.created', title: 'New urgent ticket', body: 'Two cartons arrived crushed - Silverline Electronics', minutes: 35, read: false },
    { type: 'finance.payout.received', title: 'Stripe payout arrived', body: 'Your weekly payout has been deposited.', minutes: 180, read: false },
    { type: 'shipment.delivered', title: 'Delivered on time', body: `${live[0]?.trackingNumber ?? 'A shipment'} was signed for by the recipient.`, minutes: 240, read: true },
    { type: 'agent.proposal', title: 'Agent suggests a driver', body: '2 unassigned jobs can be covered by drivers already nearby.', minutes: 20, read: false },
    { type: 'return.requested', title: 'Return requested', body: 'Oakridge Furniture Co. requested a return.', minutes: 420, read: true },
    { type: 'invoice.paid', title: 'Invoice paid', body: 'Atlas Components Ltd paid 3 invoices.', minutes: 600, read: true },
    { type: 'team.member.joined', title: 'Lewis Campbell joined the team', body: 'Manchester hub manager', minutes: 1500, read: true }
  ];
  await prisma.inAppNotification.createMany({
    data: notifications.map((n) => ({ tenantId, userId: admin.id, type: n.type, title: n.title, body: n.body, isRead: n.read, readAt: n.read ? ago((n.minutes - 5) * 60_000) : null, link: '/shipments', createdAt: ago(n.minutes * 60_000) }))
  });

  // --- Audit log ----------------------------------------------------------------------------
  const auditActions = [
    ['auth.login', 'User'],
    ['shipment.created', 'Shipment'],
    ['shipment.status_updated', 'Shipment'],
    ['shipment.driver_assigned', 'Shipment'],
    ['invoice.sent', 'Invoice'],
    ['invoice.paid', 'Invoice'],
    ['pricing.rate_card.updated', 'RateCard'],
    ['settings.branding.updated', 'Tenant'],
    ['api_key.created', 'ApiKey'],
    ['webhook.endpoint.created', 'WebhookEndpoint'],
    ['user.invited', 'User'],
    ['return.approved', 'ReturnRequest'],
    ['user.role_changed', 'User']
  ] as const;
  await prisma.auditLog.createMany({
    data: Array.from({ length: 70 }, (_, i) => {
      const [action, resourceType] = auditActions[i % auditActions.length];
      const actor = i % 5 === 0 ? admin : pick(staff);
      const target = resourceType === 'Shipment' ? pick(ships).id : resourceType === 'User' ? pick(staff).id : randomUUID();
      return {
        tenantId,
        actorId: actor.id,
        actorType: 'USER',
        actorIp: `81.${int(100, 199)}.${int(1, 254)}.${int(1, 254)}`,
        action,
        resourceType,
        resourceId: target,
        metadata: { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) Chrome/129.0' },
        timestamp: ago((i * 9 + int(1, 8)) * 60 * 60_000 * 0.9)
      };
    })
  });

  // --- Developer: API keys, usage, webhooks --------------------------------------------------
  const apiKeys: Array<{ id: string }> = [];
  for (const k of [
    { name: 'Shopify order sync', scopes: ['shipments:read', 'shipments:write', 'tracking:read'], sandbox: false, count: 18420 },
    { name: 'Warehouse WMS integration', scopes: ['shipments:read', 'shipments:write', 'labels:write'], sandbox: false, count: 9310 },
    { name: 'Sandbox - partner testing', scopes: ['shipments:read', 'tracking:read'], sandbox: true, count: 742 }
  ]) {
    const raw = `fw_${k.sandbox ? 'test_' : ''}${randomBytes(24).toString('hex')}`;
    apiKeys.push(
      await prisma.apiKey.create({
        data: { tenantId, name: k.name, keyHash: createHash('sha256').update(raw).digest('hex'), keyPrefix: raw.slice(0, 8), scopes: k.scopes, isSandbox: k.sandbox, monthlyRequestCount: k.count, lastUsedAt: ago(int(1, 50) * 60_000), lastUsed: ago(int(1, 50) * 60_000), rateLimit: 5000, createdAt: ago(int(30, 120) * DAY) }
      })
    );
  }
  const endpoints = ['/api/v1/shipments', '/api/v1/shipments/:id', '/api/v1/tracking/:trackingNumber', '/api/v1/labels', '/api/v1/rates/quote'];
  await prisma.apiUsageRecord.createMany({
    data: Array.from({ length: 600 }, () => {
      const key = pick(apiKeys.slice(0, 2).concat(apiKeys[0]));
      const endpoint = pick(endpoints);
      const statusCode = chance(0.965) ? (endpoint.includes('labels') || endpoint === '/api/v1/shipments' ? pick([200, 201]) : 200) : pick([400, 404, 429, 500]);
      return { tenantId, apiKeyId: key.id, endpoint, method: endpoint === '/api/v1/shipments' || endpoint.includes('labels') || endpoint.includes('quote') ? pick(['GET', 'POST']) : 'GET', statusCode, latencyMs: int(38, statusCode >= 500 ? 2400 : 420), timestamp: ago(between(0, 14) * DAY) };
    })
  });
  for (let m = 5; m >= 0; m--) {
    const d = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - m, 1));
    const month = monthKey(d);
    const shipmentsInMonth = ships.filter((s) => monthKey(s.createdAt) === month).length;
    await prisma.usageRecord.create({
      data: { tenantId, month, shipments: m === 0 ? shipmentsInMonth : shipmentsInMonth || int(120, 190), apiCalls: m === 0 ? 28472 : int(21000, 30000), smsSent: int(800, 1500), emailsSent: int(2400, 4200), storageMb: int(800, 1600) }
    });
  }
  const hooks = [
    await prisma.webhookEndpoint.create({ data: { tenantId, url: 'https://hooks.northgate-retail.example/fauward', secret: `whsec_${randomBytes(16).toString('hex')}`, events: ['shipment.created', 'shipment.status_updated', 'shipment.delivered'] } }),
    await prisma.webhookEndpoint.create({ data: { tenantId, url: 'https://erp.atlas-components.example/webhooks/harbourline', secret: `whsec_${randomBytes(16).toString('hex')}`, events: ['shipment.delivered', 'invoice.created', 'return.requested'] } })
  ];
  await prisma.webhookDelivery.createMany({
    data: Array.from({ length: 48 }, (_, i) => {
      const ep = hooks[i % 2];
      const ok = i % 13 !== 5;
      const eventType = pick(ep.events);
      const s = pick(ships);
      const code = ok ? 200 : 503;
      return {
        tenantId,
        endpointId: ep.id,
        eventType,
        payload: { event: eventType, data: { trackingNumber: s.trackingNumber, status: s.status } },
        status: ok ? 'DELIVERED' : 'FAILED',
        responseStatus: code,
        responseCode: code,
        durationMs: int(80, ok ? 420 : 5000),
        responseLatencyMs: int(80, ok ? 420 : 5000),
        attempt: ok ? 1 : 3,
        attemptCount: ok ? 1 : 3,
        responseBody: ok ? '{"received":true}' : 'Service Unavailable',
        createdAt: ago(i * 47 * 60_000)
      };
    })
  });

  // --- AI agent -----------------------------------------------------------------------------
  const month = monthKey(NOW);
  await prisma.tenantAiLimit.create({ data: { tenantId, monthlyBudgetUsd: 250, flashRequestLimit: 20000, proRequestLimit: 4000, featuresEnabled: [] } });
  await prisma.tenantAiUsage.createMany({
    data: [
      { tenantId, month, model: 'deepseek-v4-flash', feature: 'agent_ask', requestCount: 1284, tokenCount: 1_942_000, costUsd: 0.78 },
      { tenantId, month, model: 'deepseek-v4-flash', feature: 'tracking_customer_summary', requestCount: 3420, tokenCount: 2_610_000, costUsd: 1.04 },
      { tenantId, month, model: 'deepseek-v4-flash', feature: 'address_cleanup', requestCount: 912, tokenCount: 402_000, costUsd: 0.16 },
      { tenantId, month, model: 'deepseek-v4-pro', feature: 'driver_assignment', requestCount: 486, tokenCount: 1_180_000, costUsd: 4.72 },
      { tenantId, month, model: 'deepseek-v4-pro', feature: 'sla_risk_explanation', requestCount: 214, tokenCount: 520_000, costUsd: 2.08 },
      { tenantId, month, model: 'deepseek-v4-flash', feature: 'customs_declaration_draft', requestCount: 61, tokenCount: 140_000, costUsd: 0.06 }
    ]
  });
  const runAt = ago(18 * 60_000);
  const run = await prisma.aiAgentRun.create({
    data: { tenantId, agentType: 'sweep', input: { trigger: 'schedule' }, output: { summary: 'Scanned active shipments' }, status: 'COMPLETED', stage: 'done', scannedCount: ships.filter((s) => !['DELIVERED', 'CANCELLED', 'RETURNED'].includes(s.status)).length, flaggedCount: 4, proposedCount: 3, onTrackCount: Math.max(0, ships.filter((s) => ['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY'].includes(s.status)).length - 2), durationMs: 8420, finishedAt: after(runAt, 8420), createdAt: runAt }
  });
  const unassigned = ships.filter((s) => s.status === 'PENDING' || s.status === 'PROCESSING').slice(0, 2);
  const failed = ships.filter((s) => s.status === 'FAILED_DELIVERY').slice(-1);
  const exception = ships.filter((s) => s.status === 'EXCEPTION').slice(0, 1);
  const londonDriver = drivers[0];
  await prisma.agentAction.createMany({
    data: [
      ...unassigned.map((s) => ({ tenantId, runId: run.id, type: 'flag_finding', payload: { kind: 'unassigned', shipmentId: s.id, trackingNumber: s.trackingNumber, status: s.status }, risk: 'auto_approved', status: 'AUTO_APPLIED', createdAt: runAt })),
      ...failed.map((s) => ({ tenantId, runId: run.id, type: 'flag_finding', payload: { kind: 'failed_unhandled', shipmentId: s.id, trackingNumber: s.trackingNumber, failedAt: s.lastEventAt.toISOString() }, risk: 'auto_approved', status: 'AUTO_APPLIED', createdAt: runAt })),
      ...exception.map((s) => ({ tenantId, runId: run.id, type: 'flag_finding', payload: { kind: 'stuck', shipmentId: s.id, trackingNumber: s.trackingNumber, exceptionCaseId: null }, risk: 'auto_approved', status: 'AUTO_APPLIED', createdAt: runAt })),
      ...unassigned.map((s) => ({ tenantId, runId: run.id, type: 'assign_shipment', payload: { shipmentId: s.id, trackingNumber: s.trackingNumber, findingKind: 'unassigned', driverId: londonDriver.id, driverName: londonDriver.name, reason: `${londonDriver.name} is 2.1 km away with capacity for 3 more stops today.` }, risk: 'requires_approval', status: 'PENDING_APPROVAL', createdAt: runAt })),
      ...failed.map((s) => ({ tenantId, runId: run.id, type: 'send_customer_notification', payload: { shipmentId: s.id, trackingNumber: s.trackingNumber, findingKind: 'failed_unhandled', channel: 'email', templateKey: 'failed_delivery', reason: 'Delivery failed with no rebooking yet - offer the customer a new slot.' }, risk: 'requires_approval', status: 'PENDING_APPROVAL', createdAt: runAt })),
      ...ships
        .filter((s) => s.status === 'DELIVERED' && s.deliveredAt! >= startOfTodayUtc)
        .slice(0, 4)
        .map((s, i) => ({ tenantId, runId: run.id, type: 'assign_shipment', payload: { shipmentId: s.id, trackingNumber: s.trackingNumber, findingKind: 'unassigned', driverId: s.driver?.id ?? londonDriver.id, reason: 'Nearest available driver' }, risk: 'requires_approval', status: 'APPLIED', approvedBy: manager.id, appliedAt: ago((40 + i * 25) * 60_000), createdAt: ago((60 + i * 25) * 60_000) }))
    ]
  });
  const convo = await prisma.agentConversation.create({ data: { tenantId, createdBy: admin.id, title: 'Which deliveries are at risk of missing SLA today?', createdAt: ago(50 * 60_000) } });
  await prisma.agentMessage.createMany({
    data: [
      { tenantId, conversationId: convo.id, role: 'user', content: 'Which deliveries are at risk of missing SLA today?', createdAt: ago(50 * 60_000) },
      {
        tenantId,
        conversationId: convo.id,
        role: 'assistant',
        status: 'answered',
        content: `3 shipments are at risk today:\n\n1. One exception held at the London depot awaiting address confirmation.\n2. ${failed[0]?.trackingNumber ?? 'A failed delivery'} - failed delivery yesterday, not yet rebooked.\n3. A Manchester express job whose ETA is within 40 minutes of its SLA.\n\nEverything else (${live.length} out for delivery) is on track. Want me to propose reassignments?`,
        createdAt: ago(49 * 60_000)
      },
      { tenantId, conversationId: convo.id, role: 'user', content: 'Yes, propose a driver for the unassigned ones.', createdAt: ago(47 * 60_000) },
      { tenantId, conversationId: convo.id, role: 'assistant', status: 'proposed', content: `I've proposed ${londonDriver.name} for ${unassigned.length} unassigned London jobs - approve them in Agent Tasks.`, createdAt: ago(46 * 60_000) }
    ]
  });

  // --- Control tower: driver permission requests ---------------------------------------------
  const reassignable = ships.filter((s) => s.driver && (s.status === 'OUT_FOR_DELIVERY' || s.status === 'PICKED_UP')).slice(0, 3);
  for (const [i, s] of reassignable.entries()) {
    await prisma.shipmentPermissionRequest.create({
      data: {
        tenantId,
        shipmentId: s.id,
        requestedByUserId: s.driver!.userId,
        requestedAction: 'reassign_driver',
        status: 'PENDING',
        note: ['Van tail-lift fault - need another driver for this pallet', 'Running 45 min behind after road closure on the A40', 'Customer asked for an evening slot I can\'t cover'][i],
        expiresAt: after(NOW, 4 * HOUR),
        createdAt: ago((15 + i * 22) * 60_000)
      }
    });
  }

  // --- Privacy, health ----------------------------------------------------------------------
  await prisma.dSARRequest.createMany({
    data: [
      { tenantId, requesterEmail: 'j.ellis@customer.example', requestType: 'ACCESS', status: 'IN_PROGRESS', dueAt: after(NOW, 21 * DAY), receivedAt: ago(9 * DAY) },
      { tenantId, requesterEmail: 'r.singh@customer.example', requestType: 'ERASURE', status: 'COMPLETED', dueAt: ago(10 * DAY), receivedAt: ago(40 * DAY), closedAt: ago(14 * DAY) }
    ]
  });
  await prisma.tenantHealthScore.create({ data: { tenantId, score: 94, trend: 'up', factors: { activeUsers: 'high', shipmentGrowth: 'up', paymentsHealthy: true, integrations: ['api', 'webhooks'] } } });

  // --- Messaging (relay tables are owned by the relay service, written with raw SQL) ----------
  const relayThreads = [
    { subject: 'Enable SSO for our Manchester team', status: 'open', minutes: 25, messages: [['customer', 'Hi Fauward team - can you help us enable Microsoft SSO for the Manchester branch?'], ['admin', 'Absolutely. SSO is included on your Enterprise plan - we\'ve sent setup steps to your inbox and can join a call tomorrow.']] },
    { subject: 'Custom tracking domain', status: 'assigned', minutes: 300, messages: [['customer', 'We\'d like track.harbourline to show our branding on the tracking page.'], ['admin', 'Your domain is verified - tracking pages are now served from your custom domain.'], ['customer', 'Brilliant, thank you!']] },
    { subject: 'Quarterly business review', status: 'closed', minutes: 4000, messages: [['admin', 'Your QBR deck is ready - on-time delivery is up 4.2% quarter on quarter.'], ['customer', 'Great results, see you Thursday.']] }
  ];
  for (const thread of relayThreads) {
    const convoId = randomUUID();
    const lastAt = ago(thread.minutes * 60_000);
    await prisma.$executeRaw`insert into relay_conversations (id, tenant_id, source_app, customer_name, customer_email, subject, status, last_message_at, created_at)
      values (${convoId}::uuid, ${tenantId}, 'tenant_portal'::relay_source, ${'Amelia Hart'}, ${ADMIN_EMAIL}, ${thread.subject}, ${thread.status}::relay_status, ${lastAt}, ${new Date(lastAt.getTime() - thread.messages.length * 20 * 60_000)})`;
    for (const [idx, [sender, body]] of thread.messages.entries()) {
      const at = new Date(lastAt.getTime() - (thread.messages.length - 1 - idx) * 20 * 60_000);
      await prisma.$executeRaw`insert into relay_messages (conversation_id, sender_type, sender_id, body, created_at, read_at, is_draft, draft_mode)
        values (${convoId}::uuid, ${sender}::relay_sender, ${sender === 'customer' ? admin.id : null}, ${body}, ${at}, ${at}, false, false)`;
    }
  }

  const counts = {
    shipments: ships.length,
    events: eventRows.length,
    invoices: invoiceRows.length,
    payments: paymentRows.length,
    outForDelivery: live.length,
    deliveredToday: ships.filter((s) => s.deliveredAt && s.deliveredAt >= startOfTodayUtc).length
  };
  process.stdout.write(
    `\nShowcase tenant ready: ${SHOWCASE_NAME} (${SHOWCASE_SLUG}), plan ENTERPRISE\n` +
      `${JSON.stringify(counts)}\n\n` +
      `Login:    http://localhost:3000/login?tenant=${SHOWCASE_SLUG}\n` +
      `Email:    ${ADMIN_EMAIL}\n` +
      `Password: ${ADMIN_PASSWORD}\n` +
      `Drivers stay "live" for ~15 minutes - re-run with --reset before a new screenshot session.\n`
  );
}

main()
  .catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
