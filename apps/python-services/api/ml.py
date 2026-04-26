from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, HTTPException

import db
from api.auth import AuthContext, require_bearer_token, require_super_admin
from celery_app import celery_app

router = APIRouter(prefix="/ml", tags=["ml"])


async def _prediction(entity_type: str, entity_id: str, model_name: str) -> dict[str, Any] | None:
    row = await db.fetchrow(
        """
        select tenant_id, score, label, payload
        from prediction_results
        where entity_type = $1 and entity_id = $2 and model_name = $3
        """,
        entity_type,
        entity_id,
        model_name,
    )
    return dict(row) if row else None


@router.get("/shipment-risk/{shipment_id}")
async def shipment_risk(
    shipment_id: str,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
) -> dict[str, Any]:
    row = await _prediction("shipment", shipment_id, "delivery_delay")
    if not row:
        raise HTTPException(status_code=404, detail="Shipment risk prediction not found")
    if row["tenant_id"] != auth.tenant_id and not auth.is_super_admin:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    return row["payload"]


@router.get("/churn-risk/{tenant_id}")
async def tenant_churn_risk(
    tenant_id: str,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
) -> dict[str, Any]:
    if tenant_id != auth.tenant_id and not auth.is_super_admin:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    row = await _prediction("tenant", tenant_id, "tenant_churn")
    if not row:
        raise HTTPException(status_code=404, detail="Tenant churn prediction not found")
    return row["payload"]


@router.get("/predictions/{tenant_id}")
async def tenant_predictions(
    tenant_id: str,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
) -> dict[str, Any]:
    if tenant_id != auth.tenant_id and not auth.is_super_admin:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    rows = await db.fetch(
        """
        select entity_type, entity_id, model_name, score, label, payload, updated_at
        from prediction_results
        where tenant_id = $1
        order by updated_at desc
        limit 100
        """,
        tenant_id,
    )
    return {"predictions": [dict(row) for row in rows]}


@router.get("/leads")
async def leads(auth: Annotated[AuthContext, Depends(require_bearer_token)]) -> dict[str, Any]:
    rows = await db.fetch(
        """
        select pr.entity_id, pr.tenant_id, pr.score, pr.label, pr.payload, l.company, l.email
        from prediction_results pr
        left join leads l on l.id = pr.entity_id
        where pr.entity_type = 'lead'
          and pr.model_name = 'lead_score'
          and ($1::text is null or pr.tenant_id = $1)
        order by pr.score desc
        """,
        None if auth.is_super_admin else auth.tenant_id,
    )
    return {
        "leads": [
            {
                "leadId": row["entity_id"],
                "tenantId": row["tenant_id"],
                "company": row["company"],
                "email": row["email"],
                **dict(row["payload"]),
            }
            for row in rows
        ]
    }


@router.post("/retrain/{model_name}")
async def retrain(
    model_name: Literal["delivery_delay", "tenant_churn", "lead_score"],
    _: Annotated[AuthContext, Depends(require_super_admin)],
) -> dict[str, str]:
    task_map = {
        "delivery_delay": "workers.ml_worker.train_delay_model",
        "tenant_churn": "workers.ml_worker.train_churn_model",
        "lead_score": "workers.ml_worker.train_lead_model",
    }
    celery_app.send_task(task_map[model_name], queue="ml")
    return {"modelName": model_name, "status": "queued"}
