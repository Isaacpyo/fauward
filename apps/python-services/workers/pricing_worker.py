import asyncio
import math
from datetime import UTC, datetime
from typing import Any

import numpy as np
import pandas as pd
import redis
from sklearn.linear_model import LogisticRegression

import db
from celery_app import celery_app
from config import settings
from lib.model_registry import model_registry
from workers import run_worker


def _redis() -> redis.Redis:
    return redis.Redis.from_url(settings.redis_url, decode_responses=True)


def _region_from_postcode(postcode: str) -> str:
    return "".join(ch for ch in postcode.upper().strip().split(" ")[0] if ch.isalpha())[:3] or "DEFAULT"


def _money(value: float) -> float:
    return round(float(value), 2)


async def evaluate_quote(
    *,
    tenant_id: str,
    origin_postcode: str,
    dest_postcode: str,
    weight_kg: float,
    promo_code: str | None = None,
) -> dict[str, Any]:
    origin_region = _region_from_postcode(origin_postcode)
    dest_region = _region_from_postcode(dest_postcode)
    rate = await db.fetchrow(
        """
        select "basePrice", "pricePerKg", currency
        from rate_cards
        where "tenantId" = $1
          and "isActive" = true
          and ("effectiveFrom" is null or "effectiveFrom" <= now())
          and ("effectiveTo" is null or "effectiveTo" >= now())
        order by "createdAt" desc
        limit 1
        """,
        tenant_id,
    )
    base_price = float(rate["basePrice"]) if rate else 5.0
    price_per_kg = float(rate["pricePerKg"]) if rate else 1.25
    currency = str(rate["currency"]) if rate else "GBP"
    base = base_price + (price_per_kg * weight_kg)
    surcharges: list[dict[str, Any]] = []

    if weight_kg > 20:
        surcharges.append({"name": "Heavy parcel", "amount": _money((weight_kg - 20) * 1.5), "type": "weight"})
    elif weight_kg > 5:
        surcharges.append({"name": "Medium parcel", "amount": _money((weight_kg - 5) * 0.75), "type": "weight"})

    rows = await db.fetch(
        """
        select name, type, condition, value
        from surcharges
        where "tenantId" = $1 and "isEnabled" = true
        """,
        tenant_id,
    )
    remote_area = False
    if await db.table_exists("remote_zones"):
        remote_area = bool(
            await db.fetchval(
                "select 1 from remote_zones where tenant_id = $1 and postcode = $2 limit 1",
                tenant_id,
                dest_postcode.upper().replace(" ", ""),
            )
        )
    for row in rows:
        condition = str(row["condition"])
        kind = str(row["type"])
        value = float(row["value"])
        applies = condition == "ALWAYS" or condition == "FUEL" or (condition == "REMOTE_AREA" and remote_area)
        if not applies:
            continue
        if kind in {"PERCENT_OF_BASE", "PERCENT_OF_TOTAL"}:
            amount = base * value
        elif kind == "PER_KG":
            amount = weight_kg * value
        else:
            amount = value
        surcharges.append({"name": row["name"], "amount": _money(amount), "type": condition.lower()})

    subtotal = base + sum(item["amount"] for item in surcharges)
    promo_discount = 0.0
    if promo_code:
        promo = await db.fetchrow(
            """
            select type, value, "minOrderValue", "maxDiscountValue", "maxUses", "usedCount", "expiresAt"
            from promo_codes
            where "tenantId" = $1
              and upper(code) = upper($2)
              and "isEnabled" = true
              and ("expiresAt" is null or "expiresAt" > now())
            limit 1
            """,
            tenant_id,
            promo_code,
        )
        if promo and (promo["maxUses"] is None or promo["usedCount"] < promo["maxUses"]):
            min_order = float(promo["minOrderValue"] or 0)
            if subtotal >= min_order:
                if promo["type"] == "PERCENT_OFF":
                    promo_discount = subtotal * (float(promo["value"]) / 100)
                else:
                    promo_discount = float(promo["value"])
                if promo["maxDiscountValue"] is not None:
                    promo_discount = min(promo_discount, float(promo["maxDiscountValue"]))
    total = max(0.0, subtotal - promo_discount)
    demand_signal = _redis().get(f"pricing:demand:{origin_region}:{dest_region}") or "NORMAL"
    acceptance_probability = predict_acceptance_probability(
        demand_signal=demand_signal,
        weight_kg=weight_kg,
        tenant_plan="PRO",
        price=total,
    )
    if acceptance_probability < 0.4:
        suggested_adjustment = -0.08
    elif demand_signal == "HIGH":
        suggested_adjustment = 0.05
    else:
        suggested_adjustment = 0.0
    return {
        "base": _money(base),
        "surcharges": surcharges,
        "promoDiscount": _money(promo_discount),
        "total": _money(total * (1 + suggested_adjustment)),
        "currency": currency,
        "demandSignal": demand_signal,
        "acceptanceProbability": round(acceptance_probability, 4),
    }


def predict_acceptance_probability(
    *,
    demand_signal: str,
    weight_kg: float,
    tenant_plan: str,
    price: float,
) -> float:
    artifact = model_registry.load_latest("pricing_acceptance")
    now = datetime.now(UTC)
    features = pd.DataFrame(
        [
            {
                "route_demand_signal": demand_signal,
                "day_of_week": now.weekday(),
                "hour_of_day": now.hour,
                "weight_kg": weight_kg,
                "tenant_plan": tenant_plan,
                "historical_acceptance_rate": 0.5,
                "price": price,
            }
        ]
    )
    if artifact:
        encoded = pd.get_dummies(features)
        for column in artifact["feature_columns"]:
            if column not in encoded:
                encoded[column] = 0
        encoded = encoded[artifact["feature_columns"]]
        return float(artifact["model"].predict_proba(encoded)[0][1])
    demand_factor = {"HIGH": 0.15, "NORMAL": 0.0, "LOW": -0.05}.get(demand_signal, 0.0)
    z = 1.4 - (price / 120) - (weight_kg / 80) + demand_factor
    return 1 / (1 + math.exp(-z))


async def _refresh_demand_signals() -> dict[str, int]:
    rows = await db.fetch(
        """
        select
          coalesce(("originAddress"->>'postcode'), 'UNKNOWN') as origin_postcode,
          coalesce(("destinationAddress"->>'postcode'), 'UNKNOWN') as dest_postcode,
          count(*)::int as volume
        from shipments
        where "createdAt" >= now() - interval '7 days'
        group by 1, 2
        """
    )
    if not rows:
        return {"routes": 0}
    volumes = np.array([row["volume"] for row in rows], dtype=float)
    high_threshold = float(np.percentile(volumes, 90))
    low_threshold = float(np.percentile(volumes, 25))
    client = _redis()
    for row in rows:
        origin = _region_from_postcode(row["origin_postcode"])
        dest = _region_from_postcode(row["dest_postcode"])
        signal = "HIGH" if row["volume"] >= high_threshold else "LOW" if row["volume"] <= low_threshold else "NORMAL"
        client.setex(f"pricing:demand:{origin}:{dest}", 3600, signal)
    return {"routes": len(rows)}


async def _retrain_pricing_model() -> dict[str, Any]:
    rows = await db.fetch(
        """
        select
          coalesce(shipmentData->>'routeDemandSignal', 'NORMAL') as route_demand_signal,
          extract(dow from "createdAt")::int as day_of_week,
          extract(hour from "createdAt")::int as hour_of_day,
          coalesce((shipmentData->>'weightKg')::numeric, 0) as weight_kg,
          coalesce(shipmentData->>'tenantPlan', 'PRO') as tenant_plan,
          case when status in ('ACCEPTED', 'CONVERTED') then true else false end as was_quote_accepted,
          coalesce(total, 0) as price
        from quotes
        where "createdAt" >= now() - interval '180 days'
        """
    )
    if len(rows) < 20:
        return {"trained": False, "reason": "not_enough_quotes"}
    frame = pd.DataFrame([dict(row) for row in rows])
    y = frame.pop("was_quote_accepted").astype(int)
    if y.nunique() < 2:
        return {"trained": False, "reason": "single_class_labels"}
    frame["historical_acceptance_rate"] = float(y.mean())
    encoded = pd.get_dummies(frame)
    model = LogisticRegression(max_iter=500)
    model.fit(encoded, y)
    url = model_registry.save("pricing_acceptance", {"model": model, "feature_columns": list(encoded.columns)})
    return {"trained": True, "samples": len(rows), "url": url}


async def handle_pricing_job(payload: dict[str, Any]) -> dict[str, Any]:
    quote = await evaluate_quote(
        tenant_id=str(payload["tenantId"]),
        origin_postcode=str(payload["originPostcode"]),
        dest_postcode=str(payload["destPostcode"]),
        weight_kg=float(payload["weightKg"]),
        promo_code=payload.get("promoCode"),
    )
    return quote


@celery_app.task(name="workers.pricing_worker.process_pricing_job", queue="pricing")
def process_pricing_job(payload: dict[str, Any]) -> dict[str, Any]:
    return run_worker(
        worker_name="pricing_worker",
        done_queue="fauward:pricing:done",
        payload=payload,
        handler=handle_pricing_job,
    )


@celery_app.task(name="workers.pricing_worker.refresh_demand_signals", queue="pricing")
def refresh_demand_signals() -> dict[str, int]:
    async def runner() -> dict[str, int]:
        await db.connect_db()
        return await _refresh_demand_signals()

    return asyncio.run(runner())


@celery_app.task(name="workers.pricing_worker.retrain_pricing_model", queue="pricing")
def retrain_pricing_model() -> dict[str, Any]:
    async def runner() -> dict[str, Any]:
        await db.connect_db()
        return await _retrain_pricing_model()

    return asyncio.run(runner())
