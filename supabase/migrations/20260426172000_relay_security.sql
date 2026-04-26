alter table public.relay_conversations
  add column if not exists access_token_hash text unique;

create index if not exists relay_conversations_access_token_hash_idx
  on public.relay_conversations(access_token_hash)
  where access_token_hash is not null;

create or replace function public.relay_create_conversation(
  p_source_app public.relay_source,
  p_tenant_id text,
  p_customer_name text,
  p_customer_email text,
  p_subject text,
  p_first_message text,
  p_sender_id text default null,
  p_access_token_hash text default null
)
returns table(conversation_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversation_id uuid;
begin
  if p_first_message is null or length(trim(p_first_message)) = 0 then
    raise exception 'first_message is required';
  end if;

  insert into public.relay_conversations (
    tenant_id,
    source_app,
    customer_name,
    customer_email,
    subject,
    access_token_hash,
    last_message_at
  )
  values (
    p_tenant_id,
    p_source_app,
    nullif(trim(coalesce(p_customer_name, '')), ''),
    nullif(trim(coalesce(p_customer_email, '')), ''),
    nullif(trim(coalesce(p_subject, '')), ''),
    nullif(trim(coalesce(p_access_token_hash, '')), ''),
    now()
  )
  returning id into v_conversation_id;

  insert into public.relay_messages (
    conversation_id,
    sender_type,
    sender_id,
    body
  )
  values (
    v_conversation_id,
    'customer',
    nullif(trim(coalesce(p_sender_id, '')), ''),
    trim(p_first_message)
  );

  return query select v_conversation_id;
end;
$$;

drop policy if exists "anon can read marketing relay messages for realtime"
  on public.relay_messages;
