import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';

import { authenticatePlatformSession } from '../../middleware/authenticate-platform-session.js';
import { requireFreshPlatformMfa } from '../../middleware/require-fresh-platform-mfa.js';
import { requirePlatformCsrf } from '../../middleware/require-platform-csrf.js';
import { permissionsForPlatformRole } from '../../services/platform-permission.service.js';
import { computePlatformAuditHash } from '../../services/platform-audit.service.js';
import { redactPlatformLogValue } from '../../services/platform-redaction.service.js';
import { setPlatformCsrfCookies } from '../../services/platform-session.service.js';

function makeReply() {
  const send = vi.fn();
  const status = vi.fn().mockReturnValue({ send });
  const setCookie = vi.fn();
  return { status, send, setCookie };
}

describe('platform control plane security primitives', () => {
  it('does not contain the burned platform default credentials or old superadmin token keys', () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
    const burned = [
      'PLATFORM_ADMIN_' + 'PASSWORD',
      'PLATFORM_ADMIN_' + 'EMAIL',
      'Oluwaseun' + '44',
      'fw_sa_' + 'access_token',
      'fw_sa_' + 'refresh_token',
      'fauward' + '@gmail'
    ];
    const offenders: string[] = [];
    const ignoredDirectories = new Set([
      '.git',
      '.next',
      '.next-build',
      '.storage',
      '.turbo',
      'coverage',
      'dist',
      'node_modules'
    ]);

    function scan(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ignoredDirectories.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scan(full);
          continue;
        }
        if (full.endsWith('platform-control-plane.test.ts')) continue;
        let text = '';
        try {
          text = fs.readFileSync(full, 'utf8');
        } catch {
          continue;
        }
        if (burned.some((value) => text.includes(value))) offenders.push(path.relative(root, full));
      }
    }

    scan(root);
    expect(offenders).toEqual([]);
  });

  it('maps SUPER_ADMIN to all platform permissions and readonly to read-only capabilities', () => {
    expect(permissionsForPlatformRole('SUPER_ADMIN')).toContain('tenant:suspend');
    expect(permissionsForPlatformRole('SUPER_ADMIN')).toContain('logs:view_sensitive');
    expect(permissionsForPlatformRole('PLATFORM_READONLY')).toContain('tenant:read');
    expect(permissionsForPlatformRole('PLATFORM_READONLY')).not.toContain('tenant:suspend');
  });

  it('rejects tenant user bearer tokens on platform middleware', async () => {
    const tenantToken = jwt.sign({ sub: 'user-1', tenantId: 'tenant-1', role: 'TENANT_ADMIN' }, 'test-access-secret-minimum-16-chars');
    const reply = makeReply();
    await authenticatePlatformSession(
      {
        cookies: {},
        headers: { authorization: `Bearer ${tenantToken}` },
        server: { prisma: {} }
      } as any,
      reply as any
    );
    expect(reply.status).toHaveBeenCalledWith(401);
  });

  it('rejects mutating platform requests without CSRF', async () => {
    const reply = makeReply();
    await requirePlatformCsrf({ method: 'POST', headers: {}, cookies: {} } as any, reply as any);
    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({ error: 'CSRF_REQUIRED', message: 'Missing or invalid CSRF token.' });
  });

  it('accepts matching double-submit CSRF token', async () => {
    const reply = makeReply();
    setPlatformCsrfCookies(reply as any);
    const csrfCall = reply.setCookie.mock.calls.find(([name]) => name === 'fw_platform_csrf');
    expect(csrfCall).toBeTruthy();
    const csrf = csrfCall?.[1] as string;
    const cookies = Object.fromEntries(reply.setCookie.mock.calls.map(([name, value]) => [name, value]));
    const nextReply = makeReply();
    await requirePlatformCsrf({ method: 'PATCH', headers: { 'x-csrf-token': csrf }, cookies } as any, nextReply as any);
    expect(nextReply.status).not.toHaveBeenCalled();
  });

  it('requires fresh MFA for dangerous platform actions', async () => {
    const reply = makeReply();
    await requireFreshPlatformMfa({ platform: { session: { mfaVerifiedAt: new Date(Date.now() - 11 * 60 * 1000) } } } as any, reply as any);
    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({
      error: 'MFA_REQUIRED',
      message: 'Fresh MFA verification is required for this action.'
    });
  });

  it('computes tamper-evident audit hashes from stable fields and previous hash', () => {
    const fields = { actorId: 'platform-user-1', action: 'TENANT_SUSPENSION', metadata: { tenantId: 'tenant-1' } };
    const first = computePlatformAuditHash(fields, null);
    const second = computePlatformAuditHash(fields, first);
    expect(first).toHaveLength(64);
    expect(second).toHaveLength(64);
    expect(second).not.toBe(first);
  });

  it('redacts sensitive platform log values by default', () => {
    const redacted = redactPlatformLogValue({
      email: 'operator@example.com',
      apiKey: 'fw_live_1234567890abcd',
      authorization: 'Bearer abc.def.ghi',
      nested: { password: 'secret-value' }
    }) as Record<string, unknown>;
    expect(JSON.stringify(redacted)).not.toContain('operator@example.com');
    expect(JSON.stringify(redacted)).not.toContain('secret-value');
    expect(JSON.stringify(redacted)).not.toContain('abc.def.ghi');
    expect(JSON.stringify(redacted)).toContain('****abcd');
  });
});
