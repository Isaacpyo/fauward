from typing import Annotated, Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

import db
from api.auth import AuthContext, require_bearer_token
from workers import publish_job

router = APIRouter(prefix="/routes", tags=["routes"])


class Point(BaseModel):
    lat: float
    lng: float


class Stop(BaseModel):
    shipmentId: str
    lat: float
    lng: float
    timeWindowStart: str | None = None
    timeWindowEnd: str | None = None
    weightKg: float = 0


class OptimizeRouteRequest(BaseModel):
    jobId: str = Field(default_factory=lambda: str(uuid4()))
    tenantId: str
    vehicleId: str | None = None
    depot: Point
    stops: list[Stop]
    vehicleCapacityKg: float


@router.post("/optimize")
async def optimize_route(
    payload: OptimizeRouteRequest,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
) -> dict[str, str]:
    if payload.tenantId != auth.tenant_id and not auth.is_super_admin:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    await db.execute(
        """
        insert into route_jobs (id, tenant_id, vehicle_id, status, result, updated_at)
        values ($1, $2, $3, 'QUEUED', $4::jsonb, now())
        on conflict (id) do update
        set status = 'QUEUED',
            error_message = null,
            result = excluded.result,
            updated_at = now()
        """,
        payload.jobId,
        payload.tenantId,
        payload.vehicleId,
        db.json_dumps({"source": "api"}),
    )
    publish_job("fauward:routes:optimize", payload.model_dump())
    return {"jobId": payload.jobId}


@router.get("/{job_id}")
async def route_status(
    job_id: str,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
) -> dict[str, Any]:
    row = await db.fetchrow(
        """
        select id, tenant_id, ordered_stops, total_distance_m, estimated_duration_s, status, error_message
        from route_jobs
        where id = $1
        """,
        job_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Route job not found")
    if row["tenant_id"] != auth.tenant_id and not auth.is_super_admin:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    return {
        "jobId": row["id"],
        "status": row["status"],
        "orderedStops": row["ordered_stops"],
        "totalDistanceM": row["total_distance_m"],
        "estimatedDurationS": row["estimated_duration_s"],
        "error": row["error_message"],
    }
