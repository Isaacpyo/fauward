create table public.relay_feedback (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null unique references public.relay_conversations(id) on delete cascade,
  tenant_id text,
  source_app public.relay_source not null,
  customer_name text,
  customer_email text,
  rating integer not null check (rating between 1 and 5),
  comment text,
  submitted_by text,
  created_at timestamptz not null default now()
);

create index relay_feedback_created_idx
  on public.relay_feedback(created_at desc);

create index relay_feedback_tenant_source_idx
  on public.relay_feedback(tenant_id, source_app);

alter table public.relay_feedback enable row level security;

create policy "tenant users can create own relay feedback"
  on public.relay_feedback for insert
  to authenticated
  with check (tenant_id = public.relay_jwt_tenant_id());

create policy "tenant users can read own relay feedback"
  on public.relay_feedback for select
  to authenticated
  using (tenant_id = public.relay_jwt_tenant_id());

create policy "anon can create marketing relay feedback"
  on public.relay_feedback for insert
  to anon
  with check (source_app = 'marketing');
