"""Add observability tables for incidents, alerts, and audit trail

Revision ID: 0003_observability_tables
Revises: 0002_invoicing_phase1
Create Date: 2026-05-18
"""

from __future__ import annotations

from alembic import op

revision = "0003_observability_tables"
down_revision = "0002_invoicing_phase1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS observability_incidents (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            service_id TEXT NOT NULL,
            service_name TEXT NOT NULL,
            environment TEXT NOT NULL,
            title TEXT NOT NULL,
            severity TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'open',
            message TEXT,
            affected_workflows JSONB DEFAULT '[]',
            acknowledged_by TEXT,
            acknowledged_at TIMESTAMPTZ,
            resolution_notes TEXT,
            started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            resolved_at TIMESTAMPTZ
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_obs_incidents_service_env_status
            ON observability_incidents (service_id, environment, status)
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS observability_alerts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            service_id TEXT NOT NULL,
            environment TEXT NOT NULL,
            severity TEXT NOT NULL,
            channel TEXT NOT NULL DEFAULT 'none',
            status TEXT NOT NULL DEFAULT 'pending',
            message TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            sent_at TIMESTAMPTZ,
            muted_until TIMESTAMPTZ
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_obs_alerts_service_env
            ON observability_alerts (service_id, environment)
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS observability_audit (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            action TEXT NOT NULL,
            service_id TEXT,
            environment TEXT,
            actor_id TEXT DEFAULT 'local-dev-user',
            actor_email TEXT,
            reason TEXT,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_obs_audit_created_at
            ON observability_audit (created_at DESC)
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS observability_audit")
    op.execute("DROP TABLE IF EXISTS observability_alerts")
    op.execute("DROP TABLE IF EXISTS observability_incidents")
