from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status

import db


@dataclass(frozen=True)
class AuthContext:
    tenant_id: str
    scopes: list[str]

    @property
    def is_super_admin(self) -> bool:
        normalized = {scope.lower() for scope in self.scopes}
        return bool({"super_admin", "super-admin", "admin:all", "platform:admin"} & normalized)


async def require_bearer_token(
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> AuthContext:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bearer token required")
    token = authorization.split(" ", 1)[1].strip()
    record = await db.validate_api_key(token)
    if record is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")
    return AuthContext(tenant_id=record["tenant_id"], scopes=list(record.get("scopes") or []))


async def require_super_admin(auth: Annotated[AuthContext, Depends(require_bearer_token)]) -> AuthContext:
    if not auth.is_super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="SUPER_ADMIN scope required")
    return auth
