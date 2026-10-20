import { describe, expect, it, vi } from 'vitest';
import { tenantStorage } from '../context/tenant.context.js';

vi.mock('../modules/tracking/tracking.websocket.js', () => ({ emitTrackingRealtimeUpdate: vi.fn() }));

// WP-2.11: the old cross-tenant `escalations:all` WebSocket room is replaced by PlatformActivity on the console stream.
describe('ws-publisher escalation flags', () => {
  it('ACC-L15-1 a flagged shipment becomes one platform.incidents activity (system context, deduped per flag)', async () => {
    const contexts: unknown[] = [];
    const rows = new Map<string, Record<string, unknown>>();
    const prisma = {
      platformActivity: {
        upsert: vi.fn(async ({ where, create }: { where: { dedupeKey: string }; create: Record<string, unknown> }) => {
          contexts.push(tenantStorage.getStore());
          if (!rows.has(where.dedupeKey)) rows.set(where.dedupeKey, { id: `act_${rows.size + 1}`, ...create });
          return rows.get(where.dedupeKey)!;
        })
      }
    };
    const redis = { publish: vi.fn(async () => 1) };
    const { recordEscalationFlag } = await import('./ws-publisher.worker.js');
    const fields = { tenantId: 'tenant_a', shipmentId: 'sh_1', trackingNumber: 'NWD-1001', reason: 'NO_SCAN_48H', flaggedAt: '2026-10-19T09:00:00.000Z' };
    const app = { prisma, redis, log: { error: vi.fn() } };
    await recordEscalationFlag(app as never, fields);
    await recordEscalationFlag(app as never, fields);
    expect([...rows.values()]).toEqual([expect.objectContaining({ service: 'platform.incidents', type: 'shipment.escalation_flagged', tenantId: 'tenant_a', severity: 'ATTENTION', actorType: 'SYSTEM', subjectId: 'sh_1' })]);
    expect(contexts.every((ctx) => (ctx as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin === true)).toBe(true);
    expect(redis.publish).toHaveBeenCalledWith('console:activity', 'act_1');
  });
});
