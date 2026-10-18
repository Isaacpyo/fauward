import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PlatformUser } from '@prisma/client';
import { verifyPassword } from '../../../shared/utils/hash.js';
import { generateQrCodeDataUrl, generateTotpSecret, verifyTotp } from '../../../shared/utils/totp.js';
import { authenticatePlatformSession } from '../../../middleware/authenticate-platform-session.js';
import { requirePlatformCsrf } from '../../../middleware/require-platform-csrf.js';
import {
  PLATFORM_ACCESS_COOKIE,
  PLATFORM_REFRESH_COOKIE,
  clearPlatformCookies,
  hashPlatformToken,
  platformCookieOptions,
  setPlatformCsrfCookies,
  signPlatformAccessToken,
  signPlatformRefreshToken,
  verifyPlatformAccessToken,
  verifyPlatformRefreshToken
} from '../../../services/platform-session.service.js';
import { staffPermissionContextForPlatformUser } from '../../../services/staff-iam.service.js';
import { writePlatformAuditLog } from '../../../services/platform-audit.service.js';
import { FieldEncryptionError, decryptField, encryptField, isEncryptedField } from '../../../services/crypto/field-encryption.js';

// Console auth is mounted under both prefixes during Phase 0 (spec WP-0.1); WP-1.1 drops the /api/v1/platform one.
export const CONSOLE_AUTH_PREFIXES = ['/api/v1/platform/auth', '/api/internal/auth'] as const;

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MFA_FAILURE_WINDOW_SECONDS = 15 * 60;
const MFA_FAILURE_REVOKE_THRESHOLD = 10;

function ipAddress(request: FastifyRequest) {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return request.ip;
}

function userAgent(request: FastifyRequest) {
  return typeof request.headers['user-agent'] === 'string' ? request.headers['user-agent'] : null;
}

function setAuthCookies(reply: FastifyReply, accessToken: string, refreshToken: string) {
  reply.setCookie(PLATFORM_ACCESS_COOKIE, accessToken, { ...platformCookieOptions(), maxAge: 15 * 60 });
  reply.setCookie(PLATFORM_REFRESH_COOKIE, refreshToken, { ...platformCookieOptions(), maxAge: 7 * 24 * 60 * 60 });
  setPlatformCsrfCookies(reply);
}

function mfaVerifyRateLimitKey(request: FastifyRequest) {
  const token = request.cookies?.[PLATFORM_ACCESS_COOKIE];
  if (token) {
    try {
      return `console-mfa-verify:${verifyPlatformAccessToken(token).sessionId}`;
    } catch {
      return `console-mfa-verify:ip:${ipAddress(request)}`;
    }
  }
  return `console-mfa-verify:ip:${ipAddress(request)}`;
}

function readCode(request: FastifyRequest) {
  const code = (request.body as { code?: unknown } | undefined)?.code;
  if (typeof code !== 'string') return null;
  const digits = code.replace(/\s+/g, '');
  return /^\d{6}$/.test(digits) ? digits : null;
}

function encryptionUnavailable(reply: FastifyReply, error: unknown) {
  if (error instanceof FieldEncryptionError) {
    return reply.status(503).send({ error: 'FIELD_ENCRYPTION_NOT_CONFIGURED', message: error.message });
  }
  throw error;
}

async function permissionsWithJit(app: FastifyInstance, user: PlatformUser) {
  const context = await staffPermissionContextForPlatformUser(app.prisma, user);
  const jitGrants = await app.prisma.jitAccessRequest.findMany({
    where: { requesterPlatformUserId: user.id, status: 'APPROVED', revokedAt: null, expiresAt: { gt: new Date() } },
    select: { permission: true, expiresAt: true },
    orderBy: { expiresAt: 'desc' }
  });
  const jit = jitGrants.map((grant) => ({ permission: grant.permission, expiresAt: grant.expiresAt?.toISOString() ?? null }));
  const permissions = Array.from(new Set<string>([...context.permissions, ...jit.map((grant) => grant.permission)]));
  return { staff: context.staff, roles: context.roles, permissions, jit };
}

function issueAccessToken(user: PlatformUser, sessionId: string, permissions: string[], mfaVerifiedAt: Date | null) {
  return signPlatformAccessToken({ platformUserId: user.id, role: user.role, permissions, sessionId, mfaVerifiedAt });
}

/** Records a failed MFA attempt; returns true when the session has just been revoked. */
async function recordMfaFailure(app: FastifyInstance, request: FastifyRequest, reply: FastifyReply, user: PlatformUser, sessionId: string) {
  const key = `platform:mfa-failures:${sessionId}`;
  const failures = await app.redis.incr(key);
  if (failures === 1) await app.redis.expire(key, MFA_FAILURE_WINDOW_SECONDS);
  if (failures < MFA_FAILURE_REVOKE_THRESHOLD) return false;

  await app.prisma.platformSession.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  await app.redis.del(key);
  await writePlatformAuditLog(app.prisma, {
    actorType: 'PLATFORM_USER',
    actorId: user.id,
    actorEmail: user.email,
    action: 'PLATFORM_SESSION_REVOKED',
    metadata: { sessionId, reason: 'mfa_failures', failures },
    ipAddress: ipAddress(request),
    userAgent: userAgent(request)
  });
  clearPlatformCookies(reply);
  return true;
}

export async function registerConsoleAuthRoutes(app: FastifyInstance) {
  for (const prefix of CONSOLE_AUTH_PREFIXES) {
    app.post(`${prefix}/login`, { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
      const { email, password } = (request.body ?? {}) as { email?: string; password?: string };
      const normalizedEmail = email?.toLowerCase().trim();

      if (!normalizedEmail || !password) {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      const user = await app.prisma.platformUser.findUnique({ where: { email: normalizedEmail } });
      const passwordOk = user ? await verifyPassword(password, user.passwordHash) : false;

      if (!user || !passwordOk || user.status !== 'ACTIVE') {
        const failureReason = user?.status === 'DISABLED' ? 'disabled_user' : 'invalid_credentials';
        await app.prisma.staffLoginAttempt.create({
          data: { staffEmail: normalizedEmail, platformUserId: user?.id, success: false, ipAddress: ipAddress(request), userAgent: userAgent(request), failureReason }
        });
        await writePlatformAuditLog(app.prisma, {
          actorType: 'SYSTEM',
          actorId: 'platform-auth',
          actorEmail: normalizedEmail,
          action: 'PLATFORM_LOGIN_FAILURE',
          metadata: { reason: failureReason },
          ipAddress: ipAddress(request),
          userAgent: userAgent(request)
        });
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      const permissionContext = await permissionsWithJit(app, user);
      if (permissionContext.staff.status !== 'ACTIVE') {
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      // Every session starts MFA-pending; only /mfa/verify or /mfa/enroll/confirm set mfaVerifiedAt (S1).
      const session = await app.prisma.platformSession.create({
        data: {
          platformUserId: user.id,
          refreshTokenHash: 'pending',
          mfaVerifiedAt: null,
          ipAddress: ipAddress(request),
          userAgent: userAgent(request),
          expiresAt: new Date(Date.now() + SESSION_TTL_MS)
        }
      });
      await app.prisma.staffSession.create({
        data: { staffId: permissionContext.staff.id, platformSessionId: session.id, ipAddress: ipAddress(request), userAgent: userAgent(request), expiresAt: session.expiresAt }
      });
      const accessToken = issueAccessToken(user, session.id, permissionContext.permissions, null);
      const refreshToken = signPlatformRefreshToken({ platformUserId: user.id, sessionId: session.id });

      await app.prisma.$transaction([
        app.prisma.platformSession.update({ where: { id: session.id }, data: { refreshTokenHash: hashPlatformToken(refreshToken) } }),
        app.prisma.platformUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
      ]);

      setAuthCookies(reply, accessToken, refreshToken);
      const mfa = user.mfaEnabled ? 'VERIFY' : 'ENROLL';
      await writePlatformAuditLog(app.prisma, {
        actorType: 'PLATFORM_USER',
        actorId: user.id,
        actorEmail: user.email,
        action: 'PLATFORM_LOGIN_SUCCESS',
        metadata: { mfa },
        ipAddress: ipAddress(request),
        userAgent: userAgent(request)
      });
      await app.prisma.staffLoginAttempt.create({
        data: { staffEmail: user.email, platformUserId: user.id, success: true, ipAddress: ipAddress(request), userAgent: userAgent(request) }
      });

      return reply.send({
        mfa,
        user: { id: user.id, email: user.email, name: user.name, role: user.role, roles: permissionContext.roles, permissions: permissionContext.permissions }
      });
    });

    app.post(`${prefix}/mfa/enroll/start`, { preHandler: [authenticatePlatformSession, requirePlatformCsrf] }, async (request, reply) => {
      const user = await app.prisma.platformUser.findUnique({ where: { id: request.platform!.user.id } });
      if (!user) return reply.status(401).send({ error: 'Unauthorized' });
      if (user.mfaEnabled) return reply.status(409).send({ error: 'MFA_ALREADY_ENROLLED', message: 'MFA is already enrolled. Ask an IAM admin to reset it.' });

      const secret = generateTotpSecret(user.email);
      let pending: string;
      try {
        pending = encryptField(secret.secret);
      } catch (error) {
        return encryptionUnavailable(reply, error);
      }
      await app.prisma.platformUser.update({ where: { id: user.id }, data: { mfaPendingSecretEncrypted: pending } });
      const qrCode = await generateQrCodeDataUrl(secret.otpauth);
      return reply.send({ otpauth: secret.otpauth, qrCode });
    });

    app.post(
      `${prefix}/mfa/enroll/confirm`,
      { preHandler: [authenticatePlatformSession, requirePlatformCsrf], config: { rateLimit: { max: 5, timeWindow: '1 minute', keyGenerator: mfaVerifyRateLimitKey } } },
      async (request, reply) => {
        const platform = request.platform!;
        const code = readCode(request);
        if (!code) return reply.status(400).send({ error: 'INVALID_CODE', message: 'Enter the 6-digit code from your authenticator app.' });

        const user = await app.prisma.platformUser.findUnique({ where: { id: platform.user.id } });
        if (!user) return reply.status(401).send({ error: 'Unauthorized' });
        if (user.mfaEnabled) return reply.status(409).send({ error: 'MFA_ALREADY_ENROLLED' });
        if (!user.mfaPendingSecretEncrypted) return reply.status(400).send({ error: 'MFA_ENROLLMENT_NOT_STARTED', message: 'Start enrolment first.' });

        let secret: string;
        try {
          secret = decryptField(user.mfaPendingSecretEncrypted);
        } catch (error) {
          return encryptionUnavailable(reply, error);
        }

        if (!verifyTotp(code, secret)) {
          await writePlatformAuditLog(app.prisma, {
            actorType: 'PLATFORM_USER',
            actorId: user.id,
            actorEmail: user.email,
            action: 'PLATFORM_MFA_FAILURE',
            metadata: { stage: 'enroll' },
            ipAddress: ipAddress(request),
            userAgent: userAgent(request)
          });
          if (await recordMfaFailure(app, request, reply, user, platform.session.id)) {
            return reply.status(401).send({ error: 'MFA_LOCKED', message: 'Too many failed codes. Sign in again.' });
          }
          return reply.status(400).send({ error: 'INVALID_CODE', message: 'That code is not valid. Try the current code.' });
        }

        const now = new Date();
        const [updatedUser] = await app.prisma.$transaction([
          app.prisma.platformUser.update({
            where: { id: user.id },
            data: { mfaSecretEncrypted: user.mfaPendingSecretEncrypted, mfaPendingSecretEncrypted: null, mfaEnabled: true, mfaEnrolledAt: now }
          }),
          app.prisma.staffUser.updateMany({ where: { platformUserId: user.id }, data: { mfaEnabled: true } }),
          app.prisma.platformSession.update({ where: { id: platform.session.id }, data: { mfaVerifiedAt: now } })
        ]);

        const permissionContext = await permissionsWithJit(app, updatedUser);
        reply.setCookie(PLATFORM_ACCESS_COOKIE, issueAccessToken(updatedUser, platform.session.id, permissionContext.permissions, now), { ...platformCookieOptions(), maxAge: 15 * 60 });
        setPlatformCsrfCookies(reply);
        await writePlatformAuditLog(app.prisma, {
          actorType: 'PLATFORM_USER',
          actorId: user.id,
          actorEmail: user.email,
          action: 'PLATFORM_MFA_ENROLLED',
          metadata: { sessionId: platform.session.id },
          ipAddress: ipAddress(request),
          userAgent: userAgent(request)
        });
        await app.redis.del(`platform:mfa-failures:${platform.session.id}`);
        return reply.send({ success: true, mfaVerifiedAt: now.toISOString(), permissions: permissionContext.permissions });
      }
    );

    app.post(
      `${prefix}/mfa/verify`,
      { preHandler: [authenticatePlatformSession, requirePlatformCsrf], config: { rateLimit: { max: 5, timeWindow: '1 minute', keyGenerator: mfaVerifyRateLimitKey } } },
      async (request, reply) => {
        const platform = request.platform!;
        const code = readCode(request);
        if (!code) return reply.status(400).send({ error: 'INVALID_CODE', message: 'Enter the 6-digit code from your authenticator app.' });

        const user = await app.prisma.platformUser.findUnique({ where: { id: platform.user.id } });
        if (!user) return reply.status(401).send({ error: 'Unauthorized' });
        if (!user.mfaEnabled || !user.mfaSecretEncrypted) {
          return reply.status(403).send({ error: 'MFA_ENROLLMENT_REQUIRED', message: 'Enrol an authenticator app first.' });
        }

        const storedSecret = user.mfaSecretEncrypted;
        const legacyPlaintext = !isEncryptedField(storedSecret);
        let secret: string;
        try {
          secret = legacyPlaintext ? storedSecret : decryptField(storedSecret);
        } catch (error) {
          return encryptionUnavailable(reply, error);
        }

        const valid = verifyTotp(code, secret);
        await writePlatformAuditLog(app.prisma, {
          actorType: 'PLATFORM_USER',
          actorId: user.id,
          actorEmail: user.email,
          action: valid ? 'PLATFORM_MFA_SUCCESS' : 'PLATFORM_MFA_FAILURE',
          metadata: { stage: 'verify' },
          ipAddress: ipAddress(request),
          userAgent: userAgent(request)
        });
        if (!valid) {
          if (await recordMfaFailure(app, request, reply, user, platform.session.id)) {
            return reply.status(401).send({ error: 'MFA_LOCKED', message: 'Too many failed codes. Sign in again.' });
          }
          return reply.status(400).send({ error: 'INVALID_CODE', message: 'That code is not valid. Try the current code.' });
        }

        // Secrets written before field encryption are encrypted on first successful use (S10).
        if (legacyPlaintext) {
          try {
            await app.prisma.platformUser.update({ where: { id: user.id }, data: { mfaSecretEncrypted: encryptField(secret) } });
          } catch (error) {
            request.log.warn({ err: error, platformUserId: user.id }, 'Could not encrypt legacy TOTP secret');
          }
        }

        const mfaVerifiedAt = new Date();
        const session = await app.prisma.platformSession.update({ where: { id: platform.session.id }, data: { mfaVerifiedAt } });
        const permissionContext = await permissionsWithJit(app, user);
        reply.setCookie(PLATFORM_ACCESS_COOKIE, issueAccessToken(user, session.id, permissionContext.permissions, mfaVerifiedAt), { ...platformCookieOptions(), maxAge: 15 * 60 });
        setPlatformCsrfCookies(reply);
        await app.redis.del(`platform:mfa-failures:${platform.session.id}`);
        return reply.send({ success: true, mfaVerifiedAt: mfaVerifiedAt.toISOString(), permissions: permissionContext.permissions });
      }
    );

    app.post(`${prefix}/logout`, { preHandler: [authenticatePlatformSession, requirePlatformCsrf] }, async (request, reply) => {
      if (request.platform) {
        await app.prisma.platformSession.updateMany({ where: { id: request.platform.session.id, revokedAt: null }, data: { revokedAt: new Date() } });
        await writePlatformAuditLog(app.prisma, {
          actorType: 'PLATFORM_USER',
          actorId: request.platform.user.id,
          actorEmail: request.platform.user.email,
          action: 'PLATFORM_SESSION_REVOKED',
          metadata: { sessionId: request.platform.session.id, reason: 'logout' },
          ipAddress: ipAddress(request),
          userAgent: userAgent(request)
        });
      }
      clearPlatformCookies(reply);
      return reply.status(204).send();
    });

    app.post(`${prefix}/refresh`, { preHandler: [requirePlatformCsrf] }, async (request, reply) => {
      const refreshToken = request.cookies?.[PLATFORM_REFRESH_COOKIE];
      if (!refreshToken) return reply.status(401).send({ error: 'Unauthorized' });

      let claims: ReturnType<typeof verifyPlatformRefreshToken>;
      try {
        claims = verifyPlatformRefreshToken(refreshToken);
      } catch {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const session = await app.prisma.platformSession.findUnique({ where: { id: claims.sessionId }, include: { platformUser: true } });
      if (
        !session ||
        session.platformUserId !== claims.sub ||
        session.revokedAt ||
        session.expiresAt <= new Date() ||
        session.refreshTokenHash !== hashPlatformToken(refreshToken) ||
        session.platformUser.status !== 'ACTIVE'
      ) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const staff = await app.prisma.staffUser.findUnique({ where: { platformUserId: session.platformUserId }, select: { status: true } });
      if (staff && staff.status !== 'ACTIVE') return reply.status(401).send({ error: 'Unauthorized' });

      const nextRefreshToken = signPlatformRefreshToken({ platformUserId: session.platformUserId, sessionId: session.id });
      await app.prisma.platformSession.update({
        where: { id: session.id },
        data: { refreshTokenHash: hashPlatformToken(nextRefreshToken), expiresAt: new Date(Date.now() + SESSION_TTL_MS) }
      });
      const permissionContext = await permissionsWithJit(app, session.platformUser);
      setAuthCookies(reply, issueAccessToken(session.platformUser, session.id, permissionContext.permissions, session.mfaVerifiedAt), nextRefreshToken);
      return reply.send({ success: true });
    });

    app.get(`${prefix}/me`, { preHandler: [authenticatePlatformSession] }, async (request, reply) => {
      const { user, session } = request.platform!;
      const permissionContext = await permissionsWithJit(app, user);
      const verifiedAt = session.mfaVerifiedAt?.toISOString() ?? null;
      return reply.send({
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          roles: permissionContext.roles,
          permissions: permissionContext.permissions,
          mfaEnabled: user.mfaEnabled,
          mfaVerifiedAt: verifiedAt
        },
        mfa: { enabled: user.mfaEnabled, verifiedAt, pending: !session.mfaVerifiedAt },
        roles: permissionContext.roles,
        permissions: permissionContext.permissions,
        jit: permissionContext.jit
      });
    });
  }
}
