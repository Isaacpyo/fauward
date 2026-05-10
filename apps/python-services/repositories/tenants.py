from typing import Any

import db


async def get_tenant(tenant_id: str) -> dict[str, Any] | None:
    row = await db.fetchrow("select id, name, slug, status from tenants where id = $1", tenant_id)
    return dict(row) if row else None
