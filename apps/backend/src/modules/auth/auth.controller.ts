import type { FastifyReply, FastifyRequest } from 'fastify';
import { authService } from './auth.service.js';
import { forgotPasswordSchema, loginSchema, refreshSchema, registerSchema, resetPasswordSchema } from './auth.schema.js';

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
  refresh: async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = refreshSchema.parse(request.body);
    try {
      const result = await authService.refresh(payload, request.server.prisma);
      reply.send(result);
    } catch {
      reply.status(401).send({ error: 'Invalid refresh token' });
    }
  },
  logout: async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.code(204).send();
  },
  me: async (request: FastifyRequest, reply: FastifyReply) => {
    reply.send({ user: request.user });
  },
  mfaSetup: async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.code(501).send({ error: 'Not implemented' });
  },
  mfaVerify: async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.code(501).send({ error: 'Not implemented' });
  },
  mfaValidate: async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.code(501).send({ error: 'Not implemented' });
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
