from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from api.auth import AuthContext, require_scope
from main import limiter
from schemas.routes import OptimizeRouteRequest, RouteQueuedResponse, RouteStatusResponse
from services.analytics_service import tenant_rate_limit_key
from services.route_jobs import (
    FAILED_QUEUE_ERROR,
    RouteQueuePublishError,
    fetch_route_job_for_auth,
    log_route_optimization_audit,
    queue_route_optimization,
    route_status_response,
    resolve_effective_tenant_id,
)
from workers import publish_job

router = APIRouter(prefix="/routes", tags=["routes"])


@router.post("/optimize", response_model=RouteQueuedResponse, status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("20/minute")
@limiter.limit("80/hour", key_func=tenant_rate_limit_key)
async def optimize_route(
    request: Request,
    payload: OptimizeRouteRequest,
    auth: Annotated[AuthContext, Depends(require_scope("routes:optimize"))],
) -> dict[str, str]:
    tenant_id = resolve_effective_tenant_id(auth, payload.tenantId)
    try:
        response = await queue_route_optimization(payload=payload, auth=auth, publisher=publish_job)
    except RouteQueuePublishError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"jobId": exc.job_id, "error": FAILED_QUEUE_ERROR},
        ) from exc
    await log_route_optimization_audit(auth=auth, payload=payload, tenant_id=tenant_id, job_id=response["jobId"], request=request)
    return response


@router.get("/{job_id}", response_model=RouteStatusResponse)
@limiter.limit("60/minute")
@limiter.limit("240/hour", key_func=tenant_rate_limit_key)
async def route_status(
    request: Request,
    job_id: str,
    response: Response,
    auth: Annotated[AuthContext, Depends(require_scope("routes:read"))],
) -> dict[str, Any]:
    row = await fetch_route_job_for_auth(job_id, auth)
    body = route_status_response(row, auth)
    if body["status"] in {"QUEUED", "PROCESSING"}:
        response.status_code = status.HTTP_202_ACCEPTED
    return body
