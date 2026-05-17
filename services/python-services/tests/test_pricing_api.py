from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

import db
from api.auth import AuthContext, require_scope
from models.pricing_schemas import PricingQuoteRequest
from services import pricing_service
from services.pricing_service import create_pricing_quote, persist_normalized_quote, validate_promo_code


def auth(tenant_id: str = "tenant_a", scopes: tuple[str, ...] = ("pricing:quote",)) -> AuthContext:
    return AuthContext(tenant_id=tenant_id, scopes=scopes, key_type="tenant", api_key_id="key_1")


def admin() -> AuthContext:
    return AuthContext(tenant_id="platform", scopes=("platform:admin",), key_type="platform", api_key_id="platform_key")


def payload(**overrides):
    values = {
        "tenantId": "tenant_a",
        "originPostcode": " sw1a 1aa ",
        "destPostcode": " m1 1ae ",
        "weightKg": "12.50",
    }
    values.update(overrides)
    return PricingQuoteRequest.model_validate(values)


async def noop_validate(*args, **kwargs):
    return None


async def fixed_valid_until(tenant_id):
    return datetime(2026, 5, 2, 12, 30, tzinfo=UTC)


async def noop_persist(**kwargs):
    return None


@pytest.mark.asyncio
async def test_quote_requires_auth_scope():
    dependency = require_scope("pricing:quote")

    with pytest.raises(HTTPException) as exc:
        await dependency(AuthContext(tenant_id="tenant_a", scopes=("pricing:read",), key_type="tenant"))

    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_normal_tenant_can_quote_for_own_tenant(monkeypatch):
    calls = []

    async def fake_evaluate_quote(**kwargs):
        calls.append(kwargs)
        return {"base": 10, "surcharges": [], "promoDiscount": 0, "total": 10, "currency": "GBP", "demandSignal": "NORMAL"}

    async def fake_persist(**kwargs):
        calls.append({"persist_tenant": kwargs["tenant_id"], "payload": kwargs["payload"]})

    monkeypatch.setattr(pricing_service, "validate_promo_code", noop_validate)
    monkeypatch.setattr(pricing_service, "evaluate_quote", fake_evaluate_quote)
    monkeypatch.setattr(pricing_service, "quote_valid_until", fixed_valid_until)
    monkeypatch.setattr(pricing_service, "persist_normalized_quote", fake_persist)

    result = await create_pricing_quote(payload=payload(), auth=auth("tenant_a"))

    assert calls[0]["tenant_id"] == "tenant_a"
    assert calls[1]["persist_tenant"] == "tenant_a"
    assert result["tenantId"] == "tenant_a"
    assert result["quoteId"]
    assert result["validUntil"] == "2026-05-02T12:30:00+00:00"


@pytest.mark.asyncio
async def test_normal_tenant_cannot_quote_for_another_tenant(monkeypatch):
    calls = []

    async def fake_evaluate_quote(**kwargs):
        calls.append(kwargs)
        return {"base": 10, "surcharges": [], "promoDiscount": 0, "total": 10, "currency": "GBP"}

    monkeypatch.setattr(pricing_service, "validate_promo_code", noop_validate)
    monkeypatch.setattr(pricing_service, "evaluate_quote", fake_evaluate_quote)
    monkeypatch.setattr(pricing_service, "quote_valid_until", fixed_valid_until)
    monkeypatch.setattr(pricing_service, "persist_normalized_quote", noop_persist)

    result = await create_pricing_quote(payload=payload(tenantId="tenant_b"), auth=auth("tenant_a"))

    assert calls[0]["tenant_id"] == "tenant_a"
    assert result["tenantId"] == "tenant_a"


@pytest.mark.asyncio
async def test_super_admin_can_quote_for_another_tenant(monkeypatch):
    calls = []

    async def fake_evaluate_quote(**kwargs):
        calls.append(kwargs)
        return {"base": 10, "surcharges": [], "promoDiscount": 0, "total": 10, "currency": "GBP"}

    monkeypatch.setattr(pricing_service, "validate_promo_code", noop_validate)
    monkeypatch.setattr(pricing_service, "evaluate_quote", fake_evaluate_quote)
    monkeypatch.setattr(pricing_service, "quote_valid_until", fixed_valid_until)
    monkeypatch.setattr(pricing_service, "persist_normalized_quote", noop_persist)

    result = await create_pricing_quote(payload=payload(tenantId="tenant_b"), auth=admin())

    assert calls[0]["tenant_id"] == "tenant_b"
    assert result["tenantId"] == "tenant_b"


def test_origin_and_destination_postcodes_are_normalized():
    request = payload(originPostcode=" sw1a   1aa ", destPostcode="ec1a-1bb")

    assert request.originPostcode == "SW1A 1AA"
    assert request.destPostcode == "EC1A-1BB"


def test_invalid_empty_postcodes_are_rejected():
    with pytest.raises(ValidationError):
        payload(originPostcode="??")
    with pytest.raises(ValidationError):
        payload(destPostcode=" ")


def test_weight_kg_must_be_greater_than_zero_and_realistic():
    with pytest.raises(ValidationError):
        payload(weightKg="0")
    with pytest.raises(ValidationError):
        payload(weightKg="1000.01")


def test_promo_code_is_normalized():
    request = payload(promoCode=" save_10 ")

    assert request.promoCode == "SAVE_10"


@pytest.mark.asyncio
async def test_promo_code_from_another_tenant_cannot_be_applied(monkeypatch):
    calls = []

    async def fake_table_exists(table_name):
        return table_name == "promo_codes"

    async def fake_fetchrow(query, *args):
        calls.append((query, args))
        return None

    monkeypatch.setattr(db, "table_exists", fake_table_exists)
    monkeypatch.setattr(db, "fetchrow", fake_fetchrow)

    with pytest.raises(HTTPException) as exc:
        await validate_promo_code("tenant_a", "SAVE10")

    assert exc.value.status_code == 400
    assert calls[0][1] == ("tenant_a", "SAVE10")


@pytest.mark.asyncio
async def test_expired_disabled_promo_code_is_rejected_if_supported(monkeypatch):
    async def fake_table_exists(table_name):
        return table_name == "promo_codes"

    async def fake_fetchrow(query, *args):
        assert '"isEnabled" = true' in query
        assert '("expiresAt" is null or "expiresAt" > now())' in query
        return None

    monkeypatch.setattr(db, "table_exists", fake_table_exists)
    monkeypatch.setattr(db, "fetchrow", fake_fetchrow)

    with pytest.raises(HTTPException):
        await validate_promo_code("tenant_a", "SAVE10")


@pytest.mark.asyncio
async def test_evaluate_quote_receives_normalized_inputs(monkeypatch):
    calls = []

    async def fake_evaluate_quote(**kwargs):
        calls.append(kwargs)
        return {"base": 10, "surcharges": [], "promoDiscount": 0, "total": 10, "currency": "GBP"}

    monkeypatch.setattr(pricing_service, "validate_promo_code", noop_validate)
    monkeypatch.setattr(pricing_service, "evaluate_quote", fake_evaluate_quote)
    monkeypatch.setattr(pricing_service, "quote_valid_until", fixed_valid_until)
    monkeypatch.setattr(pricing_service, "persist_normalized_quote", noop_persist)

    await create_pricing_quote(payload=payload(originPostcode=" sw1a 1aa ", destPostcode=" m1 1ae ", promoCode=" save10 "), auth=auth())

    assert calls[0]["origin_postcode"] == "SW1A 1AA"
    assert calls[0]["dest_postcode"] == "M1 1AE"
    assert calls[0]["promo_code"] == "SAVE10"
    assert calls[0]["weight_kg"] == 12.5


@pytest.mark.asyncio
async def test_persist_quote_stores_normalized_tenant_scoped_input(monkeypatch):
    writes = []

    async def fake_fetchrow(query, *args):
        return {"plan": "PRO"}

    async def fake_execute(query, *args):
        writes.append((query, args))
        return "INSERT 0 1"

    monkeypatch.setattr(db, "fetchrow", fake_fetchrow)
    monkeypatch.setattr(db, "execute", fake_execute)

    await persist_normalized_quote(
        quote_id="quote_1",
        tenant_id="tenant_a",
        payload=payload(promoCode="SAVE10"),
        quote={"base": 10, "surcharges": [{"amount": 2}], "promoDiscount": 1, "total": 11, "currency": "GBP", "demandSignal": "NORMAL"},
        valid_until=datetime(2026, 5, 2, 12, 30, tzinfo=UTC),
        auth=auth("tenant_a"),
    )

    query, args = writes[0]
    assert "insert into quotes" in query
    assert args[0] == "quote_1"
    assert args[1] == "tenant_a"
    assert '"originPostcode":"SW1A 1AA"' in args[3]
    assert '"promoCode":"SAVE10"' in args[3]
    assert '"apiKeyId":"key_1"' in args[3]


@pytest.mark.asyncio
async def test_response_does_not_expose_internal_margin_cost_floor_or_rules(monkeypatch):
    async def fake_evaluate_quote(**kwargs):
        return {
            "base": 10,
            "surcharges": [{"name": "Fuel", "amount": 2, "type": "fuel", "ruleId": "secret"}],
            "promoDiscount": 1,
            "total": 11,
            "currency": "GBP",
            "costFloor": 4,
            "internalMargin": 7,
            "pricingRuleIds": ["secret"],
        }

    monkeypatch.setattr(pricing_service, "validate_promo_code", noop_validate)
    monkeypatch.setattr(pricing_service, "evaluate_quote", fake_evaluate_quote)
    monkeypatch.setattr(pricing_service, "quote_valid_until", fixed_valid_until)
    monkeypatch.setattr(pricing_service, "persist_normalized_quote", noop_persist)

    result = await create_pricing_quote(payload=payload(), auth=auth())

    serialized = str(result)
    assert "costFloor" not in serialized
    assert "internalMargin" not in serialized
    assert "ruleId" not in serialized
    assert result["breakdown"]["promoDiscount"] == 1.0


def test_rate_limit_remains_active():
    source = Path("services/python-services/api/pricing.py").read_text()

    assert '@limiter.limit("30/minute")' in source
    assert '@limiter.limit("120/hour", key_func=tenant_rate_limit_key)' in source


@pytest.mark.asyncio
async def test_internal_evaluate_quote_errors_return_safe_api_errors(monkeypatch):
    async def fail_evaluate(**kwargs):
        raise RuntimeError("secret pricing stack trace")

    monkeypatch.setattr(pricing_service, "validate_promo_code", noop_validate)
    monkeypatch.setattr(pricing_service, "evaluate_quote", fail_evaluate)

    with pytest.raises(HTTPException) as exc:
        await create_pricing_quote(payload=payload(), auth=auth())

    assert exc.value.status_code == 503
    assert exc.value.detail == "Unable to calculate quote"
    assert "secret" not in exc.value.detail
