import type { FastifyReply, FastifyRequest } from 'fastify';
import { createHash } from 'crypto';

function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function bearerToken(request: FastifyRequest) {
  const header = request.headers?.authorization;
  if (typeof header !== 'string') return null;
  return header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null;
}

function hasWriteScope(scopes: string[], path: string) {
  if (scopes.includes('*') || scopes.includes('write')) return true;
  if (path.includes('/shipments') && scopes.includes('shipments:write')) return true;
  if (path.includes('/rates') && scopes.includes('rates:write')) return true;
  if (path.includes('/webhooks') && scopes.includes('webhooks:write')) return true;
  return scopes.some((scope) => scope.endsWith(':write'));
}

function isReadMethod(method: string) {
  return ['GET', 'HEAD', 'OPTIONS'].includes(method);
}

function isSuspendedTenantAllowedPath(method: string, path: string) {
  if (method === 'GET' && ['/api/v1/tenant/me', '/api/v1/tenants/me', '/api/v1/payments/billing-status'].includes(path)) {
    return true;
  }
  if (method === 'GET' && (path === '/api/v1/tenant/announcements' || path === '/api/v1/tenants/me/announcements' || path === '/api/v1/tenants/me/health')) {
    return true;
  }
  return method === 'POST' && [
    '/api/v1/tenant/impersonation/exit',
    '/api/v1/tenants/me/impersonation/exit',
    '/api/v1/tenants/me/suspension-appeal'
  ].includes(path);
}

export function requiredApiScope(method: string, path: string): string | null {
  const action = isReadMethod(method) ? 'read' : 'write';
  if (path.includes('/labels')) return `labels:${action}`;
  if (path.includes('/webhooks')) return `webhooks:${action}`;
  if (path.includes('/rates')) return `rates:${action}`;
  if (path.includes('/shipments')) return `shipments:${action}`;
  if (path.includes('/tenant/domain')) return `domains:${action}`;
  if (path.includes('/api-keys') || path.includes('/api-usage')) return `api-keys:${action}`;
  return null;
}

function hasScope(scopes: string[], required: string | null, method: string, path: string) {
  if (!required) return true;
  if (scopes.includes('*')) return true;
  if (scopes.includes(required)) return true;
  if (required.startsWith('domains:')) return false;
  return !isReadMethod(method) && hasWriteScope(scopes, path);
}

function recordApiKeyUsage(request: FastifyRequest, reply: FastifyReply, apiKey: { id: string; tenantId: string }, path: string) {
  const startedAt = Date.now();
  reply.raw.once('finish', () => {
    const statusCode = reply.raw.statusCode;
    const latencyMs = Date.now() - startedAt;
    const prisma = request.server.prisma as any;
    if (!prisma.apiUsageRecord?.create) return;
    void prisma.apiUsageRecord.create({
      data: {
        tenantId: apiKey.tenantId,
        apiKeyId: apiKey.id,
        endpoint: path,
        method: request.method,
        statusCode,
        latencyMs,
        timestamp: new Date()
      }
    }).catch((error: unknown) => {
      request.log?.warn?.({ error, apiKeyId: apiKey.id }, 'failed to record API key usage event');
    });
  });
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  try {
    const path = request.url.split('?')[0];
    const token = bearerToken(request);
    if (token?.startsWith('fw_')) {
      const hash = createHash('sha256').update(token).digest('hex');
      const apiKey = await request.server.prisma.apiKey.findFirst({
        where: {
          keyHash: hash,
          isActive: true,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
        },
        include: { tenant: true }
      });

      if (!apiKey) {
        return reply.status(401).send({ error: 'Invalid API key' });
      }

      const scopes = apiKey.scopes ?? [];
      const required = requiredApiScope(request.method, path);
      if (!hasScope(scopes, required, request.method, path)) {
        return reply.status(403).send({
          error: 'INSUFFICIENT_SCOPE',
          required,
          provided: scopes
        });
      }

      request.tenant = apiKey.tenant;
      request.apiKey = apiKey;
      request.user = {
        sub: apiKey.id,
        email: `${apiKey.keyPrefix}@api-key.fauward.local`,
        role: 'TENANT_ADMIN',
        tenantId: apiKey.tenantId,
        tenantSlug: apiKey.tenant.slug,
        plan: apiKey.tenant.plan,
        mfaVerified: true,
        scopes
      };

      await request.server.prisma.$transaction([
        request.server.prisma.apiKey.update({
          where: { id: apiKey.id },
          data: {
            lastUsed: new Date(),
            lastUsedAt: new Date(),
            monthlyRequestCount: { increment: 1 }
          }
        }),
        request.server.prisma.usageRecord.upsert({
          where: { tenantId_month: { tenantId: apiKey.tenantId, month: monthKey() } },
          create: { tenantId: apiKey.tenantId, month: monthKey(), apiCalls: 1 },
          update: { apiCalls: { increment: 1 } }
        })
      ]);
      recordApiKeyUsage(request, reply, apiKey, path);
      return;
    }

    await request.jwtVerify();
    const userId = request.user?.sub;
    const tenantId = request.user?.tenantId;
    const role = request.user?.role;
    if (!userId || !tenantId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    if (request.user?.mode === 'IMPERSONATION') {
      const sessionId = request.user.impersonationSessionId;
      const active = sessionId ? await request.server.redis.get(`platform:impersonation:${sessionId}`) : null;
      if (!active) {
        return reply.status(401).send({ error: 'Impersonation session expired', code: 'IMPERSONATION_EXPIRED' });
      }
    }
    const user = await request.server.prisma.user.findFirst({
      where: { id: userId, tenantId },
      select: { isActive: true }
    });
    if (!user?.isActive) {
      return reply.status(401).send({ error: 'Account suspended', code: 'USER_SUSPENDED' });
    }

    if (role !== 'SUPER_ADMIN') {
      const tenantStatus =
        request.tenant?.status ??
        (
          await request.server.prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { status: true }
          })
        )?.status;

      if (tenantStatus === 'SUSPENDED' && !isSuspendedTenantAllowedPath(request.method, path)) {
        return reply.status(403).send({
          error: 'TENANT_SUSPENDED',
          message: 'This tenant is currently suspended. Contact support.'
        });
      }
    }

    const isMfaRoute = path.startsWith('/api/v1/auth/mfa/');
    const requiresMfa = role === 'SUPER_ADMIN' || path.startsWith('/api/v1/admin/');
    if (!isMfaRoute && requiresMfa && request.user?.mfaVerified !== true) {
      return reply.status(403).send({ error: 'MFA required', code: 'MFA_REQUIRED' });
    }
  } catch (err) {
    return reply.send(err);
  }
}
