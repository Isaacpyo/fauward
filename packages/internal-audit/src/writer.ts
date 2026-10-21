import { auditRowFromWriteInput, type AuditRowData } from './row.js';
import type { AuditWriteInput } from './types.js';

/**
 * Appends one row to the chain. The backend's sink takes the chain lock, reads the latest row by `seq`, hashes with
 * `computeAuditRowHash` and inserts, all in one transaction (WP-5.1); this package never reads or writes the table itself.
 */
export type AuditSink = (row: AuditRowData) => Promise<unknown>;

export async function writeAudit(sink: AuditSink, input: AuditWriteInput) {
  return sink(auditRowFromWriteInput(input));
}
