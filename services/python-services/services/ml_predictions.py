from collections.abc import Iterable
from typing import Any

import db
from api.auth import AuthContext
from repositories.predictions import get_prediction, list_lead_scores, list_predictions_for_tenant


class MlNotFoundError(Exception):
    pass


class MlForbiddenError(Exception):
    pass


def safe_payload_dict(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, dict) else {}


def _list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [str(item) for item in value]
    return []


def _prediction_dict(row: Any) -> dict[str, Any]:
    data = dict(row)
    return {
        "tenant_id": data.get("tenant_id"),
        "entity_type": data.get("entity_type"),
        "entity_id": data.get("entity_id"),
        "model_name": data.get("model_name"),
        "score": float(data.get("score") or 0),
        "label": str(data.get("label") or ""),
        "payload": safe_payload_dict(data.get("payload")),
        "created_at": data.get("created_at"),
        "updated_at": data.get("updated_at"),
    }


def require_tenant_scope(auth: AuthContext, tenant_id: str) -> None:
    if tenant_id != auth.tenant_id and not auth.is_super_admin:
        raise MlForbiddenError("Tenant mismatch")


async def get_prediction_for_entity(
    *,
    entity_type: str,
    entity_id: str,
    model_name: str,
    auth: AuthContext,
    tenant_id: str | None = None,
) -> dict[str, Any]:
    effective_tenant_id: str | None = None
    if tenant_id is not None:
        require_tenant_scope(auth, tenant_id)
        effective_tenant_id = tenant_id
    elif not auth.is_super_admin:
        effective_tenant_id = auth.tenant_id
    row = await get_prediction(
        entity_type=entity_type,
        entity_id=entity_id,
        model_name=model_name,
        tenant_id=effective_tenant_id,
    )
    if not row:
        raise MlNotFoundError("Prediction not found")
    return _prediction_dict(row)


async def get_optional_prediction_for_entity(
    *,
    entity_type: str,
    entity_id: str,
    model_name: str,
    auth: AuthContext,
    tenant_id: str | None = None,
) -> dict[str, Any] | None:
    try:
        return await get_prediction_for_entity(
            entity_type=entity_type,
            entity_id=entity_id,
            model_name=model_name,
            auth=auth,
            tenant_id=tenant_id,
        )
    except MlNotFoundError:
        return None


async def get_global_route_prediction(origin: str, destination: str) -> dict[str, Any]:
    route_id = normalize_route_id(origin, destination)
    row = await get_prediction(entity_type="route", entity_id=route_id, model_name="route_risk", tenant_id=None, global_only=True)
    if not row:
        raise MlNotFoundError("Route risk prediction not found")
    return _prediction_dict(row)


async def list_tenant_predictions(
    *,
    tenant_id: str,
    auth: AuthContext,
    limit: int,
    offset: int,
) -> list[dict[str, Any]]:
    require_tenant_scope(auth, tenant_id)
    rows = await list_predictions_for_tenant(tenant_id=tenant_id, limit=limit, offset=offset)
    return [
        {
            "entityType": row["entity_type"],
            "entityId": row["entity_id"],
            "modelName": row["model_name"],
            "score": float(row["score"] or 0),
            "label": row["label"],
            "payload": safe_payload_dict(row["payload"]),
            "updatedAt": row["updated_at"],
        }
        for row in rows
    ]


async def list_lead_predictions(
    *,
    auth: AuthContext,
    limit: int,
    offset: int,
) -> list[dict[str, Any]]:
    rows = await list_lead_scores(tenant_id=None if auth.is_super_admin else auth.tenant_id, limit=limit, offset=offset)
    return [
        {
            "leadId": row["entity_id"],
            "tenantId": row["tenant_id"],
            "company": row["company"],
            "email": row["email"],
            "score": float(row["score"] or 0),
            "label": row["label"],
            "payload": safe_payload_dict(row["payload"]),
        }
        for row in rows
    ]


async def verify_customer_scope(customer_id: str, auth: AuthContext) -> str:
    args: list[Any] = [customer_id]
    tenant_clause = ""
    if not auth.is_super_admin:
        tenant_clause = 'and "tenantId" = $2'
        args.append(auth.tenant_id)
    row = await db.fetchrow(
        f"""
        select "tenantId" as tenant_id
        from users
        where id = $1
          {tenant_clause}
        limit 1
        """,
        *args,
    )
    if not row:
        raise MlNotFoundError("Customer not found")
    return str(row["tenant_id"])


def normalize_route_id(origin: str, destination: str) -> str:
    return f"{origin.strip().upper()}:{destination.strip().upper()}"


def build_eta_response(row: dict[str, Any]) -> dict[str, Any]:
    payload = row["payload"]
    return {
        "shipmentId": row["entity_id"],
        "tenantId": row["tenant_id"],
        "eta": payload.get("eta"),
        "confidence": float(payload.get("confidence", row["score"]) or 0),
        "riskLevel": str(payload.get("riskLevel") or payload.get("risk_level") or row["label"]).lower(),
        "factors": _list(payload.get("factors")),
        "updatedAt": row["updated_at"],
    }


def build_sla_response(row: dict[str, Any]) -> dict[str, Any]:
    payload = row["payload"]
    score = row["score"]
    return {
        "shipmentId": row["entity_id"],
        "tenantId": row["tenant_id"],
        "score": score,
        "label": str(row["label"]).lower(),
        "likelyToBreach": bool(payload.get("likelyToBreach", payload.get("likely_to_breach", score >= 0.5))),
        "factors": _list(payload.get("factors")),
        "recommendedAction": str(payload.get("recommendedAction") or payload.get("recommended_action") or ""),
        "updatedAt": row["updated_at"],
    }


def build_customs_response(row: dict[str, Any]) -> dict[str, Any]:
    payload = row["payload"]
    score = row["score"]
    return {
        "shipmentId": row["entity_id"],
        "tenantId": row["tenant_id"],
        "score": score,
        "label": str(row["label"]).lower(),
        "likelyCustomsDelay": bool(
            payload.get("likelyCustomsDelay", payload.get("likely_customs_delay", score >= 0.5))
        ),
        "factors": _list(payload.get("factors")),
        "updatedAt": row["updated_at"],
    }


def build_route_response(row: dict[str, Any], *, origin: str | None = None, destination: str | None = None) -> dict[str, Any]:
    payload = row["payload"]
    return {
        "routeId": str(payload.get("routeId") or payload.get("route_id") or row["entity_id"]),
        "origin": origin or payload.get("origin"),
        "destination": destination or payload.get("destination"),
        "score": row["score"],
        "label": str(row["label"]).lower(),
        "mainRisks": _list(payload.get("mainRisks") or payload.get("main_risks") or payload.get("factors")),
        "updatedAt": row["updated_at"],
    }


def build_anomaly_response(row: dict[str, Any]) -> dict[str, Any]:
    payload = row["payload"]
    score = row["score"]
    return {
        "shipmentId": row["entity_id"],
        "tenantId": row["tenant_id"],
        "score": score,
        "label": str(row["label"]).lower(),
        "isAnomaly": bool(payload.get("isAnomaly", payload.get("is_anomaly", score >= 0.65))),
        "signals": _list(payload.get("signals")),
        "updatedAt": row["updated_at"],
    }


def build_demand_response(row: dict[str, Any]) -> dict[str, Any]:
    payload = row["payload"]
    return {
        "tenantId": row["entity_id"],
        "next7Days": int(payload.get("next7Days", payload.get("next_7_days", 0)) or 0),
        "next30Days": int(payload.get("next30Days", payload.get("next_30_days", 0)) or 0),
        "trend": str(payload.get("trend") or "stable"),
        "confidence": float(payload.get("confidence", row["score"]) or 0),
        "updatedAt": row["updated_at"],
    }


def build_customer_ltv_response(row: dict[str, Any]) -> dict[str, Any]:
    payload = row["payload"]
    return {
        "customerId": row["entity_id"],
        "tenantId": row["tenant_id"],
        "predictedLtv": float(payload.get("predictedLtv", payload.get("predicted_ltv", 0)) or 0),
        "currency": str(payload.get("currency") or "GBP"),
        "segment": str(payload.get("segment") or row["label"] or "unknown"),
        "confidence": float(payload.get("confidence", row["score"]) or 0),
        "factors": _list(payload.get("factors")),
        "updatedAt": row["updated_at"],
    }


def build_next_best_action_response(row: dict[str, Any]) -> dict[str, Any]:
    payload = row["payload"]
    return {
        "shipmentId": row["entity_id"],
        "tenantId": row["tenant_id"],
        "recommendedAction": str(payload.get("recommendedAction") or payload.get("recommended_action") or row["label"]),
        "priority": str(payload.get("priority") or row["label"] or "normal").lower(),
        "reason": str(payload.get("reason") or ""),
        "confidence": float(payload.get("confidence", row["score"]) or 0),
        "sourceSignals": _list(payload.get("sourceSignals") or payload.get("source_signals")),
        "updatedAt": row["updated_at"],
    }


def highest_score(rows: Iterable[dict[str, Any]]) -> float:
    return max((float(row["score"]) for row in rows), default=0.0)
