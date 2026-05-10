import { getRelayAdminClient, type RelayConversation } from '@fauward/relay-api';

type KnowledgeBaseEntry = {
  id: string;
  category: 'tracking' | 'delivery' | 'billing' | 'account' | 'general';
  problem: string;
  resolution: string;
  escalate: boolean;
};

export async function buildRelaySystemPrompt(
  conversationId: string,
  customerMessage: string,
  conversation: RelayConversation
): Promise<string> {
  const supabase = getRelayAdminClient();
  const { data, error } = await supabase.rpc('relay_search_knowledge_base', {
    p_query: customerMessage,
    p_tenant_id: conversation.tenant_id,
    p_limit: 3
  });

  if (error) throw error;

  const kbEntries = (data ?? []) as KnowledgeBaseEntry[];

  // Filter out KB entries whose problem has no meaningful word overlap with the
  // customer message — stops fallback entries leaking into unrelated conversations
  const queryWords = new Set(
    customerMessage.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length > 2)
  );
  const relevantEntries = kbEntries.filter((entry) => {
    const entryWords = entry.problem.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
    return entryWords.some((w) => w.length > 2 && queryWords.has(w));
  });

  // Fall back to all returned entries only if relevance filter removes everything
  const filteredEntries = relevantEntries.length > 0 ? relevantEntries : [];

  const kbSection = filteredEntries
    .map((entry) => {
      const base = `[${entry.category}] Problem: ${entry.problem}\nResolution: ${entry.resolution}`;
      return entry.escalate ? `${base}\n⚠️ This topic MUST be escalated to a human immediately.` : base;
    })
    .join('\n\n');

  const contextSection = buildContextSection(conversationId, conversation);

  return `You are Fauward's friendly customer support assistant. You help customers with a wide range of topics — not just shipment tracking.

Your goal: understand what the customer actually needs and respond helpfully. Resolve it in at most 2 short replies. If you cannot resolve it with certainty, call request_human_handoff.

${kbSection.length > 0 ? `Relevant knowledge base guidance (only apply if it matches what the customer is asking about):\n${kbSection}\n` : ''}
Hard rules:
- You MUST always call draft_reply or request_human_handoff — never output bare text.
- Be warm, concise, and professional.
- Do NOT assume the customer is asking about a shipment unless they explicitly mention it (e.g. "parcel", "order", "tracking number", "shipment", "delivery", "package").
- If the customer just says hello, greets you, or asks a general question — draft a natural reply. Do NOT ask for a tracking number.
- Only call request_tracking_number if the customer has explicitly asked about a specific parcel, shipment, or tracking status AND has not yet provided a tracking number.
- Only call lookup_shipment when the customer has already provided a tracking number or shipment ID in this conversation.
- Do NOT make promises about delivery timelines, refunds, compensation, or cancellations.
- If a knowledge base entry has escalate=true, call request_human_handoff immediately.
- If the customer mentions refund, compensation, damage, or legal, call request_human_handoff.
- If lookup_shipment finds no matching shipment, inform the customer and call request_human_handoff.
- Do not ask "is there anything else?" — stop once the issue is resolved.

Conversation context:
${contextSection}`;
}

function buildContextSection(conversationId: string, conversation: RelayConversation): string {
  const entries: Array<[string, unknown]> = [
    ['conversation_id', conversationId],
    ['tenant_id', conversation.tenant_id],
    ['source_app', conversation.source_app],
    ['customer_name', conversation.customer_name],
    ['customer_email', conversation.customer_email],
    ['subject', conversation.subject],
    ['status', conversation.status],
    ['ai_status', conversation.ai_status],
    ['ai_turn_count', conversation.ai_turn_count],
    ['assigned_admin_id', conversation.assigned_admin_id],
    ['last_message_at', conversation.last_message_at],
    ['created_at', conversation.created_at]
  ];

  return entries
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join('\n');
}
