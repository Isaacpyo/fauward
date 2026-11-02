import { describe, expect, it, vi } from 'vitest';
import { auditMiddleware } from './middleware.js';
import type { AuditRowData } from './row.js';

type FinishHandler = () => void;

function createSink() {
  return vi.fn(async (row: AuditRowData) => row);
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
    const sink = createSink();
    const { reply, finish } = createReply(204);

    await auditMiddleware({ sink })(request(), reply);
    await finish();

    expect(sink).toHaveBeenCalledTimes(1);
  });

  it.each([400, 500])('does not write audit entries for %i responses', async (statusCode) => {
    const sink = createSink();
    const { reply, finish } = createReply(statusCode);

    await auditMiddleware({ sink })(request(), reply);
    await finish();

    expect(sink).not.toHaveBeenCalled();
  });

  it('captures actor and staff session details from the platform session', async () => {
    const sink = createSink();
    const { reply, finish } = createReply(200);

    await auditMiddleware({ sink })(request(), reply);
    await finish();

    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({
        actorId: 'staff_001',
        actorEmail: 'staff@fauward.com',
        actorRole: 'TRUST_ANALYST',
        sessionId: 'staff_session_001'
      })
    );
  });

  it('redacts password, token, and card_number fields', async () => {
    const sink = createSink();
    const { reply, finish } = createReply(201);

    await auditMiddleware({ sink })(
      request({
        password: 'plain-text-password',
        token: 'secret-token',
        card_number: '4242424242424242',
        nested: { refreshToken: 'refresh-token' }
      }),
      reply
    );
    await finish();

    expect(sink).toHaveBeenCalledWith(
      expect.objectContaining({
        after: {
          password: '[REDACTED]',
          token: '[REDACTED]',
          card_number: '[REDACTED_CARD]',
          nested: { refreshToken: '[REDACTED]' }
        }
      })
    );
  });

  it('writes nothing when the handler already wrote its own audit row (WP-5.1 safety net)', async () => {
    const sink = createSink();
    const { reply, finish } = createReply(200);
    let written = false;

    await auditMiddleware({ sink, auditedProbe: () => () => written })(request(), reply);
    written = true;
    await finish();

    expect(sink).not.toHaveBeenCalled();
  });
});
