import { describe, expect, it, vi } from 'vitest';
import { DROPPED_TABLES, precheckDropDeadModels } from './0079-drop-dead-models-precheck.js';

// WP-4.0c (D10): the pre-check for 0079_drop_dead_models counts every table it drops (or reports it missing) and the
// legacy columns, and flags legacy values that the 0047/0055 backfills have not carried over yet. Read-only.

/** Tagged-template calls pass the string parts first; Prisma.sql objects carry them in `strings`. */
function sqlText(query: unknown) {
  if (Array.isArray(query)) return query.join('?');
  return ((query as { strings?: string[] }).strings ?? []).join('?');
}

describe('0079 drop-dead-models pre-check', () => {
  it('counts every dropped table, the legacy columns and what is not backfilled yet', async () => {
    const queries: string[] = [];
    const $queryRaw = vi.fn(async (query: unknown, ...values: unknown[]) => {
      const text = sqlText(query);
      queries.push(text);
      if (text.includes('to_regclass')) return [{ exists: values[0] !== 'public.tax_returns' }];
      if (text.includes('FROM "ticket_messages"')) return [{ internal: 7n, fromSA: 5n, legacyNotBackfilled: 2n }];
      if (text.includes('FROM "tenant_settings"')) return [{ withKey: 3n, legacyNotBackfilled: 1n }];
      return [{ count: 4n }];
    });
    const result = await precheckDropDeadModels({ $queryRaw } as never);
    expect(Object.keys(result.tables)).toEqual([...DROPPED_TABLES]);
    expect(DROPPED_TABLES).toHaveLength(11);
    expect(result.tables.tax_returns).toBe('missing');
    expect(result.tables.partners).toBe(4);
    expect(result.columns).toEqual({ 'ticket_messages.isInternal (true)': 7, 'ticket_messages.fromSA (true)': 5, 'tenant_settings.paymentGatewayKey (not null)': 3 });
    expect(result.legacyNotBackfilled).toEqual({ ticketMessages: 2, paymentGatewayKeys: 1 });
    expect(queries.every((text) => /^\s*SELECT/i.test(text))).toBe(true);
  });
});
