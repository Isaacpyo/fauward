-- ─────────────────────────────────────────────────────────────────────────────
-- 20260502200000_relay_kb_optimise.sql
-- 1. Replace relay_search_knowledge_base with a version that requires a minimum
--    relevance score — stops unrelated entries leaking into the AI prompt.
-- 2. Seed general-purpose KB entries so the AI handles non-tracking conversations.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.relay_search_knowledge_base(
  p_query    text,
  p_tenant_id text,
  p_limit    int default 3
)
returns table(
  id         uuid,
  category   text,
  problem    text,
  resolution text,
  escalate   boolean
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_tsquery tsquery;
  v_min_rank float4 := 0.03;   -- minimum relevance score; below this = not related
begin
  -- Guard: empty query → return nothing (AI will reason freely)
  if coalesce(trim(p_query), '') = '' then
    return;
  end if;

  begin
    v_tsquery := plainto_tsquery('english', p_query);
  exception when others then
    return;
  end;

  -- Primary: tenant-scoped + global entries, scored by relevance
  return query
  select
    kb.id, kb.category, kb.problem, kb.resolution, kb.escalate
  from public.relay_knowledge_base kb
  where
    (kb.tenant_id is null or (p_tenant_id is not null and kb.tenant_id = p_tenant_id))
    and kb.search_vector @@ v_tsquery
    and ts_rank(kb.search_vector, v_tsquery) >= v_min_rank
  order by
    case when p_tenant_id is not null and kb.tenant_id = p_tenant_id then 0 else 1 end,
    ts_rank(kb.search_vector, v_tsquery) desc
  limit p_limit;

  -- No fallback to unrelated entries — if nothing scored above threshold the AI
  -- will respond naturally without KB noise.
end;
$$;

-- ─── General-purpose KB entries ──────────────────────────────────────────────
-- These only fire when the customer's message genuinely matches them.

insert into public.relay_knowledge_base (tenant_id, category, problem, resolution, escalate)
values
  (null, 'general', 'hello',
   'Greet the customer warmly and ask how you can help them today. Do not ask for a tracking number unless they mention a parcel or shipment.',
   false),

  (null, 'general', 'hi there',
   'Greet the customer warmly and ask how you can help them today. Do not ask for a tracking number unless they mention a parcel or shipment.',
   false),

  (null, 'general', 'good morning good afternoon good evening',
   'Return the greeting warmly and ask what you can help with.',
   false),

  (null, 'general', 'I need help',
   'Ask the customer what they need help with so you can assist or direct them correctly.',
   false),

  (null, 'general', 'I have a question',
   'Ask the customer to go ahead and share their question.',
   false),

  (null, 'general', 'What services do you offer?',
   'Explain that Fauward is a multi-tenant logistics platform offering shipment management, branded tracking, invoicing, and driver operations. For account-specific or pricing questions, call request_human_handoff.',
   false),

  (null, 'general', 'How does Fauward work?',
   'Explain that Fauward helps logistics businesses manage shipments, track deliveries, invoice customers, and give their customers a branded tracking experience. For specific plan or onboarding questions, call request_human_handoff.',
   false),

  (null, 'general', 'I want to sign up',
   'Let the customer know they can start a free trial at fauward.com. If they need guided onboarding or have enterprise requirements, call request_human_handoff.',
   false),

  (null, 'general', 'How much does it cost?',
   'Explain that Fauward offers Starter, Pro, and Enterprise plans. Pricing is available at fauward.com. For a custom quote call request_human_handoff.',
   false),

  (null, 'general', 'I am having trouble with the platform',
   'Ask the customer to describe the issue they are experiencing so you can help or escalate to the right team.',
   false),

  (null, 'general', 'Can I speak to someone?',
   'The customer wants to talk to a human. Call request_human_handoff with reason: customer requested human support.',
   false),

  (null, 'general', 'I want to cancel my account',
   'Account cancellations must be handled by the Fauward team. Call request_human_handoff immediately.',
   true),

  (null, 'general', 'I want to upgrade my plan',
   'Let the customer know that plan upgrades can be done in the tenant portal under Settings → Billing. If they need help, call request_human_handoff.',
   false),

  (null, 'general', 'thank you thanks',
   'Acknowledge the thanks warmly and let the customer know you are here if they need anything else. Then call send_reply to close the exchange.',
   false),

  (null, 'general', 'goodbye bye',
   'Say a warm goodbye and let them know support is always available.',
   false)

on conflict do nothing;
