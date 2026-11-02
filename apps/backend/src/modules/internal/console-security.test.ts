import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import jwt from 'jsonwebtoken';

import { authenticatePlatformSession } from '../../middleware/authenticate-platform-session.js';
import { requireFreshPlatformMfa } from '../../middleware/require-fresh-platform-mfa.js';
import { requirePlatformCsrf } from '../../middleware/require-platform-csrf.js';
import { auditRowFromWriteInput, computeAuditRowHash } from '@fauward/internal-audit';
import { redactPlatformLogValue } from '../../services/platform-redaction.service.js';
import { setPlatformCsrfCookies } from '../../services/platform-session.service.js';

function makeReply() {
  const send = vi.fn();
  const status = vi.fn().mockReturnValue({ send });
  const setCookie = vi.fn();
  return { status, send, setCookie };
}

describe('console security primitives', () => {
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
        if (full.endsWith('console-security.test.ts')) continue;
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

  it('the legacy PlatformRole permission map and its middleware are gone (D2)', () => {
    const here = path.dirname(fileURLToPath(import.meta.url));
    expect(fs.existsSync(path.resolve(here, '../../services/platform-permission.service.ts'))).toBe(false);
    expect(fs.existsSync(path.resolve(here, '../../middleware/require-platform-permission.ts'))).toBe(false);
    expect(fs.existsSync(path.resolve(here, '../platform/platform.routes.ts'))).toBe(false);
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
    await requireFreshPlatformMfa({ platform: { user: { mfaEnabled: true }, session: { mfaVerifiedAt: new Date(Date.now() - 11 * 60 * 1000) } } } as any, reply as any);
    expect(reply.status).toHaveBeenCalledWith(403);
    expect(reply.send).toHaveBeenCalledWith({
      error: 'MFA_REQUIRED',
      stepUp: true,
      message: 'Fresh MFA verification is required for this action.'
    });
  });

  it('computes tamper-evident audit hashes from stable fields and previous hash', () => {
    const row = auditRowFromWriteInput({ actor_id: 'platform-user-1', actor_role: 'TRUST_ANALYST', action: 'TENANT_SUSPENSION', target_type: 'tenant', target_id: 'tenant-1', before: null, after: null, reason: null, ip_address: '', session_id: 's1', jit_session_id: null });
    const first = computeAuditRowHash(null, row);
    const second = computeAuditRowHash(first, row);
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
