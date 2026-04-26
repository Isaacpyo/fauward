import asyncio
from datetime import UTC, datetime
from typing import Any

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression

import db
from celery_app import celery_app
from lib.model_registry import model_registry
from workers import run_worker


def risk_label(probability: float) -> str:
    if probability >= 0.65:
        return "HIGH"
    if probability >= 0.35:
        return "MEDIUM"
    return "LOW"


def lead_priority(probability: float) -> str:
    if probability >= 0.65:
        return "HOT"
    if probability >= 0.35:
        return "WARM"
    return "COLD"


def _region(address: Any) -> str:
    if isinstance(address, dict):
        value = address.get("region") or address.get("postcode") or address.get("city") or "UNKNOWN"
        return str(value).upper()[:8]
    return "UNKNOWN"


def _days_since(value: datetime | None) -> int:
    if value is None:
        return 999
    now = datetime.now(value.tzinfo) if value.tzinfo else datetime.utcnow()
    return max((now - value).days, 0)


def _encode(frame: pd.DataFrame) -> pd.DataFrame:
    return pd.get_dummies(frame.fillna(0))


def _predict_artifact(model_name: str, features: pd.DataFrame) -> float | None:
    artifact = model_registry.load_latest(model_name)
    if not artifact:
        return None
    encoded = _encode(features)
    for column in artifact["feature_columns"]:
        if column not in encoded:
            encoded[column] = 0
    encoded = encoded[artifact["feature_columns"]]
    return float(artifact["model"].predict_proba(encoded)[0][1])


async def _save_prediction(
    *,
    tenant_id: str | None,
    entity_type: str,
    entity_id: str,
    model_name: str,
    score: float,
    label: str,
    payload: dict[str, Any],
) -> None:
    await db.execute(
        """
        insert into prediction_results (tenant_id, entity_type, entity_id, model_name, score, label, payload, updated_at)
        values ($1, $2, $3, $4, $5, $6, $7::jsonb, now())
        on conflict (entity_type, entity_id, model_name) do update
        set score = excluded.score,
            label = excluded.label,
            payload = excluded.payload,
            updated_at = now()
        """,
        tenant_id,
        entity_type,
        entity_id,
        model_name,
        score,
        label,
        db.json_dumps(payload),
    )


async def _train_delay_model() -> dict[str, Any]:
    rows = await db.fetch(
        """
        select
          "originAddress", "destinationAddress", coalesce("weightKg", 0) as weight_kg,
          coalesce("insuranceValue", 0) as declared_value,
          extract(dow from "createdAt")::int as day_of_week,
          extract(hour from "createdAt")::int as hour_created,
          coalesce("assignedDriverId", 'unknown') as carrier_id,
          ("actualDelivery" > "estimatedDelivery") as is_delayed
        from shipments
        where "actualDelivery" is not null and "estimatedDelivery" is not null
        """
    )
    if len(rows) < 20:
        return {"trained": False, "reason": "not_enough_shipments"}
    frame = pd.DataFrame([dict(row) for row in rows])
    y = frame.pop("is_delayed").astype(int)
    if y.nunique() < 2:
        return {"trained": False, "reason": "single_class_labels"}
    frame["origin_region"] = frame.pop("originAddress").map(_region)
    frame["dest_region"] = frame.pop("destinationAddress").map(_region)
    frame["route_historical_on_time_rate"] = 0.85
    frame["weather_disruption_flag"] = False
    encoded = _encode(frame)
    try:
        from xgboost import XGBClassifier

        model: Any = XGBClassifier(
            n_estimators=80,
            max_depth=4,
            learning_rate=0.08,
            eval_metric="logloss",
        )
    except Exception:
        model = RandomForestClassifier(n_estimators=80, random_state=42)
    model.fit(encoded, y)
    url = model_registry.save("delivery_delay", {"model": model, "feature_columns": list(encoded.columns)})
    return {"trained": True, "samples": len(rows), "url": url}


async def _tenant_churn_features() -> pd.DataFrame:
    tenants = await db.fetch(
        """
        select id, plan, extract(month from age(now(), "createdAt"))::int as months_active
        from tenants
        where status in ('ACTIVE', 'TRIALING')
        """
    )
    rows: list[dict[str, Any]] = []
    for tenant in tenants:
        tenant_id = tenant["id"]
        monthly = await db.fetch(
            """
            select date_trunc('month', "createdAt")::date as month, count(*)::int as count
            from shipments
            where "tenantId" = $1 and "createdAt" >= now() - interval '90 days'
            group by 1
            order by 1
            """,
            tenant_id,
        )
        counts = np.array([row["count"] for row in monthly] or [0], dtype=float)
        trend = float(np.polyfit(np.arange(len(counts)), counts, 1)[0]) if len(counts) > 1 else 0.0
        last_shipment = await db.fetchval(
            """select max("createdAt") from shipments where "tenantId" = $1""",
            tenant_id,
        )
        days_since = _days_since(last_shipment)
        support_open = await db.fetchval(
            """select count(*)::int from support_tickets where "tenantId" = $1 and status in ('OPEN', 'IN_PROGRESS')""",
            tenant_id,
        )
        overdue = await db.fetchval(
            """select count(*)::int from invoices where "tenantId" = $1 and status = 'OVERDUE'""",
            tenant_id,
        )
        rows.append(
            {
                "tenant_id": tenant_id,
                "avg_monthly_shipments": float(counts.mean()),
                "shipment_trend": trend,
                "days_since_last_shipment": days_since,
                "support_tickets_open": support_open or 0,
                "invoice_overdue_count": overdue or 0,
                "plan": {"STARTER": 0, "PRO": 1, "ENTERPRISE": 2}.get(str(tenant["plan"]), 0),
                "months_active": tenant["months_active"] or 0,
            }
        )
    return pd.DataFrame(rows)


async def _train_churn_model() -> dict[str, Any]:
    features = await _tenant_churn_features()
    if len(features) < 10:
        return {"trained": False, "reason": "not_enough_tenants"}
    y = ((features["days_since_last_shipment"] > 60) | (features["shipment_trend"] < -3)).astype(int)
    if y.nunique() < 2:
        return {"trained": False, "reason": "single_class_labels"}
    x = features.drop(columns=["tenant_id"])
    model = LogisticRegression(max_iter=500, class_weight="balanced")
    model.fit(x, y)
    url = model_registry.save("tenant_churn", {"model": model, "feature_columns": list(x.columns)})
    return {"trained": True, "samples": len(features), "url": url}


async def _train_lead_model() -> dict[str, Any]:
    rows = await db.fetch(
        """
        select
          id,
          coalesce(source, 'unknown') as source_channel,
          coalesce(stage, 'PROSPECT') as stage,
          coalesce(company, 'unknown') as company,
          "createdAt",
          "wonAt"
        from leads
        """
    )
    if len(rows) < 20:
        return {"trained": False, "reason": "not_enough_leads"}
    frame = pd.DataFrame([dict(row) for row in rows])
    y = (frame.pop("stage") == "WON").astype(int)
    if y.nunique() < 2:
        return {"trained": False, "reason": "single_class_labels"}
    features = pd.DataFrame(
        {
            "company_size_bucket": "unknown",
            "industry": "unknown",
            "monthly_shipment_estimate": 0,
            "source_channel": frame["source_channel"],
            "days_to_respond": [
                max((row["wonAt"] - row["createdAt"]).days, 0) if row["wonAt"] else 30 for _, row in frame.iterrows()
            ],
        }
    )
    encoded = _encode(features)
    model = RandomForestClassifier(n_estimators=100, random_state=42)
    model.fit(encoded, y)
    url = model_registry.save("lead_score", {"model": model, "feature_columns": list(encoded.columns)})
    return {"trained": True, "samples": len(rows), "url": url}


async def _score_shipment(row: dict[str, Any]) -> dict[str, Any]:
    features = pd.DataFrame(
        [
            {
                "weight_kg": float(row.get("weightKg") or 0),
                "declared_value": float(row.get("insuranceValue") or 0),
                "day_of_week": int(row["createdAt"].weekday()),
                "hour_created": int(row["createdAt"].hour),
                "carrier_id": row.get("assignedDriverId") or "unknown",
                "origin_region": _region(row.get("originAddress")),
                "dest_region": _region(row.get("destinationAddress")),
                "route_historical_on_time_rate": 0.85,
                "weather_disruption_flag": False,
            }
        ]
    )
    probability = _predict_artifact("delivery_delay", features)
    if probability is None:
        probability = min(0.9, 0.15 + float(row.get("weightKg") or 0) / 100)
    label = risk_label(probability)
    payload = {"delayProbability": round(probability, 4), "riskLevel": label}
    await _save_prediction(
        tenant_id=row.get("tenantId"),
        entity_type="shipment",
        entity_id=row["id"],
        model_name="delivery_delay",
        score=probability,
        label=label,
        payload=payload,
    )
    return payload


async def _score_all_shipments() -> dict[str, int]:
    rows = await db.fetch(
        """
        select id, "tenantId", "originAddress", "destinationAddress", "weightKg", "insuranceValue",
               "createdAt", "assignedDriverId"
        from shipments
        where status in ('PENDING', 'IN_TRANSIT')
        """
    )
    for row in rows:
        await _score_shipment(dict(row))
    return {"shipments": len(rows)}


async def _score_all_tenants() -> dict[str, int]:
    features = await _tenant_churn_features()
    if features.empty:
        return {"tenants": 0}
    artifact = model_registry.load_latest("tenant_churn")
    x = features.drop(columns=["tenant_id"])
    for _, row in features.iterrows():
        if artifact:
            probability = float(artifact["model"].predict_proba(pd.DataFrame([row.drop(labels=["tenant_id"])]))[0][1])
        else:
            probability = min(0.9, max(0.05, row["days_since_last_shipment"] / 120))
        label = risk_label(probability)
        payload = {"churnProbability": round(probability, 4), "riskTier": label}
        await _save_prediction(
            tenant_id=str(row["tenant_id"]),
            entity_type="tenant",
            entity_id=str(row["tenant_id"]),
            model_name="tenant_churn",
            score=probability,
            label=label,
            payload=payload,
        )
    return {"tenants": len(features)}


async def _score_all_leads() -> dict[str, int]:
    rows = await db.fetch(
        """
        select id, "tenantId", coalesce(source, 'unknown') as source_channel, "createdAt"
        from leads
        where stage not in ('WON', 'LOST')
        """
    )
    for row in rows:
        features = pd.DataFrame(
            [
                {
                    "company_size_bucket": "unknown",
                    "industry": "unknown",
                    "monthly_shipment_estimate": 0,
                    "source_channel": row["source_channel"],
                    "days_to_respond": _days_since(row["createdAt"]),
                }
            ]
        )
        probability = _predict_artifact("lead_score", features)
        if probability is None:
            probability = 0.45
        label = lead_priority(probability)
        payload = {"conversionProbability": round(probability, 4), "priority": label}
        await _save_prediction(
            tenant_id=row["tenantId"],
            entity_type="lead",
            entity_id=row["id"],
            model_name="lead_score",
            score=probability,
            label=label,
            payload=payload,
        )
    return {"leads": len(rows)}


async def handle_ml_score_job(payload: dict[str, Any]) -> dict[str, Any]:
    entity_type = str(payload.get("entityType") or "")
    if entity_type == "shipment":
        row = await db.fetchrow(
            """
            select id, "tenantId", "originAddress", "destinationAddress", "weightKg", "insuranceValue",
                   "createdAt", "assignedDriverId"
            from shipments
            where id = $1
            """,
            payload["shipmentId"],
        )
        if not row:
            raise ValueError("Shipment not found")
        return await _score_shipment(dict(row))
    if entity_type == "tenant":
        await _score_all_tenants()
        return {"status": "scored"}
    if entity_type == "lead":
        await _score_all_leads()
        return {"status": "scored"}
    raise ValueError("Unsupported ML score entityType")


@celery_app.task(name="workers.ml_worker.process_ml_score_job", queue="ml")
def process_ml_score_job(payload: dict[str, Any]) -> dict[str, Any]:
    return run_worker(
        worker_name="ml_worker",
        done_queue="fauward:ml:done",
        payload=payload,
        handler=handle_ml_score_job,
    )


@celery_app.task(name="workers.ml_worker.train_delay_model", queue="ml")
def train_delay_model() -> dict[str, Any]:
    async def runner() -> dict[str, Any]:
        await db.connect_db()
        return await _train_delay_model()

    return asyncio.run(runner())


@celery_app.task(name="workers.ml_worker.train_churn_model", queue="ml")
def train_churn_model() -> dict[str, Any]:
    async def runner() -> dict[str, Any]:
        await db.connect_db()
        return await _train_churn_model()

    return asyncio.run(runner())


@celery_app.task(name="workers.ml_worker.train_lead_model", queue="ml")
def train_lead_model() -> dict[str, Any]:
    async def runner() -> dict[str, Any]:
        await db.connect_db()
        return await _train_lead_model()

    return asyncio.run(runner())


@celery_app.task(name="workers.ml_worker.score_all_shipments", queue="ml")
def score_all_shipments() -> dict[str, int]:
    async def runner() -> dict[str, int]:
        await db.connect_db()
        return await _score_all_shipments()

    return asyncio.run(runner())


@celery_app.task(name="workers.ml_worker.score_all_tenants", queue="ml")
def score_all_tenants() -> dict[str, int]:
    async def runner() -> dict[str, int]:
        await db.connect_db()
        return await _score_all_tenants()

    return asyncio.run(runner())


@celery_app.task(name="workers.ml_worker.score_all_leads", queue="ml")
def score_all_leads() -> dict[str, int]:
    async def runner() -> dict[str, int]:
        await db.connect_db()
        return await _score_all_leads()

    return asyncio.run(runner())
