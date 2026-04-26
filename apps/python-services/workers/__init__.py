import asyncio
import json
import logging
import threading
import time
import traceback
from collections.abc import Awaitable, Callable
from typing import Any

import redis
from celery import Celery

import db
from config import settings

logger = logging.getLogger(__name__)

WorkerHandler = Callable[[dict[str, Any]], Awaitable[dict[str, Any] | None]]

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


def redis_client(decode_responses: bool = True) -> redis.Redis:
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
    try:
        result = await handler(payload)
        event = {"jobId": job_id, "status": "READY", "worker": worker_name, **(result or {})}
        publish_event(done_queue, event)
        return event
    except Exception as exc:
        trace = traceback.format_exc()
        await _mark_job_failed(worker_name=worker_name, job_id=job_id or None, error_message=str(exc))
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
        logger.exception("worker_job_failed", extra={"_worker": worker_name, "_job_id": job_id})
        raise


async def _mark_job_failed(worker_name: str, job_id: str | None, error_message: str) -> None:
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
            _, raw_payload = client.brpop(source_queue, timeout=0)
            payload = json.loads(raw_payload)
            if not isinstance(payload, dict):
                raise ValueError("Redis queue payload must be a JSON object")
            celery_app.send_task(task_name, args=[payload], queue=celery_queue)
        except Exception:
            logger.exception("redis_queue_bridge_error", extra={"_queue": source_queue, "_task": task_name})
            time.sleep(2)
