import { Prisma, PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

// Usage: npx tsx src/scripts/backfills/0079-drop-dead-models-precheck.ts
// Pre-check for migration 0079_drop_dead_models (D10, WP-4.0c; the spec's "0062"): prints the row count of every table
// the migration drops and the non-null/true counts of the dropped columns. Read-only. Attach the output to the PR; the
// production run needs owner approval, and backfills 0047 (ticket messages) and 0055 (payment gateways) must have run
// first — `legacyNotBackfilled` must be 0 for both.
dotenv.config();

export const DROPPED_TABLES = [
  'support_vendor_tickets',
  'secret_access_logs',
  'tax_returns',
  'qbr_templates',
  'pricing_experiments',
  'partner_deal_registrations',
  'partner_applications',
  'commission_disputes',
  'commission_payouts',
  'commission_ledger',
  'partners'
] as const;

type CountRow = { count: bigint };

export async function precheckDropDeadModels(prisma: Pick<PrismaClient, '$queryRaw'>) {
  const tables: Record<string, number | 'missing'> = {};
  for (const table of DROPPED_TABLES) {
    const exists = await prisma.$queryRaw<Array<{ exists: boolean }>>`SELECT to_regclass(${`public.${table}`}) IS NOT NULL AS "exists"`;
    if (!exists[0]?.exists) {
      tables[table] = 'missing';
      continue;
    }
    // Table names come from the constant list above, never from input.
    const [row] = await prisma.$queryRaw<CountRow[]>`SELECT COUNT(*)::bigint AS "count" FROM ${Prisma.raw(`"${table}"`)}`;
    tables[table] = Number(row?.count ?? 0);
  }
  const [messages] = await prisma.$queryRaw<Array<{ internal: bigint; fromSA: bigint; legacyNotBackfilled: bigint }>>`
    SELECT COUNT(*) FILTER (WHERE "isInternal")::bigint AS "internal",
           COUNT(*) FILTER (WHERE "fromSA")::bigint AS "fromSA",
           COUNT(*) FILTER (WHERE ("fromSA" AND "authorType" <> 'STAFF') OR ("isInternal" AND NOT "fromSA" AND "visibility" = 'PUBLIC'))::bigint AS "legacyNotBackfilled"
    FROM "ticket_messages"`;
  const [settings] = await prisma.$queryRaw<Array<{ withKey: bigint; legacyNotBackfilled: bigint }>>`
    SELECT COUNT(*) FILTER (WHERE s."paymentGatewayKey" IS NOT NULL)::bigint AS "withKey",
           COUNT(*) FILTER (WHERE s."paymentGatewayKey" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "tenant_payment_gateways" g WHERE g."tenantId" = s."tenantId"))::bigint AS "legacyNotBackfilled"
    FROM "tenant_settings" s`;
  return {
    tables,
    columns: {
      'ticket_messages.isInternal (true)': Number(messages?.internal ?? 0),
      'ticket_messages.fromSA (true)': Number(messages?.fromSA ?? 0),
      'tenant_settings.paymentGatewayKey (not null)': Number(settings?.withKey ?? 0)
    },
    legacyNotBackfilled: { ticketMessages: Number(messages?.legacyNotBackfilled ?? 0), paymentGatewayKeys: Number(settings?.legacyNotBackfilled ?? 0) }
  };
}

if (process.argv[1]?.endsWith('0079-drop-dead-models-precheck.ts')) {
  const prisma = new PrismaClient();
  try {
    process.stdout.write(`${JSON.stringify(await precheckDropDeadModels(prisma), null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}
