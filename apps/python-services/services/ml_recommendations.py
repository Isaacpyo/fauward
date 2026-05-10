from typing import Any

from api.auth import AuthContext
from models.ml_schemas import PricingRecommendationRequest, TicketClassificationRequest
from services.ml_predictions import (
    MlNotFoundError,
    get_optional_prediction_for_entity,
    get_prediction_for_entity,
    highest_score,
    require_tenant_scope,
    safe_payload_dict,
)


async def pricing_recommendation(payload: PricingRecommendationRequest, auth: AuthContext) -> dict[str, Any]:
    require_tenant_scope(auth, payload.tenantId)
    entity_id = f"{payload.origin.strip().upper()}:{payload.destination.strip().upper()}:{payload.serviceLevel.lower()}"
    prediction = await get_optional_prediction_for_entity(
        entity_type="pricing",
        entity_id=entity_id,
        model_name="pricing_recommendation",
        tenant_id=payload.tenantId,
        auth=auth,
    )
    if prediction:
        data = safe_payload_dict(prediction["payload"])
        return {
            "tenantId": payload.tenantId,
            "recommendedPrice": float(data.get("recommendedPrice", data.get("recommended_price", 0)) or 0),
            "floorPrice": float(data.get("floorPrice", data.get("floor_price", 0)) or 0),
            "ceilingPrice": float(data.get("ceilingPrice", data.get("ceiling_price", 0)) or 0),
            "currency": str(data.get("currency") or payload.currency).upper(),
            "marginEstimate": float(data.get("marginEstimate", data.get("margin_estimate", 0)) or 0),
            "confidence": float(data.get("confidence", prediction["score"]) or 0),
            "reason": str(data.get("reason") or ""),
            "warnings": [str(item) for item in data.get("warnings", [])] if isinstance(data.get("warnings"), list) else [],
        }
    base = 8.0 + payload.weightKg * 1.45 + payload.declaredValue * 0.018 + payload.volumeCm3 / 100000 * 4
    if payload.serviceLevel.lower() in {"express", "priority", "next_day"}:
        base *= 1.35
    if payload.customerType.lower() in {"business", "enterprise"}:
        base *= 0.94
    recommended = round(base, 2)
    return {
        "tenantId": payload.tenantId,
        "recommendedPrice": recommended,
        "floorPrice": round(recommended * 0.82, 2),
        "ceilingPrice": round(recommended * 1.34, 2),
        "currency": payload.currency.upper(),
        "marginEstimate": 0.22,
        "confidence": 0.52,
        "reason": "Deterministic advisory fallback based on shipment attributes",
        "warnings": ["ml_prediction_unavailable"],
    }


def classify_ticket(payload: TicketClassificationRequest, auth: AuthContext) -> dict[str, Any]:
    require_tenant_scope(auth, payload.tenantId)
    text = f"{payload.subject} {payload.message}".lower()
    if any(term in text for term in ("not moved", "stuck", "late", "delay", "arrived")):
        category, priority, queue, confidence = "delivery_delay", "high", "operations", 0.83
        tags = ["delivery_delay", "tracking_stale"]
    elif any(term in text for term in ("customs", "document", "invoice missing", "hs code")):
        category, priority, queue, confidence = "customs", "medium", "operations", 0.74
        tags = ["customs", "documentation"]
    elif any(term in text for term in ("damage", "broken", "claim")):
        category, priority, queue, confidence = "damage_claim", "high", "claims", 0.79
        tags = ["damage", "claim"]
    elif any(term in text for term in ("invoice", "payment", "refund", "billing")):
        category, priority, queue, confidence = "billing", "normal", "finance", 0.76
        tags = ["billing"]
    else:
        category, priority, queue, confidence = "general", "normal", "support", 0.55
        tags = ["general"]
    return {
        "tenantId": payload.tenantId,
        "category": category,
        "priority": priority,
        "confidence": confidence,
        "suggestedQueue": queue,
        "suggestedTags": tags,
    }


async def next_best_action(shipment_id: str, auth: AuthContext) -> dict[str, Any]:
    prediction = await get_optional_prediction_for_entity(
        entity_type="shipment",
        entity_id=shipment_id,
        model_name="next_best_action",
        auth=auth,
    )
    if prediction:
        data = safe_payload_dict(prediction["payload"])
        return {
            "shipmentId": shipment_id,
            "tenantId": prediction["tenant_id"],
            "recommendedAction": str(data.get("recommendedAction") or data.get("recommended_action") or prediction["label"]),
            "priority": str(data.get("priority") or prediction["label"] or "normal").lower(),
            "reason": str(data.get("reason") or ""),
            "confidence": float(data.get("confidence", prediction["score"]) or 0),
            "sourceSignals": [
                str(item)
                for item in data.get("sourceSignals", data.get("source_signals", []))
            ] if isinstance(data.get("sourceSignals", data.get("source_signals", [])), list) else [],
            "updatedAt": prediction["updated_at"],
        }
    signals: list[dict[str, Any]] = []
    for model_name, source in (
        ("sla_breach", "sla_breach"),
        ("shipment_anomaly", "shipment_anomaly"),
        ("delivery_delay", "delivery_delay"),
    ):
        row = await get_optional_prediction_for_entity(
            entity_type="shipment",
            entity_id=shipment_id,
            model_name=model_name,
            auth=auth,
        )
        if row:
            row["source"] = source
            signals.append(row)
    if not signals:
        raise MlNotFoundError("Next-best-action prediction not found")
    score = highest_score(signals)
    source_names = [row["source"] for row in signals]
    priority = "high" if score >= 0.65 else "medium" if score >= 0.35 else "normal"
    if "shipment_anomaly" in source_names and score >= 0.65:
        action = "investigate_anomaly"
    elif "sla_breach" in source_names and score >= 0.65:
        action = "escalate_to_operations"
    else:
        action = "contact_customer"
    return {
        "shipmentId": shipment_id,
        "tenantId": signals[0]["tenant_id"],
        "recommendedAction": action,
        "priority": priority,
        "reason": "Derived from existing shipment risk signals",
        "confidence": round(score, 4),
        "sourceSignals": source_names,
        "updatedAt": max((row["updated_at"] for row in signals if row["updated_at"]), default=None),
    }
