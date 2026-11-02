import type { FastifyInstance, FastifyRequest } from 'fastify';
import { Prisma, type DemoEnvironment, type ShipmentStatus, type TrackingStatus } from '@prisma/client';
import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { config } from '../config/index.js';
import {
  DEMO_DEFAULT_DAYS,
  DEMO_DOMESTIC_PLACES,
  DEMO_INTERNATIONAL_PLACES,
  DEMO_MAX_DAYS,
  DEMO_SESSION_HOURS,
  DEMO_TEMPLATES,
  findDemoTemplate,
  type DemoPlace,
  type DemoTemplate
} from '../config/demo-templates.js';
import { domainService } from '../modules/tenants/domain.service.js';
import { hashPassword } from '../shared/utils/hash.js';
import { signDemoAccessToken } from '../shared/utils/jwt.js';
import { auditedMutation, staffMutationActor, type MutationActor } from './console-mutation.js';
import { hashShareToken, shareFingerprint } from './demo-session.js';

// gtm.demos (WP-4.15). A demo is a Tenant with status DEMO, a TENANT_ADMIN whose one-time password is returned once,
// data seeded from a code-defined template, and a share link (`/demo/<token>` on the tenant portal, token stored only
// as sha256) that opens a read-only session as that admin. Ending a demo (staff teardown or the expiry job) closes the
// workspace, deactivates its users and clears the share link; the tenant keeps status DEMO so it stays out of MRR,
// health, the funnel and attribution. Only DEMO tenants can be ended.

const SERVICE = 'gtm.demos';
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export class DemoError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

function shareUrl(token: string) {
  return `${config.tenantPortalUrl.replace(/\/$/, '')}/demo/${token}`;
}

function newShareToken() {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashShareToken(token) };
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

type DemoWithTenant = DemoEnvironment & { tenant: { id: string; name: string; slug: string; status: string; closedAt: Date | null } | null };

function present(row: DemoWithTenant) {
  const template = findDemoTemplate(row.template);
  return {
    id: row.id,
    tenant: row.tenant ? { id: row.tenant.id, name: row.tenant.name, slug: row.tenant.slug, status: row.tenant.status, closed: Boolean(row.tenant.closedAt) } : { id: row.tenantId, name: row.tenantId, slug: null, status: null, closed: false },
    template: { id: row.template, name: template?.name ?? row.template },
    prospectName: row.prospectName,
    status: row.status,
    expiresAt: row.expiresAt.toISOString(),
    adminEmail: row.adminEmail,
    shareLinkActive: Boolean(row.shareTokenHash) && row.status === 'ACTIVE',
    shareRotatedAt: iso(row.shareRotatedAt),
    seedSummary: row.seedSummary,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    endedAt: iso(row.endedAt),
    endReason: row.endReason
  };
}

async function withTenants(app: Pick<FastifyInstance, 'prisma'>, rows: DemoEnvironment[]): Promise<DemoWithTenant[]> {
  const ids = [...new Set(rows.map((row) => row.tenantId))];
  const tenants = ids.length ? await app.prisma.tenant.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, slug: true, status: true, closedAt: true } }) : [];
  const byId = new Map(tenants.map((tenant) => [tenant.id, tenant]));
  return rows.map((row) => ({ ...row, tenant: byId.get(row.tenantId) ?? null }));
}

// ── Templates and lists ─────────────────────────────────────────────────────

export function listTemplates() {
  return {
    data: DEMO_TEMPLATES.map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description,
      plan: template.plan,
      organisations: template.organisations.length,
      shipments: template.shipments
    })),
    limits: { maxDays: DEMO_MAX_DAYS, defaultDays: DEMO_DEFAULT_DAYS, sessionHours: DEMO_SESSION_HOURS }
  };
}

export const demoListQuery = z.object({ status: z.enum(['ACTIVE', 'ENDED', 'ALL']).default('ACTIVE') });

export async function listDemos(app: Pick<FastifyInstance, 'prisma'>, query: z.infer<typeof demoListQuery>) {
  const where: Prisma.DemoEnvironmentWhereInput = query.status === 'ALL' ? {} : query.status === 'ACTIVE' ? { status: 'ACTIVE' } : { status: { in: ['EXPIRED', 'TORN_DOWN'] } };
  const rows = await app.prisma.demoEnvironment.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
  return { data: (await withTenants(app, rows)).map(present) };
}

export async function getDemo(app: Pick<FastifyInstance, 'prisma'>, id: string) {
  const row = await app.prisma.demoEnvironment.findUnique({ where: { id } });
  if (!row) throw new DemoError(404, 'DEMO_NOT_FOUND', 'Demo not found');
  const [withTenant] = await withTenants(app, [row]);
  return present(withTenant);
}

// ── Seed ─────────────────────────────────────────────────────────────────────

const STATUS_MIX: readonly ShipmentStatus[] = ['DELIVERED', 'DELIVERED', 'DELIVERED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'PICKED_UP', 'PROCESSING', 'PENDING', 'DELIVERED', 'EXCEPTION', 'IN_TRANSIT', 'FAILED_DELIVERY'];
const LIFECYCLE: readonly ShipmentStatus[] = ['PENDING', 'PROCESSING', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'];
const TRACKING: Record<ShipmentStatus, TrackingStatus> = {
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
const TITLES: Record<ShipmentStatus, string> = {
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
const TIER_PRICE: Record<string, number> = { STANDARD: 1, EXPRESS: 1.6, OVERNIGHT: 2.2 };

function chainFor(status: ShipmentStatus): ShipmentStatus[] {
  if (status === 'EXCEPTION') return ['PENDING', 'PROCESSING', 'PICKED_UP', 'IN_TRANSIT', 'EXCEPTION'];
  if (status === 'FAILED_DELIVERY') return ['PENDING', 'PROCESSING', 'PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'FAILED_DELIVERY'];
  return LIFECYCLE.slice(0, LIFECYCLE.indexOf(status) + 1);
}

function pick<T>(items: readonly T[]): T {
  return items[randomInt(items.length)];
}

function between(min: number, max: number) {
  return min + (randomInt(1_000_000) / 1_000_000) * (max - min);
}

function demoAddress(place: DemoPlace, name: string) {
  return { name, line1: place.street, city: place.city, postcode: place.postcode, country: place.country };
}

/** Writes the template's organisations and shipments (with items, events and tracking snapshots) for one demo tenant. */
export async function seedDemoData(tx: Prisma.TransactionClient, tenantId: string, template: DemoTemplate, now: Date) {
  const organisations = await Promise.all(template.organisations.map((name) => tx.organisation.create({ data: { tenantId, name, billingEmail: `accounts@${name.toLowerCase().replace(/[^a-z]+/g, '')}.example`, paymentTerms: 30 } })));
  const shipments: Prisma.ShipmentCreateManyInput[] = [];
  const items: Prisma.ShipmentItemCreateManyInput[] = [];
  const events: Prisma.ShipmentEventCreateManyInput[] = [];
  const snapshots: Prisma.TrackingSnapshotCreateManyInput[] = [];
  for (let index = 0; index < template.shipments; index += 1) {
    const status = STATUS_MIX[index % STATUS_MIX.length];
    const chain = chainFor(status);
    const organisation = organisations[index % organisations.length];
    const international = index / template.shipments < template.internationalShare;
    const origin = pick(DEMO_DOMESTIC_PLACES);
    const destination = international ? pick(DEMO_INTERNATIONAL_PLACES) : pick(DEMO_DOMESTIC_PLACES.filter((place) => place !== origin));
    const tier = pick(template.serviceTiers);
    const item = pick(template.items);
    const weight = between(item.kg[0], item.kg[1]);
    const price = (8 + weight * 0.9) * (TIER_PRICE[tier] ?? 1) * (international ? 3 : 1);
    // Spread creation over the last four weeks; later steps follow a few hours apart and never pass `now`.
    const createdAt = new Date(now.getTime() - between(2, 28) * DAY_MS);
    const step = Math.min(between(3, 10) * HOUR_MS, (now.getTime() - createdAt.getTime()) / (chain.length + 1));
    const times = chain.map((_, position) => new Date(createdAt.getTime() + position * step));
    const id = randomUUID();
    const trackingNumber = `DM-${randomBytes(5).toString('hex').toUpperCase()}`;
    const last = times[times.length - 1];
    shipments.push({
      id,
      tenantId,
      trackingNumber,
      organisationId: organisation.id,
      status,
      originAddress: demoAddress(origin, organisation.name),
      destinationAddress: demoAddress(destination, 'Goods In'),
      serviceTier: tier,
      estimatedDelivery: new Date(createdAt.getTime() + (international ? 5 : tier === 'STANDARD' ? 3 : 1) * DAY_MS),
      actualDelivery: status === 'DELIVERED' ? last : null,
      price: price.toFixed(2),
      currency: 'GBP',
      weightKg: weight.toFixed(3),
      createdAt,
      updatedAt: last
    });
    items.push({ tenantId, shipmentId: id, description: item.description, quantity: 1, weightKg: weight.toFixed(3), declaredValue: between(item.value[0], item.value[1]).toFixed(2) });
    chain.forEach((step, position) => {
      const place = position < 3 ? origin : destination;
      events.push({ tenantId, shipmentId: id, status: step, location: { city: place.city, country: place.country }, notes: step === 'EXCEPTION' ? 'Held at depot awaiting address confirmation' : null, actorType: 'SYSTEM', source: 'DEMO_SEED', timestamp: times[position] });
    });
    snapshots.push({
      tenantId,
      shipmentId: id,
      trackingNumber,
      currentStatus: TRACKING[status],
      operationalStatus: TRACKING[status],
      customerStatus: TITLES[status],
      currentTitle: TITLES[status],
      lastEventAt: last,
      originName: origin.city,
      destinationName: destination.city,
      deliveredAt: status === 'DELIVERED' ? last : null,
      hasException: status === 'EXCEPTION' || status === 'FAILED_DELIVERY',
      podAvailable: false
    });
  }
  await tx.shipment.createMany({ data: shipments });
  await tx.shipmentItem.createMany({ data: items });
  await tx.shipmentEvent.createMany({ data: events });
  await tx.trackingSnapshot.createMany({ data: snapshots });
  return { organisations: organisations.length, shipments: shipments.length, events: events.length };
}

// ── Create, extend, share link ──────────────────────────────────────────────

export const createDemoBody = z.object({
  template: z.string().trim().min(1),
  prospectName: z.string().trim().min(2).max(120),
  expiresInDays: z.coerce.number().int().min(1).max(DEMO_MAX_DAYS).default(DEMO_DEFAULT_DAYS)
});
export const extendDemoBody = z.object({ days: z.coerce.number().int().min(1).max(DEMO_MAX_DAYS) });
export const endDemoBody = z.object({ reason: z.string().trim().min(8).max(1000) });

function slugFor(prospectName: string) {
  const base = prospectName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'prospect';
  return `demo-${base}-${randomBytes(3).toString('hex')}`;
}

export async function createDemo(app: FastifyInstance, request: FastifyRequest, body: z.infer<typeof createDemoBody>, now = new Date()) {
  const template = findDemoTemplate(body.template);
  if (!template) throw new DemoError(400, 'UNKNOWN_TEMPLATE', `Unknown template "${body.template}".`);
  const slug = slugFor(body.prospectName);
  const adminEmail = `admin@${slug}.demo.invalid`;
  const password = randomBytes(12).toString('base64url');
  const passwordHash = await hashPassword(password);
  const share = newShareToken();
  const expiresAt = new Date(now.getTime() + body.expiresInDays * DAY_MS);
  const staffId = request.platform!.user.id;

  const demo = await auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    const tenant = await tx.tenant.create({ data: { name: `${body.prospectName} (demo)`, slug, plan: template.plan, status: 'DEMO', demoExpiresAt: expiresAt } });
    await tx.tenantSettings.create({ data: { tenantId: tenant.id, timezone: tenant.timezone, currency: tenant.defaultCurrency, opsEmailRecipients: [] } });
    const admin = await tx.user.create({ data: { tenantId: tenant.id, email: adminEmail, passwordHash, role: 'TENANT_ADMIN', firstName: 'Demo', lastName: 'Admin' } });
    const seedSummary = await seedDemoData(tx, tenant.id, template, now);
    const row = await tx.demoEnvironment.create({
      data: { tenantId: tenant.id, template: template.id, prospectName: body.prospectName, shareTokenHash: share.hash, expiresAt, status: 'ACTIVE', createdBy: staffId, adminUserId: admin.id, adminEmail, seedSummary }
    });
    return {
      result: { ...row, tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug, status: tenant.status, closedAt: null } },
      audit: { action: 'DEMO_CREATED', targetTenantId: tenant.id, metadata: { demoId: row.id, template: template.id, prospectName: body.prospectName, expiresAt: expiresAt.toISOString(), seedSummary } },
      activity: { type: 'demos.created', tenantId: tenant.id, subjectType: 'demo_environment', subjectId: row.id, summary: `Demo for ${body.prospectName} created (${template.name})`, consoleLink: `/gtm/demos/${row.id}` }
    };
  });
  // The password and the share link exist only in this response.
  return { demo: present(demo), credentials: { email: adminEmail, password }, shareUrl: shareUrl(share.token) };
}

async function activeDemo(app: Pick<FastifyInstance, 'prisma'>, id: string) {
  const row = await app.prisma.demoEnvironment.findUnique({ where: { id } });
  if (!row) throw new DemoError(404, 'DEMO_NOT_FOUND', 'Demo not found');
  if (row.status !== 'ACTIVE') throw new DemoError(409, 'DEMO_ENDED', 'This demo has ended.');
  const tenant = await app.prisma.tenant.findUnique({ where: { id: row.tenantId }, select: { status: true, name: true } });
  if (tenant?.status !== 'DEMO') throw new DemoError(409, 'NOT_A_DEMO', 'This tenant is not a demo tenant.');
  return { row, tenantName: tenant ? row.prospectName ?? tenant.name : row.tenantId };
}

export async function extendDemo(app: FastifyInstance, request: FastifyRequest, id: string, body: z.infer<typeof extendDemoBody>, now = new Date()) {
  const { row, tenantName } = await activeDemo(app, id);
  const base = row.expiresAt > now ? row.expiresAt : now;
  const next = new Date(base.getTime() + body.days * DAY_MS);
  if (next.getTime() > now.getTime() + DEMO_MAX_DAYS * DAY_MS) throw new DemoError(400, 'TOO_LONG', `A demo can run at most ${DEMO_MAX_DAYS} days from today.`);
  const updated = await auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    const claimed = await tx.demoEnvironment.updateMany({ where: { id, tenantId: row.tenantId, status: 'ACTIVE' }, data: { expiresAt: next } });
    if (claimed.count !== 1) throw new DemoError(409, 'DEMO_ENDED', 'This demo has ended.');
    await tx.tenant.updateMany({ where: { id: row.tenantId, status: 'DEMO' }, data: { demoExpiresAt: next } });
    return {
      result: await tx.demoEnvironment.findUniqueOrThrow({ where: { id } }),
      audit: { action: 'DEMO_EXTENDED', targetTenantId: row.tenantId, metadata: { demoId: id, days: body.days, previousExpiresAt: row.expiresAt.toISOString(), expiresAt: next.toISOString() } },
      activity: { type: 'demos.extended', tenantId: row.tenantId, subjectType: 'demo_environment', subjectId: id, summary: `Demo for ${tenantName} extended to ${next.toISOString().slice(0, 10)}`, consoleLink: `/gtm/demos/${id}` }
    };
  });
  const [withTenant] = await withTenants(app, [updated]);
  return present(withTenant);
}

export async function rotateShareLink(app: FastifyInstance, request: FastifyRequest, id: string, now = new Date()) {
  const { row, tenantName } = await activeDemo(app, id);
  const share = newShareToken();
  const updated = await auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    const claimed = await tx.demoEnvironment.updateMany({ where: { id, tenantId: row.tenantId, status: 'ACTIVE' }, data: { shareTokenHash: share.hash, shareRotatedAt: now } });
    if (claimed.count !== 1) throw new DemoError(409, 'DEMO_ENDED', 'This demo has ended.');
    return {
      result: await tx.demoEnvironment.findUniqueOrThrow({ where: { id } }),
      audit: { action: 'DEMO_SHARE_LINK_ROTATED', targetTenantId: row.tenantId, metadata: { demoId: id } },
      activity: { type: 'demos.share_link_rotated', tenantId: row.tenantId, subjectType: 'demo_environment', subjectId: id, summary: `Demo for ${tenantName}: share link replaced`, consoleLink: `/gtm/demos/${id}` }
    };
  });
  const [withTenant] = await withTenants(app, [updated]);
  return { demo: present(withTenant), shareUrl: shareUrl(share.token) };
}

// ── End (teardown or expiry) ────────────────────────────────────────────────

export const DEMO_EXPIRY_ACTOR: MutationActor = { kind: 'system', id: 'gtm.demo-expiry', label: 'Demo expiry job' };

/**
 * Ends a demo: closes the workspace (status stays DEMO), deactivates its users, revokes their refresh tokens and
 * clears the share link. Refuses tenants that are not DEMO (ACC-DEMO-3).
 */
export async function endDemo(app: FastifyInstance, actor: MutationActor, id: string, input: { reason: string; status: 'TORN_DOWN' | 'EXPIRED' }, now = new Date()) {
  const { row, tenantName } = await activeDemo(app, id);
  const endedBy = actor.kind === 'staff' ? actor.request.platform!.user.id : actor.id;
  const ended = await auditedMutation(app, SERVICE, actor, async (tx) => {
    const claimed = await tx.demoEnvironment.updateMany({
      where: { id, tenantId: row.tenantId, status: 'ACTIVE' },
      data: { status: input.status, endedAt: now, endedBy, endReason: input.reason, shareTokenHash: null }
    });
    if (claimed.count !== 1) throw new DemoError(409, 'DEMO_ENDED', 'This demo has ended.');
    const closed = await tx.tenant.updateMany({ where: { id: row.tenantId, status: 'DEMO' }, data: { closedAt: now } });
    if (closed.count !== 1) throw new DemoError(409, 'NOT_A_DEMO', 'This tenant is not a demo tenant.');
    const users = await tx.user.updateMany({ where: { tenantId: row.tenantId }, data: { isActive: false } });
    await tx.refreshToken.deleteMany({ where: { user: { tenantId: row.tenantId } } });
    const action = input.status === 'EXPIRED' ? 'DEMO_EXPIRED' : 'DEMO_TORN_DOWN';
    return {
      result: { ...(await tx.demoEnvironment.findUniqueOrThrow({ where: { id } })), usersDeactivated: users.count },
      audit: { action, targetTenantId: row.tenantId, reason: input.reason, metadata: { demoId: id, usersDeactivated: users.count } },
      activity: { type: input.status === 'EXPIRED' ? 'demos.expired' : 'demos.torn_down', tenantId: row.tenantId, subjectType: 'demo_environment', subjectId: id, summary: `Demo for ${tenantName} ${input.status === 'EXPIRED' ? 'expired' : 'torn down'}`, consoleLink: `/gtm/demos/${id}` }
    };
  });
  const tenant = await app.prisma.tenant.findUnique({ where: { id: row.tenantId }, select: { customDomain: true } });
  if (tenant?.customDomain) {
    await domainService.removeCustomDomain(app.prisma, { tenantId: row.tenantId, actorUserId: null, actorIp: null, actorType: 'SYSTEM' }).catch((err: unknown) => {
      app.log.error({ err, tenantId: row.tenantId }, 'Demo teardown could not remove the custom domain');
    });
  }
  const { usersDeactivated, ...demo } = ended;
  const [withTenant] = await withTenants(app, [demo]);
  return { demo: present(withTenant), usersDeactivated };
}

export async function teardownDemo(app: FastifyInstance, request: FastifyRequest, id: string, reason: string) {
  return endDemo(app, staffMutationActor(request), id, { reason, status: 'TORN_DOWN' });
}

/** gtm.demo-expiry: ends every ACTIVE demo past its expiry. A demo row whose tenant is not DEMO is left alone. */
export async function expireDemos(app: FastifyInstance, now = new Date()) {
  const due = await app.prisma.demoEnvironment.findMany({ where: { status: 'ACTIVE', expiresAt: { lte: now } }, select: { id: true, tenantId: true } });
  let expired = 0;
  let refused = 0;
  for (const demo of due) {
    try {
      await endDemo(app, DEMO_EXPIRY_ACTOR, demo.id, { reason: 'The demo reached its expiry date.', status: 'EXPIRED' }, now);
      expired += 1;
    } catch (error) {
      if (!(error instanceof DemoError)) throw error;
      refused += 1;
      app.log.warn({ demoId: demo.id, tenantId: demo.tenantId, code: error.code }, 'Demo expiry skipped');
    }
  }
  return { due: due.length, expired, refused };
}

// ── Share-link exchange (public) and tenant view ────────────────────────────

export async function exchangeShareToken(app: Pick<FastifyInstance, 'prisma'>, token: string, now = new Date()) {
  const hash = hashShareToken(token);
  const row = await app.prisma.demoEnvironment.findUnique({ where: { shareTokenHash: hash } });
  if (!row || row.status !== 'ACTIVE' || row.expiresAt <= now || !row.adminUserId) return null;
  const [tenant, admin] = await Promise.all([
    app.prisma.tenant.findUnique({ where: { id: row.tenantId }, select: { id: true, slug: true, name: true, plan: true, status: true, closedAt: true } }),
    app.prisma.user.findFirst({ where: { id: row.adminUserId, tenantId: row.tenantId, isActive: true }, select: { id: true, email: true, role: true } })
  ]);
  if (!tenant || tenant.status !== 'DEMO' || tenant.closedAt || !admin) return null;
  const sessionEnd = new Date(Math.min(row.expiresAt.getTime(), now.getTime() + DEMO_SESSION_HOURS * HOUR_MS));
  const accessToken = signDemoAccessToken(
    {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      plan: tenant.plan,
      mfaVerified: true,
      scopes: ['read'],
      mode: 'DEMO',
      demoEnvironmentId: row.id,
      demoTokenFingerprint: shareFingerprint(hash)
    },
    sessionEnd
  );
  return { token: accessToken, expiresAt: sessionEnd.toISOString(), demoExpiresAt: row.expiresAt.toISOString(), tenant: { id: tenant.id, slug: tenant.slug, name: tenant.name }, readOnly: true };
}

/** Tenant portal banner: whether this workspace is a demo, until when, and whether this session is the read-only link. */
export async function tenantDemoStatus(app: Pick<FastifyInstance, 'prisma'>, tenantId: string, mode: string | undefined) {
  const row = await app.prisma.demoEnvironment.findUnique({ where: { tenantId }, select: { status: true, expiresAt: true, template: true } });
  if (!row) return { demo: false as const };
  return { demo: true as const, status: row.status, expiresAt: row.expiresAt.toISOString(), template: findDemoTemplate(row.template)?.name ?? row.template, readOnly: mode === 'DEMO' };
}
