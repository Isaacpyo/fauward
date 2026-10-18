import { createHash, timingSafeEqual } from 'node:crypto';

// ROOT grants (role assignment or JIT) need a hardware-key assertion matching DEV_HARDWARE_KEY_ASSERTION (S2).
// There is no literal default: when the variable is unset, ROOT grants are unavailable in every environment.

export type RootAssertionCheck = { ok: true; fingerprint: string } | { ok: false; status: 403 | 503; error: 'ROOT_GRANT_UNAVAILABLE' | 'HARDWARE_KEY_REQUIRED'; message: string };

function constantTimeEquals(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function checkRootHardwareAssertion(assertion: unknown, env: Record<string, string | undefined> = process.env): RootAssertionCheck {
  const expected = env.DEV_HARDWARE_KEY_ASSERTION?.trim();
  if (!expected) {
    return { ok: false, status: 503, error: 'ROOT_GRANT_UNAVAILABLE', message: 'ROOT grants are unavailable: no hardware key assertion is configured (DEV_HARDWARE_KEY_ASSERTION).' };
  }
  if (typeof assertion !== 'string' || assertion.length === 0 || !constantTimeEquals(assertion, expected)) {
    return { ok: false, status: 403, error: 'HARDWARE_KEY_REQUIRED', message: 'ROOT grant requires hardware key verification' };
  }
  return { ok: true, fingerprint: createHash('sha256').update(assertion).digest('hex') };
}
