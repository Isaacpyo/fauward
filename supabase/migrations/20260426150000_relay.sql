create type public.relay_source as enum ('marketing', 'tenant_portal');
create type public.relay_sender as enum ('customer', 'admin', 'system');
create type public.relay_status as enum ('open', 'assigned', 'closed');

create table public.relay_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id text references public.tenants(id) on delete cascade,
  source_app public.relay_source not null,
  customer_name text,
  customer_email text,
  subject text,
  status public.relay_status not null default 'open',
  assigned_admin_id text,
  last_message_at timestamptz default now(),
  created_at timestamptz default now()
);

create table public.relay_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references public.relay_conversations(id) on delete cascade not null,
  sender_type public.relay_sender not null,
  sender_id text,
  body text not null,
  read_at timestamptz,
  created_at timestamptz default now()
);

create index relay_messages_conversation_created_idx
  on public.relay_messages(conversation_id, created_at);

create index relay_conversations_tenant_status_idx
  on public.relay_conversations(tenant_id, status);

create index relay_conversations_last_message_idx
  on public.relay_conversations(last_message_at desc);

alter table public.relay_conversations enable row level security;
alter table public.relay_messages enable row level security;

create or replace function public.relay_jwt_tenant_id()
returns text
language sql
stable
as $$
  select nullif(coalesce(
    auth.jwt() ->> 'tenant_id',
    auth.jwt() ->> 'tenantId'
  ), '')
$$;

create or replace function public.relay_create_conversation(
  p_source_app public.relay_source,
  p_tenant_id text,
  p_customer_name text,
  p_customer_email text,
  p_subject text,
  p_first_message text,
  p_sender_id text default null
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
    last_message_at
  )
  values (
    p_tenant_id,
    p_source_app,
    nullif(trim(coalesce(p_customer_name, '')), ''),
    nullif(trim(coalesce(p_customer_email, '')), ''),
    nullif(trim(coalesce(p_subject, '')), ''),
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

create or replace function public.relay_touch_conversation()
returns trigger
language plpgsql
as $$
begin
  update public.relay_conversations
  set last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger relay_messages_touch_conversation
after insert on public.relay_messages
for each row
execute function public.relay_touch_conversation();

alter publication supabase_realtime add table public.relay_conversations;
alter publication supabase_realtime add table public.relay_messages;

create policy "tenant users can read own relay conversations"
  on public.relay_conversations for select
  to authenticated
  using (tenant_id = public.relay_jwt_tenant_id());

create policy "tenant users can create own relay conversations"
  on public.relay_conversations for insert
  to authenticated
  with check (tenant_id = public.relay_jwt_tenant_id());

create policy "tenant users can read own relay messages"
  on public.relay_messages for select
  to authenticated
  using (
    exists (
      select 1
      from public.relay_conversations c
      where c.id = relay_messages.conversation_id
        and c.tenant_id = public.relay_jwt_tenant_id()
    )
  );

create policy "tenant users can create own relay messages"
  on public.relay_messages for insert
  to authenticated
  with check (
    sender_type = 'customer'
    and exists (
      select 1
      from public.relay_conversations c
      where c.id = conversation_id
        and c.tenant_id = public.relay_jwt_tenant_id()
    )
  );

create policy "anon can create marketing relay conversations"
  on public.relay_conversations for insert
  to anon
  with check (source_app = 'marketing');

create policy "anon can create marketing relay messages"
  on public.relay_messages for insert
  to anon
  with check (
    sender_type = 'customer'
    and exists (
      select 1
      from public.relay_conversations c
      where c.id = conversation_id
        and c.source_app = 'marketing'
    )
  );

create policy "anon can read marketing relay messages for realtime"
  on public.relay_messages for select
  to anon
  using (
    exists (
      select 1
      from public.relay_conversations c
      where c.id = relay_messages.conversation_id
        and c.source_app = 'marketing'
    )
  );
