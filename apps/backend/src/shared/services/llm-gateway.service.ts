import OpenAI from 'openai';
import type { ZodSchema } from 'zod';
import { z } from 'zod';

export type LLMModel = 'deepseek-v4-flash' | 'deepseek-v4-pro';

export type LLMTool = {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
};

export const MODEL_ROUTING = {
  relay_classify: 'deepseek-v4-flash',
  relay_reply_draft: 'deepseek-v4-flash',
  relay_escalation_analysis: 'deepseek-v4-pro',
  tracking_customer_summary: 'deepseek-v4-flash',
  tracking_exception_analysis: 'deepseek-v4-pro',
  sla_risk_explanation: 'deepseek-v4-pro',
  driver_assignment: 'deepseek-v4-pro',
  address_cleanup: 'deepseek-v4-flash',
  customs_declaration_draft: 'deepseek-v4-flash',
  customs_risk_review: 'deepseek-v4-pro',
  quote_explanation: 'deepseek-v4-flash',
  pricing_anomaly_detection: 'deepseek-v4-pro',
  document_text_generation: 'deepseek-v4-flash',
  claims_assessment: 'deepseek-v4-pro',
  returns_classification: 'deepseek-v4-flash',
  tenant_health_summary: 'deepseek-v4-pro',
  webhook_error_summary: 'deepseek-v4-flash'
} as const satisfies Record<string, LLMModel>;

type RunInput<T> = {
  task: keyof typeof MODEL_ROUTING | string;
  tenantId: string;
  input: Record<string, unknown>;
  outputSchema: ZodSchema<T>;
  tools?: LLMTool[];
  allowAutoAction?: boolean;
};

type CompletionClient = {
  chat: {
    completions: {
      create: (request: Record<string, unknown>) => Promise<{
        choices: Array<{ message: { content?: string | null } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
      }>;
    };
  };
};

function monthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function isTransientError(error: unknown) {
  const status = typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : undefined;
  const code = typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : '';
  return !status || status >= 500 || code === 'ETIMEDOUT' || code === 'ECONNRESET' || code === 'ABORT_ERR';
}

function httpError(statusCode: number, payload: Record<string, unknown>) {
  return Object.assign(new Error(String(payload.error ?? 'LLM gateway error')), { statusCode, payload });
}

function costFor(model: LLMModel, tokens: number) {
  const per1k = model === 'deepseek-v4-pro' ? 0.004 : 0.0004;
  return Number(((tokens / 1000) * per1k).toFixed(6));
}

export class LLMGatewayService {
  constructor(
    private readonly prisma: any,
    private readonly client: CompletionClient = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY ?? 'missing',
      baseURL: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1',
      timeout: 90_000,
      maxRetries: 0
    }) as unknown as CompletionClient
  ) {}

  modelFor(task: string): LLMModel {
    const model = MODEL_ROUTING[task as keyof typeof MODEL_ROUTING];
    if (!model) throw httpError(400, { error: 'UNKNOWN_AI_TASK', task });
    return model;
  }

  async run<T>(input: RunInput<T>): Promise<{
    result: T;
    confidence: number;
    model: LLMModel;
    tokensUsed: number;
    latencyMs: number;
    degraded: boolean;
  }> {
    const started = Date.now();
    const primaryModel = this.modelFor(String(input.task));
    await this.enforceLimits(input.tenantId, String(input.task), primaryModel);
    let runId: string | null = null;

    try {
      const createdRun = await this.prisma.aiAgentRun?.create?.({
        data: {
          tenantId: input.tenantId,
          agentType: String(input.task),
          input: this.toJson(input.input),
          status: 'RUNNING'
        }
      });
      runId = createdRun?.id ?? null;

      const response = await this.callWithFallback(input, primaryModel);
      const parsed = input.outputSchema.parse(response.result);
      const confidence = z.object({ confidence: z.number() }).passthrough().parse(parsed).confidence;
      const latencyMs = Date.now() - started;

      await this.prisma.aiAgentRun?.update?.({
        where: { id: runId },
        data: { output: this.toJson(parsed), status: 'COMPLETED', durationMs: latencyMs }
      });
      await this.recordUsage(input.tenantId, String(input.task), response.model, response.tokensUsed);

      return {
        result: parsed,
        confidence,
        model: response.model,
        tokensUsed: response.tokensUsed,
        latencyMs,
        degraded: response.degraded
      };
    } catch (error) {
      const latencyMs = Date.now() - started;
      if (runId) {
        await this.prisma.aiAgentRun?.update?.({
          where: { id: runId },
          data: { status: 'FAILED', output: this.toJson({ error: error instanceof Error ? error.message : String(error) }), durationMs: latencyMs }
        });
      } else {
        await this.prisma.aiAgentRun?.create?.({
          data: {
            tenantId: input.tenantId,
            agentType: String(input.task),
            input: this.toJson(input.input),
            output: this.toJson({ error: error instanceof Error ? error.message : String(error) }),
            status: 'FAILED',
            durationMs: latencyMs
          }
        });
      }
      throw error;
    }
  }

  private async callWithFallback<T>(input: RunInput<T>, model: LLMModel) {
    try {
      return await this.callWithRetries(input, model, false);
    } catch (error) {
      if (model === 'deepseek-v4-pro' && isTransientError(error)) {
        return this.callWithRetries(input, 'deepseek-v4-flash', true);
      }
      throw error;
    }
  }

  private async callWithRetries<T>(input: RunInput<T>, model: LLMModel, degraded: boolean) {
    let lastError: unknown;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await this.callModel(input, model, degraded);
      } catch (error) {
        lastError = error;
        if (!isTransientError(error) || attempt === 3) break;
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** (attempt - 1)));
      }
    }
    throw lastError;
  }

  private async callModel<T>(input: RunInput<T>, model: LLMModel, degraded: boolean) {
    const timeoutMs = model === 'deepseek-v4-flash' ? 30_000 : 90_000;
    const response = await this.client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: 'Return only valid JSON matching the requested output schema.' },
        { role: 'user', content: JSON.stringify({ task: input.task, input: input.input, allowAutoAction: input.allowAutoAction ?? false }) }
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
      timeout: timeoutMs
    });
    const content = response.choices[0]?.message.content;
    if (!content) throw new Error('AI response did not include content');
    return {
      result: JSON.parse(content) as T,
      model,
      degraded,
      tokensUsed: response.usage?.total_tokens ?? 0
    };
  }

  private async enforceLimits(tenantId: string, task: string, model: LLMModel) {
    const limit = await this.prisma.tenantAiLimit?.findUnique?.({ where: { tenantId } });
    if (!limit) return;
    if (Array.isArray(limit.featuresEnabled) && limit.featuresEnabled.length > 0 && !limit.featuresEnabled.includes(task)) {
      throw httpError(403, { error: 'AI_FEATURE_DISABLED', feature: task });
    }
    const month = monthKey();
    const usage = await this.prisma.tenantAiUsage?.findMany?.({ where: { tenantId, month } }) ?? [];
    const totalCost = usage.reduce((sum: number, row: { costUsd?: number }) => sum + Number(row.costUsd ?? 0), 0);
    if (limit.monthlyBudgetUsd !== null && limit.monthlyBudgetUsd !== undefined && totalCost >= Number(limit.monthlyBudgetUsd)) {
      throw httpError(402, { error: 'AI_BUDGET_EXCEEDED' });
    }
    const modelRequests = usage.filter((row: { model?: string }) => row.model === model).reduce((sum: number, row: { requestCount?: number }) => sum + Number(row.requestCount ?? 0), 0);
    if (model === 'deepseek-v4-flash' && limit.flashRequestLimit !== null && limit.flashRequestLimit !== undefined && modelRequests >= limit.flashRequestLimit) {
      throw httpError(429, { error: 'AI_LIMIT_EXCEEDED', model, limit: 'flashRequestLimit' });
    }
    if (model === 'deepseek-v4-pro' && limit.proRequestLimit !== null && limit.proRequestLimit !== undefined && modelRequests >= limit.proRequestLimit) {
      throw httpError(429, { error: 'AI_LIMIT_EXCEEDED', model, limit: 'proRequestLimit' });
    }
  }

  private async recordUsage(tenantId: string, feature: string, model: LLMModel, tokensUsed: number) {
    await this.prisma.tenantAiUsage?.upsert?.({
      where: { tenantId_month_model_feature: { tenantId, month: monthKey(), model, feature } },
      create: {
        tenantId,
        month: monthKey(),
        model,
        feature,
        requestCount: 1,
        tokenCount: tokensUsed,
        costUsd: costFor(model, tokensUsed)
      },
      update: {
        requestCount: { increment: 1 },
        tokenCount: { increment: tokensUsed },
        costUsd: { increment: costFor(model, tokensUsed) }
      }
    });
  }

  private toJson(value: unknown) {
    return JSON.parse(JSON.stringify(value ?? null));
  }
}

export function createLlmGateway(prisma: unknown, client?: CompletionClient) {
  return new LLMGatewayService(prisma, client);
}
