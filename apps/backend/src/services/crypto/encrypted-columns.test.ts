import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { HAS_TEST_DB, createTestPlatformUser, createTestPrisma, createTestTenant } from '../../test-support/test-db.js';
import { checkEncryptedValuesDecrypt, fieldKeyId, rotateFieldEncryption, scanUnencryptedSecrets } from './encrypted-columns.js';
import { decryptField, encryptField } from './field-encryption.js';

// SOC 2 CC6.6 evidence (WP-5.3) against real Postgres: secrets at rest are field-encryption ciphertext, and a key
// rotation moves every value to the new key id without losing any.

const OLD_KEY = randomBytes(32).toString('base64');
const NEW_KEY = randomBytes(32).toString('base64');
const BEFORE = { FIELD_ENCRYPTION_KEYS: JSON.stringify({ kold: OLD_KEY }), FIELD_ENCRYPTION_ACTIVE_KEY_ID: 'kold' };
const DURING = { FIELD_ENCRYPTION_KEYS: JSON.stringify({ kold: OLD_KEY, knew: NEW_KEY }), FIELD_ENCRYPTION_ACTIVE_KEY_ID: 'knew' };
const AFTER = { FIELD_ENCRYPTION_KEYS: JSON.stringify({ knew: NEW_KEY }), FIELD_ENCRYPTION_ACTIVE_KEY_ID: 'knew' };

describe.runIf(HAS_TEST_DB)('secrets at rest (WP-5.3, real Postgres)', () => {
  let prisma: PrismaClient;
  let tenantId: string;
  let platformUserId: string;
  const plaintext = { totp: 'JBSWY3DPEHPK3PXP', secretKey: 'sk_test_seeded_gateway_key', webhook: 'whsec_seeded', tenantWebhook: 'tenant-webhook-secret' };

  beforeAll(async () => {
    prisma = createTestPrisma();
    const tenant = await createTestTenant(prisma);
    tenantId = tenant.id;
    const user = await createTestPlatformUser(prisma);
    platformUserId = user.id;
    // Seeded the way the writers store them: console MFA enrolment, the tenant gateway service and the 0055 backfill.
    await prisma.platformUser.update({ where: { id: user.id }, data: { mfaSecretEncrypted: encryptField(plaintext.totp, BEFORE) } });
    await prisma.tenantPaymentGateway.create({
      data: { tenantId, provider: 'STRIPE', secretKeyEncrypted: encryptField(plaintext.secretKey, BEFORE), webhookSecretEncrypted: encryptField(plaintext.webhook, BEFORE) }
    });
    await prisma.tenantSettings.create({ data: { tenantId, webhookSecret: encryptField(plaintext.tenantWebhook, BEFORE) } });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it('ACC-ENC-1 the at-rest scan finds no secret column without the v1: prefix on seeded data, and names a plaintext one by id', async () => {
    const clean = await scanUnencryptedSecrets(prisma);
    expect(clean.findings).toEqual([]);
    expect(clean.ok).toBe(true);

    const leaky = await createTestTenant(prisma);
    await prisma.tenantSettings.create({ data: { tenantId: leaky.id, webhookSecret: 'plaintext-secret' } });
    try {
      const found = await scanUnencryptedSecrets(prisma);
      expect(found.ok).toBe(false);
      expect(found.findings).toEqual([{ column: 'TenantSettings.webhookSecret', id: leaky.id, tenantId: leaky.id }]);
      expect(JSON.stringify(found)).not.toContain('plaintext-secret');
    } finally {
      await prisma.tenantSettings.delete({ where: { tenantId: leaky.id } });
    }
  });

  it('ACC-ENC-2 after rotation every encrypted value carries the new key id and decrypts; removing the old key breaks nothing', async () => {
    const scope = { tenantIds: [tenantId], platformUserIds: [platformUserId] };
    const dry = await rotateFieldEncryption(prisma, { env: DURING, scope, dryRun: true });
    expect(dry).toMatchObject({ dryRun: true, rotated: 4, failures: [] });
    expect((await checkEncryptedValuesDecrypt(prisma, { env: BEFORE, scope })).keyIds).toEqual(['kold']);

    const rotation = await rotateFieldEncryption(prisma, { env: DURING, scope });
    expect(rotation).toMatchObject({ activeKeyId: 'knew', scanned: 4, rotated: 4, alreadyActive: 0, failures: [] });
    expect(rotation.byColumn).toEqual({ 'PlatformUser.mfaSecretEncrypted': 1, 'TenantPaymentGateway.secretKeyEncrypted': 1, 'TenantPaymentGateway.webhookSecretEncrypted': 1, 'TenantSettings.webhookSecret': 1 });

    // The old key is gone from the keyring: every value still decrypts, to the same plaintext.
    expect(await checkEncryptedValuesDecrypt(prisma, { env: AFTER, scope })).toEqual({ checked: 4, keyIds: ['knew'], failures: [] });
    const user = await prisma.platformUser.findUniqueOrThrow({ where: { id: platformUserId } });
    const gateway = await prisma.tenantPaymentGateway.findFirstOrThrow({ where: { tenantId } });
    const settings = await prisma.tenantSettings.findUniqueOrThrow({ where: { tenantId } });
    expect(fieldKeyId(user.mfaSecretEncrypted!)).toBe('knew');
    expect(decryptField(user.mfaSecretEncrypted!, AFTER)).toBe(plaintext.totp);
    expect(decryptField(gateway.secretKeyEncrypted!, AFTER)).toBe(plaintext.secretKey);
    expect(decryptField(gateway.webhookSecretEncrypted!, AFTER)).toBe(plaintext.webhook);
    expect(decryptField(settings.webhookSecret!, AFTER)).toBe(plaintext.tenantWebhook);

    // A second run is a no-op.
    expect(await rotateFieldEncryption(prisma, { env: AFTER, scope })).toMatchObject({ rotated: 0, alreadyActive: 4, failures: [] });
    expect((await scanUnencryptedSecrets(prisma)).ok).toBe(true);
  });
});
