from fastapi import HTTPException, status

from api.auth import AuthContext


def resolve_effective_tenant_id(auth: AuthContext, requested_tenant_id: str | None) -> str:
    if auth.is_super_admin:
        if not requested_tenant_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="tenantId is required")
        return requested_tenant_id
    return auth.tenant_id


def require_tenant_access(auth: AuthContext, tenant_id: str) -> None:
    if tenant_id != auth.tenant_id and not auth.is_super_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def hidden_resource_not_found(detail: str = "Resource not found") -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
