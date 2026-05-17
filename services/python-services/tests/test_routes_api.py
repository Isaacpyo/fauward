from datetime import UTC, datetime
from pathlib import Path

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

import db
from api.auth import AuthContext, require_scope
from models.route_schemas import OptimizeRouteRequest
from services import route_jobs
from services.route_jobs import (
    fetch_route_job_for_auth,
    queue_route_optimization,
    route_status_response,
    worker_payload,
)


def auth(tenant_id: str = "tenant_a", scopes: tuple[str, ...] = ("routes:optimize", "routes:read")) -> AuthContext:
    return AuthContext(tenant_id=tenant_id, scopes=scopes, key_type="tenant", api_key_id="key_1")


def admin() -> AuthContext:
    return AuthContext(tenant_id="platform", scopes=("platform:admin",), key_type="platform", api_key_id="platform_key")


def payload(**overrides) -> OptimizeRouteRequest:
    values = {
        "tenantId": "tenant_a",
        "vehicleId": None,
        "depot": {"lat": 51.5, "lng": -0.12},
        "stops": [
            {
                "shipmentId": "ship_1",
                "lat": 51.51,
                "lng": -0.1,
                "timeWindowStart": "2026-05-02T09:00:00+00:00",
                "timeWindowEnd": "2026-05-02T12:00:00+00:00",
                "weightKg": "5.5",
            }
        ],
        "vehicleCapacityKg": "50",
    }
    values.update(overrides)
    return OptimizeRouteRequest.model_validate(values)


async def fake_active_count_fetchrow(query, *args):
    if "count(*) as active_count" in query:
        return {"active_count": 0}
    if "idempotency_key" in query:
        return None
    return None


@pytest.mark.asyncio
async def test_optimize_route_requires_auth_scope():
    dependency = require_scope("routes:optimize")

    with pytest.raises(HTTPException) as exc:
        await dependency(AuthContext(tenant_id="tenant_a", scopes=("routes:read",), key_type="tenant"))

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_normal_tenant_can_queue_route_job_for_own_tenant(monkeypatch):
    executed = []
    published = []

    async def fake_fetch(query, tenant_id, shipment_ids):
        assert tenant_id == "tenant_a"
        return [{"id": shipment_id} for shipment_id in shipment_ids]

    async def fake_execute(query, *args):
        executed.append((query, args))
        return "INSERT 0 1"

    def fake_publish(queue, body):
        published.append((queue, body))

    monkeypatch.setattr(db, "fetch", fake_fetch)
    monkeypatch.setattr(db, "fetchrow", fake_active_count_fetchrow)
    monkeypatch.setattr(db, "execute", fake_execute)

    result = await queue_route_optimization(payload=payload(), auth=auth(), publisher=fake_publish)

    assert result["jobId"]
    assert result["status"] == "queued"
    assert published[0][0] == "fauward:routes:optimize"
    assert published[0][1]["tenantId"] == "tenant_a"
    assert published[0][1]["jobId"] == result["jobId"]
    assert "on conflict" not in executed[0][0].lower()


@pytest.mark.asyncio
async def test_normal_tenant_payload_tenant_id_is_not_trusted(monkeypatch):
    published = []

    async def fake_fetch(query, tenant_id, shipment_ids):
        assert tenant_id == "tenant_a"
        return [{"id": "ship_1"}]

    async def fake_execute(query, *args):
        return "INSERT 0 1"

    monkeypatch.setattr(db, "fetch", fake_fetch)
    monkeypatch.setattr(db, "fetchrow", fake_active_count_fetchrow)
    monkeypatch.setattr(db, "execute", fake_execute)

    await queue_route_optimization(payload=payload(tenantId="tenant_b"), auth=auth("tenant_a"), publisher=lambda queue, body: published.append(body))

    assert published[0]["tenantId"] == "tenant_a"


@pytest.mark.asyncio
async def test_super_admin_can_queue_route_for_another_tenant(monkeypatch):
    published = []

    async def fake_fetch(query, tenant_id, shipment_ids):
        assert tenant_id == "tenant_b"
        return [{"id": "ship_1"}]

    async def fake_execute(query, *args):
        return "INSERT 0 1"

    monkeypatch.setattr(db, "fetch", fake_fetch)
    monkeypatch.setattr(db, "fetchrow", fake_active_count_fetchrow)
    monkeypatch.setattr(db, "execute", fake_execute)

    await queue_route_optimization(payload=payload(tenantId="tenant_b"), auth=admin(), publisher=lambda queue, body: published.append(body))

    assert published[0]["tenantId"] == "tenant_b"


@pytest.mark.asyncio
async def test_guessed_cross_tenant_route_status_returns_404(monkeypatch):
    queries = []

    async def fake_fetchrow(query, *args):
        queries.append((query, args))
        return None

    monkeypatch.setattr(db, "fetchrow", fake_fetchrow)

    with pytest.raises(HTTPException) as exc:
        await fetch_route_job_for_auth("job_cross", auth("tenant_a"))

    assert exc.value.status_code == 404
    assert queries[0][1] == ("job_cross", "tenant_a")


@pytest.mark.asyncio
async def test_super_admin_can_inspect_cross_tenant_route_job(monkeypatch):
    async def fake_fetchrow(query, *args):
        assert args == ("job_1",)
        return {
            "id": "job_1",
            "tenant_id": "tenant_b",
            "status": "COMPLETED",
            "ordered_stops": [],
            "total_distance_m": 0,
            "estimated_duration_s": 0,
            "error_message": None,
            "updated_at": datetime(2026, 5, 2, tzinfo=UTC),
        }

    monkeypatch.setattr(db, "fetchrow", fake_fetchrow)

    row = await fetch_route_job_for_auth("job_1", admin())

    assert row["tenant_id"] == "tenant_b"


def test_client_job_id_is_ignored_and_not_sent_to_worker():
    request = payload(jobId="existing_job")
    body = worker_payload(request, job_id="server_job", tenant_id="tenant_a")

    assert body["jobId"] == "server_job"


@pytest.mark.asyncio
async def test_all_stop_shipment_ids_must_belong_to_tenant(monkeypatch):
    async def fake_fetch(query, tenant_id, shipment_ids):
        return [{"id": "ship_1"}]

    monkeypatch.setattr(db, "fetch", fake_fetch)

    with pytest.raises(HTTPException) as exc:
        await route_jobs.verify_shipments_for_tenant("tenant_a", ["ship_1", "ship_2"])

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_vehicle_id_must_belong_to_tenant(monkeypatch):
    async def fake_fetchrow(query, *args):
        return None

    monkeypatch.setattr(db, "fetchrow", fake_fetchrow)

    with pytest.raises(HTTPException) as exc:
        await route_jobs.verify_vehicle_for_tenant("tenant_a", "vehicle_b", payload().vehicleCapacityKg)

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_vehicle_capacity_must_cover_request(monkeypatch):
    async def fake_fetchrow(query, *args):
        return {"id": "vehicle_1", "isActive": True, "capacityKg": "10"}

    monkeypatch.setattr(db, "fetchrow", fake_fetchrow)

    with pytest.raises(HTTPException) as exc:
        await route_jobs.verify_vehicle_for_tenant("tenant_a", "vehicle_1", payload(vehicleCapacityKg="50").vehicleCapacityKg)

    assert exc.value.status_code == 400


def test_invalid_lat_lng_values_are_rejected():
    with pytest.raises(ValidationError):
        payload(depot={"lat": 91, "lng": -0.12})

    with pytest.raises(ValidationError):
        payload(stops=[{"shipmentId": "ship_1", "lat": 51.5, "lng": 181}])


def test_empty_and_too_many_stops_are_rejected():
    with pytest.raises(ValidationError):
        payload(stops=[])

    with pytest.raises(ValidationError):
        payload(stops=[{"shipmentId": f"ship_{idx}", "lat": 51.5, "lng": -0.1} for idx in range(101)])


def test_duplicate_shipment_ids_are_rejected():
    with pytest.raises(ValidationError):
        payload(stops=[{"shipmentId": "ship_1", "lat": 51.5, "lng": -0.1}, {"shipmentId": "ship_1", "lat": 51.6, "lng": -0.2}])


def test_weight_and_capacity_validation():
    with pytest.raises(ValidationError):
        payload(stops=[{"shipmentId": "ship_1", "lat": 51.5, "lng": -0.1, "weightKg": "-1"}])

    with pytest.raises(ValidationError):
        payload(vehicleCapacityKg="0")

    with pytest.raises(ValidationError):
        payload(vehicleCapacityKg="5", stops=[{"shipmentId": "ship_1", "lat": 51.5, "lng": -0.1, "weightKg": "6"}])


def test_invalid_time_windows_are_rejected():
    with pytest.raises(ValidationError):
        payload(stops=[{"shipmentId": "ship_1", "lat": 51.5, "lng": -0.1, "timeWindowStart": "not-a-date"}])

    with pytest.raises(ValidationError):
        payload(
            stops=[
                {
                    "shipmentId": "ship_1",
                    "lat": 51.5,
                    "lng": -0.1,
                    "timeWindowStart": "2026-05-02T12:00:00+00:00",
                    "timeWindowEnd": "2026-05-02T09:00:00+00:00",
                }
            ]
        )


@pytest.mark.asyncio
async def test_publish_job_failure_marks_route_failed(monkeypatch):
    executed = []

    async def fake_fetch(query, tenant_id, shipment_ids):
        return [{"id": "ship_1"}]

    async def fake_execute(query, *args):
        executed.append((query, args))
        return "UPDATE 1" if query.lstrip().lower().startswith("update") else "INSERT 0 1"

    def failing_publish(queue, body):
        raise RuntimeError("redis stack trace secret")

    monkeypatch.setattr(db, "fetch", fake_fetch)
    monkeypatch.setattr(db, "fetchrow", fake_active_count_fetchrow)
    monkeypatch.setattr(db, "execute", fake_execute)

    with pytest.raises(route_jobs.RouteQueuePublishError):
        await queue_route_optimization(payload=payload(), auth=auth(), publisher=failing_publish)

    assert any("set status = 'FAILED'" in query for query, _args in executed)


def test_get_status_returns_camel_case_and_safe_errors():
    row = {
        "id": "job_1",
        "tenant_id": "tenant_a",
        "status": "FAILED",
        "ordered_stops": [{"shipmentId": "ship_1"}],
        "total_distance_m": 100,
        "estimated_duration_s": 20,
        "error_message": "Traceback: secret connection string",
        "updated_at": datetime(2026, 5, 2, tzinfo=UTC),
    }

    normal = route_status_response(row, auth())
    platform = route_status_response(row, admin())

    assert normal == {
        "jobId": "job_1",
        "status": "FAILED",
        "orderedStops": [{"shipmentId": "ship_1"}],
        "totalDistanceM": 100,
        "estimatedDurationS": 20,
        "error": "Route optimization failed",
        "updatedAt": "2026-05-02T00:00:00+00:00",
    }
    assert platform["error"] == "Traceback: secret connection string"


def test_rate_limit_decorators_remain_active():
    source = Path("services/python-services/api/routes.py").read_text()

    assert '@limiter.limit("20/minute")' in source
    assert '@limiter.limit("80/hour", key_func=tenant_rate_limit_key)' in source
    assert '@limiter.limit("60/minute")' in source
