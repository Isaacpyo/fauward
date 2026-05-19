from __future__ import annotations

import asyncio
import os
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException, status
from starlette.concurrency import run_in_threadpool

from observability.alert_manager import (
    create_alert_event,
    get_alert_events,
    mute_alert,
)
from observability.audit_logger import (
    audit_incident_acknowledge,
    audit_incident_resolve,
    get_audit_events,
    record_audit_event,
)
from observability.business_health import get_business_health_metrics
from observability.env_validator import validate_observability_env
from observability.health_checks import (
    check_http_service,
    check_postgres_connection,
    check_redis_connection,
    check_smtp_connection,
    check_version_endpoint,
)
from observability.incident_manager import (
    acknowledge_incident,
    get_active_incidents,
    get_all_incidents,
    resolve_incident,
)
from observability.integrations import detect_integrations, get_integration_urls
from observability.queue_monitor import get_all_queue_health
from observability.schemas import (
    AcknowledgeRequest,
    AlertEvent,
    AuditEvent,
    BusinessHealthMetrics,
    ConfigWarning,
    IncidentRecord,
    ObservabilitySummary,
    QueueHealth,
    ResolveRequest,
    ServiceCheckResult,
    ServiceStatus,
    WorkerStatus,
)
from observability.worker_monitor import get_all_worker_statuses

router = APIRouter(prefix="/observability", tags=["observability"])

_DEV_MODE = not os.getenv("PYTHON_OBS_API_KEY", "")


def _dev_meta() -> dict[str, Any]:
    return {"dev_mode": True, "note": "Set PYTHON_OBS_API_KEY to require auth"} if _DEV_MODE else {}


# ── Service configuration ──────────────────────────────────────────────────────

def _service_urls() -> list[dict[str, Any]]:
    """Return all monitored service URLs per environment from env vars."""
    return [
        {"id": "main-api",      "name": "Main API",          "local": os.getenv("BACKEND_URL", "http://localhost:3001"),  "prod": os.getenv("PROD_API_URL", "")},
        {"id": "python-api",    "name": "Python API",         "local": "http://localhost:8000",                            "prod": os.getenv("PROD_PYTHON_API_URL", "")},
        {"id": "frontend",      "name": "Frontend",           "local": "http://localhost:5000",                            "prod": os.getenv("PROD_FRONTEND_URL", "")},
        {"id": "tenant-portal", "name": "Tenant Portal",      "local": "http://localhost:5001",                            "prod": os.getenv("PROD_TENANT_PORTAL_URL", "")},
        {"id": "super-admin",   "name": "Super Admin",        "local": "http://localhost:5002",                            "prod": os.getenv("PROD_SUPER_ADMIN_URL", "")},
        {"id": "fauward-go",    "name": "Fauward Go",         "local": "http://localhost:5173",                            "prod": os.getenv("PROD_FAUWARD_GO_URL", "")},
    ]


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _check_all_services(env: str) -> list[ServiceCheckResult]:
    tasks = []
    for svc in _service_urls():
        url = svc.get(env) or svc.get("local", "")
        tasks.append(check_http_service(url, svc["id"], env))

    db_url = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL")
    redis_url = os.getenv("REDIS_URL", "")
    tasks.append(check_postgres_connection(db_url, "postgres", env))
    tasks.append(check_redis_connection(redis_url, "redis", env))

    mailhog_host = "localhost" if env == "local" else None
    tasks.append(check_smtp_connection(mailhog_host, 1025, "mailhog-smtp", env))

    results: list[ServiceCheckResult] = await asyncio.gather(*tasks)
    return results


def _compute_overall_status(results: list[ServiceCheckResult]) -> ServiceStatus:
    statuses = {r.status for r in results}
    if ServiceStatus.down in statuses:
        return ServiceStatus.down
    if ServiceStatus.degraded in statuses:
        return ServiceStatus.degraded
    if ServiceStatus.unknown in statuses:
        return ServiceStatus.unknown
    return ServiceStatus.up


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/summary", response_model=ObservabilitySummary)
async def get_summary() -> dict[str, Any]:
    env = os.getenv("NODE_ENV", "local")

    services, incidents, queues, workers = await asyncio.gather(
        _check_all_services(env),
        get_active_incidents(),
        run_in_threadpool(get_all_queue_health, env),
        run_in_threadpool(get_all_worker_statuses, env),
    )

    config_warnings = validate_observability_env(env)
    missing_count = sum(1 for w in config_warnings if w.status.value in ("missing", "optional_missing"))

    summary = ObservabilitySummary(
        overall_status=_compute_overall_status(services),
        services_up=sum(1 for s in services if s.status == ServiceStatus.up),
        services_degraded=sum(1 for s in services if s.status == ServiceStatus.degraded),
        services_down=sum(1 for s in services if s.status == ServiceStatus.down),
        services_not_configured=sum(1 for s in services if s.status == ServiceStatus.not_configured),
        active_incidents=len(incidents),
        queues_degraded=sum(1 for q in queues if q.status in (ServiceStatus.degraded, ServiceStatus.down)),
        workers_down=sum(1 for w in workers if w.status == ServiceStatus.down),
        config_warnings=missing_count,
        checked_at=datetime.now(UTC),
        dev_mode=_DEV_MODE,
    )
    return {**summary.model_dump(), **_dev_meta()}


@router.get("/services", response_model=list[ServiceCheckResult])
async def get_services(env: str = "local") -> list[ServiceCheckResult]:
    results = await _check_all_services(env)
    return results


@router.get("/workers", response_model=list[WorkerStatus])
async def get_workers(env: str = "local") -> list[WorkerStatus]:
    return await run_in_threadpool(get_all_worker_statuses, env)


@router.get("/queues", response_model=list[QueueHealth])
async def get_queues(env: str = "local") -> list[QueueHealth]:
    return await run_in_threadpool(get_all_queue_health, env)


@router.get("/incidents", response_model=list[IncidentRecord])
async def get_incidents(include_resolved: bool = False) -> list[IncidentRecord]:
    if include_resolved:
        return await get_all_incidents()
    return await get_active_incidents()


@router.post("/incidents/{incident_id}/acknowledge")
async def ack_incident(incident_id: str, req: AcknowledgeRequest) -> dict[str, Any]:
    ok = await acknowledge_incident(incident_id, req)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found or already resolved")
    await audit_incident_acknowledge(incident_id, req.acknowledged_by, req.note)
    return {"ok": True}


@router.post("/incidents/{incident_id}/resolve")
async def resolve_inc(incident_id: str, req: ResolveRequest) -> dict[str, Any]:
    ok = await resolve_incident(incident_id, req)
    if not ok:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Incident not found or already resolved")
    await audit_incident_resolve(incident_id, req.resolved_by, req.notes)
    return {"ok": True}


@router.get("/alerts", response_model=list[AlertEvent])
async def get_alerts(limit: int = 50) -> list[AlertEvent]:
    return await get_alert_events(limit)


@router.get("/audit", response_model=list[AuditEvent])
async def get_audit(limit: int = 100) -> list[AuditEvent]:
    return await get_audit_events(limit)


@router.get("/business-health", response_model=BusinessHealthMetrics)
async def get_business_health() -> BusinessHealthMetrics:
    return await get_business_health_metrics()


@router.get("/config-warnings", response_model=list[ConfigWarning])
async def get_config_warnings(env: str = "local") -> list[ConfigWarning]:
    await record_audit_event(action="config_warning_viewed", environment=env)
    return validate_observability_env(env)


@router.get("/integrations")
async def get_integrations() -> dict[str, Any]:
    return {
        "integrations": detect_integrations(),
        "urls": get_integration_urls(),
        **_dev_meta(),
    }
