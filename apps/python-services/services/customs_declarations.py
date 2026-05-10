import logging
from decimal import Decimal, ROUND_HALF_UP
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, Request, status

import db
from api.auth import AuthContext
from lib.hs_lookup import fuzzy_match
from lib.tax_engine import estimate_landed_cost
from models.customs_schemas import DeclarationRequest, DeclarationStatus

logger = logging.getLogger(__name__)

FAILED_QUEUE_ERROR = "Customs declaration could not be queued"
NORMAL_TENANT_ERROR = "Customs declaration generation failed"


class CustomsQueuePublishError(RuntimeError):
    def __init__(self, job_id: str) -> None:
        super().__init__(FAILED_QUEUE_ERROR)
        self.job_id = job_id


def resolve_effective_tenant_id(auth: AuthContext, requested_tenant_id: str) -> str:
    return requested_tenant_id if auth.is_super_admin else auth.tenant_id


def validate_hs_description(description: str) -> str:
    normalized = " ".join(description.strip().split())
    if len(normalized) < 2:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Description is too short")
    if len(normalized) > 200:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Description is too long")
    return normalized


def hs_lookup_response(description: str) -> dict[str, Any]:
    normalized = validate_hs_description(description)
    return {"description": normalized, "matches": fuzzy_match(normalized, limit=5)[:5]}


def duty_estimate_response(*, origin_country: str, dest_country: str, hs_code: str, declared_value: Decimal, currency: str) -> dict[str, Any]:
    response = estimate_landed_cost(
        origin_country=origin_country,
        dest_country=dest_country,
        hs_code=hs_code,
        declared_value=declared_value,
        currency=currency,
    )
    response["estimateOnly"] = True
    return response


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


async def find_idempotent_declaration(tenant_id: str, idempotency_key: str | None) -> dict[str, Any] | None:
    if not idempotency_key:
        return None
    row = await db.fetchrow(
        """
        select id, status
        from customs_declarations
        where tenant_id = $1 and idempotency_key = $2
        """,
        tenant_id,
        idempotency_key,
    )
    return dict(row) if row else None


async def create_declaration_job(payload: DeclarationRequest, tenant_id: str, job_id: str) -> None:
    await db.execute(
        """
        insert into customs_declarations (
          id, tenant_id, shipment_id, declaration_type, status, metadata, idempotency_key, updated_at
        )
        values ($1, $2, $3, $4, 'QUEUED', $5::jsonb, $6, now())
        """,
        job_id,
        tenant_id,
        payload.shipmentId,
        payload.declarationType,
        db.json_dumps({"source": "api", "options": payload.options.model_dump(exclude_none=True)}),
        payload.idempotencyKey,
    )


async def mark_declaration_failed(job_id: str, tenant_id: str, error_message: str) -> None:
    await db.execute(
        """
        update customs_declarations
        set status = 'FAILED',
            error_message = $3,
            updated_at = now()
        where id = $1 and tenant_id = $2
        """,
        job_id,
        tenant_id,
        error_message[:4000],
    )


async def queue_declaration_generation(
    *,
    payload: DeclarationRequest,
    auth: AuthContext,
    publisher: Any,
) -> dict[str, str]:
    tenant_id = resolve_effective_tenant_id(auth, payload.tenantId)
    await verify_shipment_for_tenant(tenant_id, payload.shipmentId)

    existing = await find_idempotent_declaration(tenant_id, payload.idempotencyKey)
    if existing is not None:
        return {"jobId": str(existing["id"]), "status": normalize_status(str(existing["status"]))}

    job_id = str(uuid4())
    await create_declaration_job(payload, tenant_id, job_id)

    worker_payload = {
        "jobId": job_id,
        "tenantId": tenant_id,
        "shipmentId": payload.shipmentId,
        "declarationType": payload.declarationType,
        "options": payload.options.model_dump(exclude_none=True),
    }
    try:
        publisher("fauward:customs:generate", worker_payload)
    except Exception as exc:
        logger.exception("customs_queue_publish_failed", extra={"_job_id": job_id, "_tenant_id": tenant_id})
        await mark_declaration_failed(job_id, tenant_id, str(exc))
        raise CustomsQueuePublishError(job_id) from exc
    return {"jobId": job_id, "status": "QUEUED"}


def normalize_status(raw_status: str) -> DeclarationStatus:
    normalized = raw_status.upper()
    if normalized in {"READY", "COMPLETED", "DONE"}:
        return "COMPLETED"
    if normalized == "RUNNING":
        return "PROCESSING"
    if normalized in {"QUEUED", "PROCESSING", "FAILED"}:
        return normalized  # type: ignore[return-value]
    return "FAILED"


async def fetch_declaration_for_auth(job_id: str, auth: AuthContext) -> dict[str, Any]:
    if auth.is_super_admin:
        row = await db.fetchrow(
            """
            select id, tenant_id, shipment_id, declaration_type, status, error_message, updated_at
            from customs_declarations
            where id = $1
            """,
            job_id,
        )
    else:
        row = await db.fetchrow(
            """
            select id, tenant_id, shipment_id, declaration_type, status, error_message, updated_at
            from customs_declarations
            where id = $1 and tenant_id = $2
            """,
            job_id,
            auth.tenant_id,
        )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Customs declaration not found")
    return dict(row)


def declaration_status_response(row: dict[str, Any], auth: AuthContext) -> dict[str, Any]:
    status_value = normalize_status(str(row["status"]))
    updated_at = row.get("updated_at")
    response: dict[str, Any] = {
        "jobId": row["id"],
        "tenantId": row["tenant_id"],
        "shipmentId": row.get("shipment_id"),
        "declarationType": row["declaration_type"],
        "status": status_value,
        "error": None,
        "updatedAt": updated_at.isoformat() if updated_at else None,
    }
    if status_value == "FAILED" and row.get("error_message"):
        response["error"] = str(row["error_message"]) if auth.is_super_admin else NORMAL_TENANT_ERROR
    return response


def _first_value(source: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in source and source[key] not in (None, ""):
            return source[key]
    return None


def _address_country(value: Any) -> str | None:
    if isinstance(value, dict):
        country = value.get("countryCode") or value.get("country")
        return str(country).upper() if country else None
    return None


def _money_decimal(value: Any) -> Decimal:
    try:
        return Decimal(str(value or 0)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except Exception:
        return Decimal("0.00")


def _normalize_items(raw_items: Any, currency: str) -> list[dict[str, Any]]:
    if not isinstance(raw_items, list):
        return []
    items: list[dict[str, Any]] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        value = _money_decimal(item.get("declaredValue", item.get("declared_value", item.get("value", 0))))
        items.append(
            {
                "description": str(item.get("description") or item.get("name") or "Goods")[:200],
                "hsCode": str(item.get("hsCode") or item.get("hs_code") or ""),
                "quantity": int(item.get("quantity") or item.get("qty") or 1),
                "declaredValue": float(value),
                "value": float(value),
                "weightKg": float(item.get("weightKg") or item.get("weight_kg") or 0),
                "currency": str(item.get("currency") or currency).upper(),
            }
        )
    return items


def build_customs_shipment_data(shipment: dict[str, Any], options: dict[str, Any] | None = None) -> dict[str, Any]:
    origin = _first_value(shipment, "originAddress", "origin_address", "origin")
    destination = _first_value(shipment, "destinationAddress", "destination_address", "destination")
    currency = str(_first_value(shipment, "currency", "invoiceCurrency") or "GBP").upper()
    sender = _first_value(shipment, "senderName", "shipperName", "companyName")
    recipient = _first_value(shipment, "recipientName", "customerName", "receiverName")
    data = {
        "id": shipment.get("id"),
        "senderName": sender or "Sender",
        "recipientName": recipient or "Recipient",
        "exporter": _first_value(shipment, "exporter", "senderName", "shipperName"),
        "importer": _first_value(shipment, "importer", "recipientName", "customerName"),
        "declarant": _first_value(shipment, "declarant", "senderName", "shipperName"),
        "consignee": _first_value(shipment, "consignee", "recipientName", "customerName"),
        "originCountry": _first_value(shipment, "originCountry", "origin_country") or _address_country(origin),
        "destCountry": _first_value(shipment, "destCountry", "destinationCountry", "dest_country") or _address_country(destination),
        "currency": currency,
        "items": _normalize_items(_first_value(shipment, "items", "lineItems", "shipmentItems"), currency),
    }
    if options and options.get("iossNumber"):
        data["iossNumber"] = options["iossNumber"]
    return data


async def log_declaration_audit(
    *,
    auth: AuthContext,
    payload: DeclarationRequest,
    tenant_id: str,
    job_id: str,
    request: Request,
) -> None:
    try:
        if not await db.table_exists("audit_log"):
            return
        actor_id = auth.actor_id or auth.user_id
        await db.execute(
            """
            insert into audit_log (
              id, "tenantId", "actorId", "actorType", "actorIp",
              action, "resourceType", "resourceId", metadata, timestamp
            )
            values ($1, $2, $3, $4, $5, 'customs_declaration_queued', 'customs_declaration', $6, $7::jsonb, now())
            """,
            str(uuid4()),
            tenant_id,
            actor_id,
            "SUPER_ADMIN" if auth.is_super_admin else "API",
            request.client.host if request.client else None,
            job_id,
            db.json_dumps(
                {
                    "tenantId": tenant_id,
                    "shipmentId": payload.shipmentId,
                    "declarationType": payload.declarationType,
                    "jobId": job_id,
                    "apiKeyId": auth.api_key_id,
                }
            ),
        )
    except Exception:
        logger.warning("customs_declaration_audit_failed", extra={"_job_id": job_id, "_tenant_id": tenant_id})
