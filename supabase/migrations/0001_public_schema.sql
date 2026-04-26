-- ─────────────────────────────────────────────────────────────────────────────
-- 0001_public_schema.sql
-- Platform-level tables shared across all tenants.
-- Run once when the Supabase project is created.
-- ─────────────────────────────────────────────────────────────────────────────

-- Tenant registry
create table if not exists public.tenants (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,          -- "acme" → acme.fauward.com
  name          text not null,
  plan          text not null default 'starter',  -- starter | pro | enterprise
  status        text not null default 'active',   -- active | suspended | cancelled
  created_at    timestamptz not null default now()
);

-- Tenant branding
create table if not exists public.tenant_branding (
  tenant_id     uuid primary key references public.tenants(id) on delete cascade,
  logo_url      text,
  primary_color text not null default '#2563eb',
  accent_color  text not null default '#1e40af',
  font_family   text not null default 'Inter',
  custom_domain text,                          -- e.g. ship.acme.com
  updated_at    timestamptz not null default now()
);

-- Tenant API keys (for widget authentication)
create table if not exists public.tenant_api_keys (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  key_hash      text unique not null,          -- SHA-256 of raw key, never store raw
  label         text,
  scopes        text[] not null default array['widget:write'],
  status        text not null default 'active',  -- active | revoked
  created_at    timestamptz not null default now()
);

-- Widget embed tokens (short-lived, signed JWTs)
create table if not exists public.widget_tokens (
  token_hash    text primary key,              -- SHA-256 of the raw JWT
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  allowed_origin text,                         -- origin that requested the token
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);

-- Tenant owner accounts (Supabase Auth users linked to tenants)
create table if not exists public.tenant_members (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants(id) on delete cascade,
  auth_user_id  uuid not null,                 -- references auth.users(id)
  role          text not null default 'owner', -- owner | admin | member
  created_at    timestamptz not null default now(),
  unique (tenant_id, auth_user_id)
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

create index if not exists tenants_slug_idx on public.tenants (slug);
create index if not exists api_keys_tenant_idx on public.tenant_api_keys (tenant_id);
create index if not exists widget_tokens_tenant_idx on public.widget_tokens (tenant_id);
create index if not exists widget_tokens_expires_idx on public.widget_tokens (expires_at);
create index if not exists tenant_members_auth_idx on public.tenant_members (auth_user_id);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

alter table public.tenants enable row level security;
alter table public.tenant_branding enable row level security;
alter table public.tenant_api_keys enable row level security;
alter table public.widget_tokens enable row level security;
alter table public.tenant_members enable row level security;

-- Service role bypasses RLS; these policies cover anon / authenticated reads
create policy "tenant members can read own tenant"
  on public.tenants for select
  using (
    id in (
      select tenant_id from public.tenant_members
      where auth_user_id = auth.uid()
    )
  );

create policy "tenant members can read own branding"
  on public.tenant_branding for select
  using (
    tenant_id in (
      select tenant_id from public.tenant_members
      where auth_user_id = auth.uid()
    )
  );

create policy "tenant members can read own api keys"
  on public.tenant_api_keys for select
  using (
    tenant_id in (
      select tenant_id from public.tenant_members
      where auth_user_id = auth.uid()
    )
  );
