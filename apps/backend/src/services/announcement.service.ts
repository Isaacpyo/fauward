import type { FastifyInstance } from 'fastify';
import type { PlatformAnnouncement, Prisma, TenantPlan } from '@prisma/client';
import { z } from 'zod';
import { sendEmail } from '../modules/notifications/notifications.service.js';

// customer.comms announcements (L8, WP-2.14): targeting, the tenant-side visibility rule, audience counts, receipts and
// the alsoEmail fan-out. Console requests run in system context, so every per-tenant query names the tenant.

export const ANNOUNCEMENT_TYPES = ['INFO', 'WARNING', 'MAINTENANCE'] as const;
const PLAN_TIERS = ['STARTER', 'PRO', 'ENTERPRISE'] as const;
export const RECEIPT_ACTIONS = ['VIEWED', 'DISMISSED', 'CTA_CLICKED'] as const;
/** Tenants that can see the portal (and therefore a banner). */
const AUDIENCE_STATUSES = ['TRIALING', 'ACTIVE', 'SUSPENDED'] as const;

const cta = z.object({ label: z.string().trim().min(1).max(60), url: z.string().trim().url().max(500) }).nullable();
const target = {
  targetAll: z.boolean(),
  tenantIds: z.array(z.string().min(1)).max(500).default([]),
  planTiers: z.array(z.enum(PLAN_TIERS)).max(3).default([])
};
const content = {
  type: z.enum(ANNOUNCEMENT_TYPES).default('INFO'),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(2000),
  cta: cta.optional(),
  dismissible: z.boolean().default(true),
  expiresAt: z.string().datetime().nullable().optional()
};

export const announcementCreateBody = z
  .object({ ...content, ...target, publishedAt: z.string().datetime().optional(), alsoEmail: z.boolean().default(false) })
  .refine((body) => body.targetAll || body.tenantIds.length > 0 || body.planTiers.length > 0, 'Choose an audience: all tenants, plans or tenants')
  .refine((body) => !body.expiresAt || new Date(body.expiresAt) > new Date(body.publishedAt ?? Date.now()), 'Expiry must be after publication')
  .refine((body) => !body.alsoEmail || !body.publishedAt || new Date(body.publishedAt) <= new Date(), 'Email goes out when the announcement is created; schedule without email or publish now');

export const announcementPatchBody = z
  .object({
    type: z.enum(ANNOUNCEMENT_TYPES).optional(),
    title: content.title.optional(),
    body: content.body.optional(),
    cta: cta.optional(),
    dismissible: z.boolean().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    targetAll: z.boolean().optional(),
    tenantIds: z.array(z.string().min(1)).max(500).optional(),
    planTiers: z.array(z.enum(PLAN_TIERS)).max(3).optional()
  })
  .refine((body) => Object.keys(body).length > 0, 'Nothing to change');

export const audienceQuery = z.object({
  targetAll: z.enum(['true', 'false']).default('false'),
  tenantIds: z.string().optional(),
  planTiers: z.string().optional()
});

export type Targeting = { targetAll: boolean; tenantIds: string[]; planTiers: string[] };

export function parseAudienceQuery(query: z.infer<typeof audienceQuery>): Targeting {
  const list = (value?: string) => (value ? value.split(',').map((item) => item.trim()).filter(Boolean) : []);
  return { targetAll: query.targetAll === 'true', tenantIds: list(query.tenantIds), planTiers: list(query.planTiers).map((plan) => plan.toUpperCase()) };
}

/** Tenants an announcement reaches. */
export function audienceTenantWhere(targeting: Targeting): Prisma.TenantWhereInput {
  const reach: Prisma.TenantWhereInput[] = [];
  if (targeting.tenantIds.length > 0) reach.push({ id: { in: targeting.tenantIds } });
  const plans = targeting.planTiers.filter((plan): plan is TenantPlan => (PLAN_TIERS as readonly string[]).includes(plan));
  if (plans.length > 0) reach.push({ plan: { in: plans } });
  return { status: { in: [...AUDIENCE_STATUSES] }, ...(targeting.targetAll ? {} : { OR: reach.length > 0 ? reach : [{ id: { in: [] } }] }) };
}

/** Announcements a tenant sees right now (published, not expired, not archived, targeted at it). */
export function visibleToTenantWhere(tenant: { id: string; plan: string }, now = new Date()): Prisma.PlatformAnnouncementWhereInput {
  return {
    archivedAt: null,
    publishedAt: { lte: now },
    AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, { OR: [{ targetAll: true }, { tenantIds: { has: tenant.id } }, { planTiers: { has: tenant.plan } }] }]
  };
}

export function announcementState(row: Pick<PlatformAnnouncement, 'archivedAt' | 'publishedAt' | 'expiresAt'>, now = new Date()) {
  if (row.archivedAt) return 'ARCHIVED' as const;
  if (row.publishedAt > now) return 'SCHEDULED' as const;
  if (row.expiresAt && row.expiresAt <= now) return 'EXPIRED' as const;
  return 'ACTIVE' as const;
}

export function stateWhere(status: string, now = new Date()): Prisma.PlatformAnnouncementWhereInput {
  switch (status) {
    case 'scheduled':
      return { archivedAt: null, publishedAt: { gt: now } };
    case 'expired':
      return { archivedAt: null, expiresAt: { lte: now } };
    case 'archived':
      return { archivedAt: { not: null } };
    case 'all':
      return {};
    default:
      return { archivedAt: null, publishedAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  }
}

export type ReceiptSummary = { viewed: number; dismissed: number; ctaClicked: number };

export async function receiptSummaries(app: FastifyInstance, announcementIds: string[]) {
  const summaries = new Map<string, ReceiptSummary>(announcementIds.map((id) => [id, { viewed: 0, dismissed: 0, ctaClicked: 0 }]));
  if (announcementIds.length === 0) return summaries;
  const [viewed, dismissed, clicked] = await Promise.all([
    app.prisma.announcementReceipt.groupBy({ by: ['announcementId'], where: { announcementId: { in: announcementIds } }, _count: { _all: true } }),
    app.prisma.announcementReceipt.groupBy({ by: ['announcementId'], where: { announcementId: { in: announcementIds }, dismissedAt: { not: null } }, _count: { _all: true } }),
    app.prisma.announcementReceipt.groupBy({ by: ['announcementId'], where: { announcementId: { in: announcementIds }, ctaClickedAt: { not: null } }, _count: { _all: true } })
  ]);
  for (const row of viewed) summaries.get(row.announcementId)!.viewed = row._count._all;
  for (const row of dismissed) summaries.get(row.announcementId)!.dismissed = row._count._all;
  for (const row of clicked) summaries.get(row.announcementId)!.ctaClicked = row._count._all;
  return summaries;
}

/** How many tenants and active users an announcement (or a draft targeting) reaches. */
export async function audienceCounts(app: FastifyInstance, targeting: Targeting) {
  const where = audienceTenantWhere(targeting);
  const [tenants, users] = await Promise.all([app.prisma.tenant.count({ where }), app.prisma.user.count({ where: { isActive: true, tenant: where } })]);
  return { tenants, users };
}

/** alsoEmail: one email per active TENANT_ADMIN of every targeted tenant, through the notification queue. */
export async function emailAnnouncement(app: FastifyInstance, announcement: PlatformAnnouncement) {
  const admins = await app.prisma.user.findMany({
    where: { role: 'TENANT_ADMIN', isActive: true, tenant: audienceTenantWhere(announcement) },
    select: { id: true, email: true, tenantId: true }
  });
  const ctaValue = announcement.cta as { label?: string; url?: string } | null;
  const results = await Promise.allSettled(
    admins.map((admin) =>
      sendEmail(app, {
        tenantId: admin.tenantId,
        userId: admin.id,
        to: admin.email,
        template: 'platform_announcement',
        data: { title: announcement.title, body: announcement.body, link: ctaValue?.url, ctaLabel: ctaValue?.label }
      })
    )
  );
  const failed = results.filter((result) => result.status === 'rejected').length;
  if (failed > 0) app.log.error({ announcementId: announcement.id, failed }, 'Failed to enqueue some announcement emails');
  return { queued: admins.length - failed, failed };
}
