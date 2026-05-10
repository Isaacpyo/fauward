from typing import Any

import db


async def get_shipment_for_tenant(tenant_id: str, shipment_id: str) -> dict[str, Any] | None:
    row = await db.fetchrow(
        """
        select *
        from shipments
        where id = $1 and "tenantId" = $2
        """,
        shipment_id,
        tenant_id,
    )
    return dict(row) if row else None


async def get_shipment_ids_for_tenant(tenant_id: str, shipment_ids: list[str]) -> set[str]:
    if not shipment_ids:
        return set()
    rows = await db.fetch(
        """
        select id
        from shipments
        where "tenantId" = $1 and id = any($2::text[])
        """,
        tenant_id,
        shipment_ids,
    )
    return {str(row["id"]) for row in rows}
