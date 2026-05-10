import { describe, expect, it, vi } from 'vitest';
import { auditMiddleware } from './middleware.js';
import type { PlatformAuditClient } from './types.js';

type FinishHandler = () => void;

function createClient() {
  return {
    platformAuditLog: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => args.data)
    }
  } satisfies PlatformAuditClient;
}

function createReply(statusCode: number) {
  let finishHandler: FinishHandler | null = null;
  return {
    reply: {
      statusCode,
      raw: {
        once: vi.fn((_event: 'finish', handler: FinishHandler) => {
          finishHandler = handler;
        })
      }
    },
    finish: async () => {
      finishHandler?.();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };
}

function request(body: unknown = { ok: true }) {
  return {
    method: 'POST',
    url: '/api/internal/iam/users',
    ip: '127.0.0.1',
    headers: { 'user-agent': 'vitest' },
    body,
    platform: {
      user: { id: 'staff_001', email: 'staff@fauward.com', role: 'TRUST_ANALYST' },
      session: { id: 'staff_session_001' }
    },
    log: { error: vi.fn() }
  };
}

describe('auditMiddleware', () => {
  it('writes audit entries for successful mutating internal requests', async () => {
    const client = createClient();
    const { reply, finish } = createReply(204);

    await auditMiddleware({ prisma: client })(request(), reply);
    await finish();

    expect(client.platformAuditLog.create).toHaveBeenCalledTimes(1);
  });

  it.each([400, 500])('does not write audit entries for %i responses', async (statusCode) => {
    const client = createClient();
    const { reply, finish } = createReply(statusCode);

    await auditMiddleware({ prisma: client })(request(), reply);
    await finish();

    expect(client.platformAuditLog.create).not.toHaveBeenCalled();
  });

  it('captures actor and staff session details from the platform session', async () => {
    const client = createClient();
    const { reply, finish } = createReply(200);

    await auditMiddleware({ prisma: client })(request(), reply);
    await finish();

    expect(client.platformAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorId: 'staff_001',
          actorEmail: 'staff@fauward.com',
          actorRole: 'TRUST_ANALYST',
          sessionId: 'staff_session_001'
        })
      })
    );
  });

  it('redacts password, token, and card_number fields', async () => {
    const client = createClient();
    const { reply, finish } = createReply(201);

    await auditMiddleware({ prisma: client })(
      request({
        password: 'plain-text-password',
        token: 'secret-token',
        card_number: '4242424242424242',
        nested: { refreshToken: 'refresh-token' }
      }),
      reply
    );
    await finish();

    expect(client.platformAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          after: {
            password: '[REDACTED]',
            token: '[REDACTED]',
            card_number: '[REDACTED_CARD]',
            nested: { refreshToken: '[REDACTED]' }
          }
        })
      })
    );
  });
});
