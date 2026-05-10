import { createHash } from 'node:crypto';
import type { AuditEntry } from './types.js';

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

export function computeEntryHash(prevHash: string | null, entry: Omit<AuditEntry, 'hash' | 'prev_hash'>): string {
  return createHash('sha256')
    .update(`${prevHash ?? ''}${canonicalJson(entry)}`)
    .digest('hex');
}
