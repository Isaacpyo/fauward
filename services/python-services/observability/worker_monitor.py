from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from observability.schemas import ServiceStatus, WorkerStatus

HEARTBEAT_UP_SECONDS = 120
HEARTBEAT_DEGRADED_SECONDS = 300

MONITORED_WORKERS = [
    "pdf_worker",
    "route_worker",
    "ocr_worker",
    "notifications_worker",
    "customs_worker",
    "pricing_worker",
    "ml_worker",
    "analytics_worker",
    "label_worker",
]

WORKER_QUEUE_MAP: dict[str, str] = {
    "pdf_worker": "fauward:pdf:generate",
    "route_worker": "fauward:routes:optimize",
    "ocr_worker": "fauward:ocr:parse",
    "notifications_worker": "fauward:notifications:send",
    "customs_worker": "fauward:customs:generate",
    "pricing_worker": "fauward:pricing:quote",
    "ml_worker": "fauward:ml:score",
    "analytics_worker": "fauward:analytics",
    "label_worker": "fauward:labels",
}


def _heartbeat_key(worker_name: str) -> str:
    return f"fw:worker:{worker_name}:last_heartbeat"


def _jobs_today_key(worker_name: str) -> str:
    return f"fw:worker:{worker_name}:jobs_today"


def _get_redis_client() -> Any:
    from workers import redis_client
    return redis_client()


def _get_prometheus_counter(worker_name: str, status: str) -> float | None:
    """Read fauward_worker_jobs_total{worker, status} from Prometheus registry."""
    try:
        from prometheus_client import REGISTRY
        return REGISTRY.get_sample_value(
            "fauward_worker_jobs_total",
            {"worker": worker_name, "status": status},
        )
    except Exception:
        return None


def record_worker_heartbeat(worker_name: str) -> None:
    """Write a heartbeat timestamp for the given worker to Redis."""
    client = _get_redis_client()
    client.set(_heartbeat_key(worker_name), datetime.now(UTC).isoformat(), ex=86400)


def get_worker_heartbeat(worker_name: str) -> datetime | None:
    try:
        client = _get_redis_client()
        val = client.get(_heartbeat_key(worker_name))
        if not val:
            return None
        return datetime.fromisoformat(val.replace("Z", "+00:00"))
    except Exception:
        return None


def check_worker_status(worker_name: str, env: str = "local") -> WorkerStatus:
    now = datetime.now(UTC)
    heartbeat = get_worker_heartbeat(worker_name)

    age_seconds: int | None = None
    status = ServiceStatus.not_configured

    if heartbeat is not None:
        age_seconds = int((now - heartbeat.replace(tzinfo=UTC)).total_seconds())
        if age_seconds < HEARTBEAT_UP_SECONDS:
            status = ServiceStatus.up
        elif age_seconds < HEARTBEAT_DEGRADED_SECONDS:
            status = ServiceStatus.degraded
        else:
            status = ServiceStatus.down
    else:
        # Fall back to Prometheus counters to infer activity
        success_count = _get_prometheus_counter(worker_name, "success")
        if success_count is not None:
            # Prometheus has seen this worker, but no heartbeat key → unknown
            status = ServiceStatus.unknown
        # else: truly not configured

    jobs_success = _get_prometheus_counter(worker_name, "success") or 0
    jobs_failed = _get_prometheus_counter(worker_name, "failure") or 0

    # Jobs today from Redis incr key (optional, set by workers via record_worker_heartbeat helpers)
    jobs_today = 0
    try:
        client = _get_redis_client()
        raw = client.get(_jobs_today_key(worker_name))
        if raw:
            jobs_today = int(raw)
    except Exception:
        pass

    return WorkerStatus(
        worker_name=worker_name,
        environment=env,
        status=status,
        last_heartbeat=heartbeat,
        heartbeat_age_seconds=age_seconds,
        jobs_processed_today=jobs_today or int(jobs_success),
        failed_jobs=int(jobs_failed),
        current_queue=WORKER_QUEUE_MAP.get(worker_name),
        last_checked_at=now,
    )


def get_all_worker_statuses(env: str = "local") -> list[WorkerStatus]:
    return [check_worker_status(w, env) for w in MONITORED_WORKERS]
