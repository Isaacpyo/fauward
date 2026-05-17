import asyncio
import ipaddress
import re
from pathlib import Path
from typing import Iterable
from urllib.parse import urlparse

from fastapi import HTTPException, UploadFile, status

from config import settings
from lib.storage import upload_bytes

MAX_OCR_UPLOAD_BYTES = 10 * 1024 * 1024
ALLOWED_OCR_CONTENT_TYPES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/tiff",
    "image/bmp",
    "image/webp",
    "text/plain",
}
SAFE_FILENAME_PATTERN = re.compile(r"[^A-Za-z0-9_.-]+")


def sanitize_filename(filename: str | None, default: str = "document.bin") -> str:
    name = Path(filename or default).name
    sanitized = SAFE_FILENAME_PATTERN.sub("_", name).strip("._")
    return sanitized[:120] or default


def tenant_object_key(*, tenant_id: str, namespace: str, object_id: str, filename: str) -> str:
    suffix = Path(sanitize_filename(filename)).suffix or ".bin"
    safe_tenant = SAFE_FILENAME_PATTERN.sub("_", tenant_id).strip("._")
    safe_object = SAFE_FILENAME_PATTERN.sub("_", object_id).strip("._")
    return f"{safe_tenant}/{namespace}/{safe_object}{suffix}"


def validate_content_type(content_type: str | None, allowed: Iterable[str] = ALLOWED_OCR_CONTENT_TYPES) -> str:
    normalized = (content_type or "application/octet-stream").split(";", 1)[0].strip().lower()
    if normalized not in set(allowed):
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="Unsupported file type")
    return normalized


async def read_upload_file_limited(file: UploadFile, *, max_bytes: int = MAX_OCR_UPLOAD_BYTES) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            raise HTTPException(status_code=413, detail="File is too large")
        chunks.append(chunk)
    return b"".join(chunks)


async def store_uploaded_file(
    *,
    tenant_id: str,
    namespace: str,
    object_id: str,
    filename: str,
    content: bytes,
    content_type: str,
) -> str:
    key = tenant_object_key(tenant_id=tenant_id, namespace=namespace, object_id=object_id, filename=filename)
    return await asyncio.to_thread(
        upload_bytes,
        bucket="documents",
        path=key,
        content=content,
        content_type=content_type,
    )


def validate_trusted_file_url(url: str) -> str:
    parsed = urlparse(url.strip())
    if parsed.scheme == "file":
        try:
            path = Path(parsed.path).resolve()
            storage_root = settings.local_storage_dir.resolve()
            path.relative_to(storage_root)
        except Exception as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Untrusted fileUrl") from exc
        return url.strip()
    if parsed.scheme not in {"https"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Untrusted fileUrl")
    host = parsed.hostname or ""
    if host.casefold() in {"localhost", "metadata.google.internal"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Untrusted fileUrl")
    try:
        address = ipaddress.ip_address(host)
        if address.is_private or address.is_loopback or address.is_link_local or address.is_reserved:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Untrusted fileUrl")
    except ValueError:
        pass
    if settings.supabase_url and url.startswith(settings.supabase_url.rstrip("/")):
        return url.strip()
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Untrusted fileUrl")
