from typing import Any

import db


async def create_pdf_job(*, job_id: str, tenant_id: str, shipment_id: str, document_type: str, metadata: dict[str, Any], idempotency_key: str | None) -> None:
    await db.execute(
        """
        insert into documents (id, tenant_id, shipment_id, type, status, metadata, idempotency_key, updated_at)
        values ($1, $2, $3, $4, 'QUEUED', $5::jsonb, $6, now())
        """,
        job_id,
        tenant_id,
        shipment_id,
        document_type,
        db.json_dumps(metadata),
        idempotency_key,
    )


async def get_pdf_job_for_tenant(job_id: str, tenant_id: str | None = None) -> dict[str, Any] | None:
    if tenant_id is None:
        row = await db.fetchrow("select * from documents where id = $1", job_id)
    else:
        row = await db.fetchrow("select * from documents where id = $1 and tenant_id = $2", job_id, tenant_id)
    return dict(row) if row else None


async def mark_pdf_job_failed(job_id: str, tenant_id: str, error_message: str) -> None:
    await db.execute(
        "update documents set status = 'FAILED', error_message = $3, updated_at = now() where id = $1 and tenant_id = $2",
        job_id,
        tenant_id,
        error_message[:4000],
    )
