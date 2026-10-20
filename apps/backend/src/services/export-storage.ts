import { createHash } from 'node:crypto';
import type { PrismaClient } from '@prisma/client';

// Storage adapter for compliance export bundles (trust.compliance, WP-2.5). POSTGRES keeps the bytes in `ExportBlob`
// (no extra infrastructure, same backups and retention as the rest of the data). A bucket-backed provider can be added
// behind the same interface; the export row records which provider holds each bundle.

export type StoredObject = { provider: string; key: string; byteSize: number; sha256: string };

export interface ExportStorage {
  readonly provider: string;
  put(tenantId: string | null, bytes: Buffer): Promise<StoredObject>;
  get(tenantId: string | null, key: string): Promise<Buffer | null>;
  remove(tenantId: string | null, key: string): Promise<void>;
}

type BlobDb = Pick<PrismaClient, 'exportBlob'>;

export function postgresExportStorage(db: BlobDb): ExportStorage {
  return {
    provider: 'POSTGRES',
    async put(tenantId, bytes) {
      const blob = await db.exportBlob.create({ data: { tenantId, bytes } });
      return { provider: 'POSTGRES', key: blob.id, byteSize: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') };
    },
    async get(tenantId, key) {
      const blob = await db.exportBlob.findFirst({ where: { id: key, tenantId } });
      return blob ? Buffer.from(blob.bytes) : null;
    },
    async remove(tenantId, key) {
      await db.exportBlob.deleteMany({ where: { id: key, tenantId } });
    }
  };
}

export function exportStorageFor(db: BlobDb, provider: string | null | undefined): ExportStorage | null {
  if (!provider || provider === 'POSTGRES') return postgresExportStorage(db);
  return null;
}
