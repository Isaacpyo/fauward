import { randomBytes } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';
import type Redis from 'ioredis';
import { config } from '../config/index.js';
import { signAccessToken } from '../shared/utils/jwt.js';
import { getActiveTenantPlanOverride } from './platform-plan-override.service.js';

// Impersonation token transport (D8, S18): the console gets a single-use exchange code, never the token.

export const EXCHANGE_CODE_TTL_SECONDS = 60;
export const READ_SCOPE_MAX_MINUTES = 30;
export const WRITE_SCOPE_MAX_MINUTES = 15;
export const WRITE_SCOPE_MIN_REASON = 20;

const exchangeKey = (code: string) => `platform:impersonation:exchange:${code}`;
export const impersonationActiveKey = (sessionId: string) => `platform:impersonation:${sessionId}`;

export type ImpersonationScopeRequest = { ok: true; scopes: string[]; write: boolean } | { ok: false; error: string };

/** `read` is the default; anything other than read/write is rejected. */
export function parseImpersonationScopes(input: unknown): ImpersonationScopeRequest {
  if (input === undefined || input === null) return { ok: true, scopes: ['read'], write: false };
  if (!Array.isArray(input) || input.some((scope) => scope !== 'read' && scope !== 'write')) {
    return { ok: false, error: 'scopes must be a list of "read" and/or "write"' };
  }
  const write = input.includes('write');
  return { ok: true, scopes: write ? ['read', 'write'] : ['read'], write };
}

/** Read sessions: 5–30 min (default 30). Write sessions: capped at 15 min (default 15). */
export function impersonationDurationMinutes(requested: unknown, write: boolean) {
  const max = write ? WRITE_SCOPE_MAX_MINUTES : READ_SCOPE_MAX_MINUTES;
  const value = typeof requested === 'number' && Number.isFinite(requested) ? requested : max;
  return Math.min(Math.max(Math.floor(value), 5), max);
}

export async function createExchangeCode(redis: Pick<Redis, 'set'>, sessionId: string) {
  const code = randomBytes(32).toString('base64url');
  await redis.set(exchangeKey(code), sessionId, 'EX', EXCHANGE_CODE_TTL_SECONDS);
  return code;
}

/** Single use: GETDEL returns the session id once; a second redeem or an expired code returns null. */
export async function redeemExchangeCode(redis: Pick<Redis, 'getdel'>, code: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(code)) return null;
  return redis.getdel(exchangeKey(code));
}

/** The URL fragment is never sent to servers, so the code does not land in access logs or Referer headers. */
export function impersonationPortalUrl(slug: string, code: string) {
  const base = config.nodeEnv === 'production' ? `https://${slug}.${config.platformDomain}` : (process.env.TENANT_PORTAL_DEV_URL ?? 'http://localhost:3000');
  return `${base}/auth/impersonate#code=${encodeURIComponent(code)}`;
}

export async function signImpersonationToken(
  prisma: PrismaClient,
  input: {
    session: { id: string; platformUserId: string; targetTenantId: string; scopes: string[] };
    platformUser: { id: string; email: string };
    tenant: { id: string; slug: string; plan: string };
    targetUser: { id: string; email: string; role: string };
  }
) {
  const override = await getActiveTenantPlanOverride(prisma, input.tenant.id);
  return signAccessToken({
    sub: input.targetUser.id,
    email: input.targetUser.email,
    role: input.targetUser.role,
    tenantId: input.tenant.id,
    tenantSlug: input.tenant.slug,
    plan: override?.plan ?? input.tenant.plan,
    mfaVerified: true,
    impersonator: input.platformUser.id,
    impersonatorEmail: input.platformUser.email,
    actorType: 'PLATFORM_USER',
    actorId: input.platformUser.id,
    targetTenantId: input.tenant.id,
    targetUserId: input.targetUser.id,
    impersonationSessionId: input.session.id,
    scopes: input.session.scopes,
    mode: 'IMPERSONATION'
  });
}
