import { createHash } from 'crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';

export type IdempotencyResolution =
  | { type: 'bypass' }
  | { type: 'duplicate'; statusCode: number; response: unknown }
  | { type: 'processing' }
  | { type: 'new'; key: string; requestHash: string };

function bodyHash(body: unknown) {
  const raw = JSON.stringify(body ?? {});
  return createHash('sha256').update(raw).digest('hex');
}

export async function resolveIdempotency(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<IdempotencyResolution> {
  const tenantId = request.tenant?.id;
  if (!tenantId) {
    return { type: 'bypass' };
  }

  const header = request.headers['idempotency-key'];
  if (!header || typeof header !== 'string' || !header.trim()) {
    return { type: 'bypass' };
  }

  const key = header.trim();
  const requestHash = bodyHash(request.body);
  const existing = await request.server.prisma.idempotencyKey.findUnique({
    where: { tenantId_key: { tenantId, key } }
  });

  if (existing?.response && existing.statusCode) {
    return { type: 'duplicate', statusCode: existing.statusCode, response: existing.response };
  }

  if (existing && !existing.response) {
    return { type: 'processing' };
  }

  await request.server.prisma.idempotencyKey.create({
    data: {
      tenantId,
      key,
      requestHash,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }
  });

  return { type: 'new', key, requestHash };
}

export async function storeIdempotencyResult(
  request: FastifyRequest,
  key: string,
  statusCode: number,
  response: unknown
) {
  const tenantId = request.tenant?.id;
  if (!tenantId) return;
  await request.server.prisma.idempotencyKey.update({
    where: { tenantId_key: { tenantId, key } },
    data: {
      statusCode,
      response: response as any,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    }
  });
}

export async function dropExpiredIdempotencyKeys(request: FastifyRequest) {
  const tenantId = request.tenant?.id;
  if (!tenantId) return;
  await request.server.prisma.idempotencyKey.deleteMany({
    where: { tenantId, expiresAt: { lt: new Date() } }
  });
}
