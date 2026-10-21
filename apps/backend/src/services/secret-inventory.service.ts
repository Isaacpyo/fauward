import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Prisma, SecretCredential } from '@prisma/client';
import { z } from 'zod';
import { SECRET_REGISTRY, findSecretDefinition, type SecretDefinition } from '../config/secret-registry.js';
import { auditedMutation, staffMutationActor } from './console-mutation.js';
import { notifyStaff } from './platform-notifier.service.js';
import { dopplerAdapter } from './vendors/doppler.adapter.js';
import { vendorStatus } from './vendors/index.js';

// trust.secrets (WP-4.12). The inventory is the registry (config/secret-registry.ts) observed from the running
// process: configured or not, a fingerprint (first 12 hex of sha256), first/last seen and the last rotation. A
// fingerprint change is a rotation (lastRotatedAt + activity). Values never leave this module: only `fingerprint()` sees
// them, and nothing returns or logs them.

export const EXPIRING_WINDOW_DAYS = 14;
const DAY_MS = 86_400_000;
const SERVICE = 'trust.secrets';
const SYSTEM = { kind: 'system' as const, id: 'trust.secret-inventory', label: 'Secret inventory' };

export type SecretStatus = 'NOT_CONFIGURED' | 'OK' | 'DUE_SOON' | 'OVERDUE' | 'NO_POLICY';

export function fingerprint(value: string) {
  return createHash('sha256').update(value).digest('hex').slice(0, 12);
}

/** When the secret is next due: (last rotation, else first sighting) + policy. */
export function rotationDueAt(row: Pick<SecretCredential, 'lastRotatedAt' | 'firstSeenAt' | 'rotateEveryDays'>) {
  const base = row.lastRotatedAt ?? row.firstSeenAt;
  if (!base || !row.rotateEveryDays) return null;
  return new Date(base.getTime() + row.rotateEveryDays * DAY_MS);
}

export function secretStatus(row: Pick<SecretCredential, 'configured' | 'lastRotatedAt' | 'firstSeenAt' | 'rotateEveryDays'>, now = new Date()): SecretStatus {
  if (!row.configured) return 'NOT_CONFIGURED';
  if (!row.rotateEveryDays) return 'NO_POLICY';
  const due = rotationDueAt(row);
  if (!due) return 'OK';
  if (due.getTime() <= now.getTime()) return 'OVERDUE';
  if (due.getTime() - now.getTime() <= EXPIRING_WINDOW_DAYS * DAY_MS) return 'DUE_SOON';
  return 'OK';
}

type Owner = { id: string; email: string; name: string | null };

function present(row: SecretCredential, owners: Map<string, Owner>, now = new Date()) {
  const definition = row.envName ? findSecretDefinition(row.envName) : null;
  const due = rotationDueAt(row);
  return {
    id: row.id,
    name: row.name,
    envName: row.envName,
    source: row.source,
    configured: row.configured,
    fingerprint: row.fingerprint,
    owner: row.ownerId ? owners.get(row.ownerId) ?? { id: row.ownerId, email: null, name: null } : null,
    ownerTeam: definition?.owner ?? null,
    usedBy: definition?.usedBy ?? [],
    integration: definition?.integration ?? null,
    inRegistry: Boolean(definition),
    rotateEveryDays: row.rotateEveryDays,
    rotationNotes: row.rotationNotes,
    firstSeenAt: row.firstSeenAt?.toISOString() ?? null,
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    lastRotatedAt: row.lastRotatedAt?.toISOString() ?? null,
    rotationDueAt: due?.toISOString() ?? null,
    status: secretStatus(row, now),
    updatedAt: row.updatedAt.toISOString()
  };
}

export type SecretView = ReturnType<typeof present>;

async function ownersOf(app: Pick<FastifyInstance, 'prisma'>, rows: SecretCredential[]) {
  const ids = [...new Set(rows.map((row) => row.ownerId).filter((id): id is string => Boolean(id)))];
  const users = ids.length ? await app.prisma.platformUser.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, name: true } }) : [];
  return new Map(users.map((user) => [user.id, user]));
}

export async function listSecrets(app: Pick<FastifyInstance, 'prisma'>, filter: { integration?: string } = {}) {
  const rows = await app.prisma.secretCredential.findMany({ orderBy: [{ name: 'asc' }] });
  const owners = await ownersOf(app, rows);
  const now = new Date();
  const lastRun = await app.prisma.scheduledJobRun.findFirst({ where: { jobName: 'trust.secret-inventory' }, orderBy: { startedAt: 'desc' }, select: { status: true, startedAt: true, finishedAt: true, error: true } });
  const data = rows.map((row) => present(row, owners, now)).filter((row) => !filter.integration || row.integration === filter.integration);
  return {
    data,
    total: data.length,
    doppler: vendorStatus('doppler'),
    lastInventoryRun: lastRun ? { status: lastRun.status, startedAt: lastRun.startedAt.toISOString(), finishedAt: lastRun.finishedAt?.toISOString() ?? null, error: lastRun.error } : null
  };
}

export async function listExpiringSecrets(app: Pick<FastifyInstance, 'prisma'>) {
  const all = await listSecrets(app);
  const data = all.data.filter((row) => row.status === 'OVERDUE' || row.status === 'DUE_SOON').sort((a, b) => String(a.rotationDueAt).localeCompare(String(b.rotationDueAt)));
  return { data, total: data.length, windowDays: EXPIRING_WINDOW_DAYS };
}

export async function getSecret(app: Pick<FastifyInstance, 'prisma'>, id: string) {
  const row = await app.prisma.secretCredential.findUnique({ where: { id } });
  if (!row) return null;
  return present(row, await ownersOf(app, [row]));
}

export async function secretAudit(app: Pick<FastifyInstance, 'prisma'>, id: string, query: { limit: number; cursor?: string }) {
  const rows = await app.prisma.platformAuditLog.findMany({
    where: { action: { startsWith: 'SECRET_' }, metadata: { path: ['secretId'], equals: id } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {})
  });
  const page = rows.slice(0, query.limit);
  return {
    data: page.map((row) => ({ id: row.id, action: row.action, actorType: row.actorType, actorId: row.actorId, actorEmail: row.actorEmail, reason: row.reason, metadata: row.metadata, createdAt: row.createdAt.toISOString() })),
    nextCursor: rows.length > query.limit ? page[page.length - 1]?.id ?? null : null
  };
}

// ── Staff actions ────────────────────────────────────────────────────────────

export class SecretError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

export const secretPatchBody = z
  .object({
    ownerId: z.string().min(1).nullable().optional(),
    rotateEveryDays: z.number().int().min(1).max(3650).nullable().optional(),
    rotationNotes: z.string().trim().max(2000).nullable().optional()
  })
  .refine((body) => body.ownerId !== undefined || body.rotateEveryDays !== undefined || body.rotationNotes !== undefined, 'Nothing to change');

export const markRotatedBody = z.object({ reason: z.string().trim().min(8), rotatedAt: z.string().datetime({ offset: true }).optional() });

export async function patchSecret(app: FastifyInstance, request: FastifyRequest, id: string, body: z.infer<typeof secretPatchBody>) {
  const before = await app.prisma.secretCredential.findUnique({ where: { id } });
  if (!before) throw new SecretError(404, 'SECRET_NOT_FOUND', 'Secret not found');
  if (body.ownerId) {
    const owner = await app.prisma.platformUser.findUnique({ where: { id: body.ownerId }, select: { status: true } });
    if (!owner || owner.status !== 'ACTIVE') throw new SecretError(400, 'INVALID_OWNER', 'The owner must be an active console user');
  }
  const data: Prisma.SecretCredentialUpdateInput = {
    ...(body.ownerId !== undefined ? { ownerId: body.ownerId } : {}),
    ...(body.rotateEveryDays !== undefined ? { rotateEveryDays: body.rotateEveryDays } : {}),
    ...(body.rotationNotes !== undefined ? { rotationNotes: body.rotationNotes || null } : {})
  };
  const changes = Object.fromEntries(
    (['ownerId', 'rotateEveryDays', 'rotationNotes'] as const)
      .filter((field) => body[field] !== undefined && before[field] !== body[field])
      .map((field) => [field, { from: before[field] ?? null, to: body[field] ?? null }])
  );
  const row = await auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    const updated = await tx.secretCredential.update({ where: { id }, data });
    return {
      result: updated,
      audit: { action: 'SECRET_POLICY_UPDATED', metadata: { secretId: id, envName: before.envName, changes } },
      activity: { type: 'secret.policy_updated', subjectType: 'secret', subjectId: id, summary: `${before.name}: ${Object.keys(changes).join(', ') || 'no change'}`, consoleLink: `/trust/secrets/${id}` }
    };
  });
  return present(row, await ownersOf(app, [row]));
}

export async function markSecretRotated(app: FastifyInstance, request: FastifyRequest, id: string, body: z.infer<typeof markRotatedBody>) {
  const before = await app.prisma.secretCredential.findUnique({ where: { id } });
  if (!before) throw new SecretError(404, 'SECRET_NOT_FOUND', 'Secret not found');
  const rotatedAt = body.rotatedAt ? new Date(body.rotatedAt) : new Date();
  if (rotatedAt.getTime() > Date.now() + 60_000) throw new SecretError(400, 'ROTATED_IN_FUTURE', 'The rotation time cannot be in the future');
  const row = await auditedMutation(app, SERVICE, staffMutationActor(request), async (tx) => {
    const updated = await tx.secretCredential.update({ where: { id }, data: { lastRotatedAt: rotatedAt } });
    return {
      result: updated,
      audit: { action: 'SECRET_MARKED_ROTATED', reason: body.reason, metadata: { secretId: id, envName: before.envName, rotatedAt: rotatedAt.toISOString(), previousRotatedAt: before.lastRotatedAt?.toISOString() ?? null } },
      activity: { type: 'secret.rotated', subjectType: 'secret', subjectId: id, summary: `${before.name} marked rotated by staff`, severity: 'INFO', consoleLink: `/trust/secrets/${id}`, metadata: { manual: true } }
    };
  });
  return present(row, await ownersOf(app, [row]));
}

// ── Inventory job ────────────────────────────────────────────────────────────

type Observation = { configured: boolean; source: 'ENV' | 'DOPPLER'; fingerprint: string | null };

function observe(definition: SecretDefinition, env: NodeJS.ProcessEnv, dopplerNames: Set<string>): Observation {
  const value = env[definition.envName];
  if (typeof value === 'string' && value.length > 0) return { configured: true, source: 'ENV', fingerprint: fingerprint(value) };
  if (dopplerNames.has(definition.envName)) return { configured: true, source: 'DOPPLER', fingerprint: null };
  return { configured: false, source: 'ENV', fingerprint: null };
}

/**
 * One pass over the registry: upsert each row, detect rotations (fingerprint change), report overdue secrets once a day
 * (ATTENTION activity + the owner, or trust.secrets.write holders when nobody owns it).
 */
export async function runSecretInventory(app: FastifyInstance, env: NodeJS.ProcessEnv = process.env, now = new Date()) {
  let dopplerNames = new Set<string>();
  let doppler: 'NOT_CONFIGURED' | 'OK' | 'FAILED' = 'NOT_CONFIGURED';
  if (dopplerAdapter.isConfigured()) {
    try {
      dopplerNames = new Set(await dopplerAdapter.listSecretNames());
      doppler = 'OK';
    } catch (err) {
      doppler = 'FAILED';
      app.log.error({ err }, 'Doppler secret names could not be listed; inventory uses the environment only');
    }
  }

  let created = 0;
  let rotated = 0;
  let overdueReported = 0;
  for (const definition of SECRET_REGISTRY) {
    const seen = observe(definition, env, dopplerNames);
    const existing = await app.prisma.secretCredential.findUnique({ where: { envName: definition.envName } });
    if (!existing) {
      await app.prisma.secretCredential.create({
        data: {
          name: definition.name,
          envName: definition.envName,
          provider: seen.source === 'DOPPLER' ? 'doppler' : 'env',
          source: seen.source,
          configured: seen.configured,
          fingerprint: seen.fingerprint,
          firstSeenAt: seen.configured ? now : null,
          lastSeenAt: seen.configured ? now : null,
          rotateEveryDays: definition.rotateEveryDays
        }
      });
      created += 1;
      continue;
    }

    const fingerprintChanged = Boolean(existing.fingerprint && seen.fingerprint && existing.fingerprint !== seen.fingerprint);
    const data: Prisma.SecretCredentialUpdateInput = {
      name: definition.name,
      source: seen.source,
      configured: seen.configured,
      fingerprint: seen.configured ? seen.fingerprint ?? existing.fingerprint : existing.fingerprint,
      ...(seen.configured ? { lastSeenAt: now } : {}),
      ...(seen.configured && !existing.firstSeenAt ? { firstSeenAt: now } : {}),
      ...(fingerprintChanged ? { lastRotatedAt: now } : {})
    };
    if (fingerprintChanged) {
      await auditedMutation(app, SERVICE, SYSTEM, async (tx) => ({
        result: await tx.secretCredential.update({ where: { id: existing.id }, data }),
        audit: { action: 'SECRET_ROTATION_DETECTED', metadata: { secretId: existing.id, envName: definition.envName, previousFingerprint: existing.fingerprint, fingerprint: seen.fingerprint } },
        activity: { type: 'secret.rotated', subjectType: 'secret', subjectId: existing.id, summary: `${definition.name} was rotated (new fingerprint)`, consoleLink: `/trust/secrets/${existing.id}`, metadata: { manual: false } }
      }));
      rotated += 1;
    } else {
      await app.prisma.secretCredential.update({ where: { id: existing.id }, data });
    }
  }

  // Overdue: one ATTENTION activity per secret per day, and its owner (or the secret managers) told once.
  const rows = await app.prisma.secretCredential.findMany({ where: { configured: true, rotateEveryDays: { not: null } } });
  const day = now.toISOString().slice(0, 10);
  for (const row of rows) {
    if (secretStatus(row, now) !== 'OVERDUE') continue;
    const dedupeKey = `secret.rotation_overdue:${row.id}:${day}`;
    if (await app.prisma.platformActivity.findUnique({ where: { dedupeKey }, select: { id: true } })) continue;
    const due = rotationDueAt(row);
    await auditedMutation(app, SERVICE, SYSTEM, async () => ({
      result: null,
      audit: { action: 'SECRET_ROTATION_OVERDUE', metadata: { secretId: row.id, envName: row.envName, dueAt: due?.toISOString() ?? null } },
      activity: { type: 'secret.rotation_overdue', subjectType: 'secret', subjectId: row.id, summary: `${row.name} is overdue for rotation`, severity: 'ATTENTION', consoleLink: `/trust/secrets/${row.id}`, dedupeKey }
    }));
    const notification = { event: 'secret.rotation_overdue', title: `${row.name} is overdue for rotation`, body: `Policy: every ${row.rotateEveryDays} days. Rotate it and the inventory detects the change, or mark it rotated.`, link: `/trust/secrets/${row.id}`, severity: 'ATTENTION' as const };
    await notifyStaff(app, row.ownerId ? { ...notification, platformUserIds: [row.ownerId] } : { ...notification, permission: 'trust.secrets.write' });
    overdueReported += 1;
  }

  return { registry: SECRET_REGISTRY.length, configured: SECRET_REGISTRY.filter((definition) => observe(definition, env, dopplerNames).configured).length, created, rotated, overdueReported, doppler };
}
