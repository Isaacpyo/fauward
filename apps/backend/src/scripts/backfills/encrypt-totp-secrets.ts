import { encryptField, isEncryptedField } from '../../services/crypto/field-encryption.js';

// Spec label 0036-encrypt-totp-secrets (migration 0037_console_mfa). Idempotent: only rows without the `v1:` prefix change.

export type TotpBackfillClient = {
  platformUser: {
    findMany(args: {
      where: { OR: Array<{ mfaSecretEncrypted: { not: null } } | { mfaPendingSecretEncrypted: { not: null } }> };
      select: { id: true; mfaSecretEncrypted: true; mfaPendingSecretEncrypted: true };
    }): Promise<Array<{ id: string; mfaSecretEncrypted: string | null; mfaPendingSecretEncrypted: string | null }>>;
    update(args: { where: { id: string }; data: { mfaSecretEncrypted?: string; mfaPendingSecretEncrypted?: string } }): Promise<unknown>;
  };
};

export type TotpBackfillResult = { scanned: number; alreadyEncrypted: number; encrypted: number; dryRun: boolean };

export async function encryptTotpSecrets(db: TotpBackfillClient, options: { dryRun: boolean }): Promise<TotpBackfillResult> {
  const rows = await db.platformUser.findMany({
    where: { OR: [{ mfaSecretEncrypted: { not: null } }, { mfaPendingSecretEncrypted: { not: null } }] },
    select: { id: true, mfaSecretEncrypted: true, mfaPendingSecretEncrypted: true }
  });

  const result: TotpBackfillResult = { scanned: rows.length, alreadyEncrypted: 0, encrypted: 0, dryRun: options.dryRun };
  for (const row of rows) {
    const data: { mfaSecretEncrypted?: string; mfaPendingSecretEncrypted?: string } = {};
    if (row.mfaSecretEncrypted && !isEncryptedField(row.mfaSecretEncrypted)) data.mfaSecretEncrypted = encryptField(row.mfaSecretEncrypted);
    if (row.mfaPendingSecretEncrypted && !isEncryptedField(row.mfaPendingSecretEncrypted)) data.mfaPendingSecretEncrypted = encryptField(row.mfaPendingSecretEncrypted);

    if (Object.keys(data).length === 0) {
      result.alreadyEncrypted += 1;
      continue;
    }
    result.encrypted += 1;
    if (!options.dryRun) await db.platformUser.update({ where: { id: row.id }, data });
  }
  return result;
}
