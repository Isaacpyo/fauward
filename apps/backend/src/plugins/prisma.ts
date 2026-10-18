import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';
import { tenantStorage } from '../context/tenant.context.js';
import { currentRequestActor } from '../context/request-actor.context.js';
import { stampImpersonatedAuditData } from '../services/impersonation-audit.js';

// Prefer the session-pooler / direct URL (port 5432) because port 6543 can be
// blocked in some hosting environments. Fall back to the transaction pooler.
const rawUrl = process.env.SUPABASE_DIRECT_URL || process.env.SUPABASE_DB_URL || '';
// Only append pgbouncer flag when using the transaction pooler (port 6543)
const usesPgBouncer = rawUrl.includes(':6543');
const dbUrl = usesPgBouncer && !rawUrl.includes('pgbouncer=true')
  ? `${rawUrl}${rawUrl.includes('?') ? '&' : '?'}pgbouncer=true`
  : rawUrl;

const prisma = new PrismaClient({
  datasources: { db: { url: dbUrl } },
});

const TENANT_SCOPED_MODELS = [
  'User', 'Shipment', 'ShipmentItem', 'ShipmentEvent', 'Organisation',
  'Lead', 'Quote', 'Invoice', 'Payment', 'Refund', 'CreditNote',
  'Driver', 'Vehicle', 'Route', 'PodAsset',
  'RateCard', 'ServiceZone', 'ShipmentDocument', 'CarrierBooking',
  'CustomsDeclaration', 'ApiKey', 'WebhookEndpoint', 'WebhookDelivery',
  'NotificationLog', 'UsageRecord', 'IdempotencyKey', 'AuditLog',
  'Branch', 'AccountingConnection', 'CarrierConnection', 'SsoProvider'
];

const READ_ACTIONS = ['findMany', 'findFirst', 'findUnique', 'count', 'aggregate', 'groupBy'];

prisma.$use(async (params, next) => {
  if (!TENANT_SCOPED_MODELS.includes(params.model ?? '')) {
    return next(params);
  }

  const ctx = tenantStorage.getStore();
  if (ctx?.isSuperAdmin) {
    return next(params);
  }
  if (!ctx?.tenantId) {
    throw new Error(`[SECURITY] Tenant context missing for model ${params.model} action ${params.action}`);
  }

  if (READ_ACTIONS.includes(params.action)) {
    params.args ??= {};
    params.args.where = { ...params.args.where, tenantId: ctx.tenantId };
  }

  if (params.action === 'create') {
    params.args.data = { ...params.args.data, tenantId: ctx.tenantId };
  }

  if (params.action === 'createMany') {
    params.args.data = params.args.data.map((d: Record<string, unknown>) => ({ ...d, tenantId: ctx.tenantId }));
  }

  if (['update', 'updateMany', 'delete', 'deleteMany'].includes(params.action)) {
    params.args.where = { ...params.args.where, tenantId: ctx.tenantId };
  }

  return next(params);
});

// Tenant audit rows written during staff impersonation are attributed to the impersonator (D8).
prisma.$use(async (params, next) => {
  if (params.model !== 'AuditLog' || !['create', 'createMany'].includes(params.action)) return next(params);
  const actor = currentRequestActor();
  if (!actor?.impersonation) return next(params);
  if (params.action === 'create') {
    params.args.data = stampImpersonatedAuditData(params.args.data, actor);
  } else {
    const data = params.args.data;
    params.args.data = Array.isArray(data) ? data.map((row: Record<string, unknown>) => stampImpersonatedAuditData(row, actor)) : stampImpersonatedAuditData(data, actor);
  }
  return next(params);
});

export async function registerPrisma(app: FastifyInstance) {
  await prisma.$connect();
  app.decorate('prisma', prisma);
  app.addHook('onClose', async (instance) => {
    await instance.prisma.$disconnect();
  });
}

export type PrismaClientType = PrismaClient;
