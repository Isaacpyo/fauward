import { describe, expect, it, vi } from 'vitest';

import { runAgent } from './agent.service.js';
import { LLMGatewayService } from '../../shared/services/llm-gateway.service.js';

vi.mock('../../shared/services/llm-gateway.service.js', () => ({
  LLMGatewayService: vi.fn()
}));

describe('runAgent', () => {
  function buildPrisma(overrides: Record<string, unknown> = {}) {
    return {
      aiAgentRun: { create: vi.fn().mockResolvedValue({ id: 'run-1' }), update: vi.fn() },
      tenantAiLimit: { findUnique: vi.fn().mockResolvedValue(null) },
      tenantAiUsage: { findMany: vi.fn().mockResolvedValue([]) },
      agentAction: { create: vi.fn().mockResolvedValue({ id: 'action-1' }) },
      shipment: { findFirst: vi.fn().mockResolvedValue(null) },
      ...overrides
    } as any;
  }

  function mockGatewayResponse(toolCalls: Array<{ name: string; arguments: string }>) {
    return {
      result: {
        content: null,
        tool_calls: toolCalls.map((tc, i) => ({
          id: `call_${i}`,
          type: 'function',
          function: { name: tc.name, arguments: tc.arguments }
        }))
      },
      confidence: 0.9,
      model: 'deepseek-v4-pro',
      tokensUsed: 42,
      latencyMs: 500,
      degraded: false,
      runId: 'run-1'
    };
  }

  it('Stage C: returns structured tool proposals and includes tenant id in system prompt', async () => {
    const runMock = vi.fn().mockResolvedValue(
      mockGatewayResponse([{ name: 'get_shipment_details', arguments: JSON.stringify({ shipmentId: 'ship-1' }) }])
    );
    (LLMGatewayService as any).mockImplementation(() => ({ run: runMock }));

    const prisma = buildPrisma();
    const result = await runAgent(
      { eventId: 'evt-c-1', type: 'shipment_created', tenantId: 'tenant-abc', shipmentId: 'ship-1' },
      {} as any,
      prisma
    );

    expect(result.status).toBe('completed');
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].tool).toBe('get_shipment_details');

    const callArgs = runMock.mock.calls[0][0];
    expect(callArgs.systemPrompt).toContain('tenant-abc');
    expect(callArgs.tools).toBeDefined();
    expect(callArgs.tools.length).toBeGreaterThan(0);
  });

  it('Stage D.1: safe action runs and writes AUTO_APPLIED', async () => {
    const handler = vi.fn().mockResolvedValue({ shipmentId: 'ship-1', status: 'IN_TRANSIT' });
    const runMock = vi.fn().mockResolvedValue(
      mockGatewayResponse([{ name: 'get_shipment_details', arguments: JSON.stringify({ shipmentId: 'ship-1' }) }])
    );
    (LLMGatewayService as any).mockImplementation(() => ({ run: runMock }));

    const prisma = buildPrisma();
    const result = await runAgent(
      { eventId: 'evt-d-1', type: 'status_changed', tenantId: 'tenant-safe', shipmentId: 'ship-1' },
      { get_shipment_details: handler } as any,
      prisma
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(prisma.agentAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'AUTO_APPLIED', type: 'get_shipment_details' })
      })
    );
    expect(result.actions[0].executed).toBe(true);
    expect(result.actions[0].decision).toBe('auto_approved');
  });

  it('Stage D.2: risky action does NOT run and writes PENDING_APPROVAL', async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true });
    const runMock = vi.fn().mockResolvedValue(
      mockGatewayResponse([{ name: 'reroute_shipment', arguments: JSON.stringify({ shipmentId: 'ship-2', newDriverId: 'drv-2', reason: 'delay' }) }])
    );
    (LLMGatewayService as any).mockImplementation(() => ({ run: runMock }));

    const prisma = buildPrisma();
    const result = await runAgent(
      { eventId: 'evt-d-2', type: 'failed_delivery', tenantId: 'tenant-risk', shipmentId: 'ship-2' },
      { reroute_shipment: handler } as any,
      prisma
    );

    expect(handler).not.toHaveBeenCalled();
    expect(prisma.agentAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING_APPROVAL', type: 'reroute_shipment' })
      })
    );
    expect(result.actions[0].executed).toBe(false);
    expect(result.actions[0].decision).toBe('requires_approval');
  });

  it('Stage D.3: unclassified tool defaults to blocked/REJECTED', async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true });
    const runMock = vi.fn().mockResolvedValue(
      mockGatewayResponse([{ name: 'delete_everything', arguments: JSON.stringify({}) }])
    );
    (LLMGatewayService as any).mockImplementation(() => ({ run: runMock }));

    const prisma = buildPrisma();
    const result = await runAgent(
      { eventId: 'evt-d-3', type: 'nl_query', tenantId: 'tenant-unknown' },
      {} as any,
      prisma
    );

    expect(handler).not.toHaveBeenCalled();
    expect(prisma.agentAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'REJECTED', type: 'delete_everything' })
      })
    );
    expect(result.actions[0].executed).toBe(false);
    expect(result.actions[0].decision).toBe('blocked');
  });

  it('Stage D.4: tenant isolation — handler receives auth tenantId, not LLM payload tenantId', async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true });
    const runMock = vi.fn().mockResolvedValue(
      mockGatewayResponse([
        {
          name: 'get_available_drivers',
          arguments: JSON.stringify({ tenantId: 'evil-tenant', originPostcode: 'SW1A' })
        }
      ])
    );
    (LLMGatewayService as any).mockImplementation(() => ({ run: runMock }));

    const prisma = buildPrisma();
    await runAgent(
      { eventId: 'evt-d-4', type: 'shipment_created', tenantId: 'tenant-good' },
      { get_available_drivers: handler } as any,
      prisma
    );

    expect(handler).toHaveBeenCalledTimes(1);
    const receivedPayload = handler.mock.calls[0][0] as Record<string, unknown>;
    expect(receivedPayload.tenantId).toBe('tenant-good');
  });

  it('Stage F: end-to-end safe applied + risky pending + idempotent + tenant isolated', async () => {
    const safeHandler = vi.fn().mockResolvedValue({ shipmentId: 'ship-e2e', status: 'IN_TRANSIT' });
    const riskyHandler = vi.fn().mockResolvedValue({ ok: true });
    const runMock = vi.fn().mockResolvedValue(
      mockGatewayResponse([
        { name: 'get_shipment_details', arguments: JSON.stringify({ shipmentId: 'ship-e2e' }) },
        { name: 'reroute_shipment', arguments: JSON.stringify({ shipmentId: 'ship-e2e', newDriverId: 'drv-e2e', reason: 'delay' }) }
      ])
    );
    (LLMGatewayService as any).mockImplementation(() => ({ run: runMock }));

    const redis = { set: vi.fn().mockResolvedValue('OK') };
    const prisma = buildPrisma();

    const event = { eventId: 'evt-e2e', type: 'failed_delivery', tenantId: 'tenant-e2e', shipmentId: 'ship-e2e' };
    const result = await runAgent(
      event,
      { get_shipment_details: safeHandler, reroute_shipment: riskyHandler } as any,
      prisma,
      redis
    );

    expect(result.status).toBe('completed');
    expect(result.actions).toHaveLength(2);

    const safeAction = result.actions.find((a) => a.tool === 'get_shipment_details');
    const riskyAction = result.actions.find((a) => a.tool === 'reroute_shipment');

    expect(safeAction?.executed).toBe(true);
    expect(safeAction?.decision).toBe('auto_approved');
    expect(riskyAction?.executed).toBe(false);
    expect(riskyAction?.decision).toBe('requires_approval');

    expect(safeHandler).toHaveBeenCalledTimes(1);
    expect(riskyHandler).not.toHaveBeenCalled();

    // Tenant isolation: both actions use the event tenantId
    const createdActions = prisma.agentAction.create.mock.calls;
    expect(createdActions.length).toBe(2);
    expect(createdActions[0][0].data.tenantId).toBe('tenant-e2e');
    expect(createdActions[1][0].data.tenantId).toBe('tenant-e2e');

    // Idempotency: replay with same event returns already_processed
    redis.set.mockResolvedValueOnce(null);
    const replay = await runAgent(event, {} as any, prisma, redis);
    expect(replay.status).toBe('already_processed');
  });

  it('Stage E: duplicate event with Redis is idempotent', async () => {
    const handler = vi.fn().mockResolvedValue({ ok: true });
    const runMock = vi.fn().mockResolvedValue(
      mockGatewayResponse([{ name: 'get_available_drivers', arguments: JSON.stringify({ tenantId: 'tenant-idem', originPostcode: 'SW1A' }) }])
    );
    (LLMGatewayService as any).mockImplementation(() => ({ run: runMock }));

    const redis = {
      set: vi.fn()
        .mockResolvedValueOnce('OK')
        .mockResolvedValueOnce(null)
    };

    const prisma = buildPrisma();

    const event = { eventId: 'evt-idem-1', type: 'shipment_created', tenantId: 'tenant-idem' };

    const result1 = await runAgent(event, { get_available_drivers: handler } as any, prisma, redis);
    const result2 = await runAgent(event, { get_available_drivers: handler } as any, prisma, redis);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledTimes(2);
    expect(result1.status).toBe('completed');
    expect(result2.status).toBe('already_processed');
  });

  it('handles handler failure and writes FAILED action record', async () => {
    const handler = vi.fn().mockRejectedValue(new Error('DB timeout'));
    const runMock = vi.fn().mockResolvedValue(
      mockGatewayResponse([{ name: 'flag_sla_risk', arguments: JSON.stringify({ shipmentId: 'ship-5', riskLevel: 'HIGH', reason: 'delay' }) }])
    );
    (LLMGatewayService as any).mockImplementation(() => ({ run: runMock }));

    const prisma = buildPrisma();
    const result = await runAgent(
      { eventId: 'evt-d-5', type: 'sla_check', tenantId: 'tenant-fail', shipmentId: 'ship-5' },
      { flag_sla_risk: handler } as any,
      prisma
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(prisma.agentAction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'FAILED', type: 'flag_sla_risk', error: 'DB timeout' })
      })
    );
    expect(result.actions[0].executed).toBe(false);
    expect(result.actions[0].error).toBe('DB timeout');
  });
});
