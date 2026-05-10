import asyncio
import json
import logging
import threading
import time
import traceback
from collections.abc import Awaitable, Callable
from typing import Any

from celery import Celery
from prometheus_client import Counter, Histogram

import db
from config import settings

logger = logging.getLogger(__name__)

WorkerHandler = Callable[[dict[str, Any]], Awaitable[dict[str, Any] | None]]

_JOBS_TOTAL = Counter(
    "fauward_worker_jobs_total",
    "Total jobs processed",
    ["worker", "status"],
)
_JOB_DURATION = Histogram(
    "fauward_worker_job_duration_seconds",
    "Job processing duration",
    ["worker"],
)

QUEUE_TO_DONE_QUEUE: dict[str, str] = {
    "fauward:pdf:generate": "fauward:pdf:done",
    "fauward:routes:optimize": "fauward:routes:done",
    "fauward:ocr:parse": "fauward:ocr:done",
    "fauward:notifications:send": "fauward:notifications:done",
    "fauward:customs:generate": "fauward:customs:done",
    "fauward:pricing:quote": "fauward:pricing:done",
    "fauward:ml:score": "fauward:ml:done",
}

_bridge_started = False
_bridge_lock = threading.Lock()


def redis_client(decode_responses: bool = True) -> Any:
    import redis

    return redis.Redis.from_url(settings.redis_url, decode_responses=decode_responses)


def publish_event(queue_name: str, payload: dict[str, Any]) -> None:
    redis_client().lpush(queue_name, json.dumps(payload, default=str, separators=(",", ":")))


def publish_job(queue_name: str, payload: dict[str, Any]) -> None:
    publish_event(queue_name, payload)


async def run_async_worker(
    *,
    worker_name: str,
    done_queue: str,
    payload: dict[str, Any],
    handler: WorkerHandler,
) -> dict[str, Any]:
    job_id = str(payload.get("jobId") or payload.get("job_id") or "")
    start = time.monotonic()
    try:
        result = await handler(payload)
        event = {"jobId": job_id, "status": "READY", "worker": worker_name, **(result or {})}
        publish_event(done_queue, event)
        await _dispatch_webhook(str(payload.get("tenantId")) if payload.get("tenantId") else None, event)
        _JOBS_TOTAL.labels(worker=worker_name, status="success").inc()
        return event
    except Exception as exc:
        _JOBS_TOTAL.labels(worker=worker_name, status="failure").inc()
        trace = traceback.format_exc()
        await _mark_job_failed(
            worker_name=worker_name,
            job_id=job_id or None,
            tenant_id=str(payload.get("tenantId")) if payload.get("tenantId") else None,
            error_message=str(exc),
        )
        await db.log_worker_error(
            job_id=job_id or None,
            worker=worker_name,
            error_message=str(exc),
            traceback_text=trace,
            payload=payload,
        )
        failure = {
            "jobId": job_id,
            "status": "FAILED",
            "worker": worker_name,
            "error": str(exc),
        }
        publish_event(done_queue, failure)
        await _dispatch_webhook(str(payload.get("tenantId")) if payload.get("tenantId") else None, failure)
        logger.exception("worker_job_failed", extra={"_worker": worker_name, "_job_id": job_id})
        raise
    finally:
        _JOB_DURATION.labels(worker=worker_name).observe(time.monotonic() - start)


async def _dispatch_webhook(tenant_id: str | None, event: dict[str, Any]) -> None:
    if not tenant_id:
        return
    try:
        row = await db.fetchrow(
            'select "webhookUrl", "webhookSecret" from tenant_settings where "tenantId" = $1',
            tenant_id,
        )
        if not row or not row["webhookUrl"]:
            return
        import hashlib
        import hmac
        import httpx

        body = json.dumps(event, default=str, separators=(",", ":"))
        sig = ""
        if row["webhookSecret"]:
            sig = hmac.new(
                row["webhookSecret"].encode(),
                body.encode(),
                hashlib.sha256,
            ).hexdigest()
        async with httpx.AsyncClient(timeout=10) as client:
            await client.post(
                row["webhookUrl"],
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "X-Fauward-Signature": sig,
                    "X-Fauward-Worker": event.get("worker", ""),
                },
            )
    except Exception:
        logger.warning("webhook_dispatch_failed", extra={"_tenant_id": tenant_id})


async def _mark_job_failed(worker_name: str, job_id: str | None, tenant_id: str | None, error_message: str) -> None:
    if not job_id:
        return
    table_by_worker = {
        "pdf_worker": "documents",
        "route_worker": "route_jobs",
        "ocr_worker": "parsed_documents",
        "customs_worker": "customs_declarations",
    }
    table = table_by_worker.get(worker_name)
    if table is None:
        return
    id_column = "job_id" if table == "parsed_documents" else "id"
    try:
        if tenant_id:
            await db.execute(
                f"""
                update {table}
                set status = 'FAILED', error_message = $1, updated_at = now()
                where {id_column} = $2 and tenant_id = $3
                """,
                error_message[:4000],
                job_id,
                tenant_id,
            )
        else:
            await db.execute(
                f"update {table} set status = 'FAILED', error_message = $1, updated_at = now() where {id_column} = $2",
                error_message[:4000],
                job_id,
            )
    except Exception:
        logger.exception("failed_to_mark_job_failed", extra={"_worker": worker_name, "_job_id": job_id})


def run_worker(
    *,
    worker_name: str,
    done_queue: str,
    payload: dict[str, Any],
    handler: WorkerHandler,
) -> dict[str, Any]:
    async def _runner() -> dict[str, Any]:
        await db.connect_db()
        return await run_async_worker(worker_name=worker_name, done_queue=done_queue, payload=payload, handler=handler)

    return asyncio.run(_runner())


def start_queue_bridge(celery_app: Celery, queue_task_map: dict[str, tuple[str, str]]) -> None:
    global _bridge_started
    if not settings.queue_listeners_enabled:
        logger.info("redis_queue_bridge_disabled")
        return
    with _bridge_lock:
        if _bridge_started:
            return
        _bridge_started = True
    for source_queue, (task_name, celery_queue) in queue_task_map.items():
        thread = threading.Thread(
            target=_queue_bridge_loop,
            args=(celery_app, source_queue, task_name, celery_queue),
            name=f"queue-bridge-{source_queue}",
            daemon=True,
        )
        thread.start()
        logger.info("redis_queue_bridge_started", extra={"_queue": source_queue, "_task": task_name})


def _queue_bridge_loop(celery_app: Celery, source_queue: str, task_name: str, celery_queue: str) -> None:
    client = redis_client(decode_responses=True)
    while True:
        try:
            result = client.brpop(source_queue, timeout=0)
            if result is None:
                continue
            _, raw_payload = result
            try:
                payload = json.loads(raw_payload)
                if not isinstance(payload, dict):
                    raise ValueError("Redis queue payload must be a JSON object")
                celery_app.send_task(task_name, args=[payload], queue=celery_queue)
            except Exception:
                dead_key = source_queue + ":dead"
                try:
                    client.lpush(dead_key, raw_payload)
                except Exception:
                    pass
                logger.exception(
                    "redis_queue_bridge_dead_lettered",
                    extra={"_queue": source_queue, "_dead_key": dead_key},
                )
        except Exception:
            logger.exception("redis_queue_bridge_error", extra={"_queue": source_queue, "_task": task_name})
            time.sleep(2)
