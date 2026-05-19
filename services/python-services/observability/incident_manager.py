from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

import db
from observability.schemas import (
    AcknowledgeRequest,
    IncidentAuditEntry,
    IncidentRecord,
    IncidentSeverity,
    IncidentStatus,
    ResolveRequest,
)

# Maps service_id → list of affected workflow names
WORKFLOW_MAP: dict[str, list[str]] = {
    "redis": [
        "shipment-assignment",
        "queue-processing",
        "notifications",
        "ocr-jobs",
        "pricing-jobs",
        "sla-monitoring",
    ],
    "postgres": [
        "shipment-creation",
        "tracking",
        "billing",
        "auth",
        "tenant-portal",
    ],
    "main-api": [
        "shipment-creation",
        "tracking",
        "billing",
        "auth",
        "notifications",
    ],
    "python-api": [
        "ocr-document-processing",
        "pricing-calculation",
        "route-optimization",
        "pdf-generation",
    ],
    "frontend": [
        "signup",
        "marketing",
        "onboarding",
    ],
    "tenant-portal": [
        "tenant-portal-access",
        "shipment-management",
        "customer-tracking",
    ],
    "super-admin": [
        "super-admin-billing",
        "platform-management",
    ],
    "fauward-go": [
        "fauward-go-field-updates",
        "agent-dispatch",
    ],
    "stripe": [
        "payment-collection",
        "billing",
    ],
    "sendgrid": [
        "email-notifications",
        "onboarding-emails",
    ],
}


def map_affected_workflows(service_id: str) -> list[str]:
    return WORKFLOW_MAP.get(service_id, [])


def _row_to_incident(row: dict[str, Any]) -> IncidentRecord:
    started_at = row["started_at"]
    resolved_at = row.get("resolved_at")
    duration = None
    if resolved_at:
        duration = int((resolved_at - started_at).total_seconds())
    elif started_at:
        duration = int((datetime.now(UTC) - started_at.replace(tzinfo=UTC)).total_seconds())

    return IncidentRecord(
        id=str(row["id"]),
        service_id=row["service_id"],
        service_name=row["service_name"],
        environment=row["environment"],
        title=row["title"],
        severity=IncidentSeverity(row["severity"]),
        status=IncidentStatus(row["status"]),
        message=row.get("message"),
        affected_workflows=row.get("affected_workflows") or [],
        acknowledged_by=row.get("acknowledged_by"),
        acknowledged_at=row.get("acknowledged_at"),
        resolution_notes=row.get("resolution_notes"),
        started_at=started_at,
        resolved_at=resolved_at,
        duration_seconds=duration,
    )


async def create_incident_if_needed(
    service_id: str,
    service_name: str,
    env: str,
    severity: str,
    message: str,
    affected_workflows: list[str] | None = None,
) -> IncidentRecord | None:
    """Create an incident only if no open incident exists for this service+env."""
    existing = await db.fetchrow(
        """
        SELECT id FROM observability_incidents
        WHERE service_id = $1 AND environment = $2 AND status != 'resolved'
        LIMIT 1
        """,
        service_id,
        env,
    )
    if existing:
        return None

    workflows = affected_workflows or map_affected_workflows(service_id)
    title = f"{service_name} is DOWN ({env})" if severity in ("critical", "high") else f"{service_name} is DEGRADED ({env})"

    row = await db.fetchrow(
        """
        INSERT INTO observability_incidents
          (id, service_id, service_name, environment, title, severity, status, message, affected_workflows)
        VALUES
          ($1, $2, $3, $4, $5, $6, 'open', $7, $8)
        RETURNING *
        """,
        str(uuid.uuid4()),
        service_id,
        service_name,
        env,
        title,
        severity,
        message,
        workflows,
    )
    return _row_to_incident(dict(row))


async def get_active_incidents() -> list[IncidentRecord]:
    rows = await db.fetch(
        """
        SELECT * FROM observability_incidents
        WHERE status != 'resolved'
        ORDER BY started_at DESC
        LIMIT 50
        """
    )
    return [_row_to_incident(dict(r)) for r in rows]


async def get_all_incidents(limit: int = 100) -> list[IncidentRecord]:
    rows = await db.fetch(
        "SELECT * FROM observability_incidents ORDER BY started_at DESC LIMIT $1",
        limit,
    )
    return [_row_to_incident(dict(r)) for r in rows]


async def get_incident_by_id(incident_id: str) -> IncidentRecord | None:
    row = await db.fetchrow(
        "SELECT * FROM observability_incidents WHERE id = $1",
        incident_id,
    )
    return _row_to_incident(dict(row)) if row else None


async def acknowledge_incident(incident_id: str, req: AcknowledgeRequest) -> bool:
    result = await db.execute(
        """
        UPDATE observability_incidents
        SET status = 'acknowledged', acknowledged_by = $1, acknowledged_at = now()
        WHERE id = $2 AND status = 'open'
        """,
        req.acknowledged_by,
        incident_id,
    )
    return result == "UPDATE 1"


async def resolve_incident(incident_id: str, req: ResolveRequest) -> bool:
    result = await db.execute(
        """
        UPDATE observability_incidents
        SET status = 'resolved', resolved_at = now(), resolution_notes = $1
        WHERE id = $2 AND status != 'resolved'
        """,
        req.notes,
        incident_id,
    )
    return result == "UPDATE 1"


async def auto_resolve_incident(service_id: str, env: str) -> None:
    """Called when a service recovers — resolve any open incident automatically."""
    await db.execute(
        """
        UPDATE observability_incidents
        SET status = 'resolved', resolved_at = now(), resolution_notes = 'Service recovered automatically'
        WHERE service_id = $1 AND environment = $2 AND status != 'resolved'
        """,
        service_id,
        env,
    )
