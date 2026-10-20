import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM field encryption (console spec, architecture §9.1).
// Ciphertext format: v1:<keyId>:<iv b64>:<tag b64>:<ct b64>
// Keys: FIELD_ENCRYPTION_KEYS = JSON map keyId -> 32-byte base64 key; FIELD_ENCRYPTION_ACTIVE_KEY_ID selects the key for new writes.

const VERSION = 'v1';
const IV_BYTES = 12;
const KEY_BYTES = 32;

export class FieldEncryptionError extends Error {
  constructor(public readonly code: 'NOT_CONFIGURED' | 'INVALID_CONFIG' | 'UNKNOWN_KEY' | 'MALFORMED' | 'TAMPERED', message: string) {
    super(message);
    this.name = 'FieldEncryptionError';
  }
}

type EnvLike = Record<string, string | undefined>;

export type FieldEncryptionKeyring = {
  activeKeyId: string;
  keys: Map<string, Buffer>;
};

export function parseFieldEncryptionKeyring(env: EnvLike = process.env): FieldEncryptionKeyring {
  const rawKeys = env.FIELD_ENCRYPTION_KEYS?.trim();
  const activeKeyId = env.FIELD_ENCRYPTION_ACTIVE_KEY_ID?.trim();
  if (!rawKeys || !activeKeyId) {
    throw new FieldEncryptionError('NOT_CONFIGURED', 'FIELD_ENCRYPTION_KEYS and FIELD_ENCRYPTION_ACTIVE_KEY_ID must be set.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawKeys);
  } catch {
    throw new FieldEncryptionError('INVALID_CONFIG', 'FIELD_ENCRYPTION_KEYS must be a JSON object of keyId -> base64 key.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new FieldEncryptionError('INVALID_CONFIG', 'FIELD_ENCRYPTION_KEYS must be a JSON object of keyId -> base64 key.');
  }

  const keys = new Map<string, Buffer>();
  for (const [keyId, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (keyId.includes(':')) throw new FieldEncryptionError('INVALID_CONFIG', `Key id "${keyId}" must not contain ":".`);
    if (typeof value !== 'string') throw new FieldEncryptionError('INVALID_CONFIG', `Key "${keyId}" must be a base64 string.`);
    const key = Buffer.from(value, 'base64');
    if (key.length !== KEY_BYTES) throw new FieldEncryptionError('INVALID_CONFIG', `Key "${keyId}" must decode to ${KEY_BYTES} bytes.`);
    keys.set(keyId, key);
  }

  if (!keys.has(activeKeyId)) {
    throw new FieldEncryptionError('INVALID_CONFIG', `FIELD_ENCRYPTION_ACTIVE_KEY_ID "${activeKeyId}" is not in FIELD_ENCRYPTION_KEYS.`);
  }

  return { activeKeyId, keys };
}

/** Throws when NODE_ENV=production and the keyring is missing or invalid. Called at boot from config. */
export function assertFieldEncryptionBootConfig(env: EnvLike = process.env) {
  if (env.NODE_ENV !== 'production') return;
  parseFieldEncryptionKeyring(env);
}

export function isEncryptedField(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.startsWith(`${VERSION}:`);
}

export function encryptField(plaintext: string, env: EnvLike = process.env): string {
  const { activeKeyId, keys } = parseFieldEncryptionKeyring(env);
  const key = keys.get(activeKeyId)!;
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, activeKeyId, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

export function decryptField(ciphertext: string, env: EnvLike = process.env): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 5 || parts[0] !== VERSION) {
    throw new FieldEncryptionError('MALFORMED', 'Value is not a v1 field ciphertext.');
  }
  const [, keyId, ivB64, tagB64, ctB64] = parts;
  const { keys } = parseFieldEncryptionKeyring(env);
  const key = keys.get(keyId);
  if (!key) throw new FieldEncryptionError('UNKNOWN_KEY', `Unknown field encryption key id "${keyId}".`);

  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  if (iv.length !== IV_BYTES || tag.length !== 16) throw new FieldEncryptionError('MALFORMED', 'Field ciphertext has an invalid IV or tag.');

  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    throw new FieldEncryptionError('TAMPERED', 'Field ciphertext failed authentication.');
  }
}

/** Returns a fresh base64 key suitable for FIELD_ENCRYPTION_KEYS. */
export function generateFieldEncryptionKey() {
  return randomBytes(KEY_BYTES).toString('base64');
}
