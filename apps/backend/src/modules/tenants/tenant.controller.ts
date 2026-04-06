import type { FastifyReply, FastifyRequest } from 'fastify';
import { tenantService } from './tenant.service.js';
import { brandingSchema, domainSchema, settingsSchema } from './tenant.schema.js';

export const tenantController = {
  me: async (req: FastifyRequest, reply: FastifyReply) => {
    const tenant = await tenantService.getCurrentTenant(req);
    reply.send(tenant);
  },
  updateBranding: async (req: FastifyRequest, reply: FastifyReply) => {
    const payload = brandingSchema.parse(req.body);
    const tenant = await tenantService.updateBranding(req, payload);
    reply.send(tenant);
  },
  updateSettings: async (req: FastifyRequest, reply: FastifyReply) => {
    const payload = settingsSchema.parse(req.body);
    const settings = await tenantService.updateSettings(req, payload);
    reply.send(settings);
  },
  setDomain: async (req: FastifyRequest, reply: FastifyReply) => {
    const payload = domainSchema.parse(req.body);
    const result = await tenantService.setDomain(req, payload.domain);
    reply.send(result);
  },
  domainStatus: async (req: FastifyRequest, reply: FastifyReply) => {
    const result = await tenantService.domainStatus(req);
    reply.send(result);
  },
  usage: async (req: FastifyRequest, reply: FastifyReply) => {
    const result = await tenantService.getUsage(req);
    reply.send(result);
  },
  onboarding: async (req: FastifyRequest, reply: FastifyReply) => {
    const result = await tenantService.getOnboarding(req);
    reply.send(result);
  },
  planFeatures: async (req: FastifyRequest, reply: FastifyReply) => {
    const result = await tenantService.getPlanFeatures(req);
    reply.send(result);
  }
};