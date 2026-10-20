import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RegionChangeRequest } from '@prisma/client';
import { REGION_KEYS, regionLabel } from '../config/regions.js';
import { recordAndPublishActivity, staffActor } from './platform-activity.service.js';
import { notifyStaff, notifyTenantAdmins } from './platform-notifier.service.js';

// L5 region change (WP-2.6): a tenant admin requests a region; staff approve (applied to Tenant.region in the same
// transaction) or reject; the tenant's admins are told either way. Requests are rows, so they survive restarts.

type RegionApp = FastifyInstance;

export class RegionChangeError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export function presentRegionRequest(row: RegionChangeRequest, tenant?: { id: string; name: string; slug: string } | null) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    tenant: tenant ?? null,
    currentRegion: row.currentRegion,
    requestedRegion: row.requestedRegion,
    requestedByUserId: row.requestedByUserId,
    status: row.status,
    decisionReason: row.decisionReason,
    decidedByPlatformUserId: row.decidedByPlatformUserId,
    decidedAt: row.decidedAt?.toISOString() ?? null,
    appliedAt: row.appliedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString()
  };
}

/** One PENDING request per tenant: a second request replaces the pending one's target region. */
export async function requestRegionChange(app: RegionApp, request: FastifyRequest, input: { tenantId: string; requestedRegion: string; userId: string; actorLabel: string }) {
  if (!REGION_KEYS.includes(input.requestedRegion)) throw new RegionChangeError(400, 'UNSUPPORTED_REGION', 'Choose one of the listed regions.');
  const tenant = await app.prisma.tenant.findUnique({ where: { id: input.tenantId }, select: { id: true, name: true, slug: true, region: true } });
  if (!tenant) throw new RegionChangeError(404, 'NOT_FOUND', 'Tenant not found');
  if (tenant.region === input.requestedRegion) throw new RegionChangeError(409, 'SAME_REGION', `Your workspace is already in ${regionLabel(tenant.region)}.`);

  const row = await app.prisma.$transaction(async (tx) => {
    const pending = await tx.regionChangeRequest.findFirst({ where: { tenantId: tenant.id, status: 'PENDING' } });
    if (pending) {
      return tx.regionChangeRequest.update({ where: { id: pending.id }, data: { requestedRegion: input.requestedRegion, requestedByUserId: input.userId, currentRegion: tenant.region } });
    }
    return tx.regionChangeRequest.create({ data: { tenantId: tenant.id, currentRegion: tenant.region, requestedRegion: input.requestedRegion, requestedByUserId: input.userId } });
  });

  await recordAndPublishActivity(
    { prisma: app.prisma, redis: app.redis, log: request.log },
    {
      service: 'platform.tenants',
      type: 'region.requested',
      tenantId: tenant.id,
      actorType: 'TENANT_USER',
      actorId: input.userId,
      actorLabel: input.actorLabel,
      subjectType: 'region_change_request',
      subjectId: row.id,
      summary: `${tenant.name} asked to move from ${regionLabel(tenant.region)} to ${regionLabel(input.requestedRegion)}`,
      consoleLink: '/platform/tenants/region-requests'
    }
  );
  await notifyStaff(app, {
    permission: 'platform.tenants.write',
    event: 'region.requested',
    title: `Region change requested by ${tenant.name}`,
    body: `${regionLabel(tenant.region)} → ${regionLabel(input.requestedRegion)}`,
    link: '/platform/tenants/region-requests',
    tenantId: tenant.id
  });
  return presentRegionRequest(row, tenant);
}

/** APPROVED applies Tenant.region in the same transaction and records APPLIED; REJECTED keeps the region. */
export async function decideRegionChange(app: RegionApp, request: FastifyRequest, input: { id: string; status: 'APPROVED' | 'REJECTED'; reason: string }) {
  const existing = await app.prisma.regionChangeRequest.findUnique({ where: { id: input.id }, include: { tenant: { select: { id: true, name: true, slug: true, region: true } } } });
  if (!existing) throw new RegionChangeError(404, 'NOT_FOUND', 'Region change request not found');
  if (existing.status !== 'PENDING') throw new RegionChangeError(409, 'ALREADY_DECIDED', `This request was already ${existing.status.toLowerCase()}.`);
  if (input.status === 'APPROVED' && !REGION_KEYS.includes(existing.requestedRegion)) throw new RegionChangeError(400, 'UNSUPPORTED_REGION', 'Unsupported requested region');

  const now = new Date();
  const staffId = request.platform!.user.id;
  const decided = await app.prisma.$transaction(async (tx) => {
    const claimed = await tx.regionChangeRequest.updateMany({
      where: { id: existing.id, tenantId: existing.tenantId, status: 'PENDING' },
      data: input.status === 'APPROVED'
        ? { status: 'APPLIED', decisionReason: input.reason, decidedByPlatformUserId: staffId, decidedAt: now, appliedAt: now, currentRegion: existing.tenant.region }
        : { status: 'REJECTED', decisionReason: input.reason, decidedByPlatformUserId: staffId, decidedAt: now }
    });
    if (claimed.count !== 1) throw new RegionChangeError(409, 'ALREADY_DECIDED', 'This request was decided by someone else.');
    if (input.status === 'APPROVED') await tx.tenant.update({ where: { id: existing.tenantId }, data: { region: existing.requestedRegion } });
    return tx.regionChangeRequest.findFirstOrThrow({ where: { id: existing.id, tenantId: existing.tenantId } });
  });

  const deps = { prisma: app.prisma, redis: app.redis, log: request.log };
  const route = `${regionLabel(existing.tenant.region)} → ${regionLabel(existing.requestedRegion)}`;
  await recordAndPublishActivity(deps, {
    service: 'platform.tenants',
    type: 'region.decided',
    tenantId: existing.tenantId,
    ...staffActor(request),
    subjectType: 'region_change_request',
    subjectId: existing.id,
    summary: `${existing.tenant.name}: ${route} ${input.status === 'APPROVED' ? 'approved' : 'rejected'}`,
    consoleLink: '/platform/tenants/region-requests',
    dedupeKey: `region.decided:${existing.id}`
  });
  if (input.status === 'APPROVED') {
    await recordAndPublishActivity(deps, {
      service: 'platform.tenants',
      type: 'region.applied',
      tenantId: existing.tenantId,
      ...staffActor(request),
      subjectType: 'tenant',
      subjectId: existing.tenantId,
      summary: `${existing.tenant.name} now runs in ${regionLabel(existing.requestedRegion)}`,
      consoleLink: `/platform/tenants/${existing.tenantId}`,
      dedupeKey: `region.applied:${existing.id}`
    });
  }
  const decisionWord = input.status === 'APPROVED' ? 'APPROVED' : 'REJECTED';
  await notifyTenantAdmins(app, {
    tenantId: existing.tenantId,
    event: 'region.decided',
    title: input.status === 'APPROVED' ? `Your workspace now runs in ${regionLabel(existing.requestedRegion)}` : 'Region change not approved',
    body: input.status === 'APPROVED' ? `Payment options and defaults for ${regionLabel(existing.requestedRegion)} now apply.` : input.reason,
    link: '/settings?tab=integrations',
    email: { template: 'region_change_decided', data: { decision: decisionWord, requestedRegion: regionLabel(existing.requestedRegion), reason: input.status === 'REJECTED' ? input.reason : '' } }
  });
  return presentRegionRequest(decided, existing.tenant);
}
