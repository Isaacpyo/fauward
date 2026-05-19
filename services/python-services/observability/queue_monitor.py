from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from observability.schemas import QueueHealth, ServiceStatus

THRESHOLDS = {
    "queue_depth_warning": 50,
    "queue_depth_critical": 500,
    "oldest_job_warning_seconds": 900,
    "oldest_job_critical_seconds": 1800,
    "failed_jobs_warning": 5,
    "failed_jobs_critical": 50,
}

# Python/Celery queues (from workers/__init__.py QUEUE_TO_DONE_QUEUE)
CELERY_QUEUES: dict[str, str] = {
    "fauward:pdf:generate": "pdf",
    "fauward:routes:optimize": "routes",
    "fauward:ocr:parse": "ocr",
    "fauward:notifications:send": "notifications",
    "fauward:customs:generate": "customs",
    "fauward:pricing:quote": "pricing",
    "fauward:ml:score": "ml",
}

# BullMQ queues used by Node.js backend
BULLMQ_QUEUES: list[str] = [
    "notification",
    "webhook",
    "outbox",
    "pdf",
    "analytics",
    "scheduled-jobs",
    "route-optimization",
]

WORKER_FOR_QUEUE: dict[str, str] = {
    "fauward:pdf:generate": "pdf_worker",
    "fauward:routes:optimize": "route_worker",
    "fauward:ocr:parse": "ocr_worker",
    "fauward:notifications:send": "notifications_worker",
    "fauward:customs:generate": "customs_worker",
    "fauward:pricing:quote": "pricing_worker",
    "fauward:ml:score": "ml_worker",
}


def _get_redis_client() -> Any:
    from workers import redis_client
    return redis_client()


def _parse_oldest_job_age(client: Any, queue_key: str) -> int | None:
    """Read the oldest (rightmost) job from the list and parse its timestamp."""
    try:
        raw = client.lrange(queue_key, -1, -1)
        if not raw:
            return None
        item = raw[0] if isinstance(raw[0], str) else raw[0].decode()
        payload = json.loads(item)
        ts_str = payload.get("timestamp") or payload.get("ts") or payload.get("createdAt")
        if not ts_str:
            return None
        ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
        age = (datetime.now(UTC) - ts).total_seconds()
        return int(age)
    except Exception:
        return None


def _classify_queue(depth: int, oldest_age: int | None, failed: int, dead: int) -> ServiceStatus:
    if depth >= THRESHOLDS["queue_depth_critical"]:
        return ServiceStatus.down
    if failed >= THRESHOLDS["failed_jobs_critical"]:
        return ServiceStatus.down
    if (
        depth >= THRESHOLDS["queue_depth_warning"]
        or (oldest_age is not None and oldest_age >= THRESHOLDS["oldest_job_warning_seconds"])
        or failed >= THRESHOLDS["failed_jobs_warning"]
    ):
        return ServiceStatus.degraded
    return ServiceStatus.up


def _check_celery_queue(client: Any, queue_key: str, friendly_name: str, env: str) -> QueueHealth:
    dead_key = f"{queue_key}:dead"
    done_key = f"{queue_key.rsplit(':', 1)[0]}:done"

    try:
        depth = int(client.llen(queue_key))
        dead = int(client.llen(dead_key))
        oldest_age = _parse_oldest_job_age(client, queue_key)
        status = _classify_queue(depth, oldest_age, 0, dead)

        # If key never existed, treat as not_configured
        key_type = client.type(queue_key)
        if key_type == "none" and depth == 0 and dead == 0:
            status = ServiceStatus.not_configured

        return QueueHealth(
            queue_name=friendly_name,
            environment=env,
            status=status,
            depth=depth,
            oldest_job_age_seconds=oldest_age,
            dead_letter_count=dead,
            worker_assigned=WORKER_FOR_QUEUE.get(queue_key),
            last_checked_at=datetime.now(UTC),
        )
    except Exception as exc:
        return QueueHealth(
            queue_name=friendly_name,
            environment=env,
            status=ServiceStatus.down,
            last_checked_at=datetime.now(UTC),
        )


def _check_bullmq_queue(client: Any, queue_name: str, env: str) -> QueueHealth:
    """BullMQ stores jobs in bull:{name}:wait, bull:{name}:active, bull:{name}:failed."""
    wait_key = f"bull:{queue_name}:wait"
    active_key = f"bull:{queue_name}:active"
    failed_key = f"bull:{queue_name}:failed"
    delayed_key = f"bull:{queue_name}:delayed"

    try:
        wait_depth = int(client.llen(wait_key))
        active_depth = int(client.llen(active_key))
        failed_count = int(client.zcard(failed_key)) if client.type(failed_key) == "zset" else int(client.llen(failed_key))
        delayed_count = int(client.zcard(delayed_key))
        depth = wait_depth + active_depth

        oldest_age = _parse_oldest_job_age(client, wait_key)

        # All keys missing → not configured
        if all(
            client.type(k) == "none"
            for k in [wait_key, active_key, failed_key]
        ):
            return QueueHealth(
                queue_name=f"bullmq:{queue_name}",
                environment=env,
                status=ServiceStatus.not_configured,
                last_checked_at=datetime.now(UTC),
            )

        status = _classify_queue(depth, oldest_age, failed_count, 0)
        return QueueHealth(
            queue_name=f"bullmq:{queue_name}",
            environment=env,
            status=status,
            depth=depth,
            oldest_job_age_seconds=oldest_age,
            failed_jobs=failed_count,
            retry_jobs=delayed_count,
            last_checked_at=datetime.now(UTC),
        )
    except Exception:
        return QueueHealth(
            queue_name=f"bullmq:{queue_name}",
            environment=env,
            status=ServiceStatus.down,
            last_checked_at=datetime.now(UTC),
        )


def get_all_queue_health(env: str = "local") -> list[QueueHealth]:
    try:
        client = _get_redis_client()
    except Exception:
        return [
            QueueHealth(
                queue_name=name,
                environment=env,
                status=ServiceStatus.unknown,
                last_checked_at=datetime.now(UTC),
            )
            for name in list(CELERY_QUEUES.values()) + [f"bullmq:{q}" for q in BULLMQ_QUEUES]
        ]

    results: list[QueueHealth] = []

    for queue_key, friendly_name in CELERY_QUEUES.items():
        results.append(_check_celery_queue(client, queue_key, friendly_name, env))

    for queue_name in BULLMQ_QUEUES:
        results.append(_check_bullmq_queue(client, queue_name, env))

    return results
