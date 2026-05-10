from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from api.auth import AuthContext, require_bearer_token, require_super_admin
from celery_app import celery_app
from main import limiter
from schemas.ml import (
    AnomalyResponse,
    CustomsRiskResponse,
    CustomerLtvResponse,
    DemandForecastResponse,
    EtaPredictionResponse,
    FeedbackRequest,
    FeedbackResponse,
    LeadPredictionListResponse,
    ModelStatusResponse,
    NextBestActionResponse,
    PredictionListResponse,
    PricingRecommendationRequest,
    PricingRecommendationResponse,
    RetrainResponse,
    RetrainStatusResponse,
    RouteRiskResponse,
    SlaRiskResponse,
    TicketClassificationRequest,
    TicketClassificationResponse,
)
from services.ml_feedback import record_feedback
from services.ml_models import celery_status_payload, list_model_status, log_retrain_audit, retrain_task_for
from services.ml_predictions import (
    MlForbiddenError,
    MlNotFoundError,
    build_anomaly_response,
    build_customs_response,
    build_customer_ltv_response,
    build_demand_response,
    build_eta_response,
    build_route_response,
    build_sla_response,
    get_global_route_prediction,
    get_prediction_for_entity,
    list_lead_predictions,
    list_tenant_predictions,
    require_tenant_scope,
    verify_customer_scope,
)
from services.ml_recommendations import classify_ticket, next_best_action, pricing_recommendation

router = APIRouter(prefix="/ml", tags=["ml"])


def _raise_api_error(exc: Exception, not_found_detail: str = "Prediction not found") -> None:
    if isinstance(exc, MlNotFoundError):
        raise HTTPException(status_code=404, detail=not_found_detail) from exc
    if isinstance(exc, MlForbiddenError):
        raise HTTPException(status_code=403, detail="Tenant mismatch") from exc
    raise exc


@router.get("/shipment-risk/{shipment_id}")
async def shipment_risk(
    shipment_id: str,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
) -> dict[str, Any]:
    try:
        row = await get_prediction_for_entity(
            entity_type="shipment",
            entity_id=shipment_id,
            model_name="delivery_delay",
            auth=auth,
        )
        return row["payload"]
    except Exception as exc:
        _raise_api_error(exc, "Shipment risk prediction not found")
        raise


@router.get("/churn-risk/{tenant_id}")
async def tenant_churn_risk(
    tenant_id: str,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
) -> dict[str, Any]:
    try:
        row = await get_prediction_for_entity(
            entity_type="tenant",
            entity_id=tenant_id,
            model_name="tenant_churn",
            tenant_id=tenant_id,
            auth=auth,
        )
        return row["payload"]
    except Exception as exc:
        _raise_api_error(exc, "Tenant churn prediction not found")
        raise


@router.get("/predictions/{tenant_id}", response_model=PredictionListResponse)
async def tenant_predictions(
    tenant_id: str,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
    limit: int = Query(default=100, ge=1, le=250),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    try:
        return {"predictions": await list_tenant_predictions(tenant_id=tenant_id, auth=auth, limit=limit, offset=offset)}
    except Exception as exc:
        _raise_api_error(exc)
        raise


@router.get("/leads", response_model=LeadPredictionListResponse)
async def leads(
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
    limit: int = Query(default=100, ge=1, le=250),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    return {"leads": await list_lead_predictions(auth=auth, limit=limit, offset=offset)}


@router.get("/eta/{shipment_id}", response_model=EtaPredictionResponse)
async def eta_prediction(
    shipment_id: str,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
) -> dict[str, Any]:
    try:
        row = await get_prediction_for_entity(
            entity_type="shipment",
            entity_id=shipment_id,
            model_name="eta_prediction",
            auth=auth,
        )
        return build_eta_response(row)
    except Exception as exc:
        _raise_api_error(exc, "ETA prediction not found")
        raise


@router.get("/sla-risk/{shipment_id}", response_model=SlaRiskResponse)
async def sla_risk(
    shipment_id: str,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
) -> dict[str, Any]:
    try:
        row = await get_prediction_for_entity(
            entity_type="shipment",
            entity_id=shipment_id,
            model_name="sla_breach",
            auth=auth,
        )
        return build_sla_response(row)
    except Exception as exc:
        _raise_api_error(exc, "SLA risk prediction not found")
        raise


@router.get("/customs-risk/{shipment_id}", response_model=CustomsRiskResponse)
async def customs_risk(
    shipment_id: str,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
) -> dict[str, Any]:
    try:
        row = await get_prediction_for_entity(
            entity_type="shipment",
            entity_id=shipment_id,
            model_name="customs_delay",
            auth=auth,
        )
        return build_customs_response(row)
    except Exception as exc:
        _raise_api_error(exc, "Customs risk prediction not found")
        raise


@router.get("/route-risk", response_model=RouteRiskResponse)
async def route_risk_by_pair(
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
    origin: str = Query(..., min_length=1),
    destination: str = Query(..., min_length=1),
) -> dict[str, Any]:
    try:
        row = await get_global_route_prediction(origin, destination)
        return build_route_response(row, origin=origin, destination=destination)
    except Exception as exc:
        _raise_api_error(exc, "Route risk prediction not found")
        raise


@router.get("/route-risk/{route_id}", response_model=RouteRiskResponse)
async def route_risk(
    route_id: str,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
) -> dict[str, Any]:
    try:
        row = await get_prediction_for_entity(
            entity_type="route",
            entity_id=route_id,
            model_name="route_risk",
            auth=auth,
        )
        return build_route_response(row)
    except Exception as exc:
        _raise_api_error(exc, "Route risk prediction not found")
        raise


@router.get("/anomaly/{shipment_id}", response_model=AnomalyResponse)
async def shipment_anomaly(
    shipment_id: str,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
) -> dict[str, Any]:
    try:
        row = await get_prediction_for_entity(
            entity_type="shipment",
            entity_id=shipment_id,
            model_name="shipment_anomaly",
            auth=auth,
        )
        return build_anomaly_response(row)
    except Exception as exc:
        _raise_api_error(exc, "Shipment anomaly prediction not found")
        raise


@router.get("/demand-forecast/{tenant_id}", response_model=DemandForecastResponse)
async def demand_forecast(
    tenant_id: str,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
) -> dict[str, Any]:
    try:
        row = await get_prediction_for_entity(
            entity_type="tenant",
            entity_id=tenant_id,
            model_name="demand_forecast",
            tenant_id=tenant_id,
            auth=auth,
        )
        return build_demand_response(row)
    except Exception as exc:
        _raise_api_error(exc, "Demand forecast not found")
        raise


@router.post("/pricing-recommendation", response_model=PricingRecommendationResponse)
async def pricing_recommendation_endpoint(
    payload: PricingRecommendationRequest,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
) -> dict[str, Any]:
    try:
        return await pricing_recommendation(payload, auth)
    except Exception as exc:
        _raise_api_error(exc, "Pricing recommendation unavailable")
        raise


@router.get("/customer-ltv/{customer_id}", response_model=CustomerLtvResponse)
async def customer_ltv(
    customer_id: str,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
) -> dict[str, Any]:
    try:
        tenant_id = await verify_customer_scope(customer_id, auth)
        row = await get_prediction_for_entity(
            entity_type="customer",
            entity_id=customer_id,
            model_name="customer_ltv",
            tenant_id=tenant_id,
            auth=auth,
        )
        return build_customer_ltv_response(row)
    except Exception as exc:
        _raise_api_error(exc, "Customer LTV prediction not found")
        raise


@router.post("/classify-ticket", response_model=TicketClassificationResponse)
async def classify_ticket_endpoint(
    payload: TicketClassificationRequest,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
) -> dict[str, Any]:
    try:
        return classify_ticket(payload, auth)
    except Exception as exc:
        _raise_api_error(exc)
        raise


@router.get("/recommend-action/{shipment_id}", response_model=NextBestActionResponse)
async def recommend_action(
    shipment_id: str,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
) -> dict[str, Any]:
    try:
        return await next_best_action(shipment_id, auth)
    except Exception as exc:
        _raise_api_error(exc, "Next-best-action recommendation not found")
        raise


@router.post("/feedback", response_model=FeedbackResponse)
async def feedback(
    payload: FeedbackRequest,
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
) -> dict[str, str]:
    try:
        await record_feedback(payload, auth)
        return {"status": "recorded"}
    except Exception as exc:
        _raise_api_error(exc)
        raise


@router.get("/models", response_model=ModelStatusResponse)
async def models(auth: Annotated[AuthContext, Depends(require_bearer_token)]) -> dict[str, Any]:
    return {"models": await list_model_status(auth)}


@router.get("/retrain/status/{task_id}", response_model=RetrainStatusResponse)
async def retrain_status(
    task_id: str,
    _: Annotated[AuthContext, Depends(require_super_admin)],
) -> dict[str, Any]:
    result = celery_app.AsyncResult(task_id)
    return celery_status_payload(task_id, result.state, result.result)


@router.post("/retrain/{model_name}", response_model=RetrainResponse)
@limiter.limit("30/minute")
async def retrain(
    request: Request,
    model_name: str,
    auth: Annotated[AuthContext, Depends(require_super_admin)],
) -> dict[str, str]:
    task_name = retrain_task_for(model_name)
    if not task_name:
        raise HTTPException(status_code=400, detail="Model retraining is not supported")
    result = celery_app.send_task(task_name, queue="ml")
    task_id = str(result.id)
    actor_ip = request.client.host if request.client else None
    await log_retrain_audit(auth=auth, model_name=model_name, task_id=task_id, actor_ip=actor_ip)
    return {"modelName": model_name, "status": "queued", "taskId": task_id}
