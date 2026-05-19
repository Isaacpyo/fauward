import type { FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { setDomainBodySchema } from './domain.schema.js';
import {
  DomainBusinessError,
  DomainConflictError,
  DomainNotFoundError,
  domainService
} from './domain.service.js';
import { VercelApiError } from './infrastructure/vercel.client.js';

function actorUserId(request: FastifyRequest) {
  return request.apiKey ? null : request.user?.sub ?? null;
}

function actorType(request: FastifyRequest) {
  return request.apiKey ? 'API_KEY' : 'USER';
}

function serializeDomainTenant(tenant: {
  customDomain: string | null;
  customDomainStatus: string;
  customDomainVerifiedAt: Date | null;
  customDomainError: string | null;
}) {
  return {
    customDomain: tenant.customDomain,
    customDomainStatus: tenant.customDomainStatus,
    customDomainVerifiedAt: tenant.customDomainVerifiedAt,
    customDomainError: tenant.customDomainError
  };
}

function sendDomainError(reply: FastifyReply, error: unknown) {
  if (error instanceof ZodError) {
    return reply.status(400).send({ error: 'VALIDATION_ERROR', code: 'VALIDATION_ERROR', issues: error.issues });
  }
  if (error instanceof DomainBusinessError) {
    return reply.status(400).send({ error: error.message, code: error.code });
  }
  if (error instanceof DomainConflictError) {
    return reply.status(409).send({ error: error.message, code: error.code });
  }
  if (error instanceof DomainNotFoundError) {
    return reply.status(404).send({ error: 'Tenant not found', code: 'TENANT_NOT_FOUND' });
  }
  if (error instanceof VercelApiError) {
    return reply.status(502).send({ error: 'Custom domain provider is unavailable', code: 'UPSTREAM_ERROR' });
  }
  throw error;
}

export const domainController = {
  setDomain: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = request.tenant?.id ?? request.user?.tenantId;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

      const payload = setDomainBodySchema.parse(request.body);
      const result = await domainService.setCustomDomain(request.server.prisma, {
        tenantId,
        domain: payload.domain,
        actorUserId: actorUserId(request),
        actorIp: request.ip,
        actorType: actorType(request)
      });

      return reply.send({
        ok: true,
        tenant: serializeDomainTenant(result.tenant),
        instructions: result.instructions,
        records: result.records
      });
    } catch (error) {
      return sendDomainError(reply, error);
    }
  },

  domainStatus: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = request.tenant?.id ?? request.user?.tenantId;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

      const result = await domainService.checkStatus(request.server.prisma, tenantId);
      return reply.send(result);
    } catch (error) {
      return sendDomainError(reply, error);
    }
  },

  removeDomain: async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const tenantId = request.tenant?.id ?? request.user?.tenantId;
      if (!tenantId) return reply.status(400).send({ error: 'Tenant context required' });

      const tenant = await domainService.removeCustomDomain(request.server.prisma, {
        tenantId,
        actorUserId: actorUserId(request),
        actorIp: request.ip,
        actorType: actorType(request)
      });

      return reply.send({ ok: true, tenant: serializeDomainTenant(tenant) });
    } catch (error) {
      return sendDomainError(reply, error);
    }
  }
};
