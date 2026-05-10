from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request

from api.auth import AuthContext, require_scope
from main import limiter
from schemas.pricing import PricingQuoteRequest, PricingQuoteResponse
from services.analytics_service import tenant_rate_limit_key
from services.pricing_service import create_pricing_quote

router = APIRouter(prefix="/pricing", tags=["pricing"])


@router.post("/quote", response_model=PricingQuoteResponse)
@limiter.limit("30/minute")
@limiter.limit("120/hour", key_func=tenant_rate_limit_key)
async def quote(
    request: Request,
    payload: PricingQuoteRequest,
    auth: Annotated[AuthContext, Depends(require_scope("pricing:quote"))],
) -> dict[str, Any]:
    return await create_pricing_quote(payload=payload, auth=auth, request=request)
