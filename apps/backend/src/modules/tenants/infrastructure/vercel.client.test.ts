import { URL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { VercelApiError, VercelClient, VercelDomainAlreadyTakenError } from './vercel.client.js';

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 404 ? 'Not Found' : 'Error',
    json: vi.fn(async () => body)
  };
}

function client() {
  return new VercelClient({
    apiBase: 'https://api.vercel.test',
    apiToken: 'secret-token',
    portalProjectId: 'prj_portal',
    teamId: 'team_123'
  });
}

describe('VercelClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('adds bearer auth and team/project query parameters', async () => {
    const fetchMock = vi.fn(async (_url: URL, _init?: RequestInit) => jsonResponse(200, { name: 'track.example.com', verified: false }));
    vi.stubGlobal('fetch', fetchMock);

    await client().getDomainConfig('track.example.com');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'https://api.vercel.test/v6/domains/track.example.com/config?teamId=team_123&projectIdOrName=prj_portal'
    );
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer secret-token');
  });

  it('throws VercelDomainAlreadyTakenError for Vercel domain conflicts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(409, { error: { code: 'domain_already_in_use', message: 'taken' } }))
    );

    await expect(client().addDomain('track.example.com')).rejects.toBeInstanceOf(VercelDomainAlreadyTakenError);
  });

  it('maps documented 400 duplicate-domain responses to domain conflicts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(400, { error: { message: 'Domain already exists on this project' } }))
    );

    await expect(client().addDomain('track.example.com')).rejects.toBeInstanceOf(VercelDomainAlreadyTakenError);
  });

  it('maps non-conflict errors to VercelApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(500, { error: { code: 'internal', message: 'upstream failed' } }))
    );

    await expect(client().verifyDomain('track.example.com')).rejects.toMatchObject({
      status: 500,
      code: 'internal'
    } satisfies Partial<VercelApiError>);
  });

  it('treats 404 on remove as idempotent success', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(404, { error: { message: 'missing' } })));

    await expect(client().removeDomain('track.example.com')).resolves.toBeUndefined();
  });
});
