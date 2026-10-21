import type { PrismaClient } from '@prisma/client';
import { decryptField, encryptField, isEncryptedField, parseFieldEncryptionKeyring } from './field-encryption.js';

// trust.secrets / SOC 2 CC6.6 (WP-5.3): every column that holds a secret at rest in field-encryption ciphertext
// (`v1:<keyId>:…`). The scan reports any value without the prefix; the rotation re-encrypts values under the active key.
// These are platform-wide compliance sweeps (system context): they read every tenant's row by design and only ever
// update a row by its own primary key.

type EnvLike = Record<string, string | undefined>;
type Db = Pick<PrismaClient, 'platformUser' | 'tenantPaymentGateway' | 'tenantSettings'>;

export const ENCRYPTED_COLUMNS = [
  'PlatformUser.mfaSecretEncrypted',
  'PlatformUser.mfaPendingSecretEncrypted',
  'TenantPaymentGateway.secretKeyEncrypted',
  'TenantPaymentGateway.webhookSecretEncrypted',
  'TenantPaymentGateway.encryptionKeyEncrypted',
  'TenantSettings.webhookSecret'
] as const;

export type EncryptedColumn = (typeof ENCRYPTED_COLUMNS)[number];

/** Optional narrowing, so a rotation can be staged one tenant or one staff account at a time. */
export type EncryptedRowScope = { tenantIds?: string[]; platformUserIds?: string[] };

type Row = { column: EncryptedColumn; id: string; value: string };

/** Rows whose secret column holds a value that is not field-encryption ciphertext. Ids only, never values. */
export async function scanUnencryptedSecrets(db: Db) {
  const [mfa, pending, gatewaySecret, gatewayWebhook, gatewayEncryption, settings] = await Promise.all([
    db.platformUser.findMany({ where: { mfaSecretEncrypted: { not: null }, NOT: { mfaSecretEncrypted: { startsWith: 'v1:' } } }, select: { id: true } }),
    db.platformUser.findMany({ where: { mfaPendingSecretEncrypted: { not: null }, NOT: { mfaPendingSecretEncrypted: { startsWith: 'v1:' } } }, select: { id: true } }),
    db.tenantPaymentGateway.findMany({ where: { secretKeyEncrypted: { not: null }, NOT: { secretKeyEncrypted: { startsWith: 'v1:' } } }, select: { id: true, tenantId: true } }),
    db.tenantPaymentGateway.findMany({ where: { webhookSecretEncrypted: { not: null }, NOT: { webhookSecretEncrypted: { startsWith: 'v1:' } } }, select: { id: true, tenantId: true } }),
    db.tenantPaymentGateway.findMany({ where: { encryptionKeyEncrypted: { not: null }, NOT: { encryptionKeyEncrypted: { startsWith: 'v1:' } } }, select: { id: true, tenantId: true } }),
    db.tenantSettings.findMany({ where: { webhookSecret: { not: null }, NOT: { webhookSecret: { startsWith: 'v1:' } } }, select: { tenantId: true } })
  ]);
  const findings: Array<{ column: EncryptedColumn; id: string; tenantId?: string }> = [
    ...mfa.map((row) => ({ column: 'PlatformUser.mfaSecretEncrypted' as const, id: row.id })),
    ...pending.map((row) => ({ column: 'PlatformUser.mfaPendingSecretEncrypted' as const, id: row.id })),
    ...gatewaySecret.map((row) => ({ column: 'TenantPaymentGateway.secretKeyEncrypted' as const, id: row.id, tenantId: row.tenantId })),
    ...gatewayWebhook.map((row) => ({ column: 'TenantPaymentGateway.webhookSecretEncrypted' as const, id: row.id, tenantId: row.tenantId })),
    ...gatewayEncryption.map((row) => ({ column: 'TenantPaymentGateway.encryptionKeyEncrypted' as const, id: row.id, tenantId: row.tenantId })),
    ...settings.map((row) => ({ column: 'TenantSettings.webhookSecret' as const, id: row.tenantId, tenantId: row.tenantId }))
  ];
  return { ok: findings.length === 0, columns: [...ENCRYPTED_COLUMNS], findings };
}

async function encryptedRows(db: Db, scope: EncryptedRowScope): Promise<Row[]> {
  const userWhere = scope.platformUserIds ? { id: { in: scope.platformUserIds } } : scope.tenantIds ? { id: { in: [] as string[] } } : {};
  const tenantWhere = scope.tenantIds ? { tenantId: { in: scope.tenantIds } } : scope.platformUserIds ? { tenantId: { in: [] as string[] } } : {};
  const [users, gateways, settings] = await Promise.all([
    db.platformUser.findMany({ where: { ...userWhere, OR: [{ mfaSecretEncrypted: { startsWith: 'v1:' } }, { mfaPendingSecretEncrypted: { startsWith: 'v1:' } }] }, select: { id: true, mfaSecretEncrypted: true, mfaPendingSecretEncrypted: true } }),
    db.tenantPaymentGateway.findMany({
      where: { ...tenantWhere, OR: [{ secretKeyEncrypted: { startsWith: 'v1:' } }, { webhookSecretEncrypted: { startsWith: 'v1:' } }, { encryptionKeyEncrypted: { startsWith: 'v1:' } }] },
      select: { id: true, secretKeyEncrypted: true, webhookSecretEncrypted: true, encryptionKeyEncrypted: true }
    }),
    db.tenantSettings.findMany({ where: { ...tenantWhere, webhookSecret: { startsWith: 'v1:' } }, select: { tenantId: true, webhookSecret: true } })
  ]);
  const rows: Row[] = [];
  const push = (column: EncryptedColumn, id: string, value: string | null) => {
    if (isEncryptedField(value)) rows.push({ column, id, value });
  };
  for (const user of users) {
    push('PlatformUser.mfaSecretEncrypted', user.id, user.mfaSecretEncrypted);
    push('PlatformUser.mfaPendingSecretEncrypted', user.id, user.mfaPendingSecretEncrypted);
  }
  for (const gateway of gateways) {
    push('TenantPaymentGateway.secretKeyEncrypted', gateway.id, gateway.secretKeyEncrypted);
    push('TenantPaymentGateway.webhookSecretEncrypted', gateway.id, gateway.webhookSecretEncrypted);
    push('TenantPaymentGateway.encryptionKeyEncrypted', gateway.id, gateway.encryptionKeyEncrypted);
  }
  for (const row of settings) push('TenantSettings.webhookSecret', row.tenantId, row.webhookSecret);
  return rows;
}

export function fieldKeyId(ciphertext: string) {
  return ciphertext.split(':')[1] ?? null;
}

async function writeColumn(db: Db, row: Row, value: string) {
  switch (row.column) {
    case 'PlatformUser.mfaSecretEncrypted':
      return db.platformUser.updateMany({ where: { id: row.id, mfaSecretEncrypted: row.value }, data: { mfaSecretEncrypted: value } });
    case 'PlatformUser.mfaPendingSecretEncrypted':
      return db.platformUser.updateMany({ where: { id: row.id, mfaPendingSecretEncrypted: row.value }, data: { mfaPendingSecretEncrypted: value } });
    case 'TenantPaymentGateway.secretKeyEncrypted':
      return db.tenantPaymentGateway.updateMany({ where: { id: row.id, secretKeyEncrypted: row.value }, data: { secretKeyEncrypted: value } });
    case 'TenantPaymentGateway.webhookSecretEncrypted':
      return db.tenantPaymentGateway.updateMany({ where: { id: row.id, webhookSecretEncrypted: row.value }, data: { webhookSecretEncrypted: value } });
    case 'TenantPaymentGateway.encryptionKeyEncrypted':
      return db.tenantPaymentGateway.updateMany({ where: { id: row.id, encryptionKeyEncrypted: row.value }, data: { encryptionKeyEncrypted: value } });
    case 'TenantSettings.webhookSecret':
      return db.tenantSettings.updateMany({ where: { tenantId: row.id, webhookSecret: row.value }, data: { webhookSecret: value } });
  }
}

export type RotationResult = { dryRun: boolean; activeKeyId: string; scanned: number; rotated: number; alreadyActive: number; byColumn: Record<string, number>; failures: Array<{ column: EncryptedColumn; id: string; error: string }> };

/**
 * Re-encrypts every field-encryption value whose key id is not the active one. The keyring in `env` must hold both the
 * old and the active key. Each update is conditional on the value it read, so a concurrent write is never overwritten.
 */
export async function rotateFieldEncryption(db: Db, options: { env?: EnvLike; dryRun?: boolean; scope?: EncryptedRowScope } = {}): Promise<RotationResult> {
  const env = options.env ?? process.env;
  const { activeKeyId } = parseFieldEncryptionKeyring(env);
  const rows = await encryptedRows(db, options.scope ?? {});
  const result: RotationResult = { dryRun: Boolean(options.dryRun), activeKeyId, scanned: rows.length, rotated: 0, alreadyActive: 0, byColumn: {}, failures: [] };
  for (const row of rows) {
    if (fieldKeyId(row.value) === activeKeyId) {
      result.alreadyActive += 1;
      continue;
    }
    try {
      const next = encryptField(decryptField(row.value, env), env);
      if (!options.dryRun && (await writeColumn(db, row, next)).count !== 1) {
        result.failures.push({ column: row.column, id: row.id, error: 'The value changed during rotation; run the rotation again.' });
        continue;
      }
      result.rotated += 1;
      result.byColumn[row.column] = (result.byColumn[row.column] ?? 0) + 1;
    } catch (error) {
      result.failures.push({ column: row.column, id: row.id, error: error instanceof Error ? error.message : 'Rotation failed' });
    }
  }
  return result;
}

/** Decrypts every encrypted value in scope with `env`'s keyring (e.g. after removing an old key); ids of failures only. */
export async function checkEncryptedValuesDecrypt(db: Db, options: { env?: EnvLike; scope?: EncryptedRowScope } = {}) {
  const rows = await encryptedRows(db, options.scope ?? {});
  const failures: Array<{ column: EncryptedColumn; id: string; keyId: string | null }> = [];
  for (const row of rows) {
    try {
      decryptField(row.value, options.env ?? process.env);
    } catch {
      failures.push({ column: row.column, id: row.id, keyId: fieldKeyId(row.value) });
    }
  }
  return { checked: rows.length, keyIds: [...new Set(rows.map((row) => fieldKeyId(row.value)))], failures };
}
