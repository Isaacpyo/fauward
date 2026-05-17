import logging
from decimal import Decimal
from typing import Any
from uuid import uuid4

from fastapi import HTTPException, Request, status

import db
from api.auth import AuthContext
from models.route_schemas import OptimizeRouteRequest, RouteStatus

logger = logging.getLogger(__name__)

FAILED_QUEUE_ERROR = "Route optimization could not be queued"
NORMAL_TENANT_ERROR = "Route optimization failed"
MAX_ACTIVE_ROUTE_JOBS_PER_TENANT = 25


class RouteQueuePublishError(RuntimeError):
    def __init__(self, job_id: str) -> None:
        super().__init__(FAILED_QUEUE_ERROR)
        self.job_id = job_id


def resolve_effective_tenant_id(auth: AuthContext, requested_tenant_id: str) -> str:
    return requested_tenant_id if auth.is_super_admin else auth.tenant_id


def _command_affected_rows(result: Any) -> int | None:
    if not isinstance(result, str):
        return None
    try:
        return int(result.rsplit(" ", 1)[-1])
    except (IndexError, ValueError):
        return None


async def fetch_shipments_for_tenant(tenant_id: str, shipment_ids: list[str]) -> set[str]:
    if not shipment_ids:
        return set()
    rows = await db.fetch(
        """
        select id
        from shipments
        where "tenantId" = $1 and id = any($2::text[])
        """,
        tenant_id,
        shipment_ids,
    )
    return {str(row["id"]) for row in rows}


async def verify_shipments_for_tenant(tenant_id: str, shipment_ids: list[str]) -> None:
    found = await fetch_shipments_for_tenant(tenant_id, shipment_ids)
    if found != set(shipment_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Shipment not found")


async def verify_vehicle_for_tenant(tenant_id: str, vehicle_id: str | None, requested_capacity_kg: Decimal) -> None:
    if vehicle_id is None:
        return
    row = await db.fetchrow(
        """
        select id, "isActive", "capacityKg"
        from vehicles
        where id = $1 and "tenantId" = $2
        """,
        vehicle_id,
        tenant_id,
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Vehicle not found")
    vehicle = dict(row)
    if vehicle.get("isActive") is False:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vehicle is unavailable")
    capacity = vehicle.get("capacityKg")
    if capacity is not None and Decimal(str(capacity)) < requested_capacity_kg:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vehicle capacity is too low")


async def find_idempotent_route_job(tenant_id: str, idempotency_key: str | None) -> dict[str, Any] | None:
    if not idempotency_key:
        return None
    row = await db.fetchrow(
        """
        select id, status
        from route_jobs
        where tenant_id = $1 and idempotency_key = $2
        """,
        tenant_id,
        idempotency_key,
    )
    return dict(row) if row else None


async def enforce_active_route_job_limit(tenant_id: str) -> None:
    row = await db.fetchrow(
        """
        select count(*) as active_count
        from route_jobs
        where tenant_id = $1 and status in ('QUEUED', 'PROCESSING')
        """,
        tenant_id,
    )
    active_count = int(row["active_count"] or 0) if row else 0
    if active_count >= MAX_ACTIVE_ROUTE_JOBS_PER_TENANT:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="Too many active route jobs")


async def create_route_job(payload: OptimizeRouteRequest, tenant_id: str, job_id: str) -> None:
    await db.execute(
        """
        insert into route_jobs (id, tenant_id, vehicle_id, status, result, idempotency_key, updated_at)
        values ($1, $2, $3, 'QUEUED', $4::jsonb, $5, now())
        """,
        job_id,
        tenant_id,
        payload.vehicleId,
        db.json_dumps(
            {
                "source": "api",
                "stopCount": len(payload.stops),
                "totalWeightKg": str(sum((stop.weightKg for stop in payload.stops), Decimal("0"))),
            }
        ),
        payload.idempotencyKey,
    )


async def mark_route_failed(job_id: str, tenant_id: str, error_message: str) -> None:
    await db.execute(
        """
        update route_jobs
        set status = 'FAILED',
            error_message = $3,
            updated_at = now()
        where id = $1 and tenant_id = $2
        """,
        job_id,
        tenant_id,
        error_message[:4000],
    )


def worker_payload(payload: OptimizeRouteRequest, *, job_id: str, tenant_id: str) -> dict[str, Any]:
    return {
        "jobId": job_id,
        "tenantId": tenant_id,
        "vehicleId": payload.vehicleId,
        "depot": payload.depot.model_dump(),
        "stops": [
            {
                **stop.model_dump(exclude_none=True),
                "weightKg": float(stop.weightKg),
            }
            for stop in payload.stops
        ],
        "vehicleCapacityKg": float(payload.vehicleCapacityKg),
    }


async def queue_route_optimization(
    *,
    payload: OptimizeRouteRequest,
    auth: AuthContext,
    publisher: Any,
) -> dict[str, str]:
    tenant_id = resolve_effective_tenant_id(auth, payload.tenantId)
    shipment_ids = [stop.shipmentId for stop in payload.stops]
    await verify_shipments_for_tenant(tenant_id, shipment_ids)
    await verify_vehicle_for_tenant(tenant_id, payload.vehicleId, payload.vehicleCapacityKg)
    await enforce_active_route_job_limit(tenant_id)

    existing = await find_idempotent_route_job(tenant_id, payload.idempotencyKey)
    if existing is not None:
        return {"jobId": str(existing["id"]), "status": "queued" if str(existing["status"]).upper() == "QUEUED" else normalize_status(str(existing["status"])).lower()}

    job_id = str(uuid4())
    await create_route_job(payload, tenant_id, job_id)
    try:
        publisher("fauward:routes:optimize", worker_payload(payload, job_id=job_id, tenant_id=tenant_id))
    except Exception as exc:
        logger.exception("route_queue_publish_failed", extra={"_job_id": job_id, "_tenant_id": tenant_id})
        await mark_route_failed(job_id, tenant_id, str(exc))
        raise RouteQueuePublishError(job_id) from exc
    return {"jobId": job_id, "status": "queued"}


def normalize_status(raw_status: str) -> RouteStatus:
    normalized = raw_status.upper()
    if normalized in {"OPTIMISED", "OPTIMIZED", "READY", "DONE", "COMPLETED"}:
        return "COMPLETED"
    if normalized in {"RUNNING", "PROCESSING"}:
        return "PROCESSING"
    if normalized == "QUEUED":
        return "QUEUED"
    return "FAILED"


async def fetch_route_job_for_auth(job_id: str, auth: AuthContext) -> dict[str, Any]:
    if auth.is_super_admin:
        row = await db.fetchrow(
            """
            select id, tenant_id, status, ordered_stops, total_distance_m,
                   estimated_duration_s, error_message, updated_at
            from route_jobs
            where id = $1
            """,
            job_id,
        )
    else:
        row = await db.fetchrow(
            """
            select id, tenant_id, status, ordered_stops, total_distance_m,
                   estimated_duration_s, error_message, updated_at
            from route_jobs
            where id = $1 and tenant_id = $2
            """,
            job_id,
            auth.tenant_id,
        )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Route job not found")
    return dict(row)


def route_status_response(row: dict[str, Any], auth: AuthContext) -> dict[str, Any]:
    status_value = normalize_status(str(row["status"]))
    response: dict[str, Any] = {
        "jobId": str(row["id"]),
        "status": status_value,
        "orderedStops": row.get("ordered_stops") or [],
        "totalDistanceM": int(row.get("total_distance_m") or 0),
        "estimatedDurationS": int(row.get("estimated_duration_s") or 0),
        "error": None,
        "updatedAt": row["updated_at"].isoformat() if hasattr(row.get("updated_at"), "isoformat") else row.get("updated_at"),
    }
    if status_value == "FAILED" and row.get("error_message"):
        response["error"] = str(row["error_message"]) if auth.is_super_admin else NORMAL_TENANT_ERROR
    return response


async def mark_route_processing(job_id: str, tenant_id: str) -> None:
    result = await db.execute(
        """
        update route_jobs
        set status = 'PROCESSING',
            error_message = null,
            updated_at = now()
        where id = $1 and tenant_id = $2
        """,
        job_id,
        tenant_id,
    )
    if _command_affected_rows(result) == 0:
        raise ValueError("Route job not found")


async def complete_route_job(job_id: str, tenant_id: str, vehicle_id: str | None, result: dict[str, Any]) -> None:
    command = await db.execute(
        """
        update route_jobs
        set vehicle_id = $3,
            ordered_stops = $4::jsonb,
            total_distance_m = $5,
            estimated_duration_s = $6,
            status = 'COMPLETED',
            result = $7::jsonb,
            error_message = null,
            updated_at = now()
        where id = $1 and tenant_id = $2
        """,
        job_id,
        tenant_id,
        vehicle_id,
        db.json_dumps(result["orderedStops"]),
        result["totalDistanceM"],
        result["estimatedDurationS"],
        db.json_dumps(result),
    )
    if _command_affected_rows(command) == 0:
        raise ValueError("Route job not found")


async def log_route_optimization_audit(
    *,
    auth: AuthContext,
    payload: OptimizeRouteRequest,
    tenant_id: str,
    job_id: str,
    request: Request,
) -> None:
    try:
        if not await db.table_exists("audit_log"):
            return
        total_weight = sum((stop.weightKg for stop in payload.stops), Decimal("0"))
        await db.execute(
            """
            insert into audit_log (
              id, "tenantId", "actorId", "actorType", "actorIp",
              action, "resourceType", "resourceId", metadata, timestamp
            )
            values ($1, $2, $3, $4, $5, 'route_optimization_queued', 'route_job', $6, $7::jsonb, now())
            """,
            str(uuid4()),
            tenant_id,
            auth.actor_id or auth.user_id,
            "SUPER_ADMIN" if auth.is_super_admin else "API",
            request.client.host if request.client else None,
            job_id,
            db.json_dumps(
                {
                    "tenantId": tenant_id,
                    "vehicleId": payload.vehicleId,
                    "jobId": job_id,
                    "stopCount": len(payload.stops),
                    "totalWeightKg": str(total_weight),
                    "apiKeyId": auth.api_key_id,
                }
            ),
        )
    except Exception:
        logger.warning("route_optimization_audit_failed", extra={"_job_id": job_id, "_tenant_id": tenant_id})
