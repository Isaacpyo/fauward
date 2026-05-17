from datetime import date, timedelta
from decimal import Decimal

import pytest
from fastapi import HTTPException

import db
from api.auth import AuthContext, require_super_admin
from services import analytics_service
from services.analytics_service import (
    analytics_event_stream,
    analytics_summary,
    build_summary_response,
    cohort_metrics,
    live_payload,
    validate_summary_range,
)


def auth(tenant_id: str = "tenant_a", scopes: list[str] | None = None) -> AuthContext:
    return AuthContext(tenant_id=tenant_id, scopes=scopes or [])


def row(**values):
    return values


@pytest.mark.asyncio
async def test_normal_tenant_can_fetch_own_analytics_summary(monkeypatch):
    calls = []

    async def fake_fetch(query, *args):
        calls.append(args)
        return [row(date=date(2026, 5, 1), shipments_total=2, on_time_rate=50, revenue_total=Decimal("12.30"), avg_delivery_hours=4)]

    monkeypatch.setattr(db, "fetch", fake_fetch)

    result = await analytics_summary(auth=auth("tenant_a"), tenant_id="tenant_a", date_from=date(2026, 5, 1), date_to=date(2026, 5, 1))

    assert calls[0][0] == "tenant_a"
    assert result["shipmentsTotal"] == 2
    assert result["revenueTotal"] == 12.3


@pytest.mark.asyncio
async def test_normal_tenant_cannot_fetch_another_tenants_analytics(monkeypatch):
    calls = []

    async def fake_fetch(query, *args):
        calls.append(args)
        return []

    monkeypatch.setattr(db, "fetch", fake_fetch)

    await analytics_summary(auth=auth("tenant_a"), tenant_id="tenant_b", date_from=date(2026, 5, 1), date_to=date(2026, 5, 1))

    assert calls[0][0] == "tenant_a"


@pytest.mark.asyncio
async def test_super_admin_can_fetch_another_tenants_analytics(monkeypatch):
    calls = []

    async def fake_fetch(query, *args):
        calls.append(args)
        return []

    monkeypatch.setattr(db, "fetch", fake_fetch)

    await analytics_summary(auth=auth("platform", ["super_admin"]), tenant_id="tenant_b", date_from=date(2026, 5, 1), date_to=date(2026, 5, 1))

    assert calls[0][0] == "tenant_b"


def test_summary_rejects_date_from_after_date_to():
    with pytest.raises(HTTPException) as exc:
        validate_summary_range(date(2026, 5, 2), date(2026, 5, 1))
    assert exc.value.status_code == 400


def test_summary_rejects_date_ranges_over_max_allowed_range():
    with pytest.raises(HTTPException) as exc:
        validate_summary_range(date(2025, 1, 1), date(2026, 1, 1))
    assert exc.value.status_code == 400


def test_avg_delivery_hours_and_on_time_rate_are_weighted_by_shipments_total():
    result = build_summary_response(
        [
            row(date=date(2026, 5, 1), shipments_total=1, on_time_rate=100, revenue_total=Decimal("10"), avg_delivery_hours=10),
            row(date=date(2026, 5, 2), shipments_total=9, on_time_rate=0, revenue_total=Decimal("90"), avg_delivery_hours=20),
        ]
    )

    assert result["avgDeliveryHours"] == 19.0
    assert result["onTimeRate"] == 10.0
    assert result["revenueTotal"] == 100.0


def test_daily_series_serializes_null_revenue_and_shipments_safely():
    result = build_summary_response(
        [row(date=date(2026, 5, 1), shipments_total=None, on_time_rate=None, revenue_total=None, avg_delivery_hours=None)]
    )

    assert result["dailySeries"] == [{"date": "2026-05-01", "shipments": 0, "revenue": 0.0}]


@pytest.mark.asyncio
async def test_cohorts_returns_metrics_nested_and_cannot_overwrite_signup_week(monkeypatch):
    async def fake_fetch(query, *args):
        return [
            row(
                signup_week=date(2026, 4, 27),
                metrics={"signupWeek": "attacker", "shipments_week_1": 4},
            )
        ]

    monkeypatch.setattr(db, "fetch", fake_fetch)

    result = await cohort_metrics(auth=auth("tenant_a"), tenant_id="tenant_a", limit=52, offset=0)

    assert result["cohorts"] == [
        {
            "signupWeek": "2026-04-27",
            "metrics": {"signupWeek": "attacker", "shipments_week_1": 4},
        }
    ]


@pytest.mark.asyncio
async def test_cohorts_respects_limit_and_offset(monkeypatch):
    calls = []

    async def fake_fetch(query, *args):
        calls.append((query, args))
        return []

    monkeypatch.setattr(db, "fetch", fake_fetch)

    await cohort_metrics(auth=auth("tenant_a"), tenant_id="tenant_a", limit=20, offset=40)

    assert "limit $2 offset $3" in calls[0][0]
    assert calls[0][1] == ("tenant_a", 20, 40)


@pytest.mark.asyncio
async def test_cohorts_handles_null_metrics_safely(monkeypatch):
    async def fake_fetch(query, *args):
        return [row(signup_week=date(2026, 4, 27), metrics=None)]

    monkeypatch.setattr(db, "fetch", fake_fetch)

    result = await cohort_metrics(auth=auth("tenant_a"), tenant_id="tenant_a", limit=52, offset=0)

    assert result["cohorts"] == [{"signupWeek": "2026-04-27", "metrics": {}}]


@pytest.mark.asyncio
async def test_live_stream_returns_valid_sse_data():
    stream = analytics_event_stream(
        tenant_id="tenant_a",
        redis_get=lambda key: b'{"shipmentsToday":3,"revenueToday":12.34}',
        poll_seconds=60,
        heartbeat_seconds=60,
    )
    event = await stream.__anext__()
    await stream.aclose()

    assert event == 'data: {"shipmentsToday":3,"revenueToday":12.34}\n\n'


@pytest.mark.asyncio
async def test_live_stream_decodes_redis_bytes_correctly():
    result = await live_payload("tenant_a", redis_get=lambda key: b'{"shipmentsToday":7,"revenueToday":"19.995"}')

    assert result == {"shipmentsToday": 7, "revenueToday": 20.0}


@pytest.mark.asyncio
async def test_live_stream_falls_back_to_db_when_redis_has_no_data(monkeypatch):
    async def fake_db_payload(tenant_id):
        return {"shipmentsToday": 5, "revenueToday": 11.25}

    monkeypatch.setattr(analytics_service, "live_kpi_from_db", fake_db_payload)

    result = await live_payload("tenant_a", redis_get=lambda key: None)

    assert result == {"shipmentsToday": 5, "revenueToday": 11.25}


@pytest.mark.asyncio
async def test_live_stream_handles_redis_failure_safely(monkeypatch):
    async def fake_db_payload(tenant_id):
        return {"shipmentsToday": 2, "revenueToday": 3.5}

    def fail_redis(key):
        raise RuntimeError("redis down")

    monkeypatch.setattr(analytics_service, "live_kpi_from_db", fake_db_payload)

    result = await live_payload("tenant_a", redis_get=fail_redis)

    assert result == {"shipmentsToday": 2, "revenueToday": 3.5}


@pytest.mark.asyncio
async def test_churn_risk_requires_super_admin():
    with pytest.raises(HTTPException) as exc:
        await require_super_admin(auth("tenant_a"))
    assert exc.value.status_code == 403


def test_default_summary_range_is_last_30_days():
    end = date.today()
    start, actual_end = validate_summary_range(None, end)

    assert actual_end == end
    assert start == end - timedelta(days=29)
