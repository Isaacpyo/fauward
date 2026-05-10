import hashlib

from fastapi import Request


def tenant_rate_limit_key(request: Request) -> str:
    authorization = request.headers.get("authorization", "")
    if authorization.lower().startswith("bearer "):
        digest = hashlib.sha256(authorization.encode("utf-8")).hexdigest()
        return f"api-key:{digest}"
    client = request.client.host if request.client else "unknown"
    return f"ip:{client}"
