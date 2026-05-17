from typing import Any

import db


async def create_declaration_job(
    *,
    job_id: str,
    tenant_id: str,
    shipment_id: str,
    declaration_type: str,
    metadata: dict[str, Any],
    idempotency_key: str | None,
) -> None:
    await db.execute(
        """
        insert into customs_declarations (
          id, tenant_id, shipment_id, declaration_type, status, metadata, idempotency_key, updated_at
        )
        values ($1, $2, $3, $4, 'QUEUED', $5::jsonb, $6, now())
        """,
        job_id,
        tenant_id,
        shipment_id,
        declaration_type,
        db.json_dumps(metadata),
        idempotency_key,
    )


async def get_declaration_for_tenant(job_id: str, tenant_id: str | None = None) -> dict[str, Any] | None:
    query = """
        select id, tenant_id, shipment_id, declaration_type, status, error_message, updated_at
        from customs_declarations
        where id = $1
    """
    args: tuple[Any, ...] = (job_id,)
    if tenant_id is not None:
        query += " and tenant_id = $2"
        args = (job_id, tenant_id)
    row = await db.fetchrow(query, *args)
    return dict(row) if row else None


async def mark_declaration_failed(job_id: str, tenant_id: str, error_message: str) -> None:
    await db.execute(
        "update customs_declarations set status = 'FAILED', error_message = $3, updated_at = now() where id = $1 and tenant_id = $2",
        job_id,
        tenant_id,
        error_message[:4000],
    )
