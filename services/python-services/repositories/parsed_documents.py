from typing import Any

import db


async def create_ocr_job(*, job_id: str, tenant_id: str, document_type: str, file_url: str) -> None:
    await db.execute(
        """
        insert into parsed_documents (job_id, tenant_id, document_type, file_url, status, updated_at)
        values ($1, $2, $3, $4, 'QUEUED', now())
        """,
        job_id,
        tenant_id,
        document_type,
        file_url,
    )


async def get_ocr_job_for_tenant(job_id: str, tenant_id: str | None = None) -> dict[str, Any] | None:
    if tenant_id is None:
        row = await db.fetchrow(
            """
            select job_id, tenant_id, document_type, extracted_fields, confidence_score, status, error_message, updated_at
            from parsed_documents
            where job_id = $1
            """,
            job_id,
        )
    else:
        row = await db.fetchrow(
            """
            select job_id, tenant_id, document_type, extracted_fields, confidence_score, status, error_message, updated_at
            from parsed_documents
            where job_id = $1 and tenant_id = $2
            """,
            job_id,
            tenant_id,
        )
    return dict(row) if row else None


async def mark_ocr_job_failed(job_id: str, tenant_id: str, error_message: str) -> None:
    await db.execute(
        """
        update parsed_documents
        set status = 'FAILED', error_message = $3, updated_at = now()
        where job_id = $1 and tenant_id = $2
        """,
        job_id,
        tenant_id,
        error_message[:4000],
    )


async def mark_ocr_job_processing(job_id: str, tenant_id: str) -> None:
    await db.execute(
        """
        update parsed_documents
        set status = 'PROCESSING', error_message = null, updated_at = now()
        where job_id = $1 and tenant_id = $2
        """,
        job_id,
        tenant_id,
    )


async def complete_ocr_job(*, job_id: str, tenant_id: str, document_type: str, file_url: str, fields: dict[str, Any], raw_text: str, confidence: float) -> None:
    await db.execute(
        """
        update parsed_documents
        set extracted_fields = $4::jsonb,
            raw_text = $5,
            confidence_score = $6,
            status = 'READY',
            error_message = null,
            updated_at = now()
        where job_id = $1 and tenant_id = $2 and document_type = $3
        """,
        job_id,
        tenant_id,
        document_type,
        db.json_dumps(fields),
        raw_text[:100_000],
        confidence,
    )
