-- ─────────────────────────────────────────────────────────────────────────────
-- 0002_tenant_schema_template.sql
-- Per-tenant schema DDL.
-- This is a TEMPLATE — do NOT run directly.
-- packages/tenant-db/src/schema.ts executes this via createTenantSchema(slug)
-- replacing the literal string "TENANT_SLUG" with the real slug.
-- ─────────────────────────────────────────────────────────────────────────────

-- Create isolated schema for this tenant
create schema if not exists "tenant_TENANT_SLUG";

-- ─── Users ───────────────────────────────────────────────────────────────────

create table if not exists "tenant_TENANT_SLUG".users (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique,                   -- references auth.users(id)
  email         text unique not null,
  full_name     text,
  role          text not null default 'member',  -- owner | admin | member
  status        text not null default 'active',
  invited_by    uuid references "tenant_TENANT_SLUG".users(id),
  created_at    timestamptz not null default now()
);

-- ─── Shipments ───────────────────────────────────────────────────────────────

create table if not exists "tenant_TENANT_SLUG".shipments (
  id                uuid primary key default gen_random_uuid(),
  tracking_ref      text unique not null,       -- TC-YYYYMMDD-xxxxx
  source            text not null default 'dashboard',  -- dashboard | widget | api | csv
  status            text not null default 'PENDING',
  direction         text not null,              -- SHIP_TO_AFRICA | SHIP_TO_UK

  route             text not null,

  -- Sender
  sender_name       text not null,
  sender_email      text,
  sender_phone      text not null,
  sender_address    jsonb not null,             -- { address1, city, postcode, country }

  -- Recipient
  recipient_name    text not null,
  recipient_email   text,
  recipient_phone   text not null,
  recipient_address jsonb not null,

  -- Goods
  category          text not null,
  declared_value    numeric not null,
  insurance         text not null default 'NONE',  -- NONE | BASIC | STANDARD | PREMIUM
  notes             text,

  -- Package dimensions
  length_cm         numeric,
  width_cm          numeric,
  height_cm         numeric,
  weight_kg         numeric not null,
  chargeable_weight numeric,

  -- Pricing
  price_estimate    numeric,
  currency          text not null default 'GBP',

  -- Metadata
  created_by_user_id  uuid references "tenant_TENANT_SLUG".users(id),
  widget_session_id   text,                    -- set when source = 'widget'
  phone_verified      boolean not null default false,
  assigned_agent      text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ─── Shipment events (status timeline) ───────────────────────────────────────

create table if not exists "tenant_TENANT_SLUG".shipment_events (
  id            uuid primary key default gen_random_uuid(),
  shipment_id   uuid not null references "tenant_TENANT_SLUG".shipments(id) on delete cascade,
  status        text not null,
  note          text,
  actor_id      uuid references "tenant_TENANT_SLUG".users(id),
  created_at    timestamptz not null default now()
);

-- ─── Team invites ─────────────────────────────────────────────────────────────

create table if not exists "tenant_TENANT_SLUG".team_invites (
  id            uuid primary key default gen_random_uuid(),
  email         text not null,
  role          text not null default 'member',
  token_hash    text unique not null,
  expires_at    timestamptz not null,
  accepted      boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

create index if not exists shipments_status_idx
  on "tenant_TENANT_SLUG".shipments (status);

create index if not exists shipments_created_at_idx
  on "tenant_TENANT_SLUG".shipments (created_at desc);

create index if not exists shipments_source_idx
  on "tenant_TENANT_SLUG".shipments (source);

create index if not exists shipment_events_shipment_idx
  on "tenant_TENANT_SLUG".shipment_events (shipment_id);

-- ─── updated_at trigger ───────────────────────────────────────────────────────

create or replace function "tenant_TENANT_SLUG".set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger shipments_updated_at
  before update on "tenant_TENANT_SLUG".shipments
  for each row execute function "tenant_TENANT_SLUG".set_updated_at();
