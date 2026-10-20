import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { assertFieldEncryptionBootConfig, decryptField, encryptField, isEncryptedField } from './field-encryption.js';

const k1 = randomBytes(32).toString('base64');
const k2 = randomBytes(32).toString('base64');
const env = { FIELD_ENCRYPTION_KEYS: JSON.stringify({ k1, k2 }), FIELD_ENCRYPTION_ACTIVE_KEY_ID: 'k1' };

describe('field encryption (architecture §9.1)', () => {
  it('ACC-ENC-1 round-trips and produces v1 ciphertext that hides the plaintext', () => {
    const ciphertext = encryptField('JBSWY3DPEHPK3PXP', env);
    expect(ciphertext.startsWith('v1:k1:')).toBe(true);
    expect(ciphertext).not.toContain('JBSWY3DPEHPK3PXP');
    expect(isEncryptedField(ciphertext)).toBe(true);
    expect(decryptField(ciphertext, env)).toBe('JBSWY3DPEHPK3PXP');
    expect(encryptField('JBSWY3DPEHPK3PXP', env)).not.toBe(ciphertext);
  });

  it('decrypts values written with a non-active key (rotation)', () => {
    const old = encryptField('secret', { ...env, FIELD_ENCRYPTION_ACTIVE_KEY_ID: 'k2' });
    expect(decryptField(old, env)).toBe('secret');
  });

  it('throws on a tampered ciphertext', () => {
    const parts = encryptField('secret', env).split(':');
    const ct = Buffer.from(parts[4], 'base64');
    ct[0] ^= 0xff;
    parts[4] = ct.toString('base64');
    expect(() => decryptField(parts.join(':'), env)).toThrow(/authentication/);
  });

  it('throws on an unknown key id', () => {
    const ciphertext = encryptField('secret', env).replace('v1:k1:', 'v1:k9:');
    expect(() => decryptField(ciphertext, env)).toThrow(/Unknown field encryption key id/);
  });

  it('fails production boot without keys and passes with them', () => {
    expect(() => assertFieldEncryptionBootConfig({ NODE_ENV: 'production' })).toThrow(/FIELD_ENCRYPTION_KEYS/);
    expect(() => assertFieldEncryptionBootConfig({ NODE_ENV: 'production', FIELD_ENCRYPTION_KEYS: '{"k1":"short"}', FIELD_ENCRYPTION_ACTIVE_KEY_ID: 'k1' })).toThrow(/32 bytes/);
    expect(() => assertFieldEncryptionBootConfig({ NODE_ENV: 'production', ...env })).not.toThrow();
    expect(() => assertFieldEncryptionBootConfig({ NODE_ENV: 'development' })).not.toThrow();
  });
});
