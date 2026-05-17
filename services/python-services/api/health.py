import asyncio
from typing import Any

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

import db
from config import settings

router = APIRouter(prefix="/health", tags=["health"])


@router.get("/live")
async def live() -> dict[str, str]:
    return {"status": "alive"}


def _redis_ping() -> bool:
    try:
        import redis

        client = redis.Redis.from_url(settings.redis_url, decode_responses=True)
        return bool(client.ping())
    except Exception:
        return False


@router.get("/ready")
async def ready() -> JSONResponse:
    checks: dict[str, Any] = {"database": False, "redis": False}
    try:
        checks["database"] = bool(await db.fetchval("select 1"))
    except Exception:
        checks["database"] = False
    checks["redis"] = await asyncio.to_thread(_redis_ping)
    ready_status = bool(checks["database"] and checks["redis"])
    return JSONResponse(
        status_code=status.HTTP_200_OK if ready_status else status.HTTP_503_SERVICE_UNAVAILABLE,
        content={"status": "ready" if ready_status else "not_ready", "checks": checks},
    )
