import json
import logging
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, Request, UploadFile, status

from api.auth import AuthContext
from repositories.parsed_documents import create_ocr_job, get_ocr_job_for_tenant, mark_ocr_job_failed
from schemas.ocr import DocumentType, OcrJsonRequest
from services.audit_service import audit_event
from services.storage_service import (
    read_upload_file_limited,
    sanitize_filename,
    store_uploaded_file,
    validate_content_type,
    validate_trusted_file_url,
)
from services.tenant_access import resolve_effective_tenant_id

logger = logging.getLogger(__name__)

FAILED_QUEUE_ERROR = "OCR job could not be queued"
NORMAL_TENANT_ERROR = "OCR parsing failed"


class OcrQueuePublishError(RuntimeError):
    def __init__(self, job_id: str) -> None:
        super().__init__(FAILED_QUEUE_ERROR)
        self.job_id = job_id


async def parse_json_payload(request: Request) -> OcrJsonRequest | None:
    content_type = request.headers.get("content-type", "")
    if "application/json" not in content_type:
        return None
    try:
        body = await request.json()
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON body") from exc
    return OcrJsonRequest.model_validate(body)


async def build_ocr_payload_from_upload(
    *,
    auth: AuthContext,
    tenant_id: str,
    document_type: DocumentType,
    file: UploadFile,
    job_id: str,
) -> OcrJsonRequest:
    effective_tenant_id = resolve_effective_tenant_id(auth, tenant_id)
    content_type = validate_content_type(file.content_type)
    filename = sanitize_filename(file.filename)
    content = await read_upload_file_limited(file)
    file_url = await store_uploaded_file(
        tenant_id=effective_tenant_id,
        namespace="ocr",
        object_id=job_id,
        filename=filename,
        content=content,
        content_type=content_type,
    )
    return OcrJsonRequest(tenantId=effective_tenant_id, documentType=document_type, fileUrl=file_url)


async def queue_ocr_parse(
    *,
    payload: OcrJsonRequest,
    auth: AuthContext,
    publisher: Any,
    job_id: str | None = None,
    request: Request | None = None,
) -> dict[str, str]:
    tenant_id = resolve_effective_tenant_id(auth, payload.tenantId)
    file_url = validate_trusted_file_url(payload.fileUrl)
    job_id = job_id or str(uuid4())
    await create_ocr_job(job_id=job_id, tenant_id=tenant_id, document_type=payload.documentType, file_url=file_url)
    worker_payload = {
        "jobId": job_id,
        "tenantId": tenant_id,
        "documentType": payload.documentType,
        "fileUrl": file_url,
    }
    try:
        publisher("fauward:ocr:parse", worker_payload)
    except Exception as exc:
        logger.exception("ocr_queue_publish_failed", extra={"_job_id": job_id, "_tenant_id": tenant_id})
        await mark_ocr_job_failed(job_id, tenant_id, str(exc))
        raise OcrQueuePublishError(job_id) from exc
    if request is not None:
        await audit_event(
            auth=auth,
            tenant_id=tenant_id,
            action="ocr_parse_queued",
            resource_type="parsed_document",
            resource_id=job_id,
            request=request,
            metadata={"tenantId": tenant_id, "documentType": payload.documentType, "jobId": job_id, "apiKeyId": auth.api_key_id},
        )
    return {"jobId": job_id, "status": "queued"}


async def fetch_ocr_result(job_id: str, auth: AuthContext) -> dict[str, Any]:
    row = await get_ocr_job_for_tenant(job_id, None if auth.is_super_admin else auth.tenant_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="OCR job not found")
    status_value = str(row["status"]).upper()
    if status_value == "COMPLETED":
        status_value = "READY"
    response = {
        "jobId": row["job_id"],
        "status": status_value,
        "documentType": row["document_type"],
        "extractedFields": row.get("extracted_fields") or {},
        "confidenceScore": float(row.get("confidence_score") or 0),
        "error": None,
    }
    if status_value == "FAILED" and row.get("error_message"):
        response["error"] = str(row["error_message"]) if auth.is_super_admin else NORMAL_TENANT_ERROR
    return response
