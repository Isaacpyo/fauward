import type { FastifyInstance } from 'fastify';
import type { Prisma, TenantFeatureOverride } from '@prisma/client';
import { RUNTIME_FLAGS } from '../config/flags.js';
import { planService } from '../modules/tenants/plan.service.js';
import { createFeatureOverride, revokeFeatureOverride } from './feature-override.service.js';
import { launchDarklyAdapter } from './vendors/launchdarkly.adapter.js';
import { isVendorError } from './vendors/vendor-error.js';

// platform.flags (WP-4.1). The native TenantFeatureOverride is the source of truth (WP-1.4); LaunchDarkly, when
// configured, mirrors each override as an individual target on context kind `tenant`. A mirror failure never blocks
// the override: it is logged in FeatureFlagOverrideAudit (the LD mirror log) with status FAILED.

export type MirrorStatus = 'MIRRORED' | 'FAILED' | 'NOT_CONFIGURED';

export type MirrorResult = { vendor: 'launchdarkly'; status: MirrorStatus; error: string | null; at: string | null };

const PLAN_ORDER = ['STARTER', 'PRO', 'ENTERPRISE'] as const;

export type FlagDefinition = { key: string; kind: 'plan-feature' | 'runtime'; description: string | null; plans: string[]; owner: string | null };

export function flagCatalogue(): FlagDefinition[] {
  const planFlags = planService.featureKeys().map((key) => ({
    key,
    kind: 'plan-feature' as const,
    description: null,
    owner: null,
    plans: PLAN_ORDER.filter((plan) => planService.hasFeature(plan, key))
  }));
  const runtime = RUNTIME_FLAGS.map((flag) => ({ key: flag.key, kind: 'runtime' as const, description: flag.description, owner: flag.owner, plans: [] }));
  return [...planFlags, ...runtime].sort((a, b) => a.key.localeCompare(b.key));
}

export function findFlag(key: string) {
  return flagCatalogue().find((flag) => flag.key === key) ?? null;
}

export function isOverrideActive(row: Pick<TenantFeatureOverride, 'revokedAt' | 'expiresAt'>, now = new Date()) {
  return row.revokedAt === null && (row.expiresAt === null || row.expiresAt > now);
}

type MirrorDb = Pick<FastifyInstance['prisma'], 'featureFlagOverrideAudit'>;

async function recordMirror(db: MirrorDb, input: { flagKey: string; tenantId: string; overrideId: string; actorId: string; action: 'SET' | 'CLEAR'; enabled: boolean | null; status: 'MIRRORED' | 'FAILED'; error: string | null; instructions: unknown }) {
  const value: Prisma.InputJsonValue = {
    action: input.action,
    enabled: input.enabled,
    status: input.status,
    error: input.error,
    instructions: (input.instructions ?? null) as Prisma.InputJsonValue
  };
  const row = await db.featureFlagOverrideAudit.create({
    data: { flagKey: input.flagKey, tenantId: input.tenantId, actorId: input.actorId, vendor: 'launchdarkly', vendorRef: input.overrideId, value }
  });
  return row.createdAt.toISOString();
}

/** Mirrors one override to LaunchDarkly when configured. Never throws: a vendor failure is returned as FAILED. */
export async function mirrorOverride(
  app: Pick<FastifyInstance, 'prisma' | 'log'>,
  input: { action: 'SET' | 'CLEAR'; flagKey: string; tenantId: string; overrideId: string; enabled: boolean | null; actorId: string; comment: string }
): Promise<MirrorResult> {
  if (!launchDarklyAdapter.isConfigured()) return { vendor: 'launchdarkly', status: 'NOT_CONFIGURED', error: null, at: null };
  try {
    const instructions =
      input.action === 'SET' && input.enabled !== null
        ? await launchDarklyAdapter.setTenantTarget(input.flagKey, input.tenantId, input.enabled, input.comment)
        : await launchDarklyAdapter.clearTenantTarget(input.flagKey, input.tenantId, input.comment);
    const at = await recordMirror(app.prisma, { ...input, status: 'MIRRORED', error: null, instructions });
    return { vendor: 'launchdarkly', status: 'MIRRORED', error: null, at };
  } catch (error) {
    if (!isVendorError(error)) throw error;
    app.log.warn({ vendor: error.vendor, flagKey: input.flagKey, tenantId: input.tenantId }, 'LaunchDarkly mirror failed');
    const at = await recordMirror(app.prisma, { ...input, status: 'FAILED', error: error.message, instructions: null });
    return { vendor: 'launchdarkly', status: 'FAILED', error: error.message, at };
  }
}

/** Latest mirror result per override id (from the LD mirror log). */
export async function mirrorStatusByOverride(db: MirrorDb, overrideIds: string[]) {
  const map = new Map<string, MirrorResult>();
  if (overrideIds.length === 0) return map;
  const rows = await db.featureFlagOverrideAudit.findMany({
    where: { vendor: 'launchdarkly', vendorRef: { in: overrideIds } },
    orderBy: { createdAt: 'desc' }
  });
  for (const row of rows) {
    if (!row.vendorRef || map.has(row.vendorRef)) continue;
    const value = (row.value ?? {}) as { status?: unknown; error?: unknown };
    const status: MirrorStatus = value.status === 'FAILED' ? 'FAILED' : 'MIRRORED';
    map.set(row.vendorRef, { vendor: 'launchdarkly', status, error: typeof value.error === 'string' ? value.error : null, at: row.createdAt.toISOString() });
  }
  return map;
}

type OverrideActorInput = Parameters<typeof createFeatureOverride>[1];

/** Native override first (transaction, audit, activity, entitlement invalidation), then the optional LD mirror. */
export async function createOverrideWithMirror(app: FastifyInstance, input: OverrideActorInput) {
  const override = await createFeatureOverride(app, input);
  const mirror = await mirrorOverride(app, {
    action: 'SET',
    flagKey: input.featureKey,
    tenantId: input.tenantId,
    overrideId: override.id,
    enabled: input.enabled,
    actorId: input.actor.platformUserId,
    comment: `Fauward console override ${override.id}: ${input.reason}`
  });
  return { override, mirror };
}

export async function revokeOverrideWithMirror(app: FastifyInstance, input: Parameters<typeof revokeFeatureOverride>[1]) {
  const override = await revokeFeatureOverride(app, input);
  const mirror = await mirrorOverride(app, {
    action: 'CLEAR',
    flagKey: override.featureKey,
    tenantId: override.tenantId,
    overrideId: override.id,
    enabled: null,
    actorId: input.actor.platformUserId,
    comment: `Fauward console override ${override.id} revoked: ${input.reason}`
  });
  return { override, mirror };
}
