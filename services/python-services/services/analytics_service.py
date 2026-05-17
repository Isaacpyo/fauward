import asyncio
import inspect
import json
import logging
from collections.abc import Awaitable, Callable
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any

from fastapi import HTTPException, Request, status

import db
from api.auth import AuthContext

logger = logging.getLogger(__name__)

MAX_SUMMARY_DAYS = 365
DEFAULT_SUMMARY_DAYS = 30
DEFAULT_COHORT_LIMIT = 52
MAX_COHORT_LIMIT = 260
LIVE_POLL_SECONDS = 30
LIVE_HEARTBEAT_SECONDS = 15

RedisGetter = Callable[[str], Any | Awaitable[Any]]

_churn_risk_column_exists: bool | None = None


def tenant_rate_limit_key(request: Request) -> str:
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        import hashlib

        digest = hashlib.sha256(authorization.encode("utf-8")).hexdigest()
        return f"api-key:{digest}"
    client = request.client.host if request.client else "unknown"
    return f"ip:{client}"


def resolve_effective_tenant_id(auth: AuthContext, requested_tenant_id: str) -> str:
    return requested_tenant_id if auth.is_super_admin else auth.tenant_id


def validate_summary_range(date_from: date | None, date_to: date | None) -> tuple[date, date]:
    end = date_to or date.today()
    start = date_from or (end - timedelta(days=DEFAULT_SUMMARY_DAYS - 1))
    if start > end:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="dateFrom must be on or before dateTo")
    if (end - start).days + 1 > MAX_SUMMARY_DAYS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Date range cannot exceed 365 days")
    return start, end


def _decimal(value: Any) -> Decimal:
    if value is None:
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return Decimal("0")


def _int(value: Any) -> int:
    if value is None:
        return 0
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def money_float(value: Any) -> float:
    rounded = _decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return float(rounded)


def _rate_float(value: Any) -> float:
    rounded = _decimal(value).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    return float(rounded)


async def analytics_summary(*, auth: AuthContext, tenant_id: str, date_from: date | None, date_to: date | None) -> dict[str, Any]:
    effective_tenant_id = resolve_effective_tenant_id(auth, tenant_id)
    start, end = validate_summary_range(date_from, date_to)
    rows = await db.fetch(
        """
        select date, shipments_total, on_time_rate, revenue_total, avg_delivery_hours
        from analytics_snapshots
        where tenant_id = $1 and date >= $2 and date <= $3
        order by date asc
        """,
        effective_tenant_id,
        start,
        end,
    )
    return build_summary_response(rows)


def build_summary_response(rows: list[Any]) -> dict[str, Any]:
    shipments_total = sum(_int(row["shipments_total"]) for row in rows)
    revenue_total = sum((_decimal(row["revenue_total"]) for row in rows), Decimal("0"))
    weighted_on_time = (
        sum(_decimal(row["on_time_rate"]) * _int(row["shipments_total"]) for row in rows) / Decimal(shipments_total)
        if shipments_total
        else Decimal("0")
    )
    weighted_delivery_hours = (
        sum(_decimal(row["avg_delivery_hours"]) * _int(row["shipments_total"]) for row in rows) / Decimal(shipments_total)
        if shipments_total
        else Decimal("0")
    )
    return {
        "shipmentsTotal": shipments_total,
        "onTimeRate": _rate_float(weighted_on_time),
        "revenueTotal": money_float(revenue_total),
        "avgDeliveryHours": _rate_float(weighted_delivery_hours),
        "dailySeries": [
            {
                "date": row["date"].isoformat(),
                "shipments": _int(row["shipments_total"]),
                "revenue": money_float(row["revenue_total"]),
            }
            for row in rows
        ],
    }


async def cohort_metrics(*, auth: AuthContext, tenant_id: str, limit: int, offset: int) -> dict[str, Any]:
    effective_tenant_id = resolve_effective_tenant_id(auth, tenant_id)
    bounded_limit = min(max(limit, 1), MAX_COHORT_LIMIT)
    bounded_offset = max(offset, 0)
    rows = await db.fetch(
        """
        select signup_week, metrics
        from cohort_metrics
        where tenant_id = $1
        order by signup_week desc
        limit $2 offset $3
        """,
        effective_tenant_id,
        bounded_limit,
        bounded_offset,
    )
    return {
        "tenantId": effective_tenant_id,
        "cohorts": [
            {
                "signupWeek": row["signup_week"].isoformat(),
                "metrics": dict(row["metrics"] or {}) if isinstance(row["metrics"], dict) else {},
            }
            for row in rows
        ],
    }


def _utc_day_range(now: datetime | None = None) -> tuple[datetime, datetime]:
    # TODO: Use tenant timezone from tenant settings when it is available to the Python service.
    current = now or datetime.now(UTC)
    start = datetime.combine(current.date(), time.min, tzinfo=UTC)
    return start, start + timedelta(days=1)


async def live_kpi_from_db(tenant_id: str) -> dict[str, Any]:
    start, end = _utc_day_range()
    row = await db.fetchrow(
        """
        select count(*)::int as shipments_today,
               coalesce(sum(price), 0) as revenue_today
        from shipments
        where "tenantId" = $1
          and "createdAt" >= $2
          and "createdAt" < $3
        """,
        tenant_id,
        start,
        end,
    )
    return normalize_live_payload(
        {
            "shipmentsToday": row["shipments_today"] if row else 0,
            "revenueToday": row["revenue_today"] if row else 0,
        }
    )


def normalize_live_payload(value: Any) -> dict[str, Any] | None:
    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="replace")
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except json.JSONDecodeError:
            return None
    if not isinstance(value, dict):
        return None
    return {
        "shipmentsToday": _int(value.get("shipmentsToday", value.get("shipmentsTotal"))),
        "revenueToday": money_float(value.get("revenueToday", value.get("revenueTotal"))),
    }


async def _redis_payload(tenant_id: str, redis_get: RedisGetter | None = None) -> dict[str, Any] | None:
    key = f"analytics:kpi:{tenant_id}"
    try:
        if redis_get is None:
            from workers import redis_client

            client = redis_client(decode_responses=False)
            raw = await asyncio.to_thread(client.get, key)
        else:
            maybe_raw = redis_get(key)
            raw = await maybe_raw if inspect.isawaitable(maybe_raw) else maybe_raw
        return normalize_live_payload(raw)
    except Exception:
        logger.warning("analytics_live_redis_failed", extra={"_tenant_id": tenant_id})
        return None


async def live_payload(tenant_id: str, redis_get: RedisGetter | None = None) -> dict[str, Any]:
    cached = await _redis_payload(tenant_id, redis_get=redis_get)
    if cached is not None:
        return cached
    try:
        return await live_kpi_from_db(tenant_id)
    except Exception:
        logger.warning("analytics_live_db_failed", extra={"_tenant_id": tenant_id})
        return {"shipmentsToday": 0, "revenueToday": 0.0}


def sse_event(data: dict[str, Any], event: str | None = None) -> str:
    prefix = f"event: {event}\n" if event else ""
    return f"{prefix}data: {json.dumps(data, default=str, separators=(',', ':'))}\n\n"


async def analytics_event_stream(
    *,
    tenant_id: str,
    request: Request | None = None,
    redis_get: RedisGetter | None = None,
    poll_seconds: float = LIVE_POLL_SECONDS,
    heartbeat_seconds: float = LIVE_HEARTBEAT_SECONDS,
):
    next_payload_at = 0.0
    loop = asyncio.get_running_loop()
    try:
        while True:
            if request is not None and await request.is_disconnected():
                break
            now = loop.time()
            if now >= next_payload_at:
                yield sse_event(await live_payload(tenant_id, redis_get=redis_get))
                next_payload_at = now + poll_seconds
            else:
                yield sse_event({"status": "ok"}, event="heartbeat")
            await asyncio.sleep(min(heartbeat_seconds, max(next_payload_at - loop.time(), 0.1)))
    except asyncio.CancelledError:
        logger.info("analytics_live_cancelled", extra={"_tenant_id": tenant_id})
        raise


async def churn_risk_column_available() -> bool:
    global _churn_risk_column_exists
    if _churn_risk_column_exists is None:
        _churn_risk_column_exists = await db.column_exists("tenants", "churnRisk")
    return _churn_risk_column_exists


async def churn_risk_tenants() -> dict[str, Any]:
    if not await churn_risk_column_available():
        return {"tenants": []}
    rows = await db.fetch(
        """
        select id, name, slug, "churnRisk" as churn_risk
        from tenants
        where "churnRisk" = 'AT_RISK'
        order by name asc
        """
    )
    return {
        "tenants": [
            {
                "id": row["id"],
                "name": row["name"],
                "slug": row["slug"],
                "churnRisk": row["churn_risk"],
            }
            for row in rows
        ]
    }
