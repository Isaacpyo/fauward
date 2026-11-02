import { SignJWT } from 'jose';
import { afterEach, describe, expect, it } from 'vitest';
import { assertRelayAuthConfigured, getAuthContext, handleCreateMessage, handleListFeedback } from '@fauward/relay-api';

// S13 / ACC-L2-2 (WP-4.R): relay-api never decodes a JWT it cannot verify, and refuses to start without
// JWT_ACCESS_SECRET outside development. Every case here is decided before Relay's database is touched.

const SECRET = 'relay-test-secret-0123456789abcdef';
const CONVERSATION = '11111111-1111-4111-8111-111111111111';
const saved = { secret: process.env.JWT_ACCESS_SECRET, nodeEnv: process.env.NODE_ENV };

async function token(secret: string, claims: Record<string, unknown>) {
  return new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).setSubject('staff-1').setExpirationTime('5m').sign(new TextEncoder().encode(secret));
}

function unsigned(claims: Record<string, unknown>) {
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'none', typ: 'JWT' })}.${part({ sub: 'staff-1', ...claims })}.`;
}

function request(url: string, bearer: string | null, body?: unknown) {
  return new Request(url, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
}

afterEach(() => {
  process.env.JWT_ACCESS_SECRET = saved.secret;
  process.env.NODE_ENV = saved.nodeEnv;
});

describe('relay-api authentication (S13)', () => {
  it('ACC-L2-2 refuses to start without JWT_ACCESS_SECRET outside development', () => {
    expect(() => assertRelayAuthConfigured({ NODE_ENV: 'production' })).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => assertRelayAuthConfigured({ NODE_ENV: 'test' })).toThrow(/JWT_ACCESS_SECRET/);
    expect(() => assertRelayAuthConfigured({ NODE_ENV: 'development' })).not.toThrow();
    expect(() => assertRelayAuthConfigured({ NODE_ENV: 'production', JWT_ACCESS_SECRET: SECRET })).not.toThrow();
  });

  it('ACC-L2-2 rejects unverifiable JWTs: forged, unsigned, and any token when the secret is unset', async () => {
    process.env.JWT_ACCESS_SECRET = SECRET;
    expect(await getAuthContext(request('http://relay/x', await token(SECRET, { role: 'SUPER_ADMIN' })))).toMatchObject({ role: 'SUPER_ADMIN', userId: 'staff-1' });
    expect(await getAuthContext(request('http://relay/x', await token('another-secret-0123456789abcdef', { role: 'SUPER_ADMIN' })))).toEqual({});
    expect(await getAuthContext(request('http://relay/x', unsigned({ role: 'SUPER_ADMIN' })))).toEqual({});

    delete process.env.JWT_ACCESS_SECRET;
    // Before WP-4.R a missing secret meant the payload was decoded without verification.
    expect(await getAuthContext(request('http://relay/x', unsigned({ role: 'SUPER_ADMIN', tenantId: 'tenant_a' })))).toEqual({});
    expect(await getAuthContext(request('http://relay/x', await token(SECRET, { role: 'SUPER_ADMIN' })))).toEqual({});
  });

  it('ACC-L2-2 a forged SUPER_ADMIN token cannot send admin messages or read feedback', async () => {
    process.env.JWT_ACCESS_SECRET = SECRET;
    const forged = unsigned({ role: 'SUPER_ADMIN' });
    const send = await handleCreateMessage(request(`http://relay/conversations/${CONVERSATION}/messages`, forged, { sender_type: 'admin', body: 'Spoofed reply' }), CONVERSATION);
    expect(send.status).toBe(403);
    expect((await handleListFeedback(request('http://relay/feedback', forged))).status).toBe(403);
  });
});
