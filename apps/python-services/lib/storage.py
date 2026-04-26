import logging
from pathlib import Path

from config import settings
from lib.supabase_client import SupabaseStorageError, supabase_storage

logger = logging.getLogger(__name__)


def upload_bytes(
    *,
    bucket: str,
    path: str,
    content: bytes,
    content_type: str = "application/octet-stream",
) -> str:
    try:
        if supabase_storage.configured:
            return supabase_storage.upload_object(
                bucket=bucket,
                path=path,
                content=content,
                content_type=content_type,
            )
    except SupabaseStorageError:
        logger.exception("supabase_upload_failed_using_local_storage", extra={"_bucket": bucket, "_path": path})

    local_path = settings.local_storage_dir / bucket / path.lstrip("/")
    local_path.parent.mkdir(parents=True, exist_ok=True)
    local_path.write_bytes(content)
    return local_path.resolve().as_uri()


def download_bytes(*, bucket: str, path: str) -> bytes | None:
    if supabase_storage.configured:
        content = supabase_storage.download_object(bucket=bucket, path=path)
        if content is not None:
            return content
    local_path = settings.local_storage_dir / bucket / path.lstrip("/")
    if local_path.exists():
        return local_path.read_bytes()
    return None


def list_paths(*, bucket: str, prefix: str) -> list[str]:
    paths: list[str] = []
    if supabase_storage.configured:
        for item in supabase_storage.list_objects(bucket=bucket, prefix=prefix):
            name = item.get("name")
            if isinstance(name, str):
                paths.append(f"{prefix.rstrip('/')}/{name}".lstrip("/"))
    local_root = settings.local_storage_dir / bucket / prefix.strip("/")
    if local_root.exists():
        paths.extend(str(path.relative_to(settings.local_storage_dir / bucket)).replace("\\", "/") for path in local_root.rglob("*") if path.is_file())
    return sorted(set(paths), reverse=True)


def local_temp_path(name: str) -> Path:
    temp_dir = settings.local_storage_dir / "tmp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    return temp_dir / name
