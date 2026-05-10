from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import db
from api.auth import AuthContext, require_super_admin
from models.ml_schemas import FeedbackRequest, PricingRecommendationRequest, TicketClassificationRequest
from services.ml_feedback import record_feedback
from services.ml_models import celery_status_payload, list_model_status
from services.ml_predictions import (
    MlNotFoundError,
    get_prediction_for_entity,
    list_lead_predictions,
)
from services.ml_recommendations import classify_ticket, next_best_action, pricing_recommendation


def auth(tenant_id: str = "tenant_a", scopes: list[str] | None = None) -> AuthContext:
    return AuthContext(tenant_id=tenant_id, scopes=scopes or [])


def row(**values):
    return values


@pytest.mark.asyncio
async def test_tenant_cannot_fetch_other_tenant_prediction(monkeypatch):
    calls = []

    async def fake_fetchrow(query, *args):
        calls.append(args)
        return None

    monkeypatch.setattr(db, "fetchrow", fake_fetchrow)

    with pytest.raises(MlNotFoundError):
        await get_prediction_for_entity(
            entity_type="shipment",
            entity_id="shp_other",
            model_name="delivery_delay",
            auth=auth("tenant_a"),
        )

    assert calls[0][-1] == "tenant_a"


@pytest.mark.asyncio
async def test_super_admin_can_fetch_cross_tenant_prediction(monkeypatch):
    async def fake_fetchrow(query, *args):
        assert args == ("shipment", "shp_b", "delivery_delay")
        return row(
            tenant_id="tenant_b",
            entity_type="shipment",
            entity_id="shp_b",
            model_name="delivery_delay",
            score=0.75,
            label="HIGH",
            payload={"riskLevel": "high"},
            created_at=None,
            updated_at=None,
        )

    monkeypatch.setattr(db, "fetchrow", fake_fetchrow)

    result = await get_prediction_for_entity(
        entity_type="shipment",
        entity_id="shp_b",
        model_name="delivery_delay",
        auth=auth("platform", ["super_admin"]),
    )

    assert result["tenant_id"] == "tenant_b"
    assert result["payload"] == {"riskLevel": "high"}


@pytest.mark.asyncio
async def test_leads_shape_pagination_and_tenant_join(monkeypatch):
    async def fake_fetch(query, *args):
        assert 'l."tenantId" = pr.tenant_id' in query
        assert args == ("tenant_a", 2, 3)
        return [
            row(
                entity_id="lead_1",
                tenant_id="tenant_a",
                score=0.91,
                label="HOT",
                payload={"company": "evil", "email": "evil@example.com", "conversionProbability": 0.91},
                company="Real Co",
                email="real@example.com",
            )
        ]

    monkeypatch.setattr(db, "fetch", fake_fetch)

    result = await list_lead_predictions(auth=auth("tenant_a"), limit=2, offset=3)

    assert result == [
        {
            "leadId": "lead_1",
            "tenantId": "tenant_a",
            "company": "Real Co",
            "email": "real@example.com",
            "score": 0.91,
            "label": "HOT",
            "payload": {"company": "evil", "email": "evil@example.com", "conversionProbability": 0.91},
        }
    ]


@pytest.mark.asyncio
async def test_retrain_endpoint_returns_task_id_and_audits(monkeypatch):
    pytest.importorskip("main")
    ml = pytest.importorskip("api.ml")

    audits = []
    sent = []

    class CeleryStub:
        def send_task(self, task_name, queue):
            sent.append((task_name, queue))
            return SimpleNamespace(id="task_123")

    async def fake_audit(**kwargs):
        audits.append(kwargs)

    monkeypatch.setattr(ml, "celery_app", CeleryStub())
    monkeypatch.setattr(ml, "log_retrain_audit", fake_audit)

    result = await ml.retrain(
        SimpleNamespace(client=SimpleNamespace(host="127.0.0.1")),
        "delivery_delay",
        auth("platform", ["super_admin"]),
    )

    assert result == {"modelName": "delivery_delay", "status": "queued", "taskId": "task_123"}
    assert sent == [("workers.ml_worker.train_delay_model", "ml")]
    assert audits[0]["task_id"] == "task_123"


@pytest.mark.asyncio
async def test_retrain_requires_super_admin():
    with pytest.raises(HTTPException) as exc:
        await require_super_admin(auth("tenant_a"))
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_eta_sla_and_customs_endpoints(monkeypatch):
    pytest.importorskip("main")
    ml = pytest.importorskip("api.ml")

    async def fake_prediction(entity_type, entity_id, model_name, auth, tenant_id=None):
        payloads = {
            "eta_prediction": {"eta": "2026-05-08T16:00:00Z", "confidence": 0.82, "riskLevel": "medium", "factors": ["delay"]},
            "sla_breach": {"likelyToBreach": True, "factors": ["stale"], "recommendedAction": "escalate"},
            "customs_delay": {"likelyCustomsDelay": True, "factors": ["missing document"]},
        }
        return {
            "tenant_id": "tenant_a",
            "entity_id": entity_id,
            "score": 0.76,
            "label": "HIGH",
            "payload": payloads[model_name],
            "updated_at": None,
        }

    monkeypatch.setattr(ml, "get_prediction_for_entity", fake_prediction)

    assert (await ml.eta_prediction("shp_1", auth("tenant_a")))["eta"] == "2026-05-08T16:00:00Z"
    assert (await ml.sla_risk("shp_1", auth("tenant_a")))["likelyToBreach"] is True
    assert (await ml.customs_risk("shp_1", auth("tenant_a")))["likelyCustomsDelay"] is True


@pytest.mark.asyncio
async def test_demand_forecast_tenant_mismatch_is_blocked():
    pytest.importorskip("main")
    ml = pytest.importorskip("api.ml")

    with pytest.raises(HTTPException) as exc:
        await ml.demand_forecast("tenant_b", auth("tenant_a"))
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_pricing_recommendation_validates_tenant_and_does_not_mutate(monkeypatch):
    async def fail_execute(*args, **kwargs):
        raise AssertionError("pricing recommendation must not mutate")

    monkeypatch.setattr(db, "execute", fail_execute)
    payload = PricingRecommendationRequest(
        tenantId="tenant_a",
        origin="UK",
        destination="Nigeria",
        weightKg=12.5,
        volumeCm3=45000,
        serviceLevel="standard",
        customerType="retail",
        declaredValue=250,
        currency="GBP",
    )

    result = await pricing_recommendation(payload, auth("tenant_a"))
    assert result["tenantId"] == "tenant_a"
    assert result["warnings"] == ["ml_prediction_unavailable"]

    with pytest.raises(Exception):
        await pricing_recommendation(payload.model_copy(update={"tenantId": "tenant_b"}), auth("tenant_a"))


@pytest.mark.asyncio
async def test_feedback_writes_row(monkeypatch):
    writes = []

    async def fake_execute(query, *args):
        writes.append((query, args))

    monkeypatch.setattr(db, "execute", fake_execute)

    await record_feedback(
        FeedbackRequest(
            tenantId="tenant_a",
            entityType="shipment",
            entityId="shp_1",
            modelName="delivery_delay",
            predictionWasCorrect=False,
            actualLabel="delivered_on_time",
            notes="arrived on time",
        ),
        auth("tenant_a"),
    )

    assert "insert into ml_prediction_feedback" in writes[0][0]
    assert writes[0][1][1:6] == ("tenant_a", "shipment", "shp_1", "delivery_delay", False)


@pytest.mark.asyncio
async def test_model_status_hides_metrics_for_normal_tenant(monkeypatch):
    async def fake_fetch(query, *args):
        return [row(name="delivery_delay", status="active", version="v3", last_trained_at=None, metrics={"accuracy": 0.84})]

    monkeypatch.setattr(db, "fetch", fake_fetch)

    models = await list_model_status(auth("tenant_a"))
    delivery_delay = next(item for item in models if item["name"] == "delivery_delay")

    assert delivery_delay["metrics"] == {}


def test_retrain_status_payload_is_safe_on_failure():
    payload = celery_status_payload("task_1", "FAILURE", RuntimeError("secret traceback"))
    assert payload == {"taskId": "task_1", "status": "failed", "result": {"error": "secret traceback"}}


def test_ticket_classifier_keyword_fallback():
    result = classify_ticket(
        TicketClassificationRequest(
            tenantId="tenant_a",
            subject="Parcel has not arrived",
            message="My shipment has not moved for 5 days.",
            shipmentId="shp_1",
        ),
        auth("tenant_a"),
    )

    assert result["category"] == "delivery_delay"
    assert result["priority"] == "high"


@pytest.mark.asyncio
async def test_next_best_action_does_not_mutate(monkeypatch):
    async def fake_fetchrow(query, *args):
        return row(
            tenant_id="tenant_a",
            entity_type="shipment",
            entity_id="shp_1",
            model_name="next_best_action",
            score=0.81,
            label="HIGH",
            payload={
                "recommendedAction": "contact_customer",
                "priority": "high",
                "reason": "No update for 48 hours",
                "confidence": 0.81,
                "sourceSignals": ["delivery_delay"],
            },
            created_at=None,
            updated_at=None,
        )

    async def fail_execute(*args, **kwargs):
        raise AssertionError("recommendation endpoint must not mutate")

    monkeypatch.setattr(db, "fetchrow", fake_fetchrow)
    monkeypatch.setattr(db, "execute", fail_execute)

    result = await next_best_action("shp_1", auth("tenant_a"))

    assert result["recommendedAction"] == "contact_customer"
    assert result["sourceSignals"] == ["delivery_delay"]
