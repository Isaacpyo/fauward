import { beforeEach, describe, expect, it, vi } from 'vitest';

const runMock = vi.hoisted(() => vi.fn());
const insertMock = vi.hoisted(() => vi.fn(async () => ({ error: null })));
const updateMock = vi.hoisted(() => vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })));
const fromMock = vi.hoisted(() => vi.fn((table: string) => {
  if (table === 'relay_messages') {
    return { insert: insertMock };
  }
  return { update: updateMock };
}));

vi.mock('../../shared/services/llm-gateway.service.js', () => ({
  LLMGatewayService: vi.fn().mockImplementation(() => ({ run: runMock }))
}));

vi.mock('@fauward/relay-api', () => ({
  getRelayAdminClient: vi.fn(() => ({ from: fromMock }))
}));

import { runRelayAi } from './relay.ai.service.js';

const conversation = {
  id: 'conv-1',
  tenant_id: 'tenant-a',
  source_app: 'tenant-portal',
  customer_name: 'Ada',
  customer_email: 'ada@example.com',
  subject: 'Support',
  status: 'open',
  ai_status: 'pending',
  ai_turn_count: 0,
  assigned_admin_id: null,
  last_message_at: new Date().toISOString(),
  created_at: new Date().toISOString()
} as any;

describe('relay AI service', () => {
  beforeEach(() => {
    runMock.mockReset();
    insertMock.mockClear();
    updateMock.mockClear();
    fromMock.mockClear();
  });

  it('ANGRY + FAILED_DELIVERY message triggers escalation path', async () => {
    runMock
      .mockResolvedValueOnce({
        result: {
          category: 'FAILED_DELIVERY',
          urgency: 'HIGH',
          customerSentiment: 'ANGRY',
          recommendedAction: 'ESCALATE_TO_SUPPORT',
          confidence: 0.91
        },
        confidence: 0.91,
        tokensUsed: 10,
        latencyMs: 1,
        degraded: false
      })
      .mockResolvedValueOnce({
        result: {
          likelyCause: 'Delivery attempt failed',
          suggestedResolution: 'Escalate to operations',
          escalationPriority: 'HIGH',
          affectedShipments: ['ship-1'],
          compensationRecommended: false,
          confidence: 0.88
        },
        confidence: 0.88,
        tokensUsed: 20,
        latencyMs: 1,
        degraded: false
      });

    await runRelayAi('conv-1', 'I am angry, delivery failed', conversation, { prisma: {} } as any);

    expect(runMock).toHaveBeenNthCalledWith(1, expect.objectContaining({ task: 'relay_classify' }));
    expect(runMock).toHaveBeenNthCalledWith(2, expect.objectContaining({ task: 'relay_escalation_analysis' }));
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ is_draft: true, draft_mode: true }));
  });

  it('high-confidence general enquiry surfaces a draft for approval', async () => {
    runMock.mockResolvedValueOnce({
      result: {
        category: 'GENERAL_ENQUIRY',
        urgency: 'LOW',
        customerSentiment: 'NEUTRAL',
        recommendedAction: 'AUTO_REPLY',
        confidence: 0.93,
        draftReply: 'Thanks for reaching out.'
      },
      confidence: 0.93,
      tokensUsed: 8,
      latencyMs: 1,
      degraded: false
    });

    await runRelayAi('conv-1', 'hello', conversation, { prisma: {} } as any);

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      body: 'Thanks for reaching out.',
      is_draft: true,
      draft_mode: true
    }));
    expect(updateMock).toHaveBeenCalledWith({ ai_status: 'draft_ready' });
  });

  it('low-confidence message suppresses AI suggestion', async () => {
    runMock.mockResolvedValueOnce({
      result: {
        category: 'UNKNOWN',
        urgency: 'MEDIUM',
        customerSentiment: 'UNCLEAR',
        recommendedAction: 'QUEUE_FOR_AGENT',
        confidence: 0.42
      },
      confidence: 0.42,
      tokensUsed: 4,
      latencyMs: 1,
      degraded: false
    });

    await runRelayAi('conv-1', 'ambiguous', conversation, { prisma: {} } as any);

    expect(insertMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith({ ai_status: 'human_needed' });
  });

  it('never inserts a non-draft outbound AI message', async () => {
    runMock.mockResolvedValueOnce({
      result: {
        category: 'GENERAL_ENQUIRY',
        urgency: 'LOW',
        customerSentiment: 'NEUTRAL',
        recommendedAction: 'AUTO_REPLY',
        confidence: 0.91,
        draftReply: 'Draft only.'
      },
      confidence: 0.91,
      tokensUsed: 8,
      latencyMs: 1,
      degraded: false
    });

    await runRelayAi('conv-1', 'hello', conversation, { prisma: {} } as any);

    for (const call of insertMock.mock.calls as unknown as Array<[Record<string, unknown>]>) {
      expect(call[0]).toEqual(expect.objectContaining({ is_draft: true, draft_mode: true }));
    }
  });
});
