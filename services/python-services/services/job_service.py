import logging
from typing import Any, Awaitable, Callable

from fastapi import HTTPException, status

logger = logging.getLogger(__name__)

Publisher = Callable[[str, dict[str, Any]], None]
FailureMarker = Callable[[str, str, str], Awaitable[None]]


async def enqueue_job_safely(
    *,
    queue_name: str,
    payload: dict[str, Any],
    publisher: Publisher,
    job_id: str,
    tenant_id: str,
    mark_failed: FailureMarker,
    safe_error: str,
) -> None:
    try:
        publisher(queue_name, payload)
    except Exception as exc:
        logger.exception("queue_publish_failed", extra={"_queue": queue_name, "_job_id": job_id, "_tenant_id": tenant_id})
        await mark_failed(job_id, tenant_id, str(exc))
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=safe_error) from exc
