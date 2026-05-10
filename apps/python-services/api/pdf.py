from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from api.auth import AuthContext, require_bearer_token
from lib.storage import download_bytes
from main import limiter
from schemas.pdf import PdfGenerateRequest, PdfQueuedResponse, PdfStatusResponse
from services.pdf_jobs import (
    FAILED_QUEUE_ERROR,
    QueuePublishError,
    fetch_document_for_auth,
    log_pdf_generation_audit,
    queue_pdf_generation,
    status_response,
    tenant_rate_limit_key,
)
from workers import publish_job

router = APIRouter(prefix="/pdf", tags=["pdf"])


@router.post("/generate", response_model=PdfQueuedResponse)
@limiter.limit("30/minute")
@limiter.limit("120/hour", key_func=tenant_rate_limit_key)
async def generate_pdf(
    request: Request,
    payload: PdfGenerateRequest,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
) -> dict[str, str]:
    try:
        response = await queue_pdf_generation(payload=payload, auth=auth, publisher=publish_job)
    except QueuePublishError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"jobId": exc.job_id, "error": FAILED_QUEUE_ERROR},
        ) from exc
    await log_pdf_generation_audit(auth=auth, payload=payload, job_id=response["jobId"], request=request)
    return response


@router.get("/status/{job_id}", response_model=PdfStatusResponse, response_model_exclude_none=True)
async def pdf_status(
    job_id: str,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
) -> dict[str, Any]:
    row = await fetch_document_for_auth(job_id, auth)
    return status_response(row, auth)


@router.get("/download/{job_id}")
async def pdf_download(
    job_id: str,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
) -> StreamingResponse:
    row = await fetch_document_for_auth(job_id, auth)
    if status_response(row, auth)["status"] != "COMPLETED":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF not found")

    metadata = row.get("metadata") if isinstance(row.get("metadata"), dict) else {}
    storage_path = metadata.get("storagePath")
    if not isinstance(storage_path, str) or not storage_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF not found")

    content = download_bytes(bucket="documents", path=storage_path)
    if content is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF not found")

    filename = f"{row['type']}-{row['shipment_id'] or row['id']}.pdf"
    return StreamingResponse(
        iter([content]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
