import { describe, expect, it, vi } from 'vitest';
import { backfillTicketMessages } from './ticket-messages.js';

// Backfill 0047-ticket-messages (D5): legacy isInternal/fromSA flags become visibility/author types; tickets Fauward
// answered or opened become PLATFORM; lastMessageAt/firstResponseAt are derived from the messages.

type Row = Record<string, unknown> & { id: string };

function matches(row: Row, where: Record<string, unknown> = {}) {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key];
    if (condition === null) return value === null || value === undefined;
    if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
      const ops = condition as { in?: unknown[]; not?: unknown };
      if (ops.in) return ops.in.includes(value);
      if ('not' in ops) return ops.not === null ? value !== null && value !== undefined : value !== ops.not;
    }
    return value === condition;
  });
}

function fixture() {
  const t0 = new Date('2026-10-01T09:00:00Z');
  const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);
  const tickets: Row[] = [
    { id: 'tkt_customer', audience: 'END_CUSTOMER', lastMessageAt: null, firstResponseAt: null },
    { id: 'tkt_answered_by_fauward', audience: 'END_CUSTOMER', lastMessageAt: null, firstResponseAt: null },
    { id: 'tkt_opened_in_console', audience: 'END_CUSTOMER', lastMessageAt: null, firstResponseAt: null }
  ];
  const messages: Row[] = [
    { id: 'm1', ticketId: 'tkt_customer', isInternal: false, fromSA: false, authorType: 'TENANT_USER', visibility: 'PUBLIC', createdAt: at(0) },
    { id: 'm2', ticketId: 'tkt_customer', isInternal: true, fromSA: false, authorType: 'TENANT_USER', visibility: 'PUBLIC', createdAt: at(5) },
    { id: 'm3', ticketId: 'tkt_answered_by_fauward', isInternal: false, fromSA: false, authorType: 'TENANT_USER', visibility: 'PUBLIC', createdAt: at(1) },
    { id: 'm4', ticketId: 'tkt_answered_by_fauward', isInternal: false, fromSA: true, authorType: 'TENANT_USER', visibility: 'PUBLIC', createdAt: at(30) },
    { id: 'm5', ticketId: 'tkt_answered_by_fauward', isInternal: true, fromSA: true, authorType: 'TENANT_USER', visibility: 'PUBLIC', createdAt: at(31) },
    { id: 'm6', ticketId: 'tkt_opened_in_console', isInternal: false, fromSA: false, authorType: 'TENANT_USER', visibility: 'PUBLIC', createdAt: at(2) }
  ];
  const prisma = {
    ticketMessage: {
      findMany: vi.fn(async ({ where, distinct }: { where: Record<string, unknown>; distinct?: string[] }) => {
        const rows = messages.filter((row) => matches(row, where));
        if (distinct) return [...new Map(rows.map((row) => [row.ticketId, row])).values()];
        return rows;
      }),
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => messages.filter((row) => matches(row, where)).length),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const hits = messages.filter((row) => matches(row, where));
        for (const row of hits) Object.assign(row, data);
        return { count: hits.length };
      }),
      groupBy: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const groups = new Map<string, Date>();
        for (const row of messages.filter((item) => matches(item, where))) {
          const current = groups.get(String(row.ticketId));
          if (!current || (row.createdAt as Date) < current) groups.set(String(row.ticketId), row.createdAt as Date);
        }
        return [...groups.entries()].map(([ticketId, createdAt]) => ({ ticketId, _min: { createdAt } }));
      })
    },
    // The legacy flags are read with SQL (columns dropped from the Prisma schema in 0079): rows with either flag set.
    $queryRaw: vi.fn(async () => messages.filter((row) => row.isInternal === true || row.fromSA === true).map((row) => ({ ...row }))),
    platformAuditLog: { findMany: vi.fn(async () => [{ targetId: 'tkt_opened_in_console' }]) },
    supportTicket: {
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) => tickets.filter((row) => matches(row, where)).length),
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        tickets
          .filter((row) => matches(row, where))
          .map((ticket) => ({ id: ticket.id, messages: messages.filter((m) => m.ticketId === ticket.id).sort((a, b) => (b.createdAt as Date).getTime() - (a.createdAt as Date).getTime()).slice(0, 1) }))
      ),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const hits = tickets.filter((row) => matches(row, where));
        for (const row of hits) Object.assign(row, data);
        return { count: hits.length };
      })
    },
    $transaction: vi.fn(async (ops: Array<Promise<unknown>>) => Promise.all(ops))
  };
  return { prisma, tickets, messages, at };
}

describe('backfill 0047 ticket messages (D5)', () => {
  it('dry run counts and changes nothing', async () => {
    const { prisma, messages, tickets } = fixture();
    const result = await backfillTicketMessages(prisma as never, { dryRun: true });
    expect(result).toEqual({ dryRun: true, messages: { tenantInternal: 1, staff: 2 }, tickets: { platform: 2, lastMessageAtSet: 3, firstResponseAtSet: 1 } });
    expect(messages.every((row) => row.visibility === 'PUBLIC' && row.authorType === 'TENANT_USER')).toBe(true);
    expect(tickets.every((row) => row.audience === 'END_CUSTOMER')).toBe(true);
  });

  it('maps visibility, author types, audiences and timestamps, and is idempotent', async () => {
    const { prisma, messages, tickets, at } = fixture();
    await backfillTicketMessages(prisma as never, { dryRun: false });
    const byId = (id: string) => messages.find((row) => row.id === id)!;
    expect(byId('m2')).toMatchObject({ visibility: 'TENANT_INTERNAL', authorType: 'TENANT_USER' });
    expect(byId('m4')).toMatchObject({ visibility: 'PUBLIC', authorType: 'STAFF' });
    expect(byId('m5')).toMatchObject({ visibility: 'STAFF_INTERNAL', authorType: 'STAFF' });
    expect(tickets.map((row) => [row.id, row.audience])).toEqual([
      ['tkt_customer', 'END_CUSTOMER'],
      ['tkt_answered_by_fauward', 'PLATFORM'],
      ['tkt_opened_in_console', 'PLATFORM']
    ]);
    expect(tickets[1]).toMatchObject({ lastMessageAt: at(31), lastMessageAuthorType: 'STAFF', firstResponseAt: at(30) });
    expect(tickets[0]).toMatchObject({ lastMessageAt: at(5), lastMessageAuthorType: 'TENANT_USER' });

    const again = await backfillTicketMessages(prisma as never, { dryRun: false });
    expect(again).toEqual({ dryRun: false, messages: { tenantInternal: 0, staff: 0 }, tickets: { platform: 0, lastMessageAtSet: 0, firstResponseAtSet: 0 } });
  });
});
