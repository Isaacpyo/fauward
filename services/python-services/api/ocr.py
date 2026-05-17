from typing import Annotated, Any
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status

from api.auth import AuthContext, require_scope
from main import limiter
from schemas.ocr import DocumentType, OcrQueuedResponse, OcrResultResponse
from services.ocr_service import (
    FAILED_QUEUE_ERROR,
    OcrQueuePublishError,
    build_ocr_payload_from_upload,
    fetch_ocr_result,
    parse_json_payload,
    queue_ocr_parse,
)
from services.pdf_jobs import tenant_rate_limit_key
from workers import publish_job

router = APIRouter(prefix="/ocr", tags=["ocr"])


@router.post("/parse", response_model=OcrQueuedResponse, status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("20/minute")
@limiter.limit("80/hour", key_func=tenant_rate_limit_key)
async def parse_document(
    request: Request,
    auth: Annotated[AuthContext, Depends(require_scope("ocr:write"))],
    file: UploadFile | None = File(default=None),
    tenantId: str | None = Form(default=None),
    documentType: DocumentType | None = Form(default=None),
) -> dict[str, str]:
    payload = await parse_json_payload(request)
    job_id: str | None = None
    if payload is None:
        if file is None or tenantId is None or documentType is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="multipart requests require file, tenantId and documentType")
        job_id = str(uuid4())
        payload = await build_ocr_payload_from_upload(
            auth=auth,
            tenant_id=tenantId,
            document_type=documentType,
            file=file,
            job_id=job_id,
        )
    try:
        return await queue_ocr_parse(payload=payload, auth=auth, publisher=publish_job, job_id=job_id, request=request)
    except OcrQueuePublishError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"jobId": exc.job_id, "error": FAILED_QUEUE_ERROR},
        ) from exc


@router.get("/result/{job_id}", response_model=OcrResultResponse)
async def ocr_result(
    job_id: str,
    auth: Annotated[AuthContext, Depends(require_scope("ocr:read"))],
) -> dict[str, Any]:
    return await fetch_ocr_result(job_id, auth)
