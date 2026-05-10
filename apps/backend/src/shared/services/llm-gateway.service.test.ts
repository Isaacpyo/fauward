import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { LLMGatewayService, MODEL_ROUTING } from './llm-gateway.service.js';

function buildPrisma(overrides: Partial<any> = {}) {
  const runs: any[] = [];
  const usageUpserts: any[] = [];
  return {
    runs,
    usageUpserts,
    prisma: {
      tenantAiLimit: {
        findUnique: vi.fn(async () => overrides.limit ?? null)
      },
      tenantAiUsage: {
        findMany: vi.fn(async () => overrides.usage ?? []),
        upsert: vi.fn(async (args: any) => {
          usageUpserts.push(args);
          return args.create;
        })
      },
      aiAgentRun: {
        create: vi.fn(async ({ data }: any) => {
          const row = { id: `run-${runs.length + 1}`, ...data };
          runs.push(row);
          return row;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const row = runs.find((item) => item.id === where.id);
          Object.assign(row, data);
          return row;
        })
      }
    }
  };
}

function clientWithResponses(responses: Array<unknown>) {
  const create = vi.fn(async () => {
    const next = responses.shift();
    if (next instanceof Error || (next && typeof next === 'object' && 'throw' in (next as any))) {
      throw (next as any).throw ?? next;
    }
    return next;
  });
  return {
    chat: {
      completions: {
        create
      }
    },
    create
  };
}

function completion(content: unknown, tokens = 12) {
  return {
    choices: [{ message: { content: JSON.stringify(content) } }],
    usage: { total_tokens: tokens }
  };
}

const schema = z.object({ confidence: z.number(), answer: z.string() });

describe('LLMGatewayService', () => {
  it('routes all 17 tasks to the expected model', () => {
    expect(Object.keys(MODEL_ROUTING)).toHaveLength(17);
    expect(MODEL_ROUTING.relay_classify).toBe('deepseek-v4-flash');
    expect(MODEL_ROUTING.relay_escalation_analysis).toBe('deepseek-v4-pro');
    expect(MODEL_ROUTING.tenant_health_summary).toBe('deepseek-v4-pro');
    expect(MODEL_ROUTING.webhook_error_summary).toBe('deepseek-v4-flash');
  });

  it('Zod schema mismatch throws and does not return partial result', async () => {
    const { prisma, runs } = buildPrisma();
    const client = clientWithResponses([completion({ confidence: 0.9, wrong: true })]);
    const gateway = new LLMGatewayService(prisma, client as any);

    await expect(gateway.run({
      task: 'relay_classify',
      tenantId: 'tenant-a',
      input: { message: 'hello' },
      outputSchema: schema
    })).rejects.toThrow();

    expect(runs[0].status).toBe('FAILED');
  });

  it('Pro timeout triggers Flash fallback with degraded=true', async () => {
    const { prisma } = buildPrisma();
    const timeout = { throw: Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }) };
    const client = clientWithResponses([timeout, timeout, timeout, completion({ confidence: 0.8, answer: 'fallback' }, 5)]);
    const gateway = new LLMGatewayService(prisma, client as any);

    const result = await gateway.run({
      task: 'tracking_exception_analysis',
      tenantId: 'tenant-a',
      input: {},
      outputSchema: schema
    });

    expect(result.degraded).toBe(true);
    expect(result.model).toBe('deepseek-v4-flash');
    expect(result.result.answer).toBe('fallback');
  });

  it('increments TenantAiUsage after each successful call', async () => {
    const { prisma, usageUpserts } = buildPrisma();
    const client = clientWithResponses([completion({ confidence: 0.91, answer: 'ok' }, 20)]);
    const gateway = new LLMGatewayService(prisma, client as any);

    await gateway.run({
      task: 'quote_explanation',
      tenantId: 'tenant-a',
      input: { quoteId: 'quote-1' },
      outputSchema: schema
    });

    expect(usageUpserts[0]).toEqual(expect.objectContaining({
      where: {
        tenantId_month_model_feature: expect.objectContaining({
          tenantId: 'tenant-a',
          model: 'deepseek-v4-flash',
          feature: 'quote_explanation'
        })
      },
      create: expect.objectContaining({ requestCount: 1, tokenCount: 20 })
    }));
  });

  it('monthlyBudgetUsd exceeded returns HTTP 402', async () => {
    const { prisma } = buildPrisma({
      limit: { monthlyBudgetUsd: 1, flashRequestLimit: null, proRequestLimit: null, featuresEnabled: [] },
      usage: [{ model: 'deepseek-v4-flash', requestCount: 10, costUsd: 1 }]
    });
    const gateway = new LLMGatewayService(prisma, clientWithResponses([]) as any);

    await expect(gateway.run({
      task: 'relay_classify',
      tenantId: 'tenant-a',
      input: {},
      outputSchema: schema
    })).rejects.toMatchObject({ statusCode: 402 });
  });

  it('proRequestLimit exceeded returns HTTP 429 AI_LIMIT_EXCEEDED for Pro tasks', async () => {
    const { prisma } = buildPrisma({
      limit: { monthlyBudgetUsd: null, flashRequestLimit: null, proRequestLimit: 2, featuresEnabled: [] },
      usage: [{ model: 'deepseek-v4-pro', requestCount: 2, costUsd: 0.01 }]
    });
    const gateway = new LLMGatewayService(prisma, clientWithResponses([]) as any);

    await expect(gateway.run({
      task: 'pricing_anomaly_detection',
      tenantId: 'tenant-a',
      input: { quoteId: 'quote-1' },
      outputSchema: schema
    })).rejects.toMatchObject({
      statusCode: 429,
      payload: { error: 'AI_LIMIT_EXCEEDED', limit: 'proRequestLimit' }
    });
  });

  it('flashRequestLimit exceeded returns HTTP 429 AI_LIMIT_EXCEEDED for quote explanation', async () => {
    const { prisma } = buildPrisma({
      limit: { monthlyBudgetUsd: null, flashRequestLimit: 3, proRequestLimit: null, featuresEnabled: [] },
      usage: [{ model: 'deepseek-v4-flash', requestCount: 3, costUsd: 0.01 }]
    });
    const gateway = new LLMGatewayService(prisma, clientWithResponses([]) as any);

    await expect(gateway.run({
      task: 'quote_explanation',
      tenantId: 'tenant-a',
      input: { quoteId: 'quote-1' },
      outputSchema: schema
    })).rejects.toMatchObject({
      statusCode: 429,
      payload: { error: 'AI_LIMIT_EXCEEDED', limit: 'flashRequestLimit' }
    });
  });

  it('creates AiAgentRun for both success and failure', async () => {
    const { prisma, runs } = buildPrisma();
    const client = clientWithResponses([
      completion({ confidence: 0.9, answer: 'ok' }),
      completion({ confidence: 0.9, nope: 'bad' })
    ]);
    const gateway = new LLMGatewayService(prisma, client as any);

    await gateway.run({ task: 'relay_reply_draft', tenantId: 'tenant-a', input: {}, outputSchema: schema });
    await expect(gateway.run({ task: 'relay_reply_draft', tenantId: 'tenant-a', input: {}, outputSchema: schema })).rejects.toThrow();

    expect(runs.map((run) => run.status)).toEqual(['COMPLETED', 'FAILED']);
  });
});
