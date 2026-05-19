"""invoicing phase 1 domain core

Revision ID: 0002_invoicing_phase1
Revises:
Create Date: 2026-05-18
"""

from __future__ import annotations

from alembic import op

revision = "0002_invoicing_phase1"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'InvoiceStatus') THEN
            CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'SENT', 'PAID', 'OVERDUE', 'PARTIALLY_PAID', 'VOID');
          END IF;
        END $$;
        """
    )
    op.execute("""ALTER TYPE "InvoiceStatus" ADD VALUE IF NOT EXISTS 'ISSUED' AFTER 'DRAFT'""")
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS invoices (
          id text primary key,
          "tenantId" text not null,
          "invoiceNumber" text,
          "customerId" text,
          "organisationId" text,
          "shipmentId" text,
          "lineItems" jsonb not null default '[]'::jsonb,
          subtotal numeric(12,2) not null default 0,
          "taxRate" numeric(5,2) not null default 0,
          "taxAmount" numeric(12,2) not null default 0,
          "discountAmount" numeric(12,2) not null default 0,
          total numeric(12,2) not null default 0,
          currency text not null default 'GBP',
          status "InvoiceStatus" not null default 'DRAFT',
          "dueDate" timestamptz,
          "paymentTerms" integer not null default 0,
          notes text,
          "eInvoiceRef" text,
          "eInvoiceStatus" text,
          "sentAt" timestamptz,
          "paidAt" timestamptz,
          "voidedAt" timestamptz,
          "createdBy" text,
          "createdAt" timestamptz not null default now(),
          "updatedAt" timestamptz not null default now(),
          "fiscalYear" integer,
          "sequenceNumber" bigint,
          "subtotalMinor" bigint not null default 0,
          "discountMinor" bigint not null default 0,
          "taxTotalMinor" bigint not null default 0,
          "totalMinor" bigint not null default 0,
          "amountPaidMinor" bigint not null default 0,
          "amountDueMinor" bigint not null default 0,
          "issueDate" date,
          "issuedAt" timestamptz,
          "issuedBy" text,
          "updatedBy" text,
          "payerName" text,
          "payerAddress" jsonb,
          "payerVatId" text,
          "payeeName" text,
          "payeeAddress" jsonb,
          "payeeVatId" text,
          "reverseCharge" boolean not null default false,
          "contentHashSha256" text
        )
        """
    )
    for statement in [
        'ALTER TABLE invoices ALTER COLUMN "invoiceNumber" DROP NOT NULL',
        """ALTER TABLE invoices ALTER COLUMN "lineItems" SET DEFAULT '[]'::jsonb""",
        "ALTER TABLE invoices ALTER COLUMN subtotal SET DEFAULT 0",
        "ALTER TABLE invoices ALTER COLUMN total SET DEFAULT 0",
        'ALTER TABLE invoices ALTER COLUMN "updatedAt" SET DEFAULT now()',
        'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "fiscalYear" integer',
        'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "sequenceNumber" bigint',
        'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "subtotalMinor" bigint not null default 0',
        'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "discountMinor" bigint not null default 0',
        'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "taxTotalMinor" bigint not null default 0',
        'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "totalMinor" bigint not null default 0',
        'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "amountPaidMinor" bigint not null default 0',
        'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "amountDueMinor" bigint not null default 0',
        'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "issueDate" date',
        'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "issuedAt" timestamptz',
        'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "issuedBy" text',
        'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "updatedBy" text',
        'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "payerName" text',
        'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "payerAddress" jsonb',
        'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "payerVatId" text',
        'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "payeeName" text',
        'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "payeeAddress" jsonb',
        'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "payeeVatId" text',
        'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "reverseCharge" boolean not null default false',
        'ALTER TABLE invoices ADD COLUMN IF NOT EXISTS "contentHashSha256" text',
    ]:
        op.execute(statement)
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_currency_iso_chk') THEN
            ALTER TABLE invoices ADD CONSTRAINT invoices_currency_iso_chk CHECK (currency ~ '^[A-Z]{3}$') NOT VALID;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_content_hash_sha256_chk') THEN
            ALTER TABLE invoices ADD CONSTRAINT invoices_content_hash_sha256_chk CHECK ("contentHashSha256" is null or "contentHashSha256" ~ '^[a-f0-9]{64}$') NOT VALID;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_money_nonnegative_chk') THEN
            ALTER TABLE invoices ADD CONSTRAINT invoices_money_nonnegative_chk CHECK (
              "subtotalMinor" >= 0 and "discountMinor" >= 0 and "taxTotalMinor" >= 0 and
              "totalMinor" >= 0 and "amountPaidMinor" >= 0 and "amountDueMinor" >= 0
            ) NOT VALID;
          END IF;
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_issued_number_required_chk') THEN
            ALTER TABLE invoices ADD CONSTRAINT invoices_issued_number_required_chk CHECK (
              status::text = 'DRAFT' or (
                "invoiceNumber" is not null and "fiscalYear" is not null and
                "sequenceNumber" is not null and "issuedAt" is not null and
                "contentHashSha256" is not null
              )
            ) NOT VALID;
          END IF;
        END $$;
        """
    )
    op.execute("""DROP INDEX IF EXISTS "invoices_invoiceNumber_key" """)
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS invoices_tenant_invoice_number_uidx
          ON invoices ("tenantId", "invoiceNumber")
          WHERE "invoiceNumber" IS NOT NULL
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS invoices_tenant_fiscal_sequence_uidx
          ON invoices ("tenantId", "fiscalYear", "sequenceNumber")
          WHERE "fiscalYear" IS NOT NULL AND "sequenceNumber" IS NOT NULL
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS invoices_tenant_status_created_idx
          ON invoices ("tenantId", status, "createdAt" desc)
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS invoice_sequences (
          tenant_id text not null,
          fiscal_year integer not null,
          next_number bigint not null default 1,
          prefix text not null default 'INV',
          padding integer not null default 6,
          last_allocated_invoice_id text,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          primary key (tenant_id, fiscal_year),
          constraint invoice_sequences_next_number_positive_chk check (next_number > 0),
          constraint invoice_sequences_padding_range_chk check (padding between 1 and 12)
        )
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS invoice_line_items (
          id text primary key,
          invoice_id text not null references invoices(id) on delete cascade,
          tenant_id text not null,
          line_number integer not null,
          description text not null,
          quantity_micros bigint not null default 1000000,
          unit_amount_minor bigint not null,
          discount_amount_minor bigint not null default 0,
          net_amount_minor bigint not null,
          tax_amount_minor bigint not null default 0,
          gross_amount_minor bigint not null,
          currency text not null,
          tax_code text not null,
          tax_rate_bps integer not null default 0,
          tax_country_code text,
          reverse_charge boolean not null default false,
          metadata jsonb not null default '{}'::jsonb,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          constraint invoice_line_items_invoice_line_number_key unique (invoice_id, line_number),
          constraint invoice_line_items_currency_iso_chk check (currency ~ '^[A-Z]{3}$'),
          constraint invoice_line_items_tax_country_iso_chk check (tax_country_code is null or tax_country_code ~ '^[A-Z]{2}$'),
          constraint invoice_line_items_quantity_positive_chk check (quantity_micros > 0),
          constraint invoice_line_items_money_nonnegative_chk check (
            unit_amount_minor >= 0 and discount_amount_minor >= 0 and net_amount_minor >= 0 and
            tax_amount_minor >= 0 and gross_amount_minor >= 0
          ),
          constraint invoice_line_items_tax_rate_range_chk check (tax_rate_bps between 0 and 10000)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS invoice_line_items_tenant_invoice_idx
          ON invoice_line_items (tenant_id, invoice_id)
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS invoice_events (
          id text primary key,
          tenant_id text not null,
          invoice_id text not null references invoices(id) on delete cascade,
          event_type text not null,
          from_status text,
          to_status text,
          actor_id text,
          actor_type text not null default 'API',
          correlation_id text,
          before_snapshot jsonb,
          after_snapshot jsonb,
          metadata jsonb not null default '{}'::jsonb,
          created_at timestamptz not null default now()
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS invoice_events_tenant_invoice_created_idx
          ON invoice_events (tenant_id, invoice_id, created_at)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS invoice_events_tenant_created_idx
          ON invoice_events (tenant_id, created_at desc)
        """
    )
    op.execute(
        """
        CREATE OR REPLACE FUNCTION prevent_invoice_events_mutation()
        RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'invoice_events is append-only';
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute("DROP TRIGGER IF EXISTS invoice_events_no_update ON invoice_events")
    op.execute("DROP TRIGGER IF EXISTS invoice_events_no_delete ON invoice_events")
    op.execute(
        """
        CREATE TRIGGER invoice_events_no_update
          BEFORE UPDATE ON invoice_events
          FOR EACH ROW EXECUTE FUNCTION prevent_invoice_events_mutation()
        """
    )
    op.execute(
        """
        CREATE TRIGGER invoice_events_no_delete
          BEFORE DELETE ON invoice_events
          FOR EACH ROW EXECUTE FUNCTION prevent_invoice_events_mutation()
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS outbox (
          id text primary key,
          tenant_id text not null,
          aggregate_type text not null,
          aggregate_id text not null,
          event_type text not null,
          payload jsonb not null,
          status text not null default 'pending',
          available_at timestamptz not null default now(),
          attempts integer not null default 0,
          max_attempts integer not null default 10,
          locked_at timestamptz,
          locked_by text,
          processed_at timestamptz,
          last_error text,
          correlation_id text,
          traceparent text,
          created_at timestamptz not null default now(),
          updated_at timestamptz not null default now(),
          constraint outbox_status_chk check (status in ('pending', 'processing', 'processed', 'failed')),
          constraint outbox_attempts_chk check (attempts >= 0 and max_attempts > 0)
        )
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS outbox_pending_drain_idx
          ON outbox (status, available_at, created_at)
          WHERE status = 'pending'
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS outbox_tenant_aggregate_created_idx
          ON outbox (tenant_id, aggregate_id, created_at)
        """
    )
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS idempotency_keys (
          id text primary key,
          "tenantId" text not null,
          key text not null,
          "requestHash" text,
          response jsonb,
          "statusCode" integer,
          "responseHeaders" jsonb not null default '{}'::jsonb,
          state text not null default 'processing',
          "createdAt" timestamptz not null default now(),
          "updatedAt" timestamptz not null default now(),
          "expiresAt" timestamptz not null default now() + interval '24 hours'
        )
        """
    )
    op.execute("""ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS "responseHeaders" jsonb not null default '{}'::jsonb""")
    op.execute("""ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS state text not null default 'processing'""")
    op.execute("""ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz not null default now()""")
    op.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS "idempotency_keys_tenantId_key_key"
          ON idempotency_keys ("tenantId", key)
        """
    )
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idempotency_keys_expiresAt_idx
          ON idempotency_keys ("expiresAt")
        """
    )
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'idempotency_keys_state_chk') THEN
            ALTER TABLE idempotency_keys ADD CONSTRAINT idempotency_keys_state_chk
              CHECK (state in ('processing', 'completed', 'failed')) NOT VALID;
          END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS outbox")
    op.execute("DROP TRIGGER IF EXISTS invoice_events_no_update ON invoice_events")
    op.execute("DROP TRIGGER IF EXISTS invoice_events_no_delete ON invoice_events")
    op.execute("DROP FUNCTION IF EXISTS prevent_invoice_events_mutation()")
    op.execute("DROP TABLE IF EXISTS invoice_events")
    op.execute("DROP TABLE IF EXISTS invoice_line_items")
    op.execute("DROP TABLE IF EXISTS invoice_sequences")
