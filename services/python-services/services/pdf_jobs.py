import hashlib
import logging
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, Request, status

import db
from api.auth import AuthContext
from models.pdf_schemas import DocumentStatus, DocumentType, PdfDisplayOptions, PdfGenerateRequest

logger = logging.getLogger(__name__)

FAILED_QUEUE_ERROR = "PDF generation could not be queued"
NORMAL_TENANT_ERROR = "PDF generation failed"


class QueuePublishError(RuntimeError):
    def __init__(self, job_id: str) -> None:
        super().__init__(FAILED_QUEUE_ERROR)
        self.job_id = job_id


def require_tenant_access(auth: AuthContext, tenant_id: str) -> None:
    if tenant_id != auth.tenant_id and not auth.is_super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def actor_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


def tenant_rate_limit_key(request: Request) -> str:
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        digest = hashlib.sha256(authorization.encode("utf-8")).hexdigest()
        return f"api-key:{digest}"
    client = request.client.host if request.client else "unknown"
    return f"ip:{client}"


async def fetch_shipment_for_tenant(tenant_id: str, shipment_id: str) -> dict[str, Any] | None:
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


async def verify_shipment_for_tenant(tenant_id: str, shipment_id: str) -> dict[str, Any]:
    shipment = await fetch_shipment_for_tenant(tenant_id, shipment_id)
    if shipment is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found")
    return shipment


def _first_value(source: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in source and source[key] not in (None, ""):
            return source[key]
    return None


def _address_text(value: Any) -> str:
    if isinstance(value, str):
        return value
    if not isinstance(value, dict):
        return ""
    parts = [
        value.get("name"),
        value.get("line1") or value.get("address1"),
        value.get("line2") or value.get("address2"),
        value.get("city"),
        value.get("postcode") or value.get("postalCode"),
        value.get("country"),
    ]
    return ", ".join(str(part) for part in parts if part)


def build_pdf_data_from_shipment(
    *,
    shipment: dict[str, Any],
    document_type: DocumentType,
    options: PdfDisplayOptions | None = None,
) -> dict[str, Any]:
    origin = _first_value(shipment, "originAddress", "origin_address", "origin")
    destination = _first_value(shipment, "destinationAddress", "destination_address", "destination")
    tracking_ref = _first_value(shipment, "trackingRef", "trackingNumber", "tracking_number", "reference", "id")
    recipient_name = _first_value(shipment, "recipientName", "customerName", "customer_name")
    if recipient_name is None and isinstance(destination, dict):
        recipient_name = destination.get("name") or destination.get("recipientName")

    data: dict[str, Any] = {
        "shipmentId": str(shipment.get("id") or ""),
        "trackingRef": tracking_ref,
        "trackingNumber": tracking_ref,
        "originAddress": _address_text(origin),
        "destAddress": _address_text(destination),
        "destinationAddress": _address_text(destination),
        "recipientName": recipient_name,
        "status": shipment.get("status"),
        "currency": options.currency if options else None,
    }

    if document_type == "invoice":
        data.update(
            {
                "invoiceNumber": _first_value(shipment, "invoiceNumber", "invoice_number") or shipment.get("id"),
                "invoiceDate": _first_value(shipment, "invoiceDate", "createdAt", "created_at"),
                "billTo": {"name": recipient_name or "Customer", "address": _address_text(destination)},
                "lineItems": shipment.get("lineItems") or shipment.get("items") or [],
                "subtotal": _first_value(shipment, "subtotal", "invoiceSubtotal") or 0,
                "vat": _first_value(shipment, "vat", "taxAmount", "invoiceTax") or 0,
                "total": _first_value(shipment, "total", "invoiceTotal") or 0,
            }
        )
    elif document_type == "pod":
        data.update(
            {
                "timestamp": _first_value(shipment, "deliveredAt", "actualDelivery", "updatedAt"),
                "gps": _first_value(shipment, "deliveryGps", "gps", "coordinates"),
                "agentName": _first_value(shipment, "agentName", "driverName", "assignedDriverId"),
                "signatureImage": _first_value(shipment, "signatureImage", "signatureUrl"),
            }
        )
    elif document_type == "manifest":
        data.update(
            {
                "routeName": _first_value(shipment, "routeName", "routeId") or shipment.get("id"),
                "stops": shipment.get("stops")
                or [
                    {
                        "trackingRef": tracking_ref,
                        "shipmentId": shipment.get("id"),
                        "recipientName": recipient_name,
                        "destination": _address_text(destination),
                    }
                ],
            }
        )

    if options and options.notes:
        data["notes"] = options.notes
    return {key: value for key, value in data.items() if value is not None}


async def find_idempotent_document(tenant_id: str, idempotency_key: str | None) -> dict[str, Any] | None:
    if not idempotency_key:
        return None
    row = await db.fetchrow(
        """
        select id, status
        from documents
        where tenant_id = $1 and idempotency_key = $2
        """,
        tenant_id,
        idempotency_key,
    )
    return dict(row) if row else None


async def create_document_job(payload: PdfGenerateRequest, job_id: str) -> None:
    await db.execute(
        """
        insert into documents (
          id, tenant_id, shipment_id, type, status, metadata, idempotency_key, updated_at
        )
        values ($1, $2, $3, $4, 'QUEUED', $5::jsonb, $6, now())
        """,
        job_id,
        payload.tenantId,
        payload.shipmentId,
        payload.type,
        db.json_dumps({"source": "api", "options": payload.options.model_dump(exclude_none=True)}),
        payload.idempotencyKey,
    )


async def mark_document_failed(job_id: str, tenant_id: str, error_message: str) -> None:
    await db.execute(
        """
        update documents
        set status = 'FAILED',
            error_message = $3,
            updated_at = now()
        where id = $1 and tenant_id = $2
        """,
        job_id,
        tenant_id,
        error_message[:4000],
    )


async def queue_pdf_generation(
    *,
    payload: PdfGenerateRequest,
    auth: AuthContext,
    publisher: Any,
) -> dict[str, str]:
    require_tenant_access(auth, payload.tenantId)
    await verify_shipment_for_tenant(payload.tenantId, payload.shipmentId)

    existing = await find_idempotent_document(payload.tenantId, payload.idempotencyKey)
    if existing is not None:
        return {"jobId": str(existing["id"]), "status": normalize_status(str(existing["status"]))}

    job_id = str(uuid4())
    await create_document_job(payload, job_id)

    worker_payload = {
        "jobId": job_id,
        "tenantId": payload.tenantId,
        "type": payload.type,
        "shipmentId": payload.shipmentId,
        "options": payload.options.model_dump(exclude_none=True),
    }
    try:
        publisher("fauward:pdf:generate", worker_payload)
    except Exception as exc:
        logger.exception("pdf_queue_publish_failed", extra={"_job_id": job_id, "_tenant_id": payload.tenantId})
        await mark_document_failed(job_id, payload.tenantId, str(exc))
        raise QueuePublishError(job_id) from exc
    return {"jobId": job_id, "status": "QUEUED"}


def normalize_status(raw_status: str) -> DocumentStatus:
    normalized = raw_status.upper()
    if normalized in {"READY", "COMPLETED", "DONE"}:
        return "COMPLETED"
    if normalized == "RUNNING":
        return "PROCESSING"
    if normalized in {"QUEUED", "PROCESSING", "FAILED"}:
        return normalized  # type: ignore[return-value]
    return "FAILED"


async def fetch_document_for_auth(job_id: str, auth: AuthContext) -> dict[str, Any]:
    if auth.is_super_admin:
        row = await db.fetchrow(
            """
            select id, tenant_id, shipment_id, type, url, status, error_message, metadata
            from documents
            where id = $1
            """,
            job_id,
        )
    else:
        row = await db.fetchrow(
            """
            select id, tenant_id, shipment_id, type, url, status, error_message, metadata
            from documents
            where id = $1 and tenant_id = $2
            """,
            job_id,
            auth.tenant_id,
        )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="PDF job not found")
    return dict(row)


def status_response(row: dict[str, Any], auth: AuthContext) -> dict[str, Any]:
    status_value = normalize_status(str(row["status"]))
    response: dict[str, Any] = {"jobId": row["id"], "status": status_value}
    if status_value == "COMPLETED":
        response["url"] = f"/pdf/download/{row['id']}"
    if status_value == "FAILED" and row.get("error_message"):
        response["error"] = str(row["error_message"]) if auth.is_super_admin else NORMAL_TENANT_ERROR
    return response


async def log_pdf_generation_audit(
    *,
    auth: AuthContext,
    payload: PdfGenerateRequest,
    job_id: str,
    request: Request,
) -> None:
    try:
        if not await db.table_exists("audit_log"):
            logger.info("audit_log_unavailable", extra={"_action": "pdf_generation_queued"})
            return
        await db.execute(
            """
            insert into audit_log (
              id, "tenantId", "actorId", "actorType", "actorIp",
              action, "resourceType", "resourceId", metadata, timestamp
            )
            values ($1, $2, null, $3, $4, 'pdf_generation_queued', 'document', $5, $6::jsonb, now())
            """,
            str(uuid4()),
            payload.tenantId,
            "SUPER_ADMIN" if auth.is_super_admin else "API",
            actor_ip(request),
            job_id,
            db.json_dumps(
                {
                    "tenantId": payload.tenantId,
                    "shipmentId": payload.shipmentId,
                    "documentType": payload.type,
                    "jobId": job_id,
                    "actorTenantId": auth.tenant_id,
                }
            ),
        )
    except Exception:
        logger.warning("pdf_generation_audit_failed", extra={"_job_id": job_id, "_tenant_id": payload.tenantId})
