import type { FastifyReply, FastifyRequest } from 'fastify';
import { authService } from './auth.service.js';
import { forgotPasswordSchema, loginSchema, refreshSchema, registerSchema, resetPasswordSchema } from './auth.schema.js';
import { generateQrCodeDataUrl, generateTotpSecret, verifyTotp } from '../../shared/utils/totp.js';

export const authController = {
  register: async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = registerSchema.parse(request.body);
    try {
      const result = await authService.register(payload, request.server.prisma);
      reply.status(201).send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to register';
      const statusCode = message === 'Email already in use' ? 409 : 400;
      reply.status(statusCode).send({ error: message });
    }
  },
  login: async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = loginSchema.parse(request.body);
    let tenantId = request.tenant?.id;
    if (!tenantId) {
      const matches = await request.server.prisma.user.findMany({
        where: { email: payload.email.toLowerCase(), isActive: true },
        select: { tenantId: true },
        distinct: ['tenantId']
      });
      if (matches.length === 1) {
        tenantId = matches[0].tenantId;
      }
    }
    if (!tenantId) {
      return reply.status(400).send({ error: 'Tenant context required' });
    }
    try {
      const result = await authService.login(payload, request.server.prisma, tenantId);
      reply.send(result);
    } catch {
      reply.status(401).send({ error: 'Invalid credentials' });
    }
  },
  emailLinkRequest: async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = request.body as { email?: string };
    if (!payload?.email) {
      return reply.status(400).send({ error: 'email is required' });
    }

    try {
      const result = await authService.requestEmailLink(payload as { email: string }, request.server.prisma, request.tenant?.id);
      reply.send(result);
    } catch {
      reply.status(400).send({ error: 'Unable to issue email sign-in link' });
    }
  },
  emailLinkConsume: async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = request.body as { email?: string; token?: string };
    if (!payload?.email || !payload?.token) {
      return reply.status(400).send({ error: 'email and token are required' });
    }

    try {
      const result = await authService.consumeEmailLink(payload as { email: string; token: string }, request.server.prisma);
      reply.send(result);
    } catch {
      reply.status(401).send({ error: 'Invalid email-link token' });
    }
  },
  refresh: async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = refreshSchema.parse(request.body);
    try {
      const result = await authService.refresh(payload, request.server.prisma);
      reply.send(result);
    } catch {
      reply.status(401).send({ error: 'Invalid refresh token' });
    }
  },
  logout: async (request: FastifyRequest, reply: FastifyReply) => {
    const { refreshToken } = (request.body ?? {}) as { refreshToken?: string };
    if (refreshToken) {
      await request.server.prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    }
    reply.code(204).send();
  },
  me: async (request: FastifyRequest, reply: FastifyReply) => {
    reply.send({ user: request.user });
  },
  mfaSetup: async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.tenant?.id;
    const userId = request.user?.sub;
    if (!tenantId || !userId) return reply.status(401).send({ error: 'Unauthorized' });

    const user = await request.server.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true, email: true }
    });
    if (!user) return reply.status(404).send({ error: 'User not found' });

    const { secret, otpauth } = generateTotpSecret(user.email);
    const qrCodeDataUrl = await generateQrCodeDataUrl(otpauth);

    await request.server.prisma.user.update({
      where: { id: user.id },
      data: {
        mfaSecret: secret,
        mfaEnabled: false
      }
    });

    reply.send({
      secret,
      otpauth,
      qrCodeDataUrl
    });
  },
  mfaVerify: async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.tenant?.id;
    const userId = request.user?.sub;
    if (!tenantId || !userId) return reply.status(401).send({ error: 'Unauthorized' });

    const { code, disable } = request.body as { code?: string; disable?: boolean };
    if (!code) return reply.status(400).send({ error: 'code is required' });

    const user = await request.server.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { id: true, mfaSecret: true, mfaEnabled: true }
    });
    if (!user || !user.mfaSecret) return reply.status(400).send({ error: 'MFA setup not initialized' });

    const valid = verifyTotp(code, user.mfaSecret);
    if (!valid) return reply.status(400).send({ error: 'Invalid MFA code' });

    const updated = await request.server.prisma.user.update({
      where: { id: user.id },
      data: disable
        ? {
            mfaEnabled: false,
            mfaSecret: null
          }
        : {
            mfaEnabled: true
          },
      select: { mfaEnabled: true }
    });

    reply.send({
      success: true,
      mfaEnabled: updated.mfaEnabled
    });
  },
  mfaValidate: async (request: FastifyRequest, reply: FastifyReply) => {
    const { email, code } = request.body as { email?: string; code?: string };
    if (!email || !code) return reply.status(400).send({ error: 'email and code are required' });

    const user = await request.server.prisma.user.findFirst({
      where: { email: email.toLowerCase().trim(), isActive: true },
      select: { mfaEnabled: true, mfaSecret: true }
    });

    if (!user || !user.mfaEnabled || !user.mfaSecret) {
      return reply.status(400).send({ error: 'MFA not enabled for account' });
    }

    const valid = verifyTotp(code, user.mfaSecret);
    if (!valid) return reply.status(400).send({ error: 'Invalid MFA code' });

    reply.send({ valid: true });
  },
  forgotPassword: async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = forgotPasswordSchema.parse(request.body);
    let tenantId = request.tenant?.id;
    if (!tenantId || tenantId === 'system') {
      const matches = await request.server.prisma.user.findMany({
        where: { email: payload.email.toLowerCase(), isActive: true },
        select: { tenantId: true },
        distinct: ['tenantId']
      });
      if (matches.length === 1) tenantId = matches[0].tenantId;
    }
    if (!tenantId || tenantId === 'system') {
      return reply.send({ success: true });
    }

    const result = await authService.forgotPassword(payload, request.server.prisma, tenantId);
    reply.send(result);
  },
  resetPassword: async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = resetPasswordSchema.parse(request.body);
    try {
      const result = await authService.resetPassword(payload, request.server.prisma);
      reply.send(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to reset password';
      reply.status(400).send({ error: message });
    }
  }
};
