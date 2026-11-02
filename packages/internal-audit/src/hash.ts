import { createHash } from 'node:crypto';

/**
 * The one audit hash scheme (WP-5.1, S14): sha256(previous hash + canonical JSON of the entry). Every PlatformAuditLog
 * row written from 0080 on carries `hashVersion` 2 and is hashed with `computeAuditRowHash` (row.ts), which uses this.
 */
export const AUDIT_HASH_VERSION = 2;

export type AuditJson = string | number | boolean | null | AuditJson[] | { [key: string]: AuditJson };

export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

/** The value as Postgres jsonb will hand it back (Dates → ISO strings, undefined keys dropped), so hashes survive a round trip. */
export function normalizeAuditJson(value: unknown): AuditJson {
  if (value === undefined) return null;
  const text = JSON.stringify(value);
  return text === undefined ? null : (JSON.parse(text) as AuditJson);
}

export function computeEntryHash(prevHash: string | null, entry: object): string {
  return createHash('sha256')
    .update(`${prevHash ?? ''}${canonicalJson(entry)}`)
    .digest('hex');
}
