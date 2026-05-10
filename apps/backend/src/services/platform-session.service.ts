import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import type { PlatformRole } from '@prisma/client';
import { config } from '../config/index.js';
import { permissionsForPlatformRole } from './platform-permission.service.js';

export const PLATFORM_ACCESS_COOKIE = 'fw_platform_access';
export const PLATFORM_REFRESH_COOKIE = 'fw_platform_refresh';
export const PLATFORM_CSRF_COOKIE = 'fw_platform_csrf';
const PLATFORM_CSRF_SIG_COOKIE = 'fw_platform_csrf_sig';

export type PlatformJwtClaims = {
  sub: string;
  actorType: 'PLATFORM_USER';
  tenantId: 'system';
  role: PlatformRole;
  permissions: string[];
  sessionId: string;
  mfaVerifiedAt: string | null;
  iss: 'fauward-platform';
  aud: 'fauward-platform-admin';
};

export type PlatformRefreshClaims = {
  sub: string;
  actorType: 'PLATFORM_USER';
  sessionId: string;
  iss: 'fauward-platform';
  aud: 'fauward-platform-admin';
};

export function hashPlatformToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function randomPlatformToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function signPlatformAccessToken(payload: {
  platformUserId: string;
  role: PlatformRole;
  permissions?: string[];
  sessionId: string;
  mfaVerifiedAt: Date | null;
}) {
  return jwt.sign(
    {
      sub: payload.platformUserId,
      actorType: 'PLATFORM_USER',
      tenantId: 'system',
      role: payload.role,
      permissions: payload.permissions ?? permissionsForPlatformRole(payload.role),
      sessionId: payload.sessionId,
      mfaVerifiedAt: payload.mfaVerifiedAt?.toISOString() ?? null
    },
    config.platformAuth.sessionSecret,
    {
      expiresIn: '15m',
      issuer: config.platformAuth.issuer,
      audience: config.platformAuth.audience
    }
  );
}

export function signPlatformRefreshToken(payload: { platformUserId: string; sessionId: string }) {
  return jwt.sign(
    {
      sub: payload.platformUserId,
      actorType: 'PLATFORM_USER',
      sessionId: payload.sessionId
    },
    config.platformAuth.refreshSecret,
    {
      expiresIn: '7d',
      issuer: config.platformAuth.issuer,
      audience: config.platformAuth.audience,
      jwtid: crypto.randomUUID()
    }
  );
}

export function verifyPlatformAccessToken(token: string): PlatformJwtClaims {
  return jwt.verify(token, config.platformAuth.sessionSecret, {
    issuer: config.platformAuth.issuer,
    audience: config.platformAuth.audience
  }) as PlatformJwtClaims;
}

export function verifyPlatformRefreshToken(token: string): PlatformRefreshClaims {
  return jwt.verify(token, config.platformAuth.refreshSecret, {
    issuer: config.platformAuth.issuer,
    audience: config.platformAuth.audience
  }) as PlatformRefreshClaims;
}

export function platformCookieOptions(path = '/api') {
  return {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict' as const,
    path,
    domain: config.platformAuth.cookieDomain
  };
}

export function csrfCookieOptions(path = '/api') {
  return {
    httpOnly: false,
    secure: config.nodeEnv === 'production',
    sameSite: 'strict' as const,
    path,
    domain: config.platformAuth.cookieDomain
  };
}

function signCsrfValue(value: string) {
  return crypto.createHmac('sha256', config.platformAuth.sessionSecret).update(value).digest('hex');
}

export function setPlatformCsrfCookies(reply: { setCookie: (name: string, value: string, options: any) => unknown }) {
  const csrf = randomPlatformToken();
  reply.setCookie(PLATFORM_CSRF_COOKIE, csrf, csrfCookieOptions());
  reply.setCookie(PLATFORM_CSRF_SIG_COOKIE, signCsrfValue(csrf), platformCookieOptions());
  return csrf;
}

export function verifyPlatformCsrf(header: unknown, cookies: Record<string, string | undefined>) {
  if (typeof header !== 'string' || header.length === 0) return false;
  const cookie = cookies[PLATFORM_CSRF_COOKIE];
  const sig = cookies[PLATFORM_CSRF_SIG_COOKIE];
  if (!cookie || !sig || header !== cookie) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(signCsrfValue(cookie)));
}

export function clearPlatformCookies(reply: { clearCookie: (name: string, options: any) => unknown }) {
  for (const name of [PLATFORM_ACCESS_COOKIE, PLATFORM_REFRESH_COOKIE, PLATFORM_CSRF_COOKIE, PLATFORM_CSRF_SIG_COOKIE]) {
    reply.clearCookie(name, platformCookieOptions());
  }
}
