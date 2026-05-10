import type { FastifyInstance } from 'fastify';
import pino from 'pino';
import { z } from 'zod';
import { getRelayAdminClient, type RelayConversation } from '@fauward/relay-api';

import { LLMGatewayService } from '../../shared/services/llm-gateway.service.js';

const logger = pino({ name: 'fauward-relay-ai' });

const RelayClassificationSchema = z.object({
  category: z.string(),
  urgency: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  customerSentiment: z.string(),
  recommendedAction: z.enum(['AUTO_REPLY', 'QUEUE_FOR_AGENT', 'ESCALATE_TO_SUPPORT']),
  confidence: z.number(),
  draftReply: z.string().optional()
});

const RelayEscalationSchema = z.object({
  likelyCause: z.string(),
  suggestedResolution: z.string(),
  escalationPriority: z.string(),
  affectedShipments: z.array(z.string()).default([]),
  compensationRecommended: z.boolean().default(false),
  confidence: z.number()
});

export async function runRelayAi(
  conversationId: string,
  customerMessage: string,
  conversation: RelayConversation,
  app: FastifyInstance
): Promise<void> {
  const supabase = getRelayAdminClient();
  const tenantId = conversation.tenant_id ?? 'relay-system';
  const gateway = new LLMGatewayService(app.prisma);

  try {
    await supabase.from('relay_conversations').update({ ai_status: 'ai_handling' }).eq('id', conversationId);

    const classification = await gateway.run({
      task: 'relay_classify',
      tenantId,
      input: {
        conversationId,
        message: customerMessage,
        conversation
      },
      outputSchema: RelayClassificationSchema,
      allowAutoAction: false
    });

    if (classification.confidence < 0.6) {
      await supabase.from('relay_conversations').update({ ai_status: 'human_needed' }).eq('id', conversationId);
      return;
    }

    if (
      classification.result.recommendedAction === 'ESCALATE_TO_SUPPORT' ||
      classification.result.urgency === 'HIGH' ||
      classification.result.urgency === 'CRITICAL'
    ) {
      const escalation = await gateway.run({
        task: 'relay_escalation_analysis',
        tenantId,
        input: {
          conversationId,
          message: customerMessage,
          classification: classification.result
        },
        outputSchema: RelayEscalationSchema,
        allowAutoAction: false
      });
      await insertRelayDraft(supabase, conversationId, JSON.stringify({
        type: 'escalation_analysis',
        classification: classification.result,
        escalation: escalation.result
      }));
      await supabase.from('relay_conversations').update({ ai_status: 'human_needed' }).eq('id', conversationId);
      return;
    }

    if (classification.confidence >= 0.85 && classification.result.recommendedAction === 'AUTO_REPLY' && classification.result.draftReply) {
      await insertRelayDraft(supabase, conversationId, classification.result.draftReply);
      await supabase.from('relay_conversations').update({ ai_status: 'draft_ready' }).eq('id', conversationId);
      return;
    }

    await insertRelayDraft(supabase, conversationId, classification.result.draftReply ?? 'A support agent should review this message.');
    await supabase.from('relay_conversations').update({ ai_status: 'human_needed' }).eq('id', conversationId);
  } catch (err) {
    logger.error({ err, conversationId }, 'relay ai run failed');
    await supabase.from('relay_conversations').update({ ai_status: 'human_needed' }).eq('id', conversationId);
  }
}

async function insertRelayDraft(supabase: ReturnType<typeof getRelayAdminClient>, conversationId: string, body: string) {
  const { error } = await supabase.from('relay_messages').insert({
    conversation_id: conversationId,
    sender_type: 'system',
    sender_id: 'ai-agent',
    body,
    is_draft: true,
    draft_mode: true
  });
  if (error) throw error;
}
