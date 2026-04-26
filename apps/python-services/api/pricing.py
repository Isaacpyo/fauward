from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from api.auth import AuthContext, require_bearer_token
from workers.pricing_worker import evaluate_quote

router = APIRouter(prefix="/pricing", tags=["pricing"])


class PricingQuoteRequest(BaseModel):
    tenantId: str
    originPostcode: str
    destPostcode: str
    weightKg: float
    promoCode: str | None = None


@router.post("/quote")
async def quote(
    payload: PricingQuoteRequest,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
) -> dict[str, Any]:
    if payload.tenantId != auth.tenant_id and not auth.is_super_admin:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    return await evaluate_quote(
        tenant_id=payload.tenantId,
        origin_postcode=payload.originPostcode,
        dest_postcode=payload.destPostcode,
        weight_kg=payload.weightKg,
        promo_code=payload.promoCode,
    )
