from typing import Annotated, Any, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

import db
from api.auth import AuthContext, require_bearer_token
from workers import publish_job
from workers.ocr_worker import store_uploaded_ocr_file

router = APIRouter(prefix="/ocr", tags=["ocr"])


DocumentType = Literal["return_auth", "customs_form", "bill_of_lading", "pod_photo"]


class OcrJsonRequest(BaseModel):
    jobId: str = Field(default_factory=lambda: str(uuid4()))
    tenantId: str
    documentType: DocumentType
    fileUrl: str


async def _json_payload(request: Request) -> OcrJsonRequest | None:
    content_type = request.headers.get("content-type", "")
    if "application/json" not in content_type:
        return None
    return OcrJsonRequest.model_validate(await request.json())


@router.post("/parse")
async def parse_document(
    request: Request,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
    file: UploadFile | None = File(default=None),
    tenantId: str | None = Form(default=None),
    documentType: DocumentType | None = Form(default=None),
    jobId: str | None = Form(default=None),
) -> dict[str, str]:
    json_payload = await _json_payload(request)
    if json_payload:
        payload = json_payload
    else:
        if file is None or tenantId is None or documentType is None:
            raise HTTPException(status_code=400, detail="multipart requests require file, tenantId and documentType")
        actual_job_id = jobId or str(uuid4())
        content = await file.read()
        file_url = await store_uploaded_ocr_file(
            tenant_id=tenantId,
            job_id=actual_job_id,
            filename=file.filename or "document.bin",
            content=content,
            content_type=file.content_type or "application/octet-stream",
        )
        payload = OcrJsonRequest(jobId=actual_job_id, tenantId=tenantId, documentType=documentType, fileUrl=file_url)
    if payload.tenantId != auth.tenant_id and not auth.is_super_admin:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    await db.execute(
        """
        insert into parsed_documents (job_id, tenant_id, document_type, file_url, status, updated_at)
        values ($1, $2, $3, $4, 'QUEUED', now())
        on conflict (job_id) do update
        set status = 'QUEUED',
            file_url = excluded.file_url,
            error_message = null,
            updated_at = now()
        """,
        payload.jobId,
        payload.tenantId,
        payload.documentType,
        payload.fileUrl,
    )
    publish_job("fauward:ocr:parse", payload.model_dump())
    return {"jobId": payload.jobId, "status": "queued"}


@router.get("/result/{job_id}")
async def ocr_result(
    job_id: str,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
) -> dict[str, Any]:
    row = await db.fetchrow(
        """
        select job_id, tenant_id, document_type, extracted_fields, confidence_score, status, error_message
        from parsed_documents
        where job_id = $1
        """,
        job_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="OCR job not found")
    if row["tenant_id"] != auth.tenant_id and not auth.is_super_admin:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    return {
        "jobId": row["job_id"],
        "status": row["status"],
        "documentType": row["document_type"],
        "extractedFields": row["extracted_fields"],
        "confidenceScore": float(row["confidence_score"] or 0),
        "error": row["error_message"],
    }
