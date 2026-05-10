from datetime import date
from typing import Annotated

from fastapi import Depends, HTTPException, Query, status

from api.auth import AuthContext, require_bearer_token, require_scope, require_super_admin
from services.tenant_access import resolve_effective_tenant_id


def pagination_params(
    limit: Annotated[int, Query(ge=1, le=260)] = 52,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> dict[str, int]:
    return {"limit": limit, "offset": offset}


def validate_date_range(date_from: date, date_to: date, max_days: int = 365) -> tuple[date, date]:
    if date_from > date_to:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="dateFrom must be on or before dateTo")
    if (date_to - date_from).days + 1 > max_days:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Date range cannot exceed {max_days} days")
    return date_from, date_to


CurrentAuth = Annotated[AuthContext, Depends(require_bearer_token)]

__all__ = [
    "AuthContext",
    "CurrentAuth",
    "pagination_params",
    "require_bearer_token",
    "require_scope",
    "require_super_admin",
    "resolve_effective_tenant_id",
    "validate_date_range",
]
