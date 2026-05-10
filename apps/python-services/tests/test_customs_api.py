from datetime import datetime
from decimal import Decimal

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

import db
from api.auth import AuthContext, require_scope
from models.customs_schemas import DeclarationRequest, DutyEstimateRequest
from services import customs_declarations
from services.customs_declarations import (
    CustomsQueuePublishError,
    build_customs_shipment_data,
    declaration_status_response,
    duty_estimate_response,
    fetch_declaration_for_auth,
    hs_lookup_response,
    queue_declaration_generation,
)


def auth(tenant_id: str = "tenant_a", scopes: tuple[str, ...] = ("customs:read", "customs:estimate", "customs:write")) -> AuthContext:
    return AuthContext(tenant_id=tenant_id, scopes=scopes, key_type="tenant")


def admin() -> AuthContext:
    return AuthContext(tenant_id="platform", scopes=("platform:admin",), key_type="platform")


def declaration_payload(**overrides):
    values = {"tenantId": "tenant_a", "shipmentId": "shp_1", "declarationType": "uk_cds"}
    values.update(overrides)
    return DeclarationRequest.model_validate(values)


@pytest.mark.asyncio
async def test_hs_lookup_requires_auth_scope():
    dependency = require_scope("customs:read")

    with pytest.raises(HTTPException) as exc:
        await dependency(AuthContext(tenant_id="tenant_a", scopes=("customs:estimate",), key_type="tenant"))

    assert exc.value.status_code == 403


def test_hs_lookup_rejects_too_short_and_too_long_descriptions():
    with pytest.raises(HTTPException):
        hs_lookup_response(" ")
    with pytest.raises(HTTPException):
        hs_lookup_response("x" * 201)


def test_hs_lookup_returns_max_5_matches(monkeypatch):
    def fake_fuzzy(description, limit):
        assert description == "laptop charger"
        assert limit == 5
        return [{"hsCode": str(index), "description": "x"} for index in range(10)]

    monkeypatch.setattr(customs_declarations, "fuzzy_match", fake_fuzzy)

    result = hs_lookup_response("  laptop   charger ")

    assert result["description"] == "laptop charger"
    assert len(result["matches"]) == 5


@pytest.mark.asyncio
async def test_duty_estimate_requires_auth_scope():
    dependency = require_scope("customs:estimate")

    with pytest.raises(HTTPException):
        await dependency(AuthContext(tenant_id="tenant_a", scopes=("customs:read",), key_type="tenant"))


def test_duty_estimate_rejects_invalid_declared_value():
    with pytest.raises(ValidationError):
        DutyEstimateRequest.model_validate(
            {
                "originCountry": "GB",
                "destCountry": "US",
                "hsCode": "8504",
                "declaredValue": "0",
                "currency": "GBP",
            }
        )


def test_duty_estimate_rejects_invalid_currency_country_and_hs_code():
    invalid = {
        "originCountry": "GBR",
        "destCountry": "1S",
        "hsCode": "abc",
        "declaredValue": "10",
        "currency": "GBP1",
    }

    with pytest.raises(ValidationError):
        DutyEstimateRequest.model_validate(invalid)


def test_duty_estimate_is_estimate_only_and_deterministic():
    result = duty_estimate_response(
        origin_country="GB",
        dest_country="DE",
        hs_code="8504",
        declared_value=Decimal("100.00"),
        currency="GBP",
    )

    assert result["estimateOnly"] is True
    assert result["declaredValue"] == 100.0
    assert "invoiceId" not in result


@pytest.mark.asyncio
async def test_normal_tenant_can_queue_declaration_for_own_shipment(monkeypatch):
    writes = []
    published = []

    async def fake_fetchrow(query, *args):
        if "from shipments" in query:
            assert args == ("shp_1", "tenant_a")
            return {"id": "shp_1", "tenantId": "tenant_a"}
        if "idempotency_key" in query:
            return None
        raise AssertionError(query)

    async def fake_execute(query, *args):
        writes.append((query, args))
        return "INSERT 0 1"

    monkeypatch.setattr(db, "fetchrow", fake_fetchrow)
    monkeypatch.setattr(db, "execute", fake_execute)

    result = await queue_declaration_generation(
        payload=declaration_payload(),
        auth=auth("tenant_a"),
        publisher=lambda queue, body: published.append((queue, body)),
    )

    assert result["status"] == "QUEUED"
    assert writes[0][1][1:4] == ("tenant_a", "shp_1", "uk_cds")
    assert published[0][0] == "fauward:customs:generate"
    assert "shipmentData" not in published[0][1]


@pytest.mark.asyncio
async def test_tenant_cannot_queue_declaration_for_another_tenants_shipment(monkeypatch):
    async def fake_fetchrow(query, *args):
        assert args == ("shp_other", "tenant_a")
        return None

    monkeypatch.setattr(db, "fetchrow", fake_fetchrow)

    with pytest.raises(HTTPException) as exc:
        await queue_declaration_generation(
            payload=declaration_payload(tenantId="tenant_b", shipmentId="shp_other"),
            auth=auth("tenant_a"),
            publisher=lambda *_: None,
        )

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_super_admin_can_queue_declaration_for_another_tenant(monkeypatch):
    published = []

    async def fake_fetchrow(query, *args):
        if "from shipments" in query:
            assert args == ("shp_b", "tenant_b")
            return {"id": "shp_b", "tenantId": "tenant_b"}
        return None

    async def fake_execute(query, *args):
        assert args[1] == "tenant_b"
        return "INSERT 0 1"

    monkeypatch.setattr(db, "fetchrow", fake_fetchrow)
    monkeypatch.setattr(db, "execute", fake_execute)

    result = await queue_declaration_generation(
        payload=declaration_payload(tenantId="tenant_b", shipmentId="shp_b"),
        auth=admin(),
        publisher=lambda queue, body: published.append(body),
    )

    assert published[0]["tenantId"] == "tenant_b"
    assert result["jobId"] == published[0]["jobId"]


@pytest.mark.asyncio
async def test_client_cannot_overwrite_another_declaration_by_sending_existing_job_id(monkeypatch):
    async def fake_fetchrow(query, *args):
        if "from shipments" in query:
            return {"id": "shp_1", "tenantId": "tenant_a"}
        return None

    async def fake_execute(query, *args):
        assert "on conflict (id)" not in query.lower()
        assert args[0] != "existing_job"
        return "INSERT 0 1"

    monkeypatch.setattr(db, "fetchrow", fake_fetchrow)
    monkeypatch.setattr(db, "execute", fake_execute)

    result = await queue_declaration_generation(
        payload=declaration_payload(jobId="existing_job"),
        auth=auth("tenant_a"),
        publisher=lambda *_: None,
    )

    assert result["jobId"] != "existing_job"


def test_shipment_data_options_cannot_override_trusted_db_fields():
    request = declaration_payload(
        shipmentData={"recipientName": "Mallory", "items": [{"description": "bad"}]},
        options={"iossNumber": "IM123"},
    )
    data = build_customs_shipment_data(
        {
            "id": "shp_1",
            "recipientName": "Alice",
            "originCountry": "GB",
            "destCountry": "DE",
            "currency": "GBP",
            "items": [{"description": "Trusted goods", "hsCode": "8504", "declaredValue": "12.50"}],
        },
        request.options.model_dump(exclude_none=True),
    )

    assert data["recipientName"] == "Alice"
    assert data["items"][0]["description"] == "Trusted goods"
    assert data["iossNumber"] == "IM123"


@pytest.mark.asyncio
async def test_publish_job_failure_marks_declaration_failed(monkeypatch):
    writes = []

    async def fake_fetchrow(query, *args):
        if "from shipments" in query:
            return {"id": "shp_1", "tenantId": "tenant_a"}
        return None

    async def fake_execute(query, *args):
        writes.append((query, args))
        return "INSERT 0 1"

    def fail_publish(queue, body):
        raise RuntimeError("redis stack trace secret")

    monkeypatch.setattr(db, "fetchrow", fake_fetchrow)
    monkeypatch.setattr(db, "execute", fake_execute)

    with pytest.raises(CustomsQueuePublishError):
        await queue_declaration_generation(payload=declaration_payload(), auth=auth("tenant_a"), publisher=fail_publish)

    assert "set status = 'FAILED'" in writes[-1][0]
    assert writes[-1][1][1] == "tenant_a"


@pytest.mark.asyncio
async def test_declaration_status_returns_own_tenant_job(monkeypatch):
    now = datetime(2026, 5, 2, 12, 0, 0)

    async def fake_fetchrow(query, *args):
        assert args == ("job_1", "tenant_a")
        return {
            "id": "job_1",
            "tenant_id": "tenant_a",
            "shipment_id": "shp_1",
            "declaration_type": "uk_cds",
            "status": "COMPLETED",
            "error_message": None,
            "updated_at": now,
        }

    monkeypatch.setattr(db, "fetchrow", fake_fetchrow)

    row = await fetch_declaration_for_auth("job_1", auth("tenant_a", ("customs:read",)))

    assert declaration_status_response(row, auth("tenant_a", ("customs:read",))) == {
        "jobId": "job_1",
        "tenantId": "tenant_a",
        "shipmentId": "shp_1",
        "declarationType": "uk_cds",
        "status": "COMPLETED",
        "error": None,
        "updatedAt": "2026-05-02T12:00:00",
    }


@pytest.mark.asyncio
async def test_guessed_cross_tenant_declaration_status_returns_404(monkeypatch):
    async def fake_fetchrow(query, *args):
        assert "where id = $1 and tenant_id = $2" in query
        return None

    monkeypatch.setattr(db, "fetchrow", fake_fetchrow)

    with pytest.raises(HTTPException) as exc:
        await fetch_declaration_for_auth("job_b", auth("tenant_a", ("customs:read",)))

    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_super_admin_can_inspect_cross_tenant_declaration_status(monkeypatch):
    async def fake_fetchrow(query, *args):
        assert args == ("job_b",)
        return {
            "id": "job_b",
            "tenant_id": "tenant_b",
            "shipment_id": "shp_b",
            "declaration_type": "eu_aes",
            "status": "QUEUED",
            "error_message": None,
            "updated_at": None,
        }

    monkeypatch.setattr(db, "fetchrow", fake_fetchrow)

    row = await fetch_declaration_for_auth("job_b", admin())

    assert declaration_status_response(row, admin())["tenantId"] == "tenant_b"


def test_normal_tenant_does_not_receive_internal_stack_traces():
    row = {
        "id": "job_1",
        "tenant_id": "tenant_a",
        "shipment_id": "shp_1",
        "declaration_type": "uk_cds",
        "status": "FAILED",
        "error_message": "Traceback: secret",
        "updated_at": None,
    }

    normal = declaration_status_response(row, auth("tenant_a", ("customs:read",)))
    super_admin = declaration_status_response(row, admin())

    assert normal["error"] == "Customs declaration generation failed"
    assert super_admin["error"] == "Traceback: secret"


@pytest.mark.asyncio
async def test_declaration_generation_does_not_perform_external_customs_submission(monkeypatch):
    published = []

    async def fake_fetchrow(query, *args):
        if "from shipments" in query:
            return {"id": "shp_1", "tenantId": "tenant_a"}
        return None

    async def fake_execute(query, *args):
        return "INSERT 0 1"

    monkeypatch.setattr(db, "fetchrow", fake_fetchrow)
    monkeypatch.setattr(db, "execute", fake_execute)

    await queue_declaration_generation(
        payload=declaration_payload(),
        auth=auth("tenant_a"),
        publisher=lambda queue, body: published.append((queue, body)),
    )

    assert published[0][0] == "fauward:customs:generate"
