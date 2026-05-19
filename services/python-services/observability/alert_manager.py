from __future__ import annotations

import uuid
from datetime import UTC, datetime

import db
from observability.schemas import AlertChannel, AlertEvent, AlertStatus, IncidentSeverity


def _row_to_alert(row: dict) -> AlertEvent:
    return AlertEvent(
        id=str(row["id"]),
        service_id=row["service_id"],
        environment=row["environment"],
        severity=IncidentSeverity(row["severity"]),
        channel=AlertChannel(row.get("channel", "none")),
        status=AlertStatus(row.get("status", "pending")),
        message=row["message"],
        created_at=row["created_at"],
        sent_at=row.get("sent_at"),
    )


async def create_alert_event(
    service_id: str,
    env: str,
    severity: str,
    message: str,
    channel: str = "none",
) -> AlertEvent:
    row = await db.fetchrow(
        """
        INSERT INTO observability_alerts
          (id, service_id, environment, severity, channel, status, message)
        VALUES ($1, $2, $3, $4, $5, 'pending', $6)
        RETURNING *
        """,
        str(uuid.uuid4()),
        service_id,
        env,
        severity,
        channel,
        message,
    )
    return _row_to_alert(dict(row))


async def get_alert_events(limit: int = 50) -> list[AlertEvent]:
    rows = await db.fetch(
        "SELECT * FROM observability_alerts ORDER BY created_at DESC LIMIT $1",
        limit,
    )
    return [_row_to_alert(dict(r)) for r in rows]


async def mute_alert(alert_id: str, until: datetime) -> bool:
    result = await db.execute(
        "UPDATE observability_alerts SET status = 'muted', muted_until = $1 WHERE id = $2",
        until,
        alert_id,
    )
    return result == "UPDATE 1"


async def snooze_alert(alert_id: str, until: datetime) -> bool:
    result = await db.execute(
        "UPDATE observability_alerts SET status = 'snoozed', muted_until = $1 WHERE id = $2",
        until,
        alert_id,
    )
    return result == "UPDATE 1"


async def mark_alert_sent(alert_id: str) -> bool:
    result = await db.execute(
        "UPDATE observability_alerts SET status = 'sent', sent_at = now() WHERE id = $1",
        alert_id,
    )
    return result == "UPDATE 1"


async def mark_alert_failed(alert_id: str) -> bool:
    result = await db.execute(
        "UPDATE observability_alerts SET status = 'failed' WHERE id = $1",
        alert_id,
    )
    return result == "UPDATE 1"
