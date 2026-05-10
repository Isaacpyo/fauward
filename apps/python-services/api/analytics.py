from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse

from api.auth import AuthContext, require_bearer_token, require_super_admin
from main import limiter
from schemas.analytics import AnalyticsSummaryResponse, ChurnRiskResponse, CohortResponse
from services.analytics_service import (
    DEFAULT_COHORT_LIMIT,
    MAX_COHORT_LIMIT,
    analytics_event_stream,
    analytics_summary,
    churn_risk_tenants,
    cohort_metrics,
    resolve_effective_tenant_id,
    tenant_rate_limit_key,
)

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/summary", response_model=AnalyticsSummaryResponse)
@limiter.limit("60/minute", key_func=tenant_rate_limit_key)
async def summary(
    request: Request,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
    tenantId: str = Query(..., min_length=1),
    dateFrom: date | None = Query(default=None),
    dateTo: date | None = Query(default=None),
) -> dict[str, Any]:
    return await analytics_summary(auth=auth, tenant_id=tenantId, date_from=dateFrom, date_to=dateTo)


@router.get("/cohorts", response_model=CohortResponse)
@limiter.limit("30/minute", key_func=tenant_rate_limit_key)
async def cohorts(
    request: Request,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
    tenantId: str = Query(..., min_length=1),
    limit: int = Query(default=DEFAULT_COHORT_LIMIT, ge=1, le=MAX_COHORT_LIMIT),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    return await cohort_metrics(auth=auth, tenant_id=tenantId, limit=limit, offset=offset)


@router.get("/live")
@limiter.limit("10/minute", key_func=tenant_rate_limit_key)
async def analytics_live(
    request: Request,
    tenantId: str,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
) -> StreamingResponse:
    effective_tenant_id = resolve_effective_tenant_id(auth, tenantId)
    return StreamingResponse(
        analytics_event_stream(tenant_id=effective_tenant_id, request=request),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/churn-risk", response_model=ChurnRiskResponse)
@limiter.limit("30/minute", key_func=tenant_rate_limit_key)
async def churn_risk(
    request: Request,
    _: Annotated[AuthContext, Depends(require_super_admin)],
) -> dict[str, Any]:
    return await churn_risk_tenants()
