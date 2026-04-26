from typing import Annotated, Any, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

import db
from api.auth import AuthContext, require_bearer_token
from lib.hs_lookup import fuzzy_match
from lib.tax_engine import estimate_landed_cost
from workers import publish_job

router = APIRouter(prefix="/customs", tags=["customs"])


class DutyEstimateRequest(BaseModel):
    originCountry: str
    destCountry: str
    hsCode: str
    declaredValue: float
    currency: str


class DeclarationRequest(BaseModel):
    jobId: str = Field(default_factory=lambda: str(uuid4()))
    tenantId: str
    shipmentId: str
    declarationType: Literal["uk_cds", "eu_aes"]
    shipmentData: dict[str, Any] = Field(default_factory=dict)


@router.post("/hs-lookup")
async def hs_lookup(
    _: Annotated[AuthContext, Depends(require_bearer_token)],
    description: str = Query(..., min_length=2),
) -> dict[str, Any]:
    return {"description": description, "matches": fuzzy_match(description, limit=5)}


@router.post("/duty-estimate")
async def duty_estimate(
    payload: DutyEstimateRequest,
    _: Annotated[AuthContext, Depends(require_bearer_token)],
) -> dict[str, Any]:
    return estimate_landed_cost(
        origin_country=payload.originCountry,
        dest_country=payload.destCountry,
        hs_code=payload.hsCode,
        declared_value=payload.declaredValue,
        currency=payload.currency,
    )


@router.post("/declaration")
async def declaration(
    payload: DeclarationRequest,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
) -> dict[str, str]:
    if payload.tenantId != auth.tenant_id and not auth.is_super_admin:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    await db.execute(
        """
        insert into customs_declarations (id, tenant_id, shipment_id, declaration_type, status, metadata, updated_at)
        values ($1, $2, $3, $4, 'QUEUED', $5::jsonb, now())
        on conflict (id) do update
        set status = 'QUEUED',
            error_message = null,
            metadata = excluded.metadata,
            updated_at = now()
        """,
        payload.jobId,
        payload.tenantId,
        payload.shipmentId,
        payload.declarationType,
        db.json_dumps({"source": "api"}),
    )
    publish_job("fauward:customs:generate", payload.model_dump())
    return {"jobId": payload.jobId, "status": "queued"}
