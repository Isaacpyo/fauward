import logging
from typing import Any
from uuid import uuid4

from fastapi import Request

import db
from api.auth import AuthContext
from repositories.audit_logs import create_audit_log

logger = logging.getLogger(__name__)


async def audit_event(
    *,
    auth: AuthContext,
    tenant_id: str,
    action: str,
    resource_type: str | None = None,
    resource_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    request: Request | None = None,
) -> None:
    try:
        await create_audit_log(
            audit_id=str(uuid4()),
            tenant_id=tenant_id,
            actor_id=auth.actor_id or auth.user_id,
            actor_type="SUPER_ADMIN" if auth.is_super_admin else "API",
            actor_ip=request.client.host if request and request.client else None,
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            metadata=metadata or {},
        )
    except Exception:
        logger.warning("audit_event_failed", extra={"_action": action, "_tenant_id": tenant_id, "_resource_id": resource_id})


async def table_exists() -> bool:
    return await db.table_exists("audit_log")
