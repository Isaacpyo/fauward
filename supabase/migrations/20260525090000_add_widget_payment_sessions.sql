-- Durable payment-session store for widget gateway redirects and webhooks.
-- References are provider-generated (Paystack reference, Stripe intent id when needed).

create table if not exists public.widget_payment_sessions (
  reference         text primary key,
  provider          text not null,
  tenant_slug       text not null,
  amount_minor      bigint not null,
  currency          text not null,
  payloads          jsonb not null,
  created_shipments jsonb,
  status            text not null default 'PENDING'
    check (status in ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  error             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists widget_payment_sessions_tenant_idx
  on public.widget_payment_sessions (tenant_slug);

create index if not exists widget_payment_sessions_status_idx
  on public.widget_payment_sessions (status);

alter table public.widget_payment_sessions enable row level security;
