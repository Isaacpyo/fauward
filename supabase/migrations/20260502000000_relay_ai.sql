alter table public.relay_conversations
  add column if not exists ai_status text
    check (ai_status in ('pending', 'ai_handling', 'ai_resolved', 'human_needed')),
  add column if not exists ai_turn_count int not null default 0;

create table if not exists public.relay_knowledge_base (
  id uuid primary key default gen_random_uuid(),
  tenant_id text references public.tenants(id) on delete cascade,
  category text not null check (category in ('tracking', 'delivery', 'billing', 'account', 'general')),
  problem text not null,
  resolution text not null,
  escalate boolean not null default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  search_vector tsvector generated always as (
    to_tsvector('english', problem || ' ' || coalesce(resolution, ''))
  ) stored
);

create index if not exists relay_knowledge_base_search_idx
  on public.relay_knowledge_base using gin(search_vector);

create index if not exists relay_knowledge_base_tenant_idx
  on public.relay_knowledge_base(tenant_id);

create or replace function public.relay_search_knowledge_base(
  p_query text,
  p_tenant_id text,
  p_limit int default 3
)
returns table(
  id uuid,
  category text,
  problem text,
  resolution text,
  escalate boolean
)
language plpgsql
stable
set search_path = public
as $$
begin
  return query
  select
    kb.id,
    kb.category,
    kb.problem,
    kb.resolution,
    kb.escalate
  from public.relay_knowledge_base kb
  where
    (kb.tenant_id is null or (p_tenant_id is not null and kb.tenant_id = p_tenant_id))
    and kb.search_vector @@ plainto_tsquery('english', coalesce(p_query, ''))
  order by
    case when p_tenant_id is not null and kb.tenant_id = p_tenant_id then 0 else 1 end,
    ts_rank(kb.search_vector, plainto_tsquery('english', coalesce(p_query, ''))) desc,
    kb.created_at desc
  limit p_limit;

  if found then
    return;
  end if;

  return query
  select
    kb.id,
    kb.category,
    kb.problem,
    kb.resolution,
    kb.escalate
  from public.relay_knowledge_base kb
  where kb.tenant_id is null or (p_tenant_id is not null and kb.tenant_id = p_tenant_id)
  order by
    case when p_tenant_id is not null and kb.tenant_id = p_tenant_id then 0 else 1 end,
    kb.created_at desc
  limit p_limit;
end;
$$;

alter table public.relay_knowledge_base enable row level security;

create policy "service role can manage relay knowledge base"
  on public.relay_knowledge_base for all
  to service_role
  using (true)
  with check (true);

create policy "tenant users can read relay knowledge base"
  on public.relay_knowledge_base for select
  to authenticated
  using (tenant_id = public.relay_jwt_tenant_id() or tenant_id is null);

-- Seed knowledge base with global entries
INSERT INTO public.relay_knowledge_base
  (tenant_id, category, problem, resolution, escalate)
VALUES
  (NULL, 'tracking', 'Where is my shipment?',
   'If the customer has not provided a tracking number, call request_tracking_number with a short friendly message asking them to enter it. Once they provide a tracking number, call lookup_shipment and summarise the current status, last known location, and estimated delivery. If no shipment is found, call request_human_handoff.',
   false),
  (NULL, 'tracking', 'Can you track my order?',
   'If no tracking number or shipment ID is present in the conversation, call request_tracking_number to ask the customer to enter it. Once provided, call lookup_shipment and summarise the current status and estimated delivery.',
   false),
  (NULL, 'tracking', 'My tracking number is not working.',
   'Ask the customer to confirm their tracking number using request_tracking_number if they have not already provided one. Then call lookup_shipment. If no shipment is found, tell the customer and call request_human_handoff.',
   false),
  (NULL, 'tracking', 'What does my shipment status mean?',
   'If no tracking number is provided, call request_tracking_number first. Once provided, call lookup_shipment and explain the status in plain English. Do not promise delivery times beyond what the tool returns.',
   false),
  (NULL, 'tracking', 'Has my shipment been delivered?',
   'If no tracking number is provided, call request_tracking_number first. Once provided, call lookup_shipment and confirm whether the status is delivered, including the delivery timestamp if available. If the customer disputes delivery, call request_human_handoff.',
   false),
  (NULL, 'tracking', 'Why has my tracking not updated?',
   'Explain that tracking can pause between scan events or while a shipment is in transit. Use lookup_shipment if an identifier is provided. If the status appears stale or uncertain, call request_human_handoff.',
   false),
  (NULL, 'delivery', 'I missed my delivery.',
   'Inform the customer that missed deliveries require review of the shipment record and carrier options. Use lookup_shipment if they provide a tracking number, then call request_human_handoff for rescheduling help.',
   false),
  (NULL, 'delivery', 'Can I reschedule my delivery?',
   'Use lookup_shipment if they provide a tracking number. Explain that rescheduling depends on shipment status and carrier availability, then call request_human_handoff so a support agent can confirm options.',
   false),
  (NULL, 'delivery', 'I need to change the delivery address.',
   'Inform the customer that address changes after booking or pickup require human review for security and operational reasons. Call request_human_handoff.',
   false),
  (NULL, 'delivery', 'My delivery failed.',
   'Use lookup_shipment with the identifier the customer provides. Summarise the current status and any available delivery information, then call request_human_handoff for next steps.',
   false),
  (NULL, 'delivery', 'My parcel arrived damaged.',
   'Damage claims must be handled by a human support agent. Acknowledge the issue briefly and call request_human_handoff.',
   true),
  (NULL, 'delivery', 'I want compensation for a late delivery.',
   'Compensation requests must be reviewed by a human support agent. Do not promise compensation or eligibility. Call request_human_handoff.',
   true),
  (NULL, 'billing', 'How much will shipping cost?',
   'Explain that pricing depends on route, service tier, package details, and tenant configuration. If the customer needs a quote or billing decision, call request_human_handoff.',
   false),
  (NULL, 'billing', 'I was charged the wrong amount.',
   'Incorrect charge disputes require human billing review. Do not confirm fault or promise a refund. Call request_human_handoff.',
   true),
  (NULL, 'billing', 'Can I get a copy of my invoice?',
   'Tell the customer that invoice access depends on their tenant portal permissions. For account-specific invoice retrieval, call request_human_handoff.',
   false),
  (NULL, 'billing', 'I want a refund.',
   'Refund requests must be handled by a human support agent. Do not promise a refund or eligibility. Call request_human_handoff.',
   true),
  (NULL, 'billing', 'Why is there an extra fee on my shipment?',
   'Explain that fees can depend on service tier, weight, surcharges, address changes, or carrier adjustments. Because this is account-specific billing, call request_human_handoff.',
   false),
  (NULL, 'account', 'How do I sign up for Fauward?',
   'Explain that Fauward is a B2B logistics platform for businesses and that account setup is handled by the Fauward team or tenant administrators. Call request_human_handoff for signup assistance.',
   false),
  (NULL, 'account', 'I cannot log in to the tenant portal.',
   'Advise the customer to check that they are using the correct email and reset their password if available. For continued login or access issues, call request_human_handoff.',
   false),
  (NULL, 'account', 'How do I add a driver?',
   'Explain that tenant admins can manage drivers in the portal if their role has permission. If they need access enabled or are unsure of permissions, call request_human_handoff.',
   false),
  (NULL, 'account', 'Can you give someone access to our account?',
   'Account access changes require verification by a human support agent or tenant administrator. Do not make access promises. Call request_human_handoff.',
   false),
  (NULL, 'account', 'I need to reset my password.',
   'Tell the customer to use the password reset flow from the login page if available. If the reset email does not arrive or they cannot access the account, call request_human_handoff.',
   false),
  (NULL, 'general', 'What are your support hours?',
   'Explain that support availability can vary by tenant plan and region. If the customer needs urgent help or a plan-specific answer, call request_human_handoff.',
   false),
  (NULL, 'general', 'Which carriers do you use?',
   'Explain that Fauward supports carrier and delivery workflows configured per tenant, and available carriers may vary by route, service tier, and tenant setup. Call request_human_handoff for account-specific carrier details.',
   false),
  (NULL, 'general', 'What is your SLA policy?',
   'Explain that SLA rules depend on the tenant configuration, service tier, and shipment terms. Do not promise delivery timelines or compensation. Call request_human_handoff for policy-specific questions.',
   false);
