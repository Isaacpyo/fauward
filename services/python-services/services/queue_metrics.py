from datetime import UTC, datetime
from typing import Any, Callable

from fastapi import HTTPException, status
from starlette.concurrency import run_in_threadpool

QueueClientFactory = Callable[[], Any]

DEFAULT_QUEUE_TO_DONE_QUEUE: dict[str, str] = {
    "fauward:pdf:generate": "fauward:pdf:done",
    "fauward:routes:optimize": "fauward:routes:done",
    "fauward:ocr:parse": "fauward:ocr:done",
    "fauward:notifications:send": "fauward:notifications:done",
    "fauward:customs:generate": "fauward:customs:done",
    "fauward:pricing:quote": "fauward:pricing:done",
    "fauward:ml:score": "fauward:ml:done",
}

try:
    from prometheus_client import Gauge
except ModuleNotFoundError:
    Gauge = None  # type: ignore[assignment]


class _FallbackGauge:
    def __init__(self) -> None:
        self.values: dict[str, float] = {}
        self._queue = ""

    def labels(self, *, queue: str) -> "_FallbackGauge":
        child = _FallbackGauge()
        child.values = self.values
        child._queue = queue
        return child

    def set(self, value: float) -> None:
        self.values[self._queue] = value


QUEUE_DEPTH_GAUGE = (
    Gauge(
        "fauward_redis_queue_depth",
        "Redis queue depth",
        ["queue"],
    )
    if Gauge is not None
    else _FallbackGauge()
)


def queue_to_done_queue() -> dict[str, str]:
    try:
        from workers import QUEUE_TO_DONE_QUEUE

        return dict(QUEUE_TO_DONE_QUEUE)
    except ModuleNotFoundError:
        return dict(DEFAULT_QUEUE_TO_DONE_QUEUE)


def default_redis_client() -> Any:
    from workers import redis_client

    return redis_client()


def monitored_queues() -> list[str]:
    mapping = queue_to_done_queue()
    source_queues = list(mapping.keys())
    done_queues = list(mapping.values())
    dead_queues = [f"{queue}:dead" for queue in source_queues]
    return [*source_queues, *done_queues, *dead_queues]


def _read_queue_depths_sync(client_factory: QueueClientFactory | None = None) -> dict[str, int]:
    client = (client_factory or default_redis_client)()
    depths: dict[str, int] = {}
    for queue in monitored_queues():
        depth = int(client.llen(queue))
        depths[queue] = depth
        QUEUE_DEPTH_GAUGE.labels(queue=queue).set(depth)
    return depths


def queue_depth_gauge_value(queue: str) -> float | None:
    values = getattr(QUEUE_DEPTH_GAUGE, "values", None)
    if isinstance(values, dict):
        return values.get(queue)
    try:
        from prometheus_client import REGISTRY

        return REGISTRY.get_sample_value("fauward_redis_queue_depth", {"queue": queue})
    except Exception:
        return None


async def queue_depths_response(client_factory: QueueClientFactory | None = None) -> dict[str, Any]:
    try:
        depths = await run_in_threadpool(_read_queue_depths_sync, client_factory)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Queue metrics are unavailable",
        ) from exc
    return {
        "queues": depths,
        "updatedAt": datetime.now(UTC).isoformat(),
    }
