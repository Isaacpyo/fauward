from dataclasses import dataclass
from collections.abc import Iterable
from typing import Annotated, Any

from fastapi import Depends, Header, HTTPException, status

import db

MAX_BEARER_TOKEN_LENGTH = 4096
SUPER_ADMIN_SCOPES = frozenset({"super_admin", "super-admin", "admin:all", "platform:admin"})
PLATFORM_KEY_TYPES = frozenset({"platform", "platform_admin", "super_admin", "admin"})
LEGACY_PLATFORM_TENANT_IDS = frozenset({"platform", "super_admin", "super-admin", "admin"})


def normalize_scopes(scopes: Any) -> tuple[str, ...]:
    if scopes is None:
        return ()
    if isinstance(scopes, str):
        raw_parts = scopes.replace(",", " ").split()
    elif isinstance(scopes, Iterable):
        raw_parts = []
        for scope in scopes:
            if scope is None:
                continue
            raw_parts.extend(str(scope).replace(",", " ").split())
    else:
        raw_parts = str(scopes).replace(",", " ").split()

    normalized: list[str] = []
    seen: set[str] = set()
    for scope in raw_parts:
        value = scope.strip().casefold()
        if value and value not in seen:
            seen.add(value)
            normalized.append(value)
    return tuple(normalized)


def _auth_error(detail: str = "Unauthorized") -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=detail,
        headers={"WWW-Authenticate": "Bearer"},
    )


@dataclass(frozen=True)
class AuthContext:
    tenant_id: str
    scopes: tuple[str, ...] = ()
    api_key_id: str | None = None
    user_id: str | None = None
    actor_id: str | None = None
    key_type: str | None = None

    def __post_init__(self) -> None:
        object.__setattr__(self, "scopes", normalize_scopes(self.scopes))
        if self.key_type is not None:
            object.__setattr__(self, "key_type", self.key_type.strip().casefold() or None)

    @property
    def is_super_admin(self) -> bool:
        if not (SUPER_ADMIN_SCOPES & set(self.scopes)):
            return False
        if self.key_type is not None:
            return self.key_type in PLATFORM_KEY_TYPES
        return self.tenant_id.casefold() in LEGACY_PLATFORM_TENANT_IDS

    def has_scope(self, scope: str) -> bool:
        normalized = normalize_scopes(scope)
        return normalized[0] in self.scopes if normalized else False

    def has_any_scope(self, scopes: Iterable[str]) -> bool:
        required = set(normalize_scopes(scopes))
        return bool(required & set(self.scopes))


async def require_bearer_token(
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> AuthContext:
    if authorization is None:
        raise _auth_error("Bearer token required")
    parts = authorization.strip().split()
    if len(parts) != 2 or parts[0].casefold() != "bearer":
        raise _auth_error("Bearer token required")
    token = parts[1]
    if not token:
        raise _auth_error("Bearer token required")
    if len(token) > MAX_BEARER_TOKEN_LENGTH:
        raise _auth_error("Invalid API key")
    record = await db.validate_api_key(token)
    if record is None:
        raise _auth_error("Invalid API key")
    return AuthContext(
        tenant_id=str(record["tenant_id"]),
        scopes=normalize_scopes(record.get("scopes")),
        api_key_id=str(record["api_key_id"]) if record.get("api_key_id") is not None else None,
        user_id=str(record["user_id"]) if record.get("user_id") is not None else None,
        actor_id=str(record["actor_id"]) if record.get("actor_id") is not None else None,
        key_type=str(record["key_type"]) if record.get("key_type") is not None else None,
    )


async def require_super_admin(auth: Annotated[AuthContext, Depends(require_bearer_token)]) -> AuthContext:
    if not auth.is_super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SUPER_ADMIN scope required")
    return auth


def require_scope(scope: str):
    normalized = normalize_scopes(scope)
    if len(normalized) != 1:
        raise ValueError("require_scope expects exactly one scope")
    required = normalized[0]

    async def dependency(auth: Annotated[AuthContext, Depends(require_bearer_token)]) -> AuthContext:
        if auth.is_super_admin or required in auth.scopes:
            return auth
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Required scope missing")

    return dependency


def require_any_scope(scopes: Iterable[str]):
    required = set(normalize_scopes(scopes))
    if not required:
        raise ValueError("require_any_scope expects at least one scope")

    async def dependency(auth: Annotated[AuthContext, Depends(require_bearer_token)]) -> AuthContext:
        if auth.is_super_admin or required & set(auth.scopes):
            return auth
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Required scope missing")

    return dependency
