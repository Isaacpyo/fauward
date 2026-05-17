from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status

from api.auth import AuthContext, require_bearer_token
from services.analytics_service import tenant_rate_limit_key
from services.queue_metrics import queue_depths_response

try:
    from main import limiter
except ModuleNotFoundError:
    class _NoopLimiter:
        def limit(self, *_args, **_kwargs):
            def decorator(func):
                return func

            return decorator

    limiter = _NoopLimiter()

router = APIRouter(prefix="/metrics", tags=["metrics"])

OPS_METRICS_SCOPES = {"ops:metrics", "metrics:read", "metrics:queues"}
PLATFORM_KEY_TYPES = {"platform", "platform_admin", "super_admin", "admin", "ops"}


async def require_queue_metrics_access(
    auth: Annotated[AuthContext, Depends(require_bearer_token)],
) -> AuthContext:
    if auth.is_super_admin:
        return auth
    if auth.key_type in PLATFORM_KEY_TYPES and OPS_METRICS_SCOPES & set(auth.scopes):
        return auth
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Metrics access required")


@router.get("/queues")
@limiter.limit("30/minute")
@limiter.limit("120/hour", key_func=tenant_rate_limit_key)
async def queues(
    request: Request,
    _: Annotated[AuthContext, Depends(require_queue_metrics_access)],
) -> dict[str, Any]:
    return await queue_depths_response()
