import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { recordActivity, recordAndPublishActivity, staffActor, type ActivityInput } from './platform-activity.service.js';
import { notifyTenantAdmins } from './platform-notifier.service.js';

// L13 (WP-2.15): tenant team events for the console (invites, joins, role changes, suspensions) and Fauward's
// security lock. A locked user cannot sign in, refresh or call the API (401 USER_LOCKED) until staff unlock them;
// impersonated staff sessions are not affected (they are not the user's credentials).

export const USER_LOCKED_MESSAGE = 'This account is locked by Fauward. Contact your workspace admin.';

export class UserLockedError extends Error {
  constructor() {
    super('USER_LOCKED');
  }
}

export function assertNotLocked(user: { lockedAt: Date | null }) {
  if (user.lockedAt) throw new UserLockedError();
}

type SignInDb = Pick<PrismaClient, 'user' | 'platformActivity'>;

/**
 * Every successful sign-in stamps `lastLogin` (C360, health score, NPS eligibility read it). The first sign-in of an
 * invited user records `user.joined`.
 */
export async function recordSignIn(db: SignInDb, user: { id: string; tenantId: string; email: string; lastLogin: Date | null; invitedBy: string | null }) {
  const firstSignIn = !user.lastLogin && Boolean(user.invitedBy);
  await db.user.updateMany({ where: { id: user.id, tenantId: user.tenantId }, data: { lastLogin: new Date() } });
  if (firstSignIn) {
    await recordActivity(db, {
      service: 'customer.360',
      type: 'user.joined',
      tenantId: user.tenantId,
      actorType: 'TENANT_USER',
      actorId: user.id,
      actorLabel: user.email,
      subjectType: 'user',
      subjectId: user.id,
      summary: `${user.email} accepted the invitation and signed in`,
      consoleLink: `/customer/360/${user.tenantId}?tab=people`,
      dedupeKey: `user.joined:${user.id}`
    });
  }
}

type TeamEvent = 'user.invited' | 'user.role_changed' | 'user.suspended';

/** Team changes made in the tenant portal, for the console activity stream. */
export async function recordTeamEvent(app: FastifyInstance, request: FastifyRequest, event: TeamEvent, target: { id: string; email: string; tenantId: string }, summary: string) {
  const actor = request.user;
  await recordAndPublishActivity(
    { prisma: app.prisma, redis: app.redis, log: app.log },
    {
      service: 'customer.360',
      type: event,
      tenantId: target.tenantId,
      actorType: actor?.impersonator ? 'IMPERSONATOR' : 'TENANT_USER',
      actorId: actor?.sub ?? null,
      actorLabel: actor?.impersonator ? 'Fauward staff (via impersonation)' : actor?.email ?? 'Tenant user',
      subjectType: 'user',
      subjectId: target.id,
      summary,
      consoleLink: `/customer/360/${target.tenantId}?tab=people`
    }
  );
}

export class UserLockError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

/** Console lock/unlock (dangerous). Locking also ends the user's refresh tokens so no session outlives the lock. */
export async function setUserLock(app: FastifyInstance, request: FastifyRequest, input: { tenantId: string; userId: string; lock: boolean; reason: string }) {
  const user = await app.prisma.user.findFirst({ where: { id: input.userId, tenantId: input.tenantId }, select: { id: true, email: true, tenantId: true, lockedAt: true, role: true } });
  if (!user) throw new UserLockError(404, 'NOT_FOUND', 'User not found for this tenant');
  if (input.lock === Boolean(user.lockedAt)) throw new UserLockError(409, input.lock ? 'ALREADY_LOCKED' : 'NOT_LOCKED', input.lock ? 'This user is already locked' : 'This user is not locked');
  const staff = request.platform!.user;
  const updated = await app.prisma.user.update({
    where: { id: user.id },
    data: input.lock ? { lockedAt: new Date(), lockedReason: input.reason, lockedByPlatformUserId: staff.id } : { lockedAt: null, lockedReason: null, lockedByPlatformUserId: null },
    select: { id: true, email: true, lockedAt: true, lockedReason: true }
  });
  if (input.lock) await app.prisma.refreshToken.deleteMany({ where: { userId: user.id } });
  const base: Omit<ActivityInput, 'type' | 'summary'> = {
    service: 'customer.360',
    tenantId: user.tenantId,
    ...staffActor(request),
    subjectType: 'user',
    subjectId: user.id,
    severity: 'ATTENTION',
    consoleLink: `/customer/360/${user.tenantId}?tab=people`
  };
  await recordAndPublishActivity(
    { prisma: app.prisma, redis: app.redis, log: app.log },
    { ...base, type: input.lock ? 'user.locked_by_fauward' : 'user.unlocked_by_fauward', summary: `${user.email} ${input.lock ? 'locked' : 'unlocked'} by Fauward: ${input.reason}` }
  );
  await notifyTenantAdmins(app, {
    tenantId: user.tenantId,
    event: input.lock ? 'user.locked_by_fauward' : 'user.unlocked_by_fauward',
    title: input.lock ? `Fauward locked ${user.email}` : `Fauward unlocked ${user.email}`,
    body: input.reason,
    link: '/team',
    email: { template: input.lock ? 'user_locked_by_fauward' : 'user_unlocked_by_fauward', data: { userEmail: user.email, reason: input.reason } }
  });
  return updated;
}
