import logging
from typing import Any
from uuid import uuid4

import db
from api.auth import AuthContext

logger = logging.getLogger(__name__)

SUPPORTED_MODELS = [
    "delivery_delay",
    "tenant_churn",
    "lead_score",
    "eta_prediction",
    "sla_breach",
    "customs_delay",
    "route_risk",
    "shipment_anomaly",
    "demand_forecast",
    "pricing_recommendation",
    "customer_ltv",
    "support_ticket_classifier",
    "next_best_action",
]

RETRAIN_TASKS = {
    "delivery_delay": "workers.ml_worker.train_delay_model",
    "tenant_churn": "workers.ml_worker.train_churn_model",
    "lead_score": "workers.ml_worker.train_lead_model",
}


def retrain_task_for(model_name: str) -> str | None:
    return RETRAIN_TASKS.get(model_name)


async def list_model_status(auth: AuthContext) -> list[dict[str, Any]]:
    rows = await db.fetch(
        """
        select name, status, version, last_trained_at, metrics
        from ml_models
        where name = any($1::text[])
        """,
        SUPPORTED_MODELS,
    )
    stored = {row["name"]: dict(row) for row in rows}
    models: list[dict[str, Any]] = []
    for name in SUPPORTED_MODELS:
        row = stored.get(name, {})
        models.append(
            {
                "name": name,
                "status": row.get("status") or ("active" if name in RETRAIN_TASKS else "available"),
                "version": row.get("version"),
                "lastTrainedAt": row.get("last_trained_at"),
                "metrics": dict(row.get("metrics") or {}) if auth.is_super_admin else {},
            }
        )
    return models


async def log_retrain_audit(
    *,
    auth: AuthContext,
    model_name: str,
    task_id: str,
    actor_ip: str | None = None,
) -> None:
    try:
        if not await db.table_exists("audit_log"):
            logger.info("audit_log_unavailable", extra={"_action": "ml_model_retrain_queued"})
            return
        await db.execute(
            """
            insert into audit_log (
              id, "tenantId", "actorId", "actorType", "actorIp",
              action, "resourceType", "resourceId", metadata, timestamp
            )
            values ($1, $2, null, 'SUPER_ADMIN', $3, $4, 'ml_model', $5, $6::jsonb, now())
            """,
            str(uuid4()),
            auth.tenant_id,
            actor_ip,
            "ml_model_retrain_queued",
            model_name,
            db.json_dumps({"modelName": model_name, "taskId": task_id}),
        )
    except Exception:
        logger.warning("ml_retrain_audit_failed", extra={"_model_name": model_name, "_task_id": task_id})


def celery_status_payload(task_id: str, state: str, result: Any) -> dict[str, Any]:
    normalized = {
        "PENDING": "queued",
        "RECEIVED": "queued",
        "STARTED": "running",
        "RETRY": "running",
        "SUCCESS": "completed",
        "FAILURE": "failed",
        "REVOKED": "failed",
    }.get(state, "unknown")
    safe_result: dict[str, Any] | None = None
    if normalized == "completed":
        safe_result = result if isinstance(result, dict) else {"value": str(result)}
    elif normalized == "failed":
        safe_result = {"error": str(result)[:500] if result else "Task failed"}
    return {"taskId": task_id, "status": normalized, "result": safe_result}
