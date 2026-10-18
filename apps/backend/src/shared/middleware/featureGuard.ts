import type { FastifyReply, FastifyRequest } from 'fastify';
import { isFeatureEnabled } from '../../services/tenant-entitlements.service.js';
import { loadRequestEntitlements } from './entitlements.js';

/** 403 FEATURE_NOT_AVAILABLE unless the tenant's entitlements (effective plan + feature overrides) enable `feature`. */
export function requireFeature(feature: string) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const entitlements = await loadRequestEntitlements(req);
    if (!entitlements || !isFeatureEnabled(entitlements, feature)) {
      return reply.status(403).send({
        error: `${feature} requires Pro or Enterprise plan`,
        code: 'FEATURE_NOT_AVAILABLE',
        feature,
        upgradeUrl: 'https://fauward.com/upgrade'
      });
    }
  };
}
