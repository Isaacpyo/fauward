from typing import Annotated, Any, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import db
from api.auth import AuthContext, require_bearer_token
from workers import publish_job

router = APIRouter(prefix="/pdf", tags=["pdf"])


class PdfGenerateRequest(BaseModel):
    jobId: str = Field(default_factory=lambda: str(uuid4()))
    tenantId: str
    type: Literal["invoice", "shipping_label", "pod", "manifest"]
    shipmentId: str
    data: dict[str, Any] = Field(default_factory=dict)


@router.post("/generate")
async def generate_pdf(
    payload: PdfGenerateRequest,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
) -> dict[str, str]:
    if payload.tenantId != auth.tenant_id and not auth.is_super_admin:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    await db.execute(
        """
        insert into documents (id, tenant_id, shipment_id, type, status, metadata, updated_at)
        values ($1, $2, $3, $4, 'QUEUED', $5::jsonb, now())
        on conflict (id) do update
        set status = 'QUEUED',
            error_message = null,
            metadata = excluded.metadata,
            updated_at = now()
        """,
        payload.jobId,
        payload.tenantId,
        payload.shipmentId,
        payload.type,
        db.json_dumps({"source": "api"}),
    )
    publish_job("fauward:pdf:generate", payload.model_dump())
    return {"jobId": payload.jobId, "status": "queued"}


@router.get("/status/{job_id}")
async def pdf_status(
    job_id: str,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
) -> dict[str, Any]:
    row = await db.fetchrow(
        """
        select id, tenant_id, url, status, error_message
        from documents
        where id = $1
        """,
        job_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="PDF job not found")
    if row["tenant_id"] != auth.tenant_id and not auth.is_super_admin:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    response: dict[str, Any] = {"jobId": row["id"], "status": row["status"]}
    if row["url"]:
        response["url"] = row["url"]
    if row["error_message"]:
        response["error"] = row["error_message"]
    return response
