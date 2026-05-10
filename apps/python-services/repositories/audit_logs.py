from typing import Any

import db


async def create_audit_log(
    *,
    audit_id: str,
    tenant_id: str,
    actor_id: str | None,
    actor_type: str,
    actor_ip: str | None,
    action: str,
    resource_type: str | None,
    resource_id: str | None,
    metadata: dict[str, Any],
) -> None:
    if not await db.table_exists("audit_log"):
        return
    await db.execute(
        """
        insert into audit_log (
          id, "tenantId", "actorId", "actorType", "actorIp",
          action, "resourceType", "resourceId", metadata, timestamp
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, now())
        """,
        audit_id,
        tenant_id,
        actor_id,
        actor_type,
        actor_ip,
        action,
        resource_type,
        resource_id,
        db.json_dumps(metadata),
    )
