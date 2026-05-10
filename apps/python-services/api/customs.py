from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from api.auth import AuthContext, require_scope
from main import limiter
from schemas.customs import (
    DeclarationQueuedResponse,
    DeclarationRequest,
    DeclarationStatusResponse,
    DutyEstimateRequest,
    DutyEstimateResponse,
)
from services.analytics_service import tenant_rate_limit_key
from services.customs_declarations import (
    FAILED_QUEUE_ERROR,
    CustomsQueuePublishError,
    declaration_status_response,
    duty_estimate_response,
    fetch_declaration_for_auth,
    hs_lookup_response,
    log_declaration_audit,
    queue_declaration_generation,
    resolve_effective_tenant_id,
)
from workers import publish_job

router = APIRouter(prefix="/customs", tags=["customs"])


@router.post("/hs-lookup")
@limiter.limit("60/minute", key_func=tenant_rate_limit_key)
async def hs_lookup(
    request: Request,
    _: Annotated[AuthContext, Depends(require_scope("customs:read"))],
    description: str = Query(..., min_length=2, max_length=200),
) -> dict[str, Any]:
    return hs_lookup_response(description)


@router.post("/duty-estimate", response_model=DutyEstimateResponse)
@limiter.limit("60/minute", key_func=tenant_rate_limit_key)
async def duty_estimate(
    request: Request,
    payload: DutyEstimateRequest,
    _: Annotated[AuthContext, Depends(require_scope("customs:estimate"))],
) -> dict[str, Any]:
    return duty_estimate_response(
        origin_country=payload.originCountry,
        dest_country=payload.destCountry,
        hs_code=payload.hsCode,
        declared_value=payload.declaredValue,
        currency=payload.currency,
    )


@router.post("/declaration", response_model=DeclarationQueuedResponse)
@limiter.limit("30/minute", key_func=tenant_rate_limit_key)
async def declaration(
    request: Request,
    payload: DeclarationRequest,
    auth: Annotated[AuthContext, Depends(require_scope("customs:write"))],
) -> dict[str, str]:
    try:
        response = await queue_declaration_generation(payload=payload, auth=auth, publisher=publish_job)
    except CustomsQueuePublishError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"jobId": exc.job_id, "error": FAILED_QUEUE_ERROR},
        ) from exc
    await log_declaration_audit(
        auth=auth,
        payload=payload,
        tenant_id=resolve_effective_tenant_id(auth, payload.tenantId),
        job_id=response["jobId"],
        request=request,
    )
    return response


@router.get("/declaration/status/{job_id}", response_model=DeclarationStatusResponse)
@limiter.limit("60/minute", key_func=tenant_rate_limit_key)
async def declaration_status(
    request: Request,
    job_id: str,
    auth: Annotated[AuthContext, Depends(require_scope("customs:read"))],
) -> dict[str, Any]:
    row = await fetch_declaration_for_auth(job_id, auth)
    return declaration_status_response(row, auth)
