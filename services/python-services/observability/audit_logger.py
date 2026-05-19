from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

import db
from observability.schemas import AuditEvent

DEV_ACTOR_ID = "local-dev-user"


def _row_to_audit(row: dict) -> AuditEvent:
    return AuditEvent(
        id=str(row["id"]),
        action=row["action"],
        service_id=row.get("service_id"),
        environment=row.get("environment"),
        actor_id=row.get("actor_id") or DEV_ACTOR_ID,
        actor_email=row.get("actor_email"),
        reason=row.get("reason"),
        metadata=row.get("metadata") or {},
        timestamp=row["created_at"],
    )


async def record_audit_event(
    action: str,
    service_id: str | None = None,
    environment: str | None = None,
    actor_id: str = DEV_ACTOR_ID,
    actor_email: str | None = None,
    reason: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> AuditEvent:
    row = await db.fetchrow(
        """
        INSERT INTO observability_audit
          (id, action, service_id, environment, actor_id, actor_email, reason, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
        """,
        str(uuid.uuid4()),
        action,
        service_id,
        environment,
        actor_id,
        actor_email,
        reason,
        metadata or {},
    )
    return _row_to_audit(dict(row))


async def get_audit_events(limit: int = 100) -> list[AuditEvent]:
    rows = await db.fetch(
        "SELECT * FROM observability_audit ORDER BY created_at DESC LIMIT $1",
        limit,
    )
    return [_row_to_audit(dict(r)) for r in rows]


# ── Convenience wrappers ───────────────────────────────────────────────────────

async def audit_incident_acknowledge(
    incident_id: str,
    by: str,
    note: str | None,
    env: str | None = None,
) -> AuditEvent:
    return await record_audit_event(
        action="incident_acknowledged",
        service_id=incident_id,
        environment=env,
        actor_id=by,
        reason=note,
        metadata={"incident_id": incident_id},
    )


async def audit_incident_resolve(
    incident_id: str,
    by: str,
    notes: str | None,
    env: str | None = None,
) -> AuditEvent:
    return await record_audit_event(
        action="incident_resolved",
        service_id=incident_id,
        environment=env,
        actor_id=by,
        reason=notes,
        metadata={"incident_id": incident_id},
    )


async def audit_manual_refresh(
    service_id: str,
    env: str,
    actor: str = DEV_ACTOR_ID,
) -> AuditEvent:
    return await record_audit_event(
        action="manual_refresh",
        service_id=service_id,
        environment=env,
        actor_id=actor,
    )


async def audit_restart_request(
    service_id: str,
    env: str,
    actor: str = DEV_ACTOR_ID,
    reason: str | None = None,
) -> AuditEvent:
    return await record_audit_event(
        action="restart_requested",
        service_id=service_id,
        environment=env,
        actor_id=actor,
        reason=reason,
    )


async def audit_logs_opened(service_id: str, env: str, actor: str = DEV_ACTOR_ID) -> AuditEvent:
    return await record_audit_event(action="logs_opened", service_id=service_id, environment=env, actor_id=actor)


async def audit_runbook_opened(service_id: str, env: str, actor: str = DEV_ACTOR_ID) -> AuditEvent:
    return await record_audit_event(action="runbook_opened", service_id=service_id, environment=env, actor_id=actor)
