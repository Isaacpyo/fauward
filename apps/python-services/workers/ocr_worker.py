import asyncio
import re
import io
import tempfile
from pathlib import Path
from typing import Any

import pdfplumber
import requests
from PIL import Image
from pytesseract import image_to_string

import db
from celery_app import celery_app
from lib.storage import upload_bytes
from workers import run_worker


def _download(url: str) -> tuple[bytes, str]:
    if url.startswith("file://"):
        path = Path(url.replace("file:///", "", 1))
        return path.read_bytes(), ""
    response = requests.get(url, stream=True, timeout=60)
    response.raise_for_status()
    return response.content, response.headers.get("content-type", "")


def _detect_kind(content: bytes, content_type: str, url: str) -> str:
    try:
        import magic

        detected = magic.from_buffer(content[:4096], mime=True)
    except Exception:
        detected = content_type
    lower_url = url.lower()
    if "pdf" in detected or lower_url.endswith(".pdf"):
        return "pdf"
    if detected.startswith("image/") or lower_url.endswith((".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".webp")):
        return "image"
    return "text"


def _extract_pdf_text(content: bytes) -> str:
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as handle:
        handle.write(content)
        path = Path(handle.name)
    try:
        with pdfplumber.open(path) as pdf:
            return "\n".join(page.extract_text() or "" for page in pdf.pages)
    finally:
        path.unlink(missing_ok=True)


def _extract_text(content: bytes, kind: str) -> str:
    if kind == "pdf":
        return _extract_pdf_text(content)
    if kind == "image":
        with Image.open(io.BytesIO(content)) as image:
            return image_to_string(image)
    with tempfile.NamedTemporaryFile(delete=False) as handle:
        handle.write(content)
        path = Path(handle.name)
    try:
        return content.decode("utf-8", errors="ignore")
    finally:
        path.unlink(missing_ok=True)


PATTERNS: dict[str, dict[str, str]] = {
    "return_auth": {
        "order_number": r"(?:order|rma|return)\s*(?:number|no\.?|#)\s*[:\-]?\s*([A-Z0-9\-]+)",
        "reason_code": r"(?:reason|code)\s*[:\-]?\s*([A-Z0-9_\- ]{2,40})",
        "customer_name": r"(?:customer|name)\s*[:\-]?\s*([A-Za-z ,.'-]{3,80})",
        "return_address": r"(?:return address|address)\s*[:\-]?\s*(.{10,160})",
    },
    "customs_form": {
        "hs_code": r"(?:hs|commodity)\s*(?:code)?\s*[:\-]?\s*([0-9]{4,10})",
        "country_of_origin": r"(?:country of origin|origin)\s*[:\-]?\s*([A-Za-z ]{2,60})",
        "declared_value": r"(?:declared value|value)\s*[:\-]?\s*([0-9,.]+)",
        "currency": r"\b(GBP|USD|EUR|AED|NGN)\b",
    },
    "bill_of_lading": {
        "bl_number": r"(?:b/l|bl|bill of lading)\s*(?:number|no\.?|#)?\s*[:\-]?\s*([A-Z0-9\-]+)",
        "shipper": r"shipper\s*[:\-]?\s*([A-Za-z0-9 ,.'-&]{3,100})",
        "consignee": r"consignee\s*[:\-]?\s*([A-Za-z0-9 ,.'-&]{3,100})",
        "port_of_loading": r"port of loading\s*[:\-]?\s*([A-Za-z ,.'-]{3,80})",
        "port_of_discharge": r"port of discharge\s*[:\-]?\s*([A-Za-z ,.'-]{3,80})",
    },
    "pod_photo": {
        "recipient_name": r"(?:recipient|received by|signed by)\s*[:\-]?\s*([A-Za-z ,.'-]{3,80})",
        "timestamp": r"(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?)",
        "address_text": r"((?:\d+\s+)?[A-Za-z0-9 ,.'-]{10,120}(?:road|street|avenue|lane|close|drive|way|rd|st)\b.*)",
    },
}


def _parse_fields(document_type: str, text: str) -> tuple[dict[str, str], float]:
    patterns = PATTERNS.get(document_type, {})
    fields: dict[str, str] = {}
    for key, pattern in patterns.items():
        match = re.search(pattern, text, flags=re.IGNORECASE | re.MULTILINE)
        if match:
            fields[key] = " ".join(match.group(1).split())
    confidence = len(fields) / max(len(patterns), 1)
    return fields, round(confidence, 4)


async def handle_ocr_job(payload: dict[str, Any]) -> dict[str, Any]:
    job_id = str(payload["jobId"])
    tenant_id = str(payload["tenantId"])
    document_type = str(payload["documentType"])
    file_url = str(payload["fileUrl"])
    content, content_type = await asyncio.to_thread(_download, file_url)
    kind = _detect_kind(content, content_type, file_url)
    text = await asyncio.to_thread(_extract_text, content, kind)
    fields, confidence = _parse_fields(document_type, text)
    await db.execute(
        """
        insert into parsed_documents (
          job_id, tenant_id, document_type, file_url, extracted_fields,
          raw_text, confidence_score, status, updated_at
        )
        values ($1, $2, $3, $4, $5::jsonb, $6, $7, 'READY', now())
        on conflict (job_id) do update
        set extracted_fields = excluded.extracted_fields,
            raw_text = excluded.raw_text,
            confidence_score = excluded.confidence_score,
            status = 'READY',
            error_message = null,
            updated_at = now()
        """,
        job_id,
        tenant_id,
        document_type,
        file_url,
        db.json_dumps(fields),
        text[:100_000],
        confidence,
    )
    return {"documentType": document_type, "extractedFields": fields, "confidenceScore": confidence}


@celery_app.task(name="workers.ocr_worker.process_ocr_job", queue="ocr")
def process_ocr_job(payload: dict[str, Any]) -> dict[str, Any]:
    return run_worker(
        worker_name="ocr_worker",
        done_queue="fauward:ocr:done",
        payload=payload,
        handler=handle_ocr_job,
    )


async def store_uploaded_ocr_file(tenant_id: str, job_id: str, filename: str, content: bytes, content_type: str) -> str:
    suffix = Path(filename).suffix or ".bin"
    path = f"{tenant_id}/ocr/{job_id}{suffix}"
    return await asyncio.to_thread(
        upload_bytes,
        bucket="documents",
        path=path,
        content=content,
        content_type=content_type or "application/octet-stream",
    )
