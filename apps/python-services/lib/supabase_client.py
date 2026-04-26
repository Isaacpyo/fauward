import logging
from collections.abc import Mapping
from typing import Any

import requests

from config import settings

logger = logging.getLogger(__name__)


class SupabaseStorageError(RuntimeError):
    pass


class SupabaseStorageClient:
    def __init__(self) -> None:
        self.base_url = settings.supabase_url.rstrip("/")
        self.service_role_key = settings.supabase_service_role_key

    @property
    def configured(self) -> bool:
        return bool(self.base_url and self.service_role_key)

    def _headers(self, content_type: str | None = None) -> dict[str, str]:
        headers = {
            "Authorization": f"Bearer {self.service_role_key}",
            "apikey": self.service_role_key,
        }
        if content_type:
            headers["Content-Type"] = content_type
        return headers

    def upload_object(
        self,
        *,
        bucket: str,
        path: str,
        content: bytes,
        content_type: str,
        upsert: bool = True,
    ) -> str:
        if not self.configured:
            raise SupabaseStorageError("Supabase storage is not configured")
        normalized_path = path.lstrip("/")
        url = f"{self.base_url}/storage/v1/object/{bucket}/{normalized_path}"
        headers = self._headers(content_type)
        if upsert:
            headers["x-upsert"] = "true"
        response = requests.post(url, headers=headers, data=content, timeout=60)
        if response.status_code not in {200, 201}:
            raise SupabaseStorageError(f"Supabase upload failed: {response.status_code} {response.text[:500]}")
        return self.public_url(bucket=bucket, path=normalized_path)

    def list_objects(self, *, bucket: str, prefix: str) -> list[dict[str, Any]]:
        if not self.configured:
            return []
        url = f"{self.base_url}/storage/v1/object/list/{bucket}"
        payload: Mapping[str, Any] = {
            "prefix": prefix.rstrip("/"),
            "limit": 100,
            "offset": 0,
            "sortBy": {"column": "name", "order": "desc"},
        }
        response = requests.post(url, headers=self._headers("application/json"), json=payload, timeout=30)
        if response.status_code >= 400:
            logger.warning("supabase_storage_list_failed", extra={"_status_code": response.status_code})
            return []
        data = response.json()
        return data if isinstance(data, list) else []

    def download_object(self, *, bucket: str, path: str) -> bytes | None:
        if not self.configured:
            return None
        normalized_path = path.lstrip("/")
        url = f"{self.base_url}/storage/v1/object/{bucket}/{normalized_path}"
        response = requests.get(url, headers=self._headers(), timeout=60)
        if response.status_code == 404:
            return None
        if response.status_code >= 400:
            raise SupabaseStorageError(f"Supabase download failed: {response.status_code} {response.text[:500]}")
        return response.content

    def public_url(self, *, bucket: str, path: str) -> str:
        normalized_path = path.lstrip("/")
        return f"{self.base_url}/storage/v1/object/public/{bucket}/{normalized_path}"


supabase_storage = SupabaseStorageClient()
